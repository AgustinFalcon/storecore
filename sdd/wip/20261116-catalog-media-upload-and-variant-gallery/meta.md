# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@b95913ce19e2ebbe344a1012a309284debb02a5c`
- Rama: `feat/catalog-media-schema-20261118`
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

El primer corte TASK-001/TASK-004 quedó integrado por PR #298. El segundo corte
implementa TASK-002 y activa exclusivamente persistencia/compatibilidad V27;
no activa HTTP, decoder, Cloudinary ni configuración productiva.
