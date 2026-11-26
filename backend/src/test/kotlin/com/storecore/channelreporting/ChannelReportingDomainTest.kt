package com.storecore.channelreporting

import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.application.InventoryMovementMetric
import com.storecore.channelreporting.application.ReportInventoryChannel
import com.storecore.channelreporting.application.ReportInventoryEventType
import com.storecore.channelreporting.application.BlackStoreRegistrationReport
import com.storecore.channelreporting.application.BlackStoreRegistrationState
import com.storecore.channelreporting.domain.*
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ChannelReportingDomainTest {
    private val hasher = ReportPeriodHasher { fields ->
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(fields.joinToString("\u0000").toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    @Test fun `all reporting vocabularies are closed and unknown stays unusable`() {
        assertEquals(ReportAvailability.AVAILABLE, ReportAvailability.fromWire("AVAILABLE"))
        assertEquals(ReportAvailability.UNKNOWN, ReportAvailability.fromWire("available"))
        assertEquals(ReportSource.UNKNOWN, ReportSource.fromWire("BLACKSTORE_SALE"))
        assertEquals(ReportTimeBasis.UNKNOWN, ReportTimeBasis.fromWire("PROVIDER_OCCURRED"))
        assertEquals(ReportFreshness.UNKNOWN, ReportFreshness.fromWire("FRESH"))
        assertEquals(ReportUnavailableReason.UNKNOWN, ReportUnavailableReason.fromWire("NEW_REASON"))
        assertIs<ReportValue.Unknown>(ReportValue.unknown<Long>())
        assertIs<ReportValue.NotAvailable>(ReportValue.notAvailable<Long>(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
        assertNull(ReportValue.notAvailable<Long>(ReportUnavailableReason.UNKNOWN))
        assertNull(ReportValue.notAvailable<Long>(ReportUnavailableReason.SOURCE_MISSING))
        assertNull(ReportValue.unavailable<Long>(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
        assertNull(StoreCoreCreatedOrderReadResult.SourceUnavailable.create(ReportUnavailableReason.UNKNOWN))
        assertNull(StoreCoreCreatedOrderReadResult.SourceUnavailable.create(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
        assertNotNull(StoreCoreCreatedOrderReadResult.SourceUnavailable.create(ReportUnavailableReason.READ_FAILED))
    }

    @Test fun `lossless unsigned and signed quantities accept only canonical Long wires`() {
        assertEquals("9223372036854775807", ReportUnsignedLong.fromWire("9223372036854775807")?.wire)
        for (raw in listOf("", "00", "01", "-1", "+1", "9223372036854775808")) assertNull(ReportUnsignedLong.fromWire(raw))
        assertEquals("-9223372036854775808", ReportSignedLong.fromWire("-9223372036854775808")?.wire)
        assertEquals("0", ReportSignedLong.fromWire("0")?.wire)
        for (raw in listOf("-0", "+1", "01", "-01", "9223372036854775808", "-9223372036854775809")) assertNull(ReportSignedLong.fromWire(raw))
    }

    @Test fun `inventory movement metric rejects schema illegal event channel pairings`() {
        assertNull(
            InventoryMovementMetric.create(
                ReportInventoryEventType.RMA_RESTOCK,
                ReportInventoryChannel.WEB,
                ReportUnsignedLong.fromValue(1)!!,
                ReportSignedLong.fromValue(1),
            ),
        )
        assertNotNull(
            InventoryMovementMetric.create(
                ReportInventoryEventType.RMA_RESTOCK,
                ReportInventoryChannel.INTERNAL,
                ReportUnsignedLong.fromValue(1)!!,
                ReportSignedLong.fromValue(1),
            ),
        )
    }

    @Test fun `blackstore registration state and revoked history cannot contradict`() {
        val zero = ReportUnsignedLong.fromValue(0)!!
        val one = ReportUnsignedLong.fromValue(1)!!
        assertNull(BlackStoreRegistrationReport.create(BlackStoreRegistrationState.ABSENT, one))
        assertNull(BlackStoreRegistrationReport.create(BlackStoreRegistrationState.REVOKED_ONLY, zero))
        assertNotNull(BlackStoreRegistrationReport.create(BlackStoreRegistrationState.ABSENT, zero))
        assertNotNull(BlackStoreRegistrationReport.create(BlackStoreRegistrationState.REVOKED_ONLY, one))
    }

    @Test fun `ARS money is a nonnegative canonical scale two decimal`() {
        assertEquals("0.00", ReportArsAmount.fromWire("0.00")?.wire)
        assertEquals("123456789012.34", ReportArsAmount.fromWire("123456789012.34")?.wire)
        assertEquals("1999999999999.98", ReportArsAmount.fromWire("1999999999999.98")?.wire)
        assertEquals("0.00", ReportArsAmount.fromValue(java.math.BigDecimal.ZERO)?.wire)
        assertEquals("1.00", ReportArsAmount.fromValue(java.math.BigDecimal.ONE)?.wire)
        assertEquals("1.00", ReportArsAmount.fromValue(java.math.BigDecimal("1.0"))?.wire)
        assertNull(ReportArsAmount.fromValue(java.math.BigDecimal("1.001")))
        for (raw in listOf("0", "00.00", "1.0", "-1.00", "+1.00", "1.000")) assertNull(ReportArsAmount.fromWire(raw))
    }

    @Test fun `period resolves exact merchant midnights and token binds every authority field`() {
        val generated = Instant.parse("2026-11-25T20:00:00Z")
        val first = ReportPeriod.create("2026-11-01", "2026-11-26", "America/Argentina/Buenos_Aires", generated, hasher)!!
        val replay = ReportPeriod.create("2026-11-01", "2026-11-26", "America/Argentina/Buenos_Aires", generated.plusSeconds(5), hasher)!!
        assertEquals(Instant.parse("2026-11-01T03:00:00Z"), first.fromInclusive)
        assertEquals(Instant.parse("2026-11-26T03:00:00Z"), first.toExclusive)
        assertEquals(first.token, replay.token)
        assertEquals(generated, first.generatedAt)
        assertNotEquals(first.token, ReportPeriod.create("2026-11-01", "2026-11-26", "UTC", generated, hasher)!!.token)
        val periodEvidence = ReportEvidence.period(ReportSource.STORECORE_PAYMENT_APPLICATION, ReportTimeBasis.PAYMENT_APPLIED, ReportFreshness.CURRENT, first)
        assertNotNull(periodEvidence)
        assertEquals(first.token, periodEvidence.period.token)
        assertEquals(generated, periodEvidence.observedAt)
        assertNull(ReportEvidence.period(ReportSource.STORECORE_CURRENT_INVENTORY, ReportTimeBasis.CURRENT_SNAPSHOT, ReportFreshness.CURRENT, first))
        assertNotNull(ReportEvidence.current(ReportSource.STORECORE_CURRENT_INVENTORY, generated, ReportFreshness.CURRENT))
    }

    @Test fun `period rejects malformed excessive and non-unique midnight boundaries`() {
        val now = Instant.parse("2026-11-25T20:00:00Z")
        assertNull(ReportPeriod.create("2026-11-01", "2026-11-01", "America/Argentina/Buenos_Aires", now, hasher))
        assertNotNull(ReportPeriod.create("2026-01-01", "2027-01-02", "America/Argentina/Buenos_Aires", now, hasher))
        assertNull(ReportPeriod.create("2026-01-01", "2027-01-03", "America/Argentina/Buenos_Aires", now, hasher))
        assertNull(ReportPeriod.create("2026-1-01", "2026-02-01", "America/Argentina/Buenos_Aires", now, hasher))
        assertNull(ReportPeriod.create("2011-12-30", "2011-12-31", "Pacific/Apia", now, hasher))
        assertNull(ReportPeriod.create("2000-10-29", "2000-10-30", "America/Havana", now, hasher))
        assertNull(ReportPeriod.create("2026-01-01", "2026-02-01", "+03:00", now, hasher))
        assertNull(ReportPeriod.create("2026-01-01", "2026-02-01", "UTC+03:00", now, hasher))
        assertNull(ReportPeriod.create("2026-01-01", "2026-02-01", "Not/A_Zone", now, hasher))
    }

    @Test fun `production period hash is lowercase framed SHA 256 and not delimiter ambiguous`() {
        val production = Sha256ReportPeriodHasher()
        val first = production.hash(listOf("ab", "c"))
        val second = production.hash(listOf("a", "bc"))
        assertEquals(64, first.length)
        assertEquals(first.lowercase(), first)
        assertNotEquals(first, second)
        assertEquals(first, production.hash(listOf("ab", "c")))
    }
}
