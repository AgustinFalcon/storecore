package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID

class MediaWorkerSelfTestTest {
    @TempDir lateinit var workspace: Path

    @Test
    fun `SELF_TEST roundtrip is separate from unchanged NORMALIZE codec`() = withExecutingJar {
        val input = MediaWorkerTestFixtures.image("png")
        val normalize = MediaWorkerTestFixtures.request(input)
        val normalizeBytes = MediaWorkerProtocolCodec.encodeRequest(normalize)
        assertEquals(MediaWorkerOperation.NORMALIZE, MediaWorkerProtocolCodec.decodeOperation(normalizeBytes))
        assertEquals(normalize.requestId, MediaWorkerProtocolCodec.decodeRequest(normalizeBytes)?.requestId)

        val request = selfTestRequest()
        val requestBytes = MediaWorkerSelfTestCodec.encodeRequest(request)
        assertEquals(MediaWorkerOperation.SELF_TEST, MediaWorkerProtocolCodec.decodeOperation(requestBytes))
        val decodedRequest = requireNotNull(MediaWorkerSelfTestCodec.decodeRequest(requestBytes))
        assertEquals(request.challengeId, decodedRequest.challengeId)
        assertArrayEquals(request.nonce(), decodedRequest.nonce())

        val observed = assertInstanceOf(MediaWorkerSelfTestResult.Observed::class.java, MediaWorkerSelfTest.run(request))
        val decodedReport = requireNotNull(MediaWorkerSelfTestCodec.decodeReport(MediaWorkerSelfTestCodec.encodeReport(observed.report)))
        assertEquals(request.challengeId, decodedReport.challengeId)
        assertArrayEquals(request.nonce(), decodedReport.nonce())
        assertEquals(9, decodedReport.fingerprint.moduleVersions.size)
        assertTrue(
            decodedReport.fingerprint.moduleVersions
                .filter { it.module.startsWith("com.twelvemonkeys.") }
                .all { it.version == "3.15.3" },
        )
        assertEquals(
            MediaWorkerAttestationResult.Matched,
            MediaWorkerAttestationEvaluator.evaluate(expectation(observed.report), decodedReport),
        )
    }

    @Test
    fun `evaluator rejects drifted java vendor inventory and jar hash`() = withExecutingJar {
        val report = observedReport()
        val expected = expectation(report)
        val fingerprint = report.fingerprint

        val vendorDrift = reportWith(
            report,
            fingerprintWith(fingerprint, javaVendor = "${fingerprint.javaVendor}-drift"),
        )
        val inventoryDrift = reportWith(
            report,
            fingerprintWith(fingerprint, providers = fingerprint.providers.drop(1).toSet()),
        )
        val jarHash = fingerprint.jarSha256().also { it[0] = (it[0].toInt() xor 1).toByte() }
        val jarDrift = reportWith(report, fingerprintWith(fingerprint, jarSha256 = jarHash))

        listOf(vendorDrift, inventoryDrift, jarDrift).forEach {
            assertEquals(MediaWorkerAttestationResult.Unavailable, MediaWorkerAttestationEvaluator.evaluate(expected, it))
        }
    }

    @Test
    fun `digest and nonce comparisons use the constant time primitive`() {
        val digest = ByteArray(32) { it.toByte() }
        assertTrue(MediaWorkerAttestationEvaluator.constantTimeEqual(digest, digest.copyOf()))
        assertFalse(MediaWorkerAttestationEvaluator.constantTimeEqual(digest, digest.copyOf().also { it[31] = 99 }))
    }

    @Test
    fun `WorkerMain performs SELF_TEST in process and creates only result`() = withExecutingJar {
        val request = selfTestRequest()
        Files.write(workspace.resolve("request.bin"), MediaWorkerSelfTestCodec.encodeRequest(request))

        assertEquals(0, MediaNormalizerWorkerMain.run(workspace))
        val report = requireNotNull(MediaWorkerSelfTestCodec.decodeReport(Files.readAllBytes(workspace.resolve("result.bin"))))
        assertEquals(request.challengeId, report.challengeId)
        assertArrayEquals(request.nonce(), report.nonce())
        assertFalse(Files.exists(workspace.resolve("output.bin")))
        assertArrayEquals(
            MediaWorkerRuntimeFingerprint.sha256(Files.readAllBytes(executingJar)),
            report.fingerprint.jarSha256(),
        )
    }

    private lateinit var executingJar: Path

    private fun <T> withExecutingJar(block: () -> T): T {
        executingJar = Files.createTempFile("worker-under-test", ".jar")
        Files.write(executingJar, "packaged-worker-fixture".toByteArray())
        val old = System.getProperty(MediaWorkerRuntimeFingerprint.JAR_PATH_PROPERTY)
        System.setProperty(MediaWorkerRuntimeFingerprint.JAR_PATH_PROPERTY, executingJar.toString())
        return try {
            block()
        } finally {
            if (old == null) System.clearProperty(MediaWorkerRuntimeFingerprint.JAR_PATH_PROPERTY)
            else System.setProperty(MediaWorkerRuntimeFingerprint.JAR_PATH_PROPERTY, old)
            Files.deleteIfExists(executingJar)
        }
    }

    private fun selfTestRequest(): MediaWorkerSelfTestRequest = requireNotNull(
        MediaWorkerSelfTestRequest.create(
            UUID.fromString("91b9d4ac-9d2f-4ad9-a72e-08ba530b57c0"),
            ByteArray(32) { (it + 17).toByte() },
        ),
    )

    private fun observedReport(): MediaWorkerSelfTestReport {
        val result = assertInstanceOf(MediaWorkerSelfTestResult.Observed::class.java, MediaWorkerSelfTest.run(selfTestRequest()))
        return result.report
    }

    private fun reportWith(
        source: MediaWorkerSelfTestReport,
        fingerprint: MediaWorkerRuntimeFingerprint,
    ): MediaWorkerSelfTestReport = requireNotNull(
        MediaWorkerSelfTestReport.create(source.challengeId, source.nonce(), fingerprint),
    )

    private fun fingerprintWith(
        source: MediaWorkerRuntimeFingerprint,
        javaVendor: String = source.javaVendor,
        providers: Set<com.storecore.catalog.media.worker.supply.ImageIoProviderRecord> = source.providers,
        jarSha256: ByteArray = source.jarSha256(),
    ): MediaWorkerRuntimeFingerprint = requireNotNull(
        MediaWorkerRuntimeFingerprint.create(
            javaVendor,
            source.javaRuntimeVersion,
            source.operatingSystem,
            source.architecture,
            source.moduleVersions,
            providers,
            jarSha256,
            source.profileSha256(),
            source.corpusSha256(),
        ),
    )

    private fun expectation(report: MediaWorkerSelfTestReport): MediaWorkerSelfTestExpectation = requireNotNull(
        MediaWorkerSelfTestExpectation.create(report.challengeId, report.nonce(), report.fingerprint),
    )
}
