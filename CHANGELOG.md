# Changelog

## Unreleased — 2026-09-22

Cierra el plan frontend UX y los residuales in-repo TASK-013, TODO-003 y TODO-041.

- BlackStore/PIC-009: retirado el writer directo de `desired_quantity` y `LISTING_STOCK`; bridge de aplicación fail-closed `NOT_ELIGIBLE`, sin activar el conector ni alterar outbox histórico.
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
- Bounded per-bucket login failure history to five timestamps while preserving USER/CUSTOMER decisions and `Retry-After` through clock rewinds.

No autoriza release, tag, deploy, credenciales de vendor en CI, adapter POS/BlackStore ni fiscal/ARCA.
