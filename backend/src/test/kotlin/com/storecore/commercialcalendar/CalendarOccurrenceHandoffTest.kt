package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.CalendarConfiguration
import com.storecore.notification.domain.NotificationId
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.context.annotation.Bean
import org.springframework.scheduling.annotation.Scheduled
import java.util.UUID

class CalendarOccurrenceHandoffTest {
    private fun lease(attempt: Int = 1): CalendarOccurrenceLease {
        val observed=CalendarFixtures.now
        val granted=observed.plusSeconds(1)
        val owner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))
        val occurrence=requireNotNull(CalendarReminderOccurrence.restore(
            requireNotNull(CalendarOccurrenceId.fromWire(UUID.randomUUID())),CalendarFixtures.draft().id,CalendarRevision.Zero,
            requireNotNull(CalendarRuleId.fromWire(UUID.randomUUID())),observed,CalendarOccurrenceState.LEASED,attempt,owner.value,granted.plusSeconds(60),
        ))
        return requireNotNull(CalendarOccurrenceLease.from(occurrence,observed,granted))
    }

    @Test fun `closed handoff results retain only valid alert and skip identities`() {
        val alert=requireNotNull(NotificationId.fromWire(UUID.randomUUID()))
        assertEquals(alert,CalendarOccurrenceHandoffResult.Emitted.from(alert)?.alertId)
        assertEquals(alert,CalendarOccurrenceHandoffResult.Replayed.from(alert)?.alertId)
        assertEquals(CalendarOccurrenceTerminalReason.LATE,CalendarOccurrenceHandoffResult.Skipped.from(CalendarOccurrenceTerminalReason.LATE)?.reason)
        assertNull(CalendarOccurrenceHandoffResult.Skipped.from(CalendarOccurrenceTerminalReason.ATTEMPTS_EXHAUSTED))
        assertSame(CalendarOccurrenceHandoffResult.LostFence,CalendarOccurrenceHandoffResult.LostFence)
        assertSame(CalendarOccurrenceHandoffResult.Missing,CalendarOccurrenceHandoffResult.Missing)
        assertSame(CalendarOccurrenceHandoffResult.Corrupt,CalendarOccurrenceHandoffResult.Corrupt)
    }

    @Test fun `explicit handoff service passes the immutable lease without inventing a new token`() {
        val lease=lease(3); var calls=0
        val port=CalendarOccurrenceHandoffPort { observed ->
            calls++
            assertSame(lease,observed)
            CalendarOccurrenceHandoffResult.Skipped.from(CalendarOccurrenceTerminalReason.SWITCH_DISABLED)!!
        }
        val result=assertInstanceOf(CalendarOccurrenceHandoffResult.Skipped::class.java,CalendarOccurrenceHandoffService(port).handoff(lease))
        assertEquals(CalendarOccurrenceTerminalReason.SWITCH_DISABLED,result.reason)
        assertEquals(1,calls)
    }

    @Test fun `PCC 008E has no automatic handoff bean or scheduled method`() {
        assertTrue(CalendarConfiguration::class.java.declaredMethods.filter { it.getAnnotation(Bean::class.java)!=null }.none { CalendarOccurrenceHandoffService::class.java.isAssignableFrom(it.returnType) })
        assertTrue(CalendarOccurrenceHandoffService::class.java.declaredMethods.none { it.getAnnotation(Scheduled::class.java)!=null })
    }
}
