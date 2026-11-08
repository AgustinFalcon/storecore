package com.storecore.commerce.infrastructure.mporders

import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.context.annotation.Conditional
import org.springframework.core.type.AnnotatedTypeMetadata

class MpOrdersAdapterEnabledCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata): Boolean {
        return when (MpOrdersAdapterMode.fromWire(context.environment.getProperty("storecore.integrations.mp-orders.adapter", "unconfigured"))) {
            MpOrdersAdapterMode.OFFICIAL, MpOrdersAdapterMode.FAKE -> true
            MpOrdersAdapterMode.UNCONFIGURED, MpOrdersAdapterMode.UNKNOWN -> false
        }
    }
}

@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@Conditional(MpOrdersAdapterEnabledCondition::class)
annotation class ConditionalOnMpOrdersAdapter
