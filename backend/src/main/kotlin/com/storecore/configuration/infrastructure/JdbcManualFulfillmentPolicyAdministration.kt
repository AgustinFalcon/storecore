package com.storecore.configuration.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.DeliveryPolicyTranslator
import com.storecore.configuration.application.*
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class JdbcManualFulfillmentPolicyAdministration(private val jdbc:JdbcTemplate,private val mapper:ObjectMapper):ManualFulfillmentPolicyAdministrationPort {
    override fun configure(actor:InternalUserPrincipal,expected:Int,reason:String,correlation:UUID,config:Map<String,Any?>):Int {
        if(expected<=0 || expected==Int.MAX_VALUE || reason.isBlank() || reason.length>500 || DeliveryPolicyTranslator.policy(config,expected)==null) throw CapabilityConfigInvalid()
        val state=jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE",String::class.java) ?: throw CapabilityConfigInvalid()
        try {
            jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)",{_,_->},actor.userId,actor.sessionId,"MANUAL_FULFILLMENT",expected,state,mapper.writeValueAsString(config),correlation,reason.trim())
        } catch(e:org.springframework.dao.DataAccessException) {
            val errors=generateSequence(e as Throwable){it.cause}.mapNotNull { it.message }.toList()
            if(errors.any { it.contains("CAPABILITY_CONFIG_VERSION_CONFLICT") }) throw CapabilityConfigVersionConflict()
            if(errors.any { it.contains("CAPABILITY_ACTOR_NOT_AUTHORIZED") }) throw CapabilityActorNotAuthorized()
            throw CapabilityConfigInvalid()
        }
        return expected+1
    }
}
