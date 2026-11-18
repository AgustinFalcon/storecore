package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.JdbcMediaCommandRepository
import com.storecore.catalog.infrastructure.media.JdbcMediaCompositionRepository
import com.storecore.catalog.infrastructure.media.SpringExternalMediaIoGuard
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.testcontainers.containers.PostgreSQLContainer
import java.security.MessageDigest
import java.sql.DriverManager
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

class MediaCommandPostgresTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @BeforeAll fun start() = postgres.start()
        @JvmStatic @AfterAll fun stop() = postgres.stop()
    }

    @Test fun `upload replay is stable and stale claimant cannot settle`() {
        val fixture = fixture()
        val command = fixture.command()
        assertEquals(MediaDraftRegistrationResult.Created, fixture.repository.registerDraft(fixture.draft(command)))

        val first = fixture.repository.registerUpload(command)
        assertTrue(first is MediaUploadRegistrationResult.Created)
        val replay = fixture.repository.registerUpload(fixture.reissued(command))
        assertTrue(replay is MediaUploadRegistrationResult.Replay)
        assertEquals(command.assetId, (replay as MediaUploadRegistrationResult.Replay).snapshot.assetId)
        assertEquals(1, fixture.jdbc.queryForObject("SELECT count(*) FROM media_assets", Int::class.java))

        val conflicting = fixture.command(
            draftId = command.draftId,
            uploadId = command.uploadId,
            normalizedSize = command.normalizedSize.value + 1,
        )
        assertEquals(MediaUploadRegistrationResult.Conflict, fixture.repository.registerUpload(conflicting))
        val worker = MediaUploadWorker(fixture.repository, fixture.objects, SpringExternalMediaIoGuard(), fixture.clock)
        assertEquals(
            MediaUploadRun.Conflict,
            worker.executeRegistered(conflicting, NormalizedMediaBytes.from(fixture.bytes)!!, UUID.randomUUID()),
        )
        assertEquals("AWAITING_BYTES", fixture.jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, command.assetId.value))

        val now = fixture.clock.instant()
        val old = fixture.repository.claimUpload(command.ownerId, command.draftId, command.uploadId, UUID.randomUUID(), now, Duration.ofSeconds(1))
        assertTrue(old is MediaUploadClaimResult.Claimed)
        val fresh = fixture.repository.claimUpload(command.ownerId, command.draftId, command.uploadId, UUID.randomUUID(), now.plusSeconds(2), Duration.ofMinutes(1))
        assertTrue(fresh is MediaUploadClaimResult.Claimed)
        val oldLease = (old as MediaUploadClaimResult.Claimed).lease
        val freshLease = (fresh as MediaUploadClaimResult.Claimed).lease
        assertTrue(freshLease.fenceVersion > oldLease.fenceVersion)
        assertFalse(fixture.repository.retryUpload(oldLease, now.plusSeconds(2)))
        assertTrue(fixture.repository.retryUpload(freshLease, now.plusSeconds(2)))
    }

    @Test fun `upload cannot settle after lease expires while waiting for an asset lock`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        fixture.repository.registerUpload(command)
        val claim = fixture.repository.claimUpload(
            command.ownerId, command.draftId, command.uploadId, UUID.randomUUID(),
            Instant.now(), Duration.ofMillis(150),
        ) as MediaUploadClaimResult.Claimed
        DriverManager.getConnection(fixture.url, postgres.username, postgres.password).use { blocker ->
            blocker.autoCommit = false
            blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                it.setObject(1, command.assetId.value)
                it.executeQuery().use { result -> assertTrue(result.next()) }
            }
            val started = CountDownLatch(1)
            val pool = Executors.newSingleThreadExecutor()
            try {
                val settlement = pool.submit<Boolean> {
                    started.countDown()
                    runtimeRepository(fixture.url).retryUpload(claim.lease, Instant.now())
                }
                started.await()
                Thread.sleep(350)
                blocker.commit()
                assertFalse(settlement.get())
            } finally {
                pool.shutdownNow()
                blocker.rollback()
            }
        }
        assertEquals("CLAIMED", fixture.jdbc.queryForObject("SELECT state FROM media_upload_commands WHERE asset_id=?", String::class.java, command.assetId.value))
    }

    @Test fun `worker stores once and delete tombstone remains reconcilable`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        val bytes = NormalizedMediaBytes.from(fixture.bytes)!!
        val upload = MediaUploadWorker(fixture.repository, fixture.objects, SpringExternalMediaIoGuard(), fixture.clock)
        fixture.repository.registerUpload(command)
        assertTrue(upload.executeRegistered(command, bytes, UUID.randomUUID()) is MediaUploadRun.Stored)
        assertTrue(upload.executeRegistered(command, bytes, UUID.randomUUID()) is MediaUploadRun.Replay)
        assertEquals(MediaDeleteRequestResult.ScopeDenied, fixture.repository.requestDelete(fixture.foreignOwner, command.assetId, MediaDeletePurpose.USER_DELETE, fixture.clock.instant()))
        assertEquals(MediaDeleteRequestResult.Requested, fixture.repository.requestDelete(command.ownerId, command.assetId, MediaDeletePurpose.USER_DELETE, fixture.clock.instant()))

        val deletes = MediaDeleteWorker(fixture.repository, fixture.objects, SpringExternalMediaIoGuard(), fixture.clock, retryAfter = Duration.ofSeconds(5))
        assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
        assertEquals(ObjectLookupOutcome.Absent, fixture.objects.head(command.deterministicKey))
        fixture.clock.advance(Duration.ofSeconds(6))
        assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
        assertEquals("TOMBSTONED", fixture.jdbc.queryForObject("SELECT state FROM media_delete_commands WHERE asset_id=?", String::class.java, command.assetId.value))
        assertEquals("DELETED", fixture.jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, command.assetId.value))
    }

    @Test fun `delete fences an in flight upload and reconciliation removes a late put`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        fixture.repository.registerUpload(command)
        val claim = fixture.repository.claimUpload(command.ownerId, command.draftId, command.uploadId, UUID.randomUUID(), fixture.clock.instant(), Duration.ofMinutes(2))
        val lease = (claim as MediaUploadClaimResult.Claimed).lease
        val bytes = NormalizedMediaBytes.from(fixture.bytes)!!

        assertEquals(MediaDeleteRequestResult.Requested, fixture.repository.requestDelete(command.ownerId, command.assetId, MediaDeletePurpose.ORPHAN_GC, fixture.clock.instant()))
        val deletes = MediaDeleteWorker(fixture.repository, fixture.objects, SpringExternalMediaIoGuard(), fixture.clock, retryAfter = Duration.ofSeconds(5))
        assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
        assertTrue(fixture.objects.putIfAbsent(bytes, command.deterministicKey, command.normalizedDigest, MediaObjectMetadata.create(command.format, command.dimensions)!!) is PutOutcome.Stored)
        val present = fixture.objects.head(command.deterministicKey) as ObjectLookupOutcome.Present
        assertFalse(fixture.repository.confirmStored(lease, present, fixture.objects.kind, fixture.clock.instant()))

        fixture.clock.advance(Duration.ofSeconds(6))
        assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
        assertEquals(ObjectLookupOutcome.Absent, fixture.objects.head(command.deterministicKey))
    }

    @Test fun `expired delete claimant is fenced and reclaimed after crash`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        fixture.repository.registerUpload(command)
        val upload = MediaUploadWorker(fixture.repository, fixture.objects, SpringExternalMediaIoGuard(), fixture.clock)
        assertTrue(upload.executeRegistered(command, NormalizedMediaBytes.from(fixture.bytes)!!, UUID.randomUUID()) is MediaUploadRun.Stored)
        fixture.repository.requestDelete(command.ownerId, command.assetId, MediaDeletePurpose.USER_DELETE, fixture.clock.instant())

        val stale = fixture.repository.claimDelete(UUID.randomUUID(), fixture.clock.instant(), Duration.ofSeconds(1))!!
        fixture.clock.advance(Duration.ofSeconds(2))
        val fresh = fixture.repository.claimDelete(UUID.randomUUID(), fixture.clock.instant(), Duration.ofMinutes(1))!!
        assertTrue(fresh.fenceVersion > stale.fenceVersion)
        assertFalse(fixture.repository.settleDelete(stale, MediaDeleteOutcome.ALREADY_ABSENT, fixture.clock.instant(), Duration.ofSeconds(5)))
        assertEquals("DELETE_PENDING", fixture.jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, command.assetId.value))
        assertTrue(fixture.repository.settleDelete(fresh, MediaDeleteOutcome.ALREADY_ABSENT, fixture.clock.instant(), Duration.ofSeconds(5)))
    }

    @Test fun `concurrent delete claimers cannot own the same command`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        fixture.repository.registerUpload(command)
        fixture.repository.requestDelete(command.ownerId, command.assetId, MediaDeletePurpose.USER_DELETE, fixture.clock.instant())
        val repositories = listOf(runtimeRepository(fixture.url), runtimeRepository(fixture.url))
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val claims = repositories.map { repository ->
                pool.submit<MediaDeleteLease?> {
                    start.await()
                    repository.claimDelete(UUID.randomUUID(), fixture.clock.instant(), Duration.ofMinutes(1))
                }
            }
            start.countDown()
            assertEquals(1, claims.map { it.get() }.count { it != null })
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `workers reject external io while a transaction is active`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        fixture.repository.registerUpload(command)
        val worker = MediaUploadWorker(fixture.repository, fixture.objects, SpringExternalMediaIoGuard(), fixture.clock)
        val transactions = TransactionTemplate(DataSourceTransactionManager(requireNotNull(fixture.jdbc.dataSource)))
        assertThrows(IllegalStateException::class.java) {
            transactions.execute {
                worker.executeRegistered(command, NormalizedMediaBytes.from(fixture.bytes)!!, UUID.randomUUID())
            }
        }
        assertEquals(0, fixture.objects.size())
    }

    @Test fun `delete terminal states require explicit outcomes`() {
        val fixture = fixture()
        val command = fixture.command()
        fixture.repository.registerDraft(fixture.draft(command))
        fixture.repository.registerUpload(command)
        fixture.repository.requestDelete(command.ownerId, command.assetId, MediaDeletePurpose.USER_DELETE, fixture.clock.instant())
        assertThrows(Exception::class.java) {
            fixture.jdbc.update(
                "UPDATE media_delete_commands SET state='TOMBSTONED',tombstoned_at=clock_timestamp(),last_outcome=NULL WHERE asset_id=?",
                command.assetId.value,
            )
        }
        assertThrows(Exception::class.java) {
            fixture.jdbc.update(
                "UPDATE media_delete_commands SET state='BLOCKED',last_outcome=NULL WHERE asset_id=?",
                command.assetId.value,
            )
        }
    }

    @Test fun `composition CAS attaches managed media and preserves image identity while reordering`() {
        val fixture = fixture()
        val productId = fixture.product()
        val variantId = fixture.variant(productId)
        val legacyId = fixture.legacyImage(productId)
        val upload = fixture.storedUpload(productId)
        val composition = runtimeCompositionRepository(fixture.url)
        val managed = MediaImageReference.StagedAsset(upload.assetId)
        val legacy = MediaImageReference.ExistingProductImage(legacyId)
        val first = validComposition(
            listOf(
                ProductMediaCompositionEntry(legacy, 0, true, AltText.fromWire("Vista original")!!),
                ProductMediaCompositionEntry(managed, 1, false, AltText.fromWire("Vista lateral")!!),
            ),
            listOf(VariantMediaComposition(
                variantId,
                listOf(VariantMediaCompositionEntry(managed, 0, true)),
            )),
        )
        val saved = composition.replace(MediaCompositionCommand(
            fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(1)!!, first,
        )) as MediaCompositionResult.Saved
        val managedImageId = saved.snapshot.productImages.single { it.source is ProductMediaSource.Managed }.productImageId
        assertEquals(MediaCompositionRevision.fromWire(2), saved.snapshot.revision)
        assertEquals("ATTACHED", fixture.jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, upload.assetId.value))

        val second = validComposition(
            listOf(
                ProductMediaCompositionEntry(MediaImageReference.ExistingProductImage(managedImageId), 0, true, AltText.fromWire("Lateral principal")!!),
                ProductMediaCompositionEntry(legacy, 1, false, AltText.fromWire("Vista original")!!),
            ),
            listOf(VariantMediaComposition(
                variantId,
                listOf(VariantMediaCompositionEntry(MediaImageReference.ExistingProductImage(managedImageId), 0, true)),
            )),
        )
        val reordered = composition.replace(MediaCompositionCommand(
            fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(2)!!, second,
        )) as MediaCompositionResult.Saved
        assertEquals(managedImageId, reordered.snapshot.productImages.first().productImageId)
        assertEquals(legacyId, reordered.snapshot.productImages.last().productImageId)

        assertTrue(composition.replace(MediaCompositionCommand(
            fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(3)!!,
            validComposition(emptyList()),
        )) is MediaCompositionResult.Saved)
        assertEquals("STORED_PRIVATE", fixture.jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, upload.assetId.value))
        assertEquals("COMPLETED", fixture.jdbc.queryForObject("SELECT state FROM media_upload_commands WHERE asset_id=?", String::class.java, upload.assetId.value))
        assertTrue(composition.replace(MediaCompositionCommand(
            fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(4)!!,
            validComposition(listOf(
                ProductMediaCompositionEntry(managed, 0, true, AltText.fromWire("Publicada otra vez")!!),
            )),
        )) is MediaCompositionResult.Saved)
        assertEquals(4, fixture.jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='CATALOG_MEDIA_COMPOSITION_REPLACED'", Int::class.java))
    }

    @Test fun `legacy alt text outside the strict domain reads with a safe fallback`() {
        val fixture = fixture()
        val productId = fixture.product()
        val imageId = fixture.legacyImage(productId)
        fixture.jdbc.update("UPDATE product_images SET alt_text=? WHERE id=?", "Vista\nfrontal", imageId.value)
        val snapshot = runtimeCompositionRepository(fixture.url).read(productId)!!
        assertEquals("Imagen no disponible", snapshot.productImages.single().altText.value)
        assertEquals(MediaSourceKind.LEGACY_URL, snapshot.productImages.single().source.kind)
    }

    @Test fun `only one concurrent composition with the same revision wins`() {
        val fixture = fixture()
        val productId = fixture.product()
        val imageId = fixture.legacyImage(productId)
        val draftId = fixture.editDraft(productId)
        val composition = validComposition(listOf(
            ProductMediaCompositionEntry(MediaImageReference.ExistingProductImage(imageId), 0, true, AltText.fromWire("Vista frontal")!!),
        ))
        val repositories = listOf(runtimeCompositionRepository(fixture.url), runtimeCompositionRepository(fixture.url))
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val writes = repositories.map { repository ->
                pool.submit<MediaCompositionResult> {
                    start.await()
                    repository.replace(MediaCompositionCommand(
                        fixture.owner, draftId, productId, MediaCompositionRevision.fromWire(1)!!, composition,
                    ))
                }
            }
            start.countDown()
            val results = writes.map { it.get() }
            assertEquals(1, results.count { it is MediaCompositionResult.Saved })
            assertEquals(1, results.count { it == MediaCompositionResult.Conflict })
        } finally {
            pool.shutdownNow()
        }
        assertEquals(2, fixture.jdbc.queryForObject("SELECT media_revision FROM products WHERE id=?", Long::class.java, productId.value))
        assertEquals(1, fixture.jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='CATALOG_MEDIA_COMPOSITION_REPLACED'", Int::class.java))
    }

    @Test fun `two composition replacements remain valid inside one caller transaction`() {
        val fixture = fixture()
        val productId = fixture.product()
        val imageId = fixture.legacyImage(productId)
        val draftId = fixture.editDraft(productId)
        val runtimeConnection = DriverManager.getConnection(fixture.url, postgres.username, postgres.password).apply {
            createStatement().use { it.execute("SET ROLE storecore_runtime") }
        }
        val dataSource = SingleConnectionDataSource(runtimeConnection, true)
        val transactionManager = DataSourceTransactionManager(dataSource)
        val transactions = TransactionTemplate(transactionManager)
        val repository = JdbcMediaCompositionRepository(JdbcTemplate(dataSource), setOf("images.example.test"), transactions)
        transactions.execute {
            val first = validComposition(listOf(ProductMediaCompositionEntry(
                MediaImageReference.ExistingProductImage(imageId), 0, true, AltText.fromWire("Primera")!!,
            )))
            assertTrue(repository.replace(MediaCompositionCommand(
                fixture.owner, draftId, productId, MediaCompositionRevision.fromWire(1)!!, first,
            )) is MediaCompositionResult.Saved)
            val second = validComposition(listOf(ProductMediaCompositionEntry(
                MediaImageReference.ExistingProductImage(imageId), 0, true, AltText.fromWire("Segunda")!!,
            )))
            assertTrue(repository.replace(MediaCompositionCommand(
                fixture.owner, draftId, productId, MediaCompositionRevision.fromWire(2)!!, second,
            )) is MediaCompositionResult.Saved)
        }
        assertEquals("Segunda", fixture.jdbc.queryForObject("SELECT alt_text FROM product_images WHERE id=?", String::class.java, imageId.value))
    }

    @Test fun `attach and delete serialize through the same asset lock`() {
        val attachWins = fixture()
        val attachedProduct = attachWins.product()
        val attachedUpload = attachWins.storedUpload(attachedProduct)
        val attachedComposition = validComposition(listOf(
            ProductMediaCompositionEntry(MediaImageReference.StagedAsset(attachedUpload.assetId), 0, true, AltText.fromWire("Producto")!!),
        ))
        assertTrue(runtimeCompositionRepository(attachWins.url).replace(MediaCompositionCommand(
            attachWins.owner, attachedUpload.draftId, attachedProduct, MediaCompositionRevision.fromWire(1)!!, attachedComposition,
        )) is MediaCompositionResult.Saved)
        assertEquals(MediaDeleteRequestResult.Referenced, attachWins.repository.requestDelete(
            attachWins.owner, attachedUpload.assetId, MediaDeletePurpose.USER_DELETE, attachWins.clock.instant(),
        ))

        val deleteWins = fixture()
        val deletedProduct = deleteWins.product()
        val deletedUpload = deleteWins.storedUpload(deletedProduct)
        assertEquals(MediaDeleteRequestResult.Requested, deleteWins.repository.requestDelete(
            deleteWins.owner, deletedUpload.assetId, MediaDeletePurpose.USER_DELETE, deleteWins.clock.instant(),
        ))
        val rejectedComposition = validComposition(listOf(
            ProductMediaCompositionEntry(MediaImageReference.StagedAsset(deletedUpload.assetId), 0, true, AltText.fromWire("Producto")!!),
        ))
        assertEquals(MediaCompositionResult.AssetUnavailable, runtimeCompositionRepository(deleteWins.url).replace(MediaCompositionCommand(
            deleteWins.owner, deletedUpload.draftId, deletedProduct, MediaCompositionRevision.fromWire(1)!!, rejectedComposition,
        )))
        assertEquals(0, deleteWins.jdbc.queryForObject("SELECT count(*) FROM product_images WHERE product_id=?", Int::class.java, deletedProduct.value))
    }

    @Test fun `overlapping attach and GC request have one serializable winner`() {
        val fixture = fixture()
        val productId = fixture.product()
        val upload = fixture.storedUpload(productId)
        val composition = validComposition(listOf(
            ProductMediaCompositionEntry(MediaImageReference.StagedAsset(upload.assetId), 0, true, AltText.fromWire("Producto")!!),
        ))
        DriverManager.getConnection(fixture.url, postgres.username, postgres.password).use { blocker ->
            blocker.autoCommit = false
            blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                it.setObject(1, upload.assetId.value)
                it.executeQuery().use { result -> assertTrue(result.next()) }
            }
            val start = CountDownLatch(1)
            val pool = Executors.newFixedThreadPool(2)
            try {
                val attach = pool.submit<MediaCompositionResult> {
                    start.await()
                    runtimeCompositionRepository(fixture.url).replace(MediaCompositionCommand(
                        fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(1)!!, composition,
                    ))
                }
                val delete = pool.submit<MediaDeleteRequestResult> {
                    start.await()
                    runtimeRepository(fixture.url).requestDelete(
                        fixture.owner, upload.assetId, MediaDeletePurpose.ORPHAN_GC, fixture.clock.instant(),
                    )
                }
                start.countDown()
                Thread.sleep(200)
                blocker.commit()
                val attachResult = attach.get()
                val deleteResult = delete.get()
                val attachWon = attachResult is MediaCompositionResult.Saved && deleteResult == MediaDeleteRequestResult.Referenced
                val deleteWon = attachResult == MediaCompositionResult.AssetUnavailable && deleteResult == MediaDeleteRequestResult.Requested
                assertTrue(attachWon || deleteWon, "unexpected attach/delete results: $attachResult / $deleteResult")
                assertEquals(if (attachWon) 1 else 0, fixture.jdbc.queryForObject(
                    "SELECT count(*) FROM product_images WHERE media_asset_id=?", Int::class.java, upload.assetId.value,
                ))
                assertEquals(if (attachWon) "ATTACHED" else "DELETE_PENDING", fixture.jdbc.queryForObject(
                    "SELECT state FROM media_assets WHERE id=?", String::class.java, upload.assetId.value,
                ))
            } finally {
                pool.shutdownNow()
                blocker.rollback()
            }
        }
    }

    @Test fun `composition rejects a draft that expires while waiting for the asset lock`() {
        val fixture = fixture()
        val productId = fixture.product()
        val upload = fixture.storedUpload(productId)
        fixture.jdbc.update(
            "UPDATE catalog_media_drafts SET expires_at=clock_timestamp()+interval '400 milliseconds' WHERE id=?",
            upload.draftId.value,
        )
        val composition = validComposition(listOf(
            ProductMediaCompositionEntry(MediaImageReference.StagedAsset(upload.assetId), 0, true, AltText.fromWire("Producto")!!),
        ))
        DriverManager.getConnection(fixture.url, postgres.username, postgres.password).use { blocker ->
            blocker.autoCommit = false
            blocker.prepareStatement("SELECT id FROM media_assets WHERE id=? FOR UPDATE").use {
                it.setObject(1, upload.assetId.value)
                it.executeQuery().use { rows -> assertTrue(rows.next()) }
            }
            val pool = Executors.newSingleThreadExecutor()
            try {
                val result = pool.submit<MediaCompositionResult> {
                    runtimeCompositionRepository(fixture.url).replace(MediaCompositionCommand(
                        fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(1)!!, composition,
                    ))
                }
                fixture.jdbc.execute("SELECT pg_sleep(0.7)")
                assertFalse(result.isDone, "composition must still be waiting on the asset lock")
                blocker.commit()
                assertEquals(MediaCompositionResult.DraftClosed, result.get())
                assertEquals(0, fixture.jdbc.queryForObject(
                    "SELECT count(*) FROM product_images WHERE media_asset_id=?", Int::class.java, upload.assetId.value,
                ))
            } finally {
                pool.shutdownNow()
                blocker.rollback()
            }
        }
    }

    @Test fun `audit failure rolls back composition associations states and revision`() {
        val fixture = fixture()
        val productId = fixture.product()
        val upload = fixture.storedUpload(productId)
        fixture.jdbc.execute(
            """CREATE FUNCTION reject_media_composition_audit() RETURNS TRIGGER LANGUAGE plpgsql AS ${'$'}${'$'}
               BEGIN
                 IF NEW.event_type='CATALOG_MEDIA_COMPOSITION_REPLACED' THEN
                   RAISE EXCEPTION 'forced media audit failure';
                 END IF;
                 RETURN NEW;
               END; ${'$'}${'$'}""",
        )
        fixture.jdbc.execute(
            """CREATE TRIGGER trg_reject_media_composition_audit BEFORE INSERT ON audit_events
               FOR EACH ROW EXECUTE FUNCTION reject_media_composition_audit()""",
        )
        val composition = validComposition(listOf(
            ProductMediaCompositionEntry(MediaImageReference.StagedAsset(upload.assetId), 0, true, AltText.fromWire("Producto")!!),
        ))
        assertThrows(Exception::class.java) {
            runtimeCompositionRepository(fixture.url).replace(MediaCompositionCommand(
                fixture.owner, upload.draftId, productId, MediaCompositionRevision.fromWire(1)!!, composition,
            ))
        }
        assertEquals(1, fixture.jdbc.queryForObject("SELECT media_revision FROM products WHERE id=?", Long::class.java, productId.value))
        assertEquals(0, fixture.jdbc.queryForObject("SELECT count(*) FROM product_images WHERE product_id=?", Int::class.java, productId.value))
        assertEquals("STORED_PRIVATE", fixture.jdbc.queryForObject("SELECT state FROM media_assets WHERE id=?", String::class.java, upload.assetId.value))
        assertEquals("COMPLETED", fixture.jdbc.queryForObject("SELECT state FROM media_upload_commands WHERE asset_id=?", String::class.java, upload.assetId.value))
    }

    private fun fixture(): Fixture {
        val database = "media_commands_${UUID.randomUUID().toString().replace("-", "")}"
        postgres.createConnection("").use { it.createStatement().use { statement -> statement.execute("CREATE DATABASE $database") } }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/$database"
        Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val jdbc = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        val owner = user(jdbc, "owner-${UUID.randomUUID()}@example.test")
        val foreign = user(jdbc, "foreign-${UUID.randomUUID()}@example.test")
        val clock = MutableClock(Instant.now())
        return Fixture(url, jdbc, runtimeRepository(url), TestMediaObjectStore(clock), clock, owner, foreign)
    }

    private fun runtimeRepository(url: String): JdbcMediaCommandRepository {
        val runtimeConnection = DriverManager.getConnection(url, postgres.username, postgres.password).apply {
            createStatement().use { it.execute("SET ROLE storecore_runtime") }
        }
        return JdbcMediaCommandRepository(JdbcTemplate(SingleConnectionDataSource(runtimeConnection, true)))
    }

    private fun runtimeCompositionRepository(url: String): JdbcMediaCompositionRepository {
        val runtimeConnection = DriverManager.getConnection(url, postgres.username, postgres.password).apply {
            createStatement().use { it.execute("SET ROLE storecore_runtime") }
        }
        return JdbcMediaCompositionRepository(
            JdbcTemplate(SingleConnectionDataSource(runtimeConnection, true)),
            setOf("images.example.test"),
        )
    }

    private fun validComposition(
        product: List<ProductMediaCompositionEntry>,
        variants: List<VariantMediaComposition> = emptyList(),
    ): MediaComposition = (MediaComposition.create(product, variants) as MediaCompositionValidationResult.Valid).composition

    private fun user(jdbc: JdbcTemplate, email: String) = MediaOwnerId.fromWire(jdbc.queryForObject(
        "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,'${'$'}argon2id${'$'}fixture','Media','Owner') RETURNING id",
        Long::class.java, email,
    ))!!

    private data class Fixture(
        val url: String,
        val jdbc: JdbcTemplate,
        val repository: JdbcMediaCommandRepository,
        val objects: TestMediaObjectStore,
        val clock: MutableClock,
        val owner: MediaOwnerId,
        val foreignOwner: MediaOwnerId,
    ) {
        val bytes = "managed-media-fixture".toByteArray()
        fun command(
            draftId: CatalogMediaDraftId? = null,
            uploadId: UploadId? = null,
            normalizedSize: Long = bytes.size.toLong(),
            targetProductId: MediaProductId? = null,
        ): MediaUploadRegistration {
            val draft = draftId ?: CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
            val upload = uploadId ?: UploadId.fromWire(UUID.randomUUID().toString())!!
            val asset = UUID.randomUUID()
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            return MediaUploadRegistration.create(
                draft, owner, targetProductId, upload, MediaAssetId.fromWire(asset.toString())!!,
                ContentDigest.fromWire("b".repeat(64))!!,
                ContentDigest.fromWire(digest)!!, MediaFormat.WEBP, PixelDimensions.fromWire(800, 600)!!,
                MediaByteSize.fromWire(normalizedSize)!!, ProviderObjectKey.fromWire("catalog/${draft.value}/${upload.value}/${UUID.randomUUID()}")!!,
            )!!
        }
        fun reissued(command: MediaUploadRegistration): MediaUploadRegistration = MediaUploadRegistration.create(
            command.draftId, command.ownerId, command.targetProductId, command.uploadId,
            MediaAssetId.fromWire(UUID.randomUUID().toString())!!, command.originalDigest, command.normalizedDigest,
            command.format, command.dimensions, command.normalizedSize,
            ProviderObjectKey.fromWire("catalog/${command.draftId.value}/${command.uploadId.value}/${UUID.randomUUID()}")!!,
        )!!
        fun draft(command: MediaUploadRegistration) = MediaDraftRegistration(command.draftId, owner, command.targetProductId, clock.instant().plus(Duration.ofHours(1)))
        fun product(): MediaProductId = MediaProductId.fromWire(jdbc.queryForObject(
            "INSERT INTO products(name,slug,base_price) VALUES ('Media product',?,100) RETURNING id",
            Long::class.java, "media-${UUID.randomUUID()}",
        ))!!
        fun variant(productId: MediaProductId): MediaVariantId = MediaVariantId.fromWire(jdbc.queryForObject(
            "INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Base') RETURNING id",
            Long::class.java, productId.value, "SKU-${UUID.randomUUID()}",
        ))!!
        fun legacyImage(productId: MediaProductId): ProductImageId = ProductImageId.fromWire(jdbc.queryForObject(
            """INSERT INTO product_images(product_id,url,sort_order,is_primary,source_kind,alt_text)
               VALUES (?,'https://images.example.test/legacy.jpg',0,true,'LEGACY_URL','Legacy') RETURNING id""",
            Long::class.java, productId.value,
        ))!!
        fun editDraft(productId: MediaProductId): CatalogMediaDraftId {
            val id = CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
            assertEquals(MediaDraftRegistrationResult.Created, repository.registerDraft(
                MediaDraftRegistration(id, owner, productId, clock.instant().plus(Duration.ofHours(1))),
            ))
            return id
        }
        fun storedUpload(productId: MediaProductId): MediaUploadRegistration {
            val command = command(targetProductId = productId)
            assertEquals(MediaDraftRegistrationResult.Created, repository.registerDraft(draft(command)))
            assertTrue(MediaUploadWorker(repository, objects, SpringExternalMediaIoGuard(), clock).executeRegistered(
                command, NormalizedMediaBytes.from(bytes)!!, UUID.randomUUID(),
            ) is MediaUploadRun.Stored)
            return command
        }
    }

    private class MutableClock(private var current: Instant) : Clock() {
        override fun getZone(): ZoneId = ZoneId.of("UTC")
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = current
        fun advance(duration: Duration) { current = current.plus(duration) }
    }
}
