# Meta — contrato de adaptador ARCA para StoreCore

- **Feature id:** `20260921-arca-storecore-adapter-contract`
- **Status:** `documented_deferred`
- **Maturity:** diseño contractual; no autoriza código, DDL, worker, credenciales, homologación ni emisión.
- **Related:** `20260921-arca-fiscal-discovery`, `20260921-single-tenant-installation-baseline` y el SDD externo `arca-facturacion-v1`.

## Boundary

StoreCore sigue siendo una instalación por comercio/VM/base/dominio. Este contrato no crea `store_id`, tenancy compartido, tablas de dominio fiscal ni integración activa en el core. Describe los requisitos que deberá cumplir un futuro adaptador consumidor de la biblioteca externa `arca-facturacion`.

## Sol review — 2026-09-21

**GO para documentación; NO-GO para implementación.** Riesgos que deben permanecer resueltos como gates: confundir pago aprobado con obligación de emitir; usar el modelo comercial mutable como snapshot fiscal; reintentar luego de una respuesta ARCA ambigua; y filtrar secretos o PII.

Revisión final: el contrato no presupone `store_id`, DDL, emisor fiscal, WSFEv1 ni trigger de emisión. D-01..D-07 y SC-01..SC-07 siguen siendo gates explícitos antes de abrir un WIP implementable.

## Gates

La implementación se habilita sólo después de D-01..D-07 y SC-01..SC-07, matriz fiscal validada por contador/titular, fuente actual de contrato Mercado Pago, manual/WSDL ARCA fechado y un GO explícito de Sol para las tareas concretas.
