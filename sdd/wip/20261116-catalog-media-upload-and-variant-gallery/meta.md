# Catalog media upload and variant gallery

- Estado: `spec_review`
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

Este corte contiene especificación funcional y técnica para revisión. No concede
GO de implementación, no activa Cloudinary y no acredita credenciales, deploy u
homologación externa.
