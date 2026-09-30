package com.storecore.configuration.domain

sealed class CapabilityAdminOperation(val wire: String) {
    val label: String get() = wire

    data object ChangeState : CapabilityAdminOperation("CHANGE_STATE")
    data object KillCreate : CapabilityAdminOperation("KILL_CREATE")
    data object KillReplace : CapabilityAdminOperation("KILL_REPLACE")
    data object KillRemove : CapabilityAdminOperation("KILL_REMOVE")
    class Unknown(raw: String) : CapabilityAdminOperation(if (raw.isBlank()) "UNKNOWN" else raw)

    companion object {
        fun fromWire(raw: String?): CapabilityAdminOperation = when (raw?.trim()) {
            "CHANGE_STATE" -> ChangeState
            "KILL_CREATE" -> KillCreate
            "KILL_REPLACE" -> KillReplace
            "KILL_REMOVE" -> KillRemove
            else -> Unknown(raw?.trim().orEmpty())
        }
    }
}
