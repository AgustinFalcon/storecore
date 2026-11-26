package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.CalendarReminderRuntimeAdmission

fun interface CalendarReminderRuntimeAdmissionPort {
    fun admit(): CalendarReminderRuntimeAdmission
}
