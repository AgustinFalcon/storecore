package com.storecore.loyalty.domain

private fun canonicalLong(raw: String?): Long? = raw
    ?.takeIf { it.matches(Regex("0|[1-9][0-9]*")) }
    ?.toLongOrNull()

@JvmInline
value class LoyaltyPoints private constructor(val value: Long) {
    companion object {
        fun fromWire(raw: String?): LoyaltyPoints? = canonicalLong(raw)?.let(::LoyaltyPoints)
        internal fun of(value: Long): LoyaltyPoints? = value.takeIf { it >= 0 }?.let(::LoyaltyPoints)
    }
}

@JvmInline
value class LoyaltyMinorUnits private constructor(val value: Long) {
    companion object {
        fun fromWire(raw: String?): LoyaltyMinorUnits? = canonicalLong(raw)?.let(::LoyaltyMinorUnits)
        internal fun of(value: Long): LoyaltyMinorUnits? = value.takeIf { it >= 0 }?.let(::LoyaltyMinorUnits)
    }
}

@JvmInline
value class LoyaltyRevision private constructor(val value: Long) {
    fun next(): LoyaltyRevision? = if (value == Long.MAX_VALUE) null else LoyaltyRevision(value + 1)

    companion object {
        fun fromWire(raw: String?): LoyaltyRevision? = canonicalLong(raw)?.let(::LoyaltyRevision)
    }
}

private inline fun <reified T : Enum<T>> closed(raw: String?, unknown: T): T =
    enumValues<T>().firstOrNull { it.name == raw } ?: unknown

enum class LoyaltyUnit {
    POINT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyUnit = closed(raw, UNKNOWN) }
}

enum class LoyaltyPolicyId(val wire: String) {
    V1("loyalty-policy-v1"), UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): LoyaltyPolicyId = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

enum class LoyaltyMovement(val label: String) {
    EARN("Puntos obtenidos"), REDEEM("Puntos canjeados"), EXPIRE("Puntos vencidos"),
    REVERSAL("Corrección de puntos"), MANUAL_ADJUSTMENT("Ajuste de puntos"), UNKNOWN("Desconocido");
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyMovement = closed(raw, UNKNOWN) }
}

enum class LoyaltyReservationState(val label: String) {
    QUOTED("Puntos reservados"), PAYMENT_PENDING("Pago pendiente"),
    RECONCILIATION_REQUIRED("Requiere conciliación"), COMMITTED("Canje confirmado"),
    RELEASED("Puntos liberados"), EXPIRED("Reserva vencida"), UNKNOWN("Desconocido");
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReservationState = closed(raw, UNKNOWN) }
}

enum class LoyaltyReversalReason {
    EARN_REDUCTION, REDEEM_RESTORATION, RECOVERY_SETTLEMENT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReversalReason = closed(raw, UNKNOWN) }
}

enum class LoyaltyManualDirection {
    CREDIT, DEBIT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyManualDirection = closed(raw, UNKNOWN) }
}

enum class LoyaltySource {
    PAYMENT_ACCREDITATION, REDEMPTION, EXPIRY, LOYALTY_CORRECTION, ADMIN_ADJUSTMENT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltySource = closed(raw, UNKNOWN) }
}

enum class LoyaltyReconciliationKind {
    RESERVATION_AUTHORITY, EARNING_AUTHORITY, CORRECTION_AUTHORITY, HELD_CORRECTION, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReconciliationKind = closed(raw, UNKNOWN) }
}

enum class LoyaltyReconciliationState {
    OPEN, RESOLVED_EFFECT_APPLIED, RESOLVED_NO_EFFECT, BLOCKED_CONFLICT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReconciliationState = closed(raw, UNKNOWN) }
}

enum class LoyaltyReconciliationEffect {
    COMMIT_RESERVATION, RELEASE_RESERVATION, CREDIT_EARNING, APPLY_CORRECTION, NO_EFFECT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReconciliationEffect = closed(raw, UNKNOWN) }
}

enum class LoyaltyReconciliationOperation {
    RECHECK, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReconciliationOperation = closed(raw, UNKNOWN) }
}

enum class LoyaltyReleaseReason {
    CUSTOMER_CANCELLED, PAYMENT_REJECTED, PAYMENT_CANCELLED, ORDER_CANCELLED, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyReleaseReason = closed(raw, UNKNOWN) }
}

enum class LoyaltyItemClassification {
    STANDARD, OUTLET, GIFT_VALUE, LOYALTY_VALUE, UNKNOWN;
    val wire: String get() = name
    val isEligible: Boolean get() = this == STANDARD
    companion object { fun fromWire(raw: String?): LoyaltyItemClassification = closed(raw, UNKNOWN) }
}

enum class LoyaltyOutcome {
    APPLIED, INSUFFICIENT_BALANCE, REVISION_CONFLICT, INVALID_STATE, INVALID_DEFINITION,
    POLICY_MISMATCH, CART_CHANGED, INELIGIBLE, STACKING_FORBIDDEN, RECONCILIATION_REQUIRED,
    REVISION_EXHAUSTED, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyOutcome = closed(raw, UNKNOWN) }
}

enum class LoyaltyDiscountState {
    NONE, PRESENT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyDiscountState = closed(raw, UNKNOWN) }
}
