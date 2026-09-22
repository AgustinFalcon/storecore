# TASK-002 — Core single-tenant Flyway schema

**State:** complete after scoped Sol GO (2026-09-22). This is not WIP approval and does not enable TASK-003, any BlackStore adapter, or a cross-database integration.

## Evidence

- `V1__core_single_tenant_schema.sql` is generated from the canonical DDL fenced block in `2-technical/data-model-v1.md`.
- `mvn test` passed on 2026-09-22: 14 tests, 0 failures/errors. `CoreSchemaMigrationTest` uses Flyway and an ephemeral PostgreSQL 16 Testcontainers instance.
- Tests demonstrate: singleton installation enforcement, future-optional default guard, grouped nullable checks, protected external-envelope facts, customer-scoped checkout composite identity, immutable checkout claim identity/snapshot, immutable `order_items`, and permitted claim/order lifecycle transitions.
- Sol gate: GO only for TASK-002. No global approval.