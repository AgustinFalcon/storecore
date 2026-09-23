package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.application.port.BlackStoreMlListingPort
import org.springframework.stereotype.Component

@Component
class DisabledBlackStoreMlListingAdapter : BlackStoreMlListingPort {
    override fun enqueueDesiredQuantityAfterBlackStore(reservationRef: String?): Boolean = false
}
