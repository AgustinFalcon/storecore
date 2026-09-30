package com.storecore.blackstore.application.port

import com.storecore.blackstore.domain.VerifiedCompanionPrincipal

interface PosCompanionGuardPort {
    fun authorizeForEffect(principal: VerifiedCompanionPrincipal, action: String)
    fun authorizeForRead(principal: VerifiedCompanionPrincipal, action: String)
}
