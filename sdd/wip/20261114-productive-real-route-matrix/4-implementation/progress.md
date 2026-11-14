# Progreso — matriz productiva real

## 2026-11-14

- PR #281 fusionado en `master` como `94d005a`; issue #136 cerrado.
- Verify del PR `43633877719` y post-merge `43634478351`: higiene,
  frontend, backend y E2E real verdes.
- Auditoría coordinada GPT-6.1 Sol producto/UX y técnica/seguridad: NO-GO para
  cerrar #106 con evidencia actual; GO para implementar por cortes.
- Confirmado el censo actual de 30 leaves, cuatro redirects y tres wildcards.
- Confirmado que #148 acredita `HTTP_FIXTURE` y no reemplaza backend real.
- Detectada deriva del loader PSD: checkout sin revisiones autoritativas y sin
  política manual V22 provisionada. El PSD no corre actualmente en Verify.
- Specs funcional/técnica y plan creados. Implementación pendiente de revisión
  de specs y luego Corte 1.
- Primera revisión producto/UX solicitó dos P2: hacer alcanzable la evidencia de
  fulfillment y aceptar el alta válida. Se separó el journey de proveedor local
  bajo `REAL_BACKEND_LOCAL_PROVIDER` y se agregó registro UI con login/readback.
- Cortes 1 y 2 implementados: contrato cerrado de evidencia, receipt validado,
  loader V22 idempotente y aislamiento Linux fail-closed sin proveedores externos.
- Corte 3 de lectura implementado: 30 leaves por 390/768/1440, cuatro redirects,
  tres wildcards, separación CUSTOMER/USER, Axe, reflow y observación HTTP real.
- Job `productive-routes-real-e2e` agregado con PostgreSQL 16, UID dedicado,
  firewall IPv4/IPv6, probes Node/JVM/Chromium y artefactos allowlist redactados.
- `check:psd-real` verde: 108 tests descubiertos; Playwright y Axe fijados sobre
  un único `playwright-core` 1.63.0. Runtime integral queda reservado al CI Linux.
- PRM-011/012/012A en implementación; después siguen gates completos, reviews
  exact-head y ciclo PR/CI/merge/post-merge.
- Matriz de acciones implementada con 17 journeys aislados: descubrimiento público
  por búsqueda/marca/categoría/oferta, registro, perfil,
  direcciones/ownership, favoritos, checkout/orden, fulfillment denegado,
  catálogo/stock, ofertas, promos, branding, contenido, importación, revocación,
  permisos/CSRF, externos deshabilitados y capabilities locales.
- Evidencia pública endurecida: actores, superficies, resultados y clases de
  acción son conjuntos cerrados; rechaza futuros, duplicados y SKUs `ROUTE-*`.
- Gates locales finales: `check:psd-real` descubre 126 casos; loader 79/79;
  frontend 1.480/1.480, arquitectura/lint/build verdes; backend 459/459 verde.
- El runtime de PRM-011/012 y la reclasificación LOCAL_PROVIDER de PRM-012A no
  se acreditan localmente: deben pasar los jobs Linux aislados del PR.
