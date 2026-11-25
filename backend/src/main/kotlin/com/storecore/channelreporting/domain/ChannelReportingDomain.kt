package com.storecore.channelreporting.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

enum class ReportAvailability { AVAILABLE, UNAVAILABLE, NOT_AVAILABLE, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class ReportSource {
    STORECORE_ORDER, STORECORE_PAYMENT_APPLICATION, STORECORE_INVENTORY_LEDGER, STORECORE_RETURN,
    STORECORE_CURRENT_INVENTORY, BLACKSTORE_STOCK_SAGA, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class ReportTimeBasis {
    ORDER_CREATED, PAYMENT_APPLIED, LEDGER_RECORDED, RETURN_RECEIVED, DISPOSITION_CONFIRMED, CURRENT_SNAPSHOT, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class ReportFreshness { CURRENT, STALE, UNAVAILABLE, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class ReportUnavailableReason(val availability: ReportAvailability?) {
    NO_EVIDENCE(ReportAvailability.UNAVAILABLE), SOURCE_DISABLED(ReportAvailability.UNAVAILABLE),
    SOURCE_MISSING(ReportAvailability.UNAVAILABLE), SOURCE_CONTRADICTORY(ReportAvailability.UNAVAILABLE),
    READ_FAILED(ReportAvailability.UNAVAILABLE), EXPIRED_SNAPSHOT(ReportAvailability.UNAVAILABLE),
    UNSUPPORTED_HISTORY(ReportAvailability.NOT_AVAILABLE), UNSUPPORTED_CONTRACT(ReportAvailability.NOT_AVAILABLE),
    UNSUPPORTED_VERSION(ReportAvailability.NOT_AVAILABLE), REVERSAL_AMOUNT_UNAVAILABLE(ReportAvailability.NOT_AVAILABLE),
    EXTERNAL_COMMERCIAL_FACTS_UNAVAILABLE(ReportAvailability.NOT_AVAILABLE), UNKNOWN(null);
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

sealed interface ReportEvidence {
    val source: ReportSource
    val timeBasis: ReportTimeBasis
    val observedAt: Instant
    val freshness: ReportFreshness

    class Period private constructor(
        override val source: ReportSource,
        override val timeBasis: ReportTimeBasis,
        override val freshness: ReportFreshness,
        val period: ReportPeriod,
    ) : ReportEvidence {
        override val observedAt: Instant = period.generatedAt
        companion object {
            fun create(source: ReportSource, timeBasis: ReportTimeBasis, freshness: ReportFreshness, period: ReportPeriod): Period? =
                takeIf { valid(source, freshness) && timeBasis != ReportTimeBasis.UNKNOWN && timeBasis != ReportTimeBasis.CURRENT_SNAPSHOT }
                    ?.let { Period(source, timeBasis, freshness, period) }
        }
    }

    class Current private constructor(
        override val source: ReportSource,
        override val observedAt: Instant,
        override val freshness: ReportFreshness,
    ) : ReportEvidence {
        override val timeBasis = ReportTimeBasis.CURRENT_SNAPSHOT
        companion object {
            fun create(source: ReportSource, observedAt: Instant, freshness: ReportFreshness): Current? =
                takeIf { valid(source, freshness) }?.let { Current(source, observedAt, freshness) }
        }
    }

    companion object {
        fun period(source: ReportSource, timeBasis: ReportTimeBasis, freshness: ReportFreshness, period: ReportPeriod): Period? =
            Period.create(source, timeBasis, freshness, period)
        fun current(source: ReportSource, observedAt: Instant, freshness: ReportFreshness): Current? =
            Current.create(source, observedAt, freshness)
        private fun valid(source: ReportSource, freshness: ReportFreshness) =
            source != ReportSource.UNKNOWN && freshness in setOf(ReportFreshness.CURRENT, ReportFreshness.STALE)
    }
}

sealed interface ReportValue<out T : Any> {
    val availability: ReportAvailability

    class Available<T : Any> private constructor(val value: T, val evidence: ReportEvidence) : ReportValue<T> {
        override val availability = ReportAvailability.AVAILABLE
        companion object { fun <T : Any> create(value: T, evidence: ReportEvidence) = Available(value, evidence) }
    }
    class Unavailable private constructor(val reason: ReportUnavailableReason) : ReportValue<Nothing> {
        override val availability = ReportAvailability.UNAVAILABLE
        companion object {
            fun create(reason: ReportUnavailableReason): Unavailable? = reason.takeIf { it.availability == ReportAvailability.UNAVAILABLE }?.let(::Unavailable)
        }
    }
    class NotAvailable private constructor(val reason: ReportUnavailableReason) : ReportValue<Nothing> {
        override val availability = ReportAvailability.NOT_AVAILABLE
        companion object {
            fun create(reason: ReportUnavailableReason): NotAvailable? = reason.takeIf { it.availability == ReportAvailability.NOT_AVAILABLE }?.let(::NotAvailable)
        }
    }
    data object Unknown : ReportValue<Nothing> { override val availability = ReportAvailability.UNKNOWN }

    companion object {
        fun <T : Any> available(value: T, evidence: ReportEvidence): ReportValue<T> = Available.create(value, evidence)
        fun <T : Any> unavailable(reason: ReportUnavailableReason): ReportValue<T>? = Unavailable.create(reason)
        fun <T : Any> notAvailable(reason: ReportUnavailableReason): ReportValue<T>? = NotAvailable.create(reason)
        fun <T : Any> unknown(): ReportValue<T> = Unknown
    }
}

@JvmInline value class ReportUnsignedLong private constructor(val wire: String) {
    val value: Long get() = wire.toLong()
    companion object {
        fun fromWire(raw: String?): ReportUnsignedLong? = raw?.takeIf { UNSIGNED.matches(it) && it.toLongOrNull() != null }?.let(::ReportUnsignedLong)
        fun fromValue(value: Long): ReportUnsignedLong? = value.takeIf { it >= 0 }?.toString()?.let(::ReportUnsignedLong)
        private val UNSIGNED = Regex("0|[1-9][0-9]*")
    }
}

@JvmInline value class ReportSignedLong private constructor(val wire: String) {
    val value: Long get() = wire.toLong()
    companion object {
        fun fromWire(raw: String?): ReportSignedLong? = raw?.takeIf { SIGNED.matches(it) && it.toLongOrNull() != null }?.let(::ReportSignedLong)
        fun fromValue(value: Long): ReportSignedLong = ReportSignedLong(value.toString())
        private val SIGNED = Regex("0|-?[1-9][0-9]*")
    }
}

@JvmInline value class ReportArsAmount private constructor(val wire: String) {
    val value: BigDecimal get() = wire.toBigDecimal()
    companion object {
        fun fromWire(raw: String?): ReportArsAmount? = raw?.takeIf { MONEY.matches(it) }
            ?.let { runCatching { BigDecimal(it) }.getOrNull() }
            ?.takeIf { it.signum() >= 0 && it.scale() == 2 }
            ?.toPlainString()?.let(::ReportArsAmount)
        fun fromValue(value: BigDecimal): ReportArsAmount? = runCatching { value.setScale(2, RoundingMode.UNNECESSARY) }
            .getOrNull()?.takeIf { it.signum() >= 0 }?.toPlainString()?.let(::fromWire)
        private val MONEY = Regex("(?:0|[1-9][0-9]*)[.][0-9]{2}")
    }
}

fun interface ReportPeriodHasher { fun hash(fields: List<String>): String }

@JvmInline value class ReportPeriodToken private constructor(val wire: String) {
    companion object {
        fun fromWire(raw: String?): ReportPeriodToken? = raw?.takeIf { TOKEN.matches(it) }?.let(::ReportPeriodToken)
        private val TOKEN = Regex("[0-9a-f]{64}")
    }
}

class ReportPeriod private constructor(
    val fromDate: LocalDate,
    val toDateExclusive: LocalDate,
    val timezone: ZoneId,
    val fromInclusive: Instant,
    val toExclusive: Instant,
    val generatedAt: Instant,
    val token: ReportPeriodToken,
) {
    companion object {
        const val CONTRACT_VERSION = "storecore-channel-report-v1"
        private val DATE = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")

        fun create(fromRaw: String?, toRaw: String?, zoneRaw: String?, generatedAt: Instant?, hasher: ReportPeriodHasher): ReportPeriod? {
            val from = date(fromRaw) ?: return null
            val to = date(toRaw) ?: return null
            val days = ChronoUnit.DAYS.between(from, to)
            if (days !in 1..366 || generatedAt == null) return null
            val zoneId = zoneRaw ?: return null
            if (zoneId !in ZoneId.getAvailableZoneIds()) return null
            val zone = try { ZoneId.of(zoneId) } catch (_: DateTimeException) { return null }
            val fromInstant = midnight(from, zone) ?: return null
            val toInstant = midnight(to, zone) ?: return null
            val fields = listOf(CONTRACT_VERSION, from.toString(), to.toString(), zone.id, fromInstant.toString(), toInstant.toString())
            val token = ReportPeriodToken.fromWire(hasher.hash(fields)) ?: return null
            return ReportPeriod(from, to, zone, fromInstant, toInstant, generatedAt, token)
        }

        private fun date(raw: String?): LocalDate? = raw?.takeIf(DATE::matches)?.let {
            runCatching { LocalDate.parse(it) }.getOrNull()?.takeIf { parsed -> parsed.toString() == it }
        }

        private fun midnight(date: LocalDate, zone: ZoneId): Instant? {
            val local = LocalDateTime.of(date, LocalTime.MIDNIGHT)
            val offsets = zone.rules.getValidOffsets(local)
            return offsets.singleOrNull()?.let(local::toInstant)
        }
    }
}
