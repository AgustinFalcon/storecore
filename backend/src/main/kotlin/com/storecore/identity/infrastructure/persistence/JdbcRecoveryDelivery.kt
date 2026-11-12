package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.RecoveryDeliveryPort
import com.storecore.identity.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID

/** Enqueues only. The caller owns the transaction containing recovery authorization. */
class JdbcRecoveryDelivery(
    private val jdbc: JdbcTemplate,
    private val mode: EmailDeliveryMode,
    private val installationId: String,
    private val encryption: IdentityMessageEncryption,
    private val codec: IdentityMessagePayloadCodec,
) : RecoveryDeliveryPort {
    override val state: RecoveryDeliveryState
        get() = if (mode.readiness(EmailDeliveryCapability.PASSWORD_RECOVERY).permitsEnqueue)
            RecoveryDeliveryState.READY else RecoveryDeliveryState.UNCONFIGURED

    override fun deliver(dispatch: RecoveryDispatch): RecoveryDeliveryState {
        if (state != RecoveryDeliveryState.READY) return RecoveryDeliveryState.UNCONFIGURED
        check(TransactionSynchronizationManager.isActualTransactionActive()) { "Recovery enqueue requires a transaction" }
        val token = jdbc.queryForList(
            """SELECT realm,user_id,customer_id,correlation_id FROM identity_recovery_tokens
               WHERE id=? AND realm=? AND state=? AND expires_at=? AND expires_at>clock_timestamp() FOR UPDATE""",
            dispatch.id, dispatch.realm.name, RecoveryTokenState.PENDING.name, java.sql.Timestamp.from(dispatch.expiresAt),
        ).singleOrNull() ?: return RecoveryDeliveryState.FAILED
        val event = UUID.randomUUID()
        val kind = IdentityMessageKind.PASSWORD_RECOVERY
        val recipient = dispatch.email.value.toCharArray()
        val secret = dispatch.secret.value.toCharArray()
        val envelope = try {
            IdentityMessagePayload(recipient, dispatch.realm, kind, secret, dispatch.expiresAt).use { payload ->
                codec.encode(payload).use { encryption.encrypt(IdentityMessageEncryptionContext(installationId, event, kind), it) }
            }
        } finally { recipient.fill('\u0000'); secret.fill('\u0000') }
        jdbc.update(
            """INSERT INTO identity_message_outbox(id,kind,realm,user_id,customer_id,recovery_token_id,expires_at,correlation_id)
               VALUES(?,?,?,?,?,?,?,?)""",
            event, kind.name, dispatch.realm.name, token["user_id"], token["customer_id"], dispatch.id,
            java.sql.Timestamp.from(dispatch.expiresAt), token["correlation_id"],
        )
        jdbc.update("INSERT INTO identity_message_delivery(event_id,state) VALUES(?,?)", event, IdentityOutboxState.PENDING.name)
        jdbc.update(
            """INSERT INTO identity_message_secret(event_id,key_id,ciphertext,nonce,wrapped_dek,wrap_nonce)
               VALUES(?,?,?,?,?,?)""",
            event, envelope.keyId, envelope.payloadCiphertext(), envelope.payloadNonce(), envelope.wrappedDek(), envelope.wrappingNonce(),
        )
        return RecoveryDeliveryState.ACCEPTED
    }
}
