package com.storecore.commercialcalendar.infrastructure

import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.CalendarLeaseOwner
import com.storecore.commercialcalendar.domain.CalendarReminderReadiness
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.context.annotation.Conditional
import org.springframework.context.annotation.Configuration
import org.springframework.core.type.AnnotatedTypeMetadata
import org.springframework.scheduling.annotation.Scheduled
import java.util.UUID

enum class CalendarRunnerActivation(val activates: Boolean) {
    DISABLED(false), ENABLED(true), UNKNOWN(false);

    companion object {
        fun fromWire(raw: String?): CalendarRunnerActivation = when (raw) {
            null, "false" -> DISABLED
            "true" -> ENABLED
            else -> UNKNOWN
        }
    }
}

class CalendarRunnerEnabledCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata) =
        CalendarRunnerActivation.fromWire(context.environment.getProperty(PROPERTY)).activates

    companion object { const val PROPERTY = "storecore.calendar.runner-enabled" }
}

class CalendarRunnerNotEnabledCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata) =
        !CalendarRunnerActivation.fromWire(context.environment.getProperty(CalendarRunnerEnabledCondition.PROPERTY)).activates
}

class CalendarReminderScheduledAdapter(private val runner: CalendarReminderRunner) {
    @Scheduled(fixedDelay = 5_000L, initialDelay = 5_000L)
    fun run() { runner.tick() }
}

@Configuration
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class CalendarReminderReadinessConfiguration {
    @Bean
    @Conditional(CalendarRunnerNotEnabledCondition::class)
    open fun unavailableCalendarReminderReadiness(): CalendarReminderReadinessPort =
        CalendarReminderReadinessPort { CalendarReminderReadiness.UNAVAILABLE }
}

@Configuration
@Conditional(CalendarRunnerEnabledCondition::class)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class CalendarReminderActivationConfiguration {
    @Bean open fun calendarSystemCycleService(clock: com.storecore.commercialcalendar.domain.CalendarClock, persistence: JdbcCalendarPersistence) =
        CalendarSystemCycleService(clock, persistence)

    @Bean open fun calendarOccurrenceWorkerService(clock: com.storecore.commercialcalendar.domain.CalendarClock, persistence: JdbcCalendarPersistence) =
        CalendarOccurrenceWorkerService(clock, persistence)

    @Bean open fun calendarOccurrenceHandoffService(persistence: JdbcCalendarPersistence) = CalendarOccurrenceHandoffService(persistence)

    @Bean open fun calendarLeaseOwner(): CalendarLeaseOwner = requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))

    @Bean open fun calendarReminderRunner(
        lifecycle: CalendarSystemCycleService,
        occurrences: CalendarOccurrenceWorkerService,
        handoff: CalendarOccurrenceHandoffService,
        owner: CalendarLeaseOwner,
    ) = CalendarReminderRunner(lifecycle, occurrences, handoff, owner)

    @Bean open fun calendarReminderScheduledAdapter(runner: CalendarReminderRunner) = CalendarReminderScheduledAdapter(runner)

    @Bean open fun readyCalendarReminderReadiness(): CalendarReminderReadinessPort = CalendarReminderReadinessPort { CalendarReminderReadiness.READY }
}
