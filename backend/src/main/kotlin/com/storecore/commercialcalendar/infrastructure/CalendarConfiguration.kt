package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.notification.application.NotificationPersistencePort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate

@Configuration
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
open class CalendarConfiguration {
    @Bean open fun calendarClock(): CalendarClock=SystemCalendarClock()
    @Bean open fun calendarIds(): CalendarIds=RandomCalendarIds()
    @Bean open fun calendarHasher(): CalendarHasher=Sha256CalendarHasher()
    @Bean open fun calendarReminderRuntimeAdmission(jdbc: JdbcTemplate): CalendarReminderRuntimeAdmissionPort=JdbcCalendarReminderRuntimeAdmission(jdbc)
    @Bean open fun calendarPersistence(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper,clock: CalendarClock,ids: CalendarIds,hasher: CalendarHasher,runtimeAdmission: CalendarReminderRuntimeAdmissionPort,notifications: NotificationPersistencePort)=JdbcCalendarPersistence(jdbc,transactions,mapper,clock,ids,hasher,runtimeAdmission,notifications)
    @Bean open fun calendarQueries(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper,hasher: CalendarHasher,persistence: JdbcCalendarPersistence): CalendarQueryPort=JdbcCalendarQueries(jdbc,transactions,mapper,hasher,persistence)
    @Bean open fun calendarQueryService(port: CalendarQueryPort)=CalendarQueryService(port)
    @Bean open fun calendarCommandService(port: CalendarPersistencePort)=CalendarCommandService(port)
    @Bean open fun calendarSwitchPersistence(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper,clock: CalendarClock,hasher: CalendarHasher,capabilities: CapabilityDecisionPort): CalendarSwitchPersistencePort=
        JdbcCalendarSwitchPersistence(jdbc,transactions,mapper,clock,hasher,capabilities)
    @Bean open fun calendarSwitchCommandService(port: CalendarSwitchPersistencePort)=CalendarSwitchCommandService(port)
}
