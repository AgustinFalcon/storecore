VERDICT: CHANGES_REQUIRED

# Grok 4.7 — PR #19 scope / implementation

**PR:** https://github.com/AgustinFalcon/storecore/pull/19
**Título:** StoreCore local PIC-009 outbox and UX-ANG on existing routes
**Head:** `feature/pos-pic-001-009-fail-closed` @ `94588df`
**Base pedida para este carril:** `origin/master` (`e73bf4c`)
**Base real de GitHub:** `feature/storecore-core-v1.0.0` (`e996872`, ancestro de `origin/master`; es el default branch del repo)
**Carril:** scope / implementation. No merge desde este archivo.

## Motivo SDD

Sol `sdd/reviews/20260923-sol-remaining-gates.md` es `CONDITIONAL_GO` para PIC-009 (`channel_outbox` local, sin HTTP/delivery ML, cero enqueue con `BLACKSTORE_INTEGRATION=DISABLED`) y para UX-ANG sólo en las rutas P/C/U ya existentes. Fiscal, MP-LIVE-05, companion live, secretos, tag/deploy y `/sdd.finish` siguen `NO-GO`.

`sdd/reviews/20260923-sol-pos-next-go.md` (también en este diff) autoriza aparte el flip documental V7 de `future_optional` y el `ACTIVE` temporal sólo dentro de Testcontainers, restaurando `DISABLED`. No autoriza operación live.

## Diff juzgado

`git diff origin/master...HEAD`: 5 commits, 167 archivos, +14849 / −413.

```text
94588df Apply UX-ANG tokens on the existing StoreCore routes.
69f209b Add the local PIC-009 channel outbox double.
f857103 Record StoreCore Stitch C/U screens for the frontend UX WIP.
6b4dc1b Checkpoint POS fail-closed engines, V7 flip, and frontend UX SDD.
8dd60b5 Land fail-closed BLACKSTORE_INTEGRATION for PIC-001..009.
```

El listado de archivos de `gh pr view 19` es más grande (incluye MP-LIVE y otros cambios ya en `origin/master`) porque la base de GitHub está detrás de master. Este carril no los vuelve a abrir.

## Cambio requerido

Retarget del PR a `master` antes de cualquier merge. Mergear #19 como está actualiza `feature/storecore-core-v1.0.0` y no mueve `origin/master`. Los PR #16–#18 sí aterrizaron en `origin/master`. Este archivo no es aprobación de ese merge ni sustituye el segundo carril.

## Confirmaciones sobre `origin/master...HEAD`

| Check | Resultado |
| --- | --- |
| PIC-009 sólo `channel_outbox` local, sin HTTP ML | PASS. `JdbcBlackStoreMlListingAdapter` inserta `LISTING_STOCK` por JDBC, `ON CONFLICT (idempotency_key) DO NOTHING`, y actualiza `channel_listings.desired_quantity` desde `inventory_balances`. No hay `WebClient`, `RestTemplate`, `HttpURLConnection` ni host de Mercado Libre en el diff de `backend/src/main/kotlin/com/storecore/blackstore`. Ningún worker de `main` lee `channel_outbox` ni `channel_outbox_delivery`. |
| `BLACKSTORE_INTEGRATION` vuelve a `DISABLED` | PASS. V5 siembra `DISABLED` y `future_optional=true`. V7 cambia sólo `future_optional` a `false` y aborta si el estado no sigue `DISABLED`. `decide()` lanza `CapabilityDisabled` en `DISABLED` antes de efectos. Los tests HTTP restauran `DISABLED` y vuelven a ver 403. |
| UX-ANG sólo rutas existentes | PASS. `frontend/src/app/app.routes.ts` no está en el diff. Los cambios de frontend son views, estilos y el peso 650 de Inter en `index.html`. Checkout sigue diciendo que el browser no habla con Mercado Pago. No hay SDK de Mercado Pago en `frontend/src`. |
| Sin `EffectivePrice` | PASS. `EffectivePrice.kt`, `EffectivePriceQueryPort.kt` y `JdbcEffectivePriceQueryAdapter.kt` siguen untracked y fuera del diff. |
| Sin `docs/agent` | PASS. Los leftovers bajo `docs/agent/` siguen untracked. El diff no los agrega. |
| Sin secretos | PASS. Las cadenas `sk_live_`, PAN, `cvv` y `password=` aparecen como asserts de ausencia. El fixture de companion usa `ref-v1` / `opaque-ref-test`. |
| Sin fiscal | PASS. No hay código, DDL, worker ni adapter fiscal/ARCA en el diff. |
| Sin `/sdd.finish` | PASS. Los WIP siguen en `sdd/wip/`. Nada se mueve a `sdd/features/`. |

