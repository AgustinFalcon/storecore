package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.AccessChallengePort
import com.storecore.identity.application.AccessChallengeRejected
import com.storecore.identity.application.PendingAccessChallenge
import com.storecore.identity.application.ConsumedAccessChallenge
import com.storecore.identity.domain.AccessContext
import com.storecore.identity.domain.ReturnDestination
import com.storecore.identity.domain.VerifiedAccessCandidate
import com.storecore.identity.infrastructure.security.OpaqueTokenFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.SQLException
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcAccessChallengeStore(
    private val jdbc: JdbcTemplate,
    private val tokens: OpaqueTokenFactory,
) : AccessChallengePort {
    override fun create(
        customer: VerifiedAccessCandidate.Customer,
        user: VerifiedAccessCandidate.User,
        destination: ReturnDestination,
        acceptedOrigin: String,
    ): PendingAccessChallenge {
        val rawChallenge = tokens.nextRawToken()
        val rawNonce = tokens.nextRawToken()
        val row = jdbc.queryForMap(
            """WITH issued AS (SELECT clock_timestamp() AS value)
               INSERT INTO unified_access_challenges(
                   id,challenge_hash,binding_nonce_hash,accepted_origin,customer_id,user_id,
                   return_destination,issued_at,expires_at,audit_metadata
               ) SELECT ?,?,?,?,?,?,?,issued.value,issued.value+interval '120 seconds',?::jsonb FROM issued
               RETURNING expires_at""",
            UUID.randomUUID(), tokens.sha256(rawChallenge), tokens.sha256(rawNonce), acceptedOrigin,
            customer.subjectId, user.subjectId, destination.name, "{\"candidateCount\":2}",
        )
        return PendingAccessChallenge(
            rawChallenge,
            rawNonce,
            (row["expires_at"] as Timestamp).toInstant(),
            destination,
        )
    }

    override fun consume(
        challenge: String,
        bindingNonce: String,
        acceptedOrigin: String,
        context: AccessContext,
    ): ConsumedAccessChallenge {
        if (context == AccessContext.Unknown) throw AccessChallengeRejected()
        val row = jdbc.queryForList(
            """SELECT id,binding_nonce_hash,accepted_origin,customer_id,user_id,return_destination,
                      expires_at,consumed_at,clock_timestamp() AS checked_at
                 FROM unified_access_challenges
                WHERE challenge_hash=?
                FOR UPDATE""",
            tokens.sha256(challenge),
        ).singleOrNull() ?: throw AccessChallengeRejected()
        val checkedAt = row.instant("checked_at")
        if (row["consumed_at"] != null || checkedAt >= row.instant("expires_at") ||
            row["accepted_origin"]?.toString() != acceptedOrigin ||
            !tokens.hashesEqual(bindingNonce, row.requiredString("binding_nonce_hash"))) {
            throw AccessChallengeRejected()
        }
        val destination = ReturnDestination.fromWire(row.requiredString("return_destination"))
        if (destination == ReturnDestination.Unknown) throw AccessChallengeRejected()
        val candidate = when (context) {
            AccessContext.CUSTOMER -> VerifiedAccessCandidate.Customer(row.requiredLong("customer_id"))
            AccessContext.USER -> VerifiedAccessCandidate.User(row.requiredLong("user_id"), emptySet())
            AccessContext.Unknown -> throw AccessChallengeRejected()
        }
        val consumed = try {
            jdbc.update(
                """WITH checked AS (SELECT clock_timestamp() AS value)
                   UPDATE unified_access_challenges SET consumed_at=checked.value
                   FROM checked
                   WHERE id=? AND consumed_at IS NULL AND expires_at>checked.value""",
                UUID.fromString(row.requiredString("id")),
            )
        } catch (failure: DataIntegrityViolationException) {
            if (failure.causedBySqlState("23514")) throw AccessChallengeRejected()
            throw failure
        }
        if (consumed != 1) throw AccessChallengeRejected()
        return ConsumedAccessChallenge(candidate, destination)
    }

    private fun Map<String, Any?>.requiredString(key: String): String = this[key]?.toString() ?: throw AccessChallengeRejected()
    private fun Map<String, Any?>.requiredLong(key: String): Long = (this[key] as? Number)?.toLong() ?: requiredString(key).toLongOrNull() ?: throw AccessChallengeRejected()
    private fun Map<String, Any?>.instant(key: String): Instant = (this[key] as? Timestamp)?.toInstant() ?: throw AccessChallengeRejected()

    private fun Throwable.causedBySqlState(sqlState: String): Boolean =
        generateSequence(this as Throwable?) { it.cause }.filterIsInstance<SQLException>().any { it.sqlState == sqlState }
}
