# Changelog

## Unreleased — 2026-09-22

Cierra el plan frontend UX y los residuales in-repo TASK-013, TODO-003 y TODO-041.

- POSC-006 / PIC-006A: suite PG16 Spring de GET/reconcile RO (`Posc006aGetReconcileRoTest`); sin cambios productivos. Merge [#82](https://github.com/AgustinFalcon/storecore/pull/82).
- POSC-005: topología HTTP OpenAPI pinneada y envelope 401 (`Posc005WireTopologyTest`); merge [#83](https://github.com/AgustinFalcon/storecore/pull/83).
- TASK-DSP-000B: snapshot SECURITY DEFINER `MARKETPLACE_ML/SYNC` (V15); `decide` consume la foto; V3 genérico rechaza ML. Merge [#84](https://github.com/AgustinFalcon/storecore/pull/84).
- TASK-DSP-001: `channel_accounts.purpose` tipado (V16, backfill `UNCLASSIFIED`); CreateListingMapping exige `account_id` explícito `EXTERNAL_ML_SYNC`; `notify` no se toca. Merge [#85](https://github.com/AgustinFalcon/storecore/pull/85).
- TASK-DSP-002: proyección `channel_listing_stock_projection` (V17) con versión monotónica y fórmula `max(0, available-safety)` sin restar `reserved_quantity`. Merge [#86](https://github.com/AgustinFalcon/storecore/pull/86).
- TASK-DSP-003: outbox inmutable `STOCK_DESIRED_CHANGED` + delivery `PENDING` (V18) en la misma transacción que el snapshot. Sin dispatcher. Merge [#87](https://github.com/AgustinFalcon/storecore/pull/87).
- TASK-DSP-004: callers WEB/MP, `releaseSaga` idempotente y orden global de locks; checkout multi-SKU en una transacción. Sin dispatcher ni `InboxApplicationWorker`.
- BlackStore/PIC-009: retirado el writer directo de `desired_quantity` y `LISTING_STOCK`; bridge de aplicación fail-closed `NOT_ELIGIBLE`, sin activar el conector ni alterar outbox histórico.
- POSC-000A: harness offline OpenAPI 3.1 con fixtures del baseline y pin SHA-256 reproducible para StoreCore/BlackStore; sin conector ni porteo.
- POSC-001: harness PG16 test-only de rutas, upgrade V1–V7 con datos, ACL baseline y carreras idempotentes; sin migraciones ni conector.
- Views Angular (DS-00…U-10) alineadas al pacto UX; favoritos fuera del chrome (TODO-036 diferido).
- Playwright + axe en pantallas públicas: `frontend` `npm run test:a11y` (CI Verify + `npm run verify`).
- Worker de inbox aplica solo después de refetch oficial; sin credenciales live, unconfigured deja `RECEIVED`.
- Runbook de flota: backup, restore y rollback.
- Worker: claim/refetch fuera del lock, PENDING no cierra el inbox, fallos ML aislados por fila.
- GET admin de órdenes exige `MANUAL_FULFILLMENT` READ.

- MP-LIVE-02A: política Kotlin pura de intentos/recovery (`MpCheckoutAttemptPolicy`). Sin wiring, DDL ni credenciales.
- MP-LIVE-02 documental: matriz de errores, identidad de webhook (validador oficial) y política de reversos/stock tardío, listas para Sol.
- MP-LIVE-03/04: carril Orders fail-closed (V4, firma oficial, inbox antes de ACK, GET por `providerOrderId`, `PAID_STOCK_REVIEW`). Checkout productivo entrega URL allowlisted; el worker ata el ID refetched y acredita con lock. Ruta V1 sin firma retirada. Doubles + wrapper oficial sin credenciales. Dual Grok 4.7 **APPROVED**; MP-LIVE-05 sigue NO-GO y el WIP no se archiva.
- Todo PR se mergea sólo tras dos reviews Grok 4.7 en paralelo (`.cursor/rules/pr-dual-grok-review.mdc`).

### Fixed

- Isolated USER/CUSTOMER login-rate budgets and corrected `Retry-After` for concurrent failures and capacity saturation ([#49](https://github.com/AgustinFalcon/storecore/issues/49)).
- Bounded per-bucket login failure history to five timestamps and introduced a nondecreasing effective clock, preserving admission and `Retry-After` against the full-history reference.

No autoriza release, tag, deploy, credenciales de vendor en CI, adapter POS/BlackStore ni fiscal/ARCA.
