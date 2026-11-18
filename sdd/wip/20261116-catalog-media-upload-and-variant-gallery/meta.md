# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@37560b8` (merge PR #299)
- Rama: `feat/catalog-media-commands-20261118`
- Perfil: técnico
- Relación: reemplaza únicamente el diseño media del antiguo WIP multi-tenant;
  no reabre tenancy ni agrega `store_id`.

## Objetivo

Permitir que un ADMIN cargue imágenes reales desde el editor de catálogo,
ordene la galería de un producto y asocie imágenes concretas a sus variantes,
sin exponer secretos del proveedor ni hacer que la UI persista URLs arbitrarias
como autoridad de media administrada.

## Gate actual

Las especificaciones y las 15 tareas están aprobadas: existe GO local para el
adapter determinista y la implementación en PR separado. No existe GO live para
Cloudinary, credenciales, deploy ni homologación externa hasta cerrar su gate.

TASK-001/TASK-004 quedaron integradas por PR #298 y TASK-002 por PR #299 con
Verify #800 5/5. El corte actual implementa la primera mitad de TASK-003:
registro/replay, leases/fencing, recuperación por `head` y borrado/GC durable
con tombstone reconciliable V28. No activa HTTP, decoder, Cloudinary ni
configuración productiva.
