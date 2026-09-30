package com.storecore.blackstore.application.port

import com.storecore.blackstore.BlackStoreOperationReceipt
import com.storecore.blackstore.BlackStoreQuadruple
import com.storecore.blackstore.BlackStoreReconcileResult
import com.storecore.blackstore.BlackStoreReserveLine
import com.storecore.blackstore.PriceOverrideAttempt
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal

interface BlackStoreSagaPort {
    fun reserve(
        principal: VerifiedCompanionPrincipal,
        quadruple: BlackStoreQuadruple,
        catalogVersion: String,
        lines: List<BlackStoreReserveLine>,
        override: PriceOverrideAttempt? = null,
    ): BlackStoreOperationReceipt
    fun commit(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt
    fun release(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt
    fun get(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt
    fun reconcile(principal: VerifiedCompanionPrincipal, knownReceipts: List<String>): BlackStoreReconcileResult
    fun expireDue(limit: Int = 100): Int
    fun deleteStalePending(): Int
    fun purgeDue(limit: Int = 100): Int
}
