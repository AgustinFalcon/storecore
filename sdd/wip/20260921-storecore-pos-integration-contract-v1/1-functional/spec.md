# Functional Spec — `storecore-pos-integration-contract-v1`

**Status:** `ready_for_sol_review` · **Fecha:** 2026-09-21 · **No approved**

<!-- deprecates: sdd/wip/20260921-pos-sales-ingestion/1-functional/spec.md -->
<!-- superseded_by is on those historical WIPs; this contract is the live companion API -->
<!-- extends: sdd/wip/20260921-single-tenant-installation-baseline/1-functional/spec.md#ac-5 -->

## Problema

BlackStore (POS administrativo, companion opcional) necesita catálogo, precios autorizados y stock de StoreCore **sin** ser un módulo interno, **sin** acceder a la PostgreSQL de StoreCore, y **sin** registrar la venta presencial como orden/factura StoreCore.

## Objetivo

Publicar el **contrato HTTP canónico** `storecore-pos-integration-contract-v1`. StoreCore es autoridad de catálogo, precios/costos autorizados y stock. BlackStore es autoridad de ticket, caja, gastos, arqueos y reportes. Fiscal queda **fuera**.

## Alcance

1. Companion **0..1** BlackStore por instalación StoreCore.
2. Identidad de servicio, rotación atómica de secreto, TLS, scopes, logs redactados.
3. Catálogo cursor opaco (max 200, retención 7 días). Históricos no se borran.
4. GET saldo vendible (`stock:read`).
5. Saga reserve/commit/release/GET/reconcile read-only. Cuádruple de headers. Sin estado `REJECTED`.
6. Canal ledger `EXTERNAL_BLACKSTORE` (nunca `POS` ni `SALE` comercial).
7. Offline MVP BlackStore: catálogo cacheado + bloqueo de ventas nuevas.
8. Rate limits D-RATE. Auditoría de override. Sin PII de pago ni fiscal en esta API.
9. Conector real BlackStore **bloqueado** hasta Sol GO.

## No alcance

Ticket/caja/UI POS; fiscal; ventas ocultas; `store_id`; TODO-030..034; las 14 tasks de core; DB cruzada; ISSUE/REVERSAL/`allow_oversell`.

## Identidades

Una service identity. Autorización **solo por scopes**. Cajeros: BlackStore no emite `cost:read` ni `price:override`. `X-Actor-Role` es claim no confiable, audit-only.

## Criterios de aceptación

- AC-ID-1: 0..1 companion vivo. Mismatch binding → 403. Capability DISABLED → 403 `CAPABILITY_DISABLED`.
- AC-ID-2: Bearer + rotación atómica (una sola credencial ACTIVE al commit). Scopes `catalog:read`, `stock:reserve`, `stock:commit`, `stock:release`, `stock:read`, `cost:read`, `price:override`.
- AC-CAT-1: GET `/blackstore-integration/v1/catalog` cursor opaco ligado a companion+`catalogVersion`; `pageSize` default/máx 200; retención 7 días; sin offset. `availableQuantity` = sellable. `validUntil` obligatorio.
- AC-CAT-2: Validación de schema **antes** de Tx-A. 422 `CATALOG_VERSION_STALE` en Tx-B: DELETE claim PENDING en la misma tx; GET 404; nuevo `X-Operation-Id`. Override = scope `price:override` + `X-Override-Reason`. Receipts no-PENDING incluyen `acceptedPriceVersions[]` (min 1). Cada línea de reserve **exige** `priceVersion`.
- AC-STK-1: BlackStore persiste intención + cuádruple + outbox **antes** del HTTP.
- AC-STK-2: Identidad wire = `(client_instance_id, device_id, sale_id, operation_id)`. Reserve/commit/release/GET usan el **mismo** `X-Operation-Id`. Body sin operation key.
- AC-STK-3: Reserve en **dos transacciones**. Tx-A: persistir PENDING + `request_hash` canónico y COMMIT (GET ya lo ve). Tx-B: lock saga, validar hash, locks stock, reserva+ledger+receipt+RESERVED. Re-POST misma cuádruple retoma Tx-B. Locks: **primero la fila de saga**, luego `inventory_balances` por `variant_id ASC`. TTL 900s (60–3600). Estados durables `PENDING|RESERVED|COMMITTED|RELEASED|EXPIRED`. `CONFLICT` = 409 no durable.
- AC-STK-4: Commit/release/expiry mutuamente exclusivos (`FOR UPDATE SKIP LOCKED`). Ledger `EXTERNAL_BLACKSTORE` + `RESERVATION`/`RELEASE`/`STOCK_COMMIT_EXTERNAL`. Nunca `SALE`.
- AC-STK-5: Reconcile read-only, max 500 `knownReceipts`. `present` = intersección enviados∩existentes. `unknownReceipts` = enviados no existentes. No descubre ops server-only. Investigación individual = GET cuádruple.
- AC-STK-6: `available_quantity` **ya es neta de** `reserved_quantity` (on_hand = available + reserved). Sellable = `GREATEST(0, available_quantity - safety_stock)`. Prohibido restar `reserved_quantity` de nuevo. Reserve: `available -= q`, `reserved += q` si `q <= sellable`. Commit: `reserved -= q`. Release/expiry: `available += q`, `reserved -= q`. 409 `INSUFFICIENT_STOCK` + `lineFailures[]`. Sin oversell.
- AC-STK-7: **Sin REJECTED.** Matriz:
  - `INSUFFICIENT_STOCK` / `CATALOG_VERSION_STALE` / `VALIDATION`: validación pre-Tx-A cuando aplique; en Tx-B DELETE claim en la misma tx; GET 404; nuevo `X-Operation-Id`.
  - `CONFLICT` deadlock: rollback mutación; conserva **estado durable previo** (PENDING en reserve; RESERVED/COMMITTED en commit/release); re-POST misma cuádruple.
  - `IDEMPOTENCY_PAYLOAD_MISMATCH`: conservar fila original; GET la devuelve; corrección = nuevo ID.
  - `EXPIRED`: conservar EXPIRED; GET lo devuelve; nueva venta = nuevo ID.
  HTTP perdida → GET antes de re-POST.
