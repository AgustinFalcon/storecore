package com.storecore.schema

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.SQLException
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

class LoyaltyCheckoutBindingMigrationTest {

    @Test
    fun `clean install and V44 upgrade keep historical null-fingerprint quote unbindable and preserve runtime boundaries`() {
        listOf(false, true).forEach { upgrade ->
            PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
                pg.start()
                val owner = JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password))
                val runtime = JdbcTemplate(object : DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password) {
                    override fun getConnection(): Connection =
                        super.getConnection().also { it.createStatement().use { st -> st.execute("SET ROLE storecore_runtime") } }
                })

                fun migrate(target: String) = Flyway.configure()
                    .dataSource(pg.jdbcUrl, pg.username, pg.password)
                    .locations("classpath:db/migration")
                    .target(target)
                    .load()

                var historicalCustomerId: Long? = null
                var historicalSessionId: UUID? = null
                var historicalReservationId: UUID? = null

                if (upgrade) {
                    migrate("44").migrate()
                    val tx = TransactionTemplate(DataSourceTransactionManager(owner.dataSource!!))
                    tx.execute {
                        val customerId = owner.queryForObject(
                            "INSERT INTO customers(email,password_hash,first_name,last_name,active) VALUES (?,'\$argon2id\$fixture','Hist','Cust',TRUE) RETURNING id",
                            Long::class.java,
                            "hist-${UUID.randomUUID()}@example.test",
                        )!!
                        val sessionId = UUID.randomUUID().also { id ->
                            owner.update(
                                """INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
                                   VALUES (?,'CUSTOMER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",
                                id, customerId, UUID.randomUUID().toString().replace("-", "").repeat(2),
                            )
                        }
                        val walletId = owner.queryForObject(
                            "INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id",
                            Long::class.java,
                            customerId,
                        )!!
                        val sourceId = UUID.randomUUID()
                        owner.update(
                            "INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',500,'2026-10-01T00:00:00Z')",
                            sourceId, walletId, sourceId.toString(),
                        )
                        val ledgerId = owner.queryForObject(
                            "INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at) VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',500,'2026-10-01T00:00:00Z') RETURNING id",
                            Long::class.java,
                            walletId, sourceId,
                        )!!
                        val lotId = owner.queryForObject(
                            "INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at) VALUES (?,?,500,'2026-10-01T00:00:00Z','2027-10-01T00:00:00Z') RETURNING id",
                            Long::class.java,
                            walletId, ledgerId,
                        )!!
                        owner.update(
                            "INSERT INTO loyalty_lot_partitions(lot_id,wallet_id,issued,free,held,redeemed,expired,reversed) VALUES (?,?,500,200,300,0,0,0)",
                            lotId, walletId,
                        )
                        owner.update(
                            "INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,'ISSUE',500,'2026-10-01T00:00:00Z')",
                            UUID.randomUUID(), walletId, lotId, ledgerId,
                        )
                        val reservationId = UUID.randomUUID()
                        owner.update(
                            "INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,policy_version,points,created_at,expires_at) VALUES (?,?,0,0,'loyalty-policy-v1',300,date_trunc('second',clock_timestamp()),date_trunc('second',clock_timestamp()+interval '15 minutes'))",
                            reservationId, walletId,
                        )
                        owner.update(
                            "INSERT INTO loyalty_reservation_allocations(reservation_id,wallet_id,lot_id,ordinal,points) VALUES (?,?,?,1,300)",
                            reservationId, walletId, lotId,
                        )
                        owner.update(
                            "INSERT INTO loyalty_reservation_states(reservation_id,wallet_id,state,revision) VALUES (?,?,'QUOTED',0)",
                            reservationId, walletId,
                        )
                        owner.update(
                            "INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,0,NULL,'QUOTED',date_trunc('second',clock_timestamp()))",
                            reservationId, walletId,
                        )
                        historicalCustomerId = customerId
                        historicalSessionId = sessionId
                        historicalReservationId = reservationId
                    }
                }

                assertEquals("45", migrate("45").migrate().targetSchemaVersion.toString())
                migrate("45").validate()
                assertEquals(0, migrate("45").migrate().migrationsExecuted)

                assertEquals("DISABLED", owner.queryForObject("SELECT state FROM module_configurations WHERE module_code='LOYALTY'", String::class.java))
                assertTrue(owner.queryForObject("SELECT future_optional FROM capability_modules WHERE module_code='LOYALTY'", Boolean::class.java)!!)

                if (upgrade) {
                    assertNull(owner.queryForObject("SELECT cart_fingerprint FROM loyalty_reservations WHERE id=?", String::class.java, historicalReservationId))
                    val err = assertThrows(DataAccessException::class.java) {
                        runtime.queryForObject(
                            "SELECT loyalty_prepare_checkout_bind(?,?,?,?,?)",
                            Timestamp::class.java,
                            historicalCustomerId, historicalSessionId, historicalReservationId, 0L, "a".repeat(64),
                        )
                    }
                    assertTrue(err.message!!.contains("LOYALTY_QUOTE_EVIDENCE_MISSING") || err.message!!.contains("LOYALTY_CART_FINGERPRINT_MISMATCH"))
                    assertEquals(
                        "QUOTED",
                        owner.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, historicalReservationId),
                    )
                }

                // Runtime function execution boundaries
                val runtimeAllowed = listOf(
                    "loyalty_checkout_assert_live_customer_session(bigint,uuid)",
                    "loyalty_prepare_checkout_bind(bigint,uuid,uuid,bigint,character varying)",
                    "loyalty_record_order_earning_evidence(bigint,bigint,character varying,character varying,character varying,bigint,bigint,bigint,bigint,jsonb)",
                    "loyalty_bind_checkout_order(bigint,uuid,uuid,bigint,bigint,bigint,character varying,character varying,bigint,bigint,bigint,bigint,bigint,bigint,timestamp with time zone,jsonb)",
                )
                runtimeAllowed.forEach { signature ->
                    assertTrue(
                        owner.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')", Boolean::class.java, signature)!!,
                        "storecore_runtime should execute $signature",
                    )
                }

                val runtimeDenied = listOf(
                    "loyalty_assert_live_customer_session(bigint,uuid)",
                    "loyalty_quote_reservation(bigint,uuid,uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,character varying)",
                    "loyalty_cancel_reservation(bigint,uuid,uuid,uuid,bigint,character varying)",
                    "loyalty_expire_reservation(uuid,uuid,bigint,character varying)",
                )
                runtimeDenied.forEach { signature ->
                    assertFalse(
                        owner.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')", Boolean::class.java, signature)!!,
                        "storecore_runtime must not execute $signature",
                    )
                }

                assertEquals(
                    4,
                    owner.queryForObject(
                        """SELECT count(*) FROM pg_proc
                           WHERE proname IN ('loyalty_checkout_assert_live_customer_session','loyalty_prepare_checkout_bind','loyalty_record_order_earning_evidence','loyalty_bind_checkout_order')
                             AND prosecdef IS TRUE
                             AND proconfig IS NOT NULL
                             AND pg_get_userbyid(proowner) = 'storecore_migrator'""",
                        Int::class.java,
                    ),
                )

                val protectedTables = listOf(
                    "loyalty_wallets",
                    "loyalty_reservations",
                    "loyalty_reservation_states",
                    "loyalty_quote_snapshots",
                    "loyalty_order_snapshots",
                    "loyalty_order_lines",
                    "loyalty_checkout_bindings",
                )
                runtime.dataSource!!.connection.use { connection ->
                    connection.createStatement().use { statement ->
                        protectedTables.forEach { table ->
                            assertEquals("42501", assertThrows(SQLException::class.java) {
                                statement.execute("DELETE FROM public.$table")
                            }.sqlState)
                        }
                    }
                }
            }
        }
    }
}
