# PR #189 — regresiones de fulfillment modular

Base: `e50b476`. Validación local: 2026-10-20.

## Correcciones

- El envío modular pendiente se traduce al caso cerrado `DemoFulfillmentPhase.Pending`. Inbox puede materializarlo y restaurarlo antes de resolver el pago. Sólo se promueve a `Preparing` con orden `Paid`, pago `Approved` y envío `Preparing`. Un `Unknown` persistido no se convierte en una entrega operable.
- El retiro conserva el destino congelado por checkout como sucursal y ubicación iniciales. El contrato actual congela una sola descripción; no contiene horarios separados. Por eso no se inventan horarios ni se reemplaza la descripción por la sucursal Centro. Cambiar después la ubicación del catálogo no modifica el pedido.
- Configuración, acciones e incidencias usan la misma elegibilidad de escritura. Fase, incidencia o última acción `Unknown` bloquean cada comando; la vista consulta la misma política para habilitar configuración. Decodificar un valor futuro conserva el cierre y los comandos rechazados no alteran datos, historial ni revisión.

## Evidencia ejecutada

- Focal `demo-fulfillment.spec.ts`: 16/16 tests PASS. Cubre checkout modular de ambas modalidades con pago pendiente, inbox, restore, aprobación, rechazo/cancelación, repetición de acciones, destino congelado y comandos con estados desconocidos.
- Suite Angular completa: 85/85 archivos, 379/379 tests PASS.
- TypeScript `tsconfig.demo.json` y `tsconfig.spec.json`, sin emisión: PASS.
- ESLint y arquitectura (6 tests + scan): PASS.
- Build demo y productivo: PASS.
- Playwright `fulfillment.spec.ts`: 7/7 PASS. Envío y retiro con reload, incidentes, inbox, aislamiento y axe a 390/768/1440; los contratos modulares se ejercitan en los tests focales, pues la composición demo de browser todavía usa la fachada heredada.

## Límites

Evidencia local; no acredita CI alojado, review final independiente, homologación ni cierre global del WIP. Sin push, merge, despliegue ni integraciones externas.
