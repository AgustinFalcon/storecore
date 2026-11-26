package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.CalendarLeaseOwner
import java.util.concurrent.atomic.AtomicBoolean

enum class CalendarRunnerFailureStage { LIFECYCLE, CLAIM, HANDOFF, UNKNOWN }

class CalendarRunnerProgress private constructor(
    val lifecycleSelected: Int,
    val lifecycleApplied: Int,
    val lifecycleReplayed: Int,
    val lifecycleRejected: Int,
    val lifecycleCorrupt: Int,
    val claimSelected: Int,
    val claimSkipped: Int,
    val claimDead: Int,
    val leased: Int,
    val emitted: Int,
    val handoffReplayed: Int,
    val handoffSkipped: Int,
    val lostFence: Int,
    val missing: Int,
) {
    val confirmedHandoffs get() = emitted + handoffReplayed + handoffSkipped + lostFence + missing
    val complete get() = lifecycleCorrupt == 0 && confirmedHandoffs == leased

    fun withClaim(result: CalendarOccurrenceClaimResult.Page): CalendarRunnerProgress = create(
        lifecycleSelected, lifecycleApplied, lifecycleReplayed, lifecycleRejected, lifecycleCorrupt,
        result.selected, result.skipped, result.dead, result.leased,
        emitted, handoffReplayed, handoffSkipped, lostFence, missing,
    )

    fun withHandoff(result: CalendarOccurrenceHandoffResult): CalendarRunnerProgress = when (result) {
        is CalendarOccurrenceHandoffResult.Emitted -> copy(emitted = emitted + 1)
        is CalendarOccurrenceHandoffResult.Replayed -> copy(handoffReplayed = handoffReplayed + 1)
        is CalendarOccurrenceHandoffResult.Skipped -> copy(handoffSkipped = handoffSkipped + 1)
        CalendarOccurrenceHandoffResult.LostFence -> copy(lostFence = lostFence + 1)
        CalendarOccurrenceHandoffResult.Missing -> copy(missing = missing + 1)
        CalendarOccurrenceHandoffResult.Corrupt -> this
    }

    private fun copy(
        emitted: Int = this.emitted,
        handoffReplayed: Int = this.handoffReplayed,
        handoffSkipped: Int = this.handoffSkipped,
        lostFence: Int = this.lostFence,
        missing: Int = this.missing,
    ) = create(
        lifecycleSelected, lifecycleApplied, lifecycleReplayed, lifecycleRejected, lifecycleCorrupt,
        claimSelected, claimSkipped, claimDead, leased,
        emitted, handoffReplayed, handoffSkipped, lostFence, missing,
    )

    companion object {
        val Zero = create(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

        fun from(result: CalendarSystemCycleResult.Completed): CalendarRunnerProgress {
            val rejected = result.revisionConflicted + result.invalidTransition + result.revisionExhausted + result.missing + result.corrupt
            return create(result.selected, result.applied, result.replayed, rejected, result.corrupt, 0, 0, 0, 0, 0, 0, 0, 0, 0)
        }

        private fun create(
            lifecycleSelected: Int,
            lifecycleApplied: Int,
            lifecycleReplayed: Int,
            lifecycleRejected: Int,
            lifecycleCorrupt: Int,
            claimSelected: Int,
            claimSkipped: Int,
            claimDead: Int,
            leased: Int,
            emitted: Int,
            handoffReplayed: Int,
            handoffSkipped: Int,
            lostFence: Int,
            missing: Int,
        ): CalendarRunnerProgress {
            val values = listOf(
                lifecycleSelected, lifecycleApplied, lifecycleReplayed, lifecycleRejected, lifecycleCorrupt,
                claimSelected, claimSkipped, claimDead, leased, emitted, handoffReplayed, handoffSkipped, lostFence, missing,
            )
            require(values.none { it < 0 })
            require(lifecycleCorrupt <= lifecycleRejected)
            require(lifecycleSelected == lifecycleApplied + lifecycleReplayed + lifecycleRejected)
            require(claimSelected == claimSkipped + claimDead + leased)
            require(emitted + handoffReplayed + handoffSkipped + lostFence + missing <= leased)
            return CalendarRunnerProgress(
                lifecycleSelected, lifecycleApplied, lifecycleReplayed, lifecycleRejected, lifecycleCorrupt,
                claimSelected, claimSkipped, claimDead, leased, emitted, handoffReplayed, handoffSkipped, lostFence, missing,
            )
        }
    }
}

sealed interface CalendarRunnerTickResult {
    class Completed internal constructor(val progress: CalendarRunnerProgress) : CalendarRunnerTickResult {
        init { require(progress.complete) }
    }
    data object Busy : CalendarRunnerTickResult
    class CorruptLifecycle internal constructor(val progress: CalendarRunnerProgress) : CalendarRunnerTickResult
    class CorruptClaim internal constructor(val progress: CalendarRunnerProgress) : CalendarRunnerTickResult
    class CorruptHandoff internal constructor(val progress: CalendarRunnerProgress) : CalendarRunnerTickResult
    class InfrastructureFailure internal constructor(
        val stage: CalendarRunnerFailureStage,
        val confirmedProgress: CalendarRunnerProgress,
    ) : CalendarRunnerTickResult {
        init { require(stage != CalendarRunnerFailureStage.UNKNOWN) }
    }
}

fun interface CalendarReminderReadinessPort {
    fun readiness(): com.storecore.commercialcalendar.domain.CalendarReminderReadiness
}

class CalendarReminderRunner(
    private val lifecycle: CalendarSystemCycleService,
    private val occurrences: CalendarOccurrenceWorkerService,
    private val handoff: CalendarOccurrenceHandoffService,
    val owner: CalendarLeaseOwner,
) {
    private val running = AtomicBoolean(false)

    fun tick(): CalendarRunnerTickResult {
        if (!running.compareAndSet(false, true)) return CalendarRunnerTickResult.Busy
        var progress = CalendarRunnerProgress.Zero
        try {
            val lifecycleResult = try {
                lifecycle.run()
            } catch (_: RuntimeException) {
                return CalendarRunnerTickResult.InfrastructureFailure(CalendarRunnerFailureStage.LIFECYCLE, progress)
            }
            when (lifecycleResult) {
                is CalendarSystemCycleResult.CorruptSelection -> return CalendarRunnerTickResult.CorruptLifecycle(progress)
                is CalendarSystemCycleResult.Completed -> {
                    progress = CalendarRunnerProgress.from(lifecycleResult)
                    if (lifecycleResult.corrupt > 0) return CalendarRunnerTickResult.CorruptLifecycle(progress)
                }
            }

            val claim = try {
                occurrences.claim(owner)
            } catch (_: RuntimeException) {
                return CalendarRunnerTickResult.InfrastructureFailure(CalendarRunnerFailureStage.CLAIM, progress)
            }
            when (claim) {
                CalendarOccurrenceClaimResult.Corrupt -> return CalendarRunnerTickResult.CorruptClaim(progress)
                is CalendarOccurrenceClaimResult.Empty -> return CalendarRunnerTickResult.Completed(progress)
                is CalendarOccurrenceClaimResult.Page -> progress = progress.withClaim(claim)
            }

            for (lease in (claim as CalendarOccurrenceClaimResult.Page).records) {
                val result = try {
                    handoff.handoff(lease)
                } catch (_: RuntimeException) {
                    return CalendarRunnerTickResult.InfrastructureFailure(CalendarRunnerFailureStage.HANDOFF, progress)
                }
                if (result == CalendarOccurrenceHandoffResult.Corrupt) return CalendarRunnerTickResult.CorruptHandoff(progress)
                progress = progress.withHandoff(result)
            }
            return CalendarRunnerTickResult.Completed(progress)
        } finally {
            running.set(false)
        }
    }
}
