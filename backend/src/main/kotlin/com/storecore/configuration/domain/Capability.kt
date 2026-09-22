package com.storecore.configuration.domain

import com.storecore.identity.domain.InternalUserPrincipal

enum class CapabilityState { DISABLED, READ_ONLY, ACTIVE, PAUSED, ERROR }

enum class CapabilityActionKind { READ, WRITE, PUBLISH, STATUS, HEALTH }

sealed interface CapabilityActor {
    data object Public : CapabilityActor
    data object System : CapabilityActor
    data class Internal(val principal: InternalUserPrincipal) : CapabilityActor
}

data class CapabilityModuleView(val module: String, val state: CapabilityState, val configVersion: Int)
