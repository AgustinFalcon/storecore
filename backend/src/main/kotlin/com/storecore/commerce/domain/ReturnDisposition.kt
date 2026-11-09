package com.storecore.commerce.domain

import java.util.UUID

enum class ReturnDisposition { RESTOCK, DAMAGED, REJECTED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
enum class DamageReason { COSMETIC, FUNCTIONAL, MISSING_PARTS, UNSAFE, OTHER, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
enum class RejectionReason { NOT_OUR_ITEM, SERIAL_MISMATCH, OUT_OF_POLICY, INCOMPLETE_RETURN, OTHER, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
enum class ReturnDispositionState { EDITABLE, CONFIRMED, HISTORICAL_INCOMPLETE, UNAVAILABLE, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
enum class DispositionRejection {
    INVALID_PARTITION, INVALID_REASON, INVALID_OBSERVATION, ITEM_SET_MISMATCH,
    EVIDENCE_UNAVAILABLE, RETURN_NOT_RECEIVED, ALREADY_CONFIRMED, IDEMPOTENCY_CONFLICT, HISTORICAL_INCOMPLETE
}

data class DispositionQuantities(val restock: Int, val damaged: Int, val rejected: Int) {
    fun matches(received: Int) = received > 0 && restock >= 0 && damaged >= 0 && rejected >= 0 &&
        restock.toLong() + damaged.toLong() + rejected.toLong() == received.toLong()
}
data class ReturnDispositionLine(
    val returnItemId: Long,
    val quantities: DispositionQuantities,
    val damageReason: DamageReason?,
    val rejectionReason: RejectionReason?,
    val observation: String?,
)
data class ReturnDispositionCommand(val idempotencyKey: UUID, val lines: List<ReturnDispositionLine>)

/** Inspection decides classification only; inventory effects belong to the apply step. */
object InspectReturn {
    fun reject(expected: Map<Long, Int>, lines: List<ReturnDispositionLine>): DispositionRejection? {
        if (expected.isEmpty() || lines.size != expected.size || lines.map { it.returnItemId }.toSet() != expected.keys ||
            lines.map { it.returnItemId }.distinct().size != lines.size) return DispositionRejection.ITEM_SET_MISMATCH
        for (line in lines) {
            if (!line.quantities.matches(expected.getValue(line.returnItemId))) return DispositionRejection.INVALID_PARTITION
            if ((line.quantities.damaged > 0) != (line.damageReason != null) || line.damageReason == DamageReason.UNKNOWN ||
                (line.quantities.rejected > 0) != (line.rejectionReason != null) || line.rejectionReason == RejectionReason.UNKNOWN) return DispositionRejection.INVALID_REASON
            if (line.observation != null && (line.observation.length > 500 || line.observation != line.observation.trim())) return DispositionRejection.INVALID_OBSERVATION
        }
        return null
    }
}

object ApplyReturnDisposition {
    fun reject(status: RmaStatus, shipment: ShipmentStatus, evidence: FulfillmentEligibility): DispositionRejection? = when {
        status != RmaStatus.RETURN_RECEIVED -> DispositionRejection.RETURN_NOT_RECEIVED
        shipment != ShipmentStatus.DELIVERED || evidence != FulfillmentEligibility.ELIGIBLE -> DispositionRejection.EVIDENCE_UNAVAILABLE
        else -> null
    }
}
