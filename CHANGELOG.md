# Changelog

## Unreleased — 2026-09-22

Cierra el plan frontend UX y los residuales in-repo TASK-013, TODO-003 y TODO-041.

- Views Angular (DS-00…U-10) alineadas al pacto UX; favoritos fuera del chrome (TODO-036 diferido).
- Playwright + axe en pantallas públicas: `frontend` `npm run test:a11y` (CI Verify + `npm run verify`).
- Worker de inbox aplica solo después de refetch oficial; sin credenciales live, unconfigured deja `RECEIVED`.
- Runbook de flota: backup, restore y rollback.
- Worker: claim/refetch fuera del lock, PENDING no cierra el inbox, fallos ML aislados por fila.
- GET admin de órdenes exige `MANUAL_FULFILLMENT` READ.

- MP-LIVE-02A: política Kotlin pura de intentos/recovery (`MpCheckoutAttemptPolicy`). Sin wiring, DDL ni credenciales.
- MP-LIVE-02 documental: matriz de errores, identidad de webhook (validador oficial) y política de reversos/stock tardío, listas para Sol.

No autoriza release, tag, deploy, credenciales de vendor en CI, adapter POS/BlackStore ni fiscal/ARCA.
