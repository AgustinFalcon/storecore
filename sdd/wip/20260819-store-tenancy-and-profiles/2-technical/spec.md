> **SUPERSEDED 2026-09-21:** ver sdd/wip/20260921-single-tenant-installation-baseline/. Histórico; no implementar.

# Technical Spec — store-tenancy-and-profiles

**Feature**: store-tenancy-and-profiles
**Date**: 2026-08-19
**Status**: superseded — no autoriza código
**Platform**: fullstack (Spring Boot 3 / Kotlin + Angular 22 storefront/admin)
**Does not invent**: Fury, KVS, BigQueue. Stack Novastra: VM + Nginx MAIN + Docker + PostgreSQL + Mercado Pago Checkout Pro.

<!-- superseded_by: sdd/wip/20260921-single-tenant-installation-baseline/2-technical/spec.md -->

> **HISTÓRICO — NO IMPLEMENTAR.** Esta spec superseded no overridea nada vivo. El baseline vigente es `20260921-single-tenant-installation-baseline`.

---

## Executive Summary

StoreCore es **un binario, N tiendas**. El tenant se resuelve por hostname. El aislamiento es `store_id` en todas las filas de negocio. El rubro es configuración (`catalog_profile` + `option_schema`), jamás DDL dinámico ni variables de entorno de producto.

Default de superficie: storefront en `www.marca.com.ar`, admin en `admin.marca.com.ar`. Onboarding MVP = CLI de ops Novastra, no wizard self-serve en el admin del merchant.

Esta spec es el **kernel de tenancy**. No implementa PDP, carousel, fulfillment tracker, catálogo CRUD, carrito de comprador ni checkout. `/sdd.build` sólo se habilita tras el GO de Sol sobre los meta-gates documentales y cubre las 21 tareas implementables de `3-tasks/tasks.json`.

**Límite de implementación (no inventar):**

| En este build | No en este build |
|---------------|------------------|
| Flyway V1, TenantFilter, provision CLI/API | CRUD catálogo, PDP, home |
| Login USER + login/register CUSTOMER (claims) | `refresh_tokens`, logout/revocation (`TODO-004`) |
| bootstrap + Settings + media branding | Editor de producto (`TODO-007`) |
| Webhook: intake durable 200 + firma + idempotencia por callback key | Consultar MP, parsear `external_reference`, crear preference, reserva stock y jobs (`TODO-006`) |
| Cookie `sc_cart` **contrato** documentado | Endpoints cart/checkout (`TODO-008`) |


Revisión 2026-08-19: [Backend](3ed9eb2f-ef96-44ee-9567-9f5edfa7f34c) SHIP WITH FIXES + [Frontend/ops](3471a381-8860-46ba-b26b-71822af9acbc) BLOCK hasta estos huecos. Esta revisión cubre ambos.

---

## Architecture

```
     www.marca.com.ar                 admin.marca.com.ar
     (store_hosts STOREFRONT)          (store_hosts ADMIN)
              │                                │
              └────────────┬───────────────────┘
                           ▼
                 ┌──────────────────┐
                 │ Nginx MAIN SSL   │
                 │ SNI; Host $host  │
                 │ /api/ → API      │
                 │ / → SPA por Host │
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │ storecore-api    │
                 │ TenantFilter     │
                 │ Host → store_id  │
                 │ + surface        │
                 └─┬──┬──┬──────────┘
                   │  │  │
        stores     │  │  └──── Mercado Pago (preference por store)
        catalog    │  │
        orders     ▼  ▼
               PostgreSQL 16
               (un schema, N store_id)
               Redis opcional (rate limit, no carrito)
```

Capa hexagonal (patrón AssistTime): `TenantContext` es un value object **request-scoped en el adapter web**. `TenantResolutionFilter` resuelve Host+surface y deja `store_id` en MDC; `TenantJwtGuardFilter`, posterior a autenticación, valida `token_use`, `aud` y `store_id`. Los puertos `Load*Port` / `Save*Port` reciben `storeId` explícito. Los adapters JPA **siempre** agregan `WHERE store_id = :id`. Está prohibido `JpaRepository.findById` de un agregado de negocio sin store.

`@Async` y jobs **no** leen `Host`. Reciben `storeId` ya resuelto (webhook) o iteran filas con su propio `store_id`.

Dos SPAs, **un build cada una** para todos los comercios. `apiBaseUrl = '/api/v1'` relativo. Nginx proxea `/api/` en **ambos** hosts. Sin CORS en MVP.

---

## Design Decisions

### DD-1: Isolation model

