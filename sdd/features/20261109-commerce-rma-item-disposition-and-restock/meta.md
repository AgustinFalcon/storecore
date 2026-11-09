# Commerce RMA item disposition and restock

- Feature: `20261109-commerce-rma-item-disposition-and-restock`
- Status: `completed`
- Base: `master 1408e18face4204e46cddb2af979da131ce97c0d`
- Backlog: `TODO-045`
- Owners: StoreCore core maintainers; aprobación independiente requerida.
- Spec review: doble GPT-6.1 Sol APPROVE, sin P0–P3.
- Final review: backend/security y frontend/product GPT-6.1 Sol APPROVE, sin P0–P3.
- Candidate CI: PR #233, head `fc80316552c5ec3d08e79bac5bdc85d367593810`, Verify `42666041072`, 3/3 jobs success.

## Specs afectadas

- Extiende: `sdd/features/20261006-commerce-closed-states-and-fulfillment-eligibility/`.
- Resuelve: `TODO-045`.
- No depreca contratos ni reactiva comandos legacy.

## Objetivo

Cerrar la inspección física de una devolución ya recibida mediante clasificación por cantidades y por ítem, reposición vendible únicamente de unidades aptas y auditoría durable, sin efectos parciales ni inferencias desde strings legacy.

## Alcance cerrado

- Se conserva una recepción completa y única por pedido.
- Un comando final clasifica cada `return_item` en `RESTOCK`, `DAMAGED` y `REJECTED`.
- Sólo `RESTOCK` incrementa stock vendible.
- Resultado inmutable, idempotente y recuperable después de pérdida de respuesta.
- UI USER administrativa con borrador local, revisión y confirmación explícita.

## Fuera de alcance

RMA parcial o múltiple, edición/compensación posterior, reembolso, nota de crédito/ARCA, outlet, publicación de segunda selección, carrier, credenciales externas, deploy y homologación.

## Relación

Extiende `sdd/features/20261006-commerce-closed-states-and-fulfillment-eligibility/` sin reabrir su aceptación. Los comandos legacy `INSPECTED/ADJUSTED` sin payload permanecen rechazados.
