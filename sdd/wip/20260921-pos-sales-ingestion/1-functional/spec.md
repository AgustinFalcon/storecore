# Functional Spec — `pos-sales-ingestion`

**Status:** `superseded` · **Fecha:** 2026-09-21 · **Feature:** `feat-20260921-pos-sales-ingestion`

**HISTÓRICO — NO IMPLEMENTAR.** Deprecado para companion BlackStore por `20260921-storecore-pos-integration-contract-v1` (2026-09-21). No implementar ISSUE/REVERSAL. Companion vivo: BlackStore `blackstore-pilot` + YAML StoreCore.

<!-- superseded_by: sdd/wip/20260921-storecore-pos-integration-contract-v1/1-functional/spec.md -->

## Objetivo

Un POS externo (consumidor: `20260921-blackstore-pos-operations`) debe **bajar o reponer el pool de stock** de una instalación single-tenant **sin crear una venta StoreCore**. StoreCore expone un contrato servicio-a-servicio de ingestión `ISSUE` / `REVERSAL`, asiento de inventario opaco, lock pesimista, proyección ML y `next_web_delivery_at`.

Las ventas StoreCore siguen siendo sólo WEB + ML. El cruce con el mostrador es de **cantidades de variante**, nunca importes.

## Problema

El mostrador necesita consumir el mismo ledger que WEB/ML. Si StoreCore exigiera `Order` + Mercado Pago + fiscal para esa baja, el POS no podría vender. Si usara `event_type = SALE`, los reportes de venta StoreCore mentirían.

## Alcance

1. API HTTP servicio-a-servicio: `ISSUE` y `REVERSAL` (JSON de `CONTEXT.md`) y **GET** de saldo `available` por `variant_id` (apagado de alerta oversell en BlackStore; sin ticket).
2. Asiento append-only opaco `INVENTORY_ISSUE_EXTERNAL` / `INVENTORY_REVERSAL_EXTERNAL`. No `SALE`.
3. Idempotencia por `operation_key` de negocio; líneas **todo o nada**.
4. Lock pesimista de `inventory_balances`; safety stock **perforable** por mostrador; oversell **sólo** si `allow_oversell` en esa línea.
5. Tras commit: actualizar `desired_quantity` / outbox ML. El stock remoto **no** pisa el ledger.
6. En `NO_STOCK`: `available_after`, `next_web_delivery_at`, `oversell_allowed` por línea.

## No alcance

- Ticket, caja, popup, cola de alertas, factura lote / NC: viven en `20260921-blackstore-pos-operations`. StoreCore no evalúa factura.
- Discovery/emisión ARCA. No adapter fiscal, no DDL fiscal, no evasión ni ocultamiento.
- Tareas e implementación de `storecore-core-v1.0.0`. Este feature no las autoriza.
- `store_id`, shared runtime, cookies de USER/CUSTOMER, precios, cobros, `Order`, pagos MP.

## Identidades

USER y CUSTOMER **no cambian**. Esta API no es de storefront ni de admin: es **servicio-a-servicio** con credencial de instalación. Deny-by-default: capability `EXTERNAL_INVENTORY_INGESTION` + kill switch; sin feature flags genéricos.

## Criterios de aceptación

- AC-1: un `ISSUE`/`REVERSAL` aceptado no crea `orders`, `payments`, inbox MP ni comprobante fiscal. No registra ticket ni precio.
- AC-2: `variant_id` del request es el `BIGINT` de `product_variants.id`. Un string de catálogo o SKU no es identidad.
- AC-3: mismas `operation_key` + payload canónico → `DUPLICATE` con **la misma forma que el resultado original** (si el original fue `OK`, el cuerpo es el `OK` original). Cambio de líneas o de `allow_oversell` exige **clave nueva**; reutilizar la clave con payload distinto se rechaza y no muta el asiento original.
- AC-4: multi-línea es atómico. Si una línea es `NO_STOCK`, `INVALID_SKU` o `INVALID_QUANTITY`, **ninguna** línea mueve stock.
- AC-5: el writer toma lock pesimista sobre `inventory_balances` de cada variante del request. Deadlock → `CONFLICT`; el caller reintenta **la misma** `operation_key`. `CONFLICT` no queda como resultado terminal durable.
- AC-6: el mostrador **puede** perforar `safety_stock` (available puede bajar de `safety_stock` hasta 0 sin `allow_oversell`). `available < 0` **sólo** si esa línea trae `allow_oversell: true`. Sin ese flag, stock insuficiente → `NO_STOCK`.
- AC-7: un ISSUE, con o sin oversell, **no borra ni libera** reservas WEB (`inventory_reservations` ACTIVE/CONSUMED intactas; `reserved_quantity` no se decrementa por este contrato).
- AC-8: en `NO_STOCK`, `next_web_delivery_at` es la fecha prometida **más temprana** de órdenes WEB/ML que aún tienen unidades de esa variante reservadas o consumidas y **pendientes de cumplimiento**. Si no existe tal orden: `next_web_delivery_at = null` y `oversell_allowed = false`. Si existe: `oversell_allowed = true` (la fecha puede ser null si el campo prometido aún no está en baseline; ver TBD).
- AC-9: reportes y totales de **ventas StoreCore** ignoran estos asientos (filtran `SALE` WEB/ML). Un ISSUE externo no incrementa unidades vendidas StoreCore ni importes.
- AC-10: `REVERSAL_NOT_ALLOWED` **únicamente** si no hay ISSUE exitoso para esa intención o si ya fue revertido. StoreCore **no** consulta factura, caja ni estado de ticket BlackStore.
- AC-11: tras commit de ISSUE/REVERSAL, StoreCore recalcula `channel_listings.desired_quantity` de las variantes tocadas y encola outbox ML. `observed_quantity` remoto nunca escribe `inventory_balances` ni `inventory_ledger`.
- AC-12: respuestas de negocio del POST son exactamente: `OK`, `NO_STOCK`, `DUPLICATE`, `INVALID_SKU`, `INVALID_QUANTITY`, `REVERSAL_NOT_ALLOWED`, `CONFLICT`. Auth fallida o capability no `ACTIVE` / kill switch activo → denegación de transporte, no un `SALE` silencioso.
- AC-13: GET de saldo por `variant_id` devuelve `available_quantity`, `reserved_quantity`, `oversell_open` (y 404 si la variante no existe). No muta ledger. Misma credencial de instalación.

## Decisiones

- Invariante: ventas StoreCore = WEB + ML; ventas de mostrador = sistema POS externo. Cruce = qty de `product_variants.id`.
- `operation_key` de negocio es string (`bs:{ticket_id}:issue` | `bs:{ticket_id}:reversal` en el consumidor BlackStore). El mapeo al UUID del ledger es decisión técnica; WEB/ML no se rompen.
- Safety stock es piso de checkout WEB, no del mostrador.
- Oversell autorizado deja el saldo **negativo y verdadero**; la reserva WEB permanece para cumplir esa orden.
- Feature hermana: `20260921-blackstore-pos-operations` (popup, ticket, caja, factura, alertas). Este spec no los describe.

## TBD (máx. 2)

- **TBD-1:** `orders.promised_fulfillment_at` no existe en `data-model-v1`. Es el campo WEB de fecha prometida para `next_web_delivery_at`.
- **TBD-2:** `channel_sales.promised_fulfillment_at` no existe en `data-model-v1`. Es el campo ML equivalente.

## Gates

Sol revisa este feature. **No hay implementación Luna** hasta GO explícito de **`pos-sales-ingestion`**. El GO del baseline `storecore-core-v1.0.0` no habilita este contrato.
