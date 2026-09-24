package com.storecore.blackstore.application.port

import com.storecore.blackstore.BlackStoreOperationReceipt
import com.storecore.blackstore.BlackStoreQuadruple
import com.storecore.blackstore.BlackStoreReconcileResult
import com.storecore.blackstore.BlackStoreReserveLine

interface BlackStoreSagaPort {
    fun reserve(quadruple: BlackStoreQuadruple, catalogVersion: String, lines: List<BlackStoreReserveLine>): BlackStoreOperationReceipt
    fun commit(quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt
    fun release(quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt
    fun get(quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt
    fun reconcile(knownReceipts: List<String>): BlackStoreReconcileResult
    fun expireDue(limit: Int = 100): Int
    fun purgeDue(limit: Int = 100): Int
}
