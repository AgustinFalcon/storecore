# Estado canónico del SDD — StoreCore

**Estado actualizado:** 2026-09-29; `origin/integration/storecore-int` verificado en `9ce355b` para POSC-002 (revalidar antes de migrar)
**Madurez:** `storecore-core-v1.0.0` archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. Integración: PR #14. No existe TASK-011.  
**Sol GO:** `sdd/reviews/20260922-sol-go-core.md`.  
**Git:** el baseline core está archivado; los deltas backend posteriores se integran por PR separado. No hay tag, deploy ni publish de 1.0.0.

## Residuales honestos

- TASK-008/014 inbox persist-before-ACK done. TODO-041 worker applies only after official refetch (fake in CI; live credentials per installation, never in repo).
- TASK-013: Playwright/axe on public screens (`frontend` `npm run test:a11y`). Stitch is a visual reference, not a pixel baseline.
- TODO-003: fleet runbook complete at `sdd/features/20260921-single-tenant-installation-baseline/2-technical/fleet-operations.md`.

## Precedencia

1. Feature archivado: `sdd/features/20260921-single-tenant-installation-baseline/`.
2. `sdd/PROJECT.md`, `sdd/PATTERNS.md`, `sdd/TRACEABILITY.md`, `sdd/RELEASE.md`.
3. `docs/agent/` es espejo; Company Brain canónico vive en `Novastra/company brain`.
4. `20260819-store-tenancy-and-profiles` y `sdd/specs/*` son históricos/superseded.

## WIP frontend UX (doc + Stitch + volcado de tokens)

- `sdd/wip/20260923-storecore-frontend-ux-system-v1/` — sistema visual canónico. Stitch `projects/6473866243657965808`. UX-ANG aplicado en las 22 rutas existentes (tokens navy/canvas/accent). No había HTML Stitch archivado para P-01/P-02/P-03; esas tres se alinearon al DS y a las views previas. No es pixel-complete ni archive. Sin SDK MP.

## Gate actual

UX-ANG está aplicado en las 22 rutas existentes. No es pixel-complete. Una `checkoutUrl` HTTPS allowlisted es redirección UX, no prueba de cobro. No autoriza release, fiscal/ARCA, tenancy SaaS, DEMO-as-production ni deploy.

Tramo implementable MP-LIVE-01–04 **cerrado** (fail-closed, dual Grok APPROVED). El WIP sigue `documented_deferred`; MP-LIVE-05, fiscal y live siguen NO-GO. Los jobs alojados de los PR recientes también fallaron con `steps=[]`: no se interpreta como CI verde ni autoriza promover integración a `master`, cerrar WIPs con `sdd.finish`, publicar o activar integraciones.

## Backend posterior al baseline core

- **Login USER/CUSTOMER:** `sdd/wip/20260927-login-realm-budget/` tiene TASK-LRB-001–005 completos a nivel local e integrados por PR #50 (`7644feb`). La evidencia de contención y su límite está en `sdd/reviews/20260927-login-limiter-contention-measurement.md`; no representa un SLO de producción. El WIP permanece abierto por sus gates de cierre.
- **Cota de memoria del login:** `sdd/wip/20260927-login-limiter-top5/` obtuvo dos GO documentales Astra por PR #54 (`dedeb1a`). El código pasó 29 suites/129 pruebas locales y dos reviews Astra; PR #57 se integró como `b6f37df` y PR #58 registró el estado como `d6a3083`. TASK-LT5-001–004 están done (4/5); TASK-LT5-005 sigue pending por los gates de cierre del WIP. Verify alojado del PR #57 falló con `steps=[]`, por lo que no hay CI remoto verde ni `sdd.finish`.
- **Stock deseado Mercado Libre:** `sdd/wip/20260924-ml-desired-stock-projection/` obtuvo GO documental en TASK-DSP-R00 por PR #51 (`474a007`). TASK-DSP-000A selló el writer PIC-009 y se integró por PR #52 (`56baa2d`); PR #53 (`767e71a`) registró su evidencia. El DAG tiene 3/14 tareas done: 000B y las diez posteriores siguen pendientes. El bridge queda fail-closed, sin red ni activación ML/BlackStore; ver `sdd/reviews/20260927-ml-dsp-000a-pr52-integration.md`.

## WIP POS (paralelo, no es el baseline)

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/` — PIC-001..010 y L3-001..003 tienen evidencia **local histórica**; HTTP 200/304/409/410/429 y outbox se probaron en Testcontainers con activación temporal, y el módulo vuelve a DISABLED. PR #19 quedó en `master` (`18d18f7`) con dos reviews Grok; su Verify no fue CI verde. El worktree posterior de readiness divergió de integración y requiere convergencia documental y port por partes: POS/conector live sigue NO-GO. El WIP permanece abierto; tampoco hay GO fiscal, MP-LIVE-05 ni `sdd.finish`. BlackStore ADP-001..010 + L3 tienen evidencia en su propio repo; su release permanece disabled, sin companion live.
- `sdd/wip/20260927-pos-integration-convergence/` — POSC-000 (ADR) y POSC-000A (contrato OpenAPI) se integraron por PR #59 (`6ebab95`) y #61 (`3df741c`). POSC-001 verificó rutas Spring, upgrade V1–V7, ACL efectiva y concurrencia en PostgreSQL 16; pasó 32 suites/142 tests locales y dos reviews Astra. PR #63 (`9ce355b`) lo integró: 3/9 tareas done. POSC-002B V8 (SQL+PG16) se integró por PR #66 (`20152b9`): cierra EXECUTE V3 de PUBLIC/runtime e instala Tx-C; el adapter HTTP/Tx-S sigue abierto y TASK-POSC-002B no está done. POSC-002C V9 se integró por PR #67 (`37b1621`). POSC-002D (bearer + principal HTTP) tiene evidencia local (`Posc002dCompanionAuthHttpTest` + regresión FailClosed/HttpContract) y dual Grok 4.7 APPROVED (`sdd/reviews/20260929-grok-prv10-sdd.md`, `sdd/reviews/20260929-grok-prv10-scope.md`); sin guards POS (002E) ni provider de instalación. `BLACKSTORE_INTEGRATION` permanece `DISABLED`. ML REPEATABLE READ y TASK-DSP-000B mantienen NO-GO propio. Verify alojado no se interpreta como CI verde. No hay `sdd.finish`.
- `sdd/wip/20260921-pos-sales-ingestion/` — superseded.
- `sdd/wip/20260921-blackstore-pos-operations/` — puntero histórico.

## Fiscal externo

- `20260921-arca-fiscal-discovery` y `20260921-arca-storecore-adapter-contract`: `documented_deferred`. Addendum 2026-09-22 de pago/fiscal es propuesta Open. Sin código, DDL, worker ni secretos.

## Mercado Pago Checkout Pro (WIP separado)

- `sdd/wip/20260922-storecore-mp-live-checkout-v1/`: Checkout Pro externo en la misma ventana mediante Orders API, `documented_deferred`.
- MP-LIVE-01–04 fail-closed cerrados (Sol + dual Grok APPROVED). MP-LIVE-05, pagos reales y fiscal siguen NO-GO.