**Selected**: Shared schema + `store_id` + custom domain (logical multi-tenant).

**Options Considered**:

- Option A — VM/DB por cliente (docs actuales): aislamiento fuerte, ops lineal, forks de `.env`. No es plataforma.
- Option B — Schema-per-tenant (Postgres schema `store_luna`): aislamiento medio, Flyway N veces, reporting cruzado imposible.
- Option C (selected) — Shared schema + `store_id`: un Flyway, un código, host routing. Requiere disciplina de IDOR.
- Option D — Tablas dinámicas por onboarding: no versionable, no indexable, riesgo de seguridad.

**Trade-offs Accepted**: un bug de filtro puede filtrar datos ajenos (peor que Option A). Se acepta porque el producto objetivo es N clientes con el mismo código; el mitigante es `TenantContext` + tests de autorización + `order_number` namespaced. Ops de 20 VMs es el trade-off que **no** se acepta.

**Rationale**: el fundador pidió lo profesional y abstracto con muchos clientes y dominio propio. Eso es SaaS con hosts custom, no un mall y no una agencia.

### DD-2: Rubro / vertical

**Selected**: `catalog_profile` enum en `stores` + `option_schema` JSONB por producto. Templates en código (`ClothingProfile`, `HardwareProfile`, `FoodProfile`, `GenericProfile`).

**Options Considered**:

- Option A — DDL distinto por rubro (`clothing_sizes` table): explota el modelo.
- Option B — Solo `.env` `VERTICAL=clothing`: el merchant no puede cambiarlo; no hay settings.
- Option C (selected) — perfil + JSON schema de ejes.
- Option D — EAV completo `attribute_definitions` en Fase 1: sobreingeniería; se deja para matriz SKU.

**Trade-offs Accepted**: JSONB no da facets SQL perfectos el día 1 (GIN después). Se acepta para no bloquear Flyway V1. Filtros ricos son feature hija (`IDEA-008`). El hint `ui: swatch` y el PDP genérico **no** se implementan en este kernel (`TODO-005`).

**Rationale**: templates cubren ropa / ferretería / alimentos / genérico sin columnas SQL.

### DD-3: “Dos cosas al mismo tiempo”

**Selected**: una `store` puede tener productos con `option_schema` distintos. Abrir un segundo negocio con otra marca/dominio = segunda `store`. No hay tabla `business_line`.

**Options Considered**:

- Option A — prohibir mix (un perfil rígido): simple, falso para “remeras + accesorios”.
- Option B (selected) — mix a nivel producto.
- Option C — `store_id` + `channel_id`: marketplace light; fuera de MVP.

**Trade-offs Accepted**: el admin no tendrá “dos dashboards de marca” en una cuenta. Si el comerciante quiere dos marcas, son dos tiendas.

### DD-4: Carrito y Redis

**Selected**: carrito en PostgreSQL (`carts.store_id`). Redis no es source of truth.

**Options Considered**: Redis-only; dual-write; Postgres-only (selected).

**Trade-offs Accepted**: un JOIN más en checkout. Se evita dual-write del gap C-02. Redis queda opcional para rate-limit de login.

### DD-5: Media (kernel)

**Selected**: `POST /api/v1/admin/media` proxy a Cloudinary; persiste URL. Folder `storecore/{storeId}/`. Este kernel cubre **logo, banner, favicon** de Settings. Grid de producto, carousel PDP y `variant.image_id` → `TODO-002`.

**Options Considered**: pegar URL; S3 propio; Cloudinary proxy (selected).

**Trade-offs Accepted**: dependencia Cloudinary y secretos en `.env` de plataforma (no por tienda).

**Rationale**: sin upload de branding, AC-12 no existe. El path `/api/v1/media/upload` de PATTERNS queda **overrides** por `/api/v1/admin/media`.

### DD-6: Admin host

**Selected**: default `admin.{apex}` como fila `store_hosts` con surface `ADMIN`. Fallback: ausencia de esa fila = host `STOREFRONT` + SPA en `/admin/` (`baseHref=/admin/`).

**Options Considered**:

- Option A — solo path `/admin` en www: un cert, un DNS; mismo origin que el storefront → XSS del PDP puede leer JWT USER.
- Option B (selected) — subdominio `admin.` por defecto: orígenes separados, cookies host-only, mental model “mi tienda / mi panel”.
- Option C — login global `admin.storecore.com`: cuenta de plataforma (IDEA-005), choca AC-22.

