package com.storecore.catalog

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.infrastructure.JdbcProductOptionWriter
import com.storecore.catalog.infrastructure.ProductOptionCommandParser
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.io.ByteArrayInputStream
import java.sql.Connection
import java.sql.DriverManager
import java.sql.SQLException
import java.util.UUID

class CatalogOptionSchemaMigrationTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic @BeforeAll fun migrate() {
            postgres.start()
            flyway().migrate()
        }

        @JvmStatic @AfterAll fun stop() = postgres.stop()

        private fun flyway(url: String = postgres.jdbcUrl, target: String? = null): Flyway =
            Flyway.configure().dataSource(url, postgres.username, postgres.password)
                .locations("classpath:db/migration").apply { if (target != null) target(target) }.load()
    }

    private fun jdbc(url: String = postgres.jdbcUrl) = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))

    @Test fun `clean install creates compatibility marker and leaves legacy products absent without vectors`() {
        val sql = jdbc()
        assertEquals(3, sql.queryForObject("SELECT version FROM catalog_schema_compatibility_version WHERE singleton", Int::class.java))
        val product = product(sql)
        repeat(3) { variant(sql, product, active = it != 2) }
        assertFalse(sql.queryForObject("SELECT has_option_schema FROM products WHERE id=?", Boolean::class.java, product)!!)
        assertEquals(1L, sql.queryForObject("SELECT option_schema_revision FROM products WHERE id=?", Long::class.java, product))
        for (table in listOf("product_option_axes", "product_option_values", "variant_option_values", "variant_option_vectors", "product_option_validation_guard")) {
            assertEquals(0, count(sql, table, product), table)
        }
        flyway().validate()
        assertEquals(0, flyway().migrate().migrationsExecuted)
    }

    @Test fun `runtime role can read compatibility and operate the option aggregate used by invoker triggers`() {
        val sql = jdbc()
        val runtimeTables = listOf(
            "product_option_axes",
            "product_option_values",
            "variant_option_values",
            "variant_option_vectors",
            "product_option_validation_guard",
        )
        runtimeTables.forEach { table ->
            assertTrue(
                sql.queryForObject(
                    "SELECT has_table_privilege('storecore_runtime', ?, 'SELECT,INSERT,UPDATE,DELETE')",
                    Boolean::class.java,
                    table,
                )!!,
                table,
            )
        }
        assertTrue(
            sql.queryForObject(
                "SELECT has_table_privilege('storecore_runtime','catalog_schema_compatibility_version','SELECT')",
                Boolean::class.java,
            )!!,
        )
        assertFalse(
            sql.queryForObject(
                "SELECT has_table_privilege('storecore_runtime','catalog_schema_compatibility_version','INSERT,UPDATE,DELETE')",
                Boolean::class.java,
            )!!,
        )
        assertTrue(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','products','SELECT,UPDATE')", Boolean::class.java)!!)
        assertTrue(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','product_variants','SELECT,INSERT,UPDATE')", Boolean::class.java)!!)
        assertFalse(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','product_variants','DELETE')", Boolean::class.java)!!)
        assertTrue(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','audit_events','INSERT')", Boolean::class.java)!!)
        assertFalse(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','audit_events','SELECT,UPDATE,DELETE')", Boolean::class.java)!!)
        listOf("product_option_axes_id_seq", "product_option_values_id_seq").forEach { sequence ->
            assertTrue(
                sql.queryForObject(
                    "SELECT has_sequence_privilege('storecore_runtime', ?, 'USAGE,SELECT')",
                    Boolean::class.java,
                    sequence,
                )!!,
                sequence,
            )
        }

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET ROLE storecore_runtime")
                assertTrue(
                    statement.executeQuery(
                        "SELECT version=3 FROM catalog_schema_compatibility_version WHERE singleton",
                    ).use { result -> result.next() && result.getBoolean(1) },
                )
                runtimeTables.forEach { table ->
                    statement.executeQuery("SELECT count(*) FROM $table").use { result ->
                        assertTrue(result.next(), table)
                    }
                }
                statement.execute("RESET ROLE")
            }
        }
    }

    @Test fun `real CAS writer clears adds activates deactivates and audits as runtime`() {
        val fixture = configuredProduct()
        val sql = jdbc()
        val skus = sql.queryForList(
            "SELECT sku FROM product_variants WHERE product_id=? ORDER BY id",
            String::class.java,
            fixture.product,
        )
        val firstSku = skus[0]
        val secondSku = skus[1]
        val addedSku = "runtime-added-${UUID.randomUUID()}"

        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { it.execute("SET ROLE storecore_runtime") }
            val writer = JdbcProductOptionWriter(
                JdbcTemplate(SingleConnectionDataSource(connection, true)),
                ObjectMapper().findAndRegisterModules(),
            )
            val parser = ProductOptionCommandParser()
            fun command(raw: String) = parser.parse(ByteArrayInputStream(raw.toByteArray()))

            writer.replace(
                firstSku,
                command(
                    """{"expectedRevision":1,"operation":"Clear","axes":[],"assignments":[],"variantOperations":[{"operation":"AddInactive","sku":"$addedSku","label":"Runtime added"}]}""",
                ),
                1,
            )
            connection.commit()

            writer.replace(
                secondSku,
                command(
                    """{"expectedRevision":2,"operation":"Replace","axes":[{"code":"color","label":"Color","presentation":"SELECT","order":0,"values":[{"code":"red","label":"Red","order":0,"swatchColor":null},{"code":"blue","label":"Blue","order":1,"swatchColor":null}]}],"assignments":[{"variantSku":"$firstSku","optionValues":{"color":"red"}},{"variantSku":"$secondSku","optionValues":{"color":"blue"}},{"variantSku":"$addedSku","optionValues":{"color":"red"}}],"variantOperations":[{"operation":"Deactivate","variantSku":"$firstSku"},{"operation":"Activate","variantSku":"$addedSku"}]}""",
                ),
                1,
            )
            connection.commit()
        }

        assertEquals(3L, sql.queryForObject("SELECT option_schema_revision FROM products WHERE id=?", Long::class.java, fixture.product))
        assertFalse(sql.queryForObject("SELECT active FROM product_variants WHERE sku=?", Boolean::class.java, firstSku)!!)
        assertTrue(sql.queryForObject("SELECT active FROM product_variants WHERE sku=?", Boolean::class.java, addedSku)!!)
        assertEquals(2, sql.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='CATALOG_OPTION_SCHEMA_REPLACED' AND aggregate_id=?", Int::class.java, fixture.product))
    }

    @Test fun `runtime trigger validation cannot be bypassed with a shadow temporary guard`() {
        val fixture = configuredProduct()

        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.autoCommit = false
            try {
                connection.createStatement().use { statement ->
                    statement.execute("SET ROLE storecore_runtime")
                    statement.execute("CREATE TEMP TABLE product_option_validation_guard(product_id BIGINT NOT NULL, transaction_id XID8 NOT NULL, PRIMARY KEY(product_id,transaction_id))")
                }
                connection.prepareStatement("DELETE FROM variant_option_values WHERE variant_id=?").use { statement ->
                    statement.setLong(1, fixture.firstVariant)
                    assertEquals(1, statement.executeUpdate())
                }
                assertThrows(SQLException::class.java) { connection.commit() }
            } finally {
                connection.rollback()
            }
        }

        assertEquals(
            1,
            jdbc().queryForObject(
                "SELECT count(*) FROM variant_option_values WHERE variant_id=?",
                Int::class.java,
                fixture.firstVariant,
            ),
        )
    }

    @Test fun `V23 upgrade preserves all legal legacy data and published migration checksums`() {
        val database = "option_upgrade_" + UUID.randomUUID().toString().replace("-", "")
        postgres.createConnection("").use { connection -> connection.createStatement().use { it.execute("CREATE DATABASE $database") } }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + database
        flyway(url, "23").migrate()
        val sql = jdbc(url)
        val product = product(sql)
        // The old schema has no variant-count limit. Upgrade cannot reject or truncate it.
        sql.update("""INSERT INTO product_variants(product_id,sku,label,attributes,attribute_order,active,base_price_override)
            SELECT ?,? || n::text,repeat('x',200),jsonb_build_object('description',repeat('z',1000),'option-looking-key','legacy'),
                   ARRAY['option-looking-key','description'],n%2=0,123.45 FROM generate_series(1,1001) n""", product, UUID.randomUUID().toString())
        sql.update("INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) SELECT id,9,2,1 FROM product_variants WHERE product_id=?", product)
        val beforeProduct = sql.queryForMap("SELECT * FROM products WHERE id=?", product)
        // Compare every persisted column, including SQL arrays, by canonical server JSON.
        val beforeVariants = variantDigest(sql, product)
        val beforeBalances = sql.queryForList("SELECT * FROM inventory_balances ORDER BY variant_id")
        val history = sql.queryForList("SELECT installed_rank,version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("41", flyway(url).migrate().targetSchemaVersion.toString())
        assertEquals(history, sql.queryForList("SELECT installed_rank,version,script,checksum FROM flyway_schema_history WHERE version::int<=23 ORDER BY installed_rank"))
        val afterProduct = sql.queryForMap("SELECT * FROM products WHERE id=?", product)
        beforeProduct.forEach { (column, value) -> assertEquals(value, afterProduct[column], column) }
        assertEquals(beforeVariants, variantDigest(sql, product))
        assertEquals(1001, sql.queryForObject("SELECT count(*) FROM product_variants WHERE product_id=?", Int::class.java, product)!!)
        assertEquals(beforeBalances, sql.queryForList("SELECT * FROM inventory_balances ORDER BY variant_id"))
        assertFalse(afterProduct["has_option_schema"] as Boolean)
        assertEquals(1L, afterProduct["option_schema_revision"])
        assertEquals(0, count(sql, "variant_option_vectors", product))
        assertEquals(0, count(sql, "product_option_axes", product))
        assertEquals(0, sql.queryForObject("SELECT count(*) FROM product_images WHERE product_id=?", Int::class.java, product))
        flyway(url).validate()
        assertEquals(0, flyway(url).migrate().migrationsExecuted)
    }

    @Test fun `offline runner upgrades V23 without starting the application`() {
        val database = "option_offline_" + UUID.randomUUID().toString().replace("-", "")
        postgres.createConnection("").use { connection -> connection.createStatement().use { it.execute("CREATE DATABASE $database") } }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + database
        flyway(url, "23").migrate()

        val result = CatalogSchemaMigrationRunner.migrate(url, postgres.username, postgres.password)

        assertEquals("41", result.targetSchemaVersion.toString())
        assertEquals(3, jdbc(url).queryForObject(
            "SELECT version FROM catalog_schema_compatibility_version WHERE singleton",
            Int::class.java,
        ))
    }

    @Test fun `ownership foreign keys reject foreign variants axes and values even for inactive variants`() {
        val sql = jdbc()
        val first = configuredProduct()
        val second = configuredProduct()
        val inactive = variant(sql, first.product, false)
        rejectTransaction { tx -> assignment(tx, first.product, inactive, second.axis, second.firstValue) }
        rejectTransaction { tx -> assignment(tx, second.product, inactive, second.axis, second.firstValue) }
        rejectTransaction { tx -> assignment(tx, first.product, inactive, first.axis, second.firstValue) }
        rejectTransaction { tx -> tx.update("UPDATE product_option_values SET product_id=? WHERE id=?", second.product, first.firstValue) }
        assertEquals(0, sql.queryForObject("SELECT count(*) FROM variant_option_values WHERE variant_id=?", Int::class.java, inactive))
    }

    @Test fun `deferred validation permits complete staging and atomic combination and order swaps`() {
        val fixture = configuredProduct()
        transaction { sql ->
            sql.update("UPDATE product_option_axes SET sort_order=sort_order+1 WHERE id=?", fixture.axis)
            // Both intermediate assignment and sort-order collisions are legal until commit.
            sql.update("UPDATE variant_option_values SET value_id=? WHERE variant_id=?", fixture.secondValue, fixture.firstVariant)
            sql.update("UPDATE variant_option_values SET value_id=? WHERE variant_id=?", fixture.firstValue, fixture.secondVariant)
            sql.update("UPDATE product_option_values SET sort_order=1-sort_order WHERE axis_id=?", fixture.axis)
            sql.update("UPDATE product_option_values SET code=CASE WHEN id=? THEN 'second' ELSE 'first' END WHERE axis_id=?", fixture.firstValue, fixture.axis)
            assertEquals(1, count(sql, "product_option_validation_guard", fixture.product))
        }
        val sql = jdbc()
        assertEquals(2, count(sql, "variant_option_vectors", fixture.product))
        assertEquals("[[\"axis\", \"first\"]]", sql.queryForObject("SELECT vector::text FROM variant_option_vectors WHERE variant_id=?", String::class.java, fixture.firstVariant))
        assertEquals(0, count(sql, "product_option_validation_guard", fixture.product))
    }

    @Test fun `incomplete active assignments and duplicate final combinations reject commit and roll back`() {
        val fixture = configuredProduct()
        val sql = jdbc()
        val vectors = sql.queryForList("SELECT * FROM variant_option_vectors WHERE product_id=? ORDER BY variant_id", fixture.product)
        rejectTransaction { it.update("DELETE FROM variant_option_values WHERE variant_id=?", fixture.firstVariant) }
        rejectTransaction { it.update("UPDATE variant_option_values SET value_id=? WHERE variant_id=?", fixture.secondValue, fixture.firstVariant) }
        assertEquals(vectors, sql.queryForList("SELECT * FROM variant_option_vectors WHERE product_id=? ORDER BY variant_id", fixture.product))
        assertEquals(0, count(sql, "product_option_validation_guard", fixture.product))
    }

    @Test fun `forcing validation then deferring again cannot bypass a second invalid mutation`() {
        val fixture = configuredProduct()
        rejectTransaction { sql ->
            sql.update("UPDATE product_option_axes SET label='Renamed' WHERE id=?", fixture.axis)
            sql.execute("SET CONSTRAINTS ALL IMMEDIATE")
            assertEquals(0, count(sql, "product_option_validation_guard", fixture.product))
            sql.execute("SET CONSTRAINTS ALL DEFERRED")
            sql.update("DELETE FROM variant_option_values WHERE variant_id=?", fixture.firstVariant)
            assertEquals(1, count(sql, "product_option_validation_guard", fixture.product))
        }
        assertEquals("Axis", jdbc().queryForObject("SELECT label FROM product_option_axes WHERE id=?", String::class.java, fixture.axis))
    }

    @Test fun `inactive variants never produce vectors and clearing schema removes every vector`() {
        val fixture = configuredProduct()
        var pending = 0L
        transaction { sql ->
            pending = variant(sql, fixture.product, false)
            assignment(sql, fixture.product, pending, fixture.axis, fixture.firstValue)
        }
        val sql = jdbc()
        assertEquals(0, sql.queryForObject("SELECT count(*) FROM variant_option_vectors WHERE variant_id=?", Int::class.java, pending))
        rejectTransaction { it.update("UPDATE product_variants SET active=true WHERE id=?", pending) }
        transaction { tx ->
            tx.update("DELETE FROM variant_option_values WHERE product_id=?", fixture.product)
            tx.update("DELETE FROM product_option_values WHERE product_id=?", fixture.product)
            tx.update("DELETE FROM product_option_axes WHERE product_id=?", fixture.product)
            tx.update("UPDATE products SET has_option_schema=false WHERE id=?", fixture.product)
        }
        assertEquals(0, count(sql, "variant_option_vectors", fixture.product))
        assertEquals(0, count(sql, "variant_option_values", fixture.product))
        assertEquals(0, count(sql, "product_option_validation_guard", fixture.product))
    }

    @Test fun `presence cardinality and revision bounds fail at the database boundary`() {
        val sql = jdbc()
        val product = product(sql)
        rejectTransaction { it.update("UPDATE products SET has_option_schema=true WHERE id=?", product) }
        rejectTransaction { it.update("UPDATE products SET option_schema_revision=0 WHERE id=?", product) }
        rejectTransaction { it.update("UPDATE products SET option_schema_revision=2147483648 WHERE id=?", product) }
        sql.update("UPDATE products SET option_schema_revision=2147483647 WHERE id=?", product)
        assertEquals(2147483647L, sql.queryForObject("SELECT option_schema_revision FROM products WHERE id=?", Long::class.java, product))
        rejectTransaction { tx ->
            tx.update("UPDATE products SET has_option_schema=true WHERE id=?", product)
            repeat(5) { index ->
                val axis = axis(tx, product, "a$index", index)
                value(tx, product, axis, "v", 0)
            }
        }
        rejectTransaction { tx ->
            tx.update("UPDATE products SET has_option_schema=true WHERE id=?", product)
            axis(tx, product, "empty", 0)
        }
        rejectTransaction { tx ->
            tx.update("UPDATE products SET has_option_schema=true WHERE id=?", product)
            val axis = axis(tx, product, "too-many", 0)
            repeat(51) { value(tx, product, axis, "v$it", it) }
        }
    }

    @Test fun `pending guards cannot be removed and derived vectors cannot be forged`() {
        val fixture = configuredProduct()
        rejectTransaction { sql ->
            sql.update("UPDATE product_option_axes SET label='Changed' WHERE id=?", fixture.axis)
            sql.update("DELETE FROM product_option_validation_guard WHERE product_id=?", fixture.product)
        }
        rejectTransaction { sql ->
            sql.update("UPDATE product_option_axes SET label='Changed' WHERE id=?", fixture.axis)
            sql.update("UPDATE product_option_validation_guard SET transaction_id=pg_current_xact_id() WHERE product_id=?", fixture.product)
        }
        val sql = jdbc()
        val before = sql.queryForList("SELECT * FROM variant_option_vectors WHERE product_id=? ORDER BY variant_id", fixture.product)
        transaction { it.update("UPDATE variant_option_vectors SET vector='[[\"fake\",\"fake\"]]'::jsonb WHERE variant_id=?", fixture.firstVariant) }
        assertEquals(before, sql.queryForList("SELECT * FROM variant_option_vectors WHERE product_id=? ORDER BY variant_id", fixture.product))
        assertEquals(0, count(sql, "product_option_validation_guard", fixture.product))
    }

    @Test fun `SQL enforces canonical option tokens labels presentation and safe optional swatches`() {
        val fixture = configuredProduct()
        for (code in listOf("", "Upper", "two words", "a".repeat(65))) {
            rejectTransaction { it.update("UPDATE product_option_axes SET code=? WHERE id=?", code, fixture.axis) }
        }
        for (label in listOf("", "   ", "x".repeat(81), "control\ntext")) {
            rejectTransaction { it.update("UPDATE product_option_values SET label=? WHERE id=?", label, fixture.firstValue) }
        }
        rejectTransaction { it.update("UPDATE product_option_axes SET sort_order=-1 WHERE id=?", fixture.axis) }
        rejectTransaction { it.update("UPDATE product_option_axes SET presentation='UNKNOWN' WHERE id=?", fixture.axis) }
        rejectTransaction { it.update("UPDATE product_option_values SET swatch_color='#abcdef' WHERE id=?", fixture.firstValue) }
        transaction { it.update("UPDATE product_option_axes SET presentation='SWATCH',code=?,label=? WHERE id=?", "a".repeat(64), "😀".repeat(80), fixture.axis) }
        for (color in listOf("#ABCDEF", "red", "url(x)", "#abc")) {
            rejectTransaction { it.update("UPDATE product_option_values SET swatch_color=? WHERE id=?", color, fixture.firstValue) }
        }
        transaction { it.update("UPDATE product_option_values SET swatch_color='#abcdef' WHERE id=?", fixture.firstValue) }
        val sql = jdbc()
        assertEquals("#abcdef", sql.queryForObject("SELECT swatch_color FROM product_option_values WHERE id=?", String::class.java, fixture.firstValue))
        assertNull(sql.queryForObject("SELECT swatch_color FROM product_option_values WHERE id=?", String::class.java, fixture.secondValue))
    }

    @Test fun `independent child writers must acquire the same parent lock`() {
        val fixture = configuredProduct()
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { owner ->
            owner.autoCommit = false
            try {
                JdbcTemplate(SingleConnectionDataSource(owner, true)).queryForObject("SELECT id FROM products WHERE id=? FOR UPDATE", Long::class.java, fixture.product)
                DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { contender ->
                    contender.autoCommit = false
                    try {
                        contender.createStatement().use { it.execute("SET LOCAL lock_timeout='500ms'") }
                        val error = assertThrows(SQLException::class.java) {
                            contender.prepareStatement("UPDATE product_option_axes SET label='Concurrent' WHERE id=?").use {
                                it.setLong(1, fixture.axis)
                                it.executeUpdate()
                            }
                        }
                        assertEquals("55P03", error.sqlState)
                    } finally { contender.rollback() }
                }
            } finally { owner.rollback() }
        }
        transaction { it.update("UPDATE product_option_axes SET label='After lock' WHERE id=?", fixture.axis) }
        assertEquals("After lock", jdbc().queryForObject("SELECT label FROM product_option_axes WHERE id=?", String::class.java, fixture.axis))
    }

    @Test fun `repeatable read cannot validate sibling changes against an obsolete parent snapshot`() {
        val fixture = configuredProduct()
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { stale ->
            stale.transactionIsolation = Connection.TRANSACTION_REPEATABLE_READ
            stale.autoCommit = false
            try {
                val snapshot = JdbcTemplate(SingleConnectionDataSource(stale, true))
                snapshot.queryForObject("SELECT id FROM products WHERE id=?", Long::class.java, fixture.product)
                transaction { it.update("UPDATE product_option_axes SET label='New snapshot' WHERE id=?", fixture.axis) }
                val error = assertThrows(SQLException::class.java) {
                    stale.prepareStatement("UPDATE product_variants SET active=false WHERE id=?").use {
                        it.setLong(1, fixture.firstVariant)
                        it.executeUpdate()
                    }
                    stale.commit()
                }
                assertEquals("40001", error.sqlState)
            } finally { stale.rollback() }
        }
        assertEquals(2, count(jdbc(), "variant_option_vectors", fixture.product))
    }

    private data class Fixture(val product: Long, val axis: Long, val firstValue: Long, val secondValue: Long, val firstVariant: Long, val secondVariant: Long)

    private fun configuredProduct(): Fixture {
        lateinit var fixture: Fixture
        transaction { sql ->
            val product = product(sql)
            val firstVariant = variant(sql, product)
            val secondVariant = variant(sql, product)
            sql.update("UPDATE products SET has_option_schema=true WHERE id=?", product)
            val axis = axis(sql, product, "axis", 0)
            val first = value(sql, product, axis, "first", 0)
            val second = value(sql, product, axis, "second", 1)
            assignment(sql, product, firstVariant, axis, first)
            assignment(sql, product, secondVariant, axis, second)
            fixture = Fixture(product, axis, first, second, firstVariant, secondVariant)
        }
        return fixture
    }

    private fun product(sql: JdbcTemplate): Long = sql.queryForObject("INSERT INTO products(name,slug,base_price,status) VALUES (?, ?, 12.34, 'ACTIVE') RETURNING id", Long::class.java, "p".repeat(200), UUID.randomUUID().toString())!!
    private fun variant(sql: JdbcTemplate, product: Long, active: Boolean = true): Long = sql.queryForObject("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,'Variant',?) RETURNING id", Long::class.java, product, UUID.randomUUID().toString(), active)!!
    private fun axis(sql: JdbcTemplate, product: Long, code: String, order: Int): Long = sql.queryForObject("INSERT INTO product_option_axes(product_id,code,label,presentation,sort_order) VALUES (?,?,'Axis','SELECT',?) RETURNING id", Long::class.java, product, code, order)!!
    private fun value(sql: JdbcTemplate, product: Long, axis: Long, code: String, order: Int): Long = sql.queryForObject("INSERT INTO product_option_values(product_id,axis_id,code,label,sort_order) VALUES (?,?,?,?,?) RETURNING id", Long::class.java, product, axis, code, "Value $code", order)!!
    private fun assignment(sql: JdbcTemplate, product: Long, variant: Long, axis: Long, value: Long) = sql.update("INSERT INTO variant_option_values(product_id,variant_id,axis_id,value_id) VALUES (?,?,?,?)", product, variant, axis, value)
    private fun count(sql: JdbcTemplate, table: String, product: Long): Int = sql.queryForObject("SELECT count(*) FROM $table WHERE product_id=?", Int::class.java, product)!!
    private fun variantDigest(sql: JdbcTemplate, product: Long): String = sql.queryForObject("SELECT md5(jsonb_agg(to_jsonb(v) ORDER BY id)::text) FROM product_variants v WHERE product_id=?", String::class.java, product)!!

    private fun transaction(action: (JdbcTemplate) -> Unit) {
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.autoCommit = false
            try {
                action(JdbcTemplate(SingleConnectionDataSource(connection, true)))
                connection.commit()
            } catch (error: Throwable) {
                connection.rollback()
                throw error
            }
        }
    }

    private fun rejectTransaction(action: (JdbcTemplate) -> Unit) {
        val error = assertThrows(Exception::class.java) { transaction(action) }
        assertTrue(error is org.springframework.dao.DataAccessException || error is SQLException, error.toString())
    }
}
