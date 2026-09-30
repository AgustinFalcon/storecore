package com.storecore.blackstore.infrastructure.web

import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration(proxyBeanMethods = false)
class BlackStoreWebConfig(
    private val companionAuthInterceptor: CompanionAuthInterceptor,
) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(companionAuthInterceptor).addPathPatterns("/blackstore-integration/v1/**")
    }
}
