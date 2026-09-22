# Technical Spec — StoreCore

**Versión:** 1.0  
**Fecha:** 2026-05-15  
**Estado:** HISTÓRICO — el rótulo “APROBADO” es registro de 2026-05-15, no gate vivo  
**Fuente:** Consolidado de docs/01, docs/04, docs/05, docs/07

> **NO IMPLEMENTAR.** Documento legado. El baseline vigente está archivado en `sdd/features/20260921-single-tenant-installation-baseline/`. El WIP `20260819-store-tenancy-and-profiles` también está **superseded**. Companion vivo: BlackStore `blackstore-pilot` + YAML StoreCore `storecore-pos-integration-contract-v1`.

---

<!-- deprecated: sdd/wip/20260819-store-tenancy-and-profiles -->

## Arquitectura general

```
[Browser — CUSTOMER]       [Browser — ADMIN/OPERATOR]
         |                           |
         | HTTPS                     | HTTPS
         ▼                           ▼
  [Nginx VM MAIN .110 — Reverse Proxy + SSL]
         |
         | proxy_pass :17050
         ▼
  [VM DEBUG .170 — Ubuntu 22.04 — Docker]
  ┌─────────────────────────────────────────┐
  │  storefront-app  (Angular — :4200→:80)  │
  │  admin-app       (Angular — :4201→:81)  │
  │  backend-api     (Spring Boot — :9090)  │
  │  db              (PostgreSQL — :5432)   │
  │  cache           (Redis — :6379)        │
  └─────────────────────────────────────────┘
         |
         | HTTPS (webhooks)
         ▼
  [Mercado Pago API]
```

**Patrón de infra:** Mismo que AssistTime/GoodLife en SERVER DATA.  
Puerto externo: `17050` (patrón IP .170 → puerto 17050).  
Hostname: a confirmar en `04-referencia/PENDIENTE-NOIP-SSL-CONFIG.md`.

---

## Componente 1: Backend (Spring Boot + Kotlin)

### Stack técnico

| Tecnología | Versión | Rol |
|-----------|---------|-----|
| Kotlin | 1.9.x / 2.x | Lenguaje |
| Spring Boot | 3.x | Framework |
| JDK | 21 (Eclipse Temurin) | Runtime |
| PostgreSQL | 16 Alpine | Base de datos |
| Flyway | integrado en SB | Migraciones |
| Spring Security + JWT/RSA | — | Auth dual (USER + CUSTOMER) |
| Redis | latest | Carrito, sesiones, rate limit |
| Spring Mail | — | Notificaciones email (SMTP) |
| Springdoc OpenAPI | 2.x | Swagger UI |
| Docker + Compose | — | Deploy |
| Maven | pom.xml | Build tool |

### Arquitectura interna
**Patrón:** Hexagonal (Ports & Adapters) — igual que AssistTime  
**Referencia directa de código:** `AssistTime/backend/Assist-Time/src/main/kotlin/`

```
presentation/controller/     ← REST controllers (un controller por módulo)
application/service/         ← Use cases
application/dto/             ← Request/Response DTOs
application/mapper/          ← Entity ↔ DTO
domain/model/                ← Entidades de dominio puras
domain/port/out/             ← Interfaces OUT (repos)
infrastructure/persistence/  ← Implementaciones JPA
infrastructure/config/       ← SecurityConfig, RedisConfig, CloudinaryConfig, etc.
infrastructure/mail/         ← Spring Mail adapters
```

### Módulos del backend (9 en Fase 1)

| Módulo | Responsabilidad | Endpoints principales |
|--------|----------------|----------------------|
| `auth` | JWT para staff (USER) y compradores (CUSTOMER) | POST /api/v1/auth/login, POST /api/v1/auth/refresh, POST /api/v1/customer/auth/login |
| `store` | Config de la tienda, credenciales MP | GET/PUT /api/v1/store |
| `catalog` | Categorías, productos, variantes, imágenes | CRUD /api/v1/categories, /api/v1/products |
| `inventory` | Stock, movimientos | GET /api/v1/inventory, PATCH stock |
| `cart` | Carrito de sesión con TTL | GET/POST/DELETE /api/v1/cart |
| `order` | Pedidos, snapshots, estados | GET /api/v1/orders, POST /api/v1/checkout |
| `payment` | Mercado Pago: preference, webhook | POST /api/v1/payments/preference, POST /api/v1/webhooks/mp |
| `shipment` | Estados de envío manuales | PATCH /api/v1/orders/{id}/shipment |
| `customer` | Cuentas de compradores | POST /api/v1/customers/register, GET /api/v1/customers/me |
| `notification` | Emails transaccionales | (interno, no REST) |

