package com.storecore.catalog.infrastructure.media.worker

import java.security.MessageDigest
import java.util.UUID

class MediaWorkerSelfTestExpectation private constructor(
    val challengeId: UUID,
    nonce: ByteArray,
    val fingerprint: MediaWorkerRuntimeFingerprint,
) {
    private val nonceValue = nonce.copyOf()
    fun nonce(): ByteArray = nonceValue.copyOf()

    companion object {
        fun create(
            challengeId: UUID?,
            nonce: ByteArray?,
            expectedFingerprint: MediaWorkerRuntimeFingerprint?,
        ): MediaWorkerSelfTestExpectation? =
            if (challengeId == null || nonce?.size != 32 || expectedFingerprint == null) null
            else MediaWorkerSelfTestExpectation(challengeId, nonce.copyOf(), expectedFingerprint)
    }
}

sealed interface MediaWorkerAttestationResult {
    data object Matched : MediaWorkerAttestationResult
    data object Unavailable : MediaWorkerAttestationResult
    data object Unknown : MediaWorkerAttestationResult
}

object MediaWorkerAttestationEvaluator {
    fun evaluate(
        expected: MediaWorkerSelfTestExpectation?,
        observed: MediaWorkerSelfTestReport?,
    ): MediaWorkerAttestationResult {
        if (expected == null) return MediaWorkerAttestationResult.Unknown
        if (observed == null) return MediaWorkerAttestationResult.Unavailable
        return runCatching {
            if (expected.challengeId != observed.challengeId) return MediaWorkerAttestationResult.Unavailable
            if (!constantTimeEqual(expected.nonce(), observed.nonce())) return MediaWorkerAttestationResult.Unavailable
            if (!matches(expected.fingerprint, observed.fingerprint)) return MediaWorkerAttestationResult.Unavailable
            MediaWorkerAttestationResult.Matched
        }.getOrDefault(MediaWorkerAttestationResult.Unknown)
    }

    private fun matches(expected: MediaWorkerRuntimeFingerprint, observed: MediaWorkerRuntimeFingerprint): Boolean {
        if (expected.javaVendor != observed.javaVendor) return false
        if (expected.javaRuntimeVersion != observed.javaRuntimeVersion) return false
        if (expected.operatingSystem != observed.operatingSystem || expected.architecture != observed.architecture) return false
        if (expected.moduleVersions != observed.moduleVersions) return false
        if (expected.providers != observed.providers) return false
        if (!constantTimeEqual(expected.jarSha256(), observed.jarSha256())) return false
        if (!constantTimeEqual(expected.profileSha256(), observed.profileSha256())) return false
        val expectedCorpus = expected.corpusSha256()
        val observedCorpus = observed.corpusSha256()
        if (expectedCorpus.keys != observedCorpus.keys) return false
        return expectedCorpus.all { (name, digest) ->
            observedCorpus[name]?.let { constantTimeEqual(digest, it) } == true
        }
    }

    internal fun constantTimeEqual(expected: ByteArray, observed: ByteArray): Boolean =
        MessageDigest.isEqual(expected, observed)
}
