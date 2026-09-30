package com.storecore.blackstore.application.port

import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole

data class CompanionCredentialRecord(
    val companionId: Long,
    val clientInstanceId: java.util.UUID,
    val companionStatus: CompanionLifecycleStatus,
    val credentialId: Long,
    val credentialVersion: Int,
    val credentialStatus: String,
    val authReady: Boolean,
    val secretRef: String,
    val scopes: Set<CompanionScope>,
    val serviceRole: CompanionServiceRole,
)

fun interface CompanionCredentialLookup {
    fun findByFingerprint(fingerprint: String): CompanionCredentialRecord?
}
