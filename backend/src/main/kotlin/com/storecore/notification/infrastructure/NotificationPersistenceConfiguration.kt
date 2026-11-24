package com.storecore.notification.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.notification.application.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate

@Configuration
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class NotificationPersistenceConfiguration {
    @Bean open fun notificationPersistence(jdbc: JdbcTemplate, transactions: TransactionTemplate, mapper: ObjectMapper): NotificationPersistencePort =
        JdbcNotificationPersistence(jdbc,transactions,mapper)
    @Bean open fun notificationPersistenceService(port: NotificationPersistencePort) = NotificationPersistenceService(port)
}
