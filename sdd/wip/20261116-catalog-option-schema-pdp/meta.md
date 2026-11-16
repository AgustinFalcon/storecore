# Catalog option schema PDP

- Estado: `tasks_approved`
- Fecha: 2026-11-16
- Issue: #10
- Base: `master@94d005a2f2d5ae6ef4433102ba511f6aba0eb317`
- Rama: `docs/storecore-option-schema-spec-20261116`
- Perfil: técnico
- Relación: nuevo contrato single-tenant; no reabre tenancy ni profiles.

## Objetivo

Renderizar opciones del PDP desde un schema de producto versionado y no desde
claves `talle/color` ni perfiles comerciales hardcodeados. Herramientas, ropa,
panadería y futuros rubros comparten el mismo motor de selección de variante.

## Gate actual

Especificaciones aprobadas por Product/UX y Security sin P0–P3. Plan de catorce
tareas aprobado por instrucción de continuidad total del owner. La implementación
se habilita en PR separado; #10 no se declara resuelto hasta código, CI y post-merge.
