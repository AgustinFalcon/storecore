package com.storecore.configuration.domain

import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.domain.CustomerPrincipal

enum class CapabilityState(val wire: String) {
    DISABLED("DISABLED"),
    READ_ONLY("READ_ONLY"),
    ACTIVE("ACTIVE"),
    PAUSED("PAUSED"),
    ERROR("ERROR"),
    UNKNOWN("unknown"),
    ;

    val isKnown: Boolean get() = this != UNKNOWN

    companion object {
        fun fromWire(raw: String?): CapabilityState = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

enum class CapabilityActionKind { READ, WRITE, PUBLISH, STATUS, HEALTH }

sealed interface CapabilityActor {
    data object Public : CapabilityActor
    data object System : CapabilityActor
    data class Internal(val principal: InternalUserPrincipal) : CapabilityActor
    data class Customer(val principal: CustomerPrincipal) : CapabilityActor
}

data class CapabilityModuleView(
    val module: InstallationCapabilityModule,
    val state: CapabilityState,
    val configVersion: Int,
)
