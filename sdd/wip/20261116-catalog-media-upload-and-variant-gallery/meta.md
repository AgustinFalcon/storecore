# Catalog media upload and variant gallery

- Estado: `implementation_in_progress`
- Fecha: 2026-11-16
- Issue: #7
- Base: `master@1506027aadab43b860c661017d20f9543da6bbab`
  (merge PR #301; candidato final `ad077964f957a421178ea5a0703b8fe0980e0f1b`)
- Rama: `feat/catalog-media-draft-cleanup-20261118`
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

TASK-001/TASK-004 quedaron integradas por PR #298, TASK-002 por PR #299 con
Verify #800 5/5 y la primera mitad de TASK-003 por PR #300 con Verify #802 5/5.
PR #301 aporta composición CAS y el protocolo común de locks attach/delete/GC
para productos existentes. Este corte agrega expiración y barrido recuperable
de drafts cerrados mediante la cola V28; TASK-003 continúa en progreso por el
claim atómico de alta pendiente. No activa HTTP, decoder, Cloudinary ni
configuración productiva.
