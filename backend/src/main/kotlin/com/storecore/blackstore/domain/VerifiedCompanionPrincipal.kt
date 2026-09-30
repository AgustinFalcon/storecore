package com.storecore.blackstore.domain

import java.util.UUID

class VerifiedCompanionPrincipal internal constructor(
    val clientInstanceId: UUID,
    val companionId: Long,
    val credentialId: Long,
    val credentialVersion: Int,
    val serviceRole: CompanionServiceRole,
    val scopes: Set<CompanionScope>,
    val companionStatus: CompanionLifecycleStatus,
) {
    fun has(scope: CompanionScope): Boolean = scope != CompanionScope.Unknown && scope in scopes

    companion object {
        const val REQUEST_ATTR = "storecore.verifiedCompanionPrincipal"
    }
}
