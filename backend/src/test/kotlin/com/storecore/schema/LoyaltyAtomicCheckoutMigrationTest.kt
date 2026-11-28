package com.storecore.schema

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.loyalty.domain.LoyaltyOutcome
import com.storecore.loyalty.domain.LoyaltyReservationState
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.SQLException
import java.util.concurrent.ExecutionException
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

class LoyaltyAtomicCheckoutMigrationTest {
    @Test fun `concurrent binds have one committed winner and no losing commerce rows`() = withQuote { db, quote ->
        val executor=Executors.newSingleThreadExecutor()
        try {
            var loser: java.util.concurrent.Future<*>? = null
            bind(db,quote,beforeCommit = { pid ->
                loser=executor.submit { bind(db,quote) }
                awaitBlocked(db,pid)
            })
            val failure=assertThrows(ExecutionException::class.java) { loser!!.get(10,TimeUnit.SECONDS) }
            assertTrue(failure.cause!!.message!!.contains("LOYALTY_RESERVATION_CONFLICT"))
            assertEquals(1,db.queryForObject("SELECT count(*) FROM orders WHERE customer_id=?",Int::class.java,quote.actor))
            assertEquals(1,db.queryForObject("SELECT count(*) FROM checkout_idempotency_claims WHERE customer_id=?",Int::class.java,quote.actor))
            assertEquals(1,db.queryForObject("SELECT count(*) FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=?",Int::class.java,quote.actor))
            assertPending(db,quote)
        } finally { executor.shutdownNow() }
    }

    @Test fun `cancel and expiry winners reject a waiting bind without double release`() {
        listOf(false,true).forEach { expiry ->
            withQuote(if(expiry) -1L else null) { db, quote ->
                val executor=Executors.newSingleThreadExecutor()
                try {
                    db.dataSource!!.connection.use { c ->
                        c.autoCommit=false
                        val d=JdbcTemplate(SingleConnectionDataSource(c,true))
                        assertEquals(LoyaltyOutcome.APPLIED,finish(d,quote,expiry))
                        val pid=d.queryForObject("SELECT pg_backend_pid()",Int::class.java)!!
                        val waiting=executor.submit { bind(db,quote) }
                        awaitBlocked(db,pid)
                        c.commit()
                        val failure=assertThrows(ExecutionException::class.java) { waiting.get(10,TimeUnit.SECONDS) }
                        assertTrue(failure.cause!!.message!!.contains("LOYALTY_RESERVATION_CONFLICT"))
                    }
                    assertEquals(if(expiry) LoyaltyReservationState.EXPIRED else LoyaltyReservationState.RELEASED,state(db,quote))
                    assertEquals(0L,db.queryForObject("SELECT sum(held) FROM loyalty_lot_partitions WHERE wallet_id=?",Long::class.java,quote.wallet))
                    assertEquals(1000L,db.queryForObject("SELECT sum(free) FROM loyalty_lot_partitions WHERE wallet_id=?",Long::class.java,quote.wallet))
                    assertNoCheckout(db,quote)
                } finally { executor.shutdownNow() }
            }
        }
    }

    @Test fun `wallet lock wait crossing TTL rejects with fresh database time`() = withQuote(5L) { db, quote ->
        blockedBind(db,quote,"SELECT id FROM loyalty_wallets WHERE id=${quote.wallet} FOR UPDATE") {
            val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
            while(!db.queryForObject("SELECT clock_timestamp()>=expires_at FROM loyalty_reservations WHERE id=?",Boolean::class.java,quote.reservation)!!) {
                assertTrue(System.nanoTime()<deadline,"reservation must reach TTL while checkout is blocked")
                Thread.sleep(20)
            }
        }.also { assertTrue(it.message!!.contains("LOYALTY_RESERVATION_EXPIRED")) }
        assertEquals(LoyaltyReservationState.QUOTED,state(db,quote))
        assertNoCheckout(db,quote)
        assertEquals(100L,db.queryForObject("SELECT sum(held) FROM loyalty_lot_partitions WHERE wallet_id=?",Long::class.java,quote.wallet))
    }

