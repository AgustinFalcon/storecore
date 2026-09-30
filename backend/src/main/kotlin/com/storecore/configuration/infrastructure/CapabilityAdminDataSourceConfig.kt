package com.storecore.configuration.infrastructure

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource

@Configuration
@ConditionalOnProperty(name = ["storecore.capability-admin.datasource.url"])
open class CapabilityAdminDataSourceConfig {
    @Bean
    open fun capabilityAdminJdbc(
        @Value("\${storecore.capability-admin.datasource.url}") url: String,
        @Value("\${storecore.capability-admin.datasource.username}") username: String,
        @Value("\${storecore.capability-admin.datasource.password}") password: String,
    ): CapabilityAdminJdbc {
        val dataSource = DriverManagerDataSource(url, username, password)
        dataSource.setDriverClassName("org.postgresql.Driver")
        return CapabilityAdminJdbc(JdbcTemplate(dataSource))
    }
}
