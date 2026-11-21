# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@e0fef1054f8629b8b51a6fd03e5a47b6726d36ab`
  (merge PR #315; candidato final `104a6dc6e658a3cd1b91a7d9bccdee6549e0ad08`)
- Rama: `feat/media-isolation-broker-contract-20261120`
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

MEDIA-NORMALIZE-003B-1/2/3 y `003B-4A`/`003B-4B-1`/`003B-4B-2` están
integrados. PR #320 arranca `003B-4B-3` (`FakeSystemd`, no PID 1). PR #326
arranca `003B-4B-4` (head `7afcbfa`, merge `2994043`, Verify `44940481556`
6/6, dos Grok 4.7 APPROVED) con adapter stdio y capability bloqueada; no
devuelve `Ready` ni cierra el agregado. Siguen abiertos `003B-4B-3`,
`003B-4B-4`, `003B-4C` y el agregado `003B-4B`. Esos gates propios deben
cerrarse antes de que `003B-4`, TASK-005 o #7 puedan cerrarse.

No existe GO live para Cloudinary, credenciales, HTTP upload, deploy ni
homologación externa hasta cerrar sus gates separados.
