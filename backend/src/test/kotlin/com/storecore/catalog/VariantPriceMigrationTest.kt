package com.storecore.catalog

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer

class VariantPriceMigrationTest {
    @Test fun `V21 upgrades preserved history with inherited defaults and constrained amounts`() {
        val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        try {
            postgres.start()
            fun flyway(target:String?=null)=Flyway.configure().dataSource(postgres.jdbcUrl,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null) target(target) }.load()
            flyway("20").migrate()
            val jdbc=JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password))
            val history=jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank")
            jdbc.update("INSERT INTO products(name,slug,base_price,status) VALUES ('Legacy','legacy-price',100,'ACTIVE')")
            jdbc.update("INSERT INTO product_variants(product_id,sku,label) SELECT id,'legacy-price','Legacy' FROM products WHERE slug='legacy-price'")
            assertEquals("22",flyway().migrate().targetSchemaVersion.toString())
            assertEquals(history,jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE success AND version::int<=20 ORDER BY installed_rank"))
            assertNull(jdbc.queryForObject("SELECT base_price_override FROM product_variants WHERE sku='legacy-price'",java.math.BigDecimal::class.java))
            jdbc.update("UPDATE product_variants SET base_price_override=0 WHERE sku='legacy-price'")
            for(raw in listOf("-0.01","'NaN'::numeric","1000000000000")) assertThrows(org.springframework.dao.DataAccessException::class.java) { jdbc.update("UPDATE product_variants SET base_price_override=$raw WHERE sku='legacy-price'") }
            flyway().validate()
            assertEquals(0,flyway().migrate().migrationsExecuted)
        } finally { postgres.stop() }
    }
}
