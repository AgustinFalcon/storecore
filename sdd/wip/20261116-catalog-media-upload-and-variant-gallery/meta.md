# Catalog media upload and variant gallery

- Estado: `tasks_approved`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@94d005a2f2d5ae6ef4433102ba511f6aba0eb317`
- Rama: `docs/storecore-media-upload-spec-20261116`
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
