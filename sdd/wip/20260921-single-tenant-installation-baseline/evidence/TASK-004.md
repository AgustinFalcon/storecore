# TASK-004 — Internal and customer identity

**State:** complete after Sol GO 2026-09-22. Backend Testcontainers evidence only; frontend UI is not this GATE.

## Evidence

- Realms stay separate: customer cookie never authenticates `/internal/me` (401). Invalid/unknown credentials share `AUTHENTICATION_FAILED` with no token in JSON.
- Cookies are `__Host-storecore-customer` / `__Host-storecore-internal` with Secure, HttpOnly, SameSite=Lax and no Domain. Logout is 204 with `Max-Age=0`. CSRF rotates on GET csrf and successful mutation; replay is 403.
- Rate limit: sixth failed login returns 429 `AUTH_RATE_LIMITED` + `Retry-After`. CORS allows only `storecore.installation.origin` with credentials and exposes `X-CSRF-Token`.
- Foreign address update is 404. Default address stays unique. ADMIN revoke writes one `IDENTITY_SESSION_REVOKED` audit; SYSTEM revoke does the same with actor `SYSTEM`. Empty roles after ADMIN removal yield 401.
- Bootstrap race leaves one admin and one immutable marker. Argon constraint names are `ck_users_email_canonical` / `ck_customers_email_canonical`. Idle-expired sessions cannot authenticate.
- GATE: `IdentityHttpIntegrationTest`, `IdentityTask004EvidenceTest`, `LoginRateLimiterTest`, `CoreSchemaMigrationTest` identity cases. `mvn test` exit 0 on 2026-09-22.

## Out of this evidence

- POS/BlackStore, fiscal, commercial admin (TASK-003/005+).
