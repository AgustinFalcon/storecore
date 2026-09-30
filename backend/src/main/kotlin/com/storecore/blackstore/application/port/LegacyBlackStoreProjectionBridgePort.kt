package com.storecore.blackstore.application.port

import com.storecore.commerce.domain.ProjectionSourceCause

/**
 * Application boundary for the retired PIC-009 stock writer.
 *
 * After TASK-DSP-009 the implementation may delegate to
 * [com.storecore.commerce.application.DesiredStockProjectionUseCase] inside the saga
 * transaction when MARKETPLACE_ML is ACTIVE. Callers that pass an empty id set or
 * [ProjectionSourceCause.Unknown] stay [LegacyBlackStoreProjectionResult.NOT_ELIGIBLE].
 * This port never writes `LISTING_STOCK`, opens a dispatcher, or activates the companion.
 */
fun interface LegacyBlackStoreProjectionBridgePort {
    fun requestProjection(
        variantIds: Collection<Long>,
        cause: ProjectionSourceCause,
    ): LegacyBlackStoreProjectionResult
}

enum class LegacyBlackStoreProjectionResult {
    NOT_ELIGIBLE,
    DELEGATED,
}
