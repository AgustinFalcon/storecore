package com.storecore.blackstore

import com.storecore.blackstore.infrastructure.CompanionAdminJdbc
import com.storecore.configuration.CapabilityAdminTestSupport
import org.flywaydb.core.Flyway
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

object CompanionAdminTestSupport {
    const val LOGIN = "storecore_comp_admin_login"
    const val PASSWORD = "comp-admin-test"

    fun migrateAndProvision(postgres: PostgreSQLContainer<*>): Triple<JdbcTemplate, CompanionAdminJdbc, com.storecore.configuration.infrastructure.CapabilityAdminJdbc> {
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        CapabilityAdminTestSupport.provisionLogin(postgres)
        provisionLogin(postgres)
        val runtime = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        val companion = CompanionAdminJdbc(JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, LOGIN, PASSWORD)))
        val capability = com.storecore.configuration.infrastructure.CapabilityAdminJdbc(
            JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, CapabilityAdminTestSupport.LOGIN, CapabilityAdminTestSupport.PASSWORD)),
        )
        return Triple(runtime, companion, capability)
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
        runtime.execute("GRANT storecore_companion_admin TO $LOGIN")
        runtime.execute("GRANT CONNECT ON DATABASE ${postgres.databaseName} TO $LOGIN")
        runtime.execute("GRANT USAGE ON SCHEMA public TO $LOGIN")
    }

    fun liveAdminSession(jdbc: JdbcTemplate, userId: Long): UUID = CapabilityAdminTestSupport.liveAdminSession(jdbc, userId)
}
