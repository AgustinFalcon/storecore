# Catalog option schema PDP

- Estado: `completed`
- Fecha: 2026-11-16
- Issue: #10
- Base: `master@94d005a2f2d5ae6ef4433102ba511f6aba0eb317`
- Rama: `docs/storecore-option-schema-spec-20261116`
- Perfil: técnico
- Relación: nuevo contrato single-tenant; no reabre tenancy ni profiles.
- PR final: #284
- Head aprobado: `394e08fa1867faaafe18fd1772213fb362b7ee33`
- Merge en `master`: `edb769067d720fc8e9f80cf2a8b53c6b328b123b`
- CI pre-merge: `44156064449` (4/4 success)
- CI post-merge: `44157739605` (4/4 success)

## Objetivo

Renderizar opciones del PDP desde un schema de producto versionado y no desde
claves `talle/color` ni perfiles comerciales hardcodeados. Herramientas, ropa,
panadería y futuros rubros comparten el mismo motor de selección de variante.

## Gate final

Las catorce tareas quedaron completas. GPT-6.1 Astra y GPT-6.1 Sol aprobaron el
head exacto sin P0–P3; el PR #284 fue integrado en `master` y el CI pre-merge y
post-merge aprobó `repository-hygiene`, `backend`, `frontend` y
`unified-access-real-e2e`. El feature queda listo para archivo y cierre de #10.
