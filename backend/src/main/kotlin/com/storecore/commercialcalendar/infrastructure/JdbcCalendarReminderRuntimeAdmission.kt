package com.storecore.commercialcalendar.infrastructure

import com.storecore.commercialcalendar.application.CalendarReminderRuntimeAdmissionPort
import com.storecore.commercialcalendar.domain.CalendarReminderRuntimeAdmission
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate

class JdbcCalendarReminderRuntimeAdmission(private val jdbc: JdbcTemplate): CalendarReminderRuntimeAdmissionPort {
    override fun admit()=try {
        CalendarReminderRuntimeAdmission.fromWire(
            jdbc.queryForObject("SELECT public.calendar_reminder_runtime_admission()",String::class.java),
        )
    } catch(_: DataAccessException) {
        CalendarReminderRuntimeAdmission.UNKNOWN
    }
}
