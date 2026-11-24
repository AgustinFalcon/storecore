package com.storecore.notification.domain

enum class NotificationSeverity(val wire: String, val label: String) {
    INFO("INFO", "Información"), WARNING("WARNING", "Advertencia"), CRITICAL("CRITICAL", "Crítica"), UNKNOWN("UNKNOWN", "Desconocida");
    companion object { fun fromWire(raw: String?): NotificationSeverity = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN }
}

enum class NotificationCategory(val wire: String, val label: String) {
    STOCK("STOCK", "Stock"), ORDER("ORDER", "Pedido"), PAYMENT("PAYMENT", "Pago"), RETURN("RETURN", "Devolución"),
    INTEGRATION("INTEGRATION", "Integración"), CAMPAIGN("CAMPAIGN", "Campaña"), UNKNOWN("UNKNOWN", "Desconocida");
    companion object { fun fromWire(raw: String?): NotificationCategory = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN }
}

enum class NotificationSourceType(val wire: String, val label: String) {
    STORECORE_FACT("STORECORE_FACT", "Hecho de StoreCore"), BLACKSTORE_STOCK_RECEIPT("BLACKSTORE_STOCK_RECEIPT", "Recepción de stock de BlackStore"),
    SYSTEM_CAMPAIGN("SYSTEM_CAMPAIGN", "Campaña del sistema"), UNKNOWN("UNKNOWN", "Desconocida");
    companion object { fun fromWire(raw: String?): NotificationSourceType = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN }
}

enum class NotificationLifecycle(val wire: String, val label: String) {
    OPEN("OPEN", "Abierta"), ACKNOWLEDGED("ACKNOWLEDGED", "Reconocida"), RESOLVED("RESOLVED", "Resuelta"), UNKNOWN("UNKNOWN", "Desconocida");
    fun availableSteps(): List<NotificationTransitionStep> = NotificationTransitionStep.known.filter { it.accepts(this) }
    companion object { fun fromWire(raw: String?): NotificationLifecycle = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN }
}

/** Each command owns its rule. Adding a step does not rewrite another step. */
sealed class NotificationTransitionStep(val wire: String, val label: String, val target: NotificationLifecycle) {
    abstract fun accepts(current: NotificationLifecycle): Boolean
    data object Acknowledge : NotificationTransitionStep("ACKNOWLEDGE", "Reconocer", NotificationLifecycle.ACKNOWLEDGED) {
        override fun accepts(current: NotificationLifecycle) = current == NotificationLifecycle.OPEN
    }
    data object Resolve : NotificationTransitionStep("RESOLVE", "Resolver", NotificationLifecycle.RESOLVED) {
        override fun accepts(current: NotificationLifecycle) = current == NotificationLifecycle.OPEN || current == NotificationLifecycle.ACKNOWLEDGED
    }
    data object Reopen : NotificationTransitionStep("REOPEN", "Reabrir", NotificationLifecycle.OPEN) {
        override fun accepts(current: NotificationLifecycle) = current == NotificationLifecycle.RESOLVED
    }
    data object Unknown : NotificationTransitionStep("UNKNOWN", "Desconocida", NotificationLifecycle.UNKNOWN) {
        override fun accepts(current: NotificationLifecycle) = false
    }
    companion object {
        val known: List<NotificationTransitionStep> get() = listOf(Acknowledge, Resolve, Reopen)
        fun fromWire(raw: String?): NotificationTransitionStep = known.firstOrNull { it.wire == raw } ?: Unknown
    }
}
