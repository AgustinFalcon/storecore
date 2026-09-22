# Especificación funcional — Discovery fiscal ARCA

**Status:** `documented_deferred` · **Fecha:** 2026-09-21

## Problema

Un pago no equivale a comprobante fiscal. Este discovery define evidencia y decisiones para un adapter externo que emite exclusivamente conforme a la política aprobada del merchant/emisor de una instalación single-tenant.

## Alcance

1. Separar core fiscal reusable de adapter StoreCore sin Spring/JPA/MP ni `store_id`.
2. Obtener matriz validada por titular/contador: emisor, punto de venta, régimen, comprobantes, receptor, IVA, moneda, concepto, trigger y rectificativos.
3. Elegir servicio ARCA desde esa matriz y manual/version vigente.
4. Definir intención idempotente, autorización, contingencia, entrega y NC/ND auditables.
5. Reconciliar pago verificado con intención fiscal; back URL/browser no autorizan emisión.

## No alcance y compliance

No emitir, homologar, desplegar ni cargar secretos. No inferir WS, tipo de comprobante, fecha de emisión o régimen. No implementar ventas ocultas, importes alternativos, evasión, doble libro ni bypass fiscal.

## Decisiones bloqueantes

- D-01 límite core fiscal/adapter StoreCore.
- D-02 identidad del emisor de la instalación, puntos de venta y vigencia.
- D-03 matriz fiscal validada por contador/titular.
- D-04 servicio ARCA/manual/WSDL/version.
- D-05 trigger elegible y entrega.
- D-06 NC/ND, refund, chargeback y asociaciones.
- D-07 contrato MP vigente, idempotencia y correlación.

## Criterios

- AC-01: cada decisión tiene fuente, fecha, responsable y evidencia redactada.
- AC-02: pago verificado e intención fiscal son estados separados.
- AC-03: credenciales fiscales están aisladas de pagos y nunca aparecen en logs/GET/fixtures.
- AC-04: autorización, timeout, correlatividad, rectificativo y auditoría son verificables.

Sol debe dar GO antes de cualquier DDL o tarea de implementación.
