package com.storecore.commerce.domain

class ProjectionState private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ProjectionState && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    fun isWithheld(): Boolean = this === Withheld

    companion object {
        val Withheld = ProjectionState("WITHHELD")
        val Emitted = ProjectionState("EMITTED")
        val Unknown = ProjectionState("unknown")
        private val known = listOf(Withheld, Emitted)
        fun fromWire(raw: String?): ProjectionState {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
