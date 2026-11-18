package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.*
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MediaDraftCleanupPostgresTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @BeforeAll fun start() = postgres.start()
        @JvmStatic @AfterAll fun stop() = postgres.stop()
    }

    private val batch = MediaCleanupBatchSize.fromWire(100)!!

    @Test fun `two runtime sweepers partition expired drafts and never duplicate delete commands`() {
        fixture().use { f ->
            repeat(6) { f.upload().also(f::expire) }
            val future = f.upload()
            val pool = Executors.newFixedThreadPool(2)
            val start = CountDownLatch(1)
            try {
                val work = (1..2).map {
                    pool.submit<Pair<Int, Int>> {
                        f.runtime().use { sql ->
                            val cleanup = JdbcMediaDraftCleanupRepository(sql)
                            start.await()
                            cleanup.expireDrafts(batch) to cleanup.enqueueOrphanDeletes(batch)
                        }
                    }
                }
                start.countDown()
                val results = work.map { it.get(15, TimeUnit.SECONDS) }
                assertEquals(6, results.sumOf { it.first })
                assertEquals(6, results.sumOf { it.second })
                assertEquals(6, f.count("media_delete_commands"))
                assertEquals(0, f.cleanup.enqueueOrphanDeletes(batch))
                assertEquals(CatalogMediaDraftState.OPEN, f.draftState(future))
                assertEquals(MediaAssetState.AWAITING_BYTES, f.assetState(future))
            } finally { pool.shutdownNow() }
        }
    }

    @Test fun `committed expiration survives enqueue crash and failed enqueue rolls back fencing`() {
        fixture().use { f ->
            val upload = f.upload().also(f::expire)
            assertEquals(1, f.cleanup.expireDrafts(batch))
            assertEquals(CatalogMediaDraftState.EXPIRED, f.draftState(upload))
            f.jdbc.execute("""CREATE FUNCTION reject_cleanup_queue() RETURNS TRIGGER LANGUAGE plpgsql AS ${'$'}${'$'}
                BEGIN RAISE EXCEPTION 'simulated queue failure'; END; ${'$'}${'$'}""")
            f.jdbc.execute("CREATE TRIGGER reject_cleanup_queue BEFORE INSERT ON media_delete_commands FOR EACH ROW EXECUTE FUNCTION reject_cleanup_queue()")
            assertThrows(Exception::class.java) { f.cleanup.enqueueOrphanDeletes(batch) }
            assertEquals(MediaAssetState.AWAITING_BYTES, f.assetState(upload))
            assertEquals(MediaCommandState.AWAITING_BYTES, f.commandState(upload))
            assertEquals(0, f.count("media_delete_commands"))
            f.jdbc.execute("DROP TRIGGER reject_cleanup_queue ON media_delete_commands")
            assertEquals(0, f.cleanup.expireDrafts(batch))
            assertEquals(1, f.cleanup.enqueueOrphanDeletes(batch))
            assertEquals(MediaAssetState.DELETE_PENDING, f.assetState(upload))
            assertEquals(0, f.cleanup.enqueueOrphanDeletes(batch))
        }
    }

    @Test fun `live upload is preserved until lease expires then fenced and late put is reconciled`() {
        fixture().use { f ->
            val upload = f.upload()
            val claim = f.commands.claimUpload(f.owner, upload.draftId, upload.uploadId, UUID.randomUUID(), Instant.now(), Duration.ofMinutes(1)) as MediaUploadClaimResult.Claimed
            f.expire(upload)
            assertEquals(1, f.cleanup.expireDrafts(batch))
            assertEquals(0, f.cleanup.enqueueOrphanDeletes(batch))
            assertEquals(MediaCommandState.CLAIMED, f.commandState(upload))
            f.jdbc.update("UPDATE media_upload_commands SET lease_until=clock_timestamp()-interval '1 second' WHERE asset_id=?", upload.assetId.value)
            assertEquals(1, f.cleanup.enqueueOrphanDeletes(batch))
            val queue = f.jdbc.queryForMap("SELECT lease_owner,lease_until,fence_version FROM media_upload_commands WHERE asset_id=?", upload.assetId.value)
            assertNull(queue["lease_owner"])
            assertNull(queue["lease_until"])
            assertTrue((queue["fence_version"] as Number).toLong() > claim.lease.fenceVersion)
            val objects = TestMediaObjectStore(Clock.systemUTC())
            val deletes = MediaDeleteWorker(f.commands, objects, SpringExternalMediaIoGuard(), Clock.systemUTC(), retryAfter = Duration.ofMillis(1))
            assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
            val bytes = NormalizedMediaBytes.from(f.bytes)!!
            objects.putIfAbsent(bytes, upload.deterministicKey, upload.normalizedDigest, MediaObjectMetadata.create(upload.format, upload.dimensions)!!)
            val present = objects.head(upload.deterministicKey) as ObjectLookupOutcome.Present
            assertFalse(f.commands.confirmStored(claim.lease, present, objects.kind, Instant.now()))
            assertFalse(f.commands.retryUpload(claim.lease, Instant.now()))
            assertFalse(f.commands.failUpload(claim.lease, MediaFailureCode.STORAGE_UNAVAILABLE, Instant.now()))
            f.jdbc.update("UPDATE media_delete_commands SET available_at=clock_timestamp()-interval '1 second' WHERE asset_id=?", upload.assetId.value)
            assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
            assertEquals(ObjectLookupOutcome.Absent, objects.head(upload.deterministicKey))
        }
    }

    @Test fun `closed and elapsed drafts deny new upload claims before a sweeper runs`() {
        fixture().use { f ->
            val elapsed = f.upload().also(f::expire)
            assertEquals(MediaUploadClaimResult.Busy, f.commands.claimUpload(f.owner, elapsed.draftId, elapsed.uploadId, UUID.randomUUID(), Instant.now(), Duration.ofMinutes(1)))
            for (state in listOf(CatalogMediaDraftState.EXPIRED, CatalogMediaDraftState.ABANDONED, CatalogMediaDraftState.CLAIMED)) {
                val upload = f.upload()
                f.jdbc.update("UPDATE catalog_media_drafts SET state=? WHERE id=?", state.wire, upload.draftId.value)
                assertEquals(MediaUploadClaimResult.Busy, f.commands.claimUpload(f.owner, upload.draftId, upload.uploadId, UUID.randomUUID(), Instant.now(), Duration.ofMinutes(1)))
            }
        }
    }

    @Test fun `claim checks database time after waiting on a draft lock`() {
        fixture().use { f ->
            val upload = f.upload()
            DriverManager.getConnection(f.url, postgres.username, postgres.password).use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("UPDATE catalog_media_drafts SET expires_at=clock_timestamp()+interval '300 milliseconds' WHERE id=?").use {
                    it.setObject(1, upload.draftId.value)
                    it.executeUpdate()
                }
                val pool = Executors.newSingleThreadExecutor()
                val started = CountDownLatch(1)
                try {
                    val claim = pool.submit<MediaUploadClaimResult> {
                        f.runtime().use { sql ->
                            started.countDown()
                            JdbcMediaCommandRepository(sql).claimUpload(f.owner, upload.draftId, upload.uploadId, UUID.randomUUID(), Instant.now(), Duration.ofMinutes(1))
                        }
                    }
                    assertTrue(started.await(5, TimeUnit.SECONDS))
                    f.awaitBlocked("catalog_media_drafts")
                    Thread.sleep(500)
                    blocker.commit()
                    assertEquals(MediaUploadClaimResult.Busy, claim.get(15, TimeUnit.SECONDS))
                    assertEquals(MediaCommandState.AWAITING_BYTES, f.commandState(upload))
                    assertEquals(0L, f.jdbc.queryForObject("SELECT fence_version FROM media_upload_commands WHERE asset_id=?", Long::class.java, upload.assetId.value))
                } finally { pool.shutdownNow(); blocker.rollback() }
            }
        }
    }

    @Test fun `claim checks database time after waiting on an asset lock`() {
        fixture().use { f ->
            val upload = f.upload()
            f.jdbc.update("UPDATE catalog_media_drafts SET expires_at=clock_timestamp()+interval '500 milliseconds' WHERE id=?", upload.draftId.value)
            DriverManager.getConnection(f.url, postgres.username, postgres.password).use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                    it.setObject(1, upload.assetId.value)
                    it.executeQuery().close()
                }
                val pool = Executors.newSingleThreadExecutor()
                val started = CountDownLatch(1)
                try {
                    val claim = pool.submit<MediaUploadClaimResult> {
                        f.runtime().use { sql ->
                            started.countDown()
                            JdbcMediaCommandRepository(sql).claimUpload(f.owner, upload.draftId, upload.uploadId, UUID.randomUUID(), Instant.now(), Duration.ofMinutes(1))
                        }
                    }
                    assertTrue(started.await(5, TimeUnit.SECONDS))
                    f.awaitBlocked("media_assets")
                    Thread.sleep(700)
                    blocker.commit()
                    assertEquals(MediaUploadClaimResult.Busy, claim.get(15, TimeUnit.SECONDS))
                    assertEquals(MediaCommandState.AWAITING_BYTES, f.commandState(upload))
                    assertEquals(0L, f.jdbc.queryForObject("SELECT fence_version FROM media_upload_commands WHERE asset_id=?", Long::class.java, upload.assetId.value))
                } finally { pool.shutdownNow(); blocker.rollback() }
            }
        }
    }

    @Test fun `cleanup preserves attached and independently referenced assets and bounds batches`() {
        fixture().use { f ->
            val attached = f.upload(stored = true)
            assertTrue(f.attach(attached) is MediaCompositionResult.Saved)
            f.expire(attached)
            val referenced = f.upload(stored = true)
            f.jdbc.update("INSERT INTO product_images(product_id,url,sort_order,is_primary,media_asset_id,source_kind,alt_text) VALUES (?,NULL,0,true,?,'MANAGED','Reference')", referenced.targetProductId!!.value, referenced.assetId.value)
            f.expire(referenced)
            repeat(3) { f.upload().also(f::expire) }
            val one = MediaCleanupBatchSize.fromWire(1)!!
            assertEquals(1, f.cleanup.expireDrafts(one))
            repeat(4) { f.cleanup.expireDrafts(batch) }
            assertEquals(1, f.cleanup.enqueueOrphanDeletes(one))
            assertEquals(2, f.cleanup.enqueueOrphanDeletes(batch))
            assertEquals(MediaAssetState.ATTACHED, f.assetState(attached))
            assertEquals(MediaAssetState.STORED_PRIVATE, f.assetState(referenced))
            assertEquals(2, f.count("product_images"))
            assertEquals(3, f.count("media_delete_commands"))
        }
    }

    @Test fun `cleanup racing composition never queues a referenced asset or deadlocks`() {
        fixture().use { f ->
            val upload = f.upload(stored = true)
            val pool = Executors.newFixedThreadPool(2)
            val start = CountDownLatch(1)
            try {
                val attach = pool.submit<MediaCompositionResult> { start.await(); f.attach(upload) }
                val sweep = pool.submit<Int> {
                    start.await()
                    f.runtime().use { sql ->
                        f.expire(upload)
                        JdbcMediaDraftCleanupRepository(sql).run { expireDrafts(batch); enqueueOrphanDeletes(batch) }
                    }
                }
                start.countDown()
                val result = attach.get(15, TimeUnit.SECONDS)
                sweep.get(15, TimeUnit.SECONDS)
                val referenced = result is MediaCompositionResult.Saved
                assertEquals(if (referenced) 1 else 0, f.count("product_images"))
                assertEquals(if (referenced) 0 else 1, f.count("media_delete_commands"))
                assertEquals(if (referenced) MediaAssetState.ATTACHED else MediaAssetState.DELETE_PENDING, f.assetState(upload))
                if (!referenced) assertEquals(MediaCompositionResult.DraftClosed, result)
            } finally { pool.shutdownNow() }
        }
    }

    @Test fun `claimed and abandoned leftovers are collected and detach after expiry becomes eligible`() {
        fixture().use { f ->
            for (state in listOf(CatalogMediaDraftState.CLAIMED, CatalogMediaDraftState.ABANDONED)) {
                val upload = f.upload(stored = true)
                f.jdbc.update("UPDATE catalog_media_drafts SET state=? WHERE id=?", state.wire, upload.draftId.value)
            }
            val attached = f.upload(stored = true)
            assertTrue(f.attach(attached) is MediaCompositionResult.Saved)
            f.jdbc.update("UPDATE catalog_media_drafts SET state=? WHERE id=?", CatalogMediaDraftState.CLAIMED.wire, attached.draftId.value)
            assertEquals(2, f.cleanup.enqueueOrphanDeletes(batch))
            assertEquals(MediaAssetState.ATTACHED, f.assetState(attached))
            val nextDraft = CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
            assertEquals(MediaDraftRegistrationResult.Created, f.commands.registerDraft(MediaDraftRegistration(nextDraft, f.owner, attached.targetProductId, Instant.now().plusSeconds(3600))))
            f.runtime().use { runtime ->
                val empty = (MediaComposition.create(emptyList(), emptyList()) as MediaCompositionValidationResult.Valid).composition
                assertTrue(JdbcMediaCompositionRepository(runtime, emptySet()).replace(MediaCompositionCommand(f.owner, nextDraft, attached.targetProductId!!, MediaCompositionRevision.fromWire(2)!!, empty)) is MediaCompositionResult.Saved)
            }
            assertEquals(MediaAssetState.STORED_PRIVATE, f.assetState(attached))
            assertEquals(1, f.cleanup.enqueueOrphanDeletes(batch))
            assertEquals(MediaAssetState.DELETE_PENDING, f.assetState(attached))
            assertEquals(3, f.count("media_delete_commands"))
        }
    }

    @Test fun `V29 upgrades populated V28 without rewriting published migration checksums`() {
        fixture("28").use { f ->
            val upload = f.upload().also(f::expire)
            val history = f.jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank")
            val migration = f.flyway().migrate()
            assertEquals("29", migration.targetSchemaVersion.toString())
            assertEquals(history, f.jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success AND version::int<=28 ORDER BY installed_rank"))
            assertEquals(MediaAssetState.AWAITING_BYTES, f.assetState(upload))
            assertEquals(1, f.cleanup.expireDrafts(batch))
            assertEquals(1, f.cleanup.enqueueOrphanDeletes(batch))
            val index = f.jdbc.queryForList("SELECT indexdef FROM pg_indexes WHERE tablename='catalog_media_drafts'", String::class.java)
            assertTrue(index.any { it.contains("(expires_at, id)") && it.contains("OPEN") }, index.toString())
            val assetIndexes = f.jdbc.queryForList("SELECT indexdef FROM pg_indexes WHERE tablename='media_assets'", String::class.java)
            assertTrue(assetIndexes.any { it.contains("(id)") && it.contains("WHERE") && it.contains("AWAITING_BYTES") && it.contains("STORED_PRIVATE") && it.contains("FAILED") }, assetIndexes.toString())
            f.flyway().validate()
            assertEquals(0, f.flyway().migrate().migrationsExecuted)
        }
    }

    private fun fixture(target: String? = null): Fixture {
        val database = "media_cleanup_${UUID.randomUUID().toString().replace("-", "")}"
        postgres.createConnection("").use { it.createStatement().use { s -> s.execute("CREATE DATABASE $database") } }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/$database"
        val f = Fixture(url)
        f.flyway(target).migrate()
        f.initialize()
        return f
    }

    private class RuntimeJdbc(private val source: SingleConnectionDataSource) : JdbcTemplate(source), AutoCloseable {
        override fun close() = source.destroy()
    }

    private class Fixture(val url: String) : AutoCloseable {
        val jdbc = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        lateinit var sql: RuntimeJdbc
        var owner: MediaOwnerId = MediaOwnerId.fromWire(1L)!!
        val commands get() = JdbcMediaCommandRepository(sql)
        val cleanup get() = JdbcMediaDraftCleanupRepository(sql)
        val bytes = "cleanup-fixture".toByteArray()
        fun initialize() {
            owner = MediaOwnerId.fromWire(jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('cleanup@example.test','fixture','Cleanup','Owner') RETURNING id", Long::class.java))!!
            sql = runtime()
        }
        fun flyway(target: String? = null): Flyway = Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").apply { if (target != null) target(target) }.load()
        fun runtime(): RuntimeJdbc = RuntimeJdbc(SingleConnectionDataSource(DriverManager.getConnection(url, postgres.username, postgres.password).apply {
            createStatement().use { it.execute("SET ROLE storecore_runtime"); it.execute("SET statement_timeout='10s'") }
        }, true))
        fun upload(stored: Boolean = false): MediaUploadRegistration {
            val product = MediaProductId.fromWire(jdbc.queryForObject("INSERT INTO products(name,slug,base_price) VALUES ('Cleanup',?,100) RETURNING id", Long::class.java, "cleanup-${UUID.randomUUID()}"))!!
            val draft = CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
            val upload = UploadId.fromWire(UUID.randomUUID().toString())!!
            val digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val command = MediaUploadRegistration.create(draft, owner, product, upload, MediaAssetId.fromWire(UUID.randomUUID().toString())!!, ContentDigest.fromWire("b".repeat(64))!!, ContentDigest.fromWire(digest)!!, MediaFormat.WEBP, PixelDimensions.fromWire(800,600)!!, MediaByteSize.fromWire(bytes.size.toLong())!!, ProviderObjectKey.fromWire("catalog/${draft.value}/${upload.value}")!!)!!
            jdbc.update("INSERT INTO catalog_media_drafts(id,owner_user_id,target_product_id,created_at,expires_at) VALUES (?,?,?,clock_timestamp()-interval '2 hours',clock_timestamp()+interval '1 hour')", draft.value, owner.value, product.value)
            assertTrue(commands.registerUpload(command) is MediaUploadRegistrationResult.Created)
            if (stored) {
                val objects = TestMediaObjectStore(Clock.systemUTC())
                assertTrue(MediaUploadWorker(commands, objects, SpringExternalMediaIoGuard(), Clock.systemUTC()).executeRegistered(command, NormalizedMediaBytes.from(bytes)!!, UUID.randomUUID()) is MediaUploadRun.Stored)
            }
            return command
        }
        fun expire(command: MediaUploadRegistration) {
            // Keep the published created_at < expires_at constraint while avoiding wall-clock sleeps.
            jdbc.update("UPDATE catalog_media_drafts SET expires_at=clock_timestamp()-interval '1 hour' WHERE id=?", command.draftId.value)
        }
        fun attach(command: MediaUploadRegistration): MediaCompositionResult = runtime().use { runtime ->
            val composition = (MediaComposition.create(listOf(ProductMediaCompositionEntry(MediaImageReference.StagedAsset(command.assetId),0,true,AltText.fromWire("Cleanup")!!)), emptyList()) as MediaCompositionValidationResult.Valid).composition
            JdbcMediaCompositionRepository(runtime, emptySet()).replace(MediaCompositionCommand(owner, command.draftId, command.targetProductId!!, MediaCompositionRevision.fromWire(1)!!, composition))
        }
        fun draftState(command: MediaUploadRegistration) = CatalogMediaDraftState.fromWire(jdbc.queryForObject("SELECT state FROM catalog_media_drafts WHERE id=?", String::class.java, command.draftId.value))
        fun assetState(command: MediaUploadRegistration) = MediaAssetState.fromWire(jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, command.assetId.value))
        fun commandState(command: MediaUploadRegistration) = MediaCommandState.fromWire(jdbc.queryForObject("SELECT state FROM media_upload_commands WHERE asset_id=?", String::class.java, command.assetId.value))
        fun count(table: String) = jdbc.queryForObject("SELECT count(*) FROM $table", Int::class.java)!!
        fun awaitBlocked(table: String) {
            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
            while (System.nanoTime() < deadline) {
                if (jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ?)", Boolean::class.java, "%FROM $table WHERE id=%") == true) return
                Thread.sleep(10)
            }
            fail<Unit>("Claim did not wait on $table")
        }
        override fun close() = sql.close()
    }
}
