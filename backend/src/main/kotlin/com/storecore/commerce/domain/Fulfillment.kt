package com.storecore.commerce.domain

import java.math.BigDecimal

enum class FulfillmentEligibility { ELIGIBLE, DELIVERY_UNVERIFIED, ORDER_NOT_PAID, PAYMENT_NOT_VERIFIED, REVERSAL_OR_INCIDENT, STOCK_NOT_VERIFIED;
    fun withPayment(payment: OrderFact<PaymentStatus>): FulfillmentEligibility = when {
        this == ORDER_NOT_PAID || this == REVERSAL_OR_INCIDENT -> this
        payment.state != OrderFactState.KNOWN -> PAYMENT_NOT_VERIFIED
        payment.value in listOf(PaymentStatus.REFUNDED, PaymentStatus.CHARGED_BACK, PaymentStatus.CANCELLED) -> REVERSAL_OR_INCIDENT
        payment.value != PaymentStatus.APPROVED -> PAYMENT_NOT_VERIFIED
        else -> this
    }
}
data class SoldItem(val variantId: Long, val quantity: Int)
data class StockConsumption(val reservationId: Long?, val variantId: Long, val quantity: Int, val consumedVariantId: Long?, val consumedQuantity: Int?, val reservationConsumed: Boolean, val saleCount: Int)
data class PaymentAccreditation(val paymentStatus: PaymentStatus, val sameOrder: Boolean, val sameProvider: Boolean, val attemptAccredited: Boolean, val paymentAmount: BigDecimal, val attemptAmount: BigDecimal, val confirmedAmount: BigDecimal, val paymentCurrency: String, val attemptCurrency: String, val confirmedCurrency: String)
data class FulfillmentSnapshot(val orderStatus: OrderStatus, val total: BigDecimal, val currency: String, val accreditations: List<PaymentAccreditation>, val blockedByReview: Boolean, val items: List<SoldItem>, val consumptions: List<StockConsumption>, val contradictoryPayment: Boolean = false, val deliveryDecision:DeliveryDecision = DeliveryDecision.Legacy)

object FulfillmentPolicy {
    fun evaluate(snapshot: FulfillmentSnapshot): FulfillmentEligibility {
        if(!snapshot.deliveryDecision.allowsFulfillment()) return FulfillmentEligibility.DELIVERY_UNVERIFIED
        if (snapshot.orderStatus != OrderStatus.PAID) return FulfillmentEligibility.ORDER_NOT_PAID
        val payment = snapshot.accreditations.singleOrNull() ?: return FulfillmentEligibility.PAYMENT_NOT_VERIFIED
        if (payment.paymentStatus != PaymentStatus.APPROVED || !payment.sameOrder || !payment.sameProvider || !payment.attemptAccredited ||
            listOf(payment.paymentAmount, payment.attemptAmount, payment.confirmedAmount).any { it.compareTo(snapshot.total) != 0 } ||
            listOf(payment.paymentCurrency, payment.attemptCurrency, payment.confirmedCurrency).any { it != snapshot.currency }) return FulfillmentEligibility.PAYMENT_NOT_VERIFIED
        if (snapshot.blockedByReview) return FulfillmentEligibility.REVERSAL_OR_INCIDENT
        if (snapshot.contradictoryPayment) return FulfillmentEligibility.PAYMENT_NOT_VERIFIED
        if (snapshot.items.isEmpty() || snapshot.items.any { it.quantity <= 0 } || snapshot.items.map { it.variantId }.distinct().size != snapshot.items.size) return FulfillmentEligibility.STOCK_NOT_VERIFIED
        val sales = snapshot.consumptions
        if (sales.size != snapshot.items.size || sales.map { it.reservationId }.distinct().size != sales.size ||
            sales.any { it.reservationId == null || !it.reservationConsumed || it.saleCount != 1 || it.variantId != it.consumedVariantId || it.quantity != it.consumedQuantity || it.quantity <= 0 } ||
            snapshot.items.toSet() != sales.map { SoldItem(it.variantId, it.quantity) }.toSet()) return FulfillmentEligibility.STOCK_NOT_VERIFIED
        return FulfillmentEligibility.ELIGIBLE
    }
}

interface ShipmentStep { val command: ShipmentCommand; val target: ShipmentStatus; fun accepts(current: ShipmentStatus): Boolean }
object PackShipment : ShipmentStep { override val command = ShipmentCommand.PACKED; override val target = ShipmentStatus.PREPARING; override fun accepts(current: ShipmentStatus) = current == ShipmentStatus.NOT_CREATED || current == ShipmentStatus.PENDING }
object ShipShipment : ShipmentStep { override val command = ShipmentCommand.SHIPPED; override val target = ShipmentStatus.SHIPPED; override fun accepts(current: ShipmentStatus) = current == ShipmentStatus.PREPARING }
object DeliverShipment : ShipmentStep { override val command = ShipmentCommand.DELIVERED; override val target = ShipmentStatus.DELIVERED; override fun accepts(current: ShipmentStatus) = current == ShipmentStatus.SHIPPED }
object ReadyPickup : ShipmentStep { override val command=ShipmentCommand.READY_FOR_PICKUP; override val target=ShipmentStatus.READY_FOR_PICKUP; override fun accepts(current:ShipmentStatus)=current==ShipmentStatus.PREPARING }
object CollectPickup : ShipmentStep { override val command=ShipmentCommand.PICKED_UP; override val target=ShipmentStatus.PICKED_UP; override fun accepts(current:ShipmentStatus)=current==ShipmentStatus.READY_FOR_PICKUP }
object ShipmentJourney {
    private fun steps(decision:DeliveryDecision):List<ShipmentStep> = when(decision.state) {
        DeliverySnapshotState.INVALID -> emptyList()
        DeliverySnapshotState.LEGACY_MISSING_BLOCK -> listOf(PackShipment,ShipShipment,DeliverShipment)
        DeliverySnapshotState.KNOWN -> when(decision.resolvedMode()) {
            DeliveryMode.PICKUP -> listOf(PackShipment,ReadyPickup,CollectPickup)
            DeliveryMode.LOCAL_DELIVERY -> listOf(PackShipment,ShipShipment,DeliverShipment)
            DeliveryMode.UNKNOWN -> emptyList()
        }
    }
    fun next(current:ShipmentStatus,decision:DeliveryDecision=DeliveryDecision.Legacy)=steps(decision).singleOrNull { it.accepts(current) }
    fun transition(current:ShipmentStatus,command:ShipmentCommand,decision:DeliveryDecision=DeliveryDecision.Legacy)=steps(decision).singleOrNull { it.command==command && it.accepts(current) }
}
object ReceiveReturn {
    fun completed(shipment:ShipmentStatus,decision:DeliveryDecision)=when(decision.state) {
        DeliverySnapshotState.INVALID -> false
        DeliverySnapshotState.LEGACY_MISSING_BLOCK -> shipment==ShipmentStatus.DELIVERED
        DeliverySnapshotState.KNOWN -> when(decision.resolvedMode()) {
            DeliveryMode.PICKUP -> shipment==ShipmentStatus.PICKED_UP
            DeliveryMode.LOCAL_DELIVERY -> shipment==ShipmentStatus.DELIVERED
            DeliveryMode.UNKNOWN -> false
        }
    }
    fun accepts(shipment:ShipmentStatus,rma:RmaStatus,command:RmaCommand,decision:DeliveryDecision=DeliveryDecision.Legacy)=completed(shipment,decision) && rma==RmaStatus.NONE && command==RmaCommand.RECEIVED
}
