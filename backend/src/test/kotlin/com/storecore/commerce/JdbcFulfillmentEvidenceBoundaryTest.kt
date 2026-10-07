package com.storecore.commerce

import com.storecore.commerce.domain.*
import com.storecore.commerce.infrastructure.JdbcFulfillmentEvidence
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import java.math.BigDecimal
import java.sql.ResultSet

/** Mock JDBC boundary evidence for values the production CHECK/unique/FK constraints prohibit. */
class JdbcFulfillmentEvidenceBoundaryTest {
    private val payment = mapOf<String, Any?>(
        "status" to PaymentStatus.APPROVED.name, "same_order" to true, "same_provider" to true,
        "state" to CheckoutAttemptState.ACCREDITED.name, "payment_amount" to BigDecimal.TEN,
        "attempt_amount" to BigDecimal.TEN, "confirmed_amount" to BigDecimal.TEN,
        "payment_currency" to "ARS", "attempt_currency" to "ARS", "confirmed_currency" to "ARS",
    )

    @Test
    fun `jdbc mapper preserves absence multiplicity monetary mismatch and unknown as blocked evidence`() {
        for (rows in listOf(emptyList(), listOf(payment, payment), listOf(payment + ("status" to null)),
            listOf(payment + ("status" to "FUTURE_PROVIDER_STATUS")), listOf(payment + ("same_order" to false)),
            listOf(payment + ("same_provider" to false)), listOf(payment + ("payment_amount" to null)),
            listOf(payment + ("payment_currency" to "USD")), listOf(payment + ("attempt_currency" to "USD")),
            listOf(payment + ("confirmed_currency" to "USD")))) {
            val jdbc = RowsJdbc(rows)
            val snapshot = JdbcFulfillmentEvidence(jdbc).load(12)
            assertEquals(FulfillmentEligibility.PAYMENT_NOT_VERIFIED, FulfillmentPolicy.evaluate(snapshot))
            assertEquals("MP_ORDERS:12", jdbc.saleActor)
        }
    }

    @Test
    fun `jdbc read filters sale by this order and does not accept another orders ledger`() {
        val jdbc = RowsJdbc(listOf(payment))
        assertEquals(FulfillmentEligibility.STOCK_NOT_VERIFIED, FulfillmentPolicy.evaluate(JdbcFulfillmentEvidence(jdbc).load(12)))
        assertEquals("MP_ORDERS:12", jdbc.saleActor)
        assertEquals(FulfillmentEligibility.ELIGIBLE, FulfillmentPolicy.evaluate(JdbcFulfillmentEvidence(jdbc).load(13)))
        assertEquals("MP_ORDERS:13", jdbc.saleActor)
    }

    private class RowsJdbc(private val payments: List<Map<String, Any?>>) : JdbcTemplate() {
        var saleActor: String? = null
        override fun <T : Any?> query(sql: String, rowMapper: RowMapper<T>, vararg args: Any?): List<T> {
            val rows = when {
                sql.startsWith("SELECT status,total,currency") -> listOf(mapOf("status" to OrderStatus.PAID.name, "total" to BigDecimal.TEN, "currency" to "ARS"))
                sql.contains("FROM mp_order_commercial_applications") -> payments
                sql.startsWith("SELECT variant_id,quantity") -> listOf(mapOf("variant_id" to 8L, "quantity" to 1))
                sql.contains("FROM inventory_ledger l") -> {
                    saleActor = args.single().toString()
                    if (saleActor == "MP_ORDERS:13") listOf(mapOf("reservation_id" to 7L, "variant_id" to 8L,
                        "quantity" to 1, "consumed_variant" to 8L, "consumed_quantity" to 1,
                        "status" to ReservationStatus.CONSUMED.name, "sale_count" to 1)) else emptyList()
                }
                else -> error("Unexpected JDBC boundary query: $sql")
            }
            return rows.mapIndexed { index, row ->
                val result = Mockito.mock(ResultSet::class.java) { invocation ->
                    val value = row[invocation.arguments.firstOrNull()]
                    when (invocation.method.name) {
                        "getString" -> value?.toString()
                        "getBigDecimal", "getObject" -> value
                        "getBoolean" -> value ?: false
                        "getLong" -> (value as? Number)?.toLong() ?: 0L
                        "getInt" -> (value as? Number)?.toInt() ?: 0
                        else -> null
                    }
                }
                rowMapper.mapRow(result, index)!!
            }
        }
        @Suppress("UNCHECKED_CAST")
        override fun <T : Any?> queryForObject(sql: String, requiredType: Class<T>, vararg args: Any?): T = false as T
    }
}
