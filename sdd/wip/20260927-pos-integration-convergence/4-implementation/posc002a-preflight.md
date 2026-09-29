# POSC-002A — preflight inventory

**Status:** local implementation and PG16 evidence ready for independent review; POSC-002A is not marked done until the review gate is satisfied. No production source, Flyway script, grant, role, or live system was changed. `BLACKSTORE_INTEGRATION` remains `DISABLED`.

## Snapshot and method

- Worktree branch: `test/posc002a-security-preflight`; tested HEAD `8fc47f9a73939ea5d192f4aa650c1a6b53816036`.
- Local `origin/integration/storecore-int` ref: `9ce355bdb5acd0d097c765c08c4ec561841db757`; it is the merge base of this worktree. No fetch or remote CI claim is made.
- POSC-001 already exercises a clean install and a staged populated V1→V7 upgrade in PostgreSQL 16.14. The new preflight test adds catalog/role/function observations on an isolated clean PG16 database and pins V3–V7 source SHA-256. All test data and role credentials are generated in the ephemeral Testcontainers instance; no live endpoint or repository secret is used.
- Evidence is based on current checked-in SQL/Kotlin and PostgreSQL catalogs. This is an inventory of current grants, not approval of them as least privilege.

## Flyway V3–V7 inventory

The PG16 clean install records these Flyway checksums (`flyway_schema_history.checksum`, signed integer), with `success=true`. Source fingerprints are SHA-256 over UTF-8 text after normalizing CRLF and bare CR line endings to LF. This makes the checked-in migration fingerprint identical on Windows and Linux without editing V1–V7 or changing `.gitattributes`; a focused fixture asserts CRLF/LF equivalence.

| Version | Script | Flyway checksum | Source SHA-256 |
|---|---|---:|---|
| V3 | `V3__capability_administration.sql` | `-1883124546` | `0D2CEBE1FBA3D43C1C33E2EA216B5D931EA57D510B967D7C471BBB8B87A65DC8` |
| V4 | `V4__mp_orders_checkout.sql` | `-556678943` | `EB677AE41202961AA1527B4AD0539A344A2620E75079241AEE9BA356209A4C5F` |
| V5 | `V5__blackstore_integration_registry.sql` | `-441820488` | `B27C38CCDB6BAAAAB689197A948C96567BB20CC8BFE7E363DD51FF3ADE34220A` |
| V6 | `V6__blackstore_integration_saga.sql` | `-641148092` | `BC06A1F0C1CDB51A6737E972C2FDC0777C9206F624EF73D70C2F0B8CADD9EB6D` |
| V7 | `V7__blackstore_future_optional_promotion.sql` | `-105378108` | `6444ADB440C4B7DC8536F4BA9856AC9C041742CA67EFB91C03EC6409B5398A0C` |

The inspected history ends at V7, and there is no V8 script in this checkout. V8 is therefore only the current candidate; it must be revalidated against the shared ML/POS integration head and `flyway_schema_history` immediately before any DDL. V1–V7 remain immutable. The shared capability change must have one owner/migration/signature set referenced by both POSC-002 and ML-DSP-000B; ML `REPEATABLE READ` retains its separate NO-GO.

## Capability HTTP and caller map

The Spring mapping test inventories every bean mapping under `/api/v1/user/capabilities` by HTTP verb and path before checking owners; it does not pre-filter on controller class or method name. Parameter/header conditions remain attached to each mapping record, so two mappings with the same verb/path fail as duplicates. The exact topology is the four mutating `CapabilityController` routes plus its read-only GET list. A synthetic negative fixture proves that a header-conditioned duplicate and an extra route produce failures.

