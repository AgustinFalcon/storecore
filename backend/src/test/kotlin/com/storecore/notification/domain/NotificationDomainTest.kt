package com.storecore.notification.domain

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class NotificationDomainTest {
    private val id = requireNotNull(NotificationId.fromWire(UUID.fromString("00000000-0000-0000-0000-000000000001")))
    private val actor = requireNotNull(NotificationActorId.fromWire(2L))
    private val commandId = requireNotNull(NotificationCommandId.fromWire(UUID.fromString("00000000-0000-0000-0000-000000000003")))
    private val source = requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.STORECORE_FACT, requireNotNull(NotificationSourceId.fromWire("stock-001"))))
    private val condition = requireNotNull(NotificationConditionCode.fromWire("LOW_STOCK"))
    private val episode = requireNotNull(NotificationEpisodeKey.fromWire("episode-001"))
    private val time = Instant.parse("2026-11-22T12:00:00Z")

    private fun open(severity: NotificationSeverity = NotificationSeverity.WARNING) = requireNotNull(NotificationAlert.open(id, source, NotificationCategory.STOCK, severity, condition, episode))
    private fun command(alert: NotificationAlert, step: NotificationTransitionStep, revision: NotificationRevision = alert.revision,
                        at: Instant = time, reason: NotificationReason = requireNotNull(NotificationReason.fromWire(" Reviewed by administrator ")),
                        target: NotificationId = alert.id, actorId: NotificationActorId = actor) = requireNotNull(NotificationCommand.ChangeLifecycle.create(commandId, target, actorId, revision, step, reason, at))
    private fun restore(lifecycle: NotificationLifecycle, revision: Long = 0L, category: NotificationCategory = NotificationCategory.STOCK,
                        severity: NotificationSeverity = NotificationSeverity.WARNING): NotificationAlert =
        NotificationAlert.restore(id, source, open().fingerprint, category, severity, lifecycle, requireNotNull(NotificationRevision.fromWire(revision)))

    @Test fun `all closed vocabularies translate exact wires and fail unknown without normalization`() {
        NotificationSeverity.entries.forEach { assertSame(it, NotificationSeverity.fromWire(it.wire)) }
        NotificationCategory.entries.forEach { assertSame(it, NotificationCategory.fromWire(it.wire)) }
        NotificationSourceType.entries.forEach { assertSame(it, NotificationSourceType.fromWire(it.wire)) }
        NotificationLifecycle.entries.forEach { assertSame(it, NotificationLifecycle.fromWire(it.wire)) }
        NotificationTransitionStep.known.forEach { assertSame(it, NotificationTransitionStep.fromWire(it.wire)) }
        listOf(null, "", "future", "open", " OPEN ", "UNKNOWN").forEach { raw ->
            assertSame(NotificationSeverity.UNKNOWN, NotificationSeverity.fromWire(raw))
            assertSame(NotificationCategory.UNKNOWN, NotificationCategory.fromWire(raw))
            assertSame(NotificationSourceType.UNKNOWN, NotificationSourceType.fromWire(raw))
            assertSame(NotificationLifecycle.UNKNOWN, NotificationLifecycle.fromWire(raw))
            assertSame(NotificationTransitionStep.Unknown, NotificationTransitionStep.fromWire(raw))
        }
        assertTrue(NotificationLifecycle.entries.all { it.label.isNotBlank() })
        assertTrue(NotificationTransitionStep.known.all { it.label.isNotBlank() })
    }

    @Test fun `steps own the exact lifecycle graph including invalid and unknown edges`() {
        val edges = mapOf(
            NotificationLifecycle.OPEN to listOf(NotificationTransitionStep.Acknowledge, NotificationTransitionStep.Resolve),
            NotificationLifecycle.ACKNOWLEDGED to listOf(NotificationTransitionStep.Resolve),
            NotificationLifecycle.RESOLVED to listOf(NotificationTransitionStep.Reopen),
            NotificationLifecycle.UNKNOWN to emptyList(),
        )
        NotificationLifecycle.entries.forEach { state ->
            assertEquals(edges.getValue(state), state.availableSteps())
            (NotificationTransitionStep.known + NotificationTransitionStep.Unknown).forEach { step ->
                assertEquals(step in edges.getValue(state), step.accepts(state), "$state / $step")
                val actual = NotificationCommand.ChangeLifecycle.create(commandId, id, actor, requireNotNull(NotificationRevision.fromWire(0)), step,
                    requireNotNull(NotificationReason.fromWire("reason")), time)
                if (actual != null) {
                    val result = restore(state).apply(actual)
                    when {
                        state == NotificationLifecycle.UNKNOWN -> assertSame(NotificationCommandResult.Unknown, result)
                        step in edges.getValue(state) -> assertInstanceOf(NotificationCommandResult.Applied::class.java, result)
                        else -> assertSame(NotificationCommandResult.InvalidTransition, result)
                    }
                } else assertSame(NotificationTransitionStep.Unknown, step)
            }
        }
    }

    @Test fun `aggregate increments immutably records command context and preserves source fingerprint`() {
        val original = open()
        val request = command(original, NotificationTransitionStep.Acknowledge)
        val applied = assertInstanceOf(NotificationCommandResult.Applied::class.java, original.apply(request))
        assertSame(NotificationLifecycle.OPEN, original.lifecycle)
        assertEquals(0L, original.revision.value)
        assertSame(NotificationLifecycle.ACKNOWLEDGED, applied.alert.lifecycle)
        assertEquals(1L, applied.alert.revision.value)
        assertSame(original.source, applied.alert.source)
        assertEquals(original.fingerprint, applied.alert.fingerprint)
        assertSame(request, applied.change.command)
        assertEquals(actor, applied.change.command.actorId)
        assertEquals(time, applied.change.command.occurredAt)
        assertEquals("Reviewed by administrator", applied.change.command.reason.value)
        assertEquals(original.revision, applied.change.previousRevision)
        assertEquals(applied.alert.revision, applied.change.revision)
        assertEquals(NotificationLifecycle.OPEN, applied.change.previous)
        assertEquals(NotificationLifecycle.ACKNOWLEDGED, applied.change.current)
        val resolved = assertInstanceOf(NotificationCommandResult.Applied::class.java, applied.alert.apply(command(applied.alert, NotificationTransitionStep.Resolve))).alert
        val reopened = assertInstanceOf(NotificationCommandResult.Applied::class.java, resolved.apply(command(resolved, NotificationTransitionStep.Reopen))).alert
        assertEquals(3L, reopened.revision.value)
        assertEquals(original.fingerprint, reopened.fingerprint)
        assertSame(original.source, reopened.source)
    }

    @Test fun `stale repeated foreign unknown and exhausted commands have no effects or synthetic replay`() {
        val original = open()
        val request = command(original, NotificationTransitionStep.Resolve)
        val resolved = assertInstanceOf(NotificationCommandResult.Applied::class.java, original.apply(request)).alert
        assertInstanceOf(NotificationCommandResult.RevisionConflict::class.java, resolved.apply(request))
        assertSame(NotificationCommandResult.InvalidTransition, resolved.apply(command(resolved, NotificationTransitionStep.Resolve)))
        assertSame(NotificationCommandResult.WrongAggregate, original.apply(command(original, NotificationTransitionStep.Resolve,
            target = requireNotNull(NotificationId.fromWire(UUID.fromString("00000000-0000-0000-0000-000000000099"))))))
        assertSame(NotificationCommandResult.Unknown, original.apply(NotificationCommand.Unknown))
        assertSame(NotificationCommandResult.Unknown, restore(NotificationLifecycle.OPEN, severity = NotificationSeverity.UNKNOWN).apply(request))
        assertSame(NotificationCommandResult.Unknown, restore(NotificationLifecycle.OPEN, category = NotificationCategory.UNKNOWN).apply(request))
        val unknownSource = NotificationSourceIdentity.restore(NotificationSourceType.UNKNOWN, source.id)
        val unknownSourceAlert = NotificationAlert.restore(id, unknownSource, original.fingerprint, NotificationCategory.STOCK,
            NotificationSeverity.WARNING, NotificationLifecycle.OPEN, original.revision)
        assertSame(NotificationCommandResult.Unknown, unknownSourceAlert.apply(request))
        val exhausted = restore(NotificationLifecycle.OPEN, Long.MAX_VALUE)
        assertSame(NotificationCommandResult.RevisionExhausted, exhausted.apply(command(exhausted, NotificationTransitionStep.Resolve)))
        assertEquals(Long.MAX_VALUE, exhausted.revision.value)
        assertNull(NotificationRevision.fromWire(-1)); assertNull(NotificationRevision.fromWire(null))
        assertNull(requireNotNull(NotificationRevision.fromWire(Long.MAX_VALUE)).next())
        assertNull(NotificationAlert.open(id, source, NotificationCategory.UNKNOWN, NotificationSeverity.INFO, condition, episode))
        assertNull(NotificationAlert.open(id, source, NotificationCategory.STOCK, NotificationSeverity.UNKNOWN, condition, episode))
        assertNull(NotificationAlert.open(id, NotificationSourceIdentity.restore(NotificationSourceType.UNKNOWN, source.id),
            NotificationCategory.STOCK, NotificationSeverity.INFO, condition, episode))
    }

    @Test fun `source episode reason and identifiers enforce exact wire bounds and reject malformed UTF8`() {
        assertNotNull(NotificationSourceId.fromWire("é".repeat(64)))
        assertNull(NotificationSourceId.fromWire("é".repeat(65)))
        assertNotNull(NotificationEpisodeKey.fromWire("a".repeat(128)))
        assertNull(NotificationEpisodeKey.fromWire("a".repeat(129)))
        listOf(null, "", "\u0000", "a\u0000b", "\uD800").forEach { assertNull(NotificationSourceId.fromWire(it)); assertNull(NotificationEpisodeKey.fromWire(it)) }
        assertNotEquals(NotificationSourceId.fromWire("source"), NotificationSourceId.fromWire(" source "))
        assertNotNull(NotificationConditionCode.fromWire("A0_-.") )
        assertNotNull(NotificationConditionCode.fromWire("A".repeat(64)))
        listOf(null, "", "a", "A B", "É", "A".repeat(65), " A ").forEach { assertNull(NotificationConditionCode.fromWire(it)) }
        val emoji = "\uD83D\uDE00"
        assertNotNull(NotificationReason.fromWire("  ${emoji.repeat(500)}  "))
        assertNull(NotificationReason.fromWire(emoji.repeat(501)))
        listOf(null, "", " \t\n\r\u000B\u000C ", "a\u0000b", "\uD800").forEach { assertNull(NotificationReason.fromWire(it)) }
        assertEquals("reason", NotificationReason.fromWire("\t\n reason \r\u000B\u000C")?.value)
        assertEquals("reason", NotificationReason.fromWire("  reason  ")?.value)
        assertNull(NotificationId.fromWire(UUID(0, 0))); assertNull(NotificationId.fromWire(null))
        assertNull(NotificationActorId.fromWire(0)); assertNull(NotificationActorId.fromWire(-1)); assertNull(NotificationActorId.fromWire(null))
        assertNotNull(NotificationActorId.fromWire(Long.MAX_VALUE)); assertNull(NotificationCommandId.fromWire(UUID(0, 0)))
        assertNull(NotificationDeliveryId.fromWire(UUID(0, 0))); assertNotNull(NotificationDeliveryId.fromWire(commandId.value))
        assertNull(NotificationSourceIdentity.create(NotificationSourceType.UNKNOWN, source.id))
        assertSame(NotificationSourceType.UNKNOWN, NotificationSourceIdentity.restore(NotificationSourceType.UNKNOWN, source.id).type)
    }

    @Test fun `versioned fingerprint matches independent golden and frames ambiguous concatenations`() {
        assertEquals("d8703975b843c813c9d21b0e9f0308a1fb572da9a00db1c8ff61dee51b516f4e", open().fingerprint.value)
        val a = requireNotNull(NotificationFingerprint.v1(NotificationCategory.STOCK, requireNotNull(NotificationConditionCode.fromWire("A")), requireNotNull(NotificationEpisodeKey.fromWire("BC"))))
        val b = requireNotNull(NotificationFingerprint.v1(NotificationCategory.STOCK, requireNotNull(NotificationConditionCode.fromWire("AB")), requireNotNull(NotificationEpisodeKey.fromWire("C"))))
        assertNotEquals(a, b)
        assertNotEquals(open().fingerprint, NotificationFingerprint.v1(NotificationCategory.STOCK, condition, requireNotNull(NotificationEpisodeKey.fromWire("episode-002"))))
        assertNotEquals(open().fingerprint, NotificationFingerprint.v1(NotificationCategory.ORDER, condition, episode))
        assertNotEquals(open().fingerprint, NotificationFingerprint.v1(NotificationCategory.STOCK, requireNotNull(NotificationConditionCode.fromWire("OUT_OF_STOCK")), episode))
        assertNull(NotificationFingerprint.v1(NotificationCategory.UNKNOWN, condition, episode))
        assertEquals(open(NotificationSeverity.INFO).fingerprint, open(NotificationSeverity.CRITICAL).fingerprint)
        val otherSource = requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.SYSTEM_CAMPAIGN, requireNotNull(NotificationSourceId.fromWire("other"))))
        val other = requireNotNull(NotificationAlert.open(id, otherSource, NotificationCategory.STOCK, NotificationSeverity.INFO, condition, episode))
        assertEquals(open().fingerprint, other.fingerprint) // Source identity is another component of the unique episode key.
        assertNotEquals(source, otherSource)
        assertEquals(source, NotificationSourceIdentity.create(source.type, source.id))
        assertEquals(source.hashCode(), requireNotNull(NotificationSourceIdentity.create(source.type, source.id)).hashCode())
        listOf(null, "", "A".repeat(64), "0".repeat(63), "0".repeat(65), "g".repeat(64)).forEach {
            assertNull(NotificationFingerprint.fromWire(it)); assertNull(NotificationCommandPayloadHash.fromWire(it))
        }
        assertEquals(open().fingerprint, NotificationFingerprint.fromWire(open().fingerprint.value))
    }

    @Test fun `command payload hash is stable for authority payload but distinct from delivery and episode`() {
        val alert = open()
        val first = command(alert, NotificationTransitionStep.Resolve)
        assertEquals(first.payloadHash(), command(alert, NotificationTransitionStep.Resolve, at = time.plusSeconds(60)).payloadHash())
        assertNotEquals(first.payloadHash(), command(alert, NotificationTransitionStep.Acknowledge).payloadHash())
        assertNotEquals(first.payloadHash(), command(alert, NotificationTransitionStep.Resolve, revision = requireNotNull(NotificationRevision.fromWire(1))).payloadHash())
        assertNotEquals(first.payloadHash(), command(alert, NotificationTransitionStep.Resolve, reason = requireNotNull(NotificationReason.fromWire("another reason"))).payloadHash())
        assertNotEquals(first.payloadHash(), command(alert, NotificationTransitionStep.Resolve, actorId = requireNotNull(NotificationActorId.fromWire(4L))).payloadHash())
        assertNotEquals(first.payloadHash(), command(alert, NotificationTransitionStep.Resolve, target = requireNotNull(NotificationId.fromWire(UUID.fromString("00000000-0000-0000-0000-000000000005")))).payloadHash())
        assertNotEquals(alert.fingerprint.value, first.payloadHash().value)
        assertEquals(first.payloadHash(), NotificationCommandPayloadHash.fromWire(first.payloadHash().value))
    }
}
