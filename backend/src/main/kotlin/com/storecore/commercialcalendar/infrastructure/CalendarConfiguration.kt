package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
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
    @Bean open fun calendarPersistence(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper,clock: CalendarClock,ids: CalendarIds,hasher: CalendarHasher)=JdbcCalendarPersistence(jdbc,transactions,mapper,clock,ids,hasher)
    @Bean open fun calendarQueries(jdbc: JdbcTemplate,transactions: TransactionTemplate,mapper: ObjectMapper,hasher: CalendarHasher,persistence: JdbcCalendarPersistence): CalendarQueryPort=JdbcCalendarQueries(jdbc,transactions,mapper,hasher,persistence)
    @Bean open fun calendarQueryService(port: CalendarQueryPort)=CalendarQueryService(port)
    @Bean open fun calendarCommandService(port: CalendarPersistencePort)=CalendarCommandService(port)
}