**Trade-offs Accepted**: Novastra opera un registro DNS y un SAN extra por tienda (DEBT-004). Se acepta a 5–20 clientes porque ya tocan DNS/SSL. El fallback path cubre nic.ar / mail en otra zona.

**Rationale**: USER ≠ CUSTOMER exige orígenes distintos cuando se puede. API siempre `/api/v1/admin/**` y `/api/v1/store/**`, independiente del Host. Path `/admin` es **SPA**, no el prefijo de API.

---

### DD-7: Ruteo de webhook Mercado Pago

**Selected**: `POST /api/v1/webhooks/mp/{callbackKey}` usa una `callbackKey` aleatoria, opaca y única de `payment_configs` para resolver `store_id` y su secreto webhook. No se usa Host ni `external_reference` para el intake.

**Rationale**: la notificación sólo aporta `notification_id` y `resource_id`; obtener `external_reference` requiere consultar MP con la credencial de la tienda. La callback key rompe esa circularidad. No autentica: la firma MP se valida antes de insertar en la inbox.

**Trade-offs Accepted**: el kernel sólo recibe, valida y persiste eventos. La consulta a MP, correlación de orden y efectos de checkout pertenecen a `TODO-006`.

## TenantFilter

Request-scoped (no ThreadLocal de dominio). Corre antes de controllers.

### Skip (no 404 de tienda)

`/api/v1/webhooks/mp/**`, `/api/v1/platform/**`, `/actuator/**`.

### Lookup

1. Header `Host`, normalizado: lowercase, sin puerto (`www.marca.com.ar:443` → `www.marca.com.ar`).
2. `X-Forwarded-Host` **solo** si el peer es Nginx MAIN de confianza (mismo criterio; tomar el primer host si hay lista).
3. Nunca query `?storeId=` público.

Reglas:

| Host match | `store_id` | Surface |
|------------|------------|---------|
| fila `store_hosts` con `surface=STOREFRONT` | `store_hosts.store_id` | `STOREFRONT` |
| fila `store_hosts` con `surface=ADMIN` | `store_hosts.store_id` | `ADMIN` |
| fila STOREFRONT sin fila ADMIN | esa store | por prefijo: `/api/v1/admin` o `/admin` → `ADMIN`; resto → `STOREFRONT` |
| sin match | — | **404** `STORE_HOST_UNKNOWN` (API JSON) / página “tienda no encontrada” (SPA). Nunca tienda default. |

Superficie estricta (cuando `admin_host` está seteado):

- En el host de la fila ADMIN, `/api/v1/store/**` → 404 `RESOURCE_NOT_FOUND`.
- En el host de la fila STOREFRONT, `/api/v1/admin/**` → 404 `RESOURCE_NOT_FOUND` salvo el fallback explícito sin fila ADMIN.

`TenantResolutionFilter` no interpreta JWT. `TenantJwtGuardFilter`, posterior a autenticación, exige `token.store_id == context.store_id`, `token_use` y `aud` alineados a la chain. Mismatch → **401** `AUTH_STORE_MISMATCH`, no 404. Ambos filtros limpian el MDC en `finally`.

Webhook: el filtro **ignora Host** en `/api/v1/webhooks/mp/**`; un resolver dedicado usa `callbackKey`. Ver sección Webhook.

Redirect canónico: un alias apex debe redirigir a la única fila `store_hosts` de superficie STOREFRONT. Sin redirect, apex y www serían dos carritos.

---

## JWT map (canónico — supera specs de sistema)

| Surface | Prefix | Auth | token_use |
|---------|--------|------|-----------|
| Admin SPA + API | `/api/v1/admin/**` | JWT USER (salvo login) | `USER` |
| Storefront API | `/api/v1/store/**` | JWT CUSTOMER salvo tabla pública abajo | `CUSTOMER` |
| Platform ops | `/api/v1/platform/**` | header `X-Platform-Key` | — |
| Webhook | `/api/v1/webhooks/mp/{callbackKey}` | firma MP `x-signature` | — |

Público (Host-scoped, sin JWT): `GET /api/v1/store/bootstrap`, catálogo GET, cart cookie, `POST register/login` store.

Claims: `token_use`, `store_id`, `sub`, `iss=storecore`, `aud=admin|store`.

Par RSA: **uno de plataforma** en shared runtime. Invalida GAPS P-02 (RSA por cliente). `iss` no es el Host.

Expiración (números de este kernel; persistencia de refresh → `TODO-004`):

| token_use | access | refresh |
|-----------|--------|---------|
| USER | 15 min | 7 días **cuando exista** tabla `refresh_tokens` |
| CUSTOMER | 30 min | 30 días **cuando exista** tabla |

