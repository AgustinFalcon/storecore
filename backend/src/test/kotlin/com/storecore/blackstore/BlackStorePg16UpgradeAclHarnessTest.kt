package com.storecore.blackstore

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.postgresql.util.PSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID

/**
 * POSC-001 evidence for the immutable V1-V7 database baseline.
 * The measured ACL is reported as current behavior, never as least-privilege approval.
 */
class BlackStorePg16UpgradeAclHarnessTest {
    @Test
    fun cleanAndPopulatedStagedUpgradeHaveEquivalentHistoryAndCatalog() {
        val clean = createDatabase()
        val upgraded = createDatabase()
        val stageSnapshots = linkedMapOf<String, List<String>>()

        migrateTo(clean, "7")
        migrateTo(upgraded, "1")
        seedV1(upgraded)
        stageSnapshots["V1 catalog"] = snapshotV1Catalog(upgraded)
        val v1Inventory = snapshotV1Inventory(upgraded)
        migrateTo(upgraded, "2")
        seedIdentities(upgraded)
        stageSnapshots["V2 identities"] = snapshotV2Identities(upgraded)
        migrateTo(upgraded, "3")
        migrateTo(upgraded, "4")
        seedOrderAndPayment(upgraded)
        stageSnapshots["V4 commerce"] = snapshotV4Commerce(upgraded)
        assertEquals(v1Inventory, snapshotV1Inventory(upgraded), "V2-V4 preserve the V1 reservation and ledger before new channel activity")
        migrateTo(upgraded, "5")
        seedCompanion(upgraded)
        stageSnapshots["V5 companion"] = snapshotV5Companion(upgraded)
        migrateTo(upgraded, "6")
        assertEquals(v1Inventory, snapshotV1Inventory(upgraded), "V1 inventory preserved through V6 before BlackStore activity")
        seedSagaRows(upgraded)
        assertExternalFixtureConsistency(upgraded)
        stageSnapshots["V6 inventory and saga"] = snapshotV6InventoryAndSaga(upgraded)
        migrateTo(upgraded, "7")

        assertEquals(history(clean), history(upgraded), "version/script/checksum/success")
        assertEquals(catalog(clean), catalog(upgraded), "normalized public catalog")
        assertEquals(stageSnapshots.getValue("V1 catalog"), snapshotV1Catalog(upgraded), "V1 catalog rows preserved through V7")
        assertEquals(stageSnapshots.getValue("V2 identities"), snapshotV2Identities(upgraded), "V2 identities preserved through V7")
        assertEquals(stageSnapshots.getValue("V4 commerce"), snapshotV4Commerce(upgraded), "V4 claim/order/items/payment preserved through V7")
        assertEquals(stageSnapshots.getValue("V5 companion"), snapshotV5Companion(upgraded), "V5 companion/credential preserved through V7")
        assertEquals(stageSnapshots.getValue("V6 inventory and saga"), snapshotV6InventoryAndSaga(upgraded), "V6 inventory/saga/tombstone preserved through V7")
        assertEquals(
            "DISABLED",
            jdbc(upgraded).queryForObject(
                "SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'",
                String::class.java,
            ),
        )
    }

    @Test
    fun bcryptV1IdentityFailsTheV2PrecheckWithoutLosingV1Data() {
        val database = createDatabase()
        migrateTo(database, "1")
        val jdbc = jdbc(database)
        val dollar = 36.toChar().toString()
        val bcryptHash = dollar + "2b" + dollar + "12" + dollar + "fixture-valid-for-v1-prefix-check"
        jdbc.update(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)",
            "legacy-posc001@example.test",
            bcryptHash,
            "Legacy",
            "Fixture",
        )

