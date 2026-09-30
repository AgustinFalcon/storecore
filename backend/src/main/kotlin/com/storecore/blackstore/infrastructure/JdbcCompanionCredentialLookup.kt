package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.application.port.CompanionCredentialLookup
import com.storecore.blackstore.application.port.CompanionCredentialRecord
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class JdbcCompanionCredentialLookup(
    private val jdbc: JdbcTemplate,
) : CompanionCredentialLookup {
    override fun findByFingerprint(fingerprint: String): CompanionCredentialRecord? {
        val rows = jdbc.query(
            """
            SELECT c.id AS companion_id, c.client_instance_id, c.status AS companion_status,
                   cred.id AS credential_id, cred.credential_version, cred.status AS credential_status,
                   cred.auth_ready, cred.credential_secret_ref, cred.scopes, cred.service_role
              FROM public.blackstore_companion_credentials cred
              JOIN public.blackstore_companions c ON c.id = cred.companion_id
             WHERE pg_catalog.btrim(cred.token_fingerprint::text) = ?
            """.trimIndent(),
            { rs, _ ->
                val scopes = (rs.getArray("scopes")?.array as? Array<*>)
                    ?.map { CompanionScope.fromWire(it?.toString()) }
                    ?.filter { it != CompanionScope.Unknown }
                    ?.toSet()
                    .orEmpty()
                CompanionCredentialRecord(
                    companionId = rs.getLong("companion_id"),
                    clientInstanceId = rs.getObject("client_instance_id", UUID::class.java),
                    companionStatus = CompanionLifecycleStatus.fromWire(rs.getString("companion_status")),
                    credentialId = rs.getLong("credential_id"),
                    credentialVersion = rs.getInt("credential_version"),
                    credentialStatus = rs.getString("credential_status"),
                    authReady = rs.getBoolean("auth_ready"),
                    secretRef = rs.getString("credential_secret_ref"),
                    scopes = scopes,
                    serviceRole = CompanionServiceRole.fromWire(rs.getString("service_role")),
                )
            },
            fingerprint,
        )
        return rows.singleOrNull()
    }
}
