package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.JdbcMediaCommandRepository
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
        ): MediaUploadRegistration {
            val draft = draftId ?: CatalogMediaDraftId.fromWire(UUID.randomUUID().toString())!!
            val upload = uploadId ?: UploadId.fromWire(UUID.randomUUID().toString())!!
            val asset = UUID.randomUUID()
            val digest = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            return MediaUploadRegistration.create(
                draft, owner, null, upload, MediaAssetId.fromWire(asset.toString())!!,
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
        fun draft(command: MediaUploadRegistration) = MediaDraftRegistration(command.draftId, owner, null, clock.instant().plus(Duration.ofHours(1)))
    }

    private class MutableClock(private var current: Instant) : Clock() {
        override fun getZone(): ZoneId = ZoneId.of("UTC")
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = current
        fun advance(duration: Duration) { current = current.plus(duration) }
    }
}
