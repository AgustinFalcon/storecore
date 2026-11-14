package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.*

object DeliverySnapshotJson {
    fun decode(mapper:ObjectMapper,raw:String?):DeliveryDecision = runCatching {
        if(raw==null) return DeliveryDecision.Invalid
        val doc=mapper.readValue(raw,object:TypeReference<Map<String,Any?>>() {})
        if(!doc.containsKey("delivery") && doc.containsKey("commandFingerprint")) DeliveryDecision.Invalid
        else DeliveryPolicyTranslator.snapshot(doc.containsKey("delivery"),doc["delivery"])
    }.getOrElse { DeliveryDecision.Invalid }
}
