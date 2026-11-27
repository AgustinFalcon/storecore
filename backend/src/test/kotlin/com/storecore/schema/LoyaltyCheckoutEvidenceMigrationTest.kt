package com.storecore.schema

import org.flywaydb.core.Flyway
import com.storecore.loyalty.domain.LoyaltyReservationState
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.SQLException
import java.util.UUID

class LoyaltyCheckoutEvidenceMigrationTest {
    @Test fun `clean and V43 upgrade retain historical identity and fail closed`() {
        listOf(false, true).forEach { upgrade ->
            PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
                pg.start()
                val jdbc = JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password))
                fun migration(v: String) = Flyway.configure().dataSource(pg.jdbcUrl, pg.username, pg.password).locations("classpath:db/migration").target(v).load()
                var checksums = emptyList<Map<String, Any>>()
                var historicalOrder: Triple<Long, Long, Long>? = null
                if (upgrade) {
                    migration("43").migrate()
                    tx(jdbc) { db -> val pair=issue(db); quote(db,pair.first,pair.second) }
                    historicalOrder = tx(jdbc) { commerceOrder(it) }
                    checksums = jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
                }
                assertEquals("44", migration("44").migrate().targetSchemaVersion.toString())
                assertEquals(checksums, jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank").take(checksums.size))
                if (upgrade) {
                    assertNull(jdbc.queryForObject("SELECT loyalty_creation_xid::text FROM orders WHERE id=?", String::class.java, historicalOrder!!.first))
                    rejectLateOrderEvidence(jdbc, historicalOrder!!)
                    assertNull(jdbc.queryForObject("SELECT cart_fingerprint FROM loyalty_reservations", String::class.java))
                    assertThrows(DataAccessException::class.java) { jdbc.update("UPDATE loyalty_reservations SET cart_fingerprint=?", "a".repeat(64)) }
                    assertThrows(SQLException::class.java) { tx(jdbc) { it.execute("UPDATE loyalty_reservation_states SET state='PAYMENT_PENDING',revision=1") } }
                    assertThrows(DataAccessException::class.java) { jdbc.execute("INSERT INTO loyalty_quote_snapshots SELECT id,'${"a".repeat(64)}','${"b".repeat(64)}','loyalty-policy-v1',0,1,600,60000 FROM loyalty_reservations") }
                }
                profilesAndPrivileges(jdbc)
                migration("44").validate()
                assertEquals(0, migration("44").migrate().migrationsExecuted)
            }
        }
    }

    private fun profilesAndPrivileges(jdbc: JdbcTemplate) {
        val product = jdbc.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Evidence',?,30) RETURNING id", Long::class.java, UUID.randomUUID().toString())!!
        val variant = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Evidence') RETURNING id", Long::class.java, product, UUID.randomUUID().toString())!!
        fun insert(revision: Long, classification: String = "STANDARD", tax: Long = 500) = jdbc.queryForObject("""INSERT INTO catalog_loyalty_price_profiles(variant_id,revision,currency,gross_unit_minor,merchandise_unit_minor,excluded_tax_unit_minor,classification,evidence_kind,source_reference,admin_command_id,recorded_at) VALUES
            (?,?,'ARS',3000,2500,?,?,'MERCHANT_ACCOUNTANT_PROFILE','merchant-ref',?,'2026-11-26T00:00:00Z') RETURNING id""", Long::class.java, variant, revision, tax, classification, UUID.randomUUID())
        insert(1)
        assertThrows(DataAccessException::class.java) { insert(1) }
        assertThrows(DataAccessException::class.java) { insert(3) }
        assertThrows(DataAccessException::class.java) { insert(2, "UNKNOWN") }
        assertThrows(DataAccessException::class.java) { insert(2, tax=499) }
        insert(2)
        assertEquals(2L, jdbc.queryForObject("SELECT revision FROM catalog_loyalty_price_profile_heads WHERE variant_id=?", Long::class.java, variant))
        assertThrows(DataAccessException::class.java) { jdbc.execute("UPDATE catalog_loyalty_price_profiles SET revision=revision") }
        finalEvidence(jdbc, variant)
        unavailableEvidence(jdbc, variant)
        rejectLateOrderEvidence(jdbc, tx(jdbc) { commerceOrder(it, variant) })
        profileRace(jdbc, variant)
        val tables = listOf("catalog_loyalty_price_profiles", "loyalty_quote_snapshots", "loyalty_quote_lines", "loyalty_order_snapshots", "loyalty_order_lines", "loyalty_checkout_bindings")
        tables.forEach { table ->
            listOf("INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER").forEach { privilege ->
                assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime',?,?)", Boolean::class.java, table, privilege)!!)
            }
            assertThrows(DataAccessException::class.java) { jdbc.execute("TRUNCATE $table CASCADE") }
        }
        jdbc.dataSource!!.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET ROLE storecore_runtime")
                tables.forEach { table ->
                    assertEquals("42501", assertThrows(SQLException::class.java) { statement.execute("DELETE FROM public.$table") }.sqlState)
                    statement.execute("SELECT * FROM public.$table")
                }
            }
        }
        assertEquals(0, jdbc.queryForObject("""SELECT count(*) FROM pg_proc WHERE proname IN
            ('loyalty_serialize_profile_revision','loyalty_validate_price_line','loyalty_check_quote_evidence','loyalty_check_order_evidence',
            'loyalty_check_binding_state','loyalty_protect_frozen_order','loyalty_protect_frozen_order_insert','loyalty_require_atomic_evidence_parent','loyalty_check_exact_reservation_evidence','loyalty_protect_order_creation_xid')
            AND (has_function_privilege('storecore_runtime',oid,'EXECUTE') OR prosecdef OR proconfig IS NULL)""", Int::class.java))
        assertFalse(jdbc.queryForObject("SELECT has_sequence_privilege('storecore_runtime','catalog_loyalty_price_profiles_id_seq','USAGE')",Boolean::class.java)!!)
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='LOYALTY'", String::class.java))
    }

    private fun quote(jdbc: JdbcTemplate, wallet: Long, lot: Long, failure: String? = null, exact: Boolean = false): UUID {
        val id = UUID.randomUUID()
        val impossibleTerminal = failure == "over issued terminal"
        if (exact) jdbc.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_fingerprint,cart_revision,wallet_revision,points,created_at,expires_at) VALUES (?,?,? ,0,0,?,'2026-11-26T00:00:00Z','2026-11-26T00:15:00Z')", id, wallet, "a".repeat(64), if (impossibleTerminal) 1001 else 600)
        else jdbc.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_revision,wallet_revision,points,created_at,expires_at) VALUES (?,?,0,0,?,'2026-11-26T00:00:00Z','2026-11-26T00:15:00Z')", id, wallet, if (impossibleTerminal) 1001 else 600)
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

    private fun bindEvidence(jdbc: JdbcTemplate, reservation: UUID, variant: Long, profile: Long, cartItem: Int = 1): Triple<Long,Long,Long> {
        jdbc.update("INSERT INTO loyalty_quote_snapshots VALUES (?,? ,?,'loyalty-policy-v1',0,1,600,60000)", reservation, "a".repeat(64), "b".repeat(64))
        jdbc.update("""INSERT INTO loyalty_quote_lines VALUES (?,1,?,?,3,3,3000001,3000001,9000003,7500003,1500000,7500003,'STANDARD','NONE')""", reservation, variant, profile)
        val customer = jdbc.queryForObject("SELECT w.customer_id FROM loyalty_reservations r JOIN loyalty_wallets w ON w.id=r.wallet_id WHERE r.id=?",Long::class.java,reservation)!!
        val key=UUID.randomUUID()
        val claim=jdbc.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,? ,?,'{}') RETURNING id",Long::class.java,customer,key,"c".repeat(64))!!
        val order=jdbc.queryForObject("""INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total)
            VALUES (?,?,?,?,?,'{}','{}',89400.03,10,89410.03) RETURNING id""",Long::class.java,UUID.randomUUID().toString(),claim,key,"c".repeat(64),customer)!!
        val item=jdbc.queryForObject("""INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,effective_unit_price,subtotal)
            VALUES (?,?,'{}',3,30000.01,30000.01,90000.03) RETURNING id""",Long::class.java,order,variant)!!
        val payment=jdbc.queryForObject("INSERT INTO payments(order_id,external_reference,amount) VALUES (?,?,89410.03) RETURNING id",Long::class.java,order,UUID.randomUUID().toString())!!
        jdbc.update("""INSERT INTO loyalty_order_snapshots VALUES (?,? ,?,'loyalty-policy-v1','AVAILABLE',NULL,?,? ,8940003,1000,8941003,60000,7440003,'2026-11-26T00:01:00Z',0,0)""",order,payment,"a".repeat(64),reservation,"b".repeat(64))
        jdbc.update("""INSERT INTO loyalty_order_lines VALUES (?,?,?,?,?,3,3,3000001,3000001,9000003,7500003,1500000,7500003,60000,8940003,7440003,'STANDARD','NONE')""",order,item,cartItem,variant,profile)
        jdbc.update("INSERT INTO loyalty_checkout_bindings VALUES (?,?,?,'2026-11-26T00:01:00Z')",reservation,order,payment)
        jdbc.update("UPDATE loyalty_reservation_states SET state='PAYMENT_PENDING',revision=1 WHERE reservation_id=?",reservation)
        jdbc.update("INSERT INTO loyalty_reservation_history SELECT id,wallet_id,1,'QUOTED','PAYMENT_PENDING','2026-11-26T00:01:00Z' FROM loyalty_reservations WHERE id=?",reservation)
        return Triple(order,item,payment)
    }

    private fun finalEvidence(jdbc: JdbcTemplate, variant: Long) {
        val profile=jdbc.queryForObject("""INSERT INTO catalog_loyalty_price_profiles(variant_id,revision,currency,gross_unit_minor,merchandise_unit_minor,excluded_tax_unit_minor,classification,evidence_kind,source_reference,admin_command_id,recorded_at) VALUES (?,3,'ARS',3000001,2500001,500000,'STANDARD','MERCHANT_ACCOUNTANT_PROFILE','merchant-final',?,'2026-11-26T00:00:00Z') RETURNING id""",Long::class.java,variant,UUID.randomUUID())!!
        for (invalid in listOf("A".repeat(64),"a".repeat(63),"1")) {
            assertThrows(DataAccessException::class.java) { tx(jdbc) { db ->
                val pair=issue(db)
                db.update("INSERT INTO loyalty_reservations(id,wallet_id,cart_fingerprint,wallet_revision,points,created_at,expires_at) VALUES (?,?,?,0,1,'2026-11-26T00:00:00Z','2026-11-26T00:15:00Z')",UUID.randomUUID(),pair.first,invalid)
            } }
        }
        assertThrows(SQLException::class.java) { tx(jdbc) { db -> val pair=issue(db); quote(db,pair.first,pair.second,exact=true) } }
        val ordersBefore=jdbc.queryForObject("SELECT count(*) FROM orders",Int::class.java)
        assertThrows(SQLException::class.java) {
            tx(jdbc) { db -> val pair=issue(db); val bad=quote(db,pair.first,pair.second,exact=true); bindEvidence(db,bad,variant,profile,cartItem=2) }
        }
        assertEquals(ordersBefore,jdbc.queryForObject("SELECT count(*) FROM orders",Int::class.java))
        lateinit var reservation: UUID
        val result=tx(jdbc) { db ->
            val pair=issue(db); reservation=quote(db,pair.first,pair.second,exact=true)
            // New exact cart identity is immutable from its original insert, never inferred into old rows.
            // Fixture creates original identity directly; historical quote helper remains unchanged.
            bindEvidence(db,reservation,variant,profile)
        }
        val (order,item,payment)=result
        val source=tx(jdbc) { commerceOrder(it, variant) }
        val moveFailure=assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE order_items SET order_id=? WHERE id=?",order,source.second)
        }
        assertEquals("23514",(moveFailure.mostSpecificCause as SQLException).sqlState)
        assertEquals(source.first,jdbc.queryForObject("SELECT order_id FROM order_items WHERE id=?",Long::class.java,source.second))
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM order_items WHERE order_id=?",Int::class.java,order))
        assertEquals(1,jdbc.queryForObject("""SELECT count(*) FROM loyalty_order_lines l JOIN order_items i
            ON i.id=l.order_item_id AND i.order_id=l.order_id WHERE l.order_id=?""",Int::class.java,order))
        assertThrows(DataAccessException::class.java) {
            jdbc.update("""INSERT INTO loyalty_order_lines SELECT order_id,order_item_id,cart_item_id+10,variant_id,profile_id,profile_revision,
                quantity,original_unit_minor,effective_unit_minor,gross_minor,merchandise_minor,excluded_tax_minor,eligible_minor,allocated_discount_minor,
                payable_minor,final_earning_minor,classification,existing_discount_state FROM loyalty_order_lines WHERE order_id=?""",order)
        }
        assertEquals(600L,jdbc.queryForObject("SELECT sum(held) FROM loyalty_lot_partitions WHERE wallet_id=(SELECT wallet_id FROM loyalty_reservations WHERE id=?)",Long::class.java,reservation))
        listOf("UPDATE orders SET total=total+1,subtotal=subtotal+1 WHERE id=$order",
            "UPDATE payments SET amount=amount+1 WHERE id=$payment", "UPDATE order_items SET quantity=quantity WHERE id=$item",
            "DELETE FROM loyalty_order_lines WHERE order_id=$order", "UPDATE loyalty_order_snapshots SET discount_minor=discount_minor WHERE order_id=$order").forEach { sql ->
            assertThrows(DataAccessException::class.java) { jdbc.execute(sql) }
        }
        val expiry=jdbc.queryForObject("SELECT loyalty_expire_reservation(?,?,1,?)::text",String::class.java,UUID.randomUUID(),reservation,"d".repeat(64))!!
        assertEquals("INVALID_STATE",com.fasterxml.jackson.databind.ObjectMapper().readTree(expiry).get("outcome").asText())
        jdbc.update("UPDATE orders SET status='PENDING_PAYMENT' WHERE id=?",order)
        jdbc.update("UPDATE payments SET status='APPROVED' WHERE id=?",payment)
        tx(jdbc) { db ->
            db.update("UPDATE loyalty_reservation_states SET state='RECONCILIATION_REQUIRED',revision=2 WHERE reservation_id=?",reservation)
            db.update("INSERT INTO loyalty_reservation_history SELECT id,wallet_id,2,'PAYMENT_PENDING','RECONCILIATION_REQUIRED','2026-11-27T00:00:00Z' FROM loyalty_reservations WHERE id=?",reservation)
        }
        assertThrows(DataAccessException::class.java) { jdbc.update("UPDATE loyalty_reservation_states SET state='EXPIRED',revision=3 WHERE reservation_id=?",reservation) }
        assertEquals(600L,jdbc.queryForObject("SELECT sum(held) FROM loyalty_lot_partitions WHERE wallet_id=(SELECT wallet_id FROM loyalty_reservations WHERE id=?)",Long::class.java,reservation))
    }
    private fun unavailableEvidence(jdbc: JdbcTemplate, variant: Long) {
        val order=tx(jdbc) { db ->
            val customer=db.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','No','Loyalty') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.test")!!
            val key=UUID.randomUUID()
            val claim=db.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id",Long::class.java,customer,key,"c".repeat(64))!!
            val id=db.queryForObject("""INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,buyer_snapshot,checkout_snapshot,subtotal,total)
                VALUES (?,?,?,?,?,'{}','{}',30,30) RETURNING id""",Long::class.java,UUID.randomUUID().toString(),claim,key,"c".repeat(64),customer)!!
            db.update("INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,effective_unit_price,subtotal) VALUES (?,?,'{}',1,30,30,30)",id,variant)
            val payment=db.queryForObject("INSERT INTO payments(order_id,external_reference,amount) VALUES (?,?,30) RETURNING id",Long::class.java,id,UUID.randomUUID().toString())!!
            db.update("""INSERT INTO loyalty_order_snapshots VALUES (?,?,?,'loyalty-policy-v1','UNAVAILABLE','MISSING_PROFILE',NULL,NULL,3000,0,3000,0,NULL,'2026-11-26T00:01:00Z',0,NULL)""",id,payment,"a".repeat(64))
            id
        }
        assertEquals("MISSING_PROFILE",jdbc.queryForObject("SELECT unavailable_reason FROM loyalty_order_snapshots WHERE order_id=?",String::class.java,order))
        assertThrows(DataAccessException::class.java) { jdbc.update("UPDATE loyalty_order_snapshots SET unavailable_reason='UNKNOWN' WHERE order_id=?",order) }
        val source = tx(jdbc) { commerceOrder(it, variant) }
        val frozenCount = jdbc.queryForObject("SELECT count(*) FROM order_items WHERE order_id=?", Int::class.java, order)
        val error = assertThrows(DataAccessException::class.java) {
            jdbc.update("UPDATE order_items SET order_id=? WHERE id=?", order, source.second)
        }
        assertEquals("23514", (error.mostSpecificCause as SQLException).sqlState)
        assertEquals(source.first, jdbc.queryForObject("SELECT order_id FROM order_items WHERE id=?", Long::class.java, source.second))
        assertEquals(frozenCount, jdbc.queryForObject("SELECT count(*) FROM order_items WHERE order_id=?", Int::class.java, order))
    }

    private fun commerceOrder(db: JdbcTemplate, variantId: Long? = null): Triple<Long, Long, Long> {
        val variant = variantId ?: run {
            val product = db.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Historical',?,30) RETURNING id", Long::class.java, UUID.randomUUID().toString())!!
            db.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Historical') RETURNING id", Long::class.java, product, UUID.randomUUID().toString())!!
        }
        val customer = db.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','Historical','Order') RETURNING id", Long::class.java, "${UUID.randomUUID()}@example.test")!!
        val key = UUID.randomUUID()
        val claim = db.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id", Long::class.java, customer, key, "c".repeat(64))!!
        val order = db.queryForObject("""INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,buyer_snapshot,checkout_snapshot,subtotal,total)
            VALUES (?,?,?,?,?,'{}','{}',30,30) RETURNING id""", Long::class.java, UUID.randomUUID().toString(), claim, key, "c".repeat(64), customer)!!
        val item = db.queryForObject("INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,effective_unit_price,subtotal) VALUES (?,?,'{}',1,30,30,30) RETURNING id", Long::class.java, order, variant)!!
        val payment = db.queryForObject("INSERT INTO payments(order_id,external_reference,amount) VALUES (?,?,30) RETURNING id", Long::class.java, order, UUID.randomUUID().toString())!!
        return Triple(order, item, payment)
    }

    private fun rejectLateOrderEvidence(jdbc: JdbcTemplate, result: Triple<Long, Long, Long>) {
        val (order, _, payment) = result
        val marker=jdbc.queryForObject("SELECT loyalty_creation_xid::text FROM orders WHERE id=?",String::class.java,order)
        val markerError=assertThrows(DataAccessException::class.java) { jdbc.update("UPDATE orders SET loyalty_creation_xid=pg_current_xact_id() WHERE id=?", order) }
        assertEquals("23514",(markerError.mostSpecificCause as SQLException).sqlState)
        val error = assertThrows(DataAccessException::class.java) { tx(jdbc) { db ->
            db.update("UPDATE orders SET status=status WHERE id=?", order)
            assertEquals(marker,db.queryForObject("SELECT loyalty_creation_xid::text FROM orders WHERE id=?",String::class.java,order))
            db.update("""INSERT INTO loyalty_order_snapshots VALUES (?,?,?,'loyalty-policy-v1','UNAVAILABLE','MISSING_PROFILE',NULL,NULL,3000,0,3000,0,NULL,'2026-11-26T00:01:00Z',0,NULL)""", order, payment, "a".repeat(64))
        } }
        assertEquals("23514", (error.mostSpecificCause as SQLException).sqlState)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM loyalty_order_snapshots WHERE order_id=?", Int::class.java, order))
        assertEquals(marker,jdbc.queryForObject("SELECT loyalty_creation_xid::text FROM orders WHERE id=?",String::class.java,order))
    }

    private fun profileRace(jdbc: JdbcTemplate, variant: Long) {
        val executor=java.util.concurrent.Executors.newSingleThreadExecutor()
        jdbc.dataSource!!.connection.use { first ->
            first.autoCommit=false
            val sql="INSERT INTO catalog_loyalty_price_profiles(variant_id,revision,currency,gross_unit_minor,merchandise_unit_minor,excluded_tax_unit_minor,classification,evidence_kind,source_reference,admin_command_id,recorded_at) VALUES (?,4,'ARS',3000001,2500001,500000,'STANDARD','MERCHANT_ACCOUNTANT_PROFILE','race',?,'2026-11-26T00:00:00Z')"
            JdbcTemplate(SingleConnectionDataSource(first,true)).update(sql,variant,UUID.randomUUID())
            val started=java.util.concurrent.CountDownLatch(1)
            try {
                val second=executor.submit<Int> { started.countDown(); jdbc.update(sql,variant,UUID.randomUUID()) }
                assertTrue(started.await(5,java.util.concurrent.TimeUnit.SECONDS))
                assertThrows(java.util.concurrent.TimeoutException::class.java) { second.get(200,java.util.concurrent.TimeUnit.MILLISECONDS) }
                first.commit()
                assertThrows(java.util.concurrent.ExecutionException::class.java) { second.get(5,java.util.concurrent.TimeUnit.SECONDS) }
                assertEquals(4L,jdbc.queryForObject("SELECT revision FROM catalog_loyalty_price_profile_heads WHERE variant_id=?",Long::class.java,variant))
            } finally { first.rollback(); executor.shutdownNow() }
        }
    }

    private fun <T> tx(jdbc: JdbcTemplate, block: (JdbcTemplate) -> T): T = jdbc.dataSource!!.connection.use { c ->
        c.autoCommit=false
        try { val result=block(JdbcTemplate(SingleConnectionDataSource(c,true))); c.commit(); result }
        catch (error: Throwable) { c.rollback(); throw error }
    }
}
