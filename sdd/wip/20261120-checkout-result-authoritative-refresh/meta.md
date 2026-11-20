# Actualización autoritativa del resultado de checkout

- Estado: `implementation`
- Fecha: 2026-11-20
- Base: `master@878e17e5d745db53de0699ca1b0b62ca4a3e5ddf`
- Relación: `20261116-storefront-fulfillment-backlog-reconciliation`

## Objetivo

Permitir que CUSTOMER vuelva a consultar explícitamente una orden cuyo pago
sigue pendiente, sin interpretar el retorno del navegador como acreditación y
sin introducir polling, proveedor live ni efectos comerciales.
