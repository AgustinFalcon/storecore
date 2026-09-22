> **SUPERSEDED 2026-09-21:** ver sdd/wip/20260921-single-tenant-installation-baseline/. Histórico; no implementar.

# Functional Spec — store-tenancy-and-profiles

**Feature**: store-tenancy-and-profiles
**Date**: 2026-08-19
**Language**: es
**Status**: superseded — no autoriza código
**Revised**: 2026-08-19 (dual review: onboarding ops, admin host, RN-T10 defer)
**Supersedes**: `sdd/PROJECT.md` decision `multi_tenant: no en Fase 1` and “one deploy per client as the product model”

<!-- superseded_by: sdd/wip/20260921-single-tenant-installation-baseline/1-functional/spec.md -->

> **HISTÓRICO — NO IMPLEMENTAR.** Esta spec superseded no overridea nada vivo. El baseline vigente es `20260921-single-tenant-installation-baseline`. `sdd/specs/*` es legado 2026-05-15.

---

## Problem Statement

StoreCore quiere ser una plataforma para muchos emprendedores argentinos, cada uno con su tienda, su marca y su dominio. La documentación previa describía un producto de agencia (una VM por cliente) con lenguaje de SaaS. Eso no escala a 5–20 comercios y obliga a forkar el código o a inventar tablas distintas por rubro.

El problema de producto es: **un solo producto de software** debe servir a una tienda de ropa, una ferretería y una pastelería, sin convertirse en Mercado Libre (mall compartido) y sin un DDL distinto por cliente.

## Objectives

1. Novastra provisiona una tienda nueva (“qué vendo”) y el comerciante obtiene un dominio propio usable, no un path compartido tipo `/mall/luna`.
2. El mismo binario (backend + admin + storefront) atiende N tiendas.
3. Los datos de la tienda A nunca son visibles para la tienda B.
4. El rubro se expresa como **configuración** (perfil de catálogo + settings), no como esquema SQL nuevo.
5. Una tienda puede vender más de un tipo de producto más adelante sin un segundo deploy.

## Success Metrics

| Métrica | Objetivo MVP |
|---------|----------------|
| Onboarding de tienda nueva sin cambiar código | CLI/API ops Novastra + 0 migraciones Flyway extra; 0 wizard self-serve en el admin del merchant |
| Aislamiento | 0 lecturas cross-store en pruebas de autorización |
| Dominio | `www.marca.com.ar` y `admin.marca.com.ar` (o path `/admin` en el mismo host) resuelven a esa `store` |
| Rubros cubiertos por templates | `CLOTHING`, `HARDWARE`, `FOOD`, `GENERIC` |
| Settings usable el día del provision | logo, colores, MP y envíos editables sin redeploy (cargar SKUs = feature `admin-product-editor`) |

## User Stories

### US-1: Onboarding de rubro

**Como** operador Novastra / ADMIN fundador de una tienda nueva  
**Quiero** indicar qué vendo (ropa, herramientas, alimentos, genérico)  
**Para** que el catálogo, los selectores del PDP y los defaults de envío no asuman talle/color.

**Acceptance Criteria**

- AC-1. El provision (CLI/API) pide: nombre comercial, slug, `primary_host`, `admin_host` (nullable), perfil de catálogo y email del primer ADMIN. Fija `locale=es-AR`, zona horaria `America/Argentina/Buenos_Aires`, moneda `ARS`, `SELF_SHIP=true`, `PICKUP=false`, `CARRIER=false`, `shipping_mode_default=SELF_SHIP` y tarifas CABA/interior en `NULL` (= a coordinar).
- AC-2. Elegir `CLOTHING` pre-carga `option_schema` sugerido: eje `size` (S/M/L/XL) y eje `color` (lista editable, `ui: select` en este kernel; swatches → feature `catalog-option-schema`).
- AC-3. Elegir `HARDWARE` pre-carga ejes vacíos + una variante default por producto; sugiere facets `brand`, `voltage`, `diameter_mm` como definiciones opcionales, no columnas SQL.
- AC-4. Elegir `FOOD` pre-carga ejes `flavor` / `size` opcionales; no crea tablas de lote ni vencimiento.
- AC-5. Elegir `GENERIC` no impone ejes; el merchant arma `option_schema` por producto.
- AC-6. Completar el provision (CLI `storecore-admin provision` o `POST /api/v1/platform/stores`) crea la fila `stores` y el primer USER ADMIN. Imprime la contraseña una vez. No ejecuta `CREATE TABLE`. No escribe passwords en `.env`.

