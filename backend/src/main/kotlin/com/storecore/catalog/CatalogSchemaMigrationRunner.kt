package com.storecore.catalog

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.output.MigrateResult

/** Offline database migration entry point. It never starts Spring or an HTTP listener. */
object CatalogSchemaMigrationRunner {
    @JvmStatic
    fun main(args: Array<String>) {
        require(args.isEmpty()) { "Catalog migration does not accept arguments" }
        val result = migrate(
            requiredEnvironment("STORECORE_DB_URL"),
            requiredEnvironment("STORECORE_DB_USERNAME"),
            requiredEnvironment("STORECORE_DB_PASSWORD"),
        )
        println("StoreCore catalog migration completed at version ${result.targetSchemaVersion}")
    }

    internal fun migrate(url: String, username: String, password: String): MigrateResult {
        require(url.startsWith("jdbc:postgresql://")) { "STORECORE_DB_URL must be a PostgreSQL JDBC URL" }
        return Flyway.configure()
            .dataSource(url, username, password)
            .locations("classpath:db/migration")
            .load()
            .migrate()
    }

    private fun requiredEnvironment(name: String): String =
        requireNotNull(System.getenv(name)?.takeIf(String::isNotBlank)) { "$name is required" }
}
