package com.storecore.overview.infrastructure

import com.storecore.overview.application.OverviewRepository
import com.storecore.overview.application.OverviewService
import com.storecore.overview.application.OverviewUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class OverviewConfiguration {
    @Bean fun overviewUseCases(repository: OverviewRepository): OverviewUseCases = OverviewService(repository)
}
