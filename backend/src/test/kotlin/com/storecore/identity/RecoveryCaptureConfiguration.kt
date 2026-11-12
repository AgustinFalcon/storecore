package com.storecore.identity

import com.storecore.identity.application.RecoveryDeliveryPort
import com.storecore.identity.domain.*
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import java.util.concurrent.CopyOnWriteArrayList

/** Deliberately test-source-only; there is no profile/property/HTTP activation. */
@TestConfiguration(proxyBeanMethods = false)
class RecoveryCaptureConfiguration {
    @Bean @Primary fun recoveryCaptureDelivery() = RecoveryCaptureDelivery()
}

class RecoveryCaptureDelivery : RecoveryDeliveryPort {
    val dispatches = CopyOnWriteArrayList<RecoveryDispatch>()
    @Volatile var outcome = RecoveryDeliveryState.ACCEPTED
    override val state = RecoveryDeliveryState.READY
    override fun deliver(dispatch: RecoveryDispatch): RecoveryDeliveryState {
        dispatches += dispatch
        return outcome
    }
    fun latest(realm: RecoveryRealm, email: String): RecoveryDispatch = dispatches.last { it.realm == realm && it.email.value == email }
}