V1 de este feature: login/register devuelven **access token**. El endpoint `/refresh` no se implementa aquí. No inventar refresh en cookie o localStorage sin tabla.

Paths legado `/api/v1/auth`, `/api/v1/customer/auth`, `/api/v1/media/upload` **no se implementan**.

---

## Onboarding

**MVP default: CLI** `storecore-admin provision`.

Args/stdin: `name`, `slug`, `primary_host`, `admin_host`, `catalog_profile`, admin `email`. Crea fila `stores`, fila `store_hosts` STOREFRONT y, si se informó, fila `store_hosts` ADMIN, más primer USER `ADMIN`, normaliza hosts a lowercase sin puerto/punto final y fija `locale=es-AR`, `currency=ARS`, `timezone=America/Argentina/Buenos_Aires`, `SELF_SHIP=true`, demás modos `false` y tarifas `NULL`. Imprime password **una vez**. Nunca escribe `STORE_ADMIN_*` en `.env`. No ejecuta `CREATE TABLE`.

Passwords de USER y CUSTOMER: BCrypt. El CLI imprime la password una vez; el hash es lo único persistido. No hay flujo “change on first login” en este kernel.

Admin Settings GET **nunca** devuelve `access_token` MP en claro. GET: `publicKey`, `mpConfigured: true|false`. PUT Pagos: `accessToken` write-only (reemplaza ciphertext); vacío = no cambiar. OPERATOR: 403 en PUT Pagos/Dominio.

`POST /api/v1/platform/stores` es **la misma lógica** detrás de `X-Platform-Key: PLATFORM_API_KEY`, no un tercer flujo. Fuera del browser. No CORS. Binding ops/VPN.

CLI: `java -jar storecore-backend.jar provision --name ...` (Spring Boot main con subcomando), no un segundo repo.

---

## Data Model

### Flyway V1 vs `docs/04-MODELO-DATOS-MVP.md`

`docs/04` asume 1 fila `stores`, uniques globales y políticas como URL. V1 **rompe** eso. Tablas: **20** del diccionario V1, incluida `store_hosts`. `docs/04` y sus conteos 18/19 son legado. Tenancy combina `store_id` y `store_hosts`, no columnas de host en `stores`.

Sin `store_id` (catálogo de sistema): `roles` — seed `ADMIN`, `OPERATOR`.

Con `store_id BIGINT NOT NULL REFERENCES stores(id)`: `users`, `user_roles`, `categories`, `products`, `product_images`, `product_variants`, `stock_movements`, `customers`, `customer_addresses`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `mp_webhook_events`, `shipments`, `payment_configs`.

`refresh_tokens`: **excluida de V1 de este feature**; vive en `TODO-004`. Si se agrega antes, unique/FK con `store_id`.

### Modelo de tiendas y hosts

La definición DDL completa, incluyendo tipos, nulos, defaults, checks, índices y FKs, vive exclusivamente en `data-model-v1.md`. `stores` no tiene columnas de host. El provision recibe `primary_host` y `admin_host` como aliases humanos y crea respectivamente filas `store_hosts` `STOREFRONT` y opcional `ADMIN`.

Unicidades globales: `stores.slug`, `stores.public_id`, `store_hosts.host_normalized`, `payment_configs.callback_key` y `(provider, notification_id)` en `mp_webhook_events`. La tabla `store_hosts` restringe una superficie por tienda con `UNIQUE(store_id, surface)`.
### Payment config e inbox webhook

`payment_configs` persiste `provider`, `public_key`, `access_token_ciphertext`, `access_token_nonce`, `webhook_secret_ciphertext`, `webhook_secret_nonce`, `encryption_key_version`, `callback_key` y `active`. `mp_webhook_events` persiste `store_id`, `provider`, `notification_id`, `topic`, `resource_id`, payload acotado, `status` (`RECEIVED|PROCESSED|FAILED|UNMATCHED`) y timestamps. La firma inválida no ocupa un `notification_id` de negocio.

### Catalog (columnas de kernel)

`products.kind VARCHAR NOT NULL DEFAULT 'PHYSICAL'`  
`products.option_schema JSONB NOT NULL DEFAULT '[]'`  
`product_variants.attributes JSONB`  
`product_variants.image_id` → **no se usa en este feature** (TODO-002).  
`product_variants.weight_grams INT NULL`  
`product_variants.barcode VARCHAR NULL`  
`customers.document_type/number` nullable  
`orders.fulfillment_method` VARCHAR NULL (columna; máquina ORDER vs SHIPMENT → TODO-003)

