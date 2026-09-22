# TASK-014 — Data, stock and ML reconciliation

**Date:** 2026-09-22  
**Verdict:** pass

## Schema and checkout

- Flyway V1→V2→V3 on PostgreSQL 16 Testcontainers. Singleton installation, immutable envelopes, checkout claim snapshot and order-item immutability remain enforced.
- Checkout claim identity is customer-scoped; replay returns the same order; distinct request hash conflicts.

## Stock

- WEB reservation uses saga key + per-variant line key. Ledger event keys are distinct. Expiry worker releases only overdue ACTIVE rows and appends RELEASE.

## Payments / ML

- MP notification inbox is unique on provider event id and commits before ACK.
- ML notification requires an authorized `channel_accounts` row; persist-before-ACK; missing account is retryable 409. Notification ACK does not invent a SALE or mutate balances.
- Manual promo ACTIVE windows cannot overlap; writer is MANUAL only.

## Residual

- Live MP/ML refetch against vendor production APIs is installation-configured and not executed in CI (no secrets in repo).
