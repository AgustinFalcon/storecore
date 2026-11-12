package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID

/** Transaction-scoped exclusive roots; every caller takes all roots before rows. */
@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class IdentityMutationLocks(private val jdbc: JdbcTemplate) {
    fun own(principal: AuthenticatedPrincipal) = IdentityMutationScope.Own(IdentitySubject.of(principal))

    fun sessionTarget(actor: AuthenticatedPrincipal, sessionId: UUID): IdentityMutationScope =
        IdentityMutationScope.SessionTarget(IdentitySubject.of(actor), sessionSubject(sessionId), sessionId)

    fun sessionOwner(sessionId: UUID): IdentityMutationScope = IdentityMutationScope.Own(sessionSubject(sessionId))

    fun customerTarget(actor: AuthenticatedPrincipal, id: Long): IdentityMutationScope {
        if (id <= 0) throw ResourceNotFound()
        return IdentityMutationScope.CustomerTarget(IdentitySubject.of(actor), IdentitySubject(IdentityRealm.CUSTOMER, id))
    }

    fun acquire(scope: IdentityMutationScope) {
        check(TransactionSynchronizationManager.isActualTransactionActive()) { "Identity scope requires a transaction" }
        if (scope == IdentityMutationScope.Unknown) throw AuthorizationDenied()
        val ordered = scope.subjects.sortedWith(compareBy({ it.realm.name }, { it.id }))
        ordered.forEach { subject ->
            val encoded = key(subject)
            // The two-int advisory namespace is disjoint from domain bigint locks
            // (including caller-supplied stock adjustment command UUIDs).
            jdbc.query("SELECT pg_advisory_xact_lock(?,?)", { _, _ -> true }, (encoded shr 32).toInt(), encoded.toInt())
        }
        ordered.forEach { subject ->
            val table = when (subject.realm) { IdentityRealm.USER -> "users"; IdentityRealm.CUSTOMER -> "customers" }
            if (jdbc.queryForList("SELECT id FROM $table WHERE id=? FOR UPDATE", subject.id).isEmpty()) throw ResourceNotFound()
        }
        if (scope is IdentityMutationScope.SessionTarget && sessionSubject(scope.sessionId) != scope.target) throw AuthorizationDenied()
    }

    fun lockSessions(scope: IdentityMutationScope) {
        val ordered = scope.subjects.sortedWith(compareBy({ it.realm.name }, { it.id }))
        val clauses = ordered.map { subject ->
            when (subject.realm) { IdentityRealm.USER -> "(subject_kind='USER' AND user_id=?)"; IdentityRealm.CUSTOMER -> "(subject_kind='CUSTOMER' AND customer_id=?)" }
        }
        jdbc.queryForList(
            "SELECT id FROM identity_sessions WHERE (" + clauses.joinToString(" OR ") +
                ") AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp() ORDER BY id FOR UPDATE",
            *ordered.map { it.id }.toTypedArray(),
        )
    }

    fun revalidateActor(principal: AuthenticatedPrincipal) {
        val subject = IdentitySubject.of(principal)
        val table = when (subject.realm) { IdentityRealm.USER -> "users"; IdentityRealm.CUSTOMER -> "customers" }
        if (jdbc.queryForObject("SELECT active FROM $table WHERE id=?", Boolean::class.java, subject.id) != true) throw AuthenticationFailed()
        if (principal is InternalUserPrincipal) {
            val roles = jdbc.queryForList(
                "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? FOR SHARE OF ur,r",
                principal.userId,
            ).mapTo(linkedSetOf()) { InternalRole.fromWire(it["code"] as? String) }
            if (!InternalRole.hasKnownRole(roles) || roles != principal.roles) throw AuthenticationFailed()
        }
    }

    private fun sessionSubject(id: UUID): IdentitySubject {
        val row = jdbc.queryForList("SELECT subject_kind,user_id,customer_id FROM identity_sessions WHERE id=?", id).singleOrNull() ?: throw ResourceNotFound()
        return when (AccessContext.fromWire(row["subject_kind"] as? String)) {
            AccessContext.USER -> IdentitySubject(IdentityRealm.USER, (row["user_id"] as Number).toLong())
            AccessContext.CUSTOMER -> IdentitySubject(IdentityRealm.CUSTOMER, (row["customer_id"] as Number).toLong())
            AccessContext.Unknown -> throw AuthorizationDenied()
        }
    }

    // Positive CUSTOMER ids / negative USER ids form an injective 64-bit namespace.
    private fun key(subject: IdentitySubject): Long = when (subject.realm) {
        IdentityRealm.CUSTOMER -> subject.id
        IdentityRealm.USER -> -subject.id
    }
}
