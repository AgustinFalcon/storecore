package com.storecore.blackstore.application.port

interface BlackStoreMlListingPort {
    fun enqueueDesiredQuantityAfterBlackStore(reservationRef: String?): Boolean
}
