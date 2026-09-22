# HISTÓRICO — NO IMPLEMENTAR

**Status:** `historical_moved` / `superseded_non_executable` · **Fecha:** 2026-09-21  
**Feature:** `feat-20260921-blackstore-pos-operations`  
**Canonical executable sources:** BlackStore `C:\Users\agustin\Desktop\BlackStore\sdd\wip\20260921-blackstore-pilot\` plus StoreCore YAML `C:\Users\agustin\Desktop\StoreCore\sdd\wip\20260921-storecore-pos-integration-contract-v1\2-technical\api\blackstore-integration.openapi.yaml`.  
**Historical corpus:** this body is retained as superseded evidence only; it is non-executable. ISSUE/REVERSAL of `pos-sales-ingestion` is **superseded**.

# Especificación funcional — BlackStore POS operations (sistema externo)

## Problema

El mostrador vende, cobra y factura en **BlackStore**, un runtime distinto. StoreCore es el ledger de stock WEB/ML. Este WIP, alojado en el repo StoreCore igual que el discovery fiscal, define el POS externo: ticket, caja, precio local, operador, oversell, alertas de reposición y facturación lote/día/manual. **Cero tablas de ticket en PostgreSQL de StoreCore.**

## Alcance

BlackStore es dueño de: ticket presencial, caja del turno, snapshot de precio local, identidad del operador, y facturación por ticket / día / lote / a mano. Consume el `POST` de inventario del hermano. Persiste la intención **antes** de llamar a StoreCore.

## No alcance y compliance

No implementar. No DDL ni endpoints StoreCore. No `store_id`, shared runtime ni TenantFilter. No secretos. No ledger canónico, proyección ML ni cálculo de `next_web_delivery_at` (viven en el hermano). No emisión ARCA del circuito online (`20260921-arca-fiscal-discovery`). No ventas ocultas, importes alternativos, evasión, doble libro ni bypass fiscal. **Las ventas presenciales se registran y se facturan en BlackStore.** El régimen fiscal lo define titular/contador; este software no lo inventa.

## Invariante

Ventas StoreCore = WEB + ML. Ventas BlackStore = mostrador. El cruce es **cantidades de variante**, nunca importes ni precios.

## Identidades

El operador de mostrador es **USER de BlackStore** (staff). No es StoreCore `CUSTOMER`. No comparte ruta, sesión ni cuenta con el comprador web. Autorización de caja, anulación y alerta es de BlackStore.

## Ticket y estados

Líneas: `variant_id` (BIGINT de `product_variants.id` StoreCore) + `qty > 0` + precio snapshot local (puede diferir del web). No cerrar sin líneas. Máximo un ISSUE exitoso por ticket. `CLOSED` es **inmutable**; corrección = NC y/o ticket nuevo.

| Situación | Estado |
|---|---|
| StoreCore `OK` | `CLOSED` |
| StoreCore `NO_STOCK`, operador espera | `PENDING_STOCK` |
| Oversell confirmado | `CLOSED` + `oversell_committed=true` + `replenish_by=next_web_delivery_at` |
| Operador cancela (sin ISSUE exitoso) | `CANCELLED` |
| Anulado pre-factura | `CANCELLED` + llama `REVERSAL` a StoreCore |
| Anulado post-factura | Devolución + NC. **No** llama `REVERSAL` |

## Flujo de venta presencial

1. Persistir ticket en `PENDING_STOCK` (intención durable) **antes** de cualquier llamada a StoreCore.
2. `POST` consumo de inventario StoreCore (contrato `20260921-pos-sales-ingestion`). Multi-línea **todo o nada**: si `NO_STOCK`, StoreCore no consume ninguna línea.
3. Si `NO_STOCK` y `oversell_allowed`: popup con copia **exacta**:
   `Las ventas online acapararon este producto. Entrega web/ML más próxima: <next_web_delivery_at>. Podés venderlo ahora y reponer antes de esa fecha.`
4. Si el operador acepta oversell: **nueva** `operation_key` con `allow_oversell: true` **en esa línea**. El retry de la clave anterior no cambia flags.
5. Si rechaza: `CANCELLED` o permanece `PENDING_STOCK`. Si el operador quita la línea bloqueante, reintenta con **clave nueva**.
6. Facturar en circuito BlackStore (ticket / día / lote / a mano). El lote cierra contra la suma de tickets del período.

## Oversell y alertas

Cola de tickets `oversell_committed` pendientes de reposición, con `replenish_by`. Al vencer sin stock que cubra el compromiso: escala a **encargado**; si no hay acción, a **titular**. El sistema **avisa**; **nunca** atrasa, cancela ni muta órdenes WEB/ML. StoreCore no conoce la alerta.

Apagado: cuando el `available` de StoreCore cubre las unidades comprometidas, BlackStore limpia `oversell_committed` **consultando** saldo (GET). No reescribe el ticket `CLOSED`. No depende de un evento StoreCore.

## Caja

Sesión de caja por turno y operador. Los cobros del turno se concilian contra tickets `CLOSED`. Toda diferencia se **registra**; no se reescribe el ticket ni se oculta venta.

## Facturación

BlackStore emite el comprobante presencial. Modos: un ticket, cierre de día, lote, o carga a mano. El total del lote/día **debe** igualar la suma de tickets `CLOSED` del período (importes BlackStore; StoreCore no ve montos). Régimen, punto de venta y tipo de comprobante: titular/contador, no este spec.

## Reverso y devolución

BlackStore **no llama** `REVERSAL` si el ticket ya está facturado. StoreCore no evalúa factura. Pre-factura: `CANCELLED` + `REVERSAL`. Post-factura: circuito aparte de **devolución + NC** (anotado; no se diseña ARCA aquí).

## Conciliación de cantidades

Σ qty `ISSUE` netas de reversal en StoreCore = Σ qty de tickets BlackStore que pidieron stock. Desvío es incidente operativo, no ajuste silencioso de web.

## Criterios

- AC-01: intención `PENDING_STOCK` durable antes del `POST`; fallo de red reintenta la misma clave, no duplica ISSUE.
- AC-02: `NO_STOCK` deja el ticket sin líneas consumidas; operador quita línea y usa clave nueva.
- AC-03: popup usa la copia exacta; aceptar oversell exige `operation_key` nueva y `allow_oversell` en la línea.
- AC-04: `CLOSED` inmutable; corrección = NC / ticket nuevo.
- AC-05: facturado ⇒ prohibido `REVERSAL`; post-factura = devolución + NC.
- AC-06: cola `replenish_by` escala encargado → titular; jamás muta órdenes WEB.
- AC-07: `oversell_committed` se limpia cuando `available` cubre; el ticket sigue `CLOSED`.
- AC-08: caja registra diferencia vs `CLOSED`; lote factura = suma de tickets del período.
- AC-09: precio de canal es snapshot local y puede diferir del web; cruce StoreCore solo en qty/`variant_id`.
- AC-10: operador = USER BlackStore, no `CUSTOMER` StoreCore.

## Gates

Sol GO de **este** feature y del contrato hermano. Sin GO: no código, no DDL StoreCore, no secretos, no publicación.
