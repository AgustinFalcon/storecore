package com.storecore.commerce.application.port

import com.storecore.commerce.domain.DesiredStockProjectionResult

fun interface DesiredStockProjectionObserver {
    fun record(results: List<DesiredStockProjectionResult>)

    companion object {
        val NoOp = DesiredStockProjectionObserver { }
    }
}
