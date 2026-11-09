package com.storecore.overview.application

import com.storecore.overview.domain.Overview
import com.storecore.overview.domain.OverviewPeriod

class OverviewService(private val repository: OverviewRepository) : OverviewUseCases {
    override fun read(period: OverviewPeriod): Overview {
        if (period == OverviewPeriod.UNKNOWN) throw OverviewPeriodInvalid()
        return repository.read(period)
    }
}

class OverviewPeriodInvalid : RuntimeException("OVERVIEW_PERIOD_INVALID")
class OverviewTimezoneUnavailable : RuntimeException("OVERVIEW_TIMEZONE_UNAVAILABLE")
