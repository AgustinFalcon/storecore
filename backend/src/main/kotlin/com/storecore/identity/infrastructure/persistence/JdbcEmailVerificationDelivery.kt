package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.EmailVerificationDeliveryPort
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.IdentityDeliveryReadiness
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.sql.Timestamp
import java.util.UUID

/**
 * Persists verification authorization and its encrypted message in the caller's
 * transaction. It never performs network I/O and never stores the recipient or
 * raw token outside the crypto-shreddable secret row.
 */
class JdbcEmailVerificationDelivery(
    private val jdbc: JdbcTemplate,
    private val deliveryReadiness: IdentityDeliveryReadiness,
    private val installationId: String,
    private val encryption: IdentityMessageEncryption,
    private val codec: IdentityMessagePayloadCodec,
) : EmailVerificationDeliveryPort {
    override val readiness: EmailDeliveryReadiness
        get() = deliveryReadiness.state(EmailDeliveryCapability.EMAIL_VERIFICATION)

    override fun enqueue(dispatch: EmailVerificationDispatch): EmailDeliveryReadiness {
        if (!readiness.permitsEnqueue) return EmailDeliveryReadiness.UNAVAILABLE
        check(TransactionSynchronizationManager.isActualTransactionActive()) {
            "Verification enqueue requires a transaction"
        }
        val token = jdbc.queryForList(
            """SELECT realm,user_id,customer_id,correlation_id
               FROM identity_email_verification_tokens
               WHERE id=? AND realm=? AND state=? AND expires_at=?
                 AND expires_at>clock_timestamp() FOR UPDATE""",
            dispatch.id,
            dispatch.subject.realm.name,
            EmailVerificationTokenState.PENDING.name,
            Timestamp.from(dispatch.expiresAt),
        ).singleOrNull() ?: return EmailDeliveryReadiness.UNAVAILABLE

        val eventId = UUID.randomUUID()
        val kind = IdentityMessageKind.EMAIL_VERIFICATION
        val recipient = dispatch.email.value.toCharArray()
        val secret = dispatch.secret.value.toCharArray()
        val envelope = try {
            IdentityMessagePayload(recipient, dispatch.subject.realm.toRecoveryRealm(), kind, secret, dispatch.expiresAt).use { payload ->
                codec.encode(payload).use { encoded ->
                    encryption.encrypt(IdentityMessageEncryptionContext(installationId, eventId, kind), encoded)
                }
            }
        } finally {
            recipient.fill('\u0000')
            secret.fill('\u0000')
        }

        jdbc.update(
            """INSERT INTO identity_message_outbox
               (id,kind,realm,user_id,customer_id,verification_token_id,expires_at,correlation_id)
               VALUES(?,?,?,?,?,?,?,?)""",
            eventId,
            kind.name,
            dispatch.subject.realm.name,
            token["user_id"],
            token["customer_id"],
            dispatch.id,
            Timestamp.from(dispatch.expiresAt),
            token["correlation_id"],
        )
        jdbc.update(
            "INSERT INTO identity_message_delivery(event_id,state) VALUES(?,?)",
            eventId,
            IdentityOutboxState.PENDING.name,
        )
        jdbc.update(
            """INSERT INTO identity_message_secret
               (event_id,key_id,ciphertext,nonce,wrapped_dek,wrap_nonce)
               VALUES(?,?,?,?,?,?)""",
            eventId,
            envelope.keyId,
            envelope.payloadCiphertext(),
            envelope.payloadNonce(),
            envelope.wrappedDek(),
            envelope.wrappingNonce(),
        )
        return EmailDeliveryReadiness.READY
    }
}

private fun IdentityRealm.toRecoveryRealm() = when (this) {
    IdentityRealm.USER -> RecoveryRealm.USER
    IdentityRealm.CUSTOMER -> RecoveryRealm.CUSTOMER
}
