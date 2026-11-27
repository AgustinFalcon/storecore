package com.storecore.schema

import com.storecore.loyalty.domain.LoyaltyReservationState
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.SQLException
import java.util.UUID

class LoyaltyReservationMigrationTest {
    @Test fun `clean and V41 upgrade preserve evidence and enforce reservation closure`() {
        listOf(false, true).forEach { upgrade ->
            PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
                pg.start()
                fun flyway(target: String? = null) = Flyway.configure().dataSource(pg.jdbcUrl, pg.username, pg.password)
                    .locations("classpath:db/migration").apply { if (target != null) target(target) }.load()
                val jdbc = JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password))
                var history = emptyList<Map<String, Any>>()
                var prior: Pair<Long, Long>? = null
                if (upgrade) {
                    flyway("41").migrate()
                    prior = transaction(jdbc) { issue(it) }
                    history = jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
                }
                assertEquals("42", flyway().migrate().targetSchemaVersion.toString())
                assertEquals(history, jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank").take(history.size))
                prior?.let { assertEquals(1000L, jdbc.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, it.second)) }
                assertTrue(jdbc.queryForObject("SELECT future_optional FROM capability_modules WHERE module_code='LOYALTY'", Boolean::class.java)!!)
                assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='LOYALTY'", String::class.java))
                exercise(jdbc)
                flyway().validate()
                assertEquals(0, flyway().migrate().migrationsExecuted)
            }
        }
    }

    private fun exercise(jdbc: JdbcTemplate) {
        val (wallet, lot) = transaction(jdbc) { issue(it) }
        val reservation = transaction(jdbc) { quote(it, wallet, lot) }
        assertEquals(600L, jdbc.queryForObject("SELECT held FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, lot))
        val tables = listOf("loyalty_reservations", "loyalty_reservation_allocations", "loyalty_reservation_states", "loyalty_reservation_history")
        for (table in tables) {
            for (privilege in listOf("INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")) {
                assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime',?,?)", Boolean::class.java, table, privilege)!!)
            }
            assertTrue(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'SELECT')", Boolean::class.java, table)!!)
            assertThrows(DataAccessException::class.java) { jdbc.execute("DELETE FROM $table") }
            assertThrows(DataAccessException::class.java) { jdbc.execute("TRUNCATE $table CASCADE") }
        }
        listOf("UPDATE loyalty_reservations SET points=points", "UPDATE loyalty_reservation_allocations SET points=points",
            "UPDATE loyalty_reservation_history SET revision=revision").forEach { sql ->
            assertThrows(DataAccessException::class.java) { jdbc.execute(sql) }
        }
        // Constraints are deferred: incomplete evidence must roll back at COMMIT, not merely fail a single insert.
        for (failure in listOf("missing allocation", "under allocation", "over allocation", "missing history", "missing projection", "wrong projection", "noncontiguous ordinal", "over issued terminal")) {
            val (testWallet, testLot) = transaction(jdbc) { issue(it) }
            val error = assertThrows(SQLException::class.java) {
                transaction(jdbc) { quote(it, testWallet, testLot, failure) }
            }
            assertEquals("23514", error.sqlState, failure)
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM loyalty_reservations WHERE wallet_id=?", Int::class.java, testWallet))
            assertEquals(1000L, jdbc.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, testLot))
        }
        for (column in listOf("held", "redeemed", "expired", "reversed")) {
            assertThrows(SQLException::class.java) {
                transaction(jdbc) { it.update("UPDATE loyalty_lot_partitions SET free=free-1,$column=$column+1 WHERE lot_id=?", lot) }
            }
        }
        val other = transaction(jdbc) { issue(it) }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("INSERT INTO loyalty_reservation_allocations(reservation_id,wallet_id,lot_id,ordinal,points) VALUES (?,?,?,2,1)", reservation, wallet, other.second)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE loyalty_reservation_states SET state='UNKNOWN',revision=revision+1 WHERE reservation_id=?", reservation)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE loyalty_reservation_states SET state='FUTURE',revision=revision+1 WHERE reservation_id=?", reservation)
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE loyalty_reservation_states SET revision=revision+2 WHERE reservation_id=?", reservation)
        }
        assertThrows(SQLException::class.java) {
            transaction(jdbc) { tx ->
                tx.update("UPDATE loyalty_reservation_states SET state=?,revision=revision+1 WHERE reservation_id=?", LoyaltyReservationState.RELEASED.name, reservation)
                tx.update("UPDATE loyalty_lot_partitions SET free=1000,held=0 WHERE lot_id=?", lot)
            }
        }
        // Valid cancellation closes the same frozen allocations and creates no fake ledger movement.
        transaction(jdbc) { tx ->
            tx.update("INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,1,?,?,'2026-11-26T00:01:00Z')", reservation, wallet, LoyaltyReservationState.QUOTED.name, LoyaltyReservationState.RELEASED.name)
            tx.update("UPDATE loyalty_reservation_states SET state=?,revision=1 WHERE reservation_id=?", LoyaltyReservationState.RELEASED.name, reservation)
            tx.update("UPDATE loyalty_lot_partitions SET free=1000,held=0 WHERE lot_id=?", lot)
        }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM loyalty_ledger WHERE wallet_id=?", Int::class.java, wallet))
        assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE loyalty_reservation_states SET state=?,revision=2 WHERE reservation_id=?", LoyaltyReservationState.QUOTED.name, reservation)
        }
        // TTL and whole-second requirements are enforced independently of application translation.
        for (expires in listOf("2026-11-26T00:14:59Z", "2026-11-26T00:15:01Z", "2026-11-26T00:15:00.1Z", "infinity")) {
            assertThrows(DataAccessException::class.java) {
                jdbc.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,created_at,expires_at) VALUES (?,?,0,0,1,'2026-11-26T00:00:00Z',?::timestamptz)", UUID.randomUUID(), wallet, expires)
            }
        }
        for (definition in listOf("0,0,0,'loyalty-policy-v1'", "-1,0,1,'loyalty-policy-v1'", "0,-1,1,'loyalty-policy-v1'", "0,0,1,'UNKNOWN'")) {
            assertThrows(DataAccessException::class.java) {
                jdbc.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,policy_version,created_at,expires_at) VALUES (?,?,$definition,'2026-11-26T00:00:00Z','2026-11-26T00:15:00Z')", UUID.randomUUID(), wallet)
            }
        }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,created_at,expires_at) VALUES ('00000000-0000-0000-0000-000000000000',?,0,0,1,'2026-11-26T00:00:00Z','2026-11-26T00:15:00Z')", wallet)
        }
        val (expiryWallet, expiryLot) = transaction(jdbc) { issue(it) }
        val expiryReservation = transaction(jdbc) { quote(it, expiryWallet, expiryLot) }
        assertThrows(DataAccessException::class.java) {
            jdbc.update("INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,1,?,?,'2026-11-26T00:14:59Z')", expiryReservation, expiryWallet, LoyaltyReservationState.QUOTED.name, LoyaltyReservationState.EXPIRED.name)
        }
        transaction(jdbc) { tx ->
            tx.update("INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,1,?,?,'2026-11-26T00:15:00Z')", expiryReservation, expiryWallet, LoyaltyReservationState.QUOTED.name, LoyaltyReservationState.EXPIRED.name)
            tx.update("UPDATE loyalty_reservation_states SET state=?,revision=1 WHERE reservation_id=?", LoyaltyReservationState.EXPIRED.name, expiryReservation)
            tx.update("UPDATE loyalty_lot_partitions SET free=1000,held=0 WHERE lot_id=?", expiryLot)
        }
        // Every real runtime connection is restricted, rather than checking only owner metadata.
        jdbc.dataSource!!.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET ROLE storecore_runtime")
                for (table in tables) {
                    val denied = assertThrows(SQLException::class.java) { statement.execute("DELETE FROM public.$table") }
                    assertEquals("42501", denied.sqlState)
                }
            }
        }
        assertEquals(listOf("loyalty_admin_authorized"), jdbc.queryForList("""SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname LIKE 'loyalty_%' AND (p.prosecdef OR has_function_privilege('storecore_runtime',p.oid,'EXECUTE')) ORDER BY p.proname""", String::class.java))
    }

    private fun quote(jdbc: JdbcTemplate, wallet: Long, lot: Long, failure: String? = null): UUID {
        val id = UUID.randomUUID()
        val impossibleTerminal = failure == "over issued terminal"
        jdbc.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,created_at,expires_at) VALUES (?,?,0,0,?,'2026-11-26T00:00:00Z','2026-11-26T00:15:00Z')", id, wallet, if (impossibleTerminal) 1001 else 600)
        if (failure != "missing allocation") jdbc.update("INSERT INTO loyalty_reservation_allocations(reservation_id,wallet_id,lot_id,ordinal,points) VALUES (?,?,?,?,?)", id, wallet, lot,
            if (failure == "noncontiguous ordinal") 2 else 1, when (failure) { "under allocation" -> 599; "over allocation" -> 601; "over issued terminal" -> 1001; else -> 600 })
        if (failure != "missing projection") jdbc.update("INSERT INTO loyalty_reservation_states(reservation_id,wallet_id,state,revision) VALUES (?,?,?,0)", id, wallet, LoyaltyReservationState.QUOTED.name)
        if (failure == "wrong projection" || impossibleTerminal) jdbc.update("UPDATE loyalty_reservation_states SET state=?,revision=1 WHERE reservation_id=?", LoyaltyReservationState.RELEASED.name, id)
        if (failure != "missing history") jdbc.update("INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,0,NULL,?,'2026-11-26T00:00:00Z')", id, wallet, LoyaltyReservationState.QUOTED.name)
        if (impossibleTerminal) jdbc.update("INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,1,?,?,'2026-11-26T00:01:00Z')", id, wallet, LoyaltyReservationState.QUOTED.name, LoyaltyReservationState.RELEASED.name)
        else jdbc.update("UPDATE loyalty_lot_partitions SET free=free-600,held=held+600 WHERE lot_id=?", lot)
        return id
    }

    private fun issue(jdbc: JdbcTemplate): Pair<Long, Long> {
        val customer = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Reservation','Fixture') RETURNING id", Long::class.java, "${UUID.randomUUID()}@example.test", "${'$'}argon2id${'$'}fixture")!!
        val wallet = jdbc.queryForObject("INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id", Long::class.java, customer)!!
        val source = UUID.randomUUID()
        jdbc.update("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',1000,'2026-11-26T00:00:00Z')", source, wallet, source.toString())
        val ledger = jdbc.queryForObject("INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at) VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',1000,'2026-11-26T00:00:00Z') RETURNING id", Long::class.java, wallet, source)!!
        val lot = jdbc.queryForObject("INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at) VALUES (?,?,1000,'2026-11-26T00:00:00Z','2027-11-26T00:00:00Z') RETURNING id", Long::class.java, wallet, ledger)!!
        jdbc.update("INSERT INTO loyalty_lot_partitions(lot_id,wallet_id,issued,free,held,redeemed,expired,reversed) VALUES (?,?,1000,1000,0,0,0,0)", lot, wallet)
        jdbc.update("INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,'ISSUE',1000,'2026-11-26T00:00:00Z')", UUID.randomUUID(), wallet, lot, ledger)
        return wallet to lot
    }

    private fun <T> transaction(jdbc: JdbcTemplate, block: (JdbcTemplate) -> T): T = jdbc.dataSource!!.connection.use { connection ->
        connection.autoCommit = false
        try {
            val result = block(JdbcTemplate(SingleConnectionDataSource(connection, true)))
            connection.commit()
            result
        } catch (error: Throwable) { connection.rollback(); throw error }
    }
}
