package com.storecore.schema

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.postgresql.util.PSQLException
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager

class MpOrdersSchemaTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @BeforeAll
        fun migrate() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .locations("classpath:db/migration").load().migrate()
        }

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    @Test
    fun `orders status allows paid stock review without rewriting v1 tables`() {
        connection().use { connection ->
            assertEquals(1, scalar(connection, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='mp_checkout_attempts'"))
            assertEquals(1, scalar(connection, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='payment_event_inbox'"))
            val check = connection.createStatement().use { statement ->
                statement.executeQuery("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='orders'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%PAID_STOCK_REVIEW%'").use { rs ->
                    check(rs.next()); rs.getString(1)
                }
            }
            assertTrue(check.contains("PAID_STOCK_REVIEW"))
        }
    }

    @Test
    fun `webhook inbox rejects mutation and keeps ids separated`() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate(
                    """INSERT INTO mp_order_notification_inbox(
                         user_id,body_event_id,raw_topic,query_data_id,body_data_id,provider_order_id_candidate,
                         x_request_id,signature_version,signature_result,application_id,envelope_redacted,disposition
                       ) VALUES ('1','evt','order','ORD1','ORD1','ORD1','req','v1','ACCEPTED','app','{}','PROCESSABLE')""",
                )
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("UPDATE mp_order_notification_inbox SET raw_topic='orders_v2' WHERE query_data_id='ORD1'")
                }
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate(
                        """INSERT INTO mp_order_notification_inbox(
                             user_id,body_event_id,raw_topic,query_data_id,body_data_id,provider_order_id_candidate,
                             x_request_id,signature_version,signature_result,application_id,envelope_redacted,disposition
                           ) VALUES ('1','evt','order','ORD1','ORD1','ORD1','req','v1','ACCEPTED','app','{}','QUARANTINED')""",
                    )
                }
            }
        }
    }

    private fun connection() = DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)
    private fun scalar(connection: java.sql.Connection, sql: String): Int =
        connection.createStatement().use { statement -> statement.executeQuery(sql).use { rs -> check(rs.next()); rs.getInt(1) } }
}