| Spring route | Controller caller | JDBC capability caller | Existing SQL entry point |
|---|---|---|---|
| `POST /api/v1/user/capabilities/{module}/state` | `changeState` | `JdbcCapabilityService.changeState` | `capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR)` |
| `POST /api/v1/user/capabilities/{module}/kills` | `createKill` | `JdbcCapabilityService.createKill` | `capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)` |
| `POST /api/v1/user/capabilities/{module}/kills/{id}/remove` | `removeKill` | `JdbcCapabilityService.removeKill` | `capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID)` |
| `POST /api/v1/user/capabilities/{module}/kills/{id}/replace` | `replaceKill` | `JdbcCapabilityService.replaceKill` | `capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)` |

Observed implementation details: all four methods call those exact functions through the single `JdbcTemplate` injected into `JdbcCapabilityService`, with ordinary `@Transactional`; no separate capability-admin datasource/pool is present in this code path. `changeState` currently substitutes `UUID.randomUUID()` when the request correlation is absent. The other three request DTOs carry a non-null `UUID`. POSC-002B owns replacing this adapter path atomically with the durable Tx-S→Tx-C protocol and mandatory client correlation; do not revoke V3 in a separate deploy.

## PostgreSQL 16 security inventory

PG16.14 catalog inspection after V1–V7 found the four V3 functions below. Each is `SECURITY DEFINER`, owned by `storecore_migrator` (which is currently `NOLOGIN`), configured with `search_path=pg_catalog, public`, and has `EXECUTE` for both `storecore_runtime` and `PUBLIC`. Runtime's effective execute privilege was true for all four. The path still includes writable `public`, so this is an observed hardening gap, not an approved safe path.

| Function | Owner | SECURITY DEFINER | `proconfig` | Runtime EXECUTE | PUBLIC EXECUTE |
|---|---|---|---|---:|---:|
| `capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR)` | `storecore_migrator` | yes | `search_path=pg_catalog, public` | yes | yes |
| `capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)` | `storecore_migrator` | yes | `search_path=pg_catalog, public` | yes | yes |
| `capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID)` | `storecore_migrator` | yes | `search_path=pg_catalog, public` | yes | yes |
| `capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)` | `storecore_migrator` | yes | `search_path=pg_catalog, public` | yes | yes |

The catalog ACL for each has owner execute, runtime execute, and `PUBLIC` execute. The only application roles currently created by V1–V7 are `storecore_migrator` and `storecore_runtime`; both are `NOLOGIN` and `NOSUPERUSER`. There is no capability-admin login/role or companion-admin role in this baseline. The PG16 inventory found no memberships involving `storecore_%` roles and no matching `public` or application-role rows in `pg_default_acl`. These observations must be repeated on the actual shared integration DB before migration; role membership/default privileges can exist outside the checked-in migrations.

`JdbcCapabilityService.decide` is `REPEATABLE_READ` and currently reads/locks kill-switch → configuration → action. `BlackStoreIntegrationService` invokes it for the two BlackStore capability checks. POSC-002B may establish the shared action→config→switch administration order, but this preflight does not approve ML's RR snapshot behavior or change the service.

## Operation manifest to carry into the shared cut

This is a required-operation baseline, not a grant change. Existing non-POS WEB/ML/core permissions must be measured and preserved unless separately proven safe to change.

