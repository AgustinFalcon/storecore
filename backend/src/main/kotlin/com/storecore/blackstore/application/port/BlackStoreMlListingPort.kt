package com.storecore.blackstore.application.port

fun interface BlackStoreMlListingPort {
    fun enqueueDesiredQuantityAfterBlackStore(reservationRef: String?): Boolean
}
