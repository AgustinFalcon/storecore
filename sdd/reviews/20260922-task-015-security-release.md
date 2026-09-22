# TASK-015 — Security scope and release gate

**Date:** 2026-09-22  
**Verdict:** GO for `storecore-core-v1.0.0` implementation close-out. Not a deploy/release authorization.

## Security

- Opaque cookie sessions, Argon2id, CSRF + exact Origin, rate-limited login, uniform 401, foreign resources 404.
- CORS allows only the configured installation origin, credentials on, exposes `X-CSRF-Token` only.
- Profile import rejects secret-like keys and cannot rewrite installation identity or audit history.
- Capability writes require ADMIN + CAS + audit. Future-optional modules stay DISABLED.

## Deferred boundaries intact

- No BlackStore adapter, fiscal/ARCA DDL, `store_id`, Mercado Pago in the browser, or generic permanent feature flags.

## Release

- Sol implementation GO remains `docs/agent/20260922-sol-go-core.md`.
- This review is a quality GO to mark TASK-013/014/015 complete. Git deny-by-default: no commit, tag, deploy or secret publication from this session.
