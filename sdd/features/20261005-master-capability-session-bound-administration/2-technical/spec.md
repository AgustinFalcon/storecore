# Technical specification

## Current boundary

`JdbcCapabilityService` passes `InternalUserPrincipal.userId` to V3/V8 functions,
although the principal also holds its authenticated `sessionId`. V9 retains
runtime EXECUTE on all six actor-only signatures. A runtime caller can therefore
name a real active administrator without binding the request to a current session.
V9's safe definer search path prevents temporary-table shadowing but does not
establish this session binding.

## V10 contract

Create four session-bound administration signatures: configuration change,
kill-switch create, module-bound remove and module-bound replace. Each takes actor
BIGINT and session UUID in addition to its existing business parameters. Exact
argument order is recorded in V10 and must match every JDBC call and test fixture.
Never send raw cookie/session tokens to capability SQL or include them in audit.

Before any privileged effects, resolve the session against `public.identity_sessions`
and require matching `user_id`, subject kind USER, null customer ID, no revocation,
and idle/absolute deadlines strictly after `clock_timestamp()`. Resolve current
`public.users`, `public.user_roles` and `public.roles`; require active user and ADMIN.
Missing or null inputs deny with `CAPABILITY_ACTOR_NOT_AUTHORIZED`. Do not trust
principal role snapshots, a client-supplied UUID, custom GUCs or temporary relations.
The UUID comes from the server-authenticated principal, never an HTTP body/header.
This verifies current session binding; it does not claim protection against a
fully compromised runtime database principal able to read real session identifiers.

Keep authorization and mutation in one database transaction. Use the same
session→user→role→business order already established by HTTP CSRF verification,
then repeat the locked authorization/deadline check after every business-lock
wait and before effects. This prevents both lock-order inversion and admission of
an authority that expired while waiting. Record and test the resulting
serialization with session revocation where applicable.
Do not turn this slice into a global identity locking redesign.

All new SECURITY DEFINER signatures remain owned by `storecore_migrator`, with
explicit `search_path=pg_catalog,public,pg_temp` and schema-qualified authorization
relations. Revoke PUBLIC EXECUTE on new functions and helpers. Grant runtime only
the four session-bound entry points; an internal definer helper, if used, is not
runtime-executable. Revoke runtime and PUBLIC EXECUTE on all six legacy actor-only
signatures, including both pre-V8 and module-bound remove/replace overloads.
Keep runtime direct DML denied on capability configuration, kill switches and audit.

V10 is additive/forward-only. Preserve V1–V9 bytes and Flyway checksums. Legacy
functions may remain as inaccessible implementation history; no runtime fallback
or replacement of a published migration is allowed. Existing business validation,
optimistic versions, per-module binding, immutable audits and replacement lineage
remain atomic. V10 does not modify default module states or integration policy.

## Application boundary and fixtures

Update only capability administration JDBC calls to pass the verified principal's
session ID. Keep HTTP payloads unchanged. Map database authorization failures to
the existing application error. Every test fixture which calls administration SQL
must create a real USER session for its actor and invoke the new signature; do not
restore legacy EXECUTE to make tests pass. Fixtures involving inherited BlackStore
schema are compatibility evidence only, not authorization for its integration.

## Required verification

- Fresh installation V1–V10 and published V9→V10 upgrade both succeed; V1–V9
  checksums are unchanged. Catalog assertions cover signatures, owner, safe path,
  PUBLIC denial, runtime grants/revocations and direct DML denial.
- Connect as `storecore_runtime` for privilege tests. Legacy actor-only calls fail
  for lack of EXECUTE; test execution as owner is insufficient evidence.
- For all four operations, test valid ADMIN success and missing/unknown/null,
  revoked, idle/absolute expired, CUSTOMER, mismatched actor, inactive user,
  OPERATOR-only and removed-ADMIN rejection. Verify unchanged state and audit counts.
- Preserve stale-version, stale-ID, wrong-module, replacement atomicity and
  temporary identity-table shadowing regressions. Test a revocation committed
  between initial HTTP authentication and SQL mutation to expose stale principals.
- Run affected backend tests and the required repository checks on the actual
  master-derived head. Record exact commands, results, base/head and limitations;
  no reuse of integration-branch CI as master evidence.

## Explicit exclusions

Master-only V10; V1–V9 immutable; no Tx-C; no BlackStore operational integration;
no aggregate promotion from `integration/storecore-int`; no live/fiscal/Correo
activation, credentials, deploy, tag, publish or release. Single-tenant boundaries
and all unrelated backlog items remain governed by their own SDDs.
