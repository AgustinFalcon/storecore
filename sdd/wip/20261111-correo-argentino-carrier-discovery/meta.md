# Meta — Correo Argentino carrier discovery

- **Feature id:** `20261111-correo-argentino-carrier-discovery`
- **Status:** `documented_deferred`
- **Maturity:** discovery y contrato; no autoriza adapter, DDL, credenciales,
  homologación, activación ni producción.
- **Baseline:** `storecore-core-v1.0.0`, instalación single-tenant por
  merchant/VM/base/dominio.
- **Backlog:** `TODO-038`.

## Objetivo

Cerrar con evidencia oficial qué producto y contrato de Correo Argentino debe
usar StoreCore para cotizar, presentar opciones, crear o importar envíos,
obtener rótulos, consultar tracking y cancelar una preimposición. El resultado
debe permitir abrir un WIP implementable posterior sin confundir fulfillment
manual, una simulación visual o un evento postal con aceptación/homologación del
carrier.

## Gate de entrada

No existe tarea de código ejecutable hasta que Correo Argentino y el titular
confirmen por escrito el producto/API aplicable, ambientes, versión contractual,
credenciales de prueba por referencia, servicios habilitados y reglas de
facturación/admisión. Las decisiones `CA-D01..CA-D10` y
`CA-SC01..CA-SC10` deben cerrar diseño, ownership y plan de aceptación antes
del código; la evidencia ejecutada se produce después en implementación y QA.
Dos reviews GPT-6.1 Sol deben dar GO sobre el WIP implementable.

## Límites

- No guardar API keys, passwords, JWT, agreement/customer ids reales, etiquetas,
  direcciones, teléfonos, emails ni tracking reales en Git, fixtures o logs.
- No prometer ubicación GPS, ETA en tiempo real, webhook, prueba de entrega,
  cobertura, idempotencia o devolución si el contrato oficial habilitado no lo
  documenta y no fue probado en homologación.
- `CARRIERS` permanece `DISABLED`; fulfillment manual existente no se
  reinterpreta como carrier homologado.
- No introduce `store_id`, shared runtime ni acceso cruzado a bases.

## Resultado de discovery — 2026-11-11

La documentación pública confirma dos superficies diferentes: MiCorreo y
PAQ.AR API 2.0. Sus capacidades, autenticación y límites no son equivalentes.
La selección es una decisión comercial/técnica bloqueante; por eso el resultado
actual es **GO para documentar y solicitar onboarding; NO-GO para implementar**.
