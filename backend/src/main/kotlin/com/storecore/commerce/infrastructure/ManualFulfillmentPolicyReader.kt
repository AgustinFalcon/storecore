package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class ManualFulfillmentPolicyReader(private val jdbc:JdbcTemplate,private val mapper:ObjectMapper) {
    fun options(lock:Boolean=false):List<DeliveryOption> {
        val rows=jdbc.query("SELECT state,config_schema_version,config_version,config::text FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'"+if(lock) " FOR SHARE" else "",{rs,_->
            if(com.storecore.configuration.domain.CapabilityState.fromWire(rs.getString("state"))!=com.storecore.configuration.domain.CapabilityState.ACTIVE || rs.getInt("config_schema_version")!=2) null
            else runCatching { DeliveryPolicyTranslator.policy(mapper.readValue(rs.getString("config"),object:TypeReference<Map<String,Any?>>(){}),rs.getInt("config_version")) }.getOrNull()
        })
        val result=rows.singleOrNull()
        if(result==null && lock) throw CommerceValidation("DELIVERY_UNAVAILABLE")
        return result ?: emptyList()
    }
    fun selection(mode:DeliveryMode,version:Int):DeliveryOption {
        val options=options(true)
        if(options.isEmpty()) throw CommerceValidation("DELIVERY_UNAVAILABLE")
        if(options.first().configurationVersion!=version) throw CommerceValidation("DELIVERY_CONFIGURATION_CHANGED")
        return options.singleOrNull { it.mode==mode } ?: throw CommerceValidation("DELIVERY_UNAVAILABLE")
    }
    fun decision(snapshot:String):DeliveryDecision = DeliverySnapshotJson.decode(mapper,snapshot)
}
