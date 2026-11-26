package com.storecore.channelreporting

import com.storecore.channelreporting.application.ChannelReportCsvPreparationRequest
import com.storecore.channelreporting.application.ChannelReportCsvPreparationResult
import com.storecore.channelreporting.application.PreparedChannelReportCsv
import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.infrastructure.ChannelReportCsvPlan
import com.storecore.channelreporting.infrastructure.ChannelReportCsvPreparationObserver
import com.storecore.channelreporting.infrastructure.ChannelReportCsvPreparationStage
import com.storecore.channelreporting.infrastructure.JdbcStoreCoreCreatedOrderReportRepository
import com.storecore.channelreporting.infrastructure.PreparedChannelReportCsvFactory
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigInteger
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ChannelReportCsvRepositoryLimitPostgresTest {
    @Test fun `repository prepares exactly fifty thousand records and rejects fifty thousand one before details`() {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { postgres ->
            postgres.start()
            val source = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            Flyway.configure().dataSource(source).load().migrate()
            val jdbc = JdbcTemplate(source)
            jdbc.update(
                """INSERT INTO installation_settings(installation_id,business_name,allowed_host,timezone)
                   VALUES (1,'CSV Limit Test','localhost','America/Argentina/Buenos_Aires')""",
            )
            val repository = JdbcStoreCoreCreatedOrderReportRepository(source, Sha256ReportPeriodHasher())
            val from = "1995-01-01"
            val to = "1995-01-02"
            val empty = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read(from, to))
            val baseline = expectedRecords(requireNotNull(ChannelReportCsvPlan.create(empty.report)))
            val remaining = 50_000 - baseline
            assertTrue(remaining > 0)
            val lowStockCount = remaining / 2
            val currentStockOnlyCount = remaining % 2
            insertVariants(jdbc, lowStockCount, currentStockOnlyCount)

            val exact = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read(from, to))
            assertTrue(requireNotNull(ChannelReportCsvPlan.create(exact.report)).budget.matchesPreparedRecordCount(BigInteger.valueOf(50_000)))
            val exactRequest = ChannelReportCsvPreparationRequest.create(from, to, exact.report.period.token)!!
            val exactPrepared = assertIs<ChannelReportCsvPreparationResult.Prepared>(repository.prepare(exactRequest))
            val csv = exactPrepared.artifact.readBytes()!!.toString(Charsets.UTF_8)
            assertEquals(50_002, "\r\n".toRegex().findAll(csv).count())
            exactPrepared.artifact.close()

            insertVariants(jdbc, lowStockCount = 0, currentStockOnlyCount = 1)
            val above = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read(from, to))
            assertTrue(requireNotNull(ChannelReportCsvPlan.create(above.report)).budget.matchesPreparedRecordCount(BigInteger.valueOf(50_001)))
            val stages = mutableListOf<ChannelReportCsvPreparationStage>()
            val artifacts = AtomicInteger()
            val observed = JdbcStoreCoreCreatedOrderReportRepository(
                source,
                Sha256ReportPeriodHasher(),
                ChannelReportCsvPreparationObserver(stages::add),
                PreparedChannelReportCsvFactory { bytes ->
                    artifacts.incrementAndGet()
                    PreparedChannelReportCsv.create(bytes)
                },
            )
            val aboveRequest = ChannelReportCsvPreparationRequest.create(from, to, above.report.period.token)!!

            assertIs<ChannelReportCsvPreparationResult.TooLarge>(observed.prepare(aboveRequest))
            assertTrue(stages.contains(ChannelReportCsvPreparationStage.METRIC_PROJECTION))
            assertFalse(stages.contains(ChannelReportCsvPreparationStage.DETAIL_COLLECTION))
            assertEquals(0, artifacts.get())
        }
    }

    private fun expectedRecords(plan: ChannelReportCsvPlan): Int =
        (0..50_001).single { plan.budget.matchesPreparedRecordCount(BigInteger.valueOf(it.toLong())) }

    private fun insertVariants(jdbc: JdbcTemplate, lowStockCount: Int, currentStockOnlyCount: Int) {
        val total = lowStockCount + currentStockOnlyCount
        if (total == 0) return
        jdbc.update(
            """WITH created AS (
                   INSERT INTO products(name,slug,base_price,status)
                   SELECT 'Limit Tool ' || g, 'limit-tool-' || txid_current() || '-' || g, 1, 'ACTIVE'
                   FROM generate_series(1, ?) g
                   RETURNING id,slug
               ), variants AS (
                   INSERT INTO product_variants(product_id,sku,label)
                   SELECT id,'LIMIT-' || id,slug FROM created RETURNING id
               ), numbered AS (
                   SELECT id,row_number() OVER (ORDER BY id) position FROM variants
               )
               INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock)
               SELECT id,CASE WHEN position <= ? THEN 0 ELSE 10 END,0,0 FROM numbered""",
            total,
            lowStockCount,
        )
    }
}
