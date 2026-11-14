package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.databind.DeserializationFeature
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/** Untyped legacy maps must preserve the decimal lexeme before money validation. */
@Configuration(proxyBeanMethods = false)
class CatalogMoneyConfiguration {
    @Bean fun exactDecimalMaps() = Jackson2ObjectMapperBuilderCustomizer { it.featuresToEnable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS); it.postConfigurer { mapper -> mapper.nodeFactory = com.fasterxml.jackson.databind.node.JsonNodeFactory.withExactBigDecimals(true) } }
}
