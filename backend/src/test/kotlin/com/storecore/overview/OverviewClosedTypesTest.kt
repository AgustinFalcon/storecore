package com.storecore.overview

import com.storecore.overview.application.OverviewPeriodInvalid
import com.storecore.overview.application.OverviewRepository
import com.storecore.overview.application.OverviewService
import com.storecore.overview.domain.OverviewFact
import com.storecore.overview.domain.OverviewFactState
import com.storecore.overview.domain.OverviewPeriod
import com.storecore.overview.domain.OverviewQueue
import com.storecore.overview.domain.OverviewUnavailableReason
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class OverviewClosedTypesTest {
    @Test fun `period wire is closed and unknown fails before persistence`() {
        assertEquals(OverviewPeriod.TODAY, OverviewPeriod.fromWire("TODAY"))
        assertEquals(OverviewPeriod.UNKNOWN, OverviewPeriod.fromWire("today"))
        assertEquals(OverviewPeriod.UNKNOWN, OverviewPeriod.fromWire("LAST_90_DAYS"))
        val repository = object : OverviewRepository {
            override fun read(period: OverviewPeriod) = error("repository must not be called")
        }
        assertFailsWith<OverviewPeriodInvalid> { OverviewService(repository).read(OverviewPeriod.UNKNOWN) }
    }

    @Test fun `unavailable wrappers cannot fabricate zero or an empty known queue`() {
        val fact = OverviewFact.unavailable<Long>(OverviewUnavailableReason.PAYMENT_FACTS_INCOMPLETE)
        assertEquals(OverviewFactState.UNAVAILABLE, fact.state)
        assertEquals(null, fact.value)
        assertFailsWith<IllegalArgumentException> { OverviewFact(OverviewFactState.UNAVAILABLE, 0L, OverviewUnavailableReason.PAYMENT_FACTS_INCOMPLETE) }
        assertFailsWith<IllegalArgumentException> { OverviewQueue<String>(OverviewFactState.UNKNOWN, emptyList(), null, false, OverviewUnavailableReason.UNKNOWN) }
        assertFailsWith<IllegalArgumentException> { OverviewQueue(OverviewFactState.KNOWN, listOf("one"), 2, false, null) }
    }
}
