# Corte — transiciones desconocidas fail-closed

- Feature ID: `20261001-unknown-transitions-fail-closed`.
- Estado: implementación local, revisión estática realizada; validación ejecutable pendiente; WIP abierto.
- Base: integración `a8874ad0466d9c26b982aba36368ab6f20018be8`.
- Fuente: hallazgo en `frontend/src/app/domain/order/shipment-status.ts` y `rma-status.ts`: `Unknown.next` exponía `Packed` y `Received` respectivamente.
- Lenguaje: es. Sin fuentes sensibles ni datos de runtime.

## Contrato y aceptación

`ShipmentStatus.Unknown.next` y `RmaStatus.Unknown.next` son `null`. El traductor mantiene el caso cerrado `Unknown` para wire no reconocido; su etiqueta fija no refleja el texto crudo. Los helpers y las dos vistas de fulfillment no ofrecen la acción correspondiente a un estado desconocido. Las transiciones reconocidas y la ausencia opcional de RMA conservan su comportamiento existente.

## Plan mínimo

1. Reemplazar únicamente las transiciones de los dos casos `Unknown` por `null`.
2. Cubrir wire desconocido/vacío en el dominio y la delegación de helpers; corregir la expectativa de acciones desconocidas en tabla y detalle.
3. Ejecutar tests enfocados, compilación TypeScript y build disponibles; registrar resultados reales aquí.

## Alcance y gates

Sin cambios de navegación, capabilities, Mercado Libre, dependencias, backend, live, release ni `sdd.finish`. No cambia la autorización del servidor: ocultar UI no sustituye validación backend. No se declara review Grok, merge ni CI alojado.

## Validación

- `git diff --check`: PASS, sin errores de whitespace (Git informa conversión LF → CRLF).
- Revisión estática: traducción wire → tipo cerrado → helpers → `@if(next)` en tabla y detalle; `Unknown` sin transición, etiquetas fijas y sin cambio de contratos externos.
- Arquitectura y lint: PASS mediante `npm run verify` antes de que el runner llegara a tests.
- TypeScript: PASS mediante `npx tsc --noEmit -p tsconfig.spec.json`.
- Build: PASS mediante `npm run build`.
- Tests enfocados: BLOCKED; el runner Angular falla antes de assertions al resolver rutas absolutas por ACL del workspace Windows. Suites preparadas: `shipment-status.spec.ts`, `rma-status.spec.ts`, `fulfillment-transition.spec.ts`, `fulfillment.view.spec.ts`, `user-order-detail.view.spec.ts`.
- Falcon Bugbot/Security: INCOMPLETE por validación ejecutable pendiente; inspección local del diff sin hallazgos adicionales en el alcance, sin equivalencia a gates Grok ni CI. Estándar Angular aplicado a la arquitectura existente con ComponentStore, sin migración de estado.