| Object / role | Current observation | Required operation / boundary for the later ACL test |
|---|---|---|
| V3 capability functions / `PUBLIC` | Effective `EXECUTE` on all four generic admin functions | Revoke the four exact V3 signatures from `PUBLIC` and any effective inherited caller as part of the same cutover that replaces all four HTTP callers; no generic admin fallback |
| V3 capability functions / `storecore_runtime` | Effective `EXECUTE` on all four | Runtime must have no capability-admin execute path after the atomic replacement |
| Functions / `storecore_migrator` | Owns all four; `NOLOGIN`; V3/V5/V6 give it broad table/sequence DDL grants | Keep migration ownership separate; later admin/guard owners must be narrowly scoped `NOLOGIN` roles, not runtime or the migration login |
| Companion registry / runtime | V5 grants `SELECT,INSERT,UPDATE,DELETE` on both registry tables and `USAGE,SELECT` on all public sequences | Replace broad registry DML with measured column/object grants; no runtime registry insert/update/delete; test inherited grants and named-sequence needs |
| Saga, reservation lines, tombstones, cursor / runtime | V6 grants `SELECT,INSERT,UPDATE,DELETE` across all four objects and all public sequences | Preserve current PENDING cleanup until POSC-004A supplies a worker replacement; cursor UPSERT only updates `catalog_version,expires_at`; tombstones remain append-only |
| `inventory_balances` / runtime | `has_column_privilege(..., 'variant_id', 'INSERT') = false` in the V1–V7 PG16 baseline | `JdbcInventoryService.lockBalance` always runs `INSERT INTO inventory_balances(variant_id) ... ON CONFLICT (variant_id) DO NOTHING` before `SELECT ... FOR UPDATE` in both `adjust` and `setAvailableQuantity`, including when the balance already exists. Later grants/tests must retain `INSERT(variant_id)` only, plus measured SELECT and UPDATE of `available_quantity,reserved_quantity,updated_at`; deny INSERT of quantities/safety stock/timestamps. This preflight surfaces an existing runtime permission gap rather than changing it. |
| Capability admin / role | No separate capability-admin role or datasource is present | POSC-002B must establish the reviewed admin identity/pool path; do not grant current runtime login a replacement broad routine |
| Runtime/admin/migrator memberships and default privileges | No app-role memberships or selected default ACL entries in the clean PG16 inventory | Repeat on real integration DB; test login inheritance, PUBLIC, owners, `pg_default_acl`, and negative SQL privileges explicitly |

## Spring/OpenAPI contract identity

The user-facing capability mutation routes are the four above. The POS contract remains the separate, pinned seven-operation API plus its served document:

- Canonical OpenAPI SHA-256: `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`.
- Existing `BlackStoreOpenApiBaselineContractTest` compares canonical bytes with the packaged served resource and `backend/src/test/resources/openapi/blackstore-pin.json`; the pin value is the same digest. Existing route topology verifies the seven business paths plus `GET /blackstore-integration/v1/openapi.yaml` without duplicate Spring owners. The 002A Spring inventory independently checks the four capability mutation handlers.

## Rollback and abort rule

No SQL was applied by this cut. Flyway has no automatic undo for these PostgreSQL versioned SQL migrations. Before a later shared migration, capture and verify a restorable backup/snapshot and the preflight catalog/data/grant manifest; deploy during a controlled maintenance window with callers held closed. A migration that fails before commit must roll back transactionally and must not be hidden with `repair`. Before accepting the new application path, abort by restoring the pre-change snapshot in the maintenance window if the migration is incompatible. After a migration is committed/accepted, use a reviewed forward corrective migration or a coordinated restore; never edit V1–V7 or pretend the migration was reversed. Preserve the capability as `DISABLED` throughout.

## Validation and remaining gate

Run from `backend/`:

```text
mvn -q -Dtest=BlackStorePg16UpgradeAclHarnessTest,BlackStoreRouteTopologyHarnessTest,BlackStoreOpenApiBaselineContractTest test
mvn -q test
```

Local results on HEAD `8fc47f9`: focused suites 15 tests, 0 failures/errors/skips; full backend suite 32 suites/146 tests, 0 failures/errors/skips. The PG16 harness includes clean and staged populated V1–V7 migration, portable LF-normalized source fingerprinting (including a CRLF/LF equivalence fixture), catalog checks, role/function ACL inventory, and the existing non-owner runtime ACL probe. Spring inventories all beans within the capability route family and fails on duplicate or unexpected verb/path mappings, including a synthetic header-conditioned duplicate; the POS baseline still has eight route owners. Caller-source assertions link the four handlers to their SQL functions, and the OpenAPI suite verifies canonical/served/pinned bytes. This is local evidence only; hosted CI was not run. The SDD review gate remains open: independent reviewers must validate the inventory and 002A acceptance before `TASK-POSC-002A` is done and before 002B proceeds.
