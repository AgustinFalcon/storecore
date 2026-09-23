package com.storecore.blackstore.application.port

import com.storecore.blackstore.BlackStoreRateLimiter

fun interface BlackStoreRateLimitPort {
    fun check(identity: String, scope: BlackStoreRateLimiter.Scope)
}
