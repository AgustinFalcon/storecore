# Especificación funcional — moneda oficial fail-closed

## Problema

Cuando Mercado Pago omite `currency` o entrega un valor inválido, StoreCore no
posee evidencia para afirmar que la orden remota está en ARS. El comportamiento
actual inventa ese dato y puede habilitar binding, acreditación y consumo de
stock sobre una respuesta incompleta.

## Comportamiento requerido

- `ARS` textual y exacto se reconoce como la única moneda soportada.
- Campo ausente, `null`, vacío, no textual o código no soportado se traduce a
  `Unknown`; nunca se conserva como texto confiable.
- Una orden oficial con moneda `Unknown` se pone en cuarentena y no acredita el
  pago, no cambia el pedido a pagado y no consume stock.
- Un candidato de búsqueda con moneda `Unknown` no se vincula al intento, aun
  si la moneda esperada local también fuera `Unknown`; el recovery permanece
  abierto con `CANDIDATE_MISMATCH`.
- El ID devuelto por POST puede conservar su binding provisional existente,
  porque esa respuesta no acredita moneda. Ese binding nunca es prueba de pago:
  el GET oficial posterior debe validar ARS antes de cualquier efecto financiero
  o de stock.
- El flujo ARS válido conserva su comportamiento existente.

## Fuera de alcance

- Añadir USD, multimoneda o conversión de divisas.
- Activar el adapter oficial, usar red, tokens o cuentas reales.
- Cambiar DDL, esquema, webhook, firma, monto, merchant o application checks.
- Cerrar MP-LIVE-05, homologación, producción o decisiones fiscales ARCA.
- Rediseñar la moneda general del carrito o del módulo de pricing.

## Criterios de aceptación

1. La moneda es un tipo cerrado con casos `ARS` y `UNKNOWN` y un solo
   `fromWire` que falla cerrado.
2. Vista de dominio, políticas y tests usan el tipo; no comparan strings de
   moneda remota.
3. GET y search comparten el mismo traductor de JSON y cubren ausente, `null`,
   vacío, no textual, desconocido y ARS válido.
4. Pruebas demuestran que search con `UNKNOWN` no vincula y que GET con
   `UNKNOWN` no acredita ni consume stock; `UNKNOWN == UNKNOWN` también falla.
5. Suite backend, CI completo y dos revisiones independientes quedan en verde.

## Rollback

Revertir el commit restaura el mapeo anterior. No hay migración de datos porque
el corte no cambia persistencia; el rollback reabre el defecto y sólo se acepta
como contingencia temporal con el adapter oficial desactivado.
