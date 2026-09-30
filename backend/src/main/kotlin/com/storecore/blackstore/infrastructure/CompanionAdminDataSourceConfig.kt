package com.storecore.blackstore.infrastructure

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource

@Configuration
@ConditionalOnProperty(name = ["storecore.companion-admin.datasource.url"])
open class CompanionAdminDataSourceConfig {
    @Bean
    open fun companionAdminJdbc(
        @Value("\${storecore.companion-admin.datasource.url}") url: String,
        @Value("\${storecore.companion-admin.datasource.username}") username: String,
        @Value("\${storecore.companion-admin.datasource.password}") password: String,
    ): CompanionAdminJdbc {
        val dataSource = DriverManagerDataSource(url, username, password)
        dataSource.setDriverClassName("org.postgresql.Driver")
        return CompanionAdminJdbc(JdbcTemplate(dataSource))
    }
}
