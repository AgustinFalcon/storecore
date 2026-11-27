package com.storecore.schema

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Assertions.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LoyaltyReservationCommandMigrationTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @BeforeAll fun start() { postgres.start() }
        @JvmStatic @AfterAll fun stop() { postgres.stop() }
    }
    private val owner by lazy { JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)) }
    private val runtime by lazy { JdbcTemplate(object : DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password) {
        override fun getConnection(): Connection = super.getConnection().also { it.createStatement().use { s -> s.execute("SET ROLE storecore_runtime") } }
    }) }

    @BeforeEach fun reset() {
        owner.execute("DROP SCHEMA public CASCADE")
        owner.execute("CREATE SCHEMA public")
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration").load().migrate()
    }

    @Test fun `latest schema installs quote writer without runtime activation`() {
        val version = owner.queryForObject("SELECT max(version::int) FROM flyway_schema_history WHERE success", Int::class.java)
        assertEquals(44, version)
        val signature = "loyalty_quote_reservation(bigint,uuid,uuid,uuid,bigint,bigint,bigint,bigint,bigint,boolean,character varying)"
        assertFalse(owner.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')", Boolean::class.java, signature)!!)
        assertThrows(DataAccessException::class.java) { runtime.queryForObject(callSql, String::class.java,
            1L, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 1L, 0L, 0L, 1L, 100_000L, false, "a".repeat(64)) }
        val cancelSignature = "loyalty_cancel_reservation(bigint,uuid,uuid,uuid,bigint,character varying)"
        val expirySignature = "loyalty_expire_reservation(uuid,uuid,bigint,character varying)"
        assertFalse(owner.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')", Boolean::class.java, cancelSignature)!!)
        assertFalse(owner.queryForObject("SELECT has_function_privilege('storecore_runtime',?,'EXECUTE')", Boolean::class.java, expirySignature)!!)
    }

    @Test fun `quote atomically freezes FIFO hold receipt audit and exact replay`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-01-01T00:00:00Z"), 400)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 700)
        val command = UUID.randomUUID()
        val reservation = UUID.randomUUID()
        val args = arrayOf(customer, session, command, reservation, wallet, 3L, 0L, 600L, 1_000_000L, false, "a".repeat(64))
        val first = owner.queryForObject(callSql, String::class.java, *args)!!
        val replay = owner.queryForObject(callSql, String::class.java, *args)!!
        assertEquals(first, replay)
        assertTrue(first.contains("APPLIED"))
        assertTrue(first.contains(reservation.toString()))
        assertEquals(listOf(400L, 200L), owner.queryForList(
            "SELECT points FROM loyalty_reservation_allocations WHERE reservation_id=? ORDER BY ordinal", Long::class.java, reservation))
        assertEquals(1L, owner.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?", Long::class.java, wallet))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_command_receipts WHERE command_id=?", Int::class.java, command))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_audit WHERE command_id=?", Int::class.java, command))
    }

    @Test fun `due expiry is independently evidenced when quote is rejected`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2025-01-01T00:00:00Z"), 100)
        val command = UUID.randomUUID()
        val result = owner.queryForObject(callSql, String::class.java, customer, session, command, UUID.randomUUID(), wallet,
            3L, 0L, 100L, 1_000_000L, false, "b".repeat(64))!!
        assertTrue(result.contains("INSUFFICIENT_BALANCE"))
        assertEquals(1L, owner.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?", Long::class.java, wallet))
        assertEquals(0L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(100L, owner.queryForObject("SELECT expired FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_command_bindings WHERE realm='SYSTEM' AND operation='MATERIALIZE_EXPIRY'", Int::class.java))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_command_receipts WHERE command_id=?", Int::class.java, command))
    }

    @Test fun `two concurrent overcommitting quotes serialize to applied and insufficient balance`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val outcomes = (1..2).map { index ->
                executor.submit<String> {
                    start.await(10, TimeUnit.SECONDS)
                    owner.queryForObject(
                        callSql,
                        String::class.java,
                        customer,
                        session,
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        wallet,
                        index.toLong(),
                        0L,
                        600L,
                        1_000_000L,
                        false,
                        index.toString().repeat(64)
                    )!!
                }
            }
            start.countDown()
            val results = outcomes.map { it.get(20, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it.contains("APPLIED") })
            assertEquals(1, results.count { it.contains("INSUFFICIENT_BALANCE") })
            assertEquals(0, results.count { it.contains("REVISION_CONFLICT") })
        } finally {
            executor.shutdownNow()
        }
        assertEquals(400L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(600L, owner.queryForObject("SELECT held FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_reservations WHERE wallet_id=?", Int::class.java, wallet))
        assertEquals(2, owner.queryForObject(
            "SELECT count(*) FROM loyalty_command_receipts r JOIN loyalty_command_bindings b ON b.command_id=r.command_id WHERE b.aggregate_ref=? AND b.operation='CREATE_RESERVATION'",
            Int::class.java,
            wallet.toString()
        ))
    }

    @Test fun `customer cancellation releases an unbound quote and replays exactly`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val reservation = UUID.randomUUID()
        owner.queryForObject(callSql, String::class.java, customer, session, UUID.randomUUID(), reservation, wallet,
            4L, 0L, 600L, 1_000_000L, false, "c".repeat(64))
        val command = UUID.randomUUID()
        val args = arrayOf(customer, session, command, reservation, 0L, "d".repeat(64))
        val first = owner.queryForObject(cancelSql, String::class.java, *args)!!
        val replay = owner.queryForObject(cancelSql, String::class.java, *args)!!
        assertEquals(first, replay)
        assertTrue(first.contains("APPLIED"))
        assertEquals("RELEASED", owner.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, reservation))
        assertEquals(1L, owner.queryForObject("SELECT revision FROM loyalty_reservation_states WHERE reservation_id=?", Long::class.java, reservation))
        assertEquals(1_000L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(0L, owner.queryForObject("SELECT held FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
    }

    @Test fun `explicit expiry applies at the boundary and cancel race has one terminal winner`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        val reservation = historicalQuotedReservation(wallet, 600)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val cancel = executor.submit<String> {
                start.await(10, TimeUnit.SECONDS)
                owner.queryForObject(cancelSql, String::class.java, customer, session, UUID.randomUUID(), reservation, 0L, "e".repeat(64))!!
            }
            val expiry = executor.submit<String> {
                start.await(10, TimeUnit.SECONDS)
                owner.queryForObject(expireSql, String::class.java, UUID.randomUUID(), reservation, 0L, "f".repeat(64))!!
            }
            start.countDown()
            val results = listOf(cancel.get(20, TimeUnit.SECONDS), expiry.get(20, TimeUnit.SECONDS))
            assertEquals(1, results.count { it.contains("APPLIED") })
            assertEquals(1, results.count { it.contains("INVALID_STATE") })
        } finally {
            executor.shutdownNow()
        }
        assertTrue(owner.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, reservation) in setOf("RELEASED", "EXPIRED"))
        assertEquals(1L, owner.queryForObject("SELECT revision FROM loyalty_reservation_states WHERE reservation_id=?", Long::class.java, reservation))
        assertEquals(1_000L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(0L, owner.queryForObject("SELECT held FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
    }

    @Test fun `expiry waiting on wallet lock decides with a fresh post lock clock`() {
        val customer = customer()
        val wallet = wallet(customer)
        val reservation = historicalQuotedReservation(wallet, 600, expiresAfterSeconds = 2)
        val expiresAt = owner.queryForObject(
            "SELECT expires_at FROM loyalty_reservations WHERE id=?",
            Timestamp::class.java,
            reservation
        )!!
        val tooEarly = owner.queryForObject(
            expireSql,
            String::class.java,
            UUID.randomUUID(),
            reservation,
            0L,
            "1".repeat(64)
        )!!
        assertTrue(tooEarly.contains("INVALID_STATE"))

        val command = UUID.randomUUID()
        val started = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        val lock = requireNotNull(owner.dataSource).connection
        try {
            lock.autoCommit = false
            lock.prepareStatement("SELECT id FROM loyalty_wallets WHERE id=? FOR UPDATE").use { statement ->
                statement.setLong(1, wallet)
                statement.executeQuery().use { assertTrue(it.next()) }
            }
            val expiry = executor.submit<String> {
                started.countDown()
                owner.queryForObject(
                    expireSql,
                    String::class.java,
                    command,
                    reservation,
                    0L,
                    "2".repeat(64)
                )!!
            }
            assertTrue(started.await(5, TimeUnit.SECONDS))
            awaitDatabaseReservationExpiry(reservation)
            lock.commit()
            assertTrue(expiry.get(20, TimeUnit.SECONDS).contains("APPLIED"))
        } finally {
            if (!lock.autoCommit) lock.rollback()
            lock.close()
            executor.shutdownNow()
        }
        val recordedAt = owner.queryForObject(
            "SELECT recorded_at FROM loyalty_command_receipts WHERE command_id=?",
            Timestamp::class.java,
            command
        )!!
        assertFalse(recordedAt.before(expiresAt))
        assertEquals("EXPIRED", owner.queryForObject(
            "SELECT state FROM loyalty_reservation_states WHERE reservation_id=?",
            String::class.java,
            reservation
        ))
    }

    @Test fun `quote replay survives later expiry while foreign actor and uuid reuse fail closed`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        val reservation = historicalQuotedReservation(wallet, 600)
        val quoteCommand = UUID.randomUUID()
        val quoteHash = "3".repeat(64)
        owner.update(
            """INSERT INTO loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash)
                VALUES (?,'CUSTOMER',?,'CREATE_RESERVATION','WALLET',?,?)""",
            quoteCommand,
            customer,
            wallet.toString(),
            quoteHash
        )
        owner.update(
            """INSERT INTO loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at)
                SELECT ?,'APPLIED',200,loyalty_wallet_snapshot(?,r.created_at),loyalty_wallet_snapshot(?,r.created_at),r.created_at
                FROM loyalty_reservations r WHERE r.id=?""",
            quoteCommand,
            wallet,
            wallet,
            reservation
        )
        owner.update(
            """INSERT INTO loyalty_audit(id,command_id,wallet_id,recorded_at)
                SELECT ?,?, ?,recorded_at FROM loyalty_command_receipts WHERE command_id=?""",
            UUID.randomUUID(),
            quoteCommand,
            wallet,
            quoteCommand
        )
        owner.update(
            "INSERT INTO loyalty_reservation_command_results(command_id,reservation_id) VALUES (?,?)",
            quoteCommand,
            reservation
        )

        val expiry = owner.queryForObject(
            expireSql,
            String::class.java,
            UUID.randomUUID(),
            reservation,
            0L,
            "4".repeat(64)
        )!!
        assertTrue(expiry.contains("APPLIED"))
        val replay = owner.queryForObject(
            callSql,
            String::class.java,
            customer,
            session,
            quoteCommand,
            reservation,
            wallet,
            9L,
            0L,
            600L,
            1_000_000L,
            false,
            quoteHash
        )!!
        assertTrue(replay.contains("APPLIED"))
        assertTrue(replay.contains(reservation.toString()))

        assertThrows(DataAccessException::class.java) {
            owner.queryForObject(
                callSql,
                String::class.java,
                customer,
                session,
                quoteCommand,
                reservation,
                wallet,
                9L,
                0L,
                600L,
                1_000_000L,
                false,
                "5".repeat(64)
            )
        }
        val foreign = customer()
        val foreignSession = session(foreign)
        val foreignCommand = UUID.randomUUID()
        assertThrows(DataAccessException::class.java) {
            owner.queryForObject(
                cancelSql,
                String::class.java,
                foreign,
                foreignSession,
                foreignCommand,
                reservation,
                1L,
                "6".repeat(64)
            )
        }
        assertEquals(0, owner.queryForObject(
            "SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?",
            Int::class.java,
            foreignCommand
        ))
    }

    @Test fun `duplicate reservation failure rolls back command and wallet effects`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val reservation = UUID.randomUUID()
        owner.queryForObject(
            callSql,
            String::class.java,
            customer,
            session,
            UUID.randomUUID(),
            reservation,
            wallet,
            1L,
            0L,
            100L,
            1_000_000L,
            false,
            "7".repeat(64)
        )
        val failedCommand = UUID.randomUUID()
        assertThrows(DataAccessException::class.java) {
            owner.queryForObject(
                callSql,
                String::class.java,
                customer,
                session,
                failedCommand,
                reservation,
                wallet,
                2L,
                1L,
                100L,
                1_000_000L,
                false,
                "8".repeat(64)
            )
        }
        assertEquals(1L, owner.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?", Long::class.java, wallet))
        assertEquals(900L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(100L, owner.queryForObject("SELECT held FROM loyalty_lot_partitions WHERE wallet_id=?", Long::class.java, wallet))
        assertEquals(0, owner.queryForObject(
            "SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?",
            Int::class.java,
            failedCommand
        ))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_reservations WHERE id=?", Int::class.java, reservation))
    }

    @Test fun `invalid persisted lot partition fails quote closed without partial evidence`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        val lot = lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        owner.execute("ALTER TABLE loyalty_lot_partitions DISABLE TRIGGER USER")
        try {
            owner.update("UPDATE loyalty_lot_partitions SET free=free-1,reversed=reversed+1 WHERE lot_id=?", lot)
        } finally {
            owner.execute("ALTER TABLE loyalty_lot_partitions ENABLE TRIGGER USER")
        }
        val command = UUID.randomUUID()
        val reservation = UUID.randomUUID()
        assertThrows(DataAccessException::class.java) {
            owner.queryForObject(
                callSql,
                String::class.java,
                customer,
                session,
                command,
                reservation,
                wallet,
                1L,
                0L,
                100L,
                1_000_000L,
                false,
                "9".repeat(64)
            )
        }
        assertEquals(999L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, lot))
        assertEquals(0L, owner.queryForObject("SELECT held FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, lot))
        assertEquals(1L, owner.queryForObject("SELECT reversed FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, lot))
        assertEquals(0, owner.queryForObject("SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?", Int::class.java, command))
        assertEquals(0, owner.queryForObject("SELECT count(*) FROM loyalty_reservations WHERE id=?", Int::class.java, reservation))
    }

    @Test fun `mandatory nullable writer inputs are rejected without evidence`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val attemptedCommands = mutableListOf<UUID>()
        val attemptedReservations = mutableListOf<UUID>()
        for (nullIndex in listOf(6, 8, 9)) {
            val command = UUID.randomUUID()
            val reservation = UUID.randomUUID()
            attemptedCommands += command
            attemptedReservations += reservation
            val args = arrayOf<Any?>(
                customer, session, command, reservation, wallet, 1L, 0L, 100L, 1_000_000L, false, "a".repeat(64)
            )
            args[nullIndex] = null
            assertThrows(DataAccessException::class.java) {
                owner.queryForObject(callSql, String::class.java, *args)
            }
        }
        val terminalCommand = UUID.randomUUID()
        attemptedCommands += terminalCommand
        val historical = historicalQuotedReservation(wallet, 100)
        assertThrows(DataAccessException::class.java) {
            owner.queryForObject(expireSql, String::class.java, terminalCommand, historical, null, "b".repeat(64))
        }
        attemptedCommands.forEach { command ->
            assertEquals(0, owner.queryForObject(
                "SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?",
                Int::class.java,
                command
            ))
        }
        attemptedReservations.forEach { reservation ->
            assertEquals(0, owner.queryForObject(
                "SELECT count(*) FROM loyalty_reservations WHERE id=?",
                Int::class.java,
                reservation
            ))
        }
    }

    @Test fun `customer authority is revalidated after wallet lock wait`() {
        val quoteCustomer = customer()
        val quoteSession = session(quoteCustomer, idleSeconds = 2, absoluteSeconds = 3)
        val quoteWallet = wallet(quoteCustomer)
        lot(quoteWallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val quoteCommand = UUID.randomUUID()
        val quoteReservation = UUID.randomUUID()
        val quoteLock = requireNotNull(owner.dataSource).connection
        val quoteStarted = CountDownLatch(1)
        val executor = Executors.newSingleThreadExecutor()
        try {
            quoteLock.autoCommit = false
            quoteLock.prepareStatement("SELECT id FROM loyalty_wallets WHERE id=? FOR UPDATE").use { statement ->
                statement.setLong(1, quoteWallet)
                statement.executeQuery().use { assertTrue(it.next()) }
            }
            val quote = executor.submit<String> {
                quoteStarted.countDown()
                owner.queryForObject(
                    callSql,
                    String::class.java,
                    quoteCustomer,
                    quoteSession,
                    quoteCommand,
                    quoteReservation,
                    quoteWallet,
                    1L,
                    0L,
                    100L,
                    1_000_000L,
                    false,
                    "c".repeat(64)
                )!!
            }
            assertTrue(quoteStarted.await(5, TimeUnit.SECONDS))
            awaitDatabaseSessionExpiry(quoteSession)
            quoteLock.commit()
            val error = assertThrows(ExecutionException::class.java) { quote.get(20, TimeUnit.SECONDS) }
            assertTrue(error.cause is DataAccessException)
        } finally {
            if (!quoteLock.autoCommit) quoteLock.rollback()
            quoteLock.close()
            executor.shutdownNow()
        }
        assertEquals(0, owner.queryForObject("SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?", Int::class.java, quoteCommand))
        assertEquals(0, owner.queryForObject("SELECT count(*) FROM loyalty_reservations WHERE id=?", Int::class.java, quoteReservation))

        val cancelCustomer = customer()
        val cancelSession = session(cancelCustomer, idleSeconds = 2, absoluteSeconds = 3)
        val cancelWallet = wallet(cancelCustomer)
        val cancelReservation = historicalQuotedReservation(cancelWallet, 600, expiresAfterSeconds = 60)
        val cancelCommand = UUID.randomUUID()
        val cancelLock = requireNotNull(owner.dataSource).connection
        val cancelStarted = CountDownLatch(1)
        val cancelExecutor = Executors.newSingleThreadExecutor()
        try {
            cancelLock.autoCommit = false
            cancelLock.prepareStatement("SELECT id FROM loyalty_wallets WHERE id=? FOR UPDATE").use { statement ->
                statement.setLong(1, cancelWallet)
                statement.executeQuery().use { assertTrue(it.next()) }
            }
            val cancel = cancelExecutor.submit<String> {
                cancelStarted.countDown()
                owner.queryForObject(
                    cancelSql,
                    String::class.java,
                    cancelCustomer,
                    cancelSession,
                    cancelCommand,
                    cancelReservation,
                    0L,
                    "d".repeat(64)
                )!!
            }
            assertTrue(cancelStarted.await(5, TimeUnit.SECONDS))
            awaitDatabaseSessionExpiry(cancelSession)
            cancelLock.commit()
            val error = assertThrows(ExecutionException::class.java) { cancel.get(20, TimeUnit.SECONDS) }
            assertTrue(error.cause is DataAccessException)
        } finally {
            if (!cancelLock.autoCommit) cancelLock.rollback()
            cancelLock.close()
            cancelExecutor.shutdownNow()
        }
        assertEquals("QUOTED", owner.queryForObject(
            "SELECT state FROM loyalty_reservation_states WHERE reservation_id=?",
            String::class.java,
            cancelReservation
        ))
        assertEquals(0, owner.queryForObject("SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?", Int::class.java, cancelCommand))
    }

    @Test fun `loyalty command follows customer before session identity lock order`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val command = UUID.randomUUID()
        val reservation = UUID.randomUUID()
        val identityMutation = requireNotNull(owner.dataSource).connection
        val executor = Executors.newSingleThreadExecutor()
        try {
            identityMutation.autoCommit = false
            identityMutation.prepareStatement("SELECT id FROM customers WHERE id=? FOR UPDATE").use { statement ->
                statement.setLong(1, customer)
                statement.executeQuery().use { assertTrue(it.next()) }
            }
            val quote = executor.submit<String> {
                owner.queryForObject(
                    callSql,
                    String::class.java,
                    customer,
                    session,
                    command,
                    reservation,
                    wallet,
                    1L,
                    0L,
                    100L,
                    1_000_000L,
                    false,
                    "4".repeat(64)
                )!!
            }
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
            var waitingOnCustomer = false
            while (System.nanoTime() < deadline && !waitingOnCustomer) {
                waitingOnCustomer = owner.queryForObject(
                    """SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                        WHERE query LIKE 'SELECT loyalty_quote_reservation%' AND wait_event_type='Lock')""",
                    Boolean::class.java
                )!!
                if (!waitingOnCustomer) Thread.sleep(50)
            }
            assertTrue(waitingOnCustomer)
            identityMutation.prepareStatement("SELECT id FROM identity_sessions WHERE id=? FOR UPDATE").use { statement ->
                statement.setObject(1, session)
                statement.executeQuery().use { assertTrue(it.next()) }
            }
            identityMutation.commit()
            assertTrue(quote.get(20, TimeUnit.SECONDS).contains("APPLIED"))
        } finally {
            if (!identityMutation.autoCommit) identityMutation.rollback()
            identityMutation.close()
            executor.shutdownNow()
        }
        assertEquals(1, owner.queryForObject(
            "SELECT count(*) FROM loyalty_command_receipts WHERE command_id=?",
            Int::class.java,
            command
        ))
    }

    @Test fun `concurrent identical system expiry returns one exact replay`() {
        val customer = customer()
        val wallet = wallet(customer)
        val reservation = historicalQuotedReservation(wallet, 600)
        val command = UUID.randomUUID()
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val calls = (1..2).map {
                executor.submit<String> {
                    start.await(5, TimeUnit.SECONDS)
                    owner.queryForObject(expireSql, String::class.java, command, reservation, 0L, "e".repeat(64))!!
                }
            }
            start.countDown()
            val results = calls.map { it.get(20, TimeUnit.SECONDS) }
            assertEquals(results.first(), results.last())
            assertTrue(results.first().contains("APPLIED"))
        } finally {
            executor.shutdownNow()
        }
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_command_receipts WHERE command_id=?", Int::class.java, command))
        assertEquals(1, owner.queryForObject("SELECT count(*) FROM loyalty_audit WHERE command_id=?", Int::class.java, command))
    }

    @Test fun `uuid v7 reservations can be quoted cancelled and explicitly expired`() {
        val customer = customer()
        val session = session(customer)
        val wallet = wallet(customer)
        lot(wallet, Instant.parse("2026-02-01T00:00:00Z"), 1_000)
        val cancellable = UUID.fromString("0193bb00-0000-7000-8000-000000000001")
        assertTrue(owner.queryForObject(
            callSql,
            String::class.java,
            customer,
            session,
            UUID.randomUUID(),
            cancellable,
            wallet,
            1L,
            0L,
            100L,
            1_000_000L,
            false,
            "f".repeat(64)
        )!!.contains("APPLIED"))
        assertTrue(owner.queryForObject(
            cancelSql,
            String::class.java,
            customer,
            session,
            UUID.randomUUID(),
            cancellable,
            0L,
            "0".repeat(64)
        )!!.contains("APPLIED"))

        val expirable = UUID.fromString("0193bb00-0000-7000-8000-000000000002")
        historicalQuotedReservation(wallet, 100, reservationId = expirable)
        assertTrue(owner.queryForObject(
            expireSql,
            String::class.java,
            UUID.randomUUID(),
            expirable,
            0L,
            "1".repeat(64)
        )!!.contains("APPLIED"))
    }

    private val callSql = "SELECT loyalty_quote_reservation(?,?,?,?,?,?,?,?,?,?,?)::text"
    private val cancelSql = "SELECT loyalty_cancel_reservation(?,?,?,?,?,?)::text"
    private val expireSql = "SELECT loyalty_expire_reservation(?,?,?,?)::text"
    private fun customer(): Long = owner.queryForObject(
        "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Quote','Customer') RETURNING id",
        Long::class.java, "quote-${UUID.randomUUID()}@example.test", "${'$'}argon2id${'$'}fixture")!!
    private fun awaitDatabaseReservationExpiry(reservation: UUID) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (System.nanoTime() < deadline) {
            if (owner.queryForObject("SELECT clock_timestamp() >= expires_at FROM loyalty_reservations WHERE id=?",
                Boolean::class.java, reservation) == true) return
            Thread.sleep(25)
        }
        fail<Unit>("PostgreSQL reservation did not expire while the wallet lock was held")
    }

    private fun awaitDatabaseSessionExpiry(session: UUID) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (System.nanoTime() < deadline) {
            if (owner.queryForObject("""SELECT clock_timestamp() >= least(idle_expires_at,absolute_expires_at)
                FROM identity_sessions WHERE id=?""", Boolean::class.java, session) == true) return
            Thread.sleep(25)
        }
        fail<Unit>("PostgreSQL session did not expire while the wallet lock was held")
    }

    private fun session(customer: Long, idleSeconds: Long = 3_600, absoluteSeconds: Long = 7_200): UUID = UUID.randomUUID().also { id -> owner.update(
        """INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?,'CUSTOMER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+(? * interval '1 second'),clock_timestamp()+(? * interval '1 second'))""",
        id, customer, UUID.randomUUID().toString().replace("-", "").repeat(2), idleSeconds, absoluteSeconds) }
    private fun wallet(customer: Long): Long = owner.queryForObject(
        "INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id", Long::class.java, customer)!!
    private fun lot(wallet: Long, accepted: Instant, issued: Long): Long =
        TransactionTemplate(DataSourceTransactionManager(requireNotNull(owner.dataSource))).execute {
            val source = UUID.randomUUID()
            owner.update("""INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at)
                VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',?,?)""", source, wallet, source.toString(), issued, Timestamp.from(accepted))
            val ledger = owner.queryForObject("""INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at)
                VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',?,?) RETURNING id""", Long::class.java, wallet, source, issued, Timestamp.from(accepted))!!
            val lot = owner.queryForObject("""INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at)
                VALUES (?,?,?,?,?) RETURNING id""", Long::class.java, wallet, ledger, issued, Timestamp.from(accepted), Timestamp.from(accepted.plusSeconds(365L * 86_400)))!!
            owner.update("INSERT INTO loyalty_lot_partitions(lot_id,wallet_id,issued,free,held,redeemed,expired,reversed) VALUES (?,?,?,?,0,0,0,0)", lot, wallet, issued, issued)
            owner.update("INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,'ISSUE',?,?)",
                UUID.randomUUID(), wallet, lot, ledger, issued, Timestamp.from(accepted))
            lot
        }!!

    private fun historicalQuotedReservation(
        wallet: Long,
        points: Long,
        expiresAfterSeconds: Long = -1,
        reservationId: UUID = UUID.randomUUID()
    ): UUID =
        TransactionTemplate(DataSourceTransactionManager(requireNotNull(owner.dataSource))).execute {
            val reservation = reservationId
            val created = owner.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
                .plusSeconds(expiresAfterSeconds - 900)
                .truncatedTo(java.time.temporal.ChronoUnit.SECONDS)
            val lot = lot(wallet, created.minusSeconds(60), 1_000)
            owner.update("""INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,created_at,expires_at)
                VALUES (?,?,0,0,?,?,?)""", reservation, wallet, points, Timestamp.from(created), Timestamp.from(created.plusSeconds(900)))
            owner.update("INSERT INTO loyalty_reservation_allocations(reservation_id,wallet_id,lot_id,ordinal,points) VALUES (?,?,?,1,?)",
                reservation, wallet, lot, points)
            owner.update("UPDATE loyalty_lot_partitions SET free=free-?,held=held+? WHERE lot_id=?", points, points, lot)
            owner.update("INSERT INTO loyalty_reservation_states(reservation_id,wallet_id,state,revision) VALUES (?,?,'QUOTED',0)", reservation, wallet)
            owner.update("""INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at)
                VALUES (?,?,0,NULL,'QUOTED',?)""", reservation, wallet, Timestamp.from(created))
            owner.update("UPDATE loyalty_wallets SET revision=revision+1 WHERE id=?", wallet)
            reservation
        }!!
}
