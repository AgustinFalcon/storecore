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
    @Bean open fun notificationPersistence(jdbc: JdbcTemplate, transactions: TransactionTemplate, mapper: ObjectMapper,emailProjection: NotificationEmailIntentProjection): NotificationPersistencePort =
        JdbcNotificationPersistence(jdbc,transactions,mapper,emailProjection=emailProjection)
    @Bean open fun notificationPersistenceService(port: NotificationPersistencePort) = NotificationPersistenceService(port)
    @Bean open fun notificationQueries(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper): NotificationQueryPort =
        JdbcNotificationQueries(jdbc,transactions,mapper)
    @Bean open fun notificationQueryService(port: NotificationQueryPort) = NotificationQueryService(port)
    @Bean open fun notificationEmailReadiness() = NotificationEmailReadinessPort { com.storecore.notification.domain.NotificationEmailReadiness.UNCONFIGURED }
    @Bean open fun notificationEmailProjection(jdbc: JdbcTemplate,readiness: NotificationEmailReadinessPort): NotificationEmailIntentProjection = JdbcNotificationEmailProjection(jdbc,readiness)
    @Bean open fun notificationEmailPreferences(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper,readiness: NotificationEmailReadinessPort): NotificationEmailPreferencePort =
        JdbcNotificationEmailPreferences(jdbc,transactions,mapper,readiness)
}
