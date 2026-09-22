package com.storecore.commerce.infrastructure.mporders

import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(MpOrdersProperties::class)
open class MpOrdersConfiguration
