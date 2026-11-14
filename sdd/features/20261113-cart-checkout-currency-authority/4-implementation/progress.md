# Evidencia de implementación

## Baseline observada

- Backend `CartView` y `checkout` usan `String`; orden y pago escriben `'ARS'`.
- Frontend `Cart`, command y state usan `string`.
- `CartStore.setCurrency` transforma cualquier valor no ARS en ARS.
- `load` ignora la moneda del backend y vuelve a ARS.
- La vista usa `cart.currency || 'ARS'` y muestra un input editable.

## Implementación cerrada localmente

- Backend: `CartView` y checkout usan `PaymentCurrency`; el controller traduce
  el wire una vez y la instalación es la única autoridad de moneda.
- Un valor ausente, legado o inválido se representa como `UNKNOWN` y el checkout
  falla antes de reservar stock, crear órdenes o iniciar pagos.
- Replay traduce nuevamente la evidencia persistida y rechaza snapshots con una
  moneda fuera del conjunto cerrado.
- Frontend: `CartCurrency` encapsula wire, etiqueta y capacidad de checkout. El
  mapper es el único traductor y el repository serializa sólo `.wire`.
- Se eliminó el input editable y todo fallback visual a ARS.
- `UNSUPPORTED_CURRENCY` activa una revocación durable, conserva la idempotency
  key y bloquea nuevos submits. Respuestas anteriores, errores de recuperación y
  mutaciones del carrito no pueden restaurar ARS; sólo un GET ARS fresco vigente.

## Hallazgos resueltos durante la revisión

1. Un GET o `addLine` iniciado antes del rechazo podía responder después y
   restaurar ARS. Se agregó una generación de requests que descarta respuestas
   obsoletas.
2. Un error posterior podía reemplazar el tipo de fallo y permitir que
   `addLine` restaurara ARS. Se separó un latch de revocación independiente del
   estado visual del error.

Ambos revisores GPT-6.1 Sol contrastaron la corrección y emitieron GO final sin
P0–P3 pendientes.

## Gates locales

- Backend completo: `mvn -B clean test` — 407 tests, 0 fallos, 0 errores,
  0 omitidos; `BUILD SUCCESS` en 7:10.
- Backend focal: commerce 21/21 y MP Orders checkout 28/28.
- Frontend completo: `npm run verify` — arquitectura 9/9, lint verde,
  187 archivos y 1229 tests verdes, build de producción verde.
- `git diff --check`: limpio.

## Estado

CCA-001 a CCA-007 cerradas.

- PR: `#259`, fusionado en `master` el 2026-11-13.
- Merge commit: `653b5ebc96fa6f9bebd32d969177bc3e5c621f2e`.
- CI del PR: backend, frontend y `unified-access-real-e2e` verdes. El primer
  frontend tuvo un fallo intermitente en un E2E preexistente de alta de catálogo
  (88/89); el rerun sin cambios pasó completo.
- CI post-merge: run `43481720083` verde sobre el SHA de merge; backend 3:31,
  frontend 4:43 y E2E real 6:06.
