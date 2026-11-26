package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.CalendarOccurrenceLease
import com.storecore.commercialcalendar.domain.CalendarOccurrenceTerminalReason
import com.storecore.notification.domain.NotificationId

sealed interface CalendarOccurrenceHandoffResult {
    class Emitted private constructor(val alertId: NotificationId): CalendarOccurrenceHandoffResult {
        companion object { fun from(alertId: NotificationId)=Emitted(alertId) }
    }
    class Replayed private constructor(val alertId: NotificationId): CalendarOccurrenceHandoffResult {
        companion object { fun from(alertId: NotificationId)=Replayed(alertId) }
    }
    class Skipped private constructor(val reason: CalendarOccurrenceTerminalReason): CalendarOccurrenceHandoffResult {
        companion object { fun from(reason: CalendarOccurrenceTerminalReason)=if(reason.skip) Skipped(reason) else null }
    }
    data object LostFence: CalendarOccurrenceHandoffResult
    data object Missing: CalendarOccurrenceHandoffResult
    data object Corrupt: CalendarOccurrenceHandoffResult
}

fun interface CalendarOccurrenceHandoffPort {
    fun handoff(lease: CalendarOccurrenceLease): CalendarOccurrenceHandoffResult
}

/** Explicit internal use case. PCC-008F alone may register an automatic invoker. */
class CalendarOccurrenceHandoffService(private val port: CalendarOccurrenceHandoffPort) {
    fun handoff(lease: CalendarOccurrenceLease)=port.handoff(lease)
}
