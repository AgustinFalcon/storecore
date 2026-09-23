# Technical Spec — `storecore-pos-integration-contract-v1`

**Status:** `ready_for_sol_review` · **Fecha:** 2026-09-21 · **No approved**

<!-- deprecates: sdd/wip/20260921-pos-sales-ingestion/2-technical/spec.md -->
<!-- live companion: BlackStore sdd/wip/20260921-blackstore-pilot/ -->
<!-- extends: sdd/wip/20260921-single-tenant-installation-baseline/2-technical/spec.md -->

OpenAPI canónico: `2-technical/api/blackstore-integration.openapi.yaml`  
Delta DDL: `2-technical/data-model-v1.md`  
Gaps: `2-technical/cross-repo-gaps.md`

## Architecture

```text
BlackStore --TLS--> StoreCore HTTP /blackstore-integration/v1
  Bearer + scopes; X-Client-Instance-Id bound to token
  saga headers: X-Device-Id, X-Sale-Id, X-Operation-Id
        --> port BlackStoreIntegration
        --> advisory lock of quadruple + tombstone (ADR-007)
        --> lock saga row FOR UPDATE
        --> lock inventory_balances FOR UPDATE ORDER BY variant_id ASC
        --> inventory_reservations (same as WEB)
        --> ledger EXTERNAL_BLACKSTORE
Sin JDBC a BlackStore. Sin store_id. Sin módulo POS interno.
```

Capability `BLACKSTORE_INTEGRATION` nace `DISABLED`. Config **schema v2** (exactamente trece números contractuales; sólo `reservation_ttl_seconds` puede cambiar en `[60,3600]`). V4/`TASK-PIC-001` es dueño de este JSON. El resto de módulos conserva schema v1 `{}`. CAS/audit `changeState` reenvía este schema v2, nunca `{}`. V6/`TASK-PIC-010` no vive aquí: sólo el flip documental de `future_optional`.

```json
{
  "reservation_ttl_seconds": 900,
  "reservation_ttl_min_seconds": 60,
  "reservation_ttl_max_seconds": 3600,
  "catalog_page_size": 200,
  "cursor_retention_days": 7,
  "reserve_rate_limit_rps": 30,
  "reserve_burst": 10,
  "catalog_rate_limit_rps": 60,
  "stock_read_rate_limit_rps": 60,
  "reconcile_rate_limit_rps": 5,
  "pending_claim_max_seconds": 60,
  "expiry_worker_interval_seconds": 30,
  "expiry_worker_batch_size": 100
}
```

### Scopes

| Scope | Acción | Operación |
|---|---|---|
| `catalog:read` | `CATALOG_READ` | GET `/blackstore-integration/v1/catalog` |
| `stock:reserve` | `STOCK_RESERVE` | POST `.../reservations` |
| `stock:commit` | `STOCK_COMMIT` | POST `.../reservations/{ref}/commit` |
| `stock:release` | `STOCK_RELEASE` | POST `.../reservations/{ref}/release` |
| `stock:read` | `STOCK_READ` | GET stock, GET operation, POST reconcile |
| `cost:read` | `COST_READ` | `includeCost=true` |
| `price:override` | `PRICE_OVERRIDE` | waive 422 |

## Credenciales (P1)

PostgreSQL **no** admite `DEFERRABLE` en índices únicos parciales. El unique `WHERE status = 'ACTIVE'` se evalúa por statement. Rotación en **una transacción**, orden DDL:

1. UPDATE versión N → `REVOKED`.
2. INSERT versión N+1 `ACTIVE`.
3. COMMIT.

Nunca INSERT ACTIVE antes de revocar (falla el unique parcial). Nunca rotar en tx separadas. Verifier acepta token N hasta `revoked_at` + 30s (grace en proceso).

## Catálogo (D-CURSOR)

GET `/blackstore-integration/v1/catalog`. Cursor opaco, HMAC interno, bound a `client_instance_id` + `catalogVersion`. `pageSize` default=max 200. Retención 7 días. Prohibido `offset`. 410 `CURSOR_EXPIRED` → restart sin cursor.

