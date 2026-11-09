package com.storecore.overview.application

import com.storecore.overview.domain.Overview
import com.storecore.overview.domain.OverviewPeriod

interface OverviewUseCases {
    fun read(period: OverviewPeriod): Overview
}

interface OverviewRepository {
    fun read(period: OverviewPeriod): Overview
}
