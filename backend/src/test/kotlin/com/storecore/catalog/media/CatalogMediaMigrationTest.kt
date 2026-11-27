package com.storecore.catalog.media

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.sql.SQLException
import java.sql.DriverManager
import java.sql.Connection

class CatalogMediaMigrationTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic @BeforeAll fun start() = postgres.start()
        @JvmStatic @AfterAll fun stop() = postgres.stop()

        private fun flyway(url: String, target: String? = null): Flyway =
            Flyway.configure().dataSource(url, postgres.username, postgres.password)
                .locations("classpath:db/migration").apply { if (target != null) target(target) }.load()

        private fun database(name: String): String {
            postgres.createConnection("").use { connection -> connection.createStatement().use { it.execute("CREATE DATABASE $name") } }
            return postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/$name"
        }

        private fun jdbc(url: String) = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
    }

    @Test fun `V27 upgrades every legal legacy image deterministically without truncating galleries`() {
        val url = database("media_upgrade_${UUID.randomUUID().toString().replace("-", "")}")
        flyway(url, "26").migrate()
        val sql = jdbc(url)
        val user = user(sql, "legacy@example.test")
        assertTrue(user > 0)
        val product = product(sql, "x".repeat(200), "legacy-gallery")
        val ids = (0 until 25).map { index ->
            sql.queryForObject(
                "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,?,0,false) RETURNING id",
                Long::class.java,
                product,
                "https://legacy.example/$index",
            )!!
        }
        val preserved = sql.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank")

        val result = flyway(url).migrate()

        assertEquals("42", result.targetSchemaVersion.toString())
        assertEquals(preserved, sql.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success AND version::int<=26 ORDER BY installed_rank"))
        assertEquals(25, sql.queryForObject("SELECT count(*) FROM product_images WHERE product_id=?", Int::class.java, product))
        assertEquals((0 until 25).toList(), sql.queryForList("SELECT sort_order FROM product_images WHERE product_id=? ORDER BY sort_order", Int::class.java, product))
        assertEquals(ids.first(), sql.queryForObject("SELECT id FROM product_images WHERE product_id=? AND is_primary", Long::class.java, product))
        assertEquals(1, sql.queryForObject("SELECT count(*) FROM product_images WHERE product_id=? AND is_primary", Int::class.java, product))
        assertEquals(setOf("LEGACY_URL"), sql.queryForList("SELECT DISTINCT source_kind FROM product_images WHERE product_id=?", String::class.java, product).toSet())
        assertEquals(180, sql.queryForObject("SELECT char_length(alt_text) FROM product_images WHERE id=?", Int::class.java, ids.first()))
        assertEquals(3, sql.queryForObject("SELECT version FROM catalog_schema_compatibility_version WHERE singleton", Int::class.java))
        flyway(url).validate()
        assertEquals(0, flyway(url).migrate().migrationsExecuted)
    }

    @Test fun `V27 preserves an existing primary and constrains ownership states associations and runtime access`() {
        val url = database("media_contract_${UUID.randomUUID().toString().replace("-", "")}")
        flyway(url, "26").migrate()
        val sql = jdbc(url)
        val owner = user(sql, "owner@example.test")
        val foreignOwner = user(sql, "foreign@example.test")
        val product = product(sql, "Taladro", "media-product")
        val otherProduct = product(sql, "Amoladora", "media-other")
        val variant = variant(sql, product, "MEDIA-VARIANT")
        val preservedPrimary = sql.queryForObject(
            "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/primary',9,true) RETURNING id",
            Long::class.java,
            product,
        )!!
        sql.update("INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/first',0,false)", product)

        flyway(url).migrate()

        assertEquals(preservedPrimary, sql.queryForObject("SELECT id FROM product_images WHERE product_id=? AND is_primary", Long::class.java, product))
        val draft = UUID.randomUUID()
        sql.update(
            "INSERT INTO catalog_media_drafts(id,owner_user_id,target_product_id,expires_at) VALUES (?,?,?,clock_timestamp()+interval '1 hour')",
            draft, owner, product,
        )
        val asset = UUID.randomUUID()
        val upload = UUID.randomUUID()
        sql.update(
            """INSERT INTO media_assets(id,draft_id,owner_user_id,upload_id,original_sha256,normalized_sha256,format,width,height,normalized_size,state,provider_kind,provider_key,created_by)
               VALUES (?,?,?,?,?,?, 'WEBP',800,600,1024,'STORED_PRIVATE','TEST_STUB','catalog/aa/object',?)""",
            asset, draft, owner, upload, "a".repeat(64), "b".repeat(64), owner,
        )
        sql.update(
            """INSERT INTO media_upload_commands(draft_id,owner_user_id,upload_id,original_hash,normalized_hash,asset_id,deterministic_key)
               VALUES (?,?,?,?,?,?,?)""",
            draft, owner, upload, "a".repeat(64), "b".repeat(64), asset, "catalog/aa/object",
        )
        val managedImage = sql.queryForObject(
            """INSERT INTO product_images(product_id,url,sort_order,is_primary,media_asset_id,source_kind,alt_text)
               VALUES (?,NULL,2,false,?,'MANAGED','Taladro de frente') RETURNING id""",
            Long::class.java,
            product,
            asset,
        )!!
        val otherImage = sql.queryForObject(
            "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/other',0,true) RETURNING id",
            Long::class.java,
            otherProduct,
        )!!
        assertEquals("MANAGED", sql.queryForObject("SELECT source_kind FROM product_images WHERE id=?", String::class.java, managedImage))
        sql.update(
            "INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES (?,?,?,?,true)",
            product, variant, preservedPrimary, 0,
        )

        reject { sql.update("UPDATE catalog_media_drafts SET state='FUTURE' WHERE id=?", draft) }
        reject { sql.update("UPDATE media_assets SET state='FUTURE' WHERE id=?", asset) }
        reject { sql.update("UPDATE media_upload_commands SET state='COMPLETED',result='{}'::jsonb WHERE draft_id=? AND upload_id=?", draft, upload) }
        reject { sql.update("UPDATE media_upload_commands SET state='FAILED',result='{}'::jsonb WHERE draft_id=? AND upload_id=?", draft, upload) }
        reject {
            sql.update(
                "INSERT INTO catalog_media_drafts(id,owner_user_id,target_product_id,expires_at,state) VALUES (?,?,?,clock_timestamp()+interval '1 hour','OPEN')",
                UUID.randomUUID(), foreignOwner, product,
            )
            sql.update("UPDATE media_assets SET owner_user_id=? WHERE id=?", foreignOwner, asset)
        }

        val repeatableProduct = product(sql, "RR producto", "rr-product")
        val repeatableProductPrimary = sql.queryForObject(
            "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/rr-primary',0,true) RETURNING id",
            Long::class.java,
            repeatableProduct,
        )!!
        DriverManager.getConnection(url, postgres.username, postgres.password).use { deletePrimary ->
            DriverManager.getConnection(url, postgres.username, postgres.password).use { insertSecondary ->
                deletePrimary.autoCommit = false
                insertSecondary.autoCommit = false
                deletePrimary.prepareStatement("DELETE FROM product_images WHERE id=?").use {
                    it.setLong(1, otherImage)
                    it.executeUpdate()
                }
                insertSecondary.prepareStatement(
                    "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/concurrent',1,false)",
                ).use {
                    it.setLong(1, otherProduct)
                    it.executeUpdate()
                }
                insertSecondary.createStatement().use { it.execute("SET CONSTRAINTS trg_product_images_exact_primary IMMEDIATE") }
                insertSecondary.commit()
                assertThrows(SQLException::class.java) { deletePrimary.commit() }
                deletePrimary.rollback()
            }
        }
        assertEquals(1, sql.queryForObject("SELECT count(*) FROM product_images WHERE product_id=? AND is_primary", Int::class.java, otherProduct))

        DriverManager.getConnection(url, postgres.username, postgres.password).use { deletePrimary ->
            DriverManager.getConnection(url, postgres.username, postgres.password).use { insertSecondary ->
                deletePrimary.autoCommit = false
                insertSecondary.autoCommit = false
                deletePrimary.prepareStatement("DELETE FROM variant_images WHERE variant_id=? AND product_image_id=?").use {
                    it.setLong(1, variant)
                    it.setLong(2, preservedPrimary)
                    it.executeUpdate()
                }
                insertSecondary.prepareStatement(
                    "INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES (?,?,?,?,false)",
                ).use {
                    it.setLong(1, product)
                    it.setLong(2, variant)
                    it.setLong(3, managedImage)
                    it.setInt(4, 1)
                    it.executeUpdate()
                }
                insertSecondary.createStatement().use { it.execute("SET CONSTRAINTS trg_variant_images_exact_primary IMMEDIATE") }
                insertSecondary.commit()
                assertThrows(SQLException::class.java) { deletePrimary.commit() }
                deletePrimary.rollback()
            }
        }
        assertEquals(1, sql.queryForObject("SELECT count(*) FROM variant_images WHERE variant_id=? AND is_primary", Int::class.java, variant))

        DriverManager.getConnection(url, postgres.username, postgres.password).use { deletePrimary ->
            DriverManager.getConnection(url, postgres.username, postgres.password).use { insertSecondary ->
                deletePrimary.autoCommit = false
                insertSecondary.autoCommit = false
                deletePrimary.transactionIsolation = Connection.TRANSACTION_REPEATABLE_READ
                insertSecondary.transactionIsolation = Connection.TRANSACTION_REPEATABLE_READ
                deletePrimary.prepareStatement("DELETE FROM product_images WHERE id=?").use {
                    it.setLong(1, repeatableProductPrimary)
                    it.executeUpdate()
                }
                insertSecondary.prepareStatement(
                    "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/concurrent-rr',2,false)",
                ).use {
                    it.setLong(1, repeatableProduct)
                    it.executeUpdate()
                }
                insertSecondary.createStatement().use { it.execute("SET CONSTRAINTS trg_product_images_exact_primary IMMEDIATE") }
                insertSecondary.commit()
                val failure = assertThrows(SQLException::class.java) { deletePrimary.commit() }
                assertEquals("40001", failure.sqlState)
                deletePrimary.rollback()
            }
        }
        assertEquals(1, sql.queryForObject("SELECT count(*) FROM product_images WHERE product_id=? AND is_primary", Int::class.java, repeatableProduct))

        val repeatableVariantProduct = product(sql, "RR variante", "rr-variant")
        val repeatableVariant = variant(sql, repeatableVariantProduct, "RR-VARIANT")
        val repeatableVariantPrimary = sql.queryForObject(
            "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/variant-rr-primary',0,true) RETURNING id",
            Long::class.java,
            repeatableVariantProduct,
        )!!
        val repeatableVariantSecondary = sql.queryForObject(
            "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/variant-rr-secondary',1,false) RETURNING id",
            Long::class.java,
            repeatableVariantProduct,
        )!!
        sql.update(
            "INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES (?,?,?,?,true)",
            repeatableVariantProduct, repeatableVariant, repeatableVariantPrimary, 0,
        )
        DriverManager.getConnection(url, postgres.username, postgres.password).use { deletePrimary ->
            DriverManager.getConnection(url, postgres.username, postgres.password).use { insertSecondary ->
                deletePrimary.autoCommit = false
                insertSecondary.autoCommit = false
                deletePrimary.transactionIsolation = Connection.TRANSACTION_REPEATABLE_READ
                insertSecondary.transactionIsolation = Connection.TRANSACTION_REPEATABLE_READ
                deletePrimary.prepareStatement("DELETE FROM variant_images WHERE variant_id=? AND product_image_id=?").use {
                    it.setLong(1, repeatableVariant)
                    it.setLong(2, repeatableVariantPrimary)
                    it.executeUpdate()
                }
                insertSecondary.prepareStatement(
                    "INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES (?,?,?,?,false)",
                ).use {
                    it.setLong(1, repeatableVariantProduct)
                    it.setLong(2, repeatableVariant)
                    it.setLong(3, repeatableVariantSecondary)
                    it.setInt(4, 1)
                    it.executeUpdate()
                }
                insertSecondary.createStatement().use { it.execute("SET CONSTRAINTS trg_variant_images_exact_primary IMMEDIATE") }
                insertSecondary.commit()
                val failure = assertThrows(SQLException::class.java) { deletePrimary.commit() }
                assertEquals("40001", failure.sqlState)
                deletePrimary.rollback()
            }
        }
        assertEquals(1, sql.queryForObject("SELECT count(*) FROM variant_images WHERE variant_id=? AND is_primary", Int::class.java, repeatableVariant))

        val runtimeDraft = UUID.randomUUID()
        val runtimeUpload = UUID.randomUUID()
        val runtimeAsset = UUID.randomUUID()
        DriverManager.getConnection(url, postgres.username, postgres.password).use { runtime ->
            runtime.autoCommit = false
            runtime.createStatement().use { it.execute("SET ROLE storecore_runtime") }
            runtime.createStatement().use { statement ->
                statement.executeUpdate("INSERT INTO catalog_media_drafts(id,owner_user_id,target_product_id,expires_at) VALUES ('$runtimeDraft',$owner,$product,clock_timestamp()+interval '1 hour')")
                statement.executeUpdate("""INSERT INTO media_assets(id,draft_id,owner_user_id,upload_id,original_sha256,normalized_sha256,format,width,height,normalized_size,created_by)
                    VALUES ('$runtimeAsset','$runtimeDraft',$owner,'$runtimeUpload','${"c".repeat(64)}','${"d".repeat(64)}','JPEG',800,600,2048,$owner)""")
                statement.executeUpdate("""INSERT INTO media_upload_commands(draft_id,owner_user_id,upload_id,original_hash,normalized_hash,asset_id,deterministic_key)
                    VALUES ('$runtimeDraft',$owner,'$runtimeUpload','${"c".repeat(64)}','${"d".repeat(64)}','$runtimeAsset','catalog/runtime/object')""")
                val runtimeImage = statement.executeQuery("INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES ($product,'https://legacy.example/runtime',4,false) RETURNING id").use { result ->
                    assertTrue(result.next())
                    result.getLong(1)
                }
                statement.executeUpdate("INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES ($product,$variant,$runtimeImage,3,false)")
                assertTrue(statement.executeQuery("SELECT version=3 FROM catalog_schema_compatibility_version WHERE singleton").use { it.next() && it.getBoolean(1) })
                assertTrue(runtimeImage > 0)
            }
            runtime.commit()
        }
        DriverManager.getConnection(url, postgres.username, postgres.password).use { runtime ->
            runtime.autoCommit = false
            runtime.createStatement().use { it.execute("SET ROLE storecore_runtime") }
            assertThrows(SQLException::class.java) {
                runtime.createStatement().use { it.executeUpdate("UPDATE catalog_schema_compatibility_version SET version=3 WHERE singleton") }
            }
            runtime.rollback()
        }
        reject {
            sql.update(
                "INSERT INTO variant_images(product_id,variant_id,product_image_id,sort_order,is_primary) VALUES (?,?,?,?,false)",
                product, variant, otherImage, 4,
            )
        }
        val emptyGalleryProduct = product(sql, "Sin portada", "missing-primary")
        reject {
            sql.update(
                "INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,'https://legacy.example/no-primary',0,false)",
                emptyGalleryProduct,
            )
        }

        for (table in listOf("catalog_media_drafts", "media_assets", "media_upload_commands", "media_delete_commands", "variant_images", "product_images")) {
            assertTrue(sql.queryForObject("SELECT has_table_privilege('storecore_runtime', ?, 'SELECT,INSERT,UPDATE,DELETE')", Boolean::class.java, table)!!, table)
        }
        assertTrue(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','catalog_schema_compatibility_version','SELECT')", Boolean::class.java)!!)
        assertFalse(sql.queryForObject("SELECT has_table_privilege('storecore_runtime','catalog_schema_compatibility_version','UPDATE')", Boolean::class.java)!!)
        assertTrue(sql.queryForObject("SELECT has_sequence_privilege('storecore_runtime','product_images_id_seq','USAGE,SELECT')", Boolean::class.java)!!)
        assertTrue(sql.queryForObject("SELECT has_function_privilege('storecore_runtime','catalog_media_owner_exists(bigint)','EXECUTE')", Boolean::class.java)!!)
        assertFalse(sql.queryForObject("SELECT has_function_privilege('public','catalog_media_owner_exists(bigint)','EXECUTE')", Boolean::class.java)!!)
        for (table in listOf("catalog_media_drafts", "media_assets", "media_upload_commands", "media_delete_commands", "variant_images")) {
            assertFalse(sql.queryForObject("SELECT has_table_privilege('public', ?, 'SELECT,INSERT,UPDATE,DELETE')", Boolean::class.java, table)!!, table)
        }
    }

    private fun user(sql: JdbcTemplate, email: String): Long = sql.queryForObject(
        "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','Media','Owner') RETURNING id",
        Long::class.java,
        email,
    )!!

    private fun product(sql: JdbcTemplate, name: String, slug: String): Long = sql.queryForObject(
        "INSERT INTO products(name,slug,base_price,status) VALUES (?,?,100,'ACTIVE') RETURNING id",
        Long::class.java,
        name,
        "$slug-${UUID.randomUUID()}",
    )!!

    private fun variant(sql: JdbcTemplate, product: Long, sku: String): Long = sql.queryForObject(
        "INSERT INTO product_variants(product_id,sku,label) VALUES (?,?, 'Única') RETURNING id",
        Long::class.java,
        product,
        "$sku-${UUID.randomUUID()}",
    )!!

    private fun reject(block: () -> Unit) = assertThrows(DataAccessException::class.java, block)
}
