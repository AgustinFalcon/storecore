package com.storecore.configuration

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer

class CapabilityDefinerMigrationTest {
    @Test
    fun `upgrade from published V8 hardens every capability admin overload`() {
        val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        try {
            postgres.start()
            val flyway = Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration")
            flyway.target("8").load().migrate()
            val jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
            assertEquals(4, jdbc.queryForObject(publicExecutionCount, Int::class.java))
            flyway.target("9").load().migrate()
            assertEquals(0, jdbc.queryForObject(publicExecutionCount, Int::class.java))
            assertEquals(6, jdbc.queryForObject("""
                SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname LIKE 'capability_admin_%'
                  AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
                  AND has_function_privilege('storecore_runtime', p.oid, 'EXECUTE')
                  AND pg_get_userbyid(p.proowner)='storecore_migrator'
            """.trimIndent(), Int::class.java))
        } finally {
            postgres.stop()
        }
    }

    private val publicExecutionCount = """
        SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'capability_admin_%'
          AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
    """.trimIndent()
}
