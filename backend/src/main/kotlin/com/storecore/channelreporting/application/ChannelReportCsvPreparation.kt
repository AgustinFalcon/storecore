package com.storecore.channelreporting.application

import com.storecore.channelreporting.domain.ReportPeriod
import com.storecore.channelreporting.domain.ReportPeriodToken

enum class PreparedChannelReportCsvState { AVAILABLE, RELEASED }

class PreparedChannelReportCsv private constructor(source: ByteArray) : AutoCloseable {
    private var ownedBytes: ByteArray? = source.copyOf()
    private var state = PreparedChannelReportCsvState.AVAILABLE

    @Synchronized
    fun readBytes(): ByteArray? = ownedBytes?.copyOf()

    @Synchronized
    fun isReleased(): Boolean = state == PreparedChannelReportCsvState.RELEASED

    @Synchronized
    override fun close() {
        ownedBytes?.fill(0)
        ownedBytes = null
        state = PreparedChannelReportCsvState.RELEASED
    }

    companion object {
        fun create(source: ByteArray): PreparedChannelReportCsv = PreparedChannelReportCsv(source)
    }
}

class ChannelReportCsvPreparationRequest private constructor(
    val fromDate: String,
    val toDateExclusive: String,
    val periodToken: ReportPeriodToken,
) {
    companion object {
        fun create(
            fromDate: String?,
            toDateExclusive: String?,
            periodToken: ReportPeriodToken?,
        ): ChannelReportCsvPreparationRequest? =
            takeIf { ReportPeriod.validRequest(fromDate, toDateExclusive) && periodToken != null }
                ?.let { ChannelReportCsvPreparationRequest(fromDate!!, toDateExclusive!!, periodToken!!) }
    }
}

sealed interface ChannelReportCsvPreparationResult {
    class Prepared private constructor(val artifact: PreparedChannelReportCsv) : ChannelReportCsvPreparationResult {
        companion object { fun create(artifact: PreparedChannelReportCsv): Prepared = Prepared(artifact) }
    }
    data object InvalidPeriod : ChannelReportCsvPreparationResult
    data object StalePeriod : ChannelReportCsvPreparationResult
    data object TooLarge : ChannelReportCsvPreparationResult
    data object SourceUnavailable : ChannelReportCsvPreparationResult
}

fun interface ChannelReportCsvPreparationPort {
    fun prepare(request: ChannelReportCsvPreparationRequest): ChannelReportCsvPreparationResult
}
