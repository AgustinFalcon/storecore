package com.storecore.schema

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager

class CfeBaselineUpgradeMigrationTest {
    @Test
    fun `published V13 baseline upgrades forward and preserves historical rows`() {
        val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        try {
            postgres.start()
            val flyway = Flyway.configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration")
                .load()

            val baseline = Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration").target("13").load()
            val initial = baseline.migrate()
            assertEquals("13", initial.targetSchemaVersion.toString())

            DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
                connection.createStatement().use { statement ->
                    statement.executeUpdate(
                        """INSERT INTO users(email,password_hash,first_name,last_name)
                           VALUES ('cfe-upgrade-history@example.test','${'$'}argon2id${'$'}fixture','CFE','History')""",
                    )
                }
            }

            val historyBefore = history(postgres)
            val upgrade = flyway.migrate()
            assertEquals("19", upgrade.targetSchemaVersion.toString())
            assertEquals(historyBefore, history(postgres).take(historyBefore.size))
            flyway.validate()
            val noOp = flyway.migrate()
            assertEquals(0, noOp.migrationsExecuted)
            assertEquals(historyBefore, history(postgres).take(historyBefore.size))

            DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
                connection.createStatement().use { statement ->
                    statement.executeQuery(
                        "SELECT count(*) FROM users WHERE email='cfe-upgrade-history@example.test'",
                    ).use { result ->
                        assertTrue(result.next())
                        assertEquals(1, result.getInt(1))
                    }
                }
            }
        } finally {
            postgres.stop()
        }
    }

    private fun history(postgres: PostgreSQLContainer<Nothing>): List<String> =
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.executeQuery(
                    """SELECT installed_rank || ':' || version || ':' || script || ':' || checksum
                       FROM flyway_schema_history WHERE success ORDER BY installed_rank""",
                ).use { result ->
                    buildList {
                        while (result.next()) add(result.getString(1))
                    }
                }
            }
        }
}
