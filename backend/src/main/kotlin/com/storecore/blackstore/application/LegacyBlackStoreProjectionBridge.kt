package com.storecore.blackstore.application

import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.stereotype.Service

/**
 * PIC-009 bridge. Delegates a local desired-stock cause when the caller already
 * verified MARKETPLACE_ML is ACTIVE in the same transaction (TASK-DSP-009 / issue #96).
 * Empty ids or [ProjectionSourceCause.Unknown] stay fail-closed. Never writes `LISTING_STOCK`.
 */
@Service
class LegacyBlackStoreProjectionBridge(
    private val projection: DesiredStockProjectionUseCase,
) : LegacyBlackStoreProjectionBridgePort {
    override fun requestProjection(
        variantIds: Collection<Long>,
        cause: ProjectionSourceCause,
    ): LegacyBlackStoreProjectionResult {
        if (variantIds.isEmpty() || cause === ProjectionSourceCause.Unknown) {
            return LegacyBlackStoreProjectionResult.NOT_ELIGIBLE
        }
        projection.project(variantIds, cause, CapabilityActor.System)
        return LegacyBlackStoreProjectionResult.DELEGATED
    }
}
