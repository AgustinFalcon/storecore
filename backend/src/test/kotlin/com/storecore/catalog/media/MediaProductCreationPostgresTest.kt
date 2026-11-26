package com.storecore.catalog.media

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.ArsAmount
import com.storecore.catalog.domain.ProductStatus
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.JdbcMediaCommandRepository
import com.storecore.catalog.infrastructure.media.JdbcMediaDraftCleanupRepository
import com.storecore.catalog.infrastructure.media.JdbcMediaProductCreationRepository
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.sql.DriverManager
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.*

@Testcontainers(disabledWithoutDocker = true)
class MediaProductCreationPostgresTest {
    companion object {
        @Container @JvmStatic val postgres = PostgreSQLContainer("postgres:16-alpine")
            .withDatabaseName("storecore_media_create").withUsername("storecore").withPassword("storecore")
    }

    @Test fun `atomic create persists aggregate stock media receipt and historical replay`() {
        fixture().use { f ->
            val command = f.command("tool-a", 5)
            val created = assertIs<MediaProductCreationResult.Created>(f.repository.create(command)).snapshot
            assertEquals(1, f.count("products")); assertEquals(1, f.count("product_variants"))
            assertEquals(5, f.jdbc.queryForObject("SELECT available_quantity FROM inventory_balances", Int::class.java))
            assertEquals(1, f.count("inventory_ledger")); assertEquals(1, f.count("product_images"))
            assertEquals("CLAIMED", f.jdbc.queryForObject("SELECT state FROM catalog_media_drafts", String::class.java))
            assertEquals("ATTACHED", f.jdbc.queryForObject("SELECT state FROM media_assets", String::class.java))
            assertIs<MediaProductCreationResult.Replayed>(f.replayInsideOuterTransaction(command))
            assertEquals(1, f.jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='MEDIA_REPLAY_CALLER_COMMITTED'", Int::class.java))
            f.jdbc.update("UPDATE products SET name='Edited after response' WHERE id=?", created.productId.value)
            val replay = assertIs<MediaProductCreationResult.Replayed>(f.repository.create(command)).snapshot
            assertEquals(created, replay)
            assertEquals(1, f.count("products")); assertEquals(1, f.count("inventory_ledger"))
            val changed = f.commandFrom(command, 6)
            assertEquals(MediaProductCreationResult.Conflict, f.repository.create(changed))
            val otherOwner = MediaOwnerId.fromWire(f.jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('other@example.test','${'$'}argon2id${'$'}fixture','Other','Owner') RETURNING id", Long::class.java))!!
            assertEquals(MediaProductCreationResult.ScopeDenied, f.repository.create(f.command("ignored", 5, otherOwner, command.draftId)))
        }
    }

    @Test fun `failure after aggregate writes rolls back everything and preserves staging`() {
        fixture().use { f ->
            val command = f.command("tool-rollback", 3)
            f.jdbc.execute("""CREATE FUNCTION reject_product_create_audit() RETURNS TRIGGER LANGUAGE plpgsql AS ${'$'}${'$'}
                BEGIN IF NEW.event_type='CATALOG_PRODUCT_CREATED_WITH_MEDIA' THEN RAISE EXCEPTION 'simulated audit failure'; END IF; RETURN NEW; END; ${'$'}${'$'}""")
            f.jdbc.execute("CREATE TRIGGER reject_product_create_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_product_create_audit()")
            assertThrows<Exception> { f.repository.create(command) }
            assertEquals(0, f.count("products")); assertEquals(0, f.count("product_variants"))
            assertEquals(0, f.count("inventory_balances")); assertEquals(0, f.count("inventory_ledger"))
            assertEquals(0, f.count("product_images")); assertEquals(0, f.count("catalog_media_product_creation_commands"))
            assertEquals("OPEN", f.jdbc.queryForObject("SELECT state FROM catalog_media_drafts", String::class.java))
            assertEquals("STORED_PRIVATE", f.jdbc.queryForObject("SELECT state FROM media_assets", String::class.java))
            assertEquals("COMPLETED", f.jdbc.queryForObject("SELECT state FROM media_upload_commands", String::class.java))
        }
    }

    @Test fun `expired draft and unavailable asset fail closed without partial product`() {
        fixture().use { f ->
            val expired = f.command("expired", 0)
            f.jdbc.update(
                "UPDATE catalog_media_drafts SET expires_at=GREATEST(clock_timestamp(),created_at)+interval '100 milliseconds' WHERE id=?",
                expired.draftId.value,
            )
            val databaseDeadline = System.nanoTime() + Duration.ofSeconds(10).toNanos()
            while (f.jdbc.queryForObject(
                    "SELECT clock_timestamp() >= expires_at FROM catalog_media_drafts WHERE id=?",
                    Boolean::class.java,
                    expired.draftId.value,
                ) != true
            ) {
                check(System.nanoTime() < databaseDeadline) { "PostgreSQL clock did not pass the draft deadline" }
                Thread.sleep(20)
            }
            assertEquals(MediaProductCreationResult.DraftClosed, f.repository.create(expired))
            assertEquals(0, f.count("products"))
        }
        fixture().use { f ->
            val unavailable = f.command("unavailable", 0)
            f.jdbc.update("UPDATE media_assets SET provider_kind='UNCONFIGURED',provider_key=NULL WHERE draft_id=?", unavailable.draftId.value)
            assertEquals(MediaProductCreationResult.AssetUnavailable, f.repository.create(unavailable))
            assertEquals(0, f.count("products"))
        }
    }

    @Test fun `concurrent duplicate creates one aggregate and replays one durable receipt`() {
        fixture().use { f ->
            val command = f.command("concurrent", 4)
            val pool = Executors.newFixedThreadPool(2)
            val start = CountDownLatch(1)
            try {
                val futures = (1..2).map { pool.submit<MediaProductCreationResult> {
                    f.repositoryHandle().use { handle -> start.await(); handle.repository.create(command) }
                } }
                start.countDown()
                val results = futures.map { it.get(15, TimeUnit.SECONDS) }
                assertEquals(1, results.count { it is MediaProductCreationResult.Created })
                assertEquals(1, results.count { it is MediaProductCreationResult.Replayed })
                assertEquals(1, f.count("products")); assertEquals(1, f.count("inventory_ledger"))
                assertEquals(1, f.count("catalog_media_product_creation_commands"))
            } finally { pool.shutdownNow() }
        }
    }

    @Test fun `database clock is rechecked after waiting on asset lock`() {
        fixture().use { f ->
            val command = f.command("asset-wait", 2)
            f.jdbc.update("UPDATE catalog_media_drafts SET expires_at=clock_timestamp()+interval '300 milliseconds' WHERE id=?", command.draftId.value)
            DriverManager.getConnection(f.url, postgres.username, postgres.password).use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("SELECT id FROM media_assets WHERE draft_id=? FOR UPDATE").use {
                    it.setObject(1, command.draftId.value); it.executeQuery().close()
                }
                val pool = Executors.newSingleThreadExecutor()
                try {
                    val result = pool.submit<MediaProductCreationResult> {
                        f.repositoryHandle().use { it.repository.create(command) }
                    }
                    f.awaitBlocked("media_assets")
                    Thread.sleep(600)
                    blocker.commit()
                    assertEquals(MediaProductCreationResult.DraftClosed, result.get(15, TimeUnit.SECONDS))
                    assertEquals(0, f.count("products")); assertEquals(0, f.count("catalog_media_product_creation_commands"))
                    assertEquals("STORED_PRIVATE", f.jdbc.queryForObject("SELECT state FROM media_assets", String::class.java))
                } finally { pool.shutdownNow(); blocker.rollback() }
            }
        }
    }

    @Test fun `expiry cleanup racing creation leaves one closed draft and no partial aggregate`() {
        fixture().use { f ->
            val command = f.command("cleanup-race", 2)
            val assetId = command.productImages.single().assetId
            f.jdbc.update(
                "UPDATE catalog_media_drafts SET expires_at=created_at+interval '10 milliseconds' WHERE id=?",
                command.draftId.value,
            )
            Thread.sleep(50)
            DriverManager.getConnection(f.url, postgres.username, postgres.password).use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                    it.setObject(1, assetId.value); it.executeQuery().close()
                }
                val pool = Executors.newSingleThreadExecutor()
                try {
                    val creation = pool.submit<MediaProductCreationResult> {
                        f.repositoryHandle().use { it.repository.create(command) }
                    }
                    f.awaitBlocked("media_assets")
                    val skipped = f.cleanupRepositoryHandle().use {
                        val batch = MediaCleanupBatchSize.fromWire(10)!!
                        it.repository.expireDrafts(batch) to it.repository.enqueueOrphanDeletes(batch)
                    }
                    assertEquals(0 to 0, skipped)
                    blocker.commit()
                    assertEquals(MediaProductCreationResult.DraftClosed, creation.get(15, TimeUnit.SECONDS))
                    val reconciled = f.cleanupRepositoryHandle().use {
                        val batch = MediaCleanupBatchSize.fromWire(10)!!
                        it.repository.expireDrafts(batch) to it.repository.enqueueOrphanDeletes(batch)
                    }
                    assertEquals(1 to 1, reconciled)
                    assertEquals(0, f.count("products")); assertEquals(0, f.count("product_variants"))
                    assertEquals(0, f.count("inventory_balances")); assertEquals(0, f.count("inventory_ledger"))
                    assertEquals(0, f.count("catalog_media_product_creation_commands"))
                    assertEquals("EXPIRED", f.jdbc.queryForObject("SELECT state FROM catalog_media_drafts", String::class.java))
                    assertEquals("DELETE_PENDING", f.jdbc.queryForObject("SELECT state FROM media_assets", String::class.java))
                    assertEquals(1, f.count("media_delete_commands"))
                } finally { pool.shutdownNow(); blocker.rollback() }
            }
        }
    }

    @Test fun `human delete racing creation has one serializable winner`() {
        fixture().use { f ->
            val command = f.command("delete-race", 2)
            val assetId = command.productImages.single().assetId
            DriverManager.getConnection(f.url, postgres.username, postgres.password).use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                    it.setObject(1, assetId.value); it.executeQuery().close()
                }
                val pool = Executors.newFixedThreadPool(2)
                val start = CountDownLatch(1)
                try {
                    val creation = pool.submit<MediaProductCreationResult> {
                        start.await(); f.repositoryHandle().use { it.repository.create(command) }
                    }
                    val deletion = pool.submit<MediaDeleteRequestResult> {
                        start.await(); f.commandRepositoryHandle().use {
                            it.repository.requestDelete(f.owner, assetId, MediaDeletePurpose.USER_DELETE, Instant.now())
                        }
                    }
                    start.countDown()
                    f.awaitBlocked("media_assets", 2)
                    blocker.commit()
                    val createResult = creation.get(15, TimeUnit.SECONDS)
                    val deleteResult = deletion.get(15, TimeUnit.SECONDS)
                    val createWon = createResult is MediaProductCreationResult.Created && deleteResult == MediaDeleteRequestResult.Referenced
                    val deleteWon = createResult == MediaProductCreationResult.AssetUnavailable && deleteResult == MediaDeleteRequestResult.Requested
                    assertTrue(createWon || deleteWon, "unexpected create/delete results: $createResult / $deleteResult")
                    assertEquals(if (createWon) 1 else 0, f.count("products"))
                    assertEquals(if (createWon) 1 else 0, f.count("inventory_ledger"))
                    assertEquals(if (createWon) 0 else 1, f.count("media_delete_commands"))
                    assertEquals(if (createWon) "ATTACHED" else "DELETE_PENDING", f.jdbc.queryForObject(
                        "SELECT state FROM media_assets WHERE id=?", String::class.java, assetId.value,
                    ))
                } finally { pool.shutdownNow(); blocker.rollback() }
            }
        }
    }

    @Test fun `upload settlement racing creation cannot publish a partial aggregate`() {
        fixture().use { f ->
            val command = f.command("settlement-race", 2)
            val assetId = command.productImages.single().assetId
            f.jdbc.update(
                "UPDATE media_assets SET state='AWAITING_BYTES',provider_kind='UNCONFIGURED',provider_key=NULL WHERE id=?",
                assetId.value,
            )
            f.jdbc.update(
                "UPDATE media_upload_commands SET state='AWAITING_BYTES',outcome=NULL,result=NULL WHERE asset_id=?",
                assetId.value,
            )
            val claim = f.commandRepositoryHandle().use {
                assertIs<MediaUploadClaimResult.Claimed>(it.repository.claimUpload(
                    f.owner, command.draftId,
                    UploadId.fromWire(f.jdbc.queryForObject("SELECT upload_id::text FROM media_assets WHERE id=?", String::class.java, assetId.value))!!,
                    UUID.randomUUID(), Instant.now(), Duration.ofSeconds(30),
                ))
            }
            val lookup = ObjectLookupOutcome.Present(
                claim.lease.deterministicKey,
                claim.lease.snapshot.normalizedDigest,
                claim.lease.normalizedSize.value,
                MediaObjectMetadata.create(claim.lease.format, claim.lease.dimensions)!!,
            )
            DriverManager.getConnection(f.url, postgres.username, postgres.password).use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                    it.setObject(1, assetId.value); it.executeQuery().close()
                }
                val pool = Executors.newFixedThreadPool(2)
                val start = CountDownLatch(1)
                try {
                    val creation = pool.submit<MediaProductCreationResult> {
                        start.await(); f.repositoryHandle().use { it.repository.create(command) }
                    }
                    val settlement = pool.submit<Boolean> {
                        start.await(); f.commandRepositoryHandle().use {
                            it.repository.confirmStored(claim.lease, lookup, MediaProviderKind.TEST_STUB, Instant.now())
                        }
                    }
                    start.countDown()
                    f.awaitBlocked("media_assets", 2)
                    blocker.commit()
                    val createResult = creation.get(15, TimeUnit.SECONDS)
                    assertTrue(settlement.get(15, TimeUnit.SECONDS))
                    assertTrue(
                        createResult is MediaProductCreationResult.Created || createResult == MediaProductCreationResult.AssetUnavailable,
                        "unexpected create/settlement result: $createResult",
                    )
                    val created = createResult is MediaProductCreationResult.Created
                    assertEquals(if (created) 1 else 0, f.count("products"))
                    assertEquals(if (created) 1 else 0, f.count("catalog_media_product_creation_commands"))
                    assertEquals(if (created) "ATTACHED" else "STORED_PRIVATE", f.jdbc.queryForObject(
                        "SELECT state FROM media_assets WHERE id=?", String::class.java, assetId.value,
                    ))
                    assertEquals(if (created) "ATTACHED" else "COMPLETED", f.jdbc.queryForObject(
                        "SELECT state FROM media_upload_commands WHERE asset_id=?", String::class.java, assetId.value,
                    ))
                } finally { pool.shutdownNow(); blocker.rollback() }
            }
        }
    }

    @Test fun `deferred constraint failure rolls back aggregate receipt and staging transitions`() {
        fixture().use { f ->
            val command = f.command("deferred-rollback", 3)
            f.jdbc.execute("""CREATE FUNCTION reject_product_create_deferred() RETURNS TRIGGER LANGUAGE plpgsql AS ${'$'}${'$'}
                BEGIN IF NEW.event_type='CATALOG_PRODUCT_CREATED_WITH_MEDIA' THEN RAISE EXCEPTION 'simulated deferred failure'; END IF; RETURN NEW; END; ${'$'}${'$'}""")
            f.jdbc.execute("""CREATE CONSTRAINT TRIGGER reject_product_create_deferred
                AFTER INSERT ON audit_events DEFERRABLE INITIALLY DEFERRED
                FOR EACH ROW EXECUTE FUNCTION reject_product_create_deferred()""")
            val failure = assertThrows<Exception> { f.repository.create(command) }
            assertNotNull(generateSequence<Throwable>(failure) { it.cause }
                .filterIsInstance<java.sql.SQLException>()
                .firstOrNull { it.sqlState == "P0001" && it.message?.contains("simulated deferred failure") == true })
            assertEquals(0, f.count("products")); assertEquals(0, f.count("product_variants"))
            assertEquals(0, f.count("inventory_balances")); assertEquals(0, f.count("inventory_ledger"))
            assertEquals(0, f.count("product_images")); assertEquals(0, f.count("catalog_media_product_creation_commands"))
            assertEquals("OPEN", f.jdbc.queryForObject("SELECT state FROM catalog_media_drafts", String::class.java))
            assertEquals("STORED_PRIVATE", f.jdbc.queryForObject("SELECT state FROM media_assets", String::class.java))
            assertEquals("COMPLETED", f.jdbc.queryForObject("SELECT state FROM media_upload_commands", String::class.java))
        }
    }

    @Test fun `slug and sku collisions conflict and preserve the losing drafts`() {
        fixture().use { f ->
            val winner = f.command("identity-first", 1)
            assertIs<MediaProductCreationResult.Created>(f.repository.create(winner))
            val slugSource = f.command("identity-second", 1)
            assertEquals(MediaProductCreationResult.Conflict, f.repository.create(f.withIdentity(slugSource, slug = winner.slug)))
            val skuSource = f.command("identity-third", 1)
            assertEquals(MediaProductCreationResult.Conflict, f.repository.create(f.withIdentity(skuSource, sku = winner.variants.single().sku)))
            assertEquals(1, f.count("products")); assertEquals(1, f.count("catalog_media_product_creation_commands"))
            assertEquals(2, f.jdbc.queryForObject("SELECT count(*) FROM catalog_media_drafts WHERE state='OPEN'", Int::class.java))
            assertEquals(2, f.jdbc.queryForObject("SELECT count(*) FROM media_assets WHERE state='STORED_PRIVATE'", Int::class.java))
        }
    }

    @Test fun `current schema upgrades V29 and preserves published checksums`() {
        val database = "media_create_upgrade_${UUID.randomUUID().toString().replace("-", "")}"
        postgres.createConnection("").use { it.createStatement().execute("CREATE DATABASE $database") }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/$database"
        val v29 = flyway(url, "29"); assertEquals("29", v29.migrate().targetSchemaVersion.toString())
        val jdbc = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        val history = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank")
        assertEquals("39", flyway(url).migrate().targetSchemaVersion.toString())
        assertEquals(history, jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success AND version::int<=29 ORDER BY installed_rank"))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM information_schema.tables WHERE table_name='catalog_media_product_creation_commands'", Int::class.java))
        flyway(url).validate()
    }

    private fun fixture(): Fixture {
        val database = "media_create_${UUID.randomUUID().toString().replace("-", "")}"
        postgres.createConnection("").use { it.createStatement().execute("CREATE DATABASE $database") }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/$database"
        flyway(url).migrate()
        return Fixture(url)
    }
    private fun flyway(url: String, target: String? = null): Flyway = Flyway.configure().dataSource(url, postgres.username, postgres.password)
        .locations("classpath:db/migration").apply { if (target != null) target(target) }.load()

    private class Fixture(val url: String) : AutoCloseable {
        val jdbc = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        private val runtimeSource = SingleConnectionDataSource(DriverManager.getConnection(url, postgres.username, postgres.password).apply {
            createStatement().use { it.execute("SET ROLE storecore_runtime"); it.execute("SET statement_timeout='10s'") }
        }, true)
        private val runtime = JdbcTemplate(runtimeSource)
        private val transactions = TransactionTemplate(DataSourceTransactionManager(runtimeSource))
        val repository = JdbcMediaProductCreationRepository(runtime, jacksonObjectMapper(), transactions)
        val owner = MediaOwnerId.fromWire(jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('create@example.test','${'$'}argon2id${'$'}fixture','Create','Owner') RETURNING id", Long::class.java))!!

        fun command(label: String, stock: Int, actor: MediaOwnerId = owner, existingDraft: CatalogMediaDraftId? = null): MediaProductCreationCommand {
            val draft = existingDraft ?: CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
            val asset = MediaAssetId.fromWire(UUID.randomUUID().toString())!!
            val upload = UploadId.fromWire(UUID.randomUUID().toString())!!
            if (existingDraft == null) {
                jdbc.update("INSERT INTO catalog_media_drafts(id,owner_user_id,expires_at) VALUES (?,?,clock_timestamp()+interval '1 hour')", draft.value, actor.value)
                jdbc.update("""INSERT INTO media_assets(id,draft_id,owner_user_id,upload_id,original_sha256,normalized_sha256,format,width,height,normalized_size,state,provider_kind,provider_key,created_by)
                    VALUES (?,?,?,?,'${"a".repeat(64)}','${"b".repeat(64)}','WEBP',800,600,100,'STORED_PRIVATE','TEST_STUB',?,?)""",
                    asset.value,draft.value,actor.value,upload.value,"catalog/${draft.value}/${upload.value}",actor.value)
                jdbc.update("""INSERT INTO media_upload_commands(draft_id,owner_user_id,upload_id,original_hash,normalized_hash,asset_id,deterministic_key,state,outcome,result)
                    VALUES (?,?,?,'${"a".repeat(64)}','${"b".repeat(64)}',?,?,'COMPLETED','CREATED',jsonb_build_object('assetId',?::text,'state','STORED_PRIVATE'))""",
                    draft.value,actor.value,upload.value,asset.value,"catalog/${draft.value}/${upload.value}",asset.value.toString())
            }
            val resolvedAsset = if (existingDraft == null) asset else MediaAssetId.fromWire(jdbc.queryForObject("SELECT id::text FROM media_assets WHERE draft_id=?", String::class.java, draft.value))!!
            val ref = ClientVariantRef.fromWire("primary")!!
            return (MediaProductCreationCommand.create(actor,draft,CreationProductName.fromWire("Tool $label"),CreationProductSlug.fromWire(label),null,null,null,
                ArsAmount.fromWire("100.00"),ProductStatus.DRAFT,
                listOf(MediaProductCreationVariant(ref,CreationSku.fromWire("SKU-${label.uppercase()}")!!,CreationVariantLabel.fromWire("Principal")!!,true,mapOf("color" to "Rojo"),InitialAvailableQuantity.fromWire(stock)!!)),
                listOf(MediaProductCreationImage(resolvedAsset,0,true,AltText.fromWire("Tool")!!)),
                listOf(MediaProductCreationVariantGallery(ref,listOf(VariantMediaCompositionEntry(MediaImageReference.StagedAsset(resolvedAsset),0,true))))
            ) as MediaProductCreationValidationResult.Valid).command
        }
        fun commandFrom(command: MediaProductCreationCommand, stock: Int): MediaProductCreationCommand =
            (MediaProductCreationCommand.create(command.ownerId,command.draftId,command.name,command.slug,command.description,command.brandId,command.categoryId,command.basePrice,command.status,
                command.variants.map { it.copy(initialAvailable=InitialAvailableQuantity.fromWire(stock)!!) },command.productImages,command.variantGalleries) as MediaProductCreationValidationResult.Valid).command
        fun withIdentity(command: MediaProductCreationCommand, slug: CreationProductSlug = command.slug, sku: CreationSku = command.variants.single().sku): MediaProductCreationCommand =
            (MediaProductCreationCommand.create(command.ownerId,command.draftId,command.name,slug,command.description,command.brandId,command.categoryId,command.basePrice,command.status,
                listOf(command.variants.single().copy(sku=sku)),command.productImages,command.variantGalleries) as MediaProductCreationValidationResult.Valid).command
        fun replayInsideOuterTransaction(command: MediaProductCreationCommand): MediaProductCreationResult = transactions.execute {
            val result = repository.create(command)
            runtime.update("""INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
                VALUES ('USER',?,'MEDIA_REPLAY_CALLER_COMMITTED','products',NULL,'{}'::jsonb)""", command.ownerId.value.toString())
            result
        }!!
        fun repositoryHandle(): RepositoryHandle {
            val source = SingleConnectionDataSource(DriverManager.getConnection(url, postgres.username, postgres.password).apply {
                createStatement().use { it.execute("SET ROLE storecore_runtime"); it.execute("SET statement_timeout='10s'") }
            }, true)
            return RepositoryHandle(source, JdbcMediaProductCreationRepository(JdbcTemplate(source), jacksonObjectMapper()))
        }
        fun commandRepositoryHandle(): CommandRepositoryHandle {
            val source = runtimeSource()
            return CommandRepositoryHandle(source, JdbcMediaCommandRepository(JdbcTemplate(source)))
        }
        fun cleanupRepositoryHandle(): CleanupRepositoryHandle {
            val source = runtimeSource()
            return CleanupRepositoryHandle(source, JdbcMediaDraftCleanupRepository(JdbcTemplate(source)))
        }
        private fun runtimeSource() = SingleConnectionDataSource(DriverManager.getConnection(url, postgres.username, postgres.password).apply {
            createStatement().use { it.execute("SET ROLE storecore_runtime"); it.execute("SET statement_timeout='10s'") }
        }, true)
        fun awaitBlocked(table: String, expected: Int = 1) {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
            while (System.nanoTime() < deadline) {
                val blocked = jdbc.queryForObject(
                    "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?",
                    Int::class.java, "%FROM $table WHERE id=%FOR UPDATE%",
                ) ?: 0
                if (blocked >= expected) return
                Thread.sleep(10)
            }
            fail("Expected $expected blocked operations on $table")
        }
        fun count(table: String) = jdbc.queryForObject("SELECT count(*) FROM $table", Int::class.java)!!
        override fun close() = runtimeSource.destroy()
    }

    private class RepositoryHandle(private val source: SingleConnectionDataSource, val repository: JdbcMediaProductCreationRepository) : AutoCloseable {
        override fun close() = source.destroy()
    }
    private class CommandRepositoryHandle(private val source: SingleConnectionDataSource, val repository: JdbcMediaCommandRepository) : AutoCloseable {
        override fun close() = source.destroy()
    }
    private class CleanupRepositoryHandle(private val source: SingleConnectionDataSource, val repository: JdbcMediaDraftCleanupRepository) : AutoCloseable {
        override fun close() = source.destroy()
    }
}
