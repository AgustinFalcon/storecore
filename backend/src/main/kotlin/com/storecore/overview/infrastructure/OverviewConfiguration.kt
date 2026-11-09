package com.storecore.overview.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.overview.application.OverviewRepository
import com.storecore.overview.application.OverviewService
import com.storecore.overview.application.OverviewUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class OverviewConfiguration {
    @Bean fun overviewUseCases(repository: OverviewRepository): OverviewUseCases = OverviewService(repository)
}
