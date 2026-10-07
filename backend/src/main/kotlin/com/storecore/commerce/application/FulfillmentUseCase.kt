package com.storecore.commerce.application

import com.storecore.commerce.domain.*

interface FulfillmentEvidencePort { fun load(orderId: Long): FulfillmentSnapshot }

interface FulfillmentRecordPort {
    fun shipmentStatus(orderId: Long): ShipmentStatus
    fun rmaStatus(orderId: Long): RmaStatus
    fun saveShipment(orderId: Long, step: ShipmentStep, tracking: String?, actorId: Long)
    fun receiveReturn(orderId: Long)
}

class FulfillmentUseCase(private val evidence: FulfillmentEvidencePort, private val records: FulfillmentRecordPort) {
    fun shipment(orderId: Long, command: ShipmentCommand, tracking: String?, actorId: Long) {
        requireEligible(orderId)
        val step = ShipmentJourney.transition(records.shipmentStatus(orderId), command) ?: throw FulfillmentRejected()
        records.saveShipment(orderId, step, tracking, actorId)
    }
    fun receive(orderId: Long, command: RmaCommand) {
        requireEligible(orderId)
        if (!ReceiveReturn.accepts(records.shipmentStatus(orderId), records.rmaStatus(orderId), command)) throw FulfillmentRejected()
        records.receiveReturn(orderId)
    }
    private fun requireEligible(orderId: Long) {
        if (records.rmaStatus(orderId) == RmaStatus.UNKNOWN || FulfillmentPolicy.evaluate(evidence.load(orderId)) != FulfillmentEligibility.ELIGIBLE) throw FulfillmentRejected()
    }
}