### US-2: Dominio propio, no mall compartido

**Como** comerciante  
**Quiero** que mis compradores entren a *mi* dominio  
**Para** no parecer un puesto dentro de StoreCore.com.

**Acceptance Criteria**

- AC-7. El provision recibe `primary_host` y `admin_host` como inputs, pero persiste una fila única `store_hosts(STOREFRONT)` y, en el camino feliz, una fila única `store_hosts(ADMIN)`. Si no se informa ADMIN, `/admin` es fallback SPA en el host STOREFRONT.
- AC-8. El storefront resuelve la tienda por `Host` (o header equivalente detrás de Nginx), nunca por un query `?storeId=` público.
- AC-9. Un comprador en el host A no puede ver productos del host B cambiando un id numérico (IDOR).
- AC-10. No existe un catálogo global tipo Mercado Libre en Fase 1.

### US-3: Pestaña Configuración

**Como** ADMIN de la tienda  
**Quiero** cambiar branding, envíos, perfil y políticas sin redeploy  
**Para** no depender de un `.env` para decisiones de negocio.

**Acceptance Criteria**

- AC-11. Existe Settings en el admin de esa tienda (host `admin.{apex}` por defecto, o `/admin` si no hay subdominio) con secciones: Identidad (contacto público y datos fiscales opcionales/informativos), Branding, Catálogo, Envíos, Pagos (MP), Políticas, SEO básico (title/description) y Dominio (solo lectura; lo opera Novastra). OPERATOR no edita Pagos ni Dominio.
- AC-12. Branding mínimo: logo, banner, color primario, color secundario, 3 bloques de home ordenables.
- AC-13. Envíos: flags `PICKUP`, `SELF_SHIP`, `CARRIER`; debe quedar habilitado al menos un modo y el modo por defecto debe estar habilitado. Tarifa CABA/interior `NULL` = “a coordinar”, `0` = gratis y valor positivo = tarifa plana; PICKUP no usa tarifa zonal. No hay API de Andreani.
- AC-14. Cambiar `catalog_profile` no borra productos existentes; solo cambia defaults para productos nuevos.
- AC-15. Secretos de infraestructura (JWT RSA, DB, `MP_ENCRYPTION_KEY`) viven en `.env`. Credenciales MP del comercio y su secreto webhook viven cifrados en `payment_configs`, editables desde Settings. GET nunca devuelve secreto, ciphertext ni callback key; en PUT un secreto omitido o vacío no cambia el valor y un valor nuevo reemplaza el ciphertext.

### US-4: Mismo código para todos

**Como** equipo StoreCore  
**Quiero** un solo repositorio y una sola imagen Docker  
**Para** no mantener forks por cliente.

**Acceptance Criteria**

- AC-16. No hay `if (client == "tía")` ni módulos compilados por vertical.
- AC-17. Las diferencias de UX de PDP salen de `option_schema` + `catalog_profile`, no de branches Git.
- AC-18. Flyway es global: las 20 tablas del diccionario V1, incluida `store_hosts`, existen para todas las tiendas; el aislamiento es de fila (`store_id`), no de DDL.

### US-5: Una tienda, varios tipos de producto

**Como** comerciante que vende remeras y también kits  
**Quiero** que un producto no esté atado para siempre al perfil de la tienda  
**Para** no abrir una segunda tienda.

**Acceptance Criteria**

- AC-19. `products.option_schema` puede diferir del default del perfil.
- AC-20. `products.kind` es `PHYSICAL` (default). `DIGITAL` / `SERVICE` quedan documentados, no implementados en checkout de envío.
- AC-21. No hay un segundo `store` automático. “Ser dos negocios” = dos hosts/tiendas, o un catálogo mixto en la misma tienda.

