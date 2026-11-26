package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.domain.CalendarReminderRuntimeAdmission
import com.storecore.commercialcalendar.infrastructure.JdbcCalendarReminderRuntimeAdmission
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.dao.DataAccessResourceFailureException
import org.springframework.jdbc.core.JdbcTemplate

class CalendarRuntimeAdmissionTest {
    @Test fun `database failure is translated to closed unknown admission`() {
        val jdbc=mock(JdbcTemplate::class.java) { throw DataAccessResourceFailureException("offline") }
        assertEquals(CalendarReminderRuntimeAdmission.UNKNOWN,JdbcCalendarReminderRuntimeAdmission(jdbc).admit())
    }
}