Ecuación única (baseline `inventory_balances`): `on_hand = available_quantity + reserved_quantity`. `available_quantity` **ya es neta de reservas**. Sellable público:

`availableQuantity = GREATEST(0, available_quantity - safety_stock)`

**Prohibido** restar `reserved_quantity` otra vez. Misma fórmula en catálogo, GET stock, `lineFailures` y `availableAfter`.

Transiciones (q > 0, `q <= sellable` en reserve):

| Evento | available_quantity | reserved_quantity |
|---|---|---|
| reserve | `-= q` | `+= q` |
| commit | sin cambio | `-= q` |
| release / expiry | `+= q` | `-= q` |

## Saga Tx-A / Tx-B y matriz 409 (P0)

Una cuádruple = una fila `blackstore_integration_operations`. Mismo `X-Operation-Id` en reserve/commit/release/GET. Path `operationId` = header `X-Operation-Id`. Body **sin** operation key. `priceVersion` de envelope es **required**; la línea puede overridear; cada línea debe resolver una versión. Receipts no-PENDING **requieren** `acceptedPriceVersions`.

**Tx-A (COMMIT visible):** advisory lock de la cuádruple + consulta de tombstone (410 si existe). Validación de schema **antes** de Tx-A. INSERT PENDING + `request_hash` canónico. `receipt` y `reservation_ref` NULL. COMMIT. **No es revertible** después del COMMIT.

**Tx-B:** mismo advisory lock → reconsultar tombstone → `SELECT FOR UPDATE` saga → validar hash → locks `inventory_balances` `ORDER BY variant_id ASC` → reserva+ledger+receipt+RESERVED, **o** errores de negocio que **DELETE** el claim PENDING en la **misma** transacción Tx-B.

