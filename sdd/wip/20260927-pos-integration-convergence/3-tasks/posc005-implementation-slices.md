# POSC-005 — wire, topología y cierre offline

**Estado:** dual prv25 APPROVED (`sdd/reviews/20260930-grok-prv25-sdd.md`, `sdd/reviews/20260930-grok-prv25-scope.md`) @ `56976db`. PR pendiente.

## Alcance

- Un owner Spring por las siete rutas de negocio + `GET /blackstore-integration/v1/openapi.yaml`.
- HTTP OpenAPI atraviesa el stack real: 200, `X-Contract-Version=1.0.0-draft`, bytes SHA-256 `7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30`, módulo `DISABLED`.
- Envelope `BaseResponse` en 401 sin bearer (`code`/`data`/`errorCode`/`retryable`/`message`/`traceId`).
- Documentar instalación/rollback: el módulo permanece `DISABLED`; los tests pueden activar temporalmente por SQL y restauran. No hay conector live ni secretos.
- Residuales **fuera** de 005: runtime `INSERT(variant_id)` false, 004A-R01 retry/poison, 004A-R02 race matrix, ML RR, PIC-008A SKU 128/129, 400 dirty duplicates, fiscal/ARCA.

## Fuera

No activa `BLACKSTORE_INTEGRATION`. No corre la suite completa de backend. Live, fiscal, ML RR y `/sdd.finish` siguen NO-GO. Los rate limits 429 ya están cubiertos por `BlackStoreHttpContractTest` / `BlackStoreRateLimiterTest`; este corte no re-explota el bucket.

```text
cd backend
mvn -Dtest=Posc005WireTopologyTest test
```

| Attribute | Record |
| --- | --- |
| Exit code | 0 |
| Tests | 1 run, 0 failures |
| Flyway ceiling | V14 (contexto Spring) |
| PG | 16 via Testcontainers |
| Full backend suite | **no ejecutada**; no se presenta como CI verde |

Residuales fuera de 005: `INSERT(variant_id)` false, 004A-R01/R02, ML RR, PIC-008A, fiscal, live.
