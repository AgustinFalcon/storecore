package com.storecore.loyalty.infrastructure

import com.storecore.loyalty.application.*
import com.storecore.loyalty.domain.LoyaltyPolicyId
import com.storecore.loyalty.domain.LoyaltyRealm
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

class JdbcLoyaltyWalletRepositoryPostgresTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private val now = Instant.parse("2026-11-26T00:00:00Z")
        private const val YEAR_SECONDS = 365L * 86_400
        @JvmStatic @BeforeAll fun start() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration").load().migrate()
        }
        @JvmStatic @AfterAll fun stop() { postgres.stop() }
    }

    // Only fixture setup uses the owner. Every repository connection assumes the real restricted role.
    private val owner by lazy { JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)) }
    private val runtime by lazy {
        JdbcTemplate(object : DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password) {
            override fun getConnection(): Connection = super.getConnection().also { connection ->
                connection.createStatement().use { it.execute("SET ROLE storecore_runtime") }
            }
        })
    }
    private val repository by lazy { JdbcLoyaltyWalletRepository(runtime) }

    @Test fun `missing customer wallet is not found`() {
        val customer = customer()
        unavailable(repository.findByCustomer(customer, now), LoyaltyWalletUnavailableReason.NOT_FOUND)
        unavailable(repository.findByCustomer(Long.MAX_VALUE, now), LoyaltyWalletUnavailableReason.NOT_FOUND)
    }

    @Test fun `empty wallet is available with its durable identity and revision`() {
        val customer = customer()
        val wallet = wallet(customer)
        owner.update("UPDATE loyalty_wallets SET revision=1 WHERE id=?", wallet)
        val snapshot = available(repository.findByCustomer(customer, now))
        assertEquals(wallet, snapshot.walletId)
        assertEquals(customer, snapshot.customerId)
        assertEquals(1L, snapshot.revision.value)
        assertEquals(LoyaltyPolicyId.V1, snapshot.policy)
        assertEquals(0L, snapshot.availablePoints.value)
        assertEquals(0L, snapshot.heldPoints.value)
        assertNull(snapshot.nextExpiryAt)
        assertEquals(0L, snapshot.nextExpiryPoints.value)
    }

    @Test fun `multiple lots aggregate free points and combine the earliest expiry`() {
        val customer = customer()
        val wallet = wallet(customer)
        val first = now.minusSeconds(100)
        lot(wallet, first, 10, 10, 0)
        lot(wallet, first, 20, 20, 0)
        lot(wallet, now.minusSeconds(50), 30, 30, 0)
        val otherWallet = wallet(customer())
        lot(otherWallet, first, 900, 900, 0)
        val snapshot = available(repository.findByCustomer(customer, now))
        assertEquals(60L, snapshot.availablePoints.value)
        assertEquals(0L, snapshot.heldPoints.value)
        assertEquals(first.plusSeconds(YEAR_SECONDS), snapshot.nextExpiryAt)
        assertEquals(30L, snapshot.nextExpiryPoints.value)
    }

    @Test fun `expiry is truthful at the exact boundary without writing partitions or ledger`() {
        val customer = customer()
        val wallet = wallet(customer)
        val lot = lot(wallet, now.minusSeconds(YEAR_SECONDS), 10, 10, 0)
        val before = available(repository.findByCustomer(customer, now.minusSeconds(1)))
        assertEquals(10L, before.availablePoints.value)
        assertEquals(now, before.nextExpiryAt)
        val at = available(repository.findByCustomer(customer, now))
        assertEquals(0L, at.availablePoints.value)
        assertEquals(0L, at.heldPoints.value)
        assertNull(at.nextExpiryAt)
        assertEquals(0L, at.nextExpiryPoints.value)
        assertEquals(10L, owner.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE lot_id=?", Long::class.java, lot))
        assertEquals(1L, owner.queryForObject("SELECT count(*) FROM loyalty_ledger WHERE wallet_id=?", Long::class.java, wallet))
    }

    @Test fun `future accepted evidence fails closed until its accepted instant`() {
        val customer = customer()
        val wallet = wallet(customer)
        lot(wallet, now.plusSeconds(1), 10, 10, 0)
        unavailable(repository.findByCustomer(customer, now), LoyaltyWalletUnavailableReason.CORRUPT_EVIDENCE)
        assertEquals(10L, available(repository.findByCustomer(customer, now.plusSeconds(1))).availablePoints.value)
    }

    @Test fun `repository executes with select only runtime authority`() {
        val customer = customer()
        val wallet = wallet(customer)
        lot(wallet, now, 10, 10, 0)
        assertEquals("storecore_runtime", runtime.queryForObject("SELECT current_user", String::class.java))
        for (table in listOf("loyalty_wallets", "loyalty_lots", "loyalty_lot_partitions")) {
            assertTrue(runtime.queryForObject("SELECT has_table_privilege(current_user,?,'SELECT')", Boolean::class.java, table)!!)
            for (privilege in listOf("INSERT", "UPDATE", "DELETE", "TRUNCATE")) {
                assertFalse(runtime.queryForObject("SELECT has_table_privilege(current_user,?,?)", Boolean::class.java, table, privilege)!!)
            }
            val failure = assertThrows(DataAccessException::class.java) { runtime.update("DELETE FROM $table") }
            assertEquals("42501", (failure.rootCause as java.sql.SQLException).sqlState)
        }
        assertEquals(10L, available(repository.findByCustomer(customer, now)).availablePoints.value)
    }

    @Test fun `private exact historical receipt requires matching realm and actor and survives current changes`() {
        val customer = customer()
        val wallet = wallet(customer)
        val command = receipt(wallet, snapshot(wallet, customer, "0"), snapshot(wallet, customer, "1"))
        val receipt = requireNotNull(repository.findReceipt(command, LoyaltyRealm.USER, 42))
        assertEquals(command, receipt.commandId)
        assertEquals(wallet.toString(), receipt.aggregateRef)
        assertEquals(0L, receipt.before.revision.value)
        assertEquals(1L, receipt.after.revision.value)
        assertEquals(0L, receipt.after.availablePoints.value)
        assertEquals(now, receipt.recordedAt)
        for (realm in listOf(LoyaltyRealm.CUSTOMER, LoyaltyRealm.SYSTEM, LoyaltyRealm.UNKNOWN)) {
            assertNull(repository.findReceipt(command, realm, 42))
        }
        assertNull(repository.findReceipt(command, LoyaltyRealm.USER, 43))
        assertNull(repository.findReceipt(UUID.randomUUID(), LoyaltyRealm.USER, 42))
        lot(wallet, now, 100, 100, 0)
        owner.update("UPDATE loyalty_wallets SET revision=1 WHERE id=?", wallet)
        assertEquals(100L, available(repository.findByCustomer(customer, now)).availablePoints.value)
        assertEquals(0L, requireNotNull(repository.findReceipt(command, LoyaltyRealm.USER, 42)).after.availablePoints.value)
    }

    @Test fun `malformed future or corrupt historical snapshots are never returned`() {
        val customer = customer()
        val wallet = wallet(customer)
        val before = snapshot(wallet, customer, "0")
        val valid = snapshot(wallet, customer, "1")
        for (invalid in listOf("{}", valid.replace("loyalty-policy-v1", "future-policy"),
            valid.replace("\"revision\":\"1\"", "\"revision\":\"01\""),
            valid.replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
            snapshot(wallet, customer, "2"), snapshot(wallet, customer + 1, "1"))) {
            val command = receipt(wallet, before, invalid)
            assertNull(repository.findReceipt(command, LoyaltyRealm.USER, 42), invalid)
        }
    }

    @Test fun `historical lot evidence is translated and invalid conservation never escapes`() {
        val customer = customer()
        val wallet = wallet(customer)
        val lot = """{"id":"1","walletId":"$wallet","acceptedAt":"$now","expiresAt":"${now.plusSeconds(YEAR_SECONDS)}","policyVersion":"loyalty-policy-v1","issued":"10","free":"7","held":"3","redeemed":"0","expired":"0","reversed":"0"}"""
        val after = snapshot(wallet, customer, "1").replace("\"lots\":[]", "\"lots\":[$lot]")
        val before = snapshot(wallet, customer, "0")
        val command = receipt(wallet, before, after)
        val result = requireNotNull(repository.findReceipt(command, LoyaltyRealm.USER, 42))
        assertEquals(7L, result.after.availablePoints.value)
        assertEquals(3L, result.after.heldPoints.value)
        assertEquals(now.plusSeconds(YEAR_SECONDS), result.after.nextExpiryAt)
        assertEquals(7L, result.after.nextExpiryPoints.value)
        for (invalid in listOf(after.replace("\"free\":\"7\"", "\"free\":\"8\""),
            after.replace("\"lots\":[$lot]", "\"lots\":[$lot,$lot]"),
            after.replace("\"at\":\"$now\"", "\"at\":\"${now.plusSeconds(1)}\""),
            after.replace("\"held\":\"3\"", "\"held\":3"))) {
            assertNull(repository.findReceipt(receipt(wallet, before, invalid), LoyaltyRealm.USER, 42))
        }
    }

    private fun snapshot(wallet: Long, customer: Long, revision: String) = """{"schemaVersion":1,"walletId":"$wallet","customerId":"$customer","ownerRealm":"CUSTOMER","revision":"$revision","policyVersion":"loyalty-policy-v1","at":"$now","lots":[]}"""

    private fun receipt(wallet: Long, before: String, after: String): UUID {
        val command = UUID.randomUUID()
        owner.update("""INSERT INTO loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash)
            VALUES (?,'USER',42,'ADMIN_ADJUSTMENT','WALLET',?,repeat('a',64))""", command, wallet.toString())
        owner.update("""INSERT INTO loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at)
            VALUES (?,'APPLIED',200,?::jsonb,?::jsonb,?)""", command, before, after, Timestamp.from(now))
        return command
    }

    private fun customer(): Long = owner.queryForObject(
        "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Loyalty','Fixture') RETURNING id",
        Long::class.java, "loyalty-${UUID.randomUUID()}@example.test", "${'$'}argon2id${'$'}fixture")!!

    private fun wallet(customer: Long): Long = owner.queryForObject(
        "INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id", Long::class.java, customer)!!

    private fun lot(wallet: Long, accepted: Instant, issued: Long, free: Long, held: Long): Long =
        TransactionTemplate(DataSourceTransactionManager(requireNotNull(owner.dataSource))).execute {
            val source = UUID.randomUUID()
            owner.update("""INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at)
                VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',?,?)""", source, wallet, source.toString(), issued, Timestamp.from(accepted))
            val ledger = owner.queryForObject("""INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at)
                VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',?,?) RETURNING id""", Long::class.java, wallet, source, issued, Timestamp.from(accepted))!!
            val lot = owner.queryForObject("""INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at)
                VALUES (?,?,?,?,?) RETURNING id""", Long::class.java, wallet, ledger, issued, Timestamp.from(accepted), Timestamp.from(accepted.plusSeconds(YEAR_SECONDS)))!!
            owner.update("""INSERT INTO loyalty_lot_partitions(lot_id,wallet_id,issued,free,held,redeemed,expired,reversed)
                VALUES (?,?,?,?,?,0,0,0)""", lot, wallet, issued, free, held)
            owner.update("""INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at)
                VALUES (?,?,?,?,'ISSUE',?,?)""", UUID.randomUUID(), wallet, lot, ledger, issued, Timestamp.from(accepted))
            lot
        }!!

    private fun available(result: LoyaltyWalletRead) = assertInstanceOf(LoyaltyWalletRead.Available::class.java, result).snapshot
    private fun unavailable(result: LoyaltyWalletRead, reason: LoyaltyWalletUnavailableReason) {
        assertEquals(reason, assertInstanceOf(LoyaltyWalletRead.Unavailable::class.java, result).reason)
    }
}