### US-6: Staff y comprador anclados a la tienda

**Como** sistema  
**Quiero** que JWT de USER y de CUSTOMER lleven `store_id`  
**Para** que un empleado de Luna no administre la ferretería.

**Acceptance Criteria**

- AC-22. Login staff usa el Host admin de esa tienda (`POST /api/v1/admin/auth/login` con email+password; `store_id` sale del Host, no del body). No hay login global ni “email+store slug” en MVP.
- AC-23. Register y login CUSTOMER toman `store_id` exclusivamente del Host storefront; password usa BCrypt. El mismo email puede existir en dos `stores` como dos filas, pero un registro duplicado dentro de la misma tienda se rechaza.
- AC-24. El intake webhook MP identifica la tienda por una `callbackKey` opaca asociada a su configuración de pago, nunca por Host. Un evento válido se persiste idempotentemente con su `store_id`; firma inválida devuelve 401, callback key desconocida 404 y duplicado ya persistido 200 sin efecto de negocio; un fallo previo al commit durable devuelve 5xx para retry. La correlación posterior exige que `external_reference` inmutable coincida con la tienda y la orden.

## Out of Scope

- Marketplace (varios vendedores, un solo checkout StoreCore.com).
- `CREATE TABLE` / schema-per-tenant / DB-per-tenant como modelo de producto (puede existir un deploy dedicado de emergencia, no es el camino feliz).
- Tablas dinámicas por onboarding.
- Temas tipo Shopify (CSS arbitrario, app store).
- Guest checkout, facturación electrónica o validación AFIP, APIs logísticas, WhatsApp Business, app nativa, cupones, reviews.
- Un Account de plataforma que una al mismo humano como comprador en 50 tiendas (Fase posterior).
- Multi-región / sharding.

## Business Rules

| ID | Regla |
|----|-------|
| RN-T01 | Toda tabla de negocio excepto catálogos de sistema lleva `store_id NOT NULL`. Uniques compuestos: `(store_id, slug)` categorías/productos, `(store_id, sku)`, `(store_id, email)` en `users` y `customers`, `(store_id, order_number)`, `(store_id, session_id)` carritos. |
| RN-T02 | El `Host` HTTP determina `store_id` para storefront. Requests sin host mapeado → 404 de tienda, no la tienda “default”. |
| RN-T03 | Perfil de catálogo es un **template de configuración**, no un tipo de base de datos. |
| RN-T04 | JSONB `attributes` en variantes = dimensiones vendibles (talle, voltaje, sabor). Prohibido meter mensaje de torta, lote, o alérgenos como si fueran SKU. |
| RN-T05 | `.env` no contiene `CATALOG_PROFILE` ni colores. Eso es Settings. |
| RN-T06 | Un deploy puede hospedar N tiendas. Un deploy dedicado con una sola fila `stores` sigue siendo válido (la fila tiene `store_id=1`). |
| RN-T07 | IDOR: todo `Load*Port` filtra por `store_id` del contexto. Tests de autorización son gate del módulo. |
| RN-T08 | Imágenes de **branding** (logo/banner/favicon): proxy Cloudinary; URL en `stores.*_url`. Grid de producto / `product_images` / `variant.image_id` → `TODO-002`. Actualiza RN-13 del spec de sistema. |
| RN-T09 | Carrito: PostgreSQL + TTL. Redis no es source of truth del carrito. |
| RN-T10 | Reserva de stock al crear preference MP, no al agregar al carrito. TTL diferenciado ticket vs tarjeta **no** se cierra en este feature (`TODO-006`); V1 no debe copiar un job de 30 min para todos los medios. |
| RN-T11 | El intake webhook persiste una inbox durable por `callbackKey` y firma antes del insert. Consultar MP, parsear `external_reference`, mutar pedido/pago/stock y reintentar corresponde exclusivamente a `TODO-006`. |

## Scope of previous gaps (how they fit)