### Autenticación dual

| Tipo | Consumidor | Endpoint base |
|------|-----------|---------------|
| JWT RSA — USER | Staff backoffice | `/api/v1/auth/` → `/api/v1/admin/` |
| JWT RSA — CUSTOMER | Compradores storefront | `/api/v1/customer/auth/` → `/api/v1/store/` |

Dos `SecurityFilterChain` separadas. No hay overlap de rutas.

### Modelo de datos (18 tablas Fase 1)

#### Grupo: Tienda
- `stores` — config raíz (1 fila en Fase 1: nombre, logo, branding, datos fiscales)
- `payment_configs` — credenciales MP cifradas en reposo

#### Grupo: Staff
- `users` — ADMIN / OPERATOR (email, password_hash BCrypt)
- `roles` + `user_roles` — M:N

#### Grupo: Catálogo
- `categories` — árbol simple (parent_id nullable)
- `products` — estado: DRAFT / ACTIVE / ARCHIVED
- `product_images` — URLs externas, sort_order, is_primary
- `product_variants` — SKU, atributos JSONB, price_override, stock_available / reserved / sold
- `stock_movements` — append-only: MANUAL_ADJUSTMENT / SALE / RESERVATION / RESERVATION_RELEASE / REFUND

#### Grupo: Comprador
- `customers` — email, password_hash BCrypt, nombre, teléfono
- `customer_addresses` — múltiples por customer, is_default

#### Grupo: Carrito
- `carts` — session_id, customer_id nullable, expires_at (TTL 7 días)
- `cart_items` — variant_id, quantity, unit_price_snapshot

#### Grupo: Pedido + Pago + Envío
- `orders` — order_number (ORD-2026-XXXXX), buyer_snapshot JSONB, status enum
- `order_items` — product_snapshot JSONB, unit_price, subtotal
- `payments` — preference_id, external_reference (=order_number), payment_id, raw_payload JSONB
- `mp_webhook_events` — notification_id UNIQUE, idempotencia MP
- `shipments` — status enum, carrier, tracking_code, delivered_at

#### Tablas Fase 2 (no implementar ahora)
coupons, attribute_definitions, attribute_values, reviews, wishlists, newsletter_subscriptions, suppliers, email_templates, invoice_data, tenant

### Diagrama de relaciones

```
stores ─── payment_configs

users ─── user_roles ─── roles

categories ─┬── products ─── product_images
             │          └─── product_variants ─── stock_movements

customers ──── customer_addresses
         └──── carts ─── cart_items ─── product_variants
         └──── orders ─── order_items ─── product_variants
                    └──── payments ─── mp_webhook_events
                    └──── shipments
```

### Flujo de checkout (crítico)

```
1. GET /api/v1/cart → resumen del carrito
2. POST /api/v1/checkout
   a. SELECT FOR UPDATE en product_variants → verificar stock
   b. Crear ORDER (CREATED) + ORDER_ITEMS con snapshots JSONB
   c. stock_available -= qty, stock_reserved += qty
   d. INSERT stock_movements (RESERVATION)
   e. Crear preference en MP API (items, payer, back_urls, notification_url, external_reference=order_number, expires 30min)
   f. Crear PAYMENT (PENDING) con preference_id
   g. ORDER → PENDING_PAYMENT
   h. Responder con init_point URL
3. Browser redirige a MP → comprador paga
4. MP envía POST /api/v1/webhooks/mp
   a. Verificar firma x-signature
   b. INSERT INTO mp_webhook_events ON CONFLICT DO NOTHING → si duplicado, return 200
   c. GET /v1/payments/{id} en API MP → datos completos
   d. Mapear status MP → status interno
   e. Actualizar PAYMENT, ORDER, stock
   f. Si APPROVED: stock_reserved -= qty, stock_sold += qty, INSERT stock_movements(SALE), crear SHIPMENT(PENDING), enviar email
   g. Si REJECTED/CANCELLED: stock_reserved -= qty, stock_available += qty, INSERT stock_movements(RESERVATION_RELEASE)
   h. Marcar webhook PROCESSED, return 200
5. Browser recibe redirect de back_url (success/failure/pending)
```

---

## Componente 2: Frontend Admin (Angular)

**Stack:** Angular 15.x + TypeScript + Angular Material  
**Puerto:** :4201 (dev) → :81 (Docker)  
**Auth:** JWT de USER (staff)

