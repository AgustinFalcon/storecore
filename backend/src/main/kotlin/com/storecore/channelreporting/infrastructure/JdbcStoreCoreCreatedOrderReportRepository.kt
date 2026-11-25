package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.sql.Timestamp
import javax.sql.DataSource

class JdbcStoreCoreCreatedOrderReportRepository(
    source: DataSource,
    private val hasher: ReportPeriodHasher,
) : StoreCoreCreatedOrderReportRepository {
    private val jdbc = JdbcTemplate(source)
    private val transaction = TransactionTemplate(DataSourceTransactionManager(source)).apply {
        isolationLevel = TransactionDefinition.ISOLATION_REPEATABLE_READ
        isReadOnly = true
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    override fun read(fromDate: String?, toDateExclusive: String?): StoreCoreCreatedOrderReadResult {
        if (!ReportPeriod.validRequest(fromDate, toDateExclusive)) return StoreCoreCreatedOrderReadResult.InvalidPeriod
        return try {
            transaction.execute {
                val transactionContract = jdbc.queryForMap(
                    "SELECT current_setting('transaction_isolation') isolation, current_setting('transaction_read_only') read_only",
                )
                if (transactionContract["isolation"] != "repeatable read" || transactionContract["read_only"] != "on") {
                    return@execute unavailable(ReportUnavailableReason.READ_FAILED)
                }
                val zone = jdbc.query("SELECT timezone FROM installation_settings WHERE installation_id=1", { row, _ -> row.getString(1) }).singleOrNull()
                    ?: return@execute StoreCoreCreatedOrderReadResult.TimezoneUnavailable
                val generatedAt = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)?.toInstant()
                    ?: return@execute unavailable(ReportUnavailableReason.READ_FAILED)
                val period = ReportPeriod.create(fromDate, toDateExclusive, zone, generatedAt, hasher)
                    ?: return@execute StoreCoreCreatedOrderReadResult.TimezoneUnavailable
                val row = jdbc.queryForMap(
                    """SELECT count(*) row_count, COALESCE(sum(total),0.00) nominal_total,
                              count(*) FILTER (WHERE currency<>'ARS' OR total<0 OR subtotal<0 OR shipping_cost<0 OR total<>subtotal+shipping_cost) contradiction_count
                       FROM orders WHERE created_at>=? AND created_at<?""",
                    Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive),
                )
                if ((row["contradiction_count"] as Number).toLong() != 0L) {
                    return@execute unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY)
                }
                val count = ReportUnsignedLong.fromValue((row["row_count"] as Number).toLong())
                val amount = ReportArsAmount.fromValue(row["nominal_total"] as BigDecimal)
                val evidence = ReportEvidence.period(ReportSource.STORECORE_ORDER, ReportTimeBasis.ORDER_CREATED, ReportFreshness.CURRENT, period)
                if (count == null || amount == null || evidence == null) {
                    unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY)
                } else StoreCoreCreatedOrderReadResult.Found(
                    StoreCoreCreatedOrderReport(period, ReportValue.available(CreatedOrderMetrics(count, amount), evidence)),
                )
            } ?: unavailable(ReportUnavailableReason.READ_FAILED)
        } catch (_: DataAccessException) {
            unavailable(ReportUnavailableReason.READ_FAILED)
        } catch (_: TransactionException) {
            unavailable(ReportUnavailableReason.READ_FAILED)
        }
    }

    private fun unavailable(reason: ReportUnavailableReason): StoreCoreCreatedOrderReadResult.SourceUnavailable =
        requireNotNull(StoreCoreCreatedOrderReadResult.SourceUnavailable.create(reason))
}
