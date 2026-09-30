package com.storecore.configuration

import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.CapabilityAdminJdbc
import org.flywaydb.core.Flyway
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

/**
 * Test-only capability helpers.
 *
 * Production ML administration uses Tx-S/Tx-C with a live `identity_sessions` row
 * (`Dsp000bMlCapabilityGuardTest`). HTTP suites that disable `installation-guard`
 * have no capability-admin pool, so they must not call V3
 * `capability_admin_change_configuration` for `MARKETPLACE_ML` (DSP-000B raises
 * `CAPABILITY_ML_GENERIC_DENIED`) and must not call Tx-C for
 * `BLACKSTORE_INTEGRATION` (Tx-C aborts that module).
 */
object CapabilityAdminTestSupport {
    const val LOGIN = "storecore_cap_admin_login"
    const val PASSWORD = "cap-admin-test"

    fun migrateAndProvision(postgres: PostgreSQLContainer<*>): Pair<JdbcTemplate, CapabilityAdminJdbc> {
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        provisionLogin(postgres)
        val runtime = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        val admin = CapabilityAdminJdbc(JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, LOGIN, PASSWORD)))
        return runtime to admin
    }

    fun provisionLogin(postgres: PostgreSQLContainer<*>) {
        val runtime = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        runtime.execute(
            """
            DO ${'$'}${'$'}
            BEGIN
              CREATE ROLE $LOGIN LOGIN PASSWORD '$PASSWORD';
            EXCEPTION WHEN duplicate_object THEN
              NULL;
            END
            ${'$'}${'$'};
            """.trimIndent(),
        )
        runtime.execute("GRANT storecore_capability_admin TO $LOGIN")
        runtime.execute("GRANT CONNECT ON DATABASE ${postgres.databaseName} TO $LOGIN")
        runtime.execute("GRANT USAGE ON SCHEMA public TO $LOGIN")
    }

    /**
     * Inserts a live USER session so Tx-C admission can satisfy
     * `capability_admin_intents.session_id` → `identity_sessions(id)`.
     */
    fun liveAdminSession(jdbc: JdbcTemplate, userId: Long): UUID {
        val sessionId = UUID.randomUUID()
        val tokenHash = sessionId.toString().replace("-", "") + sessionId.toString().replace("-", "").take(32)
        jdbc.update(
            """INSERT INTO identity_sessions(id, subject_kind, user_id, token_hash, idle_expires_at, absolute_expires_at)
               VALUES (?, 'USER', ?, ?, clock_timestamp() + interval '30 minutes', clock_timestamp() + interval '8 hours')""",
            sessionId, userId, tokenHash.take(64),
        )
        return sessionId
    }

    /**
     * Temporary test fixture: marks `MARKETPLACE_ML` ACTIVE without V3 generic admin.
     * Does not grant EXECUTE, open a dispatcher, or claim remote delivery.
     */
    fun activateMarketplaceMl(jdbc: JdbcTemplate, userId: Long) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MARKETPLACE_ML'", String::class.java)
        if (state == "ACTIVE") return
        jdbc.update(
            """UPDATE module_configurations
               SET state='ACTIVE', config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
             WHERE module_code='MARKETPLACE_ML' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            userId,
        )
    }

    /**
     * Temporary test fixture for `BLACKSTORE_INTEGRATION`. Same UPDATE path as
     * [com.storecore.blackstore.BlackStoreHttpContractTest]; restores DISABLED in callers.
     */
    fun setBlackStoreStateForTest(jdbc: JdbcTemplate, state: CapabilityState, actorUserId: Long? = null) {
        jdbc.update(
            """UPDATE module_configurations
               SET state=?, config_version=config_version+1, updated_by=COALESCE(?, updated_by), updated_at=clock_timestamp()
             WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            state.name,
            actorUserId,
        )
    }
}
