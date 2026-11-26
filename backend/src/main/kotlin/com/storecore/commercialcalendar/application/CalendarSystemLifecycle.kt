package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.*
import java.time.Instant
import java.time.temporal.ChronoUnit

@JvmInline
value class CalendarSystemBatchSize private constructor(val value: Int) {
    companion object {
        val Default=requireNotNull(from(50))
        fun from(raw: Int)=if(raw in 1..100) CalendarSystemBatchSize(raw) else null
    }
}

class CalendarSystemCandidate private constructor(
    val observedEvent: CalendarEvent,
    val operation: CalendarOperation,
    val boundary: Instant,
    val observedAt: Instant,
) {
    val eventId get()=observedEvent.id
    val expectedRevision get()=observedEvent.revision
    val step get()=CalendarStep.fromOperation(operation)

    companion object {
        fun from(event: CalendarEvent,observedAt: Instant): CalendarSystemCandidate? {
            if(observedAt.truncatedTo(ChronoUnit.SECONDS)!=observedAt || event.approvedDefinitionRevision==null) return null
            return when {
                event.lifecycle in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED) && observedAt>=event.definition.end.instant ->
                    CalendarSystemCandidate(event,CalendarOperation.SYSTEM_COMPLETE,event.definition.end.instant,observedAt)
                event.lifecycle==CalendarLifecycle.SCHEDULED && observedAt>=event.definition.start.instant && observedAt<event.definition.end.instant ->
                    CalendarSystemCandidate(event,CalendarOperation.SYSTEM_ACTIVATE,event.definition.start.instant,observedAt)
                else -> null
            }
        }
    }
}

sealed interface CalendarSystemSelectionResult {
    class Page(val observedAt: Instant,val candidates: List<CalendarSystemCandidate>): CalendarSystemSelectionResult {
        init { require(observedAt.truncatedTo(ChronoUnit.SECONDS)==observedAt && candidates.size<=100 && candidates.all { it.observedAt==observedAt }) }
    }
    data object Corrupt: CalendarSystemSelectionResult
}

enum class CalendarSystemReceiptDisposition { NEW, REPLAY, UNKNOWN }

sealed interface CalendarSystemAdvanceResult {
    class Recorded(val receipt: CalendarReceipt,val disposition: CalendarSystemReceiptDisposition): CalendarSystemAdvanceResult {
        init { require(disposition!=CalendarSystemReceiptDisposition.UNKNOWN) }
    }
    data object Missing: CalendarSystemAdvanceResult
    data object Corrupt: CalendarSystemAdvanceResult
}

sealed interface CalendarSystemCycleResult {
    class Completed private constructor(
        val observedAt: Instant,
        val selected: Int,
        val applied: Int,
        val replayed: Int,
        val revisionConflicted: Int,
        val invalidTransition: Int,
        val revisionExhausted: Int,
        val missing: Int,
        val corrupt: Int,
    ): CalendarSystemCycleResult {
        companion object {
            fun create(observedAt: Instant,selected: Int,applied: Int,replayed: Int,revisionConflicted: Int,invalidTransition: Int,revisionExhausted: Int,missing: Int,corrupt: Int): Completed? {
                val values=listOf(selected,applied,replayed,revisionConflicted,invalidTransition,revisionExhausted,missing,corrupt)
                if(values.any { it<0 } || selected!=values.drop(1).sum()) return null
                return Completed(observedAt,selected,applied,replayed,revisionConflicted,invalidTransition,revisionExhausted,missing,corrupt)
            }
        }
    }
    class CorruptSelection(val observedAt: Instant): CalendarSystemCycleResult
}

interface CalendarSystemPersistencePort {
    fun select(observedAt: Instant,batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult
    fun advance(candidate: CalendarSystemCandidate): CalendarSystemAdvanceResult
}

class CalendarSystemCycleService(private val clock: CalendarClock,private val port: CalendarSystemPersistencePort) {
    fun run(batchSize: CalendarSystemBatchSize=CalendarSystemBatchSize.Default): CalendarSystemCycleResult {
        val observedAt=clock.now().truncatedTo(ChronoUnit.SECONDS)
        return when(val selection=port.select(observedAt,batchSize)) {
            CalendarSystemSelectionResult.Corrupt -> CalendarSystemCycleResult.CorruptSelection(observedAt)
            is CalendarSystemSelectionResult.Page -> {
                if(selection.observedAt!=observedAt || selection.candidates.size>batchSize.value) return CalendarSystemCycleResult.CorruptSelection(observedAt)
                var applied=0; var replayed=0; var conflicted=0; var invalid=0; var exhausted=0; var missing=0; var corrupt=0
                selection.candidates.forEach { candidate ->
                    when(val result=port.advance(candidate)) {
                        CalendarSystemAdvanceResult.Corrupt -> corrupt++
                        CalendarSystemAdvanceResult.Missing -> missing++
                        is CalendarSystemAdvanceResult.Recorded -> when(result.disposition) {
                            CalendarSystemReceiptDisposition.REPLAY -> replayed++
                            CalendarSystemReceiptDisposition.NEW -> when(result.receipt.outcome) {
                                CalendarOutcome.APPLIED -> applied++
                                CalendarOutcome.REVISION_CONFLICT -> conflicted++
                                CalendarOutcome.INVALID_TRANSITION -> invalid++
                                CalendarOutcome.REVISION_EXHAUSTED -> exhausted++
                                else -> corrupt++
                            }
                            CalendarSystemReceiptDisposition.UNKNOWN -> corrupt++
                        }
                    }
                }
                requireNotNull(CalendarSystemCycleResult.Completed.create(observedAt,selection.candidates.size,applied,replayed,conflicted,invalid,exhausted,missing,corrupt))
            }
        }
    }
}
