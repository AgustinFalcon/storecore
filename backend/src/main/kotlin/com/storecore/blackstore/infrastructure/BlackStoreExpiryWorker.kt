package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.application.BlackStoreIntegrationService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class BlackStoreExpiryWorker(private val integration: BlackStoreIntegrationService) {
    @Scheduled(fixedDelayString = "\${storecore.blackstore.expiry-interval-ms:30000}")
    fun expireReserved(): Int = integration.expireDue()

    @Scheduled(fixedDelayString = "\${storecore.blackstore.purge-interval-ms:3600000}")
    fun purgeTerminal(): Int = integration.purgeDue()
}