| Gap de la review | Encaje en esta idea |
|------------------|---------------------|
| Foto por color / carousel | `product_images` + `variant.image_id` opcional; settings no alcanza, es catálogo. Feature hija `media-upload`. |
| Swatches | Template CLOTHING precarga ejes `size`/`color` (`ui: select`). `ui: swatch` + PDP → `catalog-option-schema`. |
| Envío propio vs delegado | Settings → modos `PICKUP/SELF_SHIP/CARRIER`. Feature hija de fulfillment. |
| Guest checkout | Sigue Fase 2; el tenant no lo bloquea. |
| Angular 15 vs 22 | Decisión de implementación, no de tenancy. |
| Dual JWT paths | Prefijos `/api/v1/admin` y `/api/v1/store` + claim `store_id`. |
| ORDER vs SHIPMENT | Independiente; se documenta en backlog, no se mezcla en este feature más que `store_id` en ambas tablas. |
| Precio / oferta comercial | Fuera de código; PRD Knowledge. |
| Git deny-by-default | Allowlist de `sdd/` para que este spec exista en git. |

## User Experience

1. Novastra crea la tienda con CLI/API (US-1). Self-serve wizard = fase posterior.
2. DNS del dominio del cliente → Nginx MAIN → StoreCore.
3. ADMIN entra a settings, sube logo, activa retiro en local.
4. Carga productos (feature hija `admin-product-editor`); si es ropa el template ya dejó ejes talle/color para productos nuevos.
5. Comprador abre `www.marca.com.ar`, nunca ve “Powered by un mall”.

## Data requirements (product)

Campos nuevos respecto a `docs/04-MODELO-DATOS-MVP.md`:

- `stores.public_id` inmutable y `catalog_profile`; `store_hosts` como único ownership de hosts; theme (2 colores + `homepage_sections`), `pickup_enabled`, políticas TEXT, `locale`, `timezone`, `currency`, defaults explícitos de envío y SEO/contacto informativo
- `store_id` en aggregates
- `products.option_schema`, `products.kind`
- `product_variants.weight_grams`, `barcode` nullable
- `customers.document_type/number` nullable
- `orders.fulfillment_method`

## Dependencies (capabilities)

- Persistencia relacional con uniques compuestos
- Resolución de tenant por hostname
- Cifrado y ruteo opaco de secretos/webhooks de pago por tienda
- Upload de media (URL persistida)
- Autenticación dual USER/CUSTOMER con claim de tienda
- Pagos Checkout Pro ya especificados en docs/05 (no se reabren aquí)

Concrete services (Postgres, Nginx, Cloudinary, Mercado Pago) se confirman en la spec técnica.

## Risks

| Riesgo | Mitigación |
|--------|------------|
| Fuga cross-tenant | `TenantContext` + `storeId` en puertos; tests IDOR; sin query sin filtro |
| “Multi-tenant” mal hecho = un bug filtra pedidos ajenos | Peor que VM dedicada. Gate de seguridad antes de segundo cliente real |
| Dominio custom + SSL a mano | Runbook Novastra; no self-serve DNS en MVP |
| Perfil CLOTHING se filtra al storefront genérico | PDP lee `option_schema` del producto, no ifs de rubro |

## Edge Cases

- Host desconocido → 404 tienda.
- Merchant cambia perfil ropa → herramientas: productos viejos conservan su `option_schema`.
- Dos tiendas, mismo email de comprador: sesiones y pedidos no se mezclan.
- Webhook MP llega con o sin Host: se ignora Host y se resuelve la inbox por `callbackKey` opaca. `TODO-006`, tras consultar MP con la credencial de esa tienda, valida `external_reference = sc1:{store.public_id}:{order_number}` antes de cualquier mutación.

## E2E Scenarios

Omitido (`project_type: mvp`, `ltp.enabled: false`).

## Spec Reference Annotations

Extiende `sdd/specs/functional-spec.md` (actores USER/CUSTOMER, CUs de catálogo/checkout).  
Overrides la decisión de sistema “multi_tenant no en Fase 1”.
