# storecore-core-v1.0.0

Instalación single-tenant: un comercio, una PostgreSQL, un dominio. Identidad USER/CUSTOMER separada, catálogo, carrito/checkout, inventario WEB, inbox MP/ML persist-before-ACK, capabilities y kill switches.

## Qué quedó dentro

- Backend Kotlin/Spring hexagonal y frontend Angular HTTP (sin fixtures de producción).
- 14 tareas: TASK-001..010 y TASK-012..015. No existe TASK-011.
- Sol GO: `sdd/reviews/20260922-sol-go-core.md`.
- PR de integración: https://github.com/AgustinFalcon/storecore/pull/14

## Residuales honestos

- TODO-041: refetch/reconciliación live Mercado Libre.
- TASK-013: Playwright/axe/Stitch no automatizado.
- TODO-003: runbook de flota en `2-technical/fleet-operations.md`.
- POS/fiscal/tenancy SaaS: fuera de este feature.

## Siguiente

Plan UI: `docs/agent/frontend/ux-handoff.md` (P-02 en adelante). Sin tag, deploy ni publish.
