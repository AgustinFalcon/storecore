package com.storecore.blackstore.domain

sealed class CompanionAdminOperation(val wire: String) {
    val label: String get() = wire

    data object Pair : CompanionAdminOperation("PAIR")
    data object Rotate : CompanionAdminOperation("ROTATE")
    data object Activate : CompanionAdminOperation("ACTIVATE")
    data object Suspend : CompanionAdminOperation("SUSPEND")
    data object Revoke : CompanionAdminOperation("REVOKE")
    class Unknown(raw: String) : CompanionAdminOperation(if (raw.isBlank()) "UNKNOWN" else raw)

    companion object {
        fun fromWire(raw: String?): CompanionAdminOperation = when (raw?.trim()) {
            "PAIR" -> Pair
            "ROTATE" -> Rotate
            "ACTIVATE" -> Activate
            "SUSPEND" -> Suspend
            "REVOKE" -> Revoke
            else -> Unknown(raw?.trim().orEmpty())
        }
    }
}
