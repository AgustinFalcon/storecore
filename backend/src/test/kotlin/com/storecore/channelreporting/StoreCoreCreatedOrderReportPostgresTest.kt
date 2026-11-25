package com.storecore.channelreporting

import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.domain.ReportEvidence
import com.storecore.channelreporting.domain.ReportValue
import com.storecore.channelreporting.infrastructure.JdbcStoreCoreCreatedOrderReportRepository
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.assertIs

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = ["storecore.installation-guard.enabled=false"])
class StoreCoreCreatedOrderReportPostgresTest(
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val source: DataSource,
) {
    private val repository = JdbcStoreCoreCreatedOrderReportRepository(source, Sha256ReportPeriodHasher())

    @BeforeEach fun configureMerchant() {
        jdbc.update("""INSERT INTO installation_settings(installation_id,business_name,allowed_host,timezone)
            VALUES (1,'Reporting Test','localhost','America/Argentina/Buenos_Aires')
            ON CONFLICT (installation_id) DO UPDATE SET timezone=EXCLUDED.timezone""")
    }

    @Test fun `created order cohort is nominal and uses exact exclusive merchant boundaries`() {
        order("2026-11-01T03:00:00Z", "100.00")
        order("2026-11-30T23:59:59Z", "60.50")
        order("2026-12-01T03:00:00Z", "999.00")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2026-11-01", "2026-12-01"))
        val available = assertIs<ReportValue.Available<*>>(found.report.createdOrders)
        assertEquals("2", found.report.createdOrdersValue()!!.count.wire)
        assertEquals("160.50", found.report.createdOrdersValue()!!.nominalTotal.wire)
        assertEquals(Instant.parse("2026-11-01T03:00:00Z"), found.report.period.fromInclusive)
        assertEquals(Instant.parse("2026-12-01T03:00:00Z"), found.report.period.toExclusive)
        assertEquals(found.report.period.token, (available.evidence as ReportEvidence.Period).period.token)
    }

    @Test fun `empty authoritative cohort is available zero while invalid period and timezone fail closed`() {
        val empty = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2025-01-01", "2025-01-02"))
        assertEquals("0", empty.report.createdOrdersValue()!!.count.wire)
        assertEquals("0.00", empty.report.createdOrdersValue()!!.nominalTotal.wire)
        assertIs<StoreCoreCreatedOrderReadResult.InvalidPeriod>(repository.read("2025-01-01", "2025-01-01"))
        jdbc.update("UPDATE installation_settings SET timezone='+03:00' WHERE installation_id=1")
        assertIs<StoreCoreCreatedOrderReadResult.TimezoneUnavailable>(repository.read("2025-01-01", "2025-01-02"))
    }

    @Test fun `report owns a repeatable read read only snapshot even inside a weaker transaction`() {
        val outer = TransactionTemplate(DataSourceTransactionManager(source)).apply {
            isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
            isReadOnly = false
        }

        val result = outer.execute {
            repository.read("2025-01-01", "2025-01-02")
        }

        assertIs<StoreCoreCreatedOrderReadResult.Found>(result)
    }

    private fun order(createdAt: String, total: String) {
        val customer = jdbc.queryForObject(
            "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Report','Buyer') RETURNING id",
            Long::class.java,
            "report-${UUID.randomUUID()}@example.com",
            "\$argon2id\$v=19\$m=65536,t=3,p=1\$fixture\$fixture",
        )!!
        val key = UUID.randomUUID(); val hash = UUID.randomUUID().toString().replace("-", "").padEnd(64, '0')
        val claim = jdbc.queryForObject(
            "INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id",
            Long::class.java, customer, key, hash,
        )!!
        jdbc.update(
            """INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,
                buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,created_at,updated_at)
                VALUES (?,?,?,?,?,'CREATED','{}','{}',?::numeric,0,?::numeric,?::timestamptz,?::timestamptz)""",
            "RP-${UUID.randomUUID()}", claim, key, hash, customer, total, total, createdAt, createdAt,
        )
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