Re-POST con la misma cuádruple y el mismo hash **retoma Tx-B** (idempotente). Hash distinto sobre fila existente → 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` (no borra).

**Matriz de errores (no borrar siempre):**

| Código | HTTP | Durabilidad | GET posterior | Retry |
|---|---|---|---|---|
| `INSUFFICIENT_STOCK` | 409 | DELETE claim en Tx-B (misma tx) | 404 | nuevo `X-Operation-Id` |
| `CATALOG_VERSION_STALE` / `VALIDATION` | 422 / 400 | DELETE claim en Tx-B o rechazo pre-Tx-A | 404 | nuevo `X-Operation-Id` |
| `CONFLICT` (lock/deadlock) | 409 retryable | rollback mutación; **conserva estado durable previo** (PENDING en reserve; RESERVED/COMMITTED en commit/release) | 200 estado previo | misma cuádruple |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | 409 | conserva fila original | 200 original | corrección = nuevo ID |
| `EXPIRED` | 409 | conserva `EXPIRED` | 200 EXPIRED | nueva venta = nuevo ID |
| `OPERATION_STATE_CONFLICT` | 409 `retryable=false` | conserva fila terminal viva | 200 estado terminal | no re-POST; nueva venta = nuevo ID. Si ya hay tombstone → 410 |

Sin estado durable `REJECTED`. Worker: `DELETE FROM blackstore_integration_operations WHERE state='PENDING' AND receipt IS NULL AND created_at < now()-60s` (claim Tx-A vencido **sin** ledger). No toca `RESERVED` (eso es expiry con `RELEASE`).

## Locks (P1)

Orden global **único**, también en Tx-A, Tx-B, commit y release: (0) advisory transaction lock de la cuádruple (ADR-007) y consulta de tombstone; (1) fila de saga `FOR UPDATE`; (2) **todos** los `inventory_balances` de las líneas `ORDER BY variant_id ASC` `FOR UPDATE`. Tombstone → 410 `OPERATION_RETIRED` antes de mutar. All-or-nothing: si una línea falla, rollback de Tx-B. `lineFailures` sólo en 409 `INSUFFICIENT_STOCK`, nunca un 200 parcial.

## Expiry worker (P1)

Cadencia 30s. Batch 100 filas `state='RESERVED' AND expires_at <= now()` con `FOR UPDATE SKIP LOCKED`. Por cada fila: si un commit concurrente ya tomó el lock y cambió a COMMITTED, skip. Si gana expire: ledger `RELEASE`, reservations `EXPIRED`, saga `EXPIRED`. Reintentos: 5 con backoff; poison → `audit_events` y skip.

**Retención/purge (90 días, AC-STK-8 / ADR-007):** una sola transacción, mismo advisory lock + lock de saga: (1) INSERT tombstone inmutable con `retention_until >= retired_at + 7 years`; (2) DELETE líneas `blackstore_integration_reservation_lines`; (3) DELETE saga. `ON DELETE RESTRICT` prohíbe borrar la saga antes de las líneas. El tombstone **no** se purga con la saga. Ledger intacto. No hay otra secuencia de purge.

**GET cuádruple:** fila viva → 200 receipt. Sin fila viva + tombstone → **410 `OPERATION_RETIRED`** (`retryable=false`). Sin fila ni tombstone → 404. BlackStore **nunca** re-POSTea una saga retirada; `unknownReceipts` en reconcile tampoco autoriza re-POST.

Mismo worker: `DELETE` PENDING con hash, sin receipt/ledger, `created_at < now()-60s`. No emite ledger.

Carrera commit-vs-expire: ambos `SELECT FOR UPDATE` la fila de saga; el primero gana; el segundo ve estado terminal y responde 409 `EXPIRED` o 200 idempotente COMMITTED.

## Reconcile (P0)

POST `/blackstore-integration/v1/operations/reconcile`. Scope `stock:read`. Rate 5 rps. Body `knownReceipts` 1..500.

- `present` = receipts del request que existen en StoreCore (intersección).
- `unknownReceipts` = receipts del request que **no** existen.
- No lista operaciones que StoreCore tiene y el caller no envió.
- Read-only. Compare caller-supplied receipts; **zero writes**. Para una saga concreta: GET cuádruple. `unknown` o GET 404 → re-POST **sólo** si no hubo error que borra claim y no hay tombstone (410 `OPERATION_RETIRED` = nunca re-POST).

## Auditoría override (P1)

Evento `audit_events.event_type='BLACKSTORE_PRICE_OVERRIDE'`, append-only:

```json
{
  "serviceIdentityId": "uuid",
  "declaredActorRole": "SUPERVISOR",
  "overrideReason": "redacted-or-safe",
  "clientInstanceId": "uuid",
  "deviceId": "T1",
  "saleId": "s-1",
  "operationId": "uuid",
  "traceId": "uuid",
  "occurredAt": "RFC3339",
  "result": "ALLOWED|DENIED",
  "reasonCode": "PRICE_OVERRIDE|FORBIDDEN|VALIDATION"
}
```

`X-Actor-Role` nunca autoriza. DENIED también se audita.

## Errores

Envelope único (AssistTime): `BaseResponse { code, data, message }` + `errorCode`, `retryable`, `traceId`.

- `code` = `HttpCode` = status HTTP (`200|400|401|403|404|409|410|422|429|500`). Sin `201`. `410` = `CURSOR_EXPIRED` (catálogo) o `OPERATION_RETIRED` (saga purgada).
- Todo JSON no-304 **requiere** `code,data,errorCode,retryable,message,traceId`; cada response schema fija el `code` del status HTTP mediante `const`.
- Éxito: `code=200`, `data` = payload y `errorCode`, `retryable` y `message` son null explícitos.
- Error: `data` null; `errorCode`, `retryable`, `message` y `traceId` no-null. Varios 409 se distinguen por `errorCode`, no por `message`.
- `message` humano, no autoritativo.
- `lineFailures` sólo con `errorCode=INSUFFICIENT_STOCK`.
- Implementación: `GlobalExceptionHandler` mapea excepciones a este envelope; los controllers no arman JSON de error a mano.

## Compatibilidad

YAML StoreCore `1.0.0-draft` es el **único** `.yaml` contractual. El puntero BlackStore es Markdown (no YAML). Path `/pos-integration/v1/` no se usa. Corpus vivo: este WIP + BlackStore `blackstore-pilot`. ISSUE/REVERSAL (`pos-sales-ingestion`, `blackstore-pos-core`) es histórico.
