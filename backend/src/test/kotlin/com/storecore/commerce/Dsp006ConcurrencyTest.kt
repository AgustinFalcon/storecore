package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.application.ListingLifecycleCommand
import com.storecore.commerce.application.ListingLifecycleUseCase
import com.storecore.commerce.application.port.output.InventoryReserveLine
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.ListingLifecycleAction
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.JdbcChannelListingMappingAdapter
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcInventoryService
import com.storecore.commerce.infrastructure.JdbcMarketplaceAccountSelector
import com.storecore.commerce.infrastructure.JdbcMarketplaceListingProjectionAdapter
import com.storecore.configuration.CapabilityAdminTestSupport
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.postgresql.util.PSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp006ConcurrencyTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var inventory: JdbcInventoryService
    private lateinit var projection: DesiredStockProjectionUseCase
    private lateinit var lifecycle: ListingLifecycleUseCase
    private lateinit var transactions: TransactionTemplate
    private var adminId: Long = 0
    private lateinit var adminSession: UUID
    private lateinit var runtimeLogin: String
    private lateinit var runtimePassword: String

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        projection = DesiredStockProjectionUseCase(
            capabilities,
            JdbcMarketplaceListingProjectionAdapter(jdbc),
            JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
        )
        inventory = JdbcInventoryService(jdbc, transactions, projection)
        val mappings = JdbcChannelListingMappingAdapter(jdbc)
        lifecycle = ListingLifecycleUseCase(
            capabilities,
            JdbcMarketplaceAccountSelector(jdbc),
            mappings,
            projection,
            jdbc,
            transactions,
        )
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp006-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp006', 'dsp006-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp006', 'dsp006-cat')")
        runtimeLogin = "dsp006_rt_" + UUID.randomUUID().toString().replace("-", "").take(8)
        runtimePassword = UUID.randomUUID().toString()
        jdbc.execute("CREATE ROLE $runtimeLogin LOGIN PASSWORD '$runtimePassword'")
        jdbc.execute("GRANT storecore_runtime TO $runtimeLogin")
        jdbc.execute("GRANT CONNECT ON DATABASE ${postgres.databaseName} TO $runtimeLogin")
        jdbc.execute("GRANT USAGE ON SCHEMA public TO $runtimeLogin")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun concurrentWritersKeepCurrentVersionAndOldOutboxIsNotCandidate() {
        val variantId = seedVariant("SKU-DSP006-CAS", 10, 0, 2)
        val accountId = insertAccount("ml-sync-006cas", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-006-CAS")
        enableMl()
        try {
            inventory.adjust(variantId, -1, "WEB:dsp006-a", "first")
            inventory.adjust(variantId, -1, "WEB:dsp006-b", "second")
            val current = jdbc.queryForObject(
                "SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?",
                Long::class.java,
                listingId,
            )!!
            assertEquals(2L, current)
            assertEquals(2, stockOutbox(listingId))
            val candidates = jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM channel_outbox o
                JOIN channel_listing_stock_projection p
                  ON p.listing_id = o.listing_id AND p.projection_version = o.projection_version
                WHERE o.listing_id=? AND o.kind=?
                """.trimIndent(),
                Int::class.java,
                listingId,
                ChannelOutboxKind.StockDesiredChanged.wire,
            )!!
            assertEquals(1, candidates)
            val stale = jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM channel_outbox
                WHERE listing_id=? AND kind=? AND projection_version < ?
                """.trimIndent(),
                Int::class.java,
                listingId,
                ChannelOutboxKind.StockDesiredChanged.wire,
                current,
            )!!
            assertEquals(1, stale)
            val errors = AtomicReference<Throwable?>(null)
            val workers = (1..2).map {
                Thread {
                    try {
                        transactions.executeWithoutResult {
                            projection.project(
                                listOf(variantId),
                                ProjectionSourceCause.InternalAdjustment,
                                CapabilityActor.Internal(actor()),
                            )
                        }
                    } catch (thrown: Throwable) {
                        errors.compareAndSet(null, thrown)
                    }
                }
            }
            workers.forEach { it.start() }
            workers.forEach { it.join(8_000) }
            assertEquals(null, errors.get())
            val after = jdbc.queryForObject(
                "SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?",
                Long::class.java,
                listingId,
            )!!
            assertEquals(current, after)
            assertEquals(1, jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM channel_outbox o
                JOIN channel_listing_stock_projection p
                  ON p.listing_id = o.listing_id AND p.projection_version = o.projection_version
                WHERE o.listing_id=? AND o.kind=?
                """.trimIndent(),
                Int::class.java,
                listingId,
                ChannelOutboxKind.StockDesiredChanged.wire,
            ))
        } finally {
            disableMl()
        }
    }

    @Test
    fun twoListingsOnSameVariantProjectIndependently() {
        val variantId = seedVariant("SKU-DSP006-DUAL", 8, 0, 1)
        val accountId = insertAccount("ml-sync-006dual", ChannelAccountPurpose.ExternalMlSync.wire)
        val first = insertListing(accountId, variantId, "MLA-006-DUAL-A")
        val second = insertListing(accountId, variantId, "MLA-006-DUAL-B")
        enableMl()
        try {
            inventory.adjust(variantId, -1, "WEB:dsp006-dual", "split")
            assertEquals(1, stockOutbox(first))
            assertEquals(1, stockOutbox(second))
            assertEquals(1L, jdbc.queryForObject("SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?", Long::class.java, first))
            assertEquals(1L, jdbc.queryForObject("SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?", Long::class.java, second))
            assertEquals(6, jdbc.queryForObject("SELECT desired_quantity FROM channel_listing_stock_projection WHERE listing_id=?", Int::class.java, first))
        } finally {
            disableMl()
        }
    }

    @Test
    fun adminMutationsWaitOnSnapshotShareLock() {
        val held = CountDownLatch(1)
        val release = CountDownLatch(1)
        val timedOut = AtomicBoolean(false)
        val holder = Thread {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.autoCommit = false
                connection.createStatement().use { it.execute("SELECT public.marketplace_ml_sync_snapshot()") }
                held.countDown()
                assertTrue(release.await(10, TimeUnit.SECONDS))
                connection.commit()
            }
        }
        holder.start()
        assertTrue(held.await(10, TimeUnit.SECONDS))
        val writer = Thread {
            DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
                connection.autoCommit = true
                connection.createStatement().use { statement ->
                    statement.execute("SET lock_timeout = '400ms'")
                    try {
                        statement.executeQuery(
                            "SELECT 1 FROM public.capability_actions WHERE module_code='MARKETPLACE_ML' AND action_code='SYNC' FOR UPDATE",
                        )
                    } catch (_: PSQLException) {
                        timedOut.set(true)
                    }
                }
            }
        }
        writer.start()
        writer.join(5_000)
        assertTrue(timedOut.get())
        release.countDown()
        holder.join(5_000)
        val heldAgain = CountDownLatch(1)
        val releaseAgain = CountDownLatch(1)
        val killId = AtomicReference<Long?>(null)
        val killError = AtomicReference<Throwable?>(null)
        val holder2 = Thread {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.autoCommit = false
                connection.createStatement().use { it.execute("SELECT public.marketplace_ml_sync_snapshot()") }
                heldAgain.countDown()
                assertTrue(releaseAgain.await(10, TimeUnit.SECONDS))
                connection.commit()
            }
        }
        holder2.start()
        assertTrue(heldAgain.await(10, TimeUnit.SECONDS))
        val killer = Thread {
            try {
                killId.set(
                    capabilities.createKill(
                        actor(),
                        "MARKETPLACE_ML",
                        "SYNC",
                        "ops",
                        "dsp006 freeze",
                        Instant.now().plusSeconds(3600),
                        "DSP006-TICKET",
                        UUID.randomUUID(),
                    ),
                )
            } catch (thrown: Throwable) {
                killError.set(thrown)
            }
        }
        killer.start()
        Thread.sleep(400)
        assertTrue(killer.isAlive)
        releaseAgain.countDown()
        holder2.join(5_000)
        killer.join(8_000)
        assertEquals(null, killError.get())
        val created = killId.get()
        assertTrue(created != null && created > 0L)
        capabilities.removeKill(actor(), created!!, "dsp006 unfreeze", UUID.randomUUID())
    }

    @Test
    fun disableAfterSnapshotDoesNotEmit() {
        val variantId = seedVariant("SKU-DSP006-OFF", 6, 0, 0)
        val accountId = insertAccount("ml-sync-006off", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-006-OFF")
        enableMl()
        try {
            inventory.adjust(variantId, -1, "WEB:dsp006-on", "seed")
            assertEquals(1, stockOutbox(listingId))
            disableMl()
            inventory.adjust(variantId, -1, "WEB:dsp006-off", "after-disable")
            assertEquals(4, available(variantId))
            assertEquals(1, stockOutbox(listingId))
        } finally {
            if (jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MARKETPLACE_ML'", String::class.java) != "DISABLED") {
                disableMl()
            }
        }
    }

    @Test
    fun inverseSkuReserveThreadsDoNotDeadlock() {
        val high = seedVariant("SKU-DSP006-Z", 20, 0, 0)
        val low = seedVariant("SKU-DSP006-A", 20, 0, 0)
        val accountId = insertAccount("ml-sync-006lock", ChannelAccountPurpose.ExternalMlSync.wire)
        insertListing(accountId, high, "MLA-006-Z")
        insertListing(accountId, low, "MLA-006-A")
        enableMl()
        try {
            val errors = AtomicReference<Throwable?>(null)
            val a = Thread {
                try {
                    inventory.reserveAll(
                        UUID.randomUUID(),
                        listOf(InventoryReserveLine(UUID.randomUUID(), high, 1), InventoryReserveLine(UUID.randomUUID(), low, 1)),
                        "WEB:dsp006-inv-a",
                    )
                } catch (thrown: Throwable) {
                    errors.compareAndSet(null, thrown)
                }
            }
            val b = Thread {
                try {
                    inventory.reserveAll(
                        UUID.randomUUID(),
                        listOf(InventoryReserveLine(UUID.randomUUID(), low, 1), InventoryReserveLine(UUID.randomUUID(), high, 1)),
                        "WEB:dsp006-inv-b",
                    )
                } catch (thrown: Throwable) {
                    errors.compareAndSet(null, thrown)
                }
            }
            a.start()
            b.start()
            a.join(15_000)
            b.join(15_000)
            assertEquals(null, errors.get())
            assertEquals(18, available(high))
            assertEquals(18, available(low))
        } finally {
            disableMl()
        }
    }

    @Test
    fun pauseDoesNotLeaveEmittedOnPausedListing() {
        val variantId = seedVariant("SKU-DSP006-PAUSE", 9, 0, 1)
        val accountId = insertAccount("ml-sync-006pause", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-006-PAUSE")
        enableMl()
        try {
            inventory.adjust(variantId, -1, "WEB:dsp006-pause-seed", "seed")
            val errors = AtomicReference<Throwable?>(null)
            val reserver = Thread {
                try {
                    inventory.reserveAll(
                        UUID.randomUUID(),
                        listOf(InventoryReserveLine(UUID.randomUUID(), variantId, 1)),
                        "WEB:dsp006-pause-res",
                    )
                } catch (thrown: Throwable) {
                    errors.compareAndSet(null, thrown)
                }
            }
            val pauser = Thread {
                try {
                    lifecycle.execute(
                        actor(),
                        ListingLifecycleCommand(accountId, "MLA-006-PAUSE", "", ListingLifecycleAction.Pause),
                    )
                } catch (thrown: Throwable) {
                    errors.compareAndSet(null, thrown)
                }
            }
            reserver.start()
            pauser.start()
            reserver.join(15_000)
            pauser.join(15_000)
            assertEquals(null, errors.get())
            val state = jdbc.queryForObject("SELECT state FROM channel_listings WHERE id=?", String::class.java, listingId)
            val projectionState = jdbc.queryForObject(
                "SELECT projection_state FROM channel_listing_stock_projection WHERE listing_id=?",
                String::class.java,
                listingId,
            )
            if (state == "PAUSED") {
                assertEquals("WITHHELD", projectionState)
            }
        } finally {
            disableMl()
        }
    }

    @Test
    fun multiSkuDeliveryFailureRollsBackOrderAttemptLedgerAndBothLines() {
        val high = seedVariant("SKU-DSP006-RBZ", 7, 0, 1)
        val low = seedVariant("SKU-DSP006-RBA", 5, 0, 1)
        val accountId = insertAccount("ml-sync-006rb", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingHigh = insertListing(accountId, high, "MLA-006-RBZ")
        val listingLow = insertListing(accountId, low, "MLA-006-RBA")
        val order = seedOrderAttempt("DSP006-RB")
        jdbc.execute(
            """
            CREATE OR REPLACE FUNCTION dsp006_fail_stock_delivery() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
            BEGIN
              IF EXISTS (SELECT 1 FROM public.channel_outbox o WHERE o.id = NEW.outbox_id AND o.kind = 'STOCK_DESIRED_CHANGED') THEN
                RAISE EXCEPTION 'DSP006_DELIVERY_FAIL';
              END IF;
              RETURN NEW;
            END;
            ${'$'}${'$'}
            """.trimIndent(),
        )
        jdbc.execute(
            """
            CREATE TRIGGER trg_dsp006_fail_stock_delivery
              BEFORE INSERT ON public.channel_outbox_delivery
              FOR EACH ROW EXECUTE FUNCTION dsp006_fail_stock_delivery()
            """.trimIndent(),
        )
        enableMl()
        try {
            val error = assertThrows(Exception::class.java) {
                transactions.executeWithoutResult {
                    jdbc.update("UPDATE orders SET status='PAID_STOCK_REVIEW', updated_at=now() WHERE id=?", order.orderId)
                    jdbc.update("UPDATE payments SET status='APPROVED', updated_at=now() WHERE id=?", order.paymentId)
                    jdbc.update("UPDATE mp_checkout_attempts SET state='ACCREDITED', updated_at=now() WHERE id=?", order.attemptId)
                    inventory.reserveAll(
                        UUID.randomUUID(),
                        listOf(
                            InventoryReserveLine(UUID.randomUUID(), high, 1),
                            InventoryReserveLine(UUID.randomUUID(), low, 1),
                        ),
                        "WEB:dsp006-rb",
                    )
                }
            }
            assertTrue(
                error.message.orEmpty().contains("DSP006_DELIVERY_FAIL") ||
                    error.cause?.message.orEmpty().contains("DSP006_DELIVERY_FAIL"),
                error.toString(),
            )
            assertEquals("CREATED", jdbc.queryForObject("SELECT status FROM orders WHERE id=?", String::class.java, order.orderId))
            assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM payments WHERE id=?", String::class.java, order.paymentId))
            assertEquals("CREATED", jdbc.queryForObject("SELECT state FROM mp_checkout_attempts WHERE id=?", String::class.java, order.attemptId))
            assertEquals(7, available(high))
            assertEquals(5, available(low))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_reservations WHERE variant_id IN (?,?)", Int::class.java, high, low))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id IN (?,?)", Int::class.java, high, low))
            assertEquals(0, stockOutbox(listingHigh))
            assertEquals(0, stockOutbox(listingLow))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_listing_stock_projection WHERE listing_id IN (?,?)", Int::class.java, listingHigh, listingLow))
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS trg_dsp006_fail_stock_delivery ON public.channel_outbox_delivery")
            jdbc.execute("DROP FUNCTION IF EXISTS dsp006_fail_stock_delivery()")
            disableMl()
        }
    }

    @Test
    fun runtimeLoginAllowsSnapshotDeniesDdlHistoricalDmlAndV3() {
        DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
            connection.autoCommit = true
            connection.createStatement().use { statement ->
                statement.execute("SET search_path = pg_temp, public")
                val photo = statement.executeQuery("SELECT public.marketplace_ml_sync_snapshot()::text").use {
                    assertTrue(it.next())
                    it.getString(1)
                }
                assertTrue(photo.contains("MARKETPLACE_ML"), photo)
                assertFalse(
                    statement.executeQuery(
                        "SELECT has_table_privilege('storecore_runtime','public.module_configurations','UPDATE')",
                    ).use { it.next(); it.getBoolean(1) },
                )
                assertFalse(
                    statement.executeQuery(
                        "SELECT has_table_privilege('storecore_runtime','public.channel_listing_stock_projection','DELETE')",
                    ).use { it.next(); it.getBoolean(1) },
                )
                assertFalse(
                    statement.executeQuery(
                        "SELECT has_function_privilege('storecore_runtime','public.capability_admin_change_configuration(bigint,varchar,integer,varchar,jsonb,uuid,varchar)','EXECUTE')",
                    ).use { it.next(); it.getBoolean(1) },
                )
            }
        }
        assertThrows(PSQLException::class.java) {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.createStatement().use { it.execute("CREATE TABLE public.dsp006_pwn(id int)") }
            }
        }
        assertThrows(PSQLException::class.java) {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.createStatement().use {
                    it.executeUpdate("DELETE FROM public.channel_listing_stock_projection")
                }
            }
        }
        assertThrows(PSQLException::class.java) {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.createStatement().use {
                    it.executeUpdate("UPDATE public.channel_outbox SET payload_redacted='{}'::jsonb")
                }
            }
        }
        val version = jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'",
            Int::class.java,
        )!!
        val denied = assertThrows(Exception::class.java) {
            jdbc.queryForObject(
                "SELECT public.capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)",
                String::class.java,
                adminId,
                "MARKETPLACE_ML",
                version,
                "ACTIVE",
                "{}",
                UUID.randomUUID(),
                "generic-ml",
            )
        }
        assertTrue(
            denied.message.orEmpty().contains("CAPABILITY_ML_GENERIC_DENIED") ||
                denied.cause?.message.orEmpty().contains("CAPABILITY_ML_GENERIC_DENIED"),
            denied.message,
        )
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
    }

    private fun actor() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    private fun available(variantId: Long): Int =
        jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun stockOutbox(listingId: Long): Int =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?",
            Int::class.java,
            listingId,
            ChannelOutboxKind.StockDesiredChanged.wire,
        )!!

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp006','ACTIVE',?) RETURNING id",
            Long::class.java,
            key,
            purpose,
        )!!

    private fun seedVariant(sku: String, available: Int, reserved: Int, safety: Int): Long {
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku,
            sku.lowercase(),
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        jdbc.update(
            "INSERT INTO inventory_balances(variant_id, available_quantity, reserved_quantity, safety_stock) VALUES (?,?,?,?)",
            variantId,
            available,
            reserved,
            safety,
        )
        return variantId
    }

    private fun insertListing(accountId: Long, variantId: Long, externalId: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state) VALUES (?,?,NULL,?,'ACTIVE') RETURNING id",
            Long::class.java,
            accountId,
            externalId,
            variantId,
        )!!

    private data class OrderAttempt(val orderId: Long, val paymentId: Long, val attemptId: Long)

    private fun seedOrderAttempt(tag: String): OrderAttempt {
        val customerId = jdbc.queryForObject(
            "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?, 'Buyer','Dsp006') RETURNING id",
            Long::class.java,
            "dsp006-rb@example.com",
            Argon2PasswordHasher().hash("a-very-long-password".toCharArray()),
        )!!
        val checkoutKey = UUID.randomUUID()
        val requestHash = "b".repeat(64)
        val claimId = jdbc.queryForObject(
            "INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot,state) VALUES (?,?,?,'{}'::jsonb,'COMPLETED') RETURNING id",
            Long::class.java,
            customerId,
            checkoutKey,
            requestHash,
        )!!
        val orderId = jdbc.queryForObject(
            "INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,currency) VALUES (?,?,?,?,?,'CREATED','{}'::jsonb,'{}'::jsonb,10,0,10,'ARS') RETURNING id",
            Long::class.java,
            "DSP006-$tag",
            claimId,
            checkoutKey,
            requestHash,
            customerId,
        )!!
        val paymentId = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,'PENDING',10,'ARS') RETURNING id",
            Long::class.java,
            orderId,
            "dsp006-$tag",
        )!!
        val attemptId = jdbc.queryForObject(
            """INSERT INTO mp_checkout_attempts(
                 order_id,payment_id,attempt_no,external_reference,idempotency_key,request_hash,amount,currency,snapshot,state
               ) VALUES (?,?,1,?,?,?,10,'ARS','{}'::jsonb,'CREATED') RETURNING id""",
            Long::class.java,
            orderId,
            paymentId,
            "dsp006-$tag-ext",
            UUID.randomUUID(),
            "c".repeat(64),
        )!!
        return OrderAttempt(orderId, paymentId, attemptId)
    }

    private fun enableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp006 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp006 restore", UUID.randomUUID())
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