### Pantallas Fase 1
- Login
- Dashboard (pedidos recientes, stock bajo, resumen ventas)
- Catálogo: listado de categorías / productos / variantes
- Gestión de pedidos: listado, detalle, cambio de estado de envío
- Vista de clientes
- Config de la tienda (nombre, logo, colores, redes)
- Config de Mercado Pago

---

## Componente 3: Frontend Storefront (Angular)

**Stack:** Angular 15.x + TypeScript + Angular Material  
**Puerto:** :4200 (dev) → :80 (Docker)  
**Auth:** JWT de CUSTOMER

### Pantallas Fase 1
- Inicio (banner, categorías destacadas, productos nuevos)
- Listado de productos + filtro por categoría + búsqueda
- Detalle de producto (fotos, variantes, stock, agregar al carrito)
- Carrito
- Checkout → redirect a MP
- Resultado post-pago (success/pending/failure)
- Historial de pedidos del comprador
- Registro y login de comprador

---

## Infraestructura de deploy

### Por cliente (Fase 1)

```bash
# VM asignada: DEBUG .170 → Puerto 17050
# Hostname: confirmar en PENDIENTE-NOIP-SSL-CONFIG.md
# Nginx MAIN: proxy_pass → vm-debug:17050

docker-compose.yml
  ├── db:     postgres:16-alpine + volumen persistente
  ├── cache:  redis:alpine
  ├── api:    storecore-backend:latest (:9090)
  ├── admin:  storecore-admin:latest (:81)
  └── store:  storecore-storefront:latest (:80)
```

### Variables de entorno (.env, nunca en git)

```env
# Base de datos
POSTGRES_DB=storecore_cliente1
POSTGRES_USER=storecore
POSTGRES_PASSWORD=...

# JWT — generar par RSA único por cliente
JWT_PRIVATE_KEY=...
JWT_PUBLIC_KEY=...

# Mercado Pago — ingresar desde panel admin post-deploy
# (se cifran en BD, no en .env directamente)
MP_ENCRYPTION_KEY=...   # para cifrar el access_token en BD

# Email (SMTP)
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=...
MAIL_PASSWORD=...  # App Password de Gmail

# Redis
REDIS_HOST=cache
REDIS_PORT=6379

# Cloudinary (imágenes de productos)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

### CI/CD (GitHub Actions)
- Self-hosted runner en VM DEBUG
- Trigger: push a `master`
- Pipeline: build → test → docker build → docker compose up -d

### Checklist pre-deploy por cliente
Ver `07-RUNBOOK-DEPLOY-CLIENTE.md` completo. Los pasos críticos son:
1. Crear VM (Ubuntu 22.04), instalar Docker + GitHub Actions runner
2. Configurar Nginx en MAIN (proxy + SSL + Certbot)
3. Generar RSA keypair para JWT
4. Completar `.env` con variables del cliente
5. Primer deploy via GitHub Actions
6. Configurar MP credentials desde el panel admin
7. Cargar categorías y productos de prueba
8. Test con sandbox MP
9. Onboarding fiscal con contador del cliente (ver doc 08)

---

## Patrones de referencia (reusar de proyectos existentes)

| Patrón | Referencia | Archivo |
|--------|-----------|---------|
| Arquitectura hexagonal (ports & adapters) | AssistTime | `backend/Assist-Time/src/.../domain/port/` |
| Dual authentication (dos filter chains) | AssistTime | `infrastructure/config/SecurityConfig.kt` |
| BaseResponse wrapper | AssistTime / GoodLife | `application/dto/response/BaseResponse.kt` |
| JWT RSA + JwtExtensions | GoodLife | `infrastructure/security/JwtExtensions.kt` |
| TokenService (extraído del controller) | GoodLife v2.0.0 | `application/service/TokenService.kt` |
| Refresh token revocation | GoodLife v2.0.0 | `domain/entity/user/RefreshTokenEntity.kt` |
| Docker Compose + .env pattern | AssistTime | `backend/Assist-Time/docker-compose.yml` |
| Flyway migrations (V1..Vn) | AssistTime | `src/main/resources/db/migration/` |
| GlobalExceptionHandler | GoodLife / AssistTime | `infrastructure/exception/GlobalExceptionHandler.kt` |
| Spring Mail SMTP | AssistTime | `infrastructure/mail/` |
| Cloudinary image upload | GoodLife v2.0.0 | `application/service/CloudinaryService.kt` |
| GitHub Actions self-hosted runner | AssistTime | `.github/workflows/` |
| Nginx config + SSL | SERVER DATA | `02-deploy/CONFIGURAR-SSH-VM-BETA.md` |
