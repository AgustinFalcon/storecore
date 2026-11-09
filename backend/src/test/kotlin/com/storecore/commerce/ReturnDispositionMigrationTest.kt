package com.storecore.commerce

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.sql.SQLException

class ReturnDispositionMigrationTest {
    @Test fun `V14 upgrades without inventing historical classifications and enforces immutable partitions`() {
        val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        try {
            postgres.start()
            fun flyway(target: String? = null) = Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").apply { if (target != null) target(target) }.load()
            flyway("14").migrate()
            val jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
            val actor = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('rma-schema@example.test',?, 'RMA','Schema') RETURNING id", Long::class.java, "${'$'}argon2id${'$'}fixture")!!
            val customer = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES ('rma-customer@example.test',?, 'RMA','Customer') RETURNING id", Long::class.java, "${'$'}argon2id${'$'}fixture")!!
            val product = jdbc.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('RMA','rma-schema',100) RETURNING id", Long::class.java)!!
            val variant = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,'rma-schema','RMA') RETURNING id", Long::class.java, product)!!
            val key = UUID.randomUUID()
            val hash = "a".repeat(64)
            val claim = jdbc.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id", Long::class.java, customer, key, hash)!!
            val order = jdbc.queryForObject("INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,buyer_snapshot,checkout_snapshot,subtotal,total) VALUES ('RMA-SCHEMA',?,?,?,?,'{}','{}',200,200) RETURNING id", Long::class.java, claim, key, hash, customer)!!
            val sold = jdbc.queryForObject("INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,effective_unit_price,subtotal) VALUES (?,?,'{}',2,100,100,200) RETURNING id", Long::class.java, order, variant)!!
            val returned = jdbc.queryForObject("INSERT INTO returns(rma_number,order_id,status,inspection_result) VALUES ('RMA-SCHEMA',?,'INSPECTED','RESTOCK') RETURNING id", Long::class.java, order)!!
            val item = jdbc.queryForObject("INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,2) RETURNING id", Long::class.java, returned, sold)!!
            val history = jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
            val legacy = jdbc.queryForList("SELECT id,return_id,order_item_id,quantity,adjustment_ledger_id FROM return_items")
            assertEquals("15", flyway().migrate().targetSchemaVersion.toString())
            assertEquals(history, jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=14 ORDER BY installed_rank"))
            assertEquals(legacy, jdbc.queryForList("SELECT id,return_id,order_item_id,quantity,adjustment_ledger_id FROM return_items"))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM return_items WHERE disposition_command_id IS NOT NULL OR restock_quantity IS NOT NULL", Int::class.java))
            rejectsSql("23514") { jdbc.update("INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,'RMA_RESTOCK','WEB',1,'SCHEMA')", variant, UUID.randomUUID()) }
            rejectsSql("23514") { jdbc.update("INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,'RMA_RESTOCK','INTERNAL',-1,'SCHEMA')", variant, UUID.randomUUID()) }
            val command = jdbc.queryForObject("INSERT INTO rma_disposition_commands(return_id,idempotency_key,request_hash,actor_id,confirmed_at,result) VALUES (?,?,?,?,now(),'{}') RETURNING id", Long::class.java, returned, UUID.randomUUID(), hash, actor)!!
            rejectsSql("23514") { jdbc.update("UPDATE return_items SET disposition_command_id=?,restock_quantity=0,damaged_quantity=1,rejected_quantity=0,damage_reason='FUNCTIONAL' WHERE id=?", command, item) }
            rejectsSql("23514") { jdbc.update("UPDATE return_items SET disposition_command_id=?,restock_quantity=0,damaged_quantity=2,rejected_quantity=0 WHERE id=?", command, item) }
            jdbc.update("UPDATE return_items SET disposition_command_id=?,restock_quantity=0,damaged_quantity=2,rejected_quantity=0,damage_reason='FUNCTIONAL' WHERE id=?", command, item)
            rejectsSql("P0001") { jdbc.update("UPDATE return_items SET damage_reason='OTHER' WHERE id=?", item) }
            rejectsSql("P0001") { jdbc.update("UPDATE rma_disposition_commands SET result='{}' WHERE id=?", command) }
            rejectsSql("23505") { jdbc.update("INSERT INTO rma_disposition_commands(return_id,idempotency_key,request_hash,actor_id,confirmed_at,result) VALUES (?,?,?,?,now(),'{}')", returned, UUID.randomUUID(), hash, actor) }
            flyway().validate()
            assertEquals(0, flyway().migrate().migrationsExecuted)
        } finally { postgres.stop() }
    }
    private fun rejectsSql(state: String, mutation: () -> Unit) {
        val failure = assertThrows(org.springframework.dao.DataAccessException::class.java, mutation)
        val sql = generateSequence<Throwable>(failure) { it.cause }.filterIsInstance<SQLException>().first()
        assertEquals(state, sql.sqlState)
    }
}
