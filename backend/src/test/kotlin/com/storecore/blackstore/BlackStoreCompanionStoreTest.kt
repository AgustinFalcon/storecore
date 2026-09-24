package com.storecore.blackstore

import com.storecore.blackstore.infrastructure.JdbcBlackStoreCompanionStore
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

class BlackStoreCompanionStoreTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var store: JdbcBlackStoreCompanionStore

        @JvmStatic
        @BeforeAll
        fun start() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            jdbc = JdbcTemplate(dataSource)
            store = JdbcBlackStoreCompanionStore(jdbc)
        }

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    @Test
    fun `bound client matches the single live companion and credentials stay untouched while disabled`() {
        val client = UUID.fromString("cccccccc-cccc-cccc-cccc-cccccccccccc")
        jdbc.update("DELETE FROM blackstore_companion_credentials")
        jdbc.update("DELETE FROM blackstore_companions")
        val companionId = jdbc.queryForObject(
            "INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'DISABLED') RETURNING id",
            Long::class.java,
            client,
        )!!
        jdbc.update(
            "INSERT INTO blackstore_companion_credentials(companion_id, credential_secret_ref, credential_version, status) VALUES (?, 'ref-v1', 1, 'ACTIVE')",
            companionId,
        )
        store.assertBound(client)
        assertEquals("FORBIDDEN", assertThrows(BlackStoreSagaException::class.java) {
            store.assertBound(UUID.randomUUID())
        }.message)
        assertEquals(0, store.javaClass.methods.count { it.name == "rotateSecret" })
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_companion_credentials WHERE status='ACTIVE' AND credential_secret_ref='ref-v1'", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_companion_credentials WHERE status='REVOKED'", Int::class.java))
        store.assertNoLiveTraffic()
    }
}
