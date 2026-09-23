package com.storecore.blackstore.infrastructure

import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class BlackStoreExpiryWorker(private val capabilities: CapabilityDecisionPort) {
    @Scheduled(fixedDelayString = "\${storecore.blackstore.expiry-interval-ms:30000}")
    fun expireReserved(): Int = noOp("STOCK_RELEASE")

    @Scheduled(fixedDelayString = "\${storecore.blackstore.purge-interval-ms:3600000}")
    fun purgeTerminal(): Int = noOp("STOCK_READ")

    private fun noOp(action: String): Int {
        return try {
            capabilities.decide(JdbcCapabilityService.BLACKSTORE_MODULE, action, CapabilityActor.System)
            0
        } catch (_: CapabilityDisabled) {
            0
        }
    }
}
