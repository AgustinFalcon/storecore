package com.storecore.blackstore.application.port

import com.storecore.blackstore.domain.VerifiedCompanionPrincipal

sealed class CompanionVerifyResult {
    class Verified(val principal: VerifiedCompanionPrincipal) : CompanionVerifyResult()
    data object Invalid : CompanionVerifyResult()
    data object ProviderUnavailable : CompanionVerifyResult()
}

interface CompanionCredentialVerifier {
    fun verify(rawBearer: ByteArray): CompanionVerifyResult
}
