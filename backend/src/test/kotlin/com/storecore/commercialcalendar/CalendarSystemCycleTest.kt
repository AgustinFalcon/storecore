package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.CalendarConfiguration
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.context.annotation.Bean
import org.springframework.scheduling.annotation.Scheduled

class CalendarSystemCycleTest {
    @Test fun `cycle captures time before persistence and an early blocked cycle stays empty`() {
        val clock=MutableCalendarClock(CalendarFixtures.now)
        val port=object: CalendarSystemPersistencePort {
            override fun select(observedAt: java.time.Instant,batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult {
                assertEquals(CalendarFixtures.now,observedAt); assertEquals(CalendarSystemBatchSize.Default,batchSize)
                clock.instant=CalendarFixtures.now.plusSeconds(86400)
                return CalendarSystemSelectionResult.Page(observedAt,emptyList())
            }
            override fun advance(candidate: CalendarSystemCandidate)=fail<CalendarSystemAdvanceResult>("empty early cycle cannot advance")
        }
        val result=assertInstanceOf(CalendarSystemCycleResult.Completed::class.java,CalendarSystemCycleService(clock,port).run())
        assertEquals(CalendarFixtures.now,result.observedAt); assertEquals(0,result.selected); assertEquals(0,result.applied)
    }

    @Test fun `cycle classifies new receipts and replay into an exhaustive accounting invariant`() {
        val draft=CalendarFixtures.draft(); val preflight=CalendarPreflight.check(CalendarFixtures.preflightId(),draft,CalendarFixtures.now)
        val scheduled=CalendarDecision.apply(draft,draft.revision,CalendarStep.Schedule,CalendarFixtures.now,preflight).event
        val candidate=requireNotNull(CalendarSystemCandidate.from(scheduled,scheduled.definition.start.instant))
        val after=CalendarDecision.apply(scheduled,scheduled.revision,CalendarStep.Activate,candidate.observedAt).event
        val receipt=CalendarReceipt(CalendarFixtures.hasher.systemCommand(scheduled.id,scheduled.revision,candidate.operation,candidate.boundary),scheduled.id,null,candidate.operation,
            requireNotNull(CalendarCommandPayloadHash.fromWire("a".repeat(64))),CalendarOutcome.APPLIED,scheduled,after,candidate.observedAt,scheduled.revision,CalendarFixtures.reason,null,null)
        val port=object: CalendarSystemPersistencePort {
            override fun select(observedAt: java.time.Instant,batchSize: CalendarSystemBatchSize)=CalendarSystemSelectionResult.Page(observedAt,listOf(candidate,candidate))
            private var calls=0
            override fun advance(candidate: CalendarSystemCandidate)=CalendarSystemAdvanceResult.Recorded(receipt,if(calls++==0) CalendarSystemReceiptDisposition.NEW else CalendarSystemReceiptDisposition.REPLAY)
        }
        val result=assertInstanceOf(CalendarSystemCycleResult.Completed::class.java,CalendarSystemCycleService(MutableCalendarClock(candidate.observedAt),port).run())
        assertEquals(2,result.selected); assertEquals(1,result.applied); assertEquals(1,result.replayed)
        assertEquals(result.selected,result.applied+result.replayed+result.revisionConflicted+result.invalidTransition+result.revisionExhausted+result.missing+result.corrupt)
    }

    @Test fun `selection corruption stops the cycle without partial counters`() {
        val port=object: CalendarSystemPersistencePort {
            override fun select(observedAt: java.time.Instant,batchSize: CalendarSystemBatchSize)=CalendarSystemSelectionResult.Corrupt
            override fun advance(candidate: CalendarSystemCandidate)=fail<CalendarSystemAdvanceResult>("corrupt selection cannot advance")
        }
        val result=assertInstanceOf(CalendarSystemCycleResult.CorruptSelection::class.java,CalendarSystemCycleService(MutableCalendarClock(),port).run())
        assertEquals(CalendarFixtures.now,result.observedAt)
    }

    @Test fun `PCC 008C does not register a runner timer or automatic cycle bean`() {
        assertTrue(CalendarConfiguration::class.java.declaredMethods.filter { it.getAnnotation(Bean::class.java)!=null }.none { CalendarSystemCycleService::class.java.isAssignableFrom(it.returnType) })
        assertTrue(CalendarSystemCycleService::class.java.declaredMethods.none { it.getAnnotation(Scheduled::class.java)!=null })
    }
}
