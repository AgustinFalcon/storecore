package com.storecore.configuration

import com.storecore.configuration.infrastructure.CapabilityAdminJdbc
import org.flywaydb.core.Flyway
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

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
}
