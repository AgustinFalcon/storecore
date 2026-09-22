# Changelog

## Unreleased — 2026-09-22

Cierra el plan frontend UX y los residuales in-repo TASK-013, TODO-003 y TODO-041.

- Views Angular (DS-00…U-10) alineadas al pacto UX; favoritos fuera del chrome (TODO-036 diferido).
- Playwright + axe en pantallas públicas: `frontend` `npm run test:a11y`.
- Worker de inbox aplica solo después de refetch oficial; sin credenciales live, unconfigured deja `RECEIVED`.
- Runbook de flota: backup, restore y rollback.

No autoriza release, tag, deploy, credenciales de vendor en CI, adapter POS/BlackStore ni fiscal/ARCA.
