package com.storecore.offers.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.offers.application.OfferRepository
import com.storecore.offers.application.OfferService
import com.storecore.offers.application.OfferUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class OfferConfiguration {
    @Bean fun offerUseCases(repository: OfferRepository): OfferUseCases = OfferService(repository)
}
