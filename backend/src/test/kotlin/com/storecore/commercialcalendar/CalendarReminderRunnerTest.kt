package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.CalendarReminderScheduledAdapter
import com.storecore.commercialcalendar.infrastructure.CalendarRunnerActivation
import com.storecore.notification.domain.NotificationId
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.scheduling.annotation.Scheduled
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class CalendarReminderRunnerTest {
    private val owner = requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))

    @Test fun `activation property is closed exact and fail closed`() {
        assertEquals(CalendarRunnerActivation.DISABLED, CalendarRunnerActivation.fromWire(null))
        assertEquals(CalendarRunnerActivation.DISABLED, CalendarRunnerActivation.fromWire("false"))
        assertEquals(CalendarRunnerActivation.ENABLED, CalendarRunnerActivation.fromWire("true"))
        assertEquals(CalendarRunnerActivation.UNKNOWN, CalendarRunnerActivation.fromWire("TRUE"))
        assertEquals(CalendarRunnerActivation.UNKNOWN, CalendarRunnerActivation.fromWire("yes"))
        assertFalse(CalendarRunnerActivation.UNKNOWN.activates)
    }

    @Test fun `completed tick accounts claim terminals and every returned handoff`() {
        val lease = lease()
        val order = mutableListOf<String>()
        val cycle = CalendarSystemCycleService(MutableCalendarClock(), object : CalendarSystemPersistencePort {
            override fun select(observedAt: Instant, batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult {
                order += "lifecycle"
                assertEquals(CalendarSystemBatchSize.Default, batchSize)
                return CalendarSystemSelectionResult.Page(observedAt, emptyList())
            }
            override fun advance(candidate: CalendarSystemCandidate) = fail<CalendarSystemAdvanceResult>("empty")
        })
        val occurrence = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize): CalendarOccurrenceClaimResult {
                order += "claim"
                assertEquals(this@CalendarReminderRunnerTest.owner, owner)
                assertEquals(CalendarOccurrenceBatchSize.Default, batchSize)
                return requireNotNull(CalendarOccurrenceClaimResult.Page.create(observedAt, observedAt, 3, 1, 1, 1, listOf(lease)))
            }
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) =
                fail<CalendarOccurrenceSettlementResult>("activation never manufactures settlement")
        }
        val runner = CalendarReminderRunner(cycle, CalendarOccurrenceWorkerService(MutableCalendarClock(), occurrence), CalendarOccurrenceHandoffService {
            order += "handoff"
            CalendarOccurrenceHandoffResult.Emitted.from(notificationId())
        }, owner)

        val result = assertInstanceOf(CalendarRunnerTickResult.Completed::class.java, runner.tick())
        assertEquals(listOf("lifecycle", "claim", "handoff"), order)
        assertEquals(3, result.progress.claimSelected)
        assertEquals(1, result.progress.claimSkipped)
        assertEquals(1, result.progress.claimDead)
        assertEquals(1, result.progress.leased)
        assertEquals(1, result.progress.emitted)
        assertTrue(result.progress.complete)
    }

    @Test fun `all closed successful handoff terminals are counted exhaustively in claim order`() {
        val leases = List(5) { lease() }
        val returned = ArrayDeque<CalendarOccurrenceHandoffResult>().apply {
            add(CalendarOccurrenceHandoffResult.Emitted.from(notificationId()))
            add(CalendarOccurrenceHandoffResult.Replayed.from(notificationId()))
            add(requireNotNull(CalendarOccurrenceHandoffResult.Skipped.from(CalendarOccurrenceTerminalReason.SWITCH_DISABLED)))
            add(CalendarOccurrenceHandoffResult.LostFence)
            add(CalendarOccurrenceHandoffResult.Missing)
        }
        val occurrence = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize) =
                requireNotNull(CalendarOccurrenceClaimResult.Page.create(observedAt, observedAt, 5, 5, 0, 0, leases))
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) =
                fail<CalendarOccurrenceSettlementResult>("activation never manufactures settlement")
        }
        val visited = mutableListOf<CalendarOccurrenceId>()
        val result = assertInstanceOf(CalendarRunnerTickResult.Completed::class.java, runner(occurrence) { current ->
            visited += current.occurrence.id
            returned.removeFirst()
        }.tick())

        assertEquals(leases.map { it.occurrence.id }, visited)
        assertEquals(1, result.progress.emitted)
        assertEquals(1, result.progress.handoffReplayed)
        assertEquals(1, result.progress.handoffSkipped)
        assertEquals(1, result.progress.lostFence)
        assertEquals(1, result.progress.missing)
        assertTrue(result.progress.complete)
    }

    @Test fun `per candidate lifecycle corruption stops before claim`() {
        val claims = AtomicInteger()
        val candidate = systemCandidate()
        val cycle = CalendarSystemCycleService(MutableCalendarClock(candidate.observedAt), object : CalendarSystemPersistencePort {
            override fun select(observedAt: Instant, batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult =
                CalendarSystemSelectionResult.Page(observedAt, listOf(candidate))
            override fun advance(candidate: CalendarSystemCandidate): CalendarSystemAdvanceResult = CalendarSystemAdvanceResult.Corrupt
        })
        val occurrence = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize): CalendarOccurrenceClaimResult {
                claims.incrementAndGet()
                return CalendarOccurrenceClaimResult.Empty(observedAt)
            }
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) = CalendarOccurrenceSettlementResult.Corrupt
        }
        val runner = CalendarReminderRunner(cycle, CalendarOccurrenceWorkerService(MutableCalendarClock(), occurrence), CalendarOccurrenceHandoffService { CalendarOccurrenceHandoffResult.Corrupt }, owner)

        val result = assertInstanceOf(CalendarRunnerTickResult.CorruptLifecycle::class.java, runner.tick())
        assertEquals(1, result.progress.lifecycleCorrupt)
        assertEquals(0, claims.get())
    }

    @Test fun `handoff exception is uncertain and never settles or touches later lease`() {
        val first = lease()
        val second = lease()
        var settlements = 0
        var handoffs = 0
        val occurrence = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize) =
                requireNotNull(CalendarOccurrenceClaimResult.Page.create(observedAt, observedAt, 2, 2, 0, 0, listOf(first, second)))
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant): CalendarOccurrenceSettlementResult {
                settlements++
                return CalendarOccurrenceSettlementResult.Corrupt
            }
        }
        val runner = runner(occurrence) {
            handoffs++
            throw IllegalStateException("commit response unknown")
        }

        val result = assertInstanceOf(CalendarRunnerTickResult.InfrastructureFailure::class.java, runner.tick())
        assertEquals(CalendarRunnerFailureStage.HANDOFF, result.stage)
        assertEquals(2, result.confirmedProgress.leased)
        assertEquals(0, result.confirmedProgress.emitted)
        assertEquals(1, handoffs)
        assertEquals(0, settlements)
    }

    @Test fun `corrupt claim and handoff short circuit without synthetic settlement`() {
        var handoffs = 0
        val corruptClaim = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize) = CalendarOccurrenceClaimResult.Corrupt
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) =
                fail<CalendarOccurrenceSettlementResult>("activation never manufactures settlement")
        }
        assertInstanceOf(CalendarRunnerTickResult.CorruptClaim::class.java, runner(corruptClaim) { handoffs++; CalendarOccurrenceHandoffResult.Missing }.tick())
        assertEquals(0, handoffs)

        val leased = lease()
        val corruptHandoff = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize) =
                requireNotNull(CalendarOccurrenceClaimResult.Page.create(observedAt, observedAt, 1, 1, 0, 0, listOf(leased)))
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) =
                fail<CalendarOccurrenceSettlementResult>("activation never manufactures settlement")
        }
        val result = assertInstanceOf(CalendarRunnerTickResult.CorruptHandoff::class.java, runner(corruptHandoff) { handoffs++; CalendarOccurrenceHandoffResult.Corrupt }.tick())
        assertEquals(1, handoffs)
        assertEquals(1, result.progress.leased)
        assertEquals(0, result.progress.confirmedHandoffs)
    }

    @Test fun `lifecycle and claim exceptions expose only their closed failed stage`() {
        var claims = 0
        val failedLifecycle = CalendarSystemCycleService(MutableCalendarClock(), object : CalendarSystemPersistencePort {
            override fun select(observedAt: Instant, batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult = throw IllegalStateException("database unavailable")
            override fun advance(candidate: CalendarSystemCandidate) = fail<CalendarSystemAdvanceResult>("selection failed")
        })
        val occurrence = object : CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize): CalendarOccurrenceClaimResult {
                claims++
                throw IllegalStateException("claim unavailable")
            }
            override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) =
                fail<CalendarOccurrenceSettlementResult>("activation never manufactures settlement")
        }
        val lifecycleFailure = CalendarReminderRunner(failedLifecycle, CalendarOccurrenceWorkerService(MutableCalendarClock(), occurrence), CalendarOccurrenceHandoffService { CalendarOccurrenceHandoffResult.Missing }, owner).tick()
        assertEquals(CalendarRunnerFailureStage.LIFECYCLE, assertInstanceOf(CalendarRunnerTickResult.InfrastructureFailure::class.java, lifecycleFailure).stage)
        assertEquals(0, claims)

        val claimFailure = assertInstanceOf(CalendarRunnerTickResult.InfrastructureFailure::class.java, runner(occurrence) { CalendarOccurrenceHandoffResult.Missing }.tick())
        assertEquals(CalendarRunnerFailureStage.CLAIM, claimFailure.stage)
        assertEquals(1, claims)
    }

    @Test fun `local overlap returns busy without a second delegate call and guard releases`() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val selections = AtomicInteger()
        val cycle = CalendarSystemCycleService(MutableCalendarClock(), object : CalendarSystemPersistencePort {
            override fun select(observedAt: Instant, batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult {
                selections.incrementAndGet()
                entered.countDown()
                assertTrue(release.await(5, TimeUnit.SECONDS))
                return CalendarSystemSelectionResult.Page(observedAt, emptyList())
            }
            override fun advance(candidate: CalendarSystemCandidate) = fail<CalendarSystemAdvanceResult>("empty")
        })
        val occurrence = emptyOccurrencePort()
        val runner = CalendarReminderRunner(cycle, CalendarOccurrenceWorkerService(MutableCalendarClock(), occurrence), CalendarOccurrenceHandoffService { CalendarOccurrenceHandoffResult.Corrupt }, owner)
        val pool = Executors.newSingleThreadExecutor()
        try {
            val first = pool.submit<CalendarRunnerTickResult> { runner.tick() }
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            assertSame(CalendarRunnerTickResult.Busy, runner.tick())
            assertEquals(1, selections.get())
            release.countDown()
            assertInstanceOf(CalendarRunnerTickResult.Completed::class.java, first.get(5, TimeUnit.SECONDS))
            assertInstanceOf(CalendarRunnerTickResult.Completed::class.java, runner.tick())
            assertEquals(2, selections.get())
        } finally {
            release.countDown()
            pool.shutdownNow()
        }
    }

    @Test fun `scheduled adapter owns one synchronous five second cadence`() {
        val scheduled = CalendarReminderScheduledAdapter::class.java.getDeclaredMethod("run").getAnnotation(Scheduled::class.java)
        assertEquals(5_000L, scheduled.fixedDelay)
        assertEquals(5_000L, scheduled.initialDelay)
    }

    private fun runner(
        occurrence: CalendarOccurrencePersistencePort,
        handoff: (CalendarOccurrenceLease) -> CalendarOccurrenceHandoffResult,
    ) = CalendarReminderRunner(
        CalendarSystemCycleService(MutableCalendarClock(), object : CalendarSystemPersistencePort {
            override fun select(observedAt: Instant, batchSize: CalendarSystemBatchSize) = CalendarSystemSelectionResult.Page(observedAt, emptyList())
            override fun advance(candidate: CalendarSystemCandidate) = fail<CalendarSystemAdvanceResult>("empty")
        }),
        CalendarOccurrenceWorkerService(MutableCalendarClock(), occurrence),
        CalendarOccurrenceHandoffService(handoff),
        owner,
    )

    private fun emptyOccurrencePort() = object : CalendarOccurrencePersistencePort {
        override fun claim(observedAt: Instant, owner: CalendarLeaseOwner, batchSize: CalendarOccurrenceBatchSize) = CalendarOccurrenceClaimResult.Empty(observedAt)
        override fun settleFailure(id: CalendarOccurrenceId, token: CalendarOccurrenceLeaseToken, failure: CalendarOccurrenceFailureClass, settledAt: Instant) = CalendarOccurrenceSettlementResult.Corrupt
    }

    private fun lease(): CalendarOccurrenceLease {
        val observed = CalendarFixtures.now
        val occurrence = requireNotNull(CalendarReminderOccurrence.restore(
            requireNotNull(CalendarOccurrenceId.fromWire(UUID.randomUUID())),
            CalendarFixtures.draft().id,
            CalendarRevision.Zero,
            requireNotNull(CalendarRuleId.fromWire(UUID.randomUUID())),
            observed,
            CalendarOccurrenceState.LEASED,
            1,
            owner.value,
            observed.plusSeconds(60),
        ))
        return requireNotNull(CalendarOccurrenceLease.from(occurrence, observed, observed))
    }

    private fun systemCandidate(): CalendarSystemCandidate {
        val draft = CalendarFixtures.draft()
        val preflight = CalendarPreflight.check(CalendarFixtures.preflightId(), draft, CalendarFixtures.now)
        val scheduled = CalendarDecision.apply(draft, draft.revision, CalendarStep.Schedule, CalendarFixtures.now, preflight).event
        return requireNotNull(CalendarSystemCandidate.from(scheduled, scheduled.definition.start.instant))
    }

    private fun notificationId() = requireNotNull(NotificationId.fromWire(UUID.randomUUID()))
}
