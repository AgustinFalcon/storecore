package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.*
import java.time.Instant
import java.time.temporal.ChronoUnit

@JvmInline value class CalendarOccurrenceBatchSize private constructor(val value: Int) {
    companion object {
        val Default=requireNotNull(from(50))
        fun from(raw: Int)=if(raw in 1..50) CalendarOccurrenceBatchSize(raw) else null
    }
}

sealed interface CalendarOccurrenceClaimResult {
    class Page private constructor(
        val observedAt: Instant,val leaseGrantedAt: Instant,val selected: Int,val leased: Int,val skipped: Int,val dead: Int,
        val records: List<CalendarOccurrenceLease>,
    ): CalendarOccurrenceClaimResult {
        companion object {
            fun create(observedAt: Instant,leaseGrantedAt: Instant,selected: Int,leased: Int,skipped: Int,dead: Int,records: List<CalendarOccurrenceLease>): Page? {
                if(observedAt.truncatedTo(ChronoUnit.SECONDS)!=observedAt || leaseGrantedAt.truncatedTo(ChronoUnit.SECONDS)!=leaseGrantedAt || leaseGrantedAt<observedAt || selected !in 1..50 || leased !in 0..50 || skipped !in 0..50 || dead !in 0..50 || selected!=leased+skipped+dead || leased!=records.size) return null
                if(records.any { it.observedAt!=observedAt || it.leaseGrantedAt!=leaseGrantedAt } || records.map { it.occurrence.id }.distinct().size!=records.size) return null
                return Page(observedAt,leaseGrantedAt,selected,leased,skipped,dead,records.toList())
            }
        }
    }
    class Empty(val observedAt: Instant): CalendarOccurrenceClaimResult {
        init { require(observedAt.truncatedTo(ChronoUnit.SECONDS)==observedAt) }
    }
    data object Corrupt: CalendarOccurrenceClaimResult
}

sealed interface CalendarOccurrenceSettlementResult {
    class RetryScheduled private constructor(val nextAttemptAt: Instant): CalendarOccurrenceSettlementResult {
        companion object { fun from(nextAttemptAt: Instant)=if(nextAttemptAt.truncatedTo(ChronoUnit.SECONDS)==nextAttemptAt) RetryScheduled(nextAttemptAt) else null }
    }
    class Dead private constructor(val reason: CalendarOccurrenceTerminalReason): CalendarOccurrenceSettlementResult {
        companion object { fun from(reason: CalendarOccurrenceTerminalReason)=if(reason in setOf(CalendarOccurrenceTerminalReason.ATTEMPTS_EXHAUSTED,CalendarOccurrenceTerminalReason.PERMANENT_FAILURE)) Dead(reason) else null }
    }
    data object LostFence: CalendarOccurrenceSettlementResult
    data object Missing: CalendarOccurrenceSettlementResult
    data object Corrupt: CalendarOccurrenceSettlementResult
}

interface CalendarOccurrencePersistencePort {
    /** Captures leaseGrantedAt from its injected clock only after all page locks and validation. */
    fun claim(observedAt: Instant,owner: CalendarLeaseOwner,batchSize: CalendarOccurrenceBatchSize): CalendarOccurrenceClaimResult
    fun settleFailure(id: CalendarOccurrenceId,token: CalendarOccurrenceLeaseToken,failure: CalendarOccurrenceFailureClass,settledAt: Instant): CalendarOccurrenceSettlementResult
}

/** Explicitly constructed internal use case; activation remains a later reviewed gate. */
class CalendarOccurrenceWorkerService(private val clock: CalendarClock,private val port: CalendarOccurrencePersistencePort) {
    fun claim(owner: CalendarLeaseOwner,batchSize: CalendarOccurrenceBatchSize=CalendarOccurrenceBatchSize.Default): CalendarOccurrenceClaimResult {
        val observedAt=clock.now().truncatedTo(ChronoUnit.SECONDS)
        return when(val result=port.claim(observedAt,owner,batchSize)) {
            CalendarOccurrenceClaimResult.Corrupt -> result
            is CalendarOccurrenceClaimResult.Empty -> if(result.observedAt==observedAt) result else CalendarOccurrenceClaimResult.Corrupt
            is CalendarOccurrenceClaimResult.Page -> if(result.observedAt==observedAt && result.selected<=batchSize.value && result.records.all { it.token.owner==owner }) result else CalendarOccurrenceClaimResult.Corrupt
        }
    }
    fun settleFailure(id: CalendarOccurrenceId,token: CalendarOccurrenceLeaseToken,failure: CalendarOccurrenceFailureClass): CalendarOccurrenceSettlementResult {
        if(failure==CalendarOccurrenceFailureClass.UNKNOWN) return CalendarOccurrenceSettlementResult.Corrupt
        val settledAt=clock.now().truncatedTo(ChronoUnit.SECONDS)
        return port.settleFailure(id,token,failure,settledAt)
    }
}
