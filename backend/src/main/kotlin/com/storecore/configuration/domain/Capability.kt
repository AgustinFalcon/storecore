package com.storecore.configuration.domain

import com.storecore.identity.domain.InternalUserPrincipal

enum class CapabilityState {
    DISABLED, READ_ONLY, ACTIVE, PAUSED, ERROR, Unknown;

    companion object {
        fun fromWire(raw: String?): CapabilityState = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown
    }
}

enum class CapabilityActionKind { READ, WRITE, PUBLISH, STATUS, HEALTH }

sealed interface CapabilityActor {
    data object Public : CapabilityActor
    data object System : CapabilityActor
    data class Internal(val principal: InternalUserPrincipal) : CapabilityActor
}

data class CapabilityModuleView(
    val module: InstallationCapabilityModule,
    val state: CapabilityState,
    val configVersion: Int,
)
