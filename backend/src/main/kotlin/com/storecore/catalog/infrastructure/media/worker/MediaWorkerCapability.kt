package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.application.media.MediaByteNormalizer

enum class MediaWorkerCapabilityState(val wire: String) {
    READY("READY"),
    UNAVAILABLE("UNAVAILABLE"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): MediaWorkerCapabilityState =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

sealed interface MediaWorkerCapability {
    val state: MediaWorkerCapabilityState

    class Ready private constructor(
        val normalizer: MediaByteNormalizer,
        val isolation: LinuxIsolationAttestation.Matched,
        val attestation: MediaWorkerAttestationResult,
    ) : MediaWorkerCapability {
        override val state = MediaWorkerCapabilityState.READY

        companion object {
            fun create(
                normalizer: MediaByteNormalizer?,
                isolation: LinuxIsolationAttestation.Matched?,
                attestation: MediaWorkerAttestationResult?,
            ): Ready? =
                if (
                    normalizer == null ||
                    isolation == null ||
                    attestation !is MediaWorkerAttestationResult.Matched
                ) {
                    null
                } else {
                    Ready(normalizer, isolation, attestation)
                }
        }
    }

    data object Unavailable : MediaWorkerCapability {
        override val state = MediaWorkerCapabilityState.UNAVAILABLE
    }

    data object Unknown : MediaWorkerCapability {
        override val state = MediaWorkerCapabilityState.UNKNOWN
    }
}
