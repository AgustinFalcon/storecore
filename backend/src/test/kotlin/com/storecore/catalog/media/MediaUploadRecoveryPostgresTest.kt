package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.SpringExternalMediaIoGuard
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MediaUploadRecoveryPostgresTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @BeforeAll fun start() = postgres.start()
        @JvmStatic @AfterAll fun stop() = postgres.stop()
        private val crashedLease = Duration.ofSeconds(30)
        private val pastCrashedLease = Duration.ofMinutes(5)
    }

    @Test fun `crash after put before Tx-B is recovered by head without a second object or row`() {
        val f = fixture()
        val command = f.registered()
        val crashed = f.claim(command, crashedLease)
        assertTrue(f.objects.putIfAbsent(f.normalizedBytes(), crashed.deterministicKey, command.normalizedDigest, f.metadata(command)) is PutOutcome.Stored)

        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker().runOne(UUID.randomUUID()), "a live lease belongs to its claimant")
        f.clock.advance(pastCrashedLease)
        val recovered = f.recoveryWorker().runOne(UUID.randomUUID()) as MediaUploadRecoveryRun.Recovered
        assertEquals(MediaAssetState.STORED_PRIVATE, recovered.snapshot.assetState)
        assertEquals(MediaCommandState.COMPLETED, recovered.snapshot.state)

        val present = f.objects.head(crashed.deterministicKey) as ObjectLookupOutcome.Present
        assertFalse(f.commands.confirmStored(crashed, present, f.objects.kind, f.clock.instant()))
        assertFalse(f.commands.retryUpload(crashed, f.clock.instant()))

        val lostResponse = f.reissued(command)
        val replay = f.commands.registerUpload(lostResponse) as MediaUploadRegistrationResult.Replay
        assertEquals(command.assetId, replay.snapshot.assetId)
        assertTrue(f.uploadWorker().executeRegistered(lostResponse, f.normalizedBytes(), UUID.randomUUID()) is MediaUploadRun.Replay)
        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker().runOne(UUID.randomUUID()))
        assertSingleUpload(f)
    }

    @Test fun `crash before put returns to awaiting bytes and the owner resend stores once`() {
        val f = fixture()
        val command = f.registered()
        val crashed = f.claim(command, crashedLease)
        f.clock.advance(pastCrashedLease)

        assertEquals(MediaUploadRecoveryRun.AwaitingBytes, f.recoveryWorker().runOne(UUID.randomUUID()))
        assertEquals(MediaCommandState.AWAITING_BYTES, f.commandState(command))
        assertEquals(MediaAssetState.AWAITING_BYTES, f.assetState(command))
        assertEquals(crashed.fenceVersion + 1, f.fence(command))
        assertEquals(0, f.objects.size(), "recovery never invents bytes")
        assertFalse(f.commands.retryUpload(crashed, f.clock.instant()))
        assertFalse(f.commands.failUpload(crashed, MediaFailureCode.STORAGE_UNAVAILABLE, f.clock.instant()))

        assertTrue(f.uploadWorker().executeRegistered(command, f.normalizedBytes(), UUID.randomUUID()) is MediaUploadRun.Stored)
        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker().runOne(UUID.randomUUID()))
        assertSingleUpload(f)
    }

    @Test fun `crash after Tx-B replays the committed snapshot without recovery work`() {
        val f = fixture()
        val command = f.stored()
        val fence = f.fence(command)

        val lostResponse = f.reissued(command)
        val replay = f.commands.registerUpload(lostResponse) as MediaUploadRegistrationResult.Replay
        assertEquals(MediaCommandState.COMPLETED, replay.snapshot.state)
        assertEquals(MediaAssetState.STORED_PRIVATE, replay.snapshot.assetState)
        assertTrue(f.uploadWorker().executeRegistered(lostResponse, f.normalizedBytes(), UUID.randomUUID()) is MediaUploadRun.Replay)
        f.clock.advance(pastCrashedLease)
        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker().runOne(UUID.randomUUID()))
        assertEquals(fence, f.fence(command))
        assertSingleUpload(f)
    }

    @Test fun `unreadable store defers recovery and the next sweep fences the lease again`() {
        val f = fixture()
        val command = f.registered()
        val crashed = f.claim(command, crashedLease)
        f.objects.putIfAbsent(f.normalizedBytes(), crashed.deterministicKey, command.normalizedDigest, f.metadata(command))
        f.clock.advance(pastCrashedLease)
        val store = ScriptedLookupStore(f.objects, ObjectLookupOutcome.Unavailable)

        assertEquals(MediaUploadRecoveryRun.Deferred, f.recoveryWorker(store).runOne(UUID.randomUUID()))
        assertEquals(MediaCommandState.CLAIMED, f.commandState(command))
        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker(store).runOne(UUID.randomUUID()), "deferred lease stays owned until it expires")

        store.lookup = ObjectLookupOutcome.Unknown
        f.clock.advance(Duration.ofMinutes(3))
        assertEquals(MediaUploadRecoveryRun.Deferred, f.recoveryWorker(store).runOne(UUID.randomUUID()))
        store.lookup = null
        f.clock.advance(Duration.ofMinutes(3))
        assertTrue(f.recoveryWorker(store).runOne(UUID.randomUUID()) is MediaUploadRecoveryRun.Recovered)
        assertEquals(crashed.fenceVersion + 3, f.fence(command))
        assertSingleUpload(f)
    }

    @Test fun `digest mismatch and unproven objects fail closed without deleting provider bytes`() {
        val f = fixture()
        val mismatched = f.registered()
        val mismatchedLease = f.claim(mismatched, crashedLease)
        f.objects.putIfAbsent(f.normalizedBytes(), mismatchedLease.deterministicKey, mismatched.normalizedDigest, f.metadata(mismatched))
        val unproven = f.registered()
        val unprovenLease = f.claim(unproven, crashedLease)
        f.objects.putIfAbsent(
            f.normalizedBytes(), unprovenLease.deterministicKey, unproven.normalizedDigest,
            MediaObjectMetadata.create(MediaFormat.PNG, unproven.dimensions)!!,
        )
        f.clock.advance(pastCrashedLease)

        val store = ScriptedLookupStore(f.objects, ObjectLookupOutcome.DigestMismatch)
        assertEquals(MediaUploadRecoveryRun.Failed, f.recoveryWorker(store).runOne(UUID.randomUUID()))
        store.lookup = null
        assertEquals(MediaUploadRecoveryRun.Failed, f.recoveryWorker(store).runOne(UUID.randomUUID()))
        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker(store).runOne(UUID.randomUUID()))
        for (command in listOf(mismatched, unproven)) {
            assertEquals(MediaAssetState.FAILED, f.assetState(command))
            assertEquals(MediaFailureCode.SCOPE_CONFLICT, f.failureCode(command))
            assertEquals(MediaCommandState.FAILED, f.commandState(command))
        }
        assertEquals(2, f.objects.size())
        assertEquals(0, f.count("media_delete_commands"))
    }

    @Test fun `concurrent recovery sweepers fence one stale upload once`() {
        val f = fixture()
        val command = f.registered()
        val crashed = f.claim(command, crashedLease)
        f.clock.advance(pastCrashedLease)
        val sweepers = listOf(f.runtimeCommands(), f.runtimeCommands())
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val claims = sweepers.map { repository ->
                pool.submit<MediaUploadLease?> {
                    start.await()
                    repository.claimStaleUpload(UUID.randomUUID(), f.clock.instant(), Duration.ofMinutes(2))
                }
            }
            start.countDown()
            val leases = claims.mapNotNull { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, leases.size)
            assertEquals(crashed.fenceVersion + 1, leases.single().fenceVersion)
            assertEquals(crashed.fenceVersion + 1, f.fence(command))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `sweeper skips a draft held by a human transaction without waiting`() {
        val f = fixture()
        val held = f.registered()
        f.claim(held, crashedLease)
        val free = f.registered()
        f.claim(free, crashedLease)
        f.clock.advance(pastCrashedLease)
        f.runtimeConnection().use { human ->
            human.autoCommit = false
            human.prepareStatement("SELECT id FROM catalog_media_drafts WHERE id=? FOR UPDATE").use {
                it.setObject(1, held.draftId.value)
                it.executeQuery().use { rows -> assertTrue(rows.next()) }
            }
            try {
                val started = System.nanoTime()
                val lease = requireNotNull(f.commands.claimStaleUpload(UUID.randomUUID(), f.clock.instant(), Duration.ofMinutes(2)))
                assertEquals(free.uploadId, lease.snapshot.uploadId)
                assertNull(f.commands.claimStaleUpload(UUID.randomUUID(), f.clock.instant(), Duration.ofMinutes(2)))
                assertTrue(Duration.ofNanos(System.nanoTime() - started) < Duration.ofSeconds(5), "SKIP LOCKED must not wait on the human draft lock")
            } finally {
                human.rollback()
            }
        }
        assertEquals(held.uploadId, f.commands.claimStaleUpload(UUID.randomUUID(), f.clock.instant(), Duration.ofMinutes(2))?.snapshot?.uploadId)
    }

    @Test fun `recovery leaves closed and elapsed drafts to orphan cleanup`() {
        val f = fixture()
        val product = f.product()
        val closed = listOf(CatalogMediaDraftState.EXPIRED, CatalogMediaDraftState.ABANDONED, CatalogMediaDraftState.CLAIMED).map { state ->
            f.registered(target = product).also { command ->
                f.claim(command, crashedLease)
                f.jdbc.update("UPDATE catalog_media_drafts SET state=? WHERE id=?", state.wire, command.draftId.value)
            }
        }
        val elapsed = f.registered().also { command ->
            f.claim(command, crashedLease)
            f.jdbc.update("UPDATE catalog_media_drafts SET expires_at=clock_timestamp() WHERE id=?", command.draftId.value)
        }
        f.clock.advance(pastCrashedLease)

        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker().runOne(UUID.randomUUID()))
        for (command in closed + elapsed) {
            assertEquals(MediaCommandState.CLAIMED, f.commandState(command))
            assertEquals(MediaAssetState.AWAITING_BYTES, f.assetState(command))
        }
    }

    @Test fun `user delete during recovery fences the recovery lease and the late object is removed`() {
        val f = fixture()
        val command = f.registered()
        val crashed = f.claim(command, crashedLease)
        f.objects.putIfAbsent(f.normalizedBytes(), crashed.deterministicKey, command.normalizedDigest, f.metadata(command))
        f.clock.advance(pastCrashedLease)
        val recovery = requireNotNull(f.commands.claimStaleUpload(UUID.randomUUID(), f.clock.instant(), Duration.ofMinutes(2)))

        assertEquals(MediaDeleteRequestResult.Requested, f.commands.requestDelete(f.owner, command.assetId, MediaDeletePurpose.USER_DELETE, f.clock.instant()))
        val present = f.objects.head(recovery.deterministicKey) as ObjectLookupOutcome.Present
        assertFalse(f.commands.confirmStored(recovery, present, f.objects.kind, f.clock.instant()))
        assertEquals(MediaCommandState.DELETE_PENDING, f.commandState(command))

        val deletes = MediaDeleteWorker(f.commands, f.objects, SpringExternalMediaIoGuard(), f.clock)
        assertEquals(MediaDeleteRun.Tombstoned, deletes.runOne(UUID.randomUUID()))
        assertEquals(ObjectLookupOutcome.Absent, f.objects.head(recovery.deterministicKey))
        assertEquals(MediaAssetState.DELETED, f.assetState(command))
        assertEquals(MediaUploadRecoveryRun.Idle, f.recoveryWorker().runOne(UUID.randomUUID()))
    }

    @Test fun `recovery rejects external io while a transaction is active`() {
        val f = fixture()
        val command = f.registered()
        f.claim(command, crashedLease)
        f.clock.advance(pastCrashedLease)
        val transactions = TransactionTemplate(DataSourceTransactionManager(requireNotNull(f.jdbc.dataSource)))
        assertThrows(IllegalStateException::class.java) {
            transactions.execute { f.recoveryWorker().runOne(UUID.randomUUID()) }
        }
        assertEquals(MediaCommandState.CLAIMED, f.commandState(command))
    }

    private fun assertSingleUpload(f: MediaCommandFixture) {
        assertEquals(1, f.objects.size())
        assertEquals(1, f.count("media_assets"))
        assertEquals(1, f.count("media_upload_commands"))
    }

    private fun fixture() = MediaCommandFixture.create(postgres, "media_recovery")

    private class ScriptedLookupStore(
        private val delegate: TestMediaObjectStore,
        var lookup: ObjectLookupOutcome?,
    ) : MediaObjectStore by delegate {
        override fun head(deterministicKey: ProviderObjectKey): ObjectLookupOutcome = lookup ?: delegate.head(deterministicKey)
    }
}
