package com.storecore.commercialcalendar.domain

enum class CalendarReminderRuntimeAdmission(val wire: String) {
    ADMITTED("ADMITTED"), BLOCKED("BLOCKED"), UNKNOWN("UNKNOWN");
    companion object {
        fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN
    }
}
