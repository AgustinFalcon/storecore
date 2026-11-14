# Metadata — decisión de entrega en checkout

- Estado: `completed`
- Fecha: 2026-11-14
- Modo: brownfield, checkout real StoreCore
- Prioridad: P1 de paridad entre experiencia comercial y autoridad backend
- Base: `master@33f5ca987df932a2ba692a010e13f8d9f9c7818b`
- Autoridad: PR #272, merge `bfe34661a6d3cd1454a87e280397a3529bfb5abd`
- Validación: Verify PR `43551669169` y post-merge `43552311370`, 3/3 verdes

## Alcance

Permitir que el comprador elija retiro o entrega local desde opciones configuradas,
vea costo y plazo antes de pagar, y que backend persista y cobre exactamente esa
decisión. No integra todavía una tarifa ni etiqueta de Correo Argentino.

