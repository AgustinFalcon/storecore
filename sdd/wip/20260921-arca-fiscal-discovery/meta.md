# Meta — ARCA fiscal discovery

- **Feature id:** `20260921-arca-fiscal-discovery`
- **Status:** `documented_deferred`
- **Maturity:** discovery; no autoriza código, homologación, emisión ni producción.
- **Related baseline:** `20260921-single-tenant-installation-baseline`.

## Objective

Reunir evidencia y decisiones verificables para un adapter fiscal externo conforme para una instalación StoreCore por merchant/emisor. La instalación no usa `store_id`, shared tenancy ni Host routing. El adapter no habilita ocultamiento de ventas, evasión, doble registración ni bypass de controles.

## Precedence and sensitivity

Prevalecen normativa/manuales ARCA vigentes, contrato de titular/contador y `sdd/STATUS.md`. No guardar certificados, claves, CUIT reales, tokens, hosts internos ni datos de compradores; sólo referencias opacas/redactadas.

## Entry gate

No hay plan de implementación hasta matriz fiscal validada por titular/contador, servicio ARCA seleccionado por evidencia, política de emisión/rectificación aprobada y Sol GO.

## Sol review — 2026-09-21

**GO para documentar el contrato del adaptador; NO-GO para implementar.** El core fiscal reutilizable queda externo y no puede conocer `store_id`, pedido, pago, Spring ni Mercado Pago. La implementación permanece bloqueada hasta cerrar D-01..D-07 y la matriz fiscal del emisor.
