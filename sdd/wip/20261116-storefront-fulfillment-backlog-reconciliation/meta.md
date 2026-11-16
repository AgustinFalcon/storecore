# Reconciliación Storefront y Fulfillment

- Estado: `spec_review`
- Fecha: 2026-11-16
- Issues: #8 y #13
- Base apilada: PR #282, head `067921e13a316e2a6d72c1636f8f93fa131740dc`
- Rama: `docs/storecore-sdd-reconcile-20261116`
- Perfil: documental brownfield

## Objetivo

Reconciliar los criterios históricos de storefront y fulfillment con el dominio
que realmente está implementado y probado. Este corte no agrega runtime, no
reabre guest cart ni activa proveedores externos.

## Gate

El PR debe permanecer apilado sobre #282 hasta que ese PR llegue a `master`.
Después se retargetea/rebasa, se repiten CI y reviews exact-head y recién entonces
puede integrar esta reconciliación. Ningún issue se cierra sólo por este spec.
