# Disposition — Sol POS validate CHANGES_REQUIRED

**Base:** `20260923-sol-pos-impl-validate.md` ([Sol valida POS](3551f036-6cc9-438d-9172-2c74aff61eec))  
**Fecha:** 2026-09-23

## Hallazgo 3 — rotation

`JdbcBlackStoreCompanionStore.rotateSecret` se **diferió**. El store ya no muta credenciales. `BlackStoreCompanionStoreTest` prueba `assertBound` y que no existe `rotateSecret` mientras `BLACKSTORE_INTEGRATION` sigue DISABLED. Rotación futura exige contrato ADMIN + capability/CAS/audit y Sol GO; no secretos reales.

## Hallazgo 5 — V6/V7

ADR-008 y notes de `tasks.json` usan Flyway: V5 registry, V6 saga, V7 PIC-010. V6 no se reutiliza.

## Sigue NO-GO

Companion live, fiscal, MP-LIVE-05, merge, activación fuera de Testcontainers, `/sdd.finish`. EffectivePrice* sigue untracked.
