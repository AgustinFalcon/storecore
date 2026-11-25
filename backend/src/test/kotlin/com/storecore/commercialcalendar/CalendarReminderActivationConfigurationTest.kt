package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.application.CalendarReminderReadinessPort
import com.storecore.commercialcalendar.application.CalendarReminderRunner
import com.storecore.commercialcalendar.application.CalendarOccurrenceHandoffService
import com.storecore.commercialcalendar.application.CalendarOccurrenceWorkerService
import com.storecore.commercialcalendar.application.CalendarSystemCycleService
import com.storecore.commercialcalendar.domain.CalendarClock
import com.storecore.commercialcalendar.domain.CalendarReminderReadiness
import com.storecore.commercialcalendar.infrastructure.CalendarReminderActivationConfiguration
import com.storecore.commercialcalendar.infrastructure.CalendarReminderReadinessConfiguration
import com.storecore.commercialcalendar.infrastructure.CalendarReminderScheduledAdapter
import com.storecore.commercialcalendar.infrastructure.JdbcCalendarPersistence
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import java.util.UUID

class CalendarReminderActivationConfigurationTest {
    private val productionGraph = ApplicationContextRunner()
        .withUserConfiguration(
            CalendarReminderReadinessConfiguration::class.java,
            CalendarReminderActivationConfiguration::class.java,
        )
        .withBean(CalendarClock::class.java, { mock(CalendarClock::class.java) })
        .withBean(JdbcCalendarPersistence::class.java, { mock(JdbcCalendarPersistence::class.java) })

    @Test fun `absent false and noncanonical activation stay unavailable without runtime graph`() {
        listOf(null, "false", "TRUE", "yes").forEach { value ->
            val context = value?.let { productionGraph.withPropertyValues("storecore.calendar.runner-enabled=$it") } ?: productionGraph
            context.run { application ->
                assertEquals(null, application.startupFailure)
                assertEquals(
                    CalendarReminderReadiness.UNAVAILABLE,
                    application.getBean(CalendarReminderReadinessPort::class.java).readiness(),
                )
                assertEquals(0, application.getBeansOfType(CalendarSystemCycleService::class.java).size)
                assertEquals(0, application.getBeansOfType(CalendarOccurrenceWorkerService::class.java).size)
                assertEquals(0, application.getBeansOfType(CalendarOccurrenceHandoffService::class.java).size)
                assertEquals(0, application.getBeansOfType(CalendarReminderRunner::class.java).size)
                assertEquals(0, application.getBeansOfType(CalendarReminderScheduledAdapter::class.java).size)
                assertEquals(0, application.beanDefinitionNames.count { it.contains("calendarLeaseOwner", ignoreCase = true) })
            }
        }
    }

    @Test fun `exact true creates one stable process owner runtime graph and ready diagnostic`() {
        productionGraph.withPropertyValues("storecore.calendar.runner-enabled=true").run { application ->
            assertEquals(null, application.startupFailure)
            assertEquals(1, application.getBeansOfType(CalendarReminderRunner::class.java).size)
            assertEquals(1, application.getBeansOfType(CalendarReminderScheduledAdapter::class.java).size)
            assertEquals(
                CalendarReminderReadiness.READY,
                application.getBean(CalendarReminderReadinessPort::class.java).readiness(),
            )
            val runner = application.getBean(CalendarReminderRunner::class.java)
            assertSame(runner, application.getBean(CalendarReminderRunner::class.java))
            assertNotEquals(UUID(0, 0), runner.owner.value)
        }
    }

    @Test fun `identity disabled creates neither readiness nor activation graph`() {
        productionGraph.withPropertyValues(
            "storecore.identity.enabled=false",
            "storecore.calendar.runner-enabled=true",
        ).run { application ->
            assertEquals(null, application.startupFailure)
            assertEquals(0, application.getBeansOfType(CalendarReminderReadinessPort::class.java).size)
            assertEquals(0, application.getBeansOfType(CalendarSystemCycleService::class.java).size)
            assertEquals(0, application.getBeansOfType(CalendarOccurrenceWorkerService::class.java).size)
            assertEquals(0, application.getBeansOfType(CalendarOccurrenceHandoffService::class.java).size)
            assertEquals(0, application.getBeansOfType(CalendarReminderRunner::class.java).size)
            assertEquals(0, application.getBeansOfType(CalendarReminderScheduledAdapter::class.java).size)
            assertEquals(0, application.beanDefinitionNames.count { it.contains("calendarLeaseOwner", ignoreCase = true) })
        }
    }
}