- AC-OFF-1: Obligación BlackStore: StoreCore down → catálogo cacheado RO + bloqueo ventas nuevas.
- AC-SEC-1: Envelope único AssistTime `BaseResponse`: HTTP status = `code` (`HttpCode`) y cada schema del status fija `code` con `const`. Todo JSON no-304 **requiere** `code,data,errorCode,retryable,message,traceId`. Éxito: `code=200`, `data` payload y `errorCode`/`retryable`/`message` null explícitos. Error: `data=null`, `errorCode`/`retryable`/`message`/`traceId` no-null; BlackStore ramifica por `errorCode`, no por `message`. Rate: 30 reserve/s (burst 10), catalog/stock-read 60/s, reconcile 5/s; 429 + `Retry-After`. Audit override en `audit_events`.
- AC-CMP-1: OpenAPI `1.0.0-draft`. Prefijo exclusivo `/blackstore-integration/v1` (sin slash final). Un solo YAML canónico en StoreCore.
- AC-CMP-2: Tests: idempotencia concurrente, expire-vs-commit, GET recovery, permisos, no DSN cruzado, reconcile, OpenAPI.

## Recuperación GET (única tabla)

| Ventana | GET misma cuádruple | Siguiente acción BlackStore |
|---|---|---|
| a) Nunca persistida | 404 | POST reserve misma cuádruple |
| b) Tx-A hecha, Tx-B no (PENDING + hash, receipt null) | 200 PENDING | Re-POST **misma** cuádruple (retoma Tx-B) |
| c) Reserve OK, HTTP perdida | 200 RESERVED + receipt | Seguir a commit |
| d) Commit/release OK, HTTP perdida | 200 COMMITTED / RELEASED | No re-POST ese paso |
| e) Expirada | 200 EXPIRED | Nueva saga (nuevo operation_id) |
| f) Recibió INSUFFICIENT_STOCK / CATALOG_VERSION_STALE / VALIDATION | 404 | Resync + **nuevo** operation_id, mismo sale_id |
| g) Recibió IDEMPOTENCY_PAYLOAD_MISMATCH | 200 estado original | Corregir body con **nuevo** operation_id |
| h) Recibió CONFLICT | 200 estado durable previo | Re-POST misma cuádruple |
| i) Saga purgada (tombstone retenido >=7 años o política por instalación >=7 años) | 410 OPERATION_RETIRED (`retryable=false`) | **Nunca** re-POST; nueva venta = nuevo operation_id |

Worker: DELETE `PENDING AND created_at < now()-60s` sin ledger. Purge terminales es atómico: INSERT tombstone inmutable, después DELETE saga en la misma transacción; retener tombstone >=7 años o por política de instalación >=7 años.

## Decisiones cerradas

- D-TTL: 900 s default; config `reservation_ttl_seconds` ∈ [60, 3600].
- D-CURSOR: cursor opaco companion+catalogVersion; page 200; retención 7 días; sin offset.
- D-RATE: 30 reserve/s/identidad, burst 10; lecturas catálogo/stock 60/s; reconcile 5/s.
- D-PATH: prefijo `/blackstore-integration/v1` (sin slash final).
- Tx-A/Tx-B para PENDING durable. Matriz 409 de AC-STK-7. Tombstone + 410 OPERATION_RETIRED (no re-POST saga purgada).
- `available_quantity` neta de reserved; sellable no vuelve a descontar reserved.
- Reconcile = comparación acotada, read-only.
- Fiscal fuera. Safety stock no perforable.
- `pos-sales-ingestion` y `blackstore-pos-core` ISSUE/REVERSAL **superseded**. Corpus vivo apunta a `blackstore-pilot` + YAML StoreCore.

## Decisiones aún abiertas (no bloquean este contrato)

- D-PROMISE: `promised_fulfillment_at` WEB/ML (no viaja aquí).
