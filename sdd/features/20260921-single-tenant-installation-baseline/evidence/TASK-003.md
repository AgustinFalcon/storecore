# TASK-003 — Configuration and capability states

**State:** complete after TASK-004 identity. V3 is the administration surface; V1 registry stays migration-owned.

## Evidence

- `V3__capability_administration.sql` adds action kinds, schema version, kill lifecycle columns, immutable audit, registry mutation guards, and `capability_admin_*` SECURITY DEFINER functions.
- `JdbcCapabilityService.decide` evaluates kill → configuration → typed action → actor at REPEATABLE READ. Missing/malformed/expired kill denies. `DISABLED` denies all; `READ_ONLY` admits READ/STATUS/HEALTH; `PAUSED`/`ERROR` admit only READ_STATUS/HEALTH.
- Configuration changes go through `capability_admin_change_configuration` with CAS `expected_config_version`. Future-optional modules remain DISABLED. Kill create/remove/replace serializes on `capability_actions` and never deletes history.
- HTTP: `GET /api/v1/user/capabilities`, `POST /api/v1/user/capabilities/{module}/state` (ADMIN + CSRF).
- GATE: `CapabilityTask003Test` covers precedence, state matrix, CAS conflict, kill lifecycle, schema `{}` only, future-optional. `mvn test` exit 0 on 2026-09-22.

## Out of this evidence

- Permanent generic feature flags (not implemented). POS/fiscal capabilities remain unregistered as business APIs.
