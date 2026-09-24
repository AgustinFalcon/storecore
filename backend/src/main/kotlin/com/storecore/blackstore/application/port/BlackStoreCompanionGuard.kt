package com.storecore.blackstore.application.port

import java.util.UUID

interface BlackStoreCompanionGuard {
    fun assertNoLiveTraffic()
    fun assertBound(clientInstanceId: UUID)
}
