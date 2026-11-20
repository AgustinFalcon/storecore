# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@d824e0751010a5f3a5f7e3522329832f02018bd6`
  (merge PR #313; candidato final `649f11242b47eca59ef28b9d87febfa85f3acab3`)
- Rama: `docs/media-normalize-cross-uid-adr-20261120`
- Perfil: técnico
- Relación: reemplaza únicamente el diseño media del antiguo WIP multi-tenant;
  no reabre tenancy ni agrega `store_id`.

## Objetivo

Permitir que un ADMIN cargue imágenes reales desde el editor de catálogo,
ordene la galería de un producto y asocie imágenes concretas a sus variantes,
sin exponer secretos del proveedor ni hacer que la UI persista URLs arbitrarias
como autoridad de media administrada.

## Gate actual

Las especificaciones y las 15 tareas siguen vigentes. TASK-001/002/004 están
integradas; TASK-003 continúa abierto aunque el claim atómico MEDIA-CREATE y los
subcortes durables previos ya fueron entregados. No se reimplementan.

MEDIA-NORMALIZE-003B-1/2/3 están integrados. PR #313 entrega únicamente
`003B-4A`: factory/lifecycle fail-closed y retención insegura, sin capacidad
productiva porque el workspace privado no cruza al UID dedicado. El diseño
corregido separa `003B-4B` (broker/handoff/quota/restart) y `003B-4C` (harness
Linux real); ambos permanecen pendientes y requieren sus gates propios antes de
que `003B-4`, TASK-005 o #7 puedan cerrarse.

No existe GO live para Cloudinary, credenciales, HTTP upload, deploy ni
homologación externa hasta cerrar sus gates separados.
