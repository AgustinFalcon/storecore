package com.storecore.platform.infrastructure.installation

import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.installation-guard.enabled"], havingValue = "true", matchIfMissing = true)
class InstallationPresenceGuard(
    private val jdbcTemplate: JdbcTemplate,
) : ApplicationRunner {
    override fun run(args: ApplicationArguments) = verifyInstallationIsProvisioned()

    fun verifyInstallationIsProvisioned() {
        val rowCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM installation_settings WHERE installation_id = 1",
            Int::class.java,
        ) ?: 0
        check(rowCount == 1) { "INSTALLATION_NOT_PROVISIONED" }
    }
}