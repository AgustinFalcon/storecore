package com.storecore.blackstore

import com.storecore.blackstore.application.CompanionTokenGenerator
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

object CompanionAuthTestSupport {
    fun seedReadyCompanion(
        jdbc: JdbcTemplate,
        secrets: InMemoryCompanionSecretProvider,
        client: UUID,
        scopes: Array<String> = arrayOf("catalog:read", "stock:read", "stock:reserve", "stock:commit", "stock:release"),
        companionStatus: String = "ACTIVE",
        authReady: Boolean = true,
    ): String {
        val token = CompanionTokenGenerator.next256Bits()
        val fingerprint = CompanionTokenGenerator.fingerprint(token)
        val ref = "test-only:${client}"
        secrets.put(ref, token)
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, ?) ON CONFLICT (client_instance_id) DO UPDATE SET status=EXCLUDED.status", client, companionStatus)
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        jdbc.update("UPDATE blackstore_companion_credentials SET status='REVOKED', revoked_at=clock_timestamp() WHERE companion_id=? AND status='ACTIVE'", companionId)
        val version = (jdbc.queryForObject("SELECT COALESCE(MAX(credential_version),0) FROM blackstore_companion_credentials WHERE companion_id=?", Int::class.java, companionId) ?: 0) + 1
        if (authReady) {
            jdbc.update(
                """
                INSERT INTO blackstore_companion_credentials(
                  companion_id, credential_secret_ref, credential_version, status,
                  token_fingerprint, scopes, service_role, auth_ready
                ) VALUES (?, ?, ?, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
                """.trimIndent(),
                companionId,
                ref,
                version,
                fingerprint,
                "{" + scopes.joinToString(",") + "}",
            )
        } else {
            jdbc.update(
                "INSERT INTO blackstore_companion_credentials(companion_id, credential_secret_ref, credential_version, status) VALUES (?, ?, ?, 'ACTIVE')",
                companionId,
                ref,
                version,
            )
        }
        return CompanionTokenGenerator.toHex(token)
    }
}
