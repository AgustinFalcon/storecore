package com.storecore.commerce

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer

class DeliveryMigrationTest {
    @Test fun `V22 upgrades legacy without invented actor and validates schema two without runtime DML`() {
        val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        try {
            postgres.start()
            fun flyway(target:String?=null)=Flyway.configure().dataSource(postgres.jdbcUrl,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null) target(target) }.load()
            flyway("21").migrate()
            val jdbc=JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password))
            val history=jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank")
            assertEquals("22",flyway().migrate().targetSchemaVersion.toString())
            assertEquals(history,jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success AND version::int<=21 ORDER BY installed_rank"))
            val row=jdbc.queryForMap("SELECT config_schema_version,config_version,config::text,updated_by,state FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'")
            assertEquals(2,(row["config_schema_version"] as Number).toInt())
            assertEquals(2,(row["config_version"] as Number).toInt())
            assertNull(row["updated_by"])
            assertEquals("DISABLED",row["state"])
            assertEquals(true,jdbc.queryForObject("SELECT manual_fulfillment_schema_v2_valid(?::jsonb)",Boolean::class.java,row["config"]))
            for(raw in listOf("{}","null","{\"pickup\":{\"enabled\":false},\"localDelivery\":{\"enabled\":1}}")) assertEquals(false,jdbc.queryForObject("SELECT manual_fulfillment_schema_v2_valid(?::jsonb)",Boolean::class.java,raw))
            assertEquals(false,jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','module_configurations','UPDATE')",Boolean::class.java))
            flyway().validate()
            assertEquals(0,flyway().migrate().migrationsExecuted)
        } finally { postgres.stop() }
    }
}