## Validaciones

| Check | Resultado |
| --- | --- |
| `mvn -q "-Dtest=BlackStoreFailClosedHttpTest,BlackStoreHttpContractTest,BlackStoreIntegrationServiceTest,BlackStoreSchemaMigrationTest" test` en `backend/` | **PASS**, exit 0, 2026-09-24 00:47. `BlackStoreFailClosedHttpTest` 2/2, `BlackStoreHttpContractTest` 2/2, `BlackStoreIntegrationServiceTest` 2/2, `BlackStoreSchemaMigrationTest` 3/3. Flyway aplicó V1–V7 y quedó en v7. |
| `npm test` en `frontend/` (`ng test --watch=false`, Vitest) | **PASS**, exit 0, 2026-09-24 00:48. 21 archivos, 48 tests. No hay specs nuevos en el diff; la suite no cubre los templates UX-ANG. |
| GitHub Verify run [35952569621](https://github.com/AgustinFalcon/storecore/actions/runs/35952569621) sobre `94588df` | **No es CI verde.** Jobs `backend` y `frontend`: `failure` en ~2 s, `steps: []`. Anotación: el job no arrancó por pagos fallidos o spending limit. No se ejecutaron tests en GitHub. |

## Implementación leída

- Commit y release llaman a `enqueueDesiredQuantityAfterBlackStore` después de que `mutateReserved` cierra su transacción. Un retry del mismo commit vuelve a entrar al enqueue; la clave UUIDv5 `ml-desired:{reservationRef}:{listingId}` impide una segunda fila. Eso no está afirmado con un segundo commit en el test.
- El caso `DISABLED` de `BlackStoreFailClosedHttpTest` llama `enqueueDesiredQuantityAfterBlackStore("any")`. `"any"` no es UUID, así que vuelve `false` antes de `decide()` y antes de mirar listings. El conteo de `LISTING_STOCK` queda en 0 y el estado queda `DISABLED`, pero esa llamada no prueba el fixture de cuenta/listing que pide Sol. El código sí corta en `CapabilityDisabled` cuando el ref es un UUID.
- `desired_quantity` sale del saldo local. El adapter no escribe `observed_quantity` ni `inventory_ledger`.
- V7 coincide con el next-go: lock, asserts de una fila `DISABLED` schema v2, trigger sólo de `capability_modules`, una columna, re-enable `ALWAYS`, sin activar el módulo. No hay bootstrap en `main` que pase el módulo a `ACTIVE`.
- UX-ANG no agrega rutas, guards, endpoints, Flyway ni Kotlin de storefront.

## Gaps no bloqueantes en este carril

- `sdd/wip/20260921-storecore-pos-integration-contract-v1/meta.md` sigue diciendo que PIC-010 está prohibido. `tasks.json` notes dicen que `future_optional` permanece `true` y que el adapter ML “still returns false”. El código y V7 hacen lo contrario, y el next-go autoriza el flip. El estado de las tareas ya está en `done`. Hay que leer el SQL y el adapter, no esas frases.
- `sdd/STATUS.md` dice a la vez que POS sigue NO-GO y que PIC-001..010 / L3 locales están done. No declara production-ready ni archive.
- El meta del WIP frontend todavía dice que la implementación Angular está bloqueada, mientras `UX-ANG` está `done` y las views existentes cambiaron. El alcance de rutas no se amplía.

## Residual NO-GO

Fiscal/ARCA, MP-LIVE-05, companion live, secretos reales, tag, deploy, publish y `/sdd.finish` siguen fuera de este PR. No mergear hasta retarget a `master` y hasta que ambos carriles Grok 4.7 queden `APPROVED` sobre ese diff.
