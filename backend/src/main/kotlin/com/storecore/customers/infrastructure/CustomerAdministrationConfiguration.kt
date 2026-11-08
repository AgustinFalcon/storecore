package com.storecore.customers.infrastructure

import com.storecore.customers.application.CustomerAdministrationRepository
import com.storecore.customers.application.CustomerAdministrationService
import com.storecore.customers.application.CustomerAdministrationUseCases
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class CustomerAdministrationConfiguration {
    @Bean
    fun customerAdministrationUseCases(repository: CustomerAdministrationRepository): CustomerAdministrationUseCases =
        CustomerAdministrationService(repository)
}
