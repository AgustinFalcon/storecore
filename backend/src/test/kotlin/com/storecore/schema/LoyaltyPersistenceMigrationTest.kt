package com.storecore.schema

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.function.Executable
import org.springframework.dao.DataAccessException
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.SQLException
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LoyaltyPersistenceMigrationTest {
    @Test fun `clean install and V40 upgrade preserve history and keep loyalty non operative`() {
        listOf(false, true).forEach { upgrade ->
            PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
                pg.start()
                fun flyway(target: String? = null) = Flyway.configure().dataSource(pg.jdbcUrl, pg.username, pg.password)
                    .locations("classpath:db/migration").apply { if (target != null) target(target) }.load()
                val jdbc = JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password))
                var history = emptyList<Map<String, Any>>()
                if (upgrade) {
                    flyway("40").migrate()
                    jdbc.update("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES ('historical@example.test',?,'Historical','Customer')", "${'$'}argon2id${'$'}fixture")
                    history = jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
                }
                assertEquals("41", flyway().migrate().targetSchemaVersion.toString())
                assertEquals((1..41).map(Int::toString), jdbc.queryForList("SELECT version FROM flyway_schema_history ORDER BY installed_rank", String::class.java))
                assertEquals(history, jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank").take(history.size))
                if (upgrade) assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM customers WHERE email='historical@example.test'", Int::class.java))
                assertEquals(true, jdbc.queryForObject("SELECT future_optional FROM capability_modules WHERE module_code='LOYALTY'", Boolean::class.java))
                assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='LOYALTY'", String::class.java))
                exerciseIntegrity(jdbc)
                flyway().validate()
                assertEquals(0, flyway().migrate().migrationsExecuted)
            }
        }
    }

    private fun exerciseIntegrity(jdbc: JdbcTemplate) {
        fun rejects(sql: String) { assertThrows(DataAccessException::class.java) { jdbc.execute(sql) } }
        val customer = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES ('loyalty@example.test',?,'Loyalty','Customer') RETURNING id", Long::class.java, "${'$'}argon2id${'$'}fixture")!!
        val wallet = jdbc.queryForObject("INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id", Long::class.java, customer)!!
        rejects("INSERT INTO loyalty_wallets(customer_id) VALUES ($customer)")
        rejects("INSERT INTO loyalty_wallets(customer_id,owner_realm) VALUES ($customer,'USER')")
        rejects("UPDATE loyalty_wallets SET owner_realm='USER',revision=1 WHERE id=$wallet")
        rejects("INSERT INTO loyalty_wallets(customer_id) VALUES (9223372036854775807)")
        rejects("UPDATE loyalty_wallets SET revision=-1 WHERE id=$wallet")
        rejects("UPDATE loyalty_wallets SET revision=2 WHERE id=$wallet")
        jdbc.update("UPDATE loyalty_wallets SET revision=1 WHERE id=?", wallet)
        val source = UUID.randomUUID()
        val (ledger, lot) = transaction(jdbc) { tx -> issue(tx, wallet, source) }
        assertThrows(DuplicateKeyException::class.java) {
            jdbc.execute("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES ('${UUID.randomUUID()}',$wallet,'ADMIN_ADJUSTMENT','$source','loyalty-policy-v1',10,'2026-11-26T00:00:00Z')")
        }
        rejects("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES ('${UUID.randomUUID()}',$wallet,'UNKNOWN','future','loyalty-policy-v1',10,now())")
        rejects("INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,points,recorded_at) VALUES ($wallet,'$source','MANUAL_ADJUSTMENT',10,now())")
        rejects("UPDATE loyalty_lot_partitions SET free=9 WHERE lot_id=$lot")
        rejects("UPDATE loyalty_lot_partitions SET free=9223372036854775807,expired=9223372036854775807 WHERE lot_id=$lot")
        rejects("UPDATE loyalty_lot_partitions SET free=-1,expired=11 WHERE lot_id=$lot")
        rejects("UPDATE loyalty_lot_partitions SET issued=11,free=11 WHERE lot_id=$lot")
        rejects("INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES ('${UUID.randomUUID()}',$wallet,$lot,$ledger,'HOLD',1,now())")
        val other = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES ('other-loyalty@example.test',?,'Other','Customer') RETURNING id",Long::class.java,"${'$'}argon2id${'$'}fixture")!!
        val otherWallet = jdbc.queryForObject("INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id",Long::class.java,other)!!
        rejects("UPDATE loyalty_lot_partitions SET wallet_id=$otherWallet WHERE lot_id=$lot")
        rejects("INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at) VALUES ($otherWallet,$ledger,10,'2026-11-26','2027-11-26')")
        val command = UUID.randomUUID()
        jdbc.update("INSERT INTO loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash) VALUES (?,'SYSTEM',?,'MATERIALIZE_EXPIRY','WALLET',?,repeat('a',64))",command,customer,wallet.toString())
        assertThrows(DuplicateKeyException::class.java) {
            jdbc.execute("INSERT INTO loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash) VALUES ('$command','SYSTEM',$customer,'MATERIALIZE_EXPIRY','WALLET','$wallet',repeat('b',64))")
        }
        jdbc.update("INSERT INTO loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at) VALUES (?,'APPLIED',200,'{}','{}','2026-11-26T00:00:00Z')",command)
        jdbc.update("INSERT INTO loyalty_audit(id,command_id,wallet_id,recorded_at) VALUES (?,?,?,'2026-11-26T00:00:00Z')",UUID.randomUUID(),command,wallet)
        val evidence = listOf("loyalty_source_applications","loyalty_ledger","loyalty_lots","loyalty_allocation_events","loyalty_command_bindings","loyalty_command_receipts","loyalty_audit")
        fun mutableColumn(table: String): String = when (table) {
            "loyalty_wallets" -> "revision"
            "loyalty_lots" -> "issued"
            "loyalty_lot_partitions" -> "free"
            "loyalty_command_bindings" -> "actor_id"
            "loyalty_command_receipts" -> "outcome"
            "loyalty_audit" -> "wallet_id"
            else -> "points"
        }
        evidence.forEach { table ->
            val column = mutableColumn(table)
            rejects("UPDATE $table SET $column=$column")
            rejects("DELETE FROM $table")
            rejects("TRUNCATE $table CASCADE")
        }
        (evidence + listOf("loyalty_wallets","loyalty_lot_partitions")).forEach { table ->
            listOf("INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER").forEach { privilege ->
                assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime',? ,?)",Boolean::class.java,table,privilege)!!,"$table $privilege")
            }
            jdbc.execute(ConnectionCallback { connection ->
                connection.createStatement().use { statement ->
                    statement.execute("SET ROLE storecore_runtime")
                    try {
                        val column = mutableColumn(table)
                        listOf("INSERT INTO $table DEFAULT VALUES", "UPDATE $table SET $column=$column", "DELETE FROM $table", "TRUNCATE $table CASCADE").forEach { sql ->
                            val error = assertThrows(java.sql.SQLException::class.java) { statement.execute(sql) }
                            assertEquals("42501", error.sqlState)
                        }
                    } finally { statement.execute("RESET ROLE") }
                }
            })
        }
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'loyalty_%' AND (table_name LIKE '%reservation%' OR table_name LIKE '%correction%' OR table_name LIKE '%recovery%')",Int::class.java))
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'loyalty_%' AND (p.prosecdef OR has_function_privilege('storecore_runtime',p.oid,'EXECUTE'))",Int::class.java))
    }

    @Test fun `deferred ledger closure admits exact split and rejects absent under and over allocations`() = database { jdbc ->
        val scenarios = listOf("REVERSE", "EXPIRE").flatMap { kind ->
            listOf(emptyList(), listOf(4L, 5L), listOf(6L, 5L), listOf(5L, 5L)).map { kind to it }
        }
        assertAll(scenarios.map { (kind, allocations) -> Executable {
                val wallet = wallet(jdbc)
                val lots = transaction(jdbc) { tx -> listOf(issue(tx, wallet).second, issue(tx, wallet).second) }
                val effect = {
                    transaction(jdbc) { tx ->
                        val source = UUID.randomUUID()
                        val instant = if (kind == "EXPIRE") "2027-11-26T00:00:00Z" else "2026-11-26T00:00:00Z"
                        tx.update("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?, ?, ?, ?, 'loyalty-policy-v1',10,?::timestamptz)",source,wallet,if(kind=="EXPIRE") "EXPIRY" else "ADMIN_ADJUSTMENT",source.toString(),instant)
                        val ledger = tx.queryForObject("INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at) VALUES (?,?,?,?,10,?::timestamptz) RETURNING id",Long::class.java,wallet,source,if(kind=="EXPIRE") "EXPIRE" else "MANUAL_ADJUSTMENT",if(kind=="EXPIRE") null else "DEBIT",instant)!!
                        allocations.forEachIndexed { index, amount ->
                            tx.update("INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,?,?,?::timestamptz)",UUID.randomUUID(),wallet,lots[index],ledger,kind,amount,instant)
                            val field = if(kind=="EXPIRE") "expired" else "reversed"
                            tx.update("UPDATE loyalty_lot_partitions SET free=free-?, $field=$field+? WHERE lot_id=?",amount,amount,lots[index])
                        }
                    }
                }
                if (allocations.sum() == 10L) assertDoesNotThrow { effect() }
                else {
                    val error = assertThrows(SQLException::class.java) { effect() }
                    assertEquals("23514", error.sqlState)
                    assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM loyalty_ledger WHERE wallet_id=? AND (movement='EXPIRE' OR direction='DEBIT')",Int::class.java,wallet))
                }
        } } + Executable {
            val wallet = wallet(jdbc)
            val absentIssue = assertThrows(SQLException::class.java) {
                transaction(jdbc) { tx -> issue(tx,wallet,withAllocation=false) }
            }
            assertEquals("23514",absentIssue.sqlState)
        })
    }

    @Test fun `deferred lot closure rejects unsupported held redeemed and projection without evidence`() = database { jdbc ->
        assertAll(listOf("reversed", "expired", "held", "redeemed").map { field -> Executable {
            val wallet = wallet(jdbc)
            val lot = transaction(jdbc) { tx -> issue(tx,wallet).second }
            val error = assertThrows(SQLException::class.java) {
                transaction(jdbc) { tx -> tx.update("UPDATE loyalty_lot_partitions SET free=9,$field=1 WHERE lot_id=?",lot) }
            }
            assertEquals("23514",error.sqlState)
            assertEquals(10L,jdbc.queryForObject("SELECT free FROM loyalty_lot_partitions WHERE lot_id=?",Long::class.java,lot))
        } } + Executable {
            val error = assertThrows(SQLException::class.java) {
                transaction(jdbc) { tx -> issue(tx,wallet(jdbc),withPartition=false) }
            }
            assertEquals("23514",error.sqlState)
        })
    }

    @Test fun `concurrent wallet source and command identities converge through database uniqueness`() = database { jdbc ->
        val customer = customer(jdbc)
        val wallets = race(jdbc) { tx, _ ->
            tx.update("INSERT INTO loyalty_wallets(customer_id) VALUES (?) ON CONFLICT(customer_id) DO NOTHING",customer)
            tx.queryForObject("SELECT id FROM loyalty_wallets WHERE customer_id=?",Long::class.java,customer)!!
        }
        assertEquals(wallets[0],wallets[1])
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM loyalty_wallets WHERE customer_id=?",Int::class.java,customer))
        val wallet = wallets[0]
        val sourceKey = UUID.randomUUID().toString()
        val sources = race(jdbc) { tx, _ ->
            tx.update("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',10,'2026-11-26T00:00:00Z') ON CONFLICT(source_type,source_id,policy_version) DO NOTHING",UUID.randomUUID(),wallet,sourceKey)
            tx.queryForObject("SELECT id FROM loyalty_source_applications WHERE source_type='ADMIN_ADJUSTMENT' AND source_id=?",UUID::class.java,sourceKey)!!
        }
        assertEquals(sources[0],sources[1])
        val command = UUID.randomUUID()
        val bindings = race(jdbc) { tx, index ->
            tx.update("INSERT INTO loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash) VALUES (?,'SYSTEM',?,'MATERIALIZE_EXPIRY','WALLET',?,?) ON CONFLICT(command_id) DO NOTHING",command,index+1,wallet.toString(),if(index==0) "a".repeat(64) else "b".repeat(64))
            tx.queryForMap("SELECT actor_id,request_hash FROM loyalty_command_bindings WHERE command_id=?",command)
        }
        assertEquals(bindings[0],bindings[1])
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM loyalty_command_bindings WHERE command_id=?",Int::class.java,command))
    }

    private fun issue(jdbc: JdbcTemplate, wallet: Long, source: UUID = UUID.randomUUID(), withAllocation: Boolean = true, withPartition: Boolean = true): Pair<Long,Long> {
        jdbc.update("INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',10,'2026-11-26T00:00:00Z')",source,wallet,source.toString())
        val ledger=jdbc.queryForObject("INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at) VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',10,'2026-11-26T00:00:00Z') RETURNING id",Long::class.java,wallet,source)!!
        val lot=jdbc.queryForObject("INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at) VALUES (?,?,10,'2026-11-26T00:00:00Z','2027-11-26T00:00:00Z') RETURNING id",Long::class.java,wallet,ledger)!!
        if(withPartition) jdbc.update("INSERT INTO loyalty_lot_partitions(lot_id,wallet_id,issued,free,held,redeemed,expired,reversed) VALUES (?,?,10,10,0,0,0,0)",lot,wallet)
        if(withAllocation) jdbc.update("INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,'ISSUE',10,'2026-11-26T00:00:00Z')",UUID.randomUUID(),wallet,lot,ledger)
        return ledger to lot
    }

    private fun customer(jdbc: JdbcTemplate): Long = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Loyalty','Fixture') RETURNING id",Long::class.java,"${UUID.randomUUID()}@example.test","${'$'}argon2id${'$'}fixture")!!
    private fun wallet(jdbc: JdbcTemplate): Long = jdbc.queryForObject("INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id",Long::class.java,customer(jdbc))!!

    private fun <T> transaction(jdbc: JdbcTemplate, block: (JdbcTemplate) -> T): T = jdbc.dataSource!!.connection.use { connection ->
        connection.autoCommit=false
        try {
            val result=block(JdbcTemplate(SingleConnectionDataSource(connection,true)))
            connection.commit()
            result
        } catch(error: Throwable) { connection.rollback(); throw error }
    }

    private fun <T> race(jdbc: JdbcTemplate, block: (JdbcTemplate, Int) -> T): List<T> {
        val ready=CountDownLatch(2)
        val start=CountDownLatch(1)
        val executor=Executors.newFixedThreadPool(2)
        try {
            val futures=(0..1).map { index -> executor.submit<T> {
                transaction(jdbc) { tx ->
                    ready.countDown()
                    check(start.await(10,TimeUnit.SECONDS))
                    block(tx,index)
                }
            } }
            assertTrue(ready.await(10,TimeUnit.SECONDS))
            start.countDown()
            return futures.map { it.get(15,TimeUnit.SECONDS) }
        } finally { start.countDown(); executor.shutdownNow(); assertTrue(executor.awaitTermination(10,TimeUnit.SECONDS)) }
    }

    private fun database(block: (JdbcTemplate) -> Unit) {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
            pg.start()
            Flyway.configure().dataSource(pg.jdbcUrl,pg.username,pg.password).locations("classpath:db/migration").load().migrate()
            block(JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl,pg.username,pg.password)))
        }
    }
}
