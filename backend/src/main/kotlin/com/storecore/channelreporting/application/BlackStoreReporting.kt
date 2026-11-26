package com.storecore.channelreporting.application

import com.storecore.channelreporting.domain.ReportUnsignedLong
import com.storecore.channelreporting.domain.ReportValue
import java.time.Instant

enum class ReportModuleState {
    DISABLED, READ_ONLY, ACTIVE, PAUSED, ERROR, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class BlackStoreRegistrationState {
    ABSENT, DISABLED, ACTIVE, REVOKED_ONLY, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

class BlackStoreRegistrationReport private constructor(
    val state: BlackStoreRegistrationState,
    val revokedHistoryCount: ReportUnsignedLong,
) {
    companion object {
        fun create(state: BlackStoreRegistrationState, revokedHistoryCount: ReportUnsignedLong): BlackStoreRegistrationReport? =
            state.takeIf {
                it != BlackStoreRegistrationState.UNKNOWN &&
                    (it != BlackStoreRegistrationState.ABSENT || revokedHistoryCount.value == 0L) &&
                    (it != BlackStoreRegistrationState.REVOKED_ONLY || revokedHistoryCount.value > 0L)
            }
                ?.let { BlackStoreRegistrationReport(it, revokedHistoryCount) }
    }
}

enum class BlackStoreOperationState {
    PENDING, RESERVED, COMMITTED, RELEASED, EXPIRED, UNKNOWN;
    companion object {
        fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN
        val admitted = entries.filterTo(linkedSetOf()) { it != UNKNOWN }
    }
}

enum class BlackStoreRetiredOperationState {
    COMMITTED, RELEASED, EXPIRED, UNKNOWN;
    companion object {
        fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN
        val admitted = entries.filterTo(linkedSetOf()) { it != UNKNOWN }
    }
}

class BlackStoreOperationDiagnostics private constructor(
    private val retainedCounts: Map<BlackStoreOperationState, ReportUnsignedLong>,
    private val retiredCounts: Map<BlackStoreRetiredOperationState, ReportUnsignedLong>,
    val latestRetainedActivity: ReportValue<Instant>,
    val latestRetiredActivity: ReportValue<Instant>,
) {
    fun count(state: BlackStoreOperationState): ReportUnsignedLong =
        requireNotNull(retainedCounts[state.takeIf { it != BlackStoreOperationState.UNKNOWN }])

    fun retiredCount(state: BlackStoreRetiredOperationState): ReportUnsignedLong =
        requireNotNull(retiredCounts[state.takeIf { it != BlackStoreRetiredOperationState.UNKNOWN }])

    companion object {
        fun create(
            retainedCounts: Map<BlackStoreOperationState, ReportUnsignedLong>,
            retiredCounts: Map<BlackStoreRetiredOperationState, ReportUnsignedLong>,
            latestRetainedActivity: ReportValue<Instant>,
            latestRetiredActivity: ReportValue<Instant>,
        ): BlackStoreOperationDiagnostics? =
            takeIf {
                retainedCounts.keys == BlackStoreOperationState.admitted &&
                    retiredCounts.keys == BlackStoreRetiredOperationState.admitted
            }?.let {
                BlackStoreOperationDiagnostics(
                    retainedCounts.toMap(),
                    retiredCounts.toMap(),
                    latestRetainedActivity,
                    latestRetiredActivity,
                )
            }
    }
}
