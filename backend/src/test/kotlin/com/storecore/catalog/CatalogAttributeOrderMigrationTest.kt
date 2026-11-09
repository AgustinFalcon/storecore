package com.storecore.catalog

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer

class CatalogAttributeOrderMigrationTest {
    @Test fun `V11 forward upgrade backfills stable order and preserves published history`() {
        val postgres=PostgreSQLContainer<Nothing>("postgres:16-alpine")
        try {
            postgres.start()
            fun flyway(target:String?=null)=Flyway.configure().dataSource(postgres.jdbcUrl,postgres.username,postgres.password).locations("classpath:db/migration").apply { if(target!=null) target(target) }.load()
            flyway("11").migrate()
            val jdbc=JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl,postgres.username,postgres.password))
            val before=jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank")
            jdbc.update("INSERT INTO products(name,slug,base_price,status) VALUES ('Legacy','legacy',100,'ACTIVE')")
            jdbc.update("INSERT INTO product_variants(product_id,sku,label,attributes) SELECT id,'legacy','Legacy','{\"zz\":1,\"a\":2,\"middle\":3}'::jsonb FROM products WHERE slug='legacy'")
            val result=flyway().migrate();assertEquals("15",result.targetSchemaVersion.toString())
            assertEquals(before,jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE success AND version::int<=11 ORDER BY installed_rank"))
            assertEquals("a,middle,zz",jdbc.queryForObject("SELECT array_to_string(attribute_order,',') FROM product_variants WHERE sku='legacy'",String::class.java))
            flyway().validate();assertEquals(0,flyway().migrate().migrationsExecuted)
        } finally { postgres.stop() }
    }
}
