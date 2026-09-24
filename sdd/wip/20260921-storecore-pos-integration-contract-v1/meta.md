# Meta — StoreCore POS integration contract v1

- **Feature Name:** `storecore-pos-integration-contract-v1`
- **Feature ID:** `feat-20260921-storecore-pos-integration-contract-v1`
- **Feature UUID:** `4fabd36a-20c5-45ce-8487-5d690bc05473`
- **Status:** `local_fail_closed_done` (PR #19 merged `18d18f7`; módulo DISABLED; not live)
- **Maturity:** evidencia local en Testcontainers. V7 deja `future_optional=false` y el módulo `DISABLED`. Companion live NO-GO.
- **Related:**
  - `20260921-single-tenant-installation-baseline` (ledger a extender por delta; no editar plan 14 tasks salvo dependencia futura)
  - `20260921-pos-sales-ingestion` (**superseded**; ISSUE/REVERSAL histórico)
  - `20260921-blackstore-pos-operations` (puntero StoreCore → BlackStore `blackstore-pilot`)
  - BlackStore `20260921-blackstore-pilot` (companion vivo; OpenAPI apunta a este YAML)
  - BlackStore `20260921-blackstore-pos-core` (**superseded**; ISSUE/REVERSAL no ejecutable)
- **Mode:** standard · **Project type:** production · **Platform:** backend · **Language:** es
- **spec_language:** es

## Stages

- functional: `ready_for_sol_review`
- technical: `ready_for_sol_review`
- data_model: `ready_for_sol_review`
- tasks: `ready_for_sol_review`
- implementation: `local_fail_closed_done`

## Relationship check

```yaml
relates_to:
  - path: sdd/wip/20260921-pos-sales-ingestion/1-functional/spec.md
    relationship_type: deprecates
    note: Companion BlackStore usa reserve/commit/release; no ISSUE/REVERSAL.
  - path: sdd/wip/20260921-pos-sales-ingestion/2-technical/spec.md
    relationship_type: deprecates
    note: Canal EXTERNAL y tipos ISSUE/REVERSAL no se usan.
  - path: sdd/wip/20260921-blackstore-pos-operations/CONTEXT.md
    relationship_type: deprecates
    note: Puntero histórico ISSUE/oversell; canónico en repo BlackStore + este contrato.
  - path: sdd/wip/20260921-single-tenant-installation-baseline/1-functional/spec.md
    relationship_type: extends
    note: Stock WEB/ML intactos; canal EXTERNAL_BLACKSTORE es delta futuro.
```
