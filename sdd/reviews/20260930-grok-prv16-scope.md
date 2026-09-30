VERDICT: APPROVED

# Grok 4.7 — POSC-003 scope re-review (SCOPE lane, r3)

**Date:** 2026-09-30  
**Lane:** SCOPE  
**Feature:** POSC-003 — catálogo versionado y reserva BlackStore (propuesta documental)  
**Integration head:** `8e2a47f`  
**Reviewed:** `2-technical/posc003-catalog-reserve-proposal.md`, `3-tasks/posc003-implementation-slices.md`, `sdd/STATUS.md` (full read; r3 after Terra P0 fixes)  
**No merge.** No Flyway, no code, no `sdd.finish`, no `BLACKSTORE_INTEGRATION` activation. This file does not grant per-slice implementation GO.

## SDD why

POSC-002A–G mergeados en `8e2a47f`; TASK-POSC-002 `slices_complete_residuals` (`INSERT(variant_id)`=false, ML RR/TASK-DSP-000B NO-GO). POSC-003 permanece `pending_spec_review` hasta **dual** documentary APPROVED (esta es la lane SCOPE). Tras r2 `CHANGES_REQUIRED`, Terra cerró los dos P0; r3 confirma cierre.

## P0 closure (r2 → r3)

| P0 (r2) | r3 check | Result |
|---|---|---|
| H1 runbook SQL used `blackstore_sagas` | Propuesta §42: tabla real `blackstore_integration_operations` (V6); explícito “no existe `blackstore_sagas`”. Pre-migrate: todos los PENDING son H1 implícitos **antes** del ALTER; query `(1)` filtra `state='PENDING' AND created_at > now() - interval '60 seconds'` sin columna inexistente. Tras ALTER, `request_hash_algorithm DEFAULT 'H1'`. Slice 003E: ALTER en Flyway 003E, drain sobre `blackstore_integration_operations`, PENDING vivo aborta migrate. `rg blackstore_sagas` → 0 matches. | **CLOSED** |
| `posc003-implementation-slices.md` untracked | `git ls-files sdd/wip/20260927-pos-integration-convergence/3-tasks/posc003-implementation-slices.md` → tracked path returned. Contenido: secuencia A→E, PR rules, lock-order PG16 (003A), audit DEFINER (003A), lazy cleanup + cap (003C), ML-DSP-000B gate, 003E H2/ALTER ownership. | **CLOSED** |

## r1 fix checklist (final)

| # | Fix | Result |
|---|---|---|
| 1 | Slices tracked + A→E, lock-order, cleanup, audit DDL, Flyway vs ML-DSP-000B | **PASS** |
| 2 | Cleanup lazy 003C/003E; batch 004A; generation cap 3 | **PASS** |
| 3 | `PriceQuotePort` `[starts_at, ends_at)` + adapter refactor | **PASS** |
| 4 | Audit SECURITY DEFINER + `BLACKSTORE_PRICE_OVERRIDE` in 003A | **PASS** |
| 5 | H1 pre-migrate runbook; abort if live PENDING | **PASS** |
| 6 | SKU `BLACKSTORE_CATALOG_SKU_EXCLUDED` + WEB OOS | **PASS** |
| 7 | Lock-order writers + Tx-C no invierte | **PASS** |
| 8 | 003E: no `COST_SCOPE_REQUIRED`; `FORBIDDEN`/`CAPABILITY_DISABLED` | **PASS** |
| — | Pruebas baseline V1–V10 (r2 P1) | **PASS** — propuesta §69 |

## Documentary substance

La propuesta cierra las seis decisiones de diseño contra el pin `7B907...DE30` y el baseline `8e2a47f`: revisión estática separada de stock; fotografía/ETag fuerte; cursor opaco con LEGACY 410; cotización compartida con intervalo canónico; H2 + compat H1 honesta; override audit-only con evidencia de cotización; SKU ≤64 en wire con exclusión diagnosticada. Lock ordering, cleanup ownership, y semántica override frente al consumidor BlackStore están especificados con criterios de prueba PG16.

POSC-002 close-out sigue honesto: identidad/guards mergeados; residuales no reabiertos ni resueltos silenciosamente en 003.

## P1 watches (coexist with APPROVED; not blocking spec GO)

- **`request_hash_algorithm` Flyway numbering:** slice 003E permite “mismo Flyway 003E o delta si 003A ya cerró el número”; resolver en preflight del primer PR SQL sin cambiar semántica.
- **Lazy delete on reserve stale paths:** propuesta asigna lazy cleanup a 003C/003E; 003E acceptance podría repetir quote purge en 422/410 — optional clarity at implement time.
- **`INSERT(variant_id)` residual:** sigue false; reserva Tx-B asume filas `inventory_balances` existentes — gate separado, no scope 003 spec.

## Out of scope (respected)

Flyway execution, controller split, digest change, BLACKSTORE activation, POSC-004/004A, PIC-006A, fiscal, ML RR grant, `sdd.finish`.

## Summary

POSC-003 SCOPE lane **APPROVED** (r3). Both r2 P0 items are closed; documentary spec is sufficient to later request **per-slice** implementation GO after the companion SDD lane review and dual spec APPROVED complete. POSC-003 remains **NO-GO de implementación** until then. No Flyway, no code, no `sdd.finish`, no live BlackStore.