        val failure = assertThrows(RuntimeException::class.java) { migrateTo(database, "2") }
        assertTrue(
            generateSequence(failure as Throwable?) { it.cause }.any {
                it.message?.contains("IDENTITY_LEGACY_BCRYPT_PRECHECK_FAILED") == true
            },
            "Expected the explicit V2 precheck failure; got: " + failure.message,
        )
        assertEquals(
            bcryptHash,
            jdbc.queryForObject(
                "SELECT password_hash FROM users WHERE email='legacy-posc001@example.test'",
                String::class.java,
            ),
        )
        assertEquals(
            listOf("1"),
            jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE success=true ORDER BY installed_rank",
                String::class.java,
            ),
        )
        assertEquals(
            0,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version='2' AND success=true",
                Int::class.java,
            ),
        )
    }

    @Test
    fun runtimeAclUsesARealNonOwnerLoginAndRecordsCurrentBaselineGaps() {
        val database = createDatabase()
        migrateTo(database, "7")
        val suffix = UUID.randomUUID().toString().replace("-", "")
        val login = "posc001_runtime_$suffix"
        val password = UUID.randomUUID().toString()

        adminConnection().use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("CREATE ROLE " + quoteIdentifier(login) + " LOGIN PASSWORD '" + password + "'")
                statement.execute("GRANT storecore_runtime TO " + quoteIdentifier(login))
            }
        }

        val url = databaseUrl(database)
        DriverManager.getConnection(url, login, password).use { connection ->
            val runtime = JdbcTemplate(DriverManagerDataSource(url, login, password))
            assertEquals(login, runtime.queryForObject("SELECT current_user", String::class.java))
            assertEquals(login, runtime.queryForObject("SELECT session_user", String::class.java))
            assertEquals(
                false,
                runtime.queryForObject("SELECT rolsuper FROM pg_roles WHERE rolname=current_user", Boolean::class.java),
                "runtime login must not be a superuser",
            )
            assertEquals(
                false,
                runtime.queryForObject(
                    "SELECT pg_get_userbyid(datdba)=current_user FROM pg_database WHERE datname=current_database()",
                    Boolean::class.java,
                ),
                "runtime login must not own the database",
            )
            assertEquals(
                false,
                runtime.queryForObject(
                    "SELECT pg_get_userbyid(relowner)=current_user FROM pg_class WHERE oid='public.blackstore_companions'::regclass",
                    Boolean::class.java,
                ),
                "runtime login must not own the measured table",
            )
            assertEquals(
                true,
                runtime.queryForObject("SELECT pg_has_role(current_user,'storecore_runtime','USAGE')", Boolean::class.java),
            )

            tablePrivilege(runtime, "blackstore_companions", "SELECT", true)
            tablePrivilege(runtime, "blackstore_companions", "INSERT", true)
            tablePrivilege(runtime, "blackstore_companions", "UPDATE", true)
            tablePrivilege(runtime, "blackstore_integration_operations", "DELETE", true)
            tablePrivilege(runtime, "module_configurations", "SELECT", true)
            tablePrivilege(runtime, "module_configurations", "UPDATE", false)
            tablePrivilege(runtime, "users", "SELECT", false)
            tablePrivilege(runtime, "audit_events", "INSERT", false)
            assertEquals(
                true,
                runtime.queryForObject(
                    "SELECT has_sequence_privilege(current_user,'blackstore_companions_id_seq','USAGE')",
                    Boolean::class.java,
                ),
            )

            val publicExecutables = runtime.queryForObject(
                """
                SELECT COUNT(*)
                  FROM pg_proc p
                  JOIN pg_namespace n ON n.oid=p.pronamespace
                  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
                 WHERE n.nspname='public' AND p.proname LIKE 'capability_admin_%'
                   AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
                """.trimIndent(),
                Int::class.java,
            )
            assertEquals(4, publicExecutables)
            assertEquals(
                true,
                runtime.queryForObject(
                    "SELECT has_function_privilege(current_user,'capability_admin_create_kill_switch(bigint,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,uuid)','EXECUTE')",
                    Boolean::class.java,
                ),
            )

            assertSqlState42501(connection) {
                it.createStatement().use { statement ->
                    statement.executeUpdate(
                        "UPDATE module_configurations SET state='ACTIVE' WHERE module_code='BLACKSTORE_INTEGRATION'",
                    )
                }
            }
            assertSqlState42501(connection) {
                it.createStatement().use { statement ->
                    statement.executeUpdate(
                        "INSERT INTO audit_events(actor_type,event_type,aggregate_type,payload_redacted) VALUES ('SYSTEM','TEST','ACL','{}'::jsonb)",
                    )
                }
            }
            assertEquals(
                0,
                runtime.queryForObject(
                    "SELECT COUNT(*) FROM pg_roles WHERE rolname IN ('storecore_blackstore_worker','storecore_expiry_worker')",
                    Int::class.java,
                ),
            )
            println(
                "POSC-001 ACL baseline: a non-owner login inherits storecore_runtime; BlackStore registry/saga DML is granted; " +
                    "configuration UPDATE and audit INSERT are denied; PUBLIC can execute four capability_admin routines; " +
                    "no dedicated expiry worker role exists. Measured grants are not least-privilege approval.",
            )
        }
    }

    private fun seedV1(database: String) {
        val jdbc = jdbc(database)
        val brand = jdbc.queryForObject(
            "INSERT INTO brands(name,slug) VALUES ('POSC001 fixture brand','posc001-fixture-brand') RETURNING id",
            Long::class.java,
        )!!
        val category = jdbc.queryForObject(
            "INSERT INTO categories(name,slug) VALUES ('POSC001 fixture category','posc001-fixture-category') RETURNING id",
            Long::class.java,
        )!!
        val product = jdbc.queryForObject(
            "INSERT INTO products(brand_id,category_id,name,slug,base_price,status) VALUES (?,?,?,'posc001-fixture-product',125.50,'ACTIVE') RETURNING id",
            Long::class.java,
            brand,
            category,
            "POSC001 fixture product",
        )!!
        val variant = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,'Default') RETURNING id",
            Long::class.java,
            product,
            "POSC001-SKU",
        )!!
        jdbc.update(
            "INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) VALUES (?,20,0,1)",
            variant,
        )
        val reservation = jdbc.queryForObject(
            "INSERT INTO inventory_reservations(variant_id,reservation_saga_key,reservation_line_key,quantity,status,expires_at) VALUES (?,?,?,2,'ACTIVE',now()+interval '1 day') RETURNING id",
            Long::class.java,
            variant,
            UUID.fromString("10000000-0000-0000-0000-000000000001"),
            UUID.fromString("10000000-0000-0000-0000-000000000002"),
        )!!
        jdbc.update(
            "UPDATE inventory_balances SET available_quantity=available_quantity-2,reserved_quantity=reserved_quantity+2 WHERE variant_id=?",
            variant,
        )
        jdbc.update(
            "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'RESERVATION','WEB',-2,'posc001-upgrade-fixture')",
            variant,
            reservation,
            UUID.fromString("10000000-0000-0000-0000-000000000003"),
        )
    }

    private fun seedIdentities(database: String) {
        val jdbc = jdbc(database)
        val dollar = 36.toChar().toString()
        val argon = dollar + "argon2id" + dollar + "v=19" + dollar + "m=65536,t=3,p=1" + dollar + "fixture-salt" + dollar + "fixture-hash"
        jdbc.update(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)",
            "posc001-user@example.test",
            argon,
            "POSC001",
            "User",
        )
        jdbc.update(
            "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,?,?)",
            "posc001-customer@example.test",
            argon,
            "POSC001",
            "Customer",
        )
    }

    private fun seedOrderAndPayment(database: String) {
        val jdbc = jdbc(database)
        val customer = jdbc.queryForObject(
            "SELECT id FROM customers WHERE email='posc001-customer@example.test'",
            Long::class.java,
        )!!
        val checkoutKey = UUID.fromString("20000000-0000-0000-0000-000000000001")
        val requestHash = "a".repeat(64)
        val claim = jdbc.queryForObject(
            "INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot,state) VALUES (?,?,?,'{}'::jsonb,'COMPLETED') RETURNING id",
            Long::class.java,
            customer,
            checkoutKey,
            requestHash,
        )!!
        val order = jdbc.queryForObject(
            "INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,currency) VALUES (?,?,?,?,?,'PAID','{}'::jsonb,'{}'::jsonb,125.50,0,125.50,'ARS') RETURNING id",
            Long::class.java,
            "POSC001-ORDER-1",
            claim,
            checkoutKey,
            requestHash,
            customer,
        )!!
        val variant = jdbc.queryForObject(
            "SELECT id FROM product_variants WHERE sku='POSC001-SKU'",
            Long::class.java,
        )!!
        jdbc.update(
            "INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,discount_amount,effective_unit_price,subtotal) VALUES (?,?,'{}'::jsonb,1,125.50,0,125.50,125.50)",
            order,
            variant,
        )
        jdbc.update(
            "INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,'APPROVED',125.50,'ARS')",
            order,
            "posc001-payment-reference",
        )
    }

    private fun seedCompanion(database: String) {
        val jdbc = jdbc(database)
        val companion = jdbc.queryForObject(
            "INSERT INTO blackstore_companions(client_instance_id,status) VALUES (?,'DISABLED') RETURNING id",
            Long::class.java,
            UUID.fromString("30000000-0000-0000-0000-000000000001"),
        )!!
        jdbc.update(
            "INSERT INTO blackstore_companion_credentials(companion_id,credential_secret_ref,credential_version,status) VALUES (?, ?,1,'ACTIVE')",
            companion,
            "test-only:not-resolvable",
        )
    }

    private fun seedSagaRows(database: String) {
        val jdbc = jdbc(database)
        val client = UUID.fromString("30000000-0000-0000-0000-000000000001")
        jdbc.update(
            "INSERT INTO blackstore_integration_operations(client_instance_id,device_id,sale_id,operation_id,state,request_hash) VALUES (?, 'device-1','posc001-pending',?,'PENDING',?)",
            client,
            UUID.fromString("40000000-0000-0000-0000-000000000001"),
            "b".repeat(64),
        )
        seedExternalOperation(
            database,
            saleId = "posc001-reserved",
            operationId = UUID.fromString("40000000-0000-0000-0000-000000000002"),
            reservationRef = UUID.fromString("50000000-0000-0000-0000-000000000002"),
            requestHash = "c".repeat(64),
            quantity = 3,
            committed = false,
        )
        seedExternalOperation(
            database,
            saleId = "posc001-committed",
            operationId = UUID.fromString("40000000-0000-0000-0000-000000000003"),
            reservationRef = UUID.fromString("50000000-0000-0000-0000-000000000003"),
            requestHash = "d".repeat(64),
            quantity = 4,
            committed = true,
        )
        val retiredOperation = seedExternalOperation(
            database,
            saleId = "posc001-tombstoned",
            operationId = UUID.fromString("40000000-0000-0000-0000-000000000004"),
            reservationRef = UUID.fromString("50000000-0000-0000-0000-000000000004"),
            requestHash = "e".repeat(64),
            quantity = 1,
            committed = true,
        )
        jdbc.update(
            """
            INSERT INTO blackstore_integration_operation_tombstones(
              client_instance_id,device_id,sale_id,operation_id,request_hash,final_state,receipt,reservation_ref,retired_at,retention_until
            )
            SELECT client_instance_id,device_id,sale_id,operation_id,request_hash,'COMMITTED',receipt,reservation_ref,now(),now()+interval '7 years'
              FROM blackstore_integration_operations WHERE id=?
            """.trimIndent(),
            retiredOperation,
        )
        jdbc.update("DELETE FROM blackstore_integration_reservation_lines WHERE operation_pk=?", retiredOperation)
        jdbc.update("DELETE FROM blackstore_integration_operations WHERE id=?", retiredOperation)
    }

    private fun seedExternalOperation(
        database: String,
        saleId: String,
        operationId: UUID,
        reservationRef: UUID,
        requestHash: String,
        quantity: Int,
        committed: Boolean,
    ): Long {
        val jdbc = jdbc(database)
        val client = UUID.fromString("30000000-0000-0000-0000-000000000001")
        val variant = jdbc.queryForObject(
            "SELECT v.id FROM product_variants v WHERE v.sku='POSC001-SKU'",
            Long::class.java,
        )!!
        val product = jdbc.queryForObject(
            "SELECT product_id FROM product_variants WHERE id=?",
            Long::class.java,
            variant,
        )!!
        val state = if (committed) "COMMITTED" else "RESERVED"
        val receipt = "receipt-$saleId"
        val operationPk = jdbc.queryForObject(
            """
            INSERT INTO blackstore_integration_operations(
              client_instance_id,device_id,sale_id,operation_id,reservation_ref,state,request_hash,receipt,expires_at,result_body
            ) VALUES (?, 'device-1', ?, ?, ?, ?, ?, ?, CASE WHEN ?='RESERVED' THEN now()+interval '10 minutes' ELSE NULL END, NULL)
            RETURNING id
            """.trimIndent(),
            Long::class.java,
            client,
            saleId,
            operationId,
            reservationRef,
            state,
            requestHash,
            receipt,
            state,
        )!!
        val lineKey = UUID.nameUUIDFromBytes(("inventory-reservation-" + saleId).toByteArray())
        val reserveKey = UUID.nameUUIDFromBytes(("ledger-reserve-" + saleId).toByteArray())
        val commitKey = UUID.nameUUIDFromBytes(("ledger-commit-" + saleId).toByteArray())
        val releaseKey = UUID.nameUUIDFromBytes(("ledger-release-" + saleId).toByteArray())
        val reservation = jdbc.queryForObject(
            "INSERT INTO inventory_reservations(variant_id,reservation_saga_key,reservation_line_key,quantity,status,expires_at) VALUES (?,?,?,?,'ACTIVE',now()+interval '1 day') RETURNING id",
            Long::class.java,
            variant,
            reservationRef,
            lineKey,
            quantity,
        )!!
        jdbc.update(
            "UPDATE inventory_balances SET available_quantity=available_quantity-?,reserved_quantity=reserved_quantity+? WHERE variant_id=?",
            quantity,
            quantity,
            variant,
        )
        jdbc.update(
            "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?, ?, ?, 'RESERVATION','EXTERNAL_BLACKSTORE', ?, 'posc001-upgrade-fixture')",
            variant,
            reservation,
            reserveKey,
            -quantity,
        )
        jdbc.update(
            """
            INSERT INTO blackstore_integration_reservation_lines(
              operation_pk,reservation_ref,variant_id,sku,quantity,accepted_price_version,
              inventory_reservation_operation_key,ledger_reserve_operation_key,ledger_commit_operation_key,ledger_release_operation_key
            ) VALUES (?, ?, ?, 'POSC001-SKU', ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            operationPk,
            reservationRef,
            variant,
            quantity,
            "catalog-$product",
            lineKey,
            reserveKey,
            commitKey,
            releaseKey,
        )
        if (committed) {
            jdbc.update(
                "UPDATE inventory_balances SET reserved_quantity=reserved_quantity-? WHERE variant_id=?",
                quantity,
                variant,
            )
            jdbc.update("UPDATE inventory_reservations SET status='CONSUMED' WHERE id=?", reservation)
            jdbc.update(
                "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?, ?, ?, 'STOCK_COMMIT_EXTERNAL','EXTERNAL_BLACKSTORE', ?, 'posc001-upgrade-fixture')",
                variant,
                reservation,
                commitKey,
                -quantity,
            )
        }
        return operationPk
    }

    private fun snapshotV1Catalog(database: String) =
        snapshotRows(database, "V1 catalog") +
            snapshotRows(database, "brands", "SELECT to_jsonb(t)::text FROM brands t WHERE slug='posc001-fixture-brand' ORDER BY id") +
            snapshotRows(database, "categories", "SELECT to_jsonb(t)::text FROM categories t WHERE slug='posc001-fixture-category' ORDER BY id") +
            snapshotRows(database, "products", "SELECT to_jsonb(t)::text FROM products t WHERE slug='posc001-fixture-product' ORDER BY id") +
            snapshotRows(database, "variants", "SELECT to_jsonb(t)::text FROM product_variants t WHERE sku='POSC001-SKU' ORDER BY id")

    private fun snapshotV1Inventory(database: String) =
        snapshotRows(database, "V1 inventory") +
            snapshotRows(database, "balances", "SELECT to_jsonb(b)::text FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku='POSC001-SKU' ORDER BY b.variant_id") +
            snapshotRows(database, "reservations", "SELECT to_jsonb(t)::text FROM inventory_reservations t JOIN product_variants v ON v.id=t.variant_id WHERE v.sku='POSC001-SKU' ORDER BY t.id") +
            snapshotRows(database, "ledger", "SELECT to_jsonb(t)::text FROM inventory_ledger t JOIN product_variants v ON v.id=t.variant_id WHERE v.sku='POSC001-SKU' ORDER BY t.id")

    private fun snapshotV2Identities(database: String) =
        snapshotRows(database, "V2 identities") +
            snapshotRows(database, "users", "SELECT to_jsonb(t)::text FROM users t WHERE email='posc001-user@example.test' ORDER BY id") +
            snapshotRows(database, "customers", "SELECT to_jsonb(t)::text FROM customers t WHERE email='posc001-customer@example.test' ORDER BY id")

    private fun snapshotV4Commerce(database: String) =
        snapshotRows(database, "V4 commerce") +
            snapshotRows(database, "claims", "SELECT to_jsonb(t)::text FROM checkout_idempotency_claims t WHERE checkout_idempotency_key='20000000-0000-0000-0000-000000000001' ORDER BY id") +
            snapshotRows(database, "orders", "SELECT to_jsonb(t)::text FROM orders t WHERE order_number='POSC001-ORDER-1' ORDER BY id") +
            snapshotRows(database, "items", "SELECT to_jsonb(t)::text FROM order_items t JOIN orders o ON o.id=t.order_id WHERE o.order_number='POSC001-ORDER-1' ORDER BY t.id") +
            snapshotRows(database, "payments", "SELECT to_jsonb(t)::text FROM payments t WHERE external_reference='posc001-payment-reference' ORDER BY id")

    private fun snapshotV5Companion(database: String) =
        snapshotRows(database, "V5 companion") +
            snapshotRows(database, "companions", "SELECT to_jsonb(t)::text FROM blackstore_companions t WHERE client_instance_id='30000000-0000-0000-0000-000000000001' ORDER BY id") +
            snapshotRows(database, "credentials", "SELECT to_jsonb(t)::text FROM blackstore_companion_credentials t WHERE credential_secret_ref='test-only:not-resolvable' ORDER BY id")

    private fun snapshotV6InventoryAndSaga(database: String) =
        snapshotV1Inventory(database) +
            snapshotRows(database, "operations", "SELECT to_jsonb(t)::text FROM blackstore_integration_operations t WHERE sale_id LIKE 'posc001-%' ORDER BY id") +
            snapshotRows(database, "reservation lines", "SELECT to_jsonb(l)::text FROM blackstore_integration_reservation_lines l JOIN blackstore_integration_operations o ON o.id=l.operation_pk WHERE o.sale_id LIKE 'posc001-%' ORDER BY l.id") +
            snapshotRows(database, "tombstones", "SELECT to_jsonb(t)::text FROM blackstore_integration_operation_tombstones t WHERE sale_id LIKE 'posc001-%' ORDER BY id")

    private fun snapshotRows(database: String, label: String, sql: String): List<String> =
        jdbc(database).queryForList(sql, String::class.java).map { "$label|$it" }

    private fun snapshotRows(database: String, label: String): List<String> = listOf(label)

    private fun history(database: String): List<String> = jdbc(database).query(
        "SELECT COALESCE(version,'<null>'),script,checksum,success FROM flyway_schema_history ORDER BY installed_rank",
    ) { row, _ ->
        listOf(row.getString(1), row.getString(2), row.getString(3), row.getBoolean(4)).joinToString("|")
    }

    private fun catalog(database: String): Map<String, List<String>> {
        val jdbc = jdbc(database)
        return mapOf(
            "constraints" to jdbc.query(
                "SELECT n.nspname,r.relname,c.conname,c.contype,c.condeferrable,c.condeferred,c.convalidated,pg_get_constraintdef(c.oid,true) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' ORDER BY 1,2,3",
            ) { row, _ -> (1..8).joinToString("|") { row.getString(it) ?: "<null>" } },
            "columns" to jdbc.query(
                "SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,COALESCE(character_maximum_length::text,'<null>'),COALESCE(numeric_precision::text,'<null>'),COALESCE(numeric_scale::text,'<null>'),COALESCE(datetime_precision::text,'<null>'),COALESCE(column_default,'<null>'),is_identity,COALESCE(identity_generation,'<null>'),is_generated,COALESCE(generation_expression,'<null>') FROM information_schema.columns WHERE table_schema='public' ORDER BY table_schema,table_name,ordinal_position",
            ) { row, _ -> (1..16).joinToString("|") { row.getString(it) ?: "<null>" } },
            "functions" to jdbc.query(
                "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),l.lanname,p.provolatile,p.prosecdef,COALESCE(array_to_string(p.proconfig,','),''),p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' ORDER BY 1,2,3",
            ) { row, _ -> (1..9).joinToString("|") { row.getString(it) ?: "<null>" } },
            "indexes" to jdbc.query(
                "SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2,3",
            ) { row, _ -> (1..4).joinToString("|") { row.getString(it) ?: "<null>" } },
            "triggers" to jdbc.query(
                "SELECT n.nspname,r.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2,3",
            ) { row, _ -> (1..5).joinToString("|") { row.getString(it) ?: "<null>" } },
            "table_grants" to jdbc.query(
                "SELECT grantee,table_schema,table_name,privilege_type,is_grantable FROM information_schema.table_privileges WHERE table_schema='public' ORDER BY 1,2,3,4,5",
            ) { row, _ -> (1..5).joinToString("|") { row.getString(it) ?: "<null>" } },
            "sequence_grants" to jdbc.query(
                "SELECT CASE acl.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,n.nspname,c.relname,acl.privilege_type,acl.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('S',c.relowner))) acl WHERE n.nspname='public' AND c.relkind='S' ORDER BY 1,2,3,4,5",
            ) { row, _ -> (1..5).joinToString("|") { row.getString(it) ?: "<null>" } },
            "routine_grants" to jdbc.query(
                "SELECT grantee,routine_schema,routine_name,privilege_type,is_grantable FROM information_schema.routine_privileges WHERE routine_schema='public' ORDER BY 1,2,3,4,5",
            ) { row, _ -> (1..5).joinToString("|") { row.getString(it) ?: "<null>" } },
        )
    }

    private fun tablePrivilege(jdbc: JdbcTemplate, table: String, privilege: String, expected: Boolean) {
        assertEquals(
            expected,
            jdbc.queryForObject(
                "SELECT has_table_privilege(current_user,?,?)",
                Boolean::class.java,
                table,
                privilege,
            ),
            "effective login $privilege on $table",
        )
    }

    private fun assertExternalFixtureConsistency(database: String) {
        val jdbc = jdbc(database)
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations WHERE sale_id='posc001-pending' AND state='PENDING'", Int::class.java))
        assertEquals(
            1,
            jdbc.queryForObject(
                """
                SELECT COUNT(*)
                  FROM blackstore_integration_operations o
                  JOIN blackstore_integration_reservation_lines l ON l.operation_pk=o.id
                  JOIN inventory_reservations r ON r.reservation_saga_key=o.reservation_ref AND r.variant_id=l.variant_id
                  JOIN inventory_ledger led ON led.reservation_id=r.id AND led.event_type='RESERVATION'
                 WHERE o.sale_id='posc001-reserved' AND o.state='RESERVED'
                   AND r.status='ACTIVE' AND led.channel='EXTERNAL_BLACKSTORE' AND led.quantity_delta=-l.quantity
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                """
                SELECT COUNT(*)
                  FROM blackstore_integration_operations o
                  JOIN blackstore_integration_reservation_lines l ON l.operation_pk=o.id
                  JOIN inventory_reservations r ON r.reservation_saga_key=o.reservation_ref AND r.variant_id=l.variant_id
                  JOIN inventory_ledger reserve ON reserve.reservation_id=r.id AND reserve.event_type='RESERVATION'
                  JOIN inventory_ledger commit ON commit.reservation_id=r.id AND commit.event_type='STOCK_COMMIT_EXTERNAL'
                 WHERE o.sale_id='posc001-committed' AND o.state='COMMITTED'
                   AND r.status='CONSUMED'
                   AND reserve.channel='EXTERNAL_BLACKSTORE' AND reserve.quantity_delta=-l.quantity
                   AND commit.channel='EXTERNAL_BLACKSTORE' AND commit.quantity_delta=-l.quantity
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations WHERE sale_id='posc001-tombstoned'", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operation_tombstones WHERE sale_id='posc001-tombstoned' AND final_state='COMMITTED'", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_reservation_lines l JOIN blackstore_integration_operations o ON o.id=l.operation_pk WHERE o.sale_id='posc001-tombstoned'", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_reservations WHERE reservation_saga_key='50000000-0000-0000-0000-000000000004' AND status='CONSUMED'", Int::class.java))
        assertEquals(
            2,
            jdbc.queryForObject(
                """
                SELECT COUNT(*)
                  FROM inventory_ledger l
                  JOIN inventory_reservations r ON r.id=l.reservation_id
                 WHERE r.reservation_saga_key='50000000-0000-0000-0000-000000000004'
                   AND l.channel='EXTERNAL_BLACKSTORE'
                   AND l.event_type IN ('RESERVATION','STOCK_COMMIT_EXTERNAL')
                   AND l.quantity_delta=-1
                """.trimIndent(),
                Int::class.java,
            ),
        )
        assertEquals(
            10,
            jdbc.queryForObject(
                "SELECT available_quantity FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku='POSC001-SKU'",
                Int::class.java,
            ),
        )
        assertEquals(
            5,
            jdbc.queryForObject(
                "SELECT reserved_quantity FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku='POSC001-SKU'",
                Int::class.java,
            ),
        )
    }

    private fun assertSqlState42501(connection: Connection, action: (Connection) -> Unit) {
        val error = assertThrows(PSQLException::class.java) { action(connection) }
        assertEquals("42501", error.sqlState)
    }

    private fun migrateTo(database: String, target: String) {
        Flyway.configure()
            .dataSource(databaseUrl(database), postgres.username, postgres.password)
            .locations("classpath:db/migration")
            .target(MigrationVersion.fromVersion(target))
            .load()
            .migrate()
    }

    private fun createDatabase(): String {
        val name = "posc001_" + UUID.randomUUID().toString().replace("-", "")
        adminConnection().use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE " + quoteIdentifier(name)) }
        }
        return name
    }

    private fun jdbc(database: String) =
        JdbcTemplate(DriverManagerDataSource(databaseUrl(database), postgres.username, postgres.password))

    private fun databaseUrl(database: String) =
        postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + database

    private fun adminConnection(): Connection =
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)

    private fun quoteIdentifier(identifier: String) = "\"" + identifier.replace("\"", "\"\"") + "\""

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic
        @BeforeAll
        fun startPostgres16() = postgres.start()

        @JvmStatic
        @AfterAll
        fun stopPostgres16() = postgres.stop()
    }
}