### `option_schema` examples (defaults de template, no PDP)

CLOTHING (precarga en productos **nuevos**):

```json
[
  {"key": "size", "ui": "select", "values": ["S", "M", "L", "XL"]},
  {"key": "color", "ui": "select", "values": ["Negro", "Blanco"]}
]
```

HARDWARE: `[]`. Facets sugeridos en Settings/docs, no columnas: `brand`, `voltage`, `diameter_mm`.

FOOD: `[{"key":"flavor","ui":"select","values":[]},{"key":"size","ui":"select","values":[]}]` opcionales.

GENERIC: `[]`.

Validación: ejes vendibles. Prohibido lote, alérgenos, mensaje de torta (RN-T04). Cambio de `catalog_profile` no reescribe productos existentes (AC-14). `ui: swatch` es hint futuro de `TODO-005`; V1 usa `select`.

### Migrations

Flyway V1 crea el schema tenant-aware desde el día 0. No hay “agregar store_id después”.

```
migration:
  detected: true
  service_name: storecore-postgres
  service_type: postgresql
  branch_status: pending
```

---

## API Contracts (este kernel)

Errores y éxitos usan un único wire schema `BaseResponse<code: Int, errorCode: String?, message: String?, data, traceId: String>`. Los JSON de bootstrap y Settings mostrados abajo son siempre el valor de `data`, nunca cuerpos desnudos en la red. `code` es siempre el HTTP integer; `errorCode` es obligatorio y estable en errores (`STORE_HOST_UNKNOWN`, etc.); `message` es humano y no parseable; `traceId` siempre permite correlación sin exponer secretos.

Códigos simbólicos:

| errorCode | HTTP (`code`) | Uso |
|------|------|-----|
| STORE_HOST_UNKNOWN | 404 | Host no mapeado |
| RESOURCE_NOT_FOUND | 404 | Recurso inexistente **en esta store** (IDOR incluido) |
| AUTH_INVALID | 401 | credenciales / JWT |
| AUTH_STORE_MISMATCH | 401 | JWT store_id ≠ Host |
| HOST_SLUG_CONFLICT | 409 | slug o host duplicado |
| VALIDATION_ERROR | 400 | body |

IDOR siempre 404, nunca 403.

### Public (Host → store, surface STOREFRONT)

| Method | Path | Auth | Este feature |
|--------|------|------|----------------|
| GET | `/api/v1/store/bootstrap` | none | **sí — schema abajo** |
| GET | `/api/v1/store/catalog/**` | none | **no** — host-scoped cuando exista TODO-005/008 |
| GET/POST/PATCH/DELETE | `/api/v1/store/cart` | cookie `sc_cart` | **contrato de cookie sí; endpoints no** (TODO-008) |
| POST | `/api/v1/store/auth/register` | none | sí — alta CUSTOMER anclada a `store_id` del Host |
| POST | `/api/v1/store/auth/login` | none | sí — merge carrito **cuando exista** carrito (TODO-008); hoy emite JWT |
| POST | `/api/v1/store/auth/refresh` | refresh | **no** (TODO-004). V1 no persiste `refresh_tokens` |
| POST | `/api/v1/store/checkout` | CUSTOMER JWT | **no** (TODO-006) |
| GET | `/api/v1/store/orders` | CUSTOMER JWT | **no** |

### Admin (surface ADMIN)

| Method | Path | Auth | Este feature |
|--------|------|------|----------------|
| POST | `/api/v1/admin/auth/login` | `{email,password}` — `store_id` del Host, **no** del body | sí |
| GET/PATCH | `/api/v1/admin/settings` | USER ADMIN (OPERATOR: ver visibilidad) | sí |
| POST | `/api/v1/admin/media` | USER | branding sí; grid producto → TODO-002 |
| CRUD | `/api/v1/admin/catalog/**` | USER | **no** (TODO-007) |
| PATCH | `/api/v1/admin/orders/{id}/shipment` | USER | **fuera** (TODO-003) |

OPERATOR no edita secciones Pagos ni Dominio (CU-10).

