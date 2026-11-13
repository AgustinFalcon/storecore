---
id: 20261113-storecore-java21-runtime-baseline
title: StoreCore Java 21 runtime baseline
status: pr_verified
maturity: implementation
owner: platform
created: 2026-11-13
related:
  - ../20261113-storecore-arca-library-readiness
  - ../20260921-arca-storecore-adapter-contract
---

# Metadatos

Este corte eleva el baseline de compilación, CI y verificación E2E de StoreCore
de Java 17 a Java 21. Es un prerrequisito de plataforma independiente: no añade
la biblioteca ARCA, no implementa el adapter fiscal y no cierra ninguna decisión
fiscal, credencial, homologación ni activación productiva.

El cambio mantiene intactos el dominio, los estados cerrados, el esquema de
base de datos y las APIs. La evidencia exigida incluye una compilación limpia
con JDK 21 y el workflow completo de GitHub sobre la misma versión. La prueba
local y dos revisiones independientes están completas; quedan pendientes el CI
post-merge. El CI del PR aprobó los tres jobs obligatorios.
