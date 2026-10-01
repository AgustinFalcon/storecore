# Carriles de homologación StoreCore vs companion

Issue [#106](https://github.com/AgustinFalcon/storecore/issues/106).

## Promoción

El paquete presentable a `master` es **solo** el comercio web. La evidencia SDD de venta física / POS companion vive en `integration/storecore-int` y **no se promociona a `master`**. El módulo de integración POS existe en schema como `DISABLED`; la consola de homologación no lo lista ni lo cambia.

## Carril A — dossier de homologación del core

Paquete presentable: `master` (o una promoción posterior **solo** del comercio web). Alcance: las 22 rutas existentes contra el API real, cookie + proxy. No se reclama mostrador, companion live, fiscal, MP-LIVE-05 ni dispatcher ML.

## Carril B — evidencia SDD del companion

Sigue en `integration/storecore-int` y en el repo companion: POSC, DSP, loopback, issues, reviews. **No se borra.** No entra al dossier A ni a `master`. Un loopback efímero posterior es otro issue, fail-closed, sin browser StoreCore, en una rama aparte de este walk.

Borrar el registro del carril B no limpia la homologación: la limpia el **alcance** del dossier A y el módulo de POS companion apagado.

La base local `storecore-postgres` puede tener checksums Flyway viejos (V4/V5). El walk FE↔BE usa un Postgres 16 efímero (`storecore-homolog-pg` en `:5434`), no `flyway repair` sobre el volumen sucio. `storecore-postgres` se deja parado para no perder datos viejos. No se arranca el Postgres del companion.

Flyway no inserta `installation_settings`: el guard exige exactamente una fila `installation_id=1` (provisioning, no migración). En el walk local: `INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Homologacion local', 'localhost', 'ARS')`. El primer USER ADMIN sigue siendo `bootstrap-admin` por TTY; no hay alta HTTP de USER. Si el proceso no tiene `System.console` (p. ej. `spring-boot:run` desde el IDE), el walk local inserta el ADMIN con el mismo `Argon2PasswordHasher` que los tests. La contraseña no entra al repo.

## Walk local Carril A (demo comercio web)

Postgres: `storecore-homolog-pg` en `:5434`. Backend: `http://localhost:8080`. Frontend: `http://localhost:4200` con `proxy.conf.json` `/api` → `:8080`. Cookies `__Host-storecore-customer` / `__Host-storecore-internal` + `X-CSRF-Token`.

Módulos **ACTIVE** para el walk: `STOREFRONT`, `CATALOG`, `PROFILE_CONTENT`, `PAYMENTS_MP`, `MANUAL_FULFILLMENT`, `MANUAL_PROMOTIONS`. Catálogo genérico (sin cliente, dominio, SKU ni precio de un comercio real). CUSTOMER se da de alta por `/customer/register`.

Módulos que **quedan DISABLED**: `MARKETPLACE_ML`, el módulo POS companion, y todos los `future_optional` (`ML_COMPETITION_INSIGHTS`, `ML_PRICE_AUTOMATION`, `ML_PROMOTION_ORCHESTRATOR`, `CARRIERS`, `FAVORITES`, `LOYALTY`, etc.). El trigger de V1 impide activar los `future_optional`.

`PAYMENTS_MP=ACTIVE` solo habilita el claim de checkout web. El adapter sigue `unconfigured`, hosts vacíos y sin secretos: no hay cobro ni MP-LIVE-05. La pantalla Mercado Libre del walk muestra el deny de `MARKETPLACE_ML` READ; no se inventan listings.

## APIs posteriores — inventario, no implementación

Estas integraciones se homologan **después**. Carril A no las prende ni las finge.

| Capacidad | Qué ya existe | Qué falta / gate |
|---|---|---|
| Mercado Libre live (publicar, stock deseado, venta que descuenta) | Contrato + inbox + proyección DSP (V16–V19). Adapter oficial no configurado. `channel_accounts` / listings / outbox `STOCK_DESIRED_CHANGED` locales. | Cuenta autorizada por instalación, dispatcher HTTP oficial, `MARKETPLACE_ML=ACTIVE` con Sol GO. Sin scraping. El descuento de stock ML no se demo en Carril A. |
| Precios de competidores | Módulo `ML_COMPETITION_INSIGHTS` `future_optional`. TODO-030. | Solo señales **oficiales o licenciadas**, read-only, con fuente/fecha/confianza. Rechaza top-5 inventado y scraping. |
| Precio modular / automatizado | `channel_price_policies.writer_kind='MANUAL'` hoy. `ML_PRICE_AUTOMATION` `future_optional`. TODO-031. | API oficial; opt-in por listing; min/max/margen/cooldown; auditoría; kill switch; exclusión mutua con writer local. |
| Promos ML | `ML_PROMOTION_ORCHESTRATOR` `future_optional`. TODO-032. | Oferta oficial, eligibility/preflight, aprobación humana. |
| Mercado Pago live | MP-LIVE-01–04 fail-closed. Checkout puede devolver URL allowlisted. | MP-LIVE-05: sandbox + secretos de instalación + Sol GO. No en el dossier A. |
| Correo Argentino / carriers | `CARRIERS` `future_optional`. TODO-038. Fulfillment del walk es `MANUAL_FULFILLMENT`. | Adapter oficial del carrier, sin hardcodear un operador. |
| Facturación / ARCA | TODO-020 `documented_deferred`. WIPs discovery/adapter. | Biblioteca externa + D-01..D-07 + Sol GO. Sin DDL ni emisión en StoreCore ahora. |
| Venta física / POS companion | Contrato POSC + repo companion. | Carril B en `integration/storecore-int`. Nunca `master`. Módulo `DISABLED` en el walk A. |

Investigable ahora: el core **ya modela** listing→SKU, stock deseado, políticas de precio MANUAL y capabilities futuras. No se puede “ver Meli descontar stock” ni “bajar precio frente a competidores” hasta homologar las APIs oficiales y activar esos módulos.

## Evidencia local del walk (2026-09-30)

`storecore-homolog-pg` + API `:8080` + Angular `:4200` + proxy `/api`. Recorrido browser: home/catálogo/producto, alta CUSTOMER, dirección, carrito, checkout (orden `PENDING_PAYMENT`, pago `PENDING`, sin URL MP), órdenes, consola USER (contenido, catálogo, ofertas, fulfillment, inventario WEB 3 SKU / 1 reservado, capabilities, profile-import). `/user/mercadolibre` responde deny (`MARKETPLACE_ML` DISABLED). El módulo POS companion permanece `DISABLED` y fuera de la consola. La consola muestra etiquetas de comercio (Vitrina, Mercado Libre, …), no el código interno del módulo companion. Home hero y una oferta PERCENT 10% sobre `SC-HAMMER-16` se sembraron en el walk local. No es CI verde ni autorización de `master`.
