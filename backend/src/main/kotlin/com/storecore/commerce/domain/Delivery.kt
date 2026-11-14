package com.storecore.commerce.domain

import com.storecore.catalog.domain.ArsAmount
import java.math.BigDecimal

enum class DeliveryMode(val requiresAddress:Boolean) {
    PICKUP(false), LOCAL_DELIVERY(true), UNKNOWN(false);
    companion object { fun fromWire(raw:Any?)=entries.firstOrNull { it.name==raw } ?: UNKNOWN }
}
enum class DeliverySnapshotState { KNOWN, LEGACY_MISSING_BLOCK, INVALID }
data class DeliveryAddress(val street:String,val number:String,val city:String,val province:String,val postalCode:String)
sealed class DeliveryDestination {
    data class Pickup(val location:String):DeliveryDestination()
    data class Address(val address:DeliveryAddress):DeliveryDestination()
    fun value():Any=when(this) { is Pickup -> location; is Address -> address }
}
data class DeliveryOption(val mode:DeliveryMode,val label:String,val cost:BigDecimal,val minDays:Int,val maxDays:Int,val configurationVersion:Int,val destination:String?,val instructions:String?) {
    val requiresAddress get()=mode.requiresAddress
    val currency get()=PaymentCurrency.ARS
}
class DeliveryPolicySnapshot(val mode:DeliveryMode,val label:String,val cost:BigDecimal,val minDays:Int,val maxDays:Int,val configurationVersion:Int,private val target:DeliveryDestination,val instructions:String?) {
    val requiresAddress get()=mode.requiresAddress
    val currency get()=PaymentCurrency.ARS
    val destination get()=target.value()
}
class DeliveryDecision private constructor(val state:DeliverySnapshotState,val value:DeliveryPolicySnapshot?) {
    fun resolvedMode()=value?.mode ?: DeliveryMode.UNKNOWN
    fun allowsFulfillment()=state!=DeliverySnapshotState.INVALID
    companion object {
        fun known(value:DeliveryPolicySnapshot)=DeliveryDecision(DeliverySnapshotState.KNOWN,value)
        val Legacy=DeliveryDecision(DeliverySnapshotState.LEGACY_MISSING_BLOCK,null)
        val Invalid=DeliveryDecision(DeliverySnapshotState.INVALID,null)
    }
}

/** One boundary translator for policy documents and immutable delivery evidence. */
object DeliveryPolicyTranslator {
    private fun text(raw:Any?,max:Int)= (raw as? String)?.takeIf { it.isNotBlank() && it.length<=max }
    private fun days(raw:Any?):Int? {
        val value=raw as? Number ?: return null
        return value.toString().takeIf { Regex("(?:0|[1-9][0-9]*)").matches(it) }?.toLongOrNull()?.takeIf { it<=Int.MAX_VALUE }?.toInt()
    }
    fun policy(raw:Any?,version:Int):List<DeliveryOption>? {
        val doc=raw as? Map<*,*> ?: return null
        if(version<=0 || doc.keys!=setOf("pickup","localDelivery")) return null
        val result=mutableListOf<DeliveryOption>()
        for((key,mode) in listOf("pickup" to DeliveryMode.PICKUP,"localDelivery" to DeliveryMode.LOCAL_DELIVERY)) {
            val row=doc[key] as? Map<*,*> ?: return null
            val enabled=row["enabled"] as? Boolean ?: return null
            if(!enabled) { if(row.keys!=setOf("enabled")) return null; continue }
            val keys=setOf("enabled","label","cost","minDays","maxDays") + if(mode==DeliveryMode.PICKUP) setOf("destination","instructions") else emptySet()
            if(row.keys!=keys) return null
            val label=text(row["label"],200) ?: return null
            val cost=ArsAmount.fromWire(row["cost"])?.value ?: return null
            val min=days(row["minDays"]) ?: return null
            val max=days(row["maxDays"])?.takeIf { it>=min } ?: return null
            val destination=if(mode==DeliveryMode.PICKUP) text(row["destination"],1000) ?: return null else null
            val instructions=if(mode==DeliveryMode.PICKUP) text(row["instructions"],2000) ?: return null else null
            result+=DeliveryOption(mode,label,cost,min,max,version,destination,instructions)
        }
        return result
    }
    fun address(raw:Any?):DeliveryAddress? {
        val row=raw as? Map<*,*> ?: return null
        return DeliveryAddress(text(row["street"],160) ?: return null,text(row["number"],20) ?: return null,text(row["city"],100) ?: return null,text(row["province"],100) ?: return null,text(row["postalCode"],20) ?: return null)
    }
    fun snapshot(present:Boolean,raw:Any?):DeliveryDecision {
        if(!present) return DeliveryDecision.Legacy
        val row=raw as? Map<*,*> ?: return DeliveryDecision.Invalid
        if(row.keys!=setOf("mode","label","cost","currency","minDays","maxDays","requiresAddress","configurationVersion","destination","instructions")) return DeliveryDecision.Invalid
        val mode=DeliveryMode.fromWire(row["mode"])
        val version=days(row["configurationVersion"])?.takeIf { it>0 } ?: return DeliveryDecision.Invalid
        val label=text(row["label"],200) ?: return DeliveryDecision.Invalid
        val cost=ArsAmount.fromWire(row["cost"])?.value ?: return DeliveryDecision.Invalid
        val min=days(row["minDays"]) ?: return DeliveryDecision.Invalid
        val max=days(row["maxDays"])?.takeIf { it>=min } ?: return DeliveryDecision.Invalid
        if(mode==DeliveryMode.UNKNOWN || row["requiresAddress"]!=mode.requiresAddress || row["currency"]!=PaymentCurrency.ARS.name) return DeliveryDecision.Invalid
        val destination=when(mode) {
            DeliveryMode.PICKUP -> DeliveryDestination.Pickup(text(row["destination"],1000) ?: return DeliveryDecision.Invalid)
            DeliveryMode.LOCAL_DELIVERY -> DeliveryDestination.Address(address(row["destination"]) ?: return DeliveryDecision.Invalid)
            DeliveryMode.UNKNOWN -> return DeliveryDecision.Invalid
        }
        val instructions=if(mode==DeliveryMode.PICKUP) text(row["instructions"],2000) ?: return DeliveryDecision.Invalid else if(row["instructions"]==null) null else return DeliveryDecision.Invalid
        return DeliveryDecision.known(DeliveryPolicySnapshot(mode,label,cost,min,max,version,destination,instructions))
    }
}
