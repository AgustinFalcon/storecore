# ADR-003 — Separate USER/CUSTOMER identity and opaque sessions

## Context

StoreCore serves internal staff and storefront customers, whose authority and data ownership differ. The V1 tables do not by themselves provide runtime authentication or revocation.

## Decision

Use two explicit realms: internal `USER` with `ADMIN|OPERATOR` roles and storefront `CUSTOMER`. They may share an email string but never a principal, role or session. Authentication yields an opaque server-side session whose SHA-256 token hash is durable and revocable; every request checks idle/absolute expiry, revocation, subject activity and current USER roles. Passwords are Argon2id PHC. `customer_id` always derives from `CustomerPrincipal`; paths and bodies do not select it.

Bootstrap of the first ADMIN is a local, interactive, one-time deployment command protected by an advisory lock and append-only audit. It has no HTTP surface and never accepts credentials by environment, arguments or logs.

## Consequences

JWTs, durable refresh tokens, shared principal tables and role claims supplied by a client are out of scope. Logout/revocation is durable; subject deactivation and role removal take effect on the next request. Tokens, passwords, hashes and address PII are excluded from audit/log payloads.

## Rejected alternatives

A unified principal table, bearer JWT without durable revocation, and HTTP/environment bootstrap credentials were rejected because they blur authority or leave recoverable credentials in deployment surfaces.