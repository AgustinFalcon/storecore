package com.storecore.offers.infrastructure

import com.storecore.offers.application.OfferRepository
import com.storecore.offers.application.OfferService
import com.storecore.offers.application.OfferUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class OfferConfiguration {
    @Bean fun offerUseCases(repository: OfferRepository): OfferUseCases = OfferService(repository)
}