    @Test fun `session revoked while checkout waits for session lock cannot bind`() = withQuote { db, quote ->
        val failure=blockedBind(db,quote,"SELECT id FROM identity_sessions WHERE id='${quote.session}' FOR UPDATE") { locked ->
            locked.update("""UPDATE identity_sessions SET revoked_at=clock_timestamp(),revocation_kind='SYSTEM',
                revocation_correlation_id=?,revoked_reason='Concurrent checkout revocation' WHERE id=?""",UUID.randomUUID(),quote.session)
        }
        val denied=generateSequence(failure) { it.cause }.filterIsInstance<SQLException>().last()
        assertEquals("42501",denied.sqlState)
        assertTrue(denied.message!!.contains("LOYALTY_ACTOR_NOT_AUTHORIZED"),denied.message)
        assertEquals(LoyaltyReservationState.QUOTED,state(db,quote))
        assertNoCheckout(db,quote)
    }

    @Test fun `exhausted wallet revision refuses binding without side effects`() = withQuote { db, quote ->
        // Seed the otherwise unreachable-in-test lifetime boundary; restore its guard before checkout.
        db.execute("ALTER TABLE loyalty_wallets DISABLE TRIGGER trg_loyalty_wallet")
        try { db.update("UPDATE loyalty_wallets SET revision=? WHERE id=?",Long.MAX_VALUE,quote.wallet) }
        finally { db.execute("ALTER TABLE loyalty_wallets ENABLE TRIGGER trg_loyalty_wallet") }
        val failure=assertThrows(org.springframework.dao.DataAccessException::class.java) { bind(db,quote) }
        assertTrue(failure.message!!.contains("LOYALTY_REVISION_EXHAUSTED"))
        assertEquals(Long.MAX_VALUE,db.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?",Long::class.java,quote.wallet))
        assertEquals(LoyaltyReservationState.QUOTED,state(db,quote))
        assertNoCheckout(db,quote)
    }

    @Test fun `pending payment remains held after quote TTL and refuses cancel and expiry`() = withQuote(5L) { db, quote ->
        bind(db,quote)
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(!db.queryForObject("SELECT clock_timestamp()>=expires_at FROM loyalty_reservations WHERE id=?",Boolean::class.java,quote.reservation)!!) {
            assertTrue(System.nanoTime()<deadline)
            Thread.sleep(20)
        }
        assertEquals(LoyaltyOutcome.INVALID_STATE,finish(db,quote,false))
        assertEquals(LoyaltyOutcome.INVALID_STATE,finish(db,quote,true))
        assertPending(db,quote)
    }

    private fun state(db: JdbcTemplate,q: Quote)=LoyaltyReservationState.fromWire(db.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?",String::class.java,q.reservation))
    private fun finish(db: JdbcTemplate,q: Quote,expiry: Boolean): LoyaltyOutcome {
        val result=if(expiry) db.queryForObject("SELECT loyalty_expire_reservation(?,?,0,?)::text",String::class.java,UUID.randomUUID(),q.reservation,"e".repeat(64))!!
        else db.queryForObject("SELECT loyalty_cancel_reservation(?,?,?,?,0,?)::text",String::class.java,q.actor,q.session,UUID.randomUUID(),q.reservation,"f".repeat(64))!!
        return LoyaltyOutcome.fromWire(ObjectMapper().readTree(result).path("outcome").asText())
    }
    private fun assertNoCheckout(db: JdbcTemplate,q: Quote) {
        assertEquals(0,db.queryForObject("SELECT count(*) FROM orders WHERE customer_id=?",Int::class.java,q.actor))
        assertEquals(0,db.queryForObject("SELECT count(*) FROM checkout_idempotency_claims WHERE customer_id=?",Int::class.java,q.actor))
        assertEquals(0,db.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=?",Int::class.java,q.reservation))
    }
    private fun assertPending(db: JdbcTemplate,q: Quote) {
        assertEquals(LoyaltyReservationState.PAYMENT_PENDING,state(db,q))
        assertEquals(1,db.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=?",Int::class.java,q.reservation))
        assertEquals(100L,db.queryForObject("SELECT sum(held) FROM loyalty_lot_partitions WHERE wallet_id=?",Long::class.java,q.wallet))
        assertEquals(2L,db.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?",Long::class.java,q.wallet))
    }
    private fun awaitBlocked(db: JdbcTemplate,pid: Int) {
        val deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10)
        while(!db.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)))",Boolean::class.java,pid)!!) {
            assertTrue(System.nanoTime()<deadline,"checkout must actually wait on the held database lock")
            Thread.sleep(20)
        }
    }
    private fun blockedBind(db: JdbcTemplate,q: Quote,lock: String,whileBlocked: (JdbcTemplate)->Unit): Throwable {
        val executor=Executors.newSingleThreadExecutor()
        try {
            db.dataSource!!.connection.use { c ->
                c.autoCommit=false
                val d=JdbcTemplate(SingleConnectionDataSource(c,true))
                d.queryForList(lock)
                val pid=d.queryForObject("SELECT pg_backend_pid()",Int::class.java)!!
                val waiting=executor.submit { bind(db,q) }
                awaitBlocked(db,pid)
                whileBlocked(d)
                c.commit()
                return assertThrows(ExecutionException::class.java) { waiting.get(10,TimeUnit.SECONDS) }.cause!!
            }
        } finally { executor.shutdownNow() }
    }
    private fun withQuote(ttl: Long? = null,body: (JdbcTemplate,Quote)->Unit) {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
            pg.start()
            Flyway.configure().dataSource(pg.jdbcUrl,pg.username,pg.password).locations("classpath:db/migration").target("45").load().migrate()
            val db=JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl,pg.username,pg.password))
            val actor=db.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','Concurrency','Checkout') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.test")!!
            val session=UUID.randomUUID()
            db.update("""INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
                VALUES (?,'CUSTOMER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",session,actor,"a".repeat(64))
            val product=db.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Concurrency',?,30) RETURNING id",Long::class.java,UUID.randomUUID().toString())!!
            val variant=db.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Concurrency') RETURNING id",Long::class.java,product,UUID.randomUUID().toString())!!
            body(db,createQuote(db,actor,session,variant,ttl))
        }
    }
    @Test fun `clean and V44 upgrade preserve checksums and execution only authority`() {
        listOf(false, true).forEach { upgrade ->
            PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
                pg.start()
                val db = JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password))
                fun flyway(version: String) = Flyway.configure().dataSource(pg.jdbcUrl, pg.username, pg.password)
                    .locations("classpath:db/migration").target(version).load()
                if (upgrade) flyway("44").migrate()
                val original = if (upgrade) db.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank") else emptyList()
                assertEquals("45", flyway("45").migrate().targetSchemaVersion.toString())
                assertEquals(original, db.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank").take(original.size))
                assertEquals(4, db.queryForObject("""SELECT count(*) FROM pg_proc WHERE proname IN
                    ('loyalty_lock_checkout_catalog','loyalty_prepare_checkout','loyalty_freeze_checkout','loyalty_quote_checkout_reservation')
                    AND prosecdef AND proowner='storecore_migrator'::regrole
                    AND proconfig=ARRAY['search_path=pg_catalog, public, pg_temp']
                    AND has_function_privilege('storecore_runtime',oid,'EXECUTE')
                    AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE')""", Int::class.java))
                for (table in listOf("loyalty_wallets", "loyalty_reservations", "loyalty_quote_snapshots", "loyalty_quote_lines", "loyalty_order_snapshots", "loyalty_order_lines", "loyalty_checkout_bindings", "catalog_loyalty_price_profiles")) {
                    for (privilege in listOf("INSERT", "UPDATE", "DELETE", "TRUNCATE"))
                        assertFalse(db.queryForObject("SELECT has_table_privilege('storecore_runtime',?,?)", Boolean::class.java, table, privilege)!!)
                }
                exerciseRuntime(db)
                flyway("45").validate()
                assertEquals(0, flyway("45").migrate().migrationsExecuted)
            }
        }
    }

    private fun exerciseRuntime(db: JdbcTemplate) {
        val actor = db.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','Atomic','Checkout') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.test")!!
        val session = UUID.randomUUID()
        db.update("""INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?,'CUSTOMER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",session,actor,"a".repeat(64))
        val product = db.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Atomic',?,30) RETURNING id",Long::class.java,UUID.randomUUID().toString())!!
        val variant = db.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Atomic') RETURNING id",Long::class.java,product,UUID.randomUUID().toString())!!
        quoteAndBind(db,actor,session,variant)
        db.dataSource!!.connection.use { c ->
            c.autoCommit=false
            val runtime=JdbcTemplate(SingleConnectionDataSource(c,true))
            runtime.execute("SET LOCAL ROLE storecore_runtime")
            runtime.queryForObject("SELECT loyalty_lock_checkout_catalog(?,?,ARRAY[?]::bigint[])::text",String::class.java,actor,session,variant)
            assertEquals(0L,runtime.queryForObject("SELECT loyalty_prepare_checkout(?,?,NULL,NULL,?)",Long::class.java,actor,session,"b".repeat(64)))
            c.rollback()
        }
        // Runtime's narrow function obtains the same strongest parent locks as profile writes.
        val executor=Executors.newSingleThreadExecutor()
        db.dataSource!!.connection.use { c ->
            c.autoCommit=false
            val first=JdbcTemplate(SingleConnectionDataSource(c,true))
            first.execute("SET LOCAL ROLE storecore_runtime")
            first.queryForObject("SELECT loyalty_lock_checkout_catalog(?,?,ARRAY[?]::bigint[])::text",String::class.java,actor,session,variant)
            try {
                val started=java.util.concurrent.CountDownLatch(1)
                val waiting=executor.submit<Int> { started.countDown(); db.update("UPDATE products SET name=name WHERE id=?",product) }
                assertTrue(started.await(5,TimeUnit.SECONDS))
                assertThrows(TimeoutException::class.java) { waiting.get(200,TimeUnit.MILLISECONDS) }
                c.rollback()
                assertEquals(1,waiting.get(5,TimeUnit.SECONDS))
            } finally { c.rollback(); executor.shutdownNow() }
        }
        db.dataSource!!.connection.use { c ->
            c.createStatement().use { s ->
                s.execute("SET ROLE storecore_runtime")
                assertEquals("42501", assertThrows(SQLException::class.java) { s.execute("UPDATE loyalty_wallets SET revision=revision") }.sqlState)
                assertEquals("42501", assertThrows(SQLException::class.java) { s.execute("SELECT loyalty_assert_live_customer_session($actor,'$session')") }.sqlState)
            }
        }
    }

    private data class Quote(val actor: Long, val session: UUID, val variant: Long, val wallet: Long, val reservation: UUID, val lines: String)

    private fun createQuote(db: JdbcTemplate, actor: Long, session: UUID, variant: Long, ttl: Long? = null): Quote {
        val wallet=db.queryForObject("INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id",Long::class.java,actor)!!
        val profile=db.queryForObject("""INSERT INTO catalog_loyalty_price_profiles(variant_id,revision,currency,gross_unit_minor,merchandise_unit_minor,excluded_tax_unit_minor,classification,evidence_kind,source_reference,admin_command_id,recorded_at)
            VALUES (?,1,'ARS',3000,2500,500,'STANDARD','MERCHANT_ACCOUNTANT_PROFILE','test',?,date_trunc('second',clock_timestamp())) RETURNING id""",Long::class.java,variant,UUID.randomUUID())!!
        db.dataSource!!.connection.use { c ->
            c.autoCommit=false
            val d=JdbcTemplate(SingleConnectionDataSource(c,true))
            val source=UUID.randomUUID()
            d.update("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',1000,'2026-01-01T00:00:00Z')",source,wallet,source.toString())
            val ledger=d.queryForObject("INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at) VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',1000,'2026-01-01T00:00:00Z') RETURNING id",Long::class.java,wallet,source)!!
            val lot=d.queryForObject("INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at) VALUES (?,?,1000,'2026-01-01T00:00:00Z','2027-01-01T00:00:00Z') RETURNING id",Long::class.java,wallet,ledger)!!
            d.update("INSERT INTO loyalty_lot_partitions VALUES (?,?,1000,1000,0,0,0,0)",lot,wallet)
            d.update("INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,'ISSUE',1000,'2026-01-01T00:00:00Z')",UUID.randomUUID(),wallet,lot,ledger)
            c.commit()
        }
        val reservation=UUID.randomUUID()
        val lines="""[{"cart_item_id":1,"variant_id":$variant,"profile_id":$profile,"profile_revision":1,"quantity":100,"original_unit_minor":3000,"effective_unit_minor":3000,"gross_minor":300000,"merchandise_minor":250000,"excluded_tax_minor":50000,"eligible_minor":250000,"classification":"STANDARD","existing_discount_state":"NONE"}]"""
        if (ttl != null) {
            // Complete historical evidence, with every production constraint and trigger active.
            db.dataSource!!.connection.use { c ->
                c.autoCommit=false
                val d=JdbcTemplate(SingleConnectionDataSource(c,true))
                d.update("""INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,created_at,expires_at,cart_fingerprint)
                    SELECT ?,?,0,0,100,t-interval '900 seconds',t,? FROM
                    (SELECT date_trunc('second',clock_timestamp())+?*interval '1 second' t) instant""",reservation,wallet,"b".repeat(64),ttl)
                d.update("INSERT INTO loyalty_reservation_allocations SELECT ?,?,lot_id,1,100 FROM loyalty_lot_partitions WHERE wallet_id=?",reservation,wallet,wallet)
                d.update("UPDATE loyalty_lot_partitions SET free=free-100,held=held+100 WHERE wallet_id=?",wallet)
                d.update("INSERT INTO loyalty_reservation_states VALUES (?,?,'QUOTED',0)",reservation,wallet)
                d.update("INSERT INTO loyalty_reservation_history SELECT id,wallet_id,0,NULL,'QUOTED',created_at FROM loyalty_reservations WHERE id=?",reservation)
                d.update("UPDATE loyalty_wallets SET revision=1 WHERE id=?",wallet)
                d.update("INSERT INTO loyalty_quote_snapshots(reservation_id,cart_fingerprint,snapshot_hash,policy_version,wallet_revision_before,wallet_revision_after,selected_points,discount_minor) VALUES (?,?,?,'loyalty-policy-v1',0,1,100,10000)",reservation,"b".repeat(64),"d".repeat(64))
                d.update("""INSERT INTO loyalty_quote_lines(reservation_id,cart_item_id,variant_id,profile_id,profile_revision,quantity,original_unit_minor,effective_unit_minor,gross_minor,merchandise_minor,excluded_tax_minor,eligible_minor,classification,existing_discount_state)
                    VALUES (?,1,?,?,1,100,3000,3000,300000,250000,50000,250000,'STANDARD','NONE')""",reservation,variant,profile)
                c.commit()
            }
            return Quote(actor,session,variant,wallet,reservation,lines)
        }
        db.dataSource!!.connection.use { c ->
            c.autoCommit=false
            val d=JdbcTemplate(SingleConnectionDataSource(c,true))
            d.execute("SET LOCAL ROLE storecore_runtime")
            val result=d.queryForObject("SELECT loyalty_quote_checkout_reservation(?,?,?,?,?,0,0,100,250000,false,?,?,?,?::jsonb)::text",String::class.java,
                actor,session,UUID.randomUUID(),reservation,wallet,"c".repeat(64),"b".repeat(64),"d".repeat(64),lines)!!
            assertEquals(LoyaltyOutcome.APPLIED,LoyaltyOutcome.fromWire(ObjectMapper().readTree(result).path("outcome").asText()))
            c.commit()
        }
        return Quote(actor,session,variant,wallet,reservation,lines)
    }

    private fun bind(db: JdbcTemplate, quote: Quote, commit: Boolean = true, beforeCommit: (Int)->Unit = {}) = db.dataSource!!.connection.use { c ->
            val (actor,session,variant,_,reservation,lines)=quote
            c.autoCommit=false
            val d=JdbcTemplate(SingleConnectionDataSource(c,true))
            d.execute("SET LOCAL ROLE storecore_runtime")
            assertEquals(10000L,d.queryForObject("SELECT loyalty_prepare_checkout(?,?,?,0,?)",Long::class.java,actor,session,reservation,"b".repeat(64)))
            // Commerce writes use the existing checkout authority; V45 grants only loyalty execution.
            d.execute("RESET ROLE")
            val key=UUID.randomUUID()
            val claim=d.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id",Long::class.java,actor,key,"e".repeat(64))!!
            val order=d.queryForObject("INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total) VALUES (?,?,?,?,?,'{}','{}',2900,10,2910) RETURNING id",Long::class.java,UUID.randomUUID().toString(),claim,key,"e".repeat(64),actor)!!
            val item=d.queryForObject("INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,effective_unit_price,subtotal) VALUES (?,?,'{}',100,30,30,3000) RETURNING id",Long::class.java,order,variant)!!
            val payment=d.queryForObject("INSERT INTO payments(order_id,external_reference,amount) VALUES (?,?,2910) RETURNING id",Long::class.java,order,UUID.randomUUID().toString())!!
            val finalLines=lines.replace("\"cart_item_id\":1", "\"order_item_id\":$item,\"cart_item_id\":1,\"allocated_discount_minor\":10000,\"payable_minor\":290000,\"final_earning_minor\":240000")
            d.execute("SET LOCAL ROLE storecore_runtime")
            d.queryForObject("SELECT loyalty_freeze_checkout(?,?,?,0,?,?,?,?::jsonb,NULL)::text",String::class.java,actor,session,reservation,order,payment,"b".repeat(64),finalLines)
            beforeCommit(d.queryForObject("SELECT pg_backend_pid()",Int::class.java)!!)
            if(commit) c.commit() else c.rollback()
        }
    private fun quoteAndBind(db: JdbcTemplate, actor: Long, session: UUID, variant: Long) {
        val quote=createQuote(db,actor,session,variant)
        val wallet=quote.wallet
        val reservation=quote.reservation
        assertEquals(1L,db.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?",Long::class.java,wallet))
        // A failure after evidence writing must erase every checkout side effect.
        bind(db,quote,false)
        assertEquals(0,db.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=?",Int::class.java,reservation))
        assertEquals(1L,db.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?",Long::class.java,wallet))
        bind(db,quote,true)
        assertEquals(2L,db.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?",Long::class.java,wallet))
        assertEquals(LoyaltyReservationState.PAYMENT_PENDING,LoyaltyReservationState.fromWire(db.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?",String::class.java,reservation)))
        assertEquals(100L,db.queryForObject("SELECT sum(held) FROM loyalty_lot_partitions WHERE wallet_id=?",Long::class.java,wallet))
    }
}
