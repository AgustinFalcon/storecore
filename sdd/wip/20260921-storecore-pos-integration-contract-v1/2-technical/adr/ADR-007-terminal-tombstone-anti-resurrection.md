# ADR-007 — Tombstone terminal anti-resurrection

**Status:** proposed for Sol · **Fecha:** 2026-09-22

## Contexto

La identidad de una saga es la cuádruple `(client_instance_id, device_id, sale_id, operation_id)`. Una fila terminal se puede purgar de `blackstore_integration_operations` tras 90 días, pero la misma cuádruple no puede volver a representar una venta futura: recrearla permitiría doble reserva o doble consumo después de una pérdida de respuesta.

Además, `blackstore_integration_reservation_lines.operation_pk` usa `ON DELETE RESTRICT`, por lo que borrar la saga antes de sus líneas falla y un cascade ocultaría la retención/auditoría requerida.

## Decision

Todas las rutas mutantes (reserve, commit y release) y el worker de purge adquieren el mismo advisory transaction lock derivado de la cuádruple. Reserve consulta el tombstone antes de insertar/retomar Tx-A y Tx-B lo vuelve a consultar bajo lock; commit/release lo consultan antes de resolver la saga. Si existe tombstone, la respuesta es siempre 410 `OPERATION_RETIRED`, `retryable=false`.

El purge de una saga `COMMITTED|RELEASED|EXPIRED` se realiza en una sola transacción, bajo esos locks y lock de saga:

1. INSERT de tombstone inmutable con `retention_until >= retired_at + 7 years`.
2. DELETE de `blackstore_integration_reservation_lines` de esa saga.
3. DELETE de `blackstore_integration_operations`.
4. COMMIT.

El ledger no se borra. Un comando incompatible sobre una fila terminal viva devuelve 409 `OPERATION_STATE_CONFLICT`, `retryable=false` (o 409 `EXPIRED`); una vez purgada, todo POST con la cuádruple devuelve 410. La única forma de iniciar una nueva venta es otro `operation_id`.

## Rejected

Sólo consultar tombstone en GET, borrar la saga antes de sus líneas, usar `ON DELETE CASCADE`, o responder 404 a un POST retirado. Todas esas alternativas permiten reintentos ambiguos o eliminan evidencia que debe conservarse.
