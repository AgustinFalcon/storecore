package com.storecore.commerce

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

class StockAdjustmentMigrationTest {
    @Test fun `clean install and V15 upgrade preserve history and constrain append-only receipts`() {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { postgres ->
            postgres.start()
            fun flyway(target:String?=null)=Flyway.configure().dataSource(postgres.jdbcUrl,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null)target(target) }.load()
            flyway("15").migrate()
            val jdbc=JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password))
            val actor=jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('stock-schema@example.test',?,'Stock','Schema') RETURNING id",Long::class.java,"${'$'}argon2id${'$'}fixture")!!
            val product=jdbc.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Stock schema','stock-schema',1) RETURNING id",Long::class.java)!!
            val variant=jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,'stock-schema','Stock') RETURNING id",Long::class.java,product)!!
            jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) VALUES (?,8,3,1)",variant)
            val history=jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
            val balances=jdbc.queryForList("SELECT * FROM inventory_balances")
            assertEquals("21",flyway().migrate().targetSchemaVersion.toString())
            assertEquals(history,jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=15 ORDER BY installed_rank"))
            assertEquals(balances,jdbc.queryForList("SELECT * FROM inventory_balances"))
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM inventory_adjustment_commands",Int::class.java))
            val key=UUID.randomUUID()
            val result="""{"state":"REJECTED","reason":"BALANCE_MISSING","commandId":"$key","variantId":"$variant","before":null,"after":null,"ledgerId":null,"recordedAt":"2026-11-10T00:00:00Z"}"""
            fun insert(id:UUID=key,state:String="REJECTED",reason:String?="BALANCE_MISSING",payload:String=result)=jdbc.update("INSERT INTO inventory_adjustment_commands(command_id,actor_id,variant_id,request_hash,request_content,state,rejection_reason,recorded_at,result) VALUES (?,?,?,?,'[]',?,?,now(),?::jsonb)",id,actor,variant,"a".repeat(64),state,reason,payload)
            insert()
            assertThrows(org.springframework.dao.DataAccessException::class.java) { insert() }
            assertThrows(org.springframework.dao.DataAccessException::class.java) { insert(UUID.randomUUID(),"UNKNOWN") }
            assertThrows(org.springframework.dao.DataAccessException::class.java) { insert(UUID.randomUUID(),"APPLIED",null) }
            assertThrows(org.springframework.dao.DataAccessException::class.java) { insert(UUID.randomUUID(),payload="{}") }
            assertThrows(org.springframework.dao.DataAccessException::class.java) { jdbc.update("UPDATE inventory_adjustment_commands SET result='{}' WHERE command_id=?",key) }
            assertThrows(org.springframework.dao.DataAccessException::class.java) { jdbc.update("DELETE FROM inventory_adjustment_commands WHERE command_id=?",key) }
            assertTrue(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','inventory_adjustment_commands','SELECT,INSERT')",Boolean::class.java)!!)
            assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','inventory_adjustment_commands','UPDATE')",Boolean::class.java)!!)
            assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','inventory_adjustment_commands','DELETE')",Boolean::class.java)!!)
            flyway().validate();assertEquals(0,flyway().migrate().migrationsExecuted)
        }
    }
}
