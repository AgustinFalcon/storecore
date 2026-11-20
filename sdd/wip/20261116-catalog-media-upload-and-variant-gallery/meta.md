# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@df13f2dda89440a77bd7bcec7b48f1b1c139fe25`
  (merge PR #316; candidato final `be7b822581aff1f7c26463c938e6eef35fe81c02`)
- Rama: `feat/media-normalize-003b4b2-20261120`
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

MEDIA-NORMALIZE-003B-1/2/3 y `003B-4A` están integrados. PR #316 cierra
`003B-4B-1` (codec/transporte/snapshot sin privilegios). Siguen abiertos
`003B-4B-2` journal/CAS/budgets, `003B-4B-3` daemon/mounts, `003B-4B-4`
adapter backend, `003B-4C` y por tanto `003B-4`, TASK-005 y #7. Cada subcorte
exige sus gates propios. El workspace privado de 4A permanece incompatible
con el UID dedicado y no habilita `Ready`.

No existe GO live para Cloudinary, credenciales, HTTP upload, deploy ni
homologación externa hasta cerrar sus gates separados.
