package com.storecore.content.infrastructure

import com.storecore.content.application.HomeContentRepository
import com.storecore.content.application.HomeContentService
import com.storecore.content.application.HomeContentUseCases
import com.storecore.content.application.HomeContentValidator
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class HomeContentConfiguration {
    @Bean fun homeContentValidator() = HomeContentValidator()
    @Bean fun homeContentUseCases(repository: HomeContentRepository, validator: HomeContentValidator): HomeContentUseCases = HomeContentService(repository, validator)
}
