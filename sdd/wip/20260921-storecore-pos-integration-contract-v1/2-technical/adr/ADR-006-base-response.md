# ADR-006 — Envelope BaseResponse + HttpCode

**Status:** proposed for Sol · **Fecha:** 2026-09-21

## Decision

Todo response JSON no-304 de `/blackstore-integration/v1` usa un único envelope completo:

`BaseResponse { code, data, errorCode, retryable, message, traceId }`.

Los seis campos son **required**. `HttpCode` es entero y cada schema asociado a un status HTTP fija `code` con JSON Schema `const`; por tanto el wire exige `HTTP status == body.code`. El catálogo 304 no lleva body.

- Éxito 200: `data` contiene el payload (`CatalogPage`, `VariantStock`, `OperationReceipt` o `ReconcileResult`); `errorCode`, `retryable` y `message` son null explícitos; `traceId` es obligatorio.
- Error 400/401/403/404/409/410/422/429/500: `data` es null; `errorCode`, `retryable`, `message` y `traceId` son obligatorios y no-null. Cada componente de response fija su `code` con `const` al status correspondiente. `lineFailures` sólo aplica a `INSUFFICIENT_STOCK`.
- `OperationRetired` fija `code=410`, `data=null`, `errorCode=OPERATION_RETIRED` y `retryable=false`, todos por `const` donde corresponde.

`errorCode` es el discriminador de negocio (`INSUFFICIENT_STOCK` vs `CONFLICT` vs `EXPIRED` bajo HTTP 409). `message` nunca se parsea. Implementación futura: un `GlobalExceptionHandler`; no hay respuestas sueltas por controller.

## Rejected

Cuerpos desnudos distintos por endpoint. Parsear el 409 matrix desde `message`. Reusar `code` string y `code` int en el mismo campo. Envelopes que omiten campos o sólo describen (sin `const`) la igualdad status/código.