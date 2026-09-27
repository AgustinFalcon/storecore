package com.storecore.blackstore.application.port

/**
 * Application boundary for the retired PIC-009 stock writer.
 *
 * A future implementation may delegate only after the canonical projection use case exists and
 * PIC-005 has a separate GO. Until then callers receive [LegacyBlackStoreProjectionResult.NOT_ELIGIBLE].
 */
fun interface LegacyBlackStoreProjectionBridgePort {
    fun requestProjection(reservationRef: String?): LegacyBlackStoreProjectionResult
}

enum class LegacyBlackStoreProjectionResult {
    NOT_ELIGIBLE,
}
