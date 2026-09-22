package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.CsrfInvalid
import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import com.storecore.identity.application.RegistrationRejected
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.AuthenticatedPrincipal
import com.storecore.identity.domain.CustomerAddress
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.CustomerProfile
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.domain.IssuedCredentials
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import com.storecore.identity.infrastructure.security.OpaqueTokenFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.text.Normalizer
import java.util.Locale
import javax.sql.DataSource
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcIdentityService(
    private val jdbc: JdbcTemplate,
    private val passwords: Argon2PasswordHasher,
    private val tokens: OpaqueTokenFactory,
    private val loginRateLimiter: LoginRateLimiter,
) : IdentityUseCases {
    @Transactional
    override fun registerCustomer(email: String, password: String, firstName: String, lastName: String): IssuedCredentials {
        val canonical = canonicalEmail(email)
        validatePassword(password)
        val customerId = try {
            jdbc.queryForObject(
                """INSERT INTO customers(email, password_hash, first_name, last_name)
                   VALUES (?, ?, ?, ?) RETURNING id""",
                Long::class.java,
                canonical,
                passwords.hash(password.toCharArray()),
                firstName.trim(),
                lastName.trim(),
            ) ?: throw RegistrationRejected()
        } catch (exception: DataIntegrityViolationException) {
            throw RegistrationRejected()
        }
        return issueSession(IdentityRealm.CUSTOMER, customerId)
    }

    @Transactional
    override fun login(realm: IdentityRealm, email: String, password: String, sourceIp: String): IssuedCredentials {
        val canonical = canonicalEmail(email)
        loginRateLimiter.checkAllowed(realm, sourceIp, canonical)
        try {
            val row = when (realm) {
                IdentityRealm.CUSTOMER -> jdbc.queryForList("SELECT id, password_hash, active FROM customers WHERE email=?", canonical).singleOrNull()
                IdentityRealm.USER -> jdbc.queryForList("SELECT id, password_hash, active FROM users WHERE email=?", canonical).singleOrNull()
            }
            // Invalid length follows the same dummy Argon2 path and public 401 as any other bad credential.
            if (!isPasswordLengthValid(password)) {
                passwords.dummyVerify(password.toCharArray())
                throw AuthenticationFailed()
            }
            if (row == null) {
                passwords.dummyVerify(password.toCharArray())
                throw AuthenticationFailed()
            }
            val verified = passwords.verify(row.requiredString("password_hash"), password.toCharArray())
            if (!verified || !row.isActive()) throw AuthenticationFailed()
            loginRateLimiter.clear(realm, sourceIp, canonical)
            return issueSession(realm, row.requiredLong("id"))
        } catch (failure: AuthenticationFailed) {
            loginRateLimiter.recordFailure(realm, sourceIp, canonical)
            throw failure
        }
    }
    @Transactional
    override fun authenticate(realm: IdentityRealm, rawToken: String): AuthenticatedPrincipal {
        val hash = tokens.sha256(rawToken)
        val row = jdbc.queryForList(
            """SELECT s.id, s.subject_kind, s.user_id, s.customer_id
               FROM identity_sessions s
               LEFT JOIN users u ON u.id=s.user_id
               LEFT JOIN customers c ON c.id=s.customer_id
               WHERE s.token_hash=? AND s.subject_kind=? AND s.revoked_at IS NULL
                 AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
                 AND ((s.subject_kind='USER' AND u.active) OR (s.subject_kind='CUSTOMER' AND c.active))""",
            hash,
            realm.name,
        ).singleOrNull() ?: throw AuthenticationFailed()
        val sessionId = UUID.fromString(row.requiredString("id"))
        touchSession(sessionId, hash, realm)
        return when (realm) {
            IdentityRealm.CUSTOMER -> CustomerPrincipal(sessionId, row.requiredLong("customer_id"))
            IdentityRealm.USER -> {
                val roles = loadRoles(row.requiredLong("user_id"))
                if (roles.isEmpty()) throw AuthenticationFailed()
                InternalUserPrincipal(sessionId, row.requiredLong("user_id"), roles)
            }
        }
    }

    @Transactional
    override fun rotateCsrf(principal: AuthenticatedPrincipal): String {
        val active = jdbc.queryForList(
            """SELECT t.id, t.generation FROM identity_session_csrf_tokens t
               JOIN identity_sessions s ON s.id=t.session_id
               WHERE t.session_id=? AND t.retired_at IS NULL AND t.expires_at>clock_timestamp()
                 AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
               FOR UPDATE""",
            principal.sessionId,
        ).singleOrNull() ?: throw AuthenticationFailed()
        jdbc.update("UPDATE identity_session_csrf_tokens SET retired_at=clock_timestamp() WHERE id=?", active.requiredLong("id"))
        return insertCsrf(principal.sessionId, active.requiredLong("generation").toInt() + 1)
    }

    @Transactional
    override fun verifyCsrf(principal: AuthenticatedPrincipal, rawCsrf: String) {
        val row = jdbc.queryForList(
            """SELECT t.token_hash FROM identity_session_csrf_tokens t
               JOIN identity_sessions s ON s.id=t.session_id
               WHERE t.session_id=? AND t.retired_at IS NULL AND t.expires_at>clock_timestamp()
                 AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
               FOR UPDATE""",
            principal.sessionId,
        ).singleOrNull() ?: throw CsrfInvalid()
        if (!tokens.hashesEqual(rawCsrf, row.requiredString("token_hash"))) throw CsrfInvalid()
    }

    @Transactional
    override fun logout(principal: AuthenticatedPrincipal) {
        val correlation = UUID.randomUUID()
        val updated = when (principal) {
            is CustomerPrincipal -> jdbc.queryForList(
                """UPDATE identity_sessions SET revoked_at=clock_timestamp(), revocation_kind='SELF',
                   revoked_by_customer_id=?, revocation_correlation_id=?, revoked_reason='SELF_LOGOUT'
                   WHERE id=? AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()
                   RETURNING id, subject_kind, customer_id""",
                principal.customerId, correlation, principal.sessionId,
            )
            is InternalUserPrincipal -> jdbc.queryForList(
                """UPDATE identity_sessions SET revoked_at=clock_timestamp(), revocation_kind='SELF',
                   revoked_by_user_id=?, revocation_correlation_id=?, revoked_reason='SELF_LOGOUT'
                   WHERE id=? AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()
                   RETURNING id, subject_kind, user_id""",
                principal.userId, correlation, principal.sessionId,
            )
        }
        if (updated.isNotEmpty()) appendRevocationAudit(updated.single(), principal, correlation, "SELF_LOGOUT", "SELF")
    }

    @Transactional
    override fun revokeAsAdmin(actor: InternalUserPrincipal, targetSession: UUID, reason: String, correlation: UUID) {
        if (InternalRole.ADMIN !in actor.roles || reason.isBlank()) throw AuthorizationDenied()
        val target = jdbc.queryForList(
            """UPDATE identity_sessions SET revoked_at=clock_timestamp(), revocation_kind='ADMIN',
               revoked_by_user_id=?, revocation_correlation_id=?, revoked_reason=?
               WHERE id=? AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()
               RETURNING id, subject_kind, user_id, customer_id""",
            actor.userId, correlation, reason.trim(), targetSession,
        ).singleOrNull() ?: throw ResourceNotFound()
        appendRevocationAudit(target, actor, correlation, "ADMIN_REQUESTED", "ADMIN")
    }

    @Transactional
    override fun revokeAsSystem(targetSession: UUID, reason: String, correlation: UUID) {
        if (reason.isBlank()) throw AuthorizationDenied()
        val target = jdbc.queryForList(
            """UPDATE identity_sessions SET revoked_at=clock_timestamp(), revocation_kind='SYSTEM',
               revocation_correlation_id=?, revoked_reason=?
               WHERE id=? AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()
               RETURNING id, subject_kind, user_id, customer_id""",
            correlation, reason.trim(), targetSession,
        ).singleOrNull() ?: throw ResourceNotFound()
        val subjectId = if (target["subject_kind"] == "USER") target.requiredLong("user_id") else target.requiredLong("customer_id")
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_reference,subject_kind,subject_reference,correlation_id,reason_code,payload_redacted)
               VALUES('SYSTEM',NULL,'IDENTITY_SESSION_REVOKED','IDENTITY_SESSION',?,?,?,?,?,?::jsonb)""",
            UUID.fromString(target.requiredString("id")), target.requiredString("subject_kind"), subjectId, correlation, "SYSTEM_REVOKED",
            "{\"correlationId\":\"$correlation\",\"revocationKind\":\"SYSTEM\",\"subjectKind\":\"${target.requiredString("subject_kind")}\",\"result\":\"REVOKED\"}",
        )
    }

    override fun customerProfile(principal: CustomerPrincipal): CustomerProfile {
        val row = jdbc.queryForList("SELECT id,email,first_name,last_name,phone FROM customers WHERE id=? AND active=TRUE", principal.customerId).singleOrNull() ?: throw AuthenticationFailed()
        return CustomerProfile(row.requiredLong("id"), row.requiredString("email"), row.requiredString("first_name"), row.requiredString("last_name"), row["phone"]?.toString())
    }

    @Transactional
    override fun updateCustomerProfile(principal: CustomerPrincipal, email: String, firstName: String, lastName: String, phone: String?): CustomerProfile {
        val row = try {
            jdbc.queryForList("UPDATE customers SET email=?,first_name=?,last_name=?,phone=?,updated_at=clock_timestamp() WHERE id=? AND active=TRUE RETURNING id,email,first_name,last_name,phone", canonicalEmail(email), firstName.trim(), lastName.trim(), phone?.trim(), principal.customerId).singleOrNull()
        } catch (exception: DataIntegrityViolationException) { throw RegistrationRejected() } ?: throw AuthenticationFailed()
        return CustomerProfile(row.requiredLong("id"), row.requiredString("email"), row.requiredString("first_name"), row.requiredString("last_name"), row["phone"]?.toString())
    }
    override fun customerAddresses(principal: CustomerPrincipal): List<CustomerAddress> = jdbc.queryForList(
        "SELECT id, street, number, city, province, postal_code, is_default FROM customer_addresses WHERE customer_id=? ORDER BY id",
        principal.customerId,
    ).map { it.toAddress() }

    @Transactional
    override fun updateCustomerAddress(principal: CustomerPrincipal, addressId: Long, street: String, number: String, city: String, province: String, postalCode: String, isDefault: Boolean): CustomerAddress {
        lockCustomerAddresses(principal.customerId)
        if (isDefault) jdbc.update("UPDATE customer_addresses SET is_default=FALSE,updated_at=clock_timestamp() WHERE customer_id=? AND id<>? AND is_default=TRUE", principal.customerId, addressId)
        val row = jdbc.queryForList("UPDATE customer_addresses SET street=?,number=?,city=?,province=?,postal_code=?,is_default=?,updated_at=clock_timestamp() WHERE id=? AND customer_id=? RETURNING id,street,number,city,province,postal_code,is_default", street.trim(),number.trim(),city.trim(),province.trim(),postalCode.trim(),isDefault,addressId,principal.customerId).singleOrNull() ?: throw ResourceNotFound()
        return row.toAddress()
    }

    @Transactional
    override fun deleteCustomerAddress(principal: CustomerPrincipal, addressId: Long) {
        lockCustomerAddresses(principal.customerId)
        if (jdbc.update("DELETE FROM customer_addresses WHERE id=? AND customer_id=?", addressId, principal.customerId) != 1) throw ResourceNotFound()
    }
    @Transactional
    override fun addCustomerAddress(principal: CustomerPrincipal, street: String, number: String, city: String, province: String, postalCode: String, isDefault: Boolean): CustomerAddress {
        lockCustomerAddresses(principal.customerId)
        if (isDefault) jdbc.update("UPDATE customer_addresses SET is_default=FALSE, updated_at=clock_timestamp() WHERE customer_id=? AND is_default=TRUE", principal.customerId)
        val row = jdbc.queryForList(
            """INSERT INTO customer_addresses(customer_id,street,number,city,province,postal_code,is_default)
               VALUES(?,?,?,?,?,?,?) RETURNING id,street,number,city,province,postal_code,is_default""",
            principal.customerId, street.trim(), number.trim(), city.trim(), province.trim(), postalCode.trim(), isDefault,
        ).single()
        return row.toAddress()
    }

    private fun lockCustomerAddresses(customerId: Long) {
        // One transaction-scoped advisory lock serializes every address mutation for this customer.
        jdbc.query(
            "SELECT pg_advisory_xact_lock(hashtextextended('storecore:customer-address:' || ?::text, 0))",
            { _, _ -> true },
            customerId,
        )
    }
    private fun issueSession(realm: IdentityRealm, subjectId: Long): IssuedCredentials {
        val sessionId = UUID.randomUUID()
        val rawSession = tokens.nextRawToken()
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,customer_id,token_hash,idle_expires_at,absolute_expires_at)
               VALUES(?,?,?,?,?,clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
            sessionId, realm.name, if (realm == IdentityRealm.USER) subjectId else null, if (realm == IdentityRealm.CUSTOMER) subjectId else null, tokens.sha256(rawSession),
        )
        val csrf = insertCsrf(sessionId, 1)
        val principal: AuthenticatedPrincipal = when (realm) {
            IdentityRealm.CUSTOMER -> CustomerPrincipal(sessionId, subjectId)
            IdentityRealm.USER -> InternalUserPrincipal(sessionId, subjectId, loadRoles(subjectId))
        }
        return IssuedCredentials(principal, rawSession, csrf)
    }

    private fun insertCsrf(sessionId: UUID, generation: Int): String {
        val raw = tokens.nextRawToken()
        jdbc.update(
            """INSERT INTO identity_session_csrf_tokens(session_id,token_hash,generation,expires_at)
               SELECT ?, ?, ?, LEAST(s.idle_expires_at,s.absolute_expires_at) FROM identity_sessions s WHERE s.id=?""",
            sessionId, tokens.sha256(raw), generation, sessionId,
        )
        return raw
    }

    private fun touchSession(sessionId: UUID, tokenHash: String, realm: IdentityRealm) {
        jdbc.update(
            """WITH now_value AS (SELECT clock_timestamp() AS value)
               UPDATE identity_sessions s SET last_seen_at=n.value,
                 idle_expires_at=LEAST(s.absolute_expires_at,n.value+interval '30 minutes')
               FROM now_value n
               WHERE s.id=? AND s.token_hash=? AND s.subject_kind=? AND s.revoked_at IS NULL
                 AND s.idle_expires_at>n.value AND s.absolute_expires_at>n.value
                 AND s.last_seen_at<=n.value-interval '60 seconds'""",
            sessionId, tokenHash, realm.name,
        )
    }

    private fun loadRoles(userId: Long): Set<InternalRole> = jdbc.queryForList(
        "SELECT r.code FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", userId,
    ).mapTo(linkedSetOf()) { InternalRole.valueOf(it.requiredString("code")) }

    private fun appendRevocationAudit(target: Map<String, Any?>, actor: AuthenticatedPrincipal, correlation: UUID, reasonCode: String, kind: String) {
        val subjectId = if (target["subject_kind"] == "USER") target.requiredLong("user_id") else target.requiredLong("customer_id")
        val actorId = when (actor) { is CustomerPrincipal -> actor.customerId.toString(); is InternalUserPrincipal -> actor.userId.toString() }
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_reference,subject_kind,subject_reference,correlation_id,reason_code,payload_redacted)
               VALUES(?,?,'IDENTITY_SESSION_REVOKED','IDENTITY_SESSION',?,?,?,?,?,?::jsonb)""",
            actor.realm.name, actorId, UUID.fromString(target.requiredString("id")), target.requiredString("subject_kind"), subjectId, correlation, reasonCode,
            "{\"correlationId\":\"$correlation\",\"revocationKind\":\"$kind\",\"subjectKind\":\"${target.requiredString("subject_kind")}\",\"result\":\"REVOKED\"}",
        )
    }

    private fun canonicalEmail(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKC).trim().lowercase(Locale.ROOT).also {
        if (it.isBlank() || it.length > 320 || !it.contains('@')) throw AuthenticationFailed()
    }

    private fun validatePassword(password: String) {
        if (!isPasswordLengthValid(password)) throw RegistrationRejected()
    }

    private fun isPasswordLengthValid(password: String): Boolean =
        password.codePointCount(0, password.length) in 12..128
    private fun Map<String, Any?>.requiredString(key: String): String = this[key]?.toString() ?: error("missing database column $key")
    private fun Map<String, Any?>.requiredLong(key: String): Long = (this[key] as? Number)?.toLong() ?: requiredString(key).toLong()
    private fun Map<String, Any?>.isActive(): Boolean = when (val value = this["active"]) {
        is Boolean -> value
        is Number -> value.toInt() != 0
        else -> value?.toString().equals("t", true) || value?.toString().equals("true", true)
    }
    private fun Map<String, Any?>.toAddress() = CustomerAddress(requiredLong("id"), requiredString("street"), requiredString("number"), requiredString("city"), requiredString("province"), requiredString("postal_code"), this["is_default"] as Boolean)
}