### Platform

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/platform/stores` | `X-Platform-Key` (misma lógica que CLI) |
| POST | `/api/v1/webhooks/mp/{callbackKey}` | MP signature, no JWT |

### `GET /api/v1/store/bootstrap`

404 si Host desconocido. **No** incluye `admin_host`, CUIT, tokens MP, flags internos de pago.

```json
{
  "name": "Luna Textil",
  "slug": "luna",
  "locale": "es-AR",
  "currency": "ARS",
  "catalogProfile": "CLOTHING",
  "branding": {
    "logoUrl": null,
    "bannerUrl": null,
    "faviconUrl": null,
    "primaryColor": "#111111",
    "secondaryColor": "#C4A574"
  },
  "homepageSections": [
    { "type": "HERO_BANNER", "sort": 0 },
    { "type": "FEATURED_CATEGORIES", "sort": 1 },
    { "type": "NEW_PRODUCTS", "sort": 2 }
  ],
  "seo": { "title": "Luna Textil", "description": "Indumentaria" }
}
```

Enum cerrado `homepageSections[].type`: `HERO_BANNER` | `FEATURED_CATEGORIES` | `NEW_PRODUCTS`. AC-12 = estos 3 bloques ordenables.

Admin **no** usa este endpoint para Settings. Admin usa `GET /api/v1/admin/settings`.

PATCH `/api/v1/admin/settings` (ADMIN). Campos omitidos = no cambiar. Ejemplo mínimo:

```json
{
  "name": "Luna Textil",
  "branding": {
    "logoUrl": "https://res.cloudinary.com/.../logo.png",
    "bannerUrl": null,
    "faviconUrl": null,
    "primaryColor": "#111111",
    "secondaryColor": "#C4A574"
  },
  "homepageSections": [
    { "type": "HERO_BANNER", "sort": 0 },
    { "type": "FEATURED_CATEGORIES", "sort": 1 },
    { "type": "NEW_PRODUCTS", "sort": 2 }
  ],
  "catalogProfile": "CLOTHING",
  "shipping": {
    "pickupEnabled": true,
    "selfShipEnabled": true,
    "carrierEnabled": false,
    "flatCaba": 5000,
    "flatInterior": null,
    "defaultMode": "PICKUP"
  },
  "policies": { "return": "...", "terms": "...", "privacy": "...", "shipping": "..." },
  "payments": { "publicKey": "APP_USR-...", "accessToken": "••••write-only" },
  "seo": { "title": "Luna Textil", "description": "..." }
}
```

GET Settings incluye `hosts: { primary, admin }`, `mpConfigured`, `catalogProfile`. No `accessToken`. Dominio no es editable por el merchant.

Storefront: APP_INITIALIZER / efecto NgRx al arrancar. CSS `:root { --store-primary; --store-secondary }`. No tema Material. MVP = CSR. Meta `title`/`description`/`og` desde bootstrap. SSR/prerender fuera.

Cache-Control por host permitido. FOUC: skeleton hasta el GET; no pintar tienda default.

### Cart cookie (contrato reservado)

Nombre `sc_cart`. `HttpOnly; Secure; SameSite=Lax; Path=/`. **Host-only** (sin `Domain=.marca.com.ar`). Solo `primary_host`. TTL 7 días `carts.expires_at` cuando exista el módulo cart. Unique `(store_id, session_id)`.

Este kernel **no** implementa endpoints de carrito. El storefront no setea la cookie hasta `TODO-008`.

---

## Webhook Mercado Pago

Un formato: `payments.external_reference` = `sc1:{store.public_id}:{order_number}`. Supera RN-07 (`external_reference = order_number`) y evita exponer o depender de un slug mutable.

`notification_url` de la preference = `${WEBHOOK_PUBLIC_BASE_URL}/api/v1/webhooks/mp/{callbackKey}` (cuando exista checkout). La base pública es controlada por plataforma, HTTPS y sin derivarla del Host del comercio.

**Algoritmo de firma MP (canónico):** la URL es `POST /api/v1/webhooks/mp/{callbackKey}?data.id={resourceId}`. Con la configuración indicada por `callbackKey`, extraer `ts` y `v1` de `x-signature`, leer `x-request-id` y formar, omitiendo pares ausentes, `id:{lowercase(data.id)};request-id:{x-request-id};ts:{ts};`. Calcular `HMAC-SHA256(webhook_secret, manifest)` hexadecimal y comparar `v1` en tiempo constante. Nunca se firma el raw body. Guardar fixtures de header/query/secret/manifest válido e inválido; firma inválida devuelve 401. Después de validar, parsear el body para obtener el `id` de notificación y persistir el inbox; no se consulta MP ni una orden en este kernel.

Este kernel no consulta órdenes, no correlaciona `external_reference` y no ejecuta `SELECT FOR UPDATE`; eso pertenece exclusivamente a `TODO-006`.

Duplicado: no reprocesar. Firma inválida: 401 + log sin tokens. Error interno o fallo antes del commit durable: 5xx para retry del proveedor.

Checkout, preference, reserva de stock y job 30 min → `TODO-006`.

---

## Security Considerations

- TenantFilter + JWT claims como arriba.
- Tests IDOR: gate del módulo (matriz abajo).
- `access_token` MP cifrado por fila (`EncryptPort`, AES-GCM, `MP_ENCRYPTION_KEY` 32 bytes). Rotación = re-ingreso en Settings.
- La firma MP se valida como manifest HMAC de `data.id`, `x-request-id` y `ts`; comparación constante y fixtures obligatorios.
- No `store_id` en query string pública.
- Rate limit login por host+IP (Redis allowed).
- Nunca loguear: `MP_ENCRYPTION_KEY`, access_token plaintext, JWT privados, `PLATFORM_API_KEY`, Cloudinary secret, password de provision.

## Environment Variables

Infra (`.env`, not Settings):

| Variable | Purpose |
|----------|---------|
| POSTGRES_* | DB |
| JWT_PRIVATE_KEY / JWT_PUBLIC_KEY | RSA de **plataforma** |
| MP_ENCRYPTION_KEY | cifra tokens MP por tienda |
| CLOUDINARY_* | media; folder `storecore/{storeId}/` |
| MAIL_* | SMTP de plataforma; `MAIL_FROM` puede interpolar nombre de store, no un SMTP por merchant en MVP |
| REDIS_* | optional rate limit |
| PLATFORM_API_KEY | provision; header X-Platform-Key |
| WEBHOOK_PUBLIC_BASE_URL | base HTTPS de callback MP, controlada por plataforma |

Prohibido: `CATALOG_PROFILE`, `PRIMARY_COLOR`, `STORE_NAME`, `STORE_ADMIN_EMAIL`, `STORE_ADMIN_PASSWORD`.

## Secrets Management

- Platform secrets: `.env` + docker-compose `${VAR}`, gitignored.
- Merchant MP credentials: DB ciphertext.
- `.env.example` es artefacto de código (GAPS P-04); esta tabla es la fuente.

## Frontend Architecture

- Angular 22, dos apps. Material **solo admin**. Storefront sin Material.
- Clean Architecture frontend: componentes → use cases → repository ports; HTTP queda en adapters. El kernel no registra adapters in-memory; la maqueta vive sólo en `storefront-prototype` con build prototype separado.
- Clean Architecture + NgRx (TARGET): container/presentational; Settings = feature state `settings` + `SettingsApiService`.
- Un build por SPA para todos los merchants. Nada de negocio en `environment.ts` salvo `production: true`.
- Nginx: `/api/` → backend en ambos hosts; no CORS.
- `PathLocationStrategy`. Catch-all SPA **después** de `/api/`. Fallback: `location /admin/` → admin con `baseHref=/admin/`.
- Settings UI: tabs Identidad, Branding, Catálogo, Envíos, Pagos, Políticas, Dominio (read-only). Preview logo+colores. Copy AC-14 al cambiar perfil.
- Branding media: `POST /api/v1/admin/media` (multipart) → URL → `PUT /api/v1/admin/settings`.
- Dominio: estado DNS/SSL `PENDING` | `LIVE` es display ops; no self-serve DNS.
- SEO MVP: meta desde bootstrap; `robots.txt`/`sitemap.xml` por host quedan en TODO-008 si no caben en bootstrap.
- Fuera: páginas home/PDP/cart, editor de producto, swatches, shipment tracker.

## Technology Baseline and Testing Strategy

Referencia evaluada: AssistTime `origin/release/1.4`; se adoptan sus controles, no sus acoplamientos heredados. Backend: JDK 21, Kotlin 1.9.25, Spring Boot 3.5.7, PostgreSQL 16, Flyway, Testcontainers, Spring Security Resource Server, springdoc, Actuator y JaCoCo. Las versiones se fijan en los manifests al crear cada app.

`domain` no importa Spring, JPA, HTTP, `Page`, `Pageable` ni DTOs framework. `application` usa puertos y es transaccional; `infrastructure` contiene JPA, seguridad, MP y configuración; `presentation` devuelve DTOs de respuesta. Una prueba de arquitectura falla ante dependencias invertidas.

Security chains ordenadas: webhook (manifest HMAC MP); platform (`X-Platform-Key`); admin (USER/aud=admin); storefront (CUSTOMER/aud=store). Todas validan issuer, audience, token_use y `store_id` cuando corresponde.

Angular 22 usa una única lane target-NgRx: domain (interfaces readonly sin Angular/RxJS), application (casos de uso/estado), infrastructure (HTTP/mappers) y presentation. Containers sólo seleccionan/dispatchan; presentacionales sólo @Input/@Output, OnPush y trackBy. El kernel no registra InMemoryCatalogRepository: catálogo/home/PDP son futuros. La maqueta visual vive en una feature SDD storefront-prototype separada, con build prototype explícito y provider in-memory prohibido en la configuración de producción.

CI ejecuta arquitectura/compile/unit/coverage, integración Flyway/Testcontainers, admin test/build, storefront test/build, budgets, a11y, smoke responsive, SDD/evidence, secret scan y dependency scan. En effects NgRx cada error emite failure action y el reducer cierra loading.

Pruebas unitarias: `TenantContext`, resolver Host (www/admin/unknown/fallback `/admin`, lowercase/sin puerto), templates `option_schema` y provision CLI sin DDL. Integración con dos stores: host duplicado, categoría/producto, cart/variant, payment/order y shipment/order cross-store son rechazados por PostgreSQL. Webhook concurrente: firma HMAC de manifest MP, duplicado devuelve 200 sin reproceso y fallo previo al commit devuelve 5xx.
## Performance

Índices V1: uniques citados; `orders(store_id, created_at DESC)`; `payments(external_reference)`; `carts(expires_at)`; `mp_webhook_events(notification_id)` unique; `products(store_id, slug)`. GIN `attributes` diferido (IDEA-008).

## Bounded contexts (10 + platform)

Canónico (corrige 9 vs 10): `auth`, `store`, `catalog`, `inventory`, `cart`, `order`, `payment`, `shipment`, `customer`, `notification` + `platform` (ops mínimo). Este feature toca `store` + `auth` (claims) + `platform` + filtro transversal. Jobs CU-15/16/17 (carrito expirado, preference, email) **no** se especifican aquí.

## Deployment

Un compose shared: api + admin + storefront + postgres (+ redis optional) en DEBUG `.170`. Nginx MAIN: N `server_name` → **mismo** upstream. `proxy_set_header Host $host;` y `X-Forwarded-Proto`. Blast radius: un release actualiza todas las tiendas.

```nginx
server {
  server_name www.marca.com.ar;
  location /api/ { proxy_pass http://storecore-api; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
  location /      { proxy_pass http://storefront; }
}
server {
  server_name admin.marca.com.ar;
  location /api/ { proxy_pass http://storecore-api; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
  location /      { proxy_pass http://storecore-admin; }
}
```

Certbot por tienda: `certbot --nginx -d www.marca.com.ar -d admin.marca.com.ar`. Wildcard no es requisito. HTTP-01 en MAIN. Novastra crea DNS **antes** del challenge.

Fallback un `server_name`: `location /admin/` → admin SPA; `/api/` → api; `/` → storefront.

Deploy dedicado (emergencia): misma imagen, una fila `stores`, un host. No segundo codebase. Un par RSA igual (plataforma o esa VM, no por “marca”).

No-IP `storecoreXXX.ddns.net`: laboratorio, no happy path.

Staging: `luna.staging.…` mientras el `.com.ar` no apunta.

## Observability

- Log `store_id` en MDC. Nunca PII de otra tienda.
- Health `/actuator/health` sin datos de tenant.

## Infrastructure Creation

| Item | Status |
|------|--------|
| Flyway V1 tenant-aware schema | Pending `/sdd.build` |
| CLI `storecore-admin provision` | Pending `/sdd.build` |
| Nginx server_name templates | Runbook 07 modo plataforma |
| Cloudinary folder | `storecore/{storeId}/` |

## Child features (no implementar aquí)

| Feature | Backlog | Este kernel deja |
|---------|---------|------------------|
| media-upload UI | TODO-002 | proxy branding |
| fulfillment-modes | TODO-003 | flags Settings + `fulfillment_method` |
| dual-jwt-store-scoped | TODO-004 | prefijos + claims + expiraciones |
| catalog-option-schema PDP | TODO-005 | templates JSON |
| mp-checkout-hardening | TODO-006 | `external_reference` + webhook sin Host |
| admin-product-editor | TODO-007 | — |
| storefront-pdp-cart | TODO-008 | bootstrap + cookie + CSS vars |

## Breakage vs docs de sistema (DEBT-001)

Hasta actualizar `sdd/specs/*`: este feature **overrides** multi_tenant no, Redis cart, RN-13 URL-only, paths JWT `/auth`, Angular 15 + Material storefront, “1 fila stores”, RSA por cliente (P-02), seed ADMIN en `.env`.
