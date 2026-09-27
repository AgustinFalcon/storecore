package com.storecore.blackstore.application

import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import org.springframework.stereotype.Service

/**
 * Fail-closed PIC-009 bridge. There is no canonical projector or PIC-005 GO in this build, so the
 * legacy flow cannot change desired stock or create another LISTING_STOCK outbox record.
 */
@Service
class LegacyBlackStoreProjectionBridge : LegacyBlackStoreProjectionBridgePort {
    override fun requestProjection(reservationRef: String?): LegacyBlackStoreProjectionResult =
        LegacyBlackStoreProjectionResult.NOT_ELIGIBLE
}
