> **SUPERSEDED 2026-09-21:** ver sdd/wip/20260921-single-tenant-installation-baseline/. Histórico; no implementar.

# Diccionario canónico V1 — StoreCore

**Estado:** superseded — DDL histórico; no Flyway ni código.  
**Motor:** PostgreSQL 16. Este documento es el contrato de Flyway V1; no es una migración ejecutada.

> **HISTÓRICO — NO IMPLEMENTAR.** `sdd/specs/*` y `docs/04-MODELO-DATOS-MVP.md` son legado. El modelo vivo es `20260921-single-tenant-installation-baseline`. Este documento no overridea nada implementable.

## Convenciones y alcance

- Todos los IDs son `BIGINT GENERATED ALWAYS AS IDENTITY`. Toda fecha es `TIMESTAMPTZ`.
- `NUMERIC(14,2)` representa importes ARS; no se almacenan flotantes monetarios.
- Toda tabla tenant contiene `store_id BIGINT NOT NULL`. Una relación entre aggregates tenant usa FK compuesta `(store_id, parent_id)`, por lo que PostgreSQL impide el cruce de tenants. `roles` es el único catálogo global. `store_hosts` y `payment_configs` se anclan directamente a `stores(id)` porque no eligen un padre tenant de otra clase.
- No hay borrado físico de tiendas, usuarios, clientes, productos, pedidos, pagos, movimientos, hosts ni configuraciones de pago. Las FKs usan `ON DELETE RESTRICT`, salvo `cart_items → carts`, que usa `ON DELETE CASCADE` para la limpieza controlada de carritos expirados.
- La aplicación normaliza emails y hosts antes de persistir. Las constraints de host son una defensa adicional, no reemplazan la validación IDNA/punycode de aplicación.
- `updated_at` debe actualizarse por aplicación o trigger explícito de la migración; PostgreSQL no lo actualiza automáticamente con `DEFAULT`.

## DDL contractual V1

```sql
CREATE TABLE stores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  catalog_profile VARCHAR(16) NOT NULL DEFAULT 'GENERIC',
  logo_url VARCHAR(2048) NULL,
  banner_url VARCHAR(2048) NULL,
  favicon_url VARCHAR(2048) NULL,
  primary_color CHAR(7) NULL,
  secondary_color CHAR(7) NULL,
  homepage_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  locale VARCHAR(16) NOT NULL DEFAULT 'es-AR',
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  pickup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  self_ship_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  carrier_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  flat_shipping_caba NUMERIC(14,2) NULL,
  flat_shipping_interior NUMERIC(14,2) NULL,
  shipping_mode_default VARCHAR(16) NOT NULL DEFAULT 'SELF_SHIP',
  return_policy TEXT NULL,
  terms_policy TEXT NULL,
  privacy_policy TEXT NULL,
  shipping_policy TEXT NULL,
  legal_name VARCHAR(160) NULL,
  tax_id VARCHAR(32) NULL,
  tax_regime VARCHAR(64) NULL,
  public_email VARCHAR(320) NULL,
  public_phone VARCHAR(64) NULL,
  address_line VARCHAR(250) NULL,
  city VARCHAR(100) NULL,
  province VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  social_instagram_url VARCHAR(2048) NULL,
  social_facebook_url VARCHAR(2048) NULL,
  social_tiktok_url VARCHAR(2048) NULL,
  seo_title VARCHAR(160) NULL,
  seo_description VARCHAR(320) NULL,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stores_public_id UNIQUE (public_id),
  CONSTRAINT uq_stores_slug UNIQUE (slug),
  CONSTRAINT ck_stores_slug_normalized CHECK (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT ck_stores_catalog_profile CHECK (catalog_profile IN ('CLOTHING', 'HARDWARE', 'FOOD', 'GENERIC')),
  CONSTRAINT ck_stores_primary_color CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_stores_secondary_color CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_stores_homepage_sections_array CHECK (jsonb_typeof(homepage_sections) = 'array'),
  CONSTRAINT ck_stores_currency CHECK (currency = 'ARS'),
  CONSTRAINT ck_stores_shipping_amounts CHECK (
    (flat_shipping_caba IS NULL OR flat_shipping_caba >= 0)
    AND (flat_shipping_interior IS NULL OR flat_shipping_interior >= 0)
  ),
  CONSTRAINT ck_stores_shipping_enabled CHECK (pickup_enabled OR self_ship_enabled OR carrier_enabled),
  CONSTRAINT ck_stores_shipping_default CHECK (
    (shipping_mode_default = 'PICKUP' AND pickup_enabled)
    OR (shipping_mode_default = 'SELF_SHIP' AND self_ship_enabled)
    OR (shipping_mode_default = 'CARRIER' AND carrier_enabled)
  )
);

CREATE TABLE store_hosts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  host_normalized VARCHAR(253) NOT NULL,
  surface VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_store_hosts_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT uq_store_hosts_host UNIQUE (host_normalized),
  CONSTRAINT uq_store_hosts_surface UNIQUE (store_id, surface),
  CONSTRAINT ck_store_hosts_surface CHECK (surface IN ('STOREFRONT', 'ADMIN')),
  CONSTRAINT ck_store_hosts_normalized CHECK (
    host_normalized = lower(btrim(host_normalized))
    AND host_normalized <> ''
    AND host_normalized !~ '[:/[:space:]]'
    AND right(host_normalized, 1) <> '.'
  )
);

CREATE TABLE roles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  description VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_roles_code UNIQUE (code),
  CONSTRAINT ck_roles_code CHECK (code IN ('ADMIN', 'OPERATOR'))
);

CREATE TABLE payment_configs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'MERCADO_PAGO',
  public_key VARCHAR(512) NULL,
  access_token_ciphertext BYTEA NULL,
  access_token_nonce BYTEA NULL,
  webhook_secret_ciphertext BYTEA NULL,
  webhook_secret_nonce BYTEA NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  callback_key VARCHAR(128) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_payment_configs_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT uq_payment_configs_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_payment_configs_callback_key UNIQUE (callback_key),

  CONSTRAINT ck_payment_configs_provider CHECK (provider = 'MERCADO_PAGO'),
  CONSTRAINT ck_payment_configs_key_version CHECK (encryption_key_version > 0),
  CONSTRAINT ck_payment_configs_callback_key CHECK (callback_key ~ '^[A-Za-z0-9_-]{32,128}$'),
  CONSTRAINT ck_payment_configs_access_token_pair CHECK (
    (access_token_ciphertext IS NULL AND access_token_nonce IS NULL)
    OR (access_token_ciphertext IS NOT NULL AND octet_length(access_token_ciphertext) > 0 AND octet_length(access_token_nonce) = 12)
  ),
  CONSTRAINT ck_payment_configs_webhook_secret_pair CHECK (
    (webhook_secret_ciphertext IS NULL AND webhook_secret_nonce IS NULL)
    OR (webhook_secret_ciphertext IS NOT NULL AND octet_length(webhook_secret_ciphertext) > 0 AND octet_length(webhook_secret_nonce) = 12)
  ),
  CONSTRAINT ck_payment_configs_active_complete CHECK (
    NOT active OR (public_key IS NOT NULL AND access_token_ciphertext IS NOT NULL AND access_token_nonce IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_payment_configs_active_provider ON payment_configs (store_id, provider) WHERE active;

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  email_normalized VARCHAR(320) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT uq_users_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_users_store_email UNIQUE (store_id, email_normalized),
  CONSTRAINT ck_users_email_normalized CHECK (email_normalized = lower(btrim(email_normalized)) AND position('@' IN email_normalized) > 1),
  CONSTRAINT ck_users_password_hash CHECK (password_hash LIKE '$2%')
);

CREATE TABLE user_roles (
  store_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_user_roles PRIMARY KEY (store_id, user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (store_id, user_id) REFERENCES users(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_categories_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_categories_parent FOREIGN KEY (store_id, parent_id) REFERENCES categories(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_categories_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_categories_store_slug UNIQUE (store_id, slug),
  CONSTRAINT ck_categories_slug_normalized CHECK (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT ck_categories_sort_order CHECK (sort_order >= 0)
);
CREATE INDEX ix_categories_store_parent_sort ON categories (store_id, parent_id, sort_order);

CREATE TABLE products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  category_id BIGINT NULL,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  description TEXT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'PHYSICAL',
  base_price NUMERIC(14,2) NOT NULL,
  option_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_products_category FOREIGN KEY (store_id, category_id) REFERENCES categories(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_products_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_products_store_slug UNIQUE (store_id, slug),
  CONSTRAINT ck_products_slug_normalized CHECK (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT ck_products_kind CHECK (kind = 'PHYSICAL'),
  CONSTRAINT ck_products_base_price CHECK (base_price >= 0),
  CONSTRAINT ck_products_option_schema_array CHECK (jsonb_typeof(option_schema) = 'array'),
  CONSTRAINT ck_products_status CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);
CREATE INDEX ix_products_store_status ON products (store_id, status);

CREATE TABLE product_images (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  url VARCHAR(2048) NOT NULL,
  alt_text VARCHAR(250) NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_product_images_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_images_product FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_product_images_store_id UNIQUE (store_id, id),
  CONSTRAINT ck_product_images_url CHECK (url ~ '^https://'),
  CONSTRAINT ck_product_images_sort_order CHECK (sort_order >= 0)
);
CREATE UNIQUE INDEX uq_product_images_primary ON product_images (store_id, product_id) WHERE is_primary;
CREATE INDEX ix_product_images_store_product_sort ON product_images (store_id, product_id, sort_order);

CREATE TABLE product_variants (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  image_id BIGINT NULL,
  sku VARCHAR(128) NOT NULL,
  label VARCHAR(200) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_override NUMERIC(14,2) NULL,
  stock_available INTEGER NOT NULL DEFAULT 0,
  stock_reserved INTEGER NOT NULL DEFAULT 0,
  stock_sold INTEGER NOT NULL DEFAULT 0,
  weight_grams INTEGER NULL,
  barcode VARCHAR(128) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_product_variants_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_variants_product FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_variants_image FOREIGN KEY (store_id, image_id) REFERENCES product_images(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_product_variants_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_product_variants_store_sku UNIQUE (store_id, sku),
  CONSTRAINT ck_product_variants_attributes_object CHECK (jsonb_typeof(attributes) = 'object'),
  CONSTRAINT ck_product_variants_price_override CHECK (price_override IS NULL OR price_override >= 0),
  CONSTRAINT ck_product_variants_stock CHECK (stock_available >= 0 AND stock_reserved >= 0 AND stock_sold >= 0),
  CONSTRAINT ck_product_variants_weight CHECK (weight_grams IS NULL OR weight_grams >= 0)
);
CREATE INDEX ix_product_variants_store_product ON product_variants (store_id, product_id);

CREATE TABLE stock_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  delta INTEGER NOT NULL,
  type VARCHAR(32) NOT NULL,
  reference_id BIGINT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_stock_movements_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_variant FOREIGN KEY (store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_stock_movements_store_id UNIQUE (store_id, id),
  CONSTRAINT ck_stock_movements_type CHECK (type IN ('RESERVATION', 'RESERVATION_RELEASE', 'SALE', 'REFUND', 'MANUAL_ADJUSTMENT'))
);
CREATE INDEX ix_stock_movements_store_variant_created ON stock_movements (store_id, variant_id, created_at DESC);

CREATE TABLE customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  email_normalized VARCHAR(320) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(64) NULL,
  document_type VARCHAR(32) NULL,
  document_number VARCHAR(32) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT uq_customers_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_customers_store_email UNIQUE (store_id, email_normalized),
  CONSTRAINT ck_customers_email_normalized CHECK (email_normalized = lower(btrim(email_normalized)) AND position('@' IN email_normalized) > 1),
  CONSTRAINT ck_customers_password_hash CHECK (password_hash LIKE '$2%'),
  CONSTRAINT ck_customers_document_pair CHECK ((document_type IS NULL AND document_number IS NULL) OR (document_type IS NOT NULL AND document_number IS NOT NULL))
);

CREATE TABLE customer_addresses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  label VARCHAR(80) NULL,
  street VARCHAR(160) NOT NULL,
  street_number VARCHAR(20) NOT NULL,
  floor VARCHAR(20) NULL,
  apartment VARCHAR(20) NULL,
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_customer_addresses_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_customer_addresses_store_id UNIQUE (store_id, id)
);
CREATE UNIQUE INDEX uq_customer_addresses_default ON customer_addresses (store_id, customer_id) WHERE is_default;

CREATE TABLE carts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  customer_id BIGINT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_carts_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_carts_customer FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_carts_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_carts_store_session UNIQUE (store_id, session_id),
  CONSTRAINT ck_carts_session_id CHECK (btrim(session_id) <> '')
);
CREATE INDEX ix_carts_expires_at ON carts (expires_at);

CREATE TABLE cart_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  cart_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_snapshot NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_cart_items_cart FOREIGN KEY (store_id, cart_id) REFERENCES carts(store_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_items_variant FOREIGN KEY (store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_cart_items_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_cart_items_variant UNIQUE (store_id, cart_id, variant_id),
  CONSTRAINT ck_cart_items_quantity CHECK (quantity > 0),
  CONSTRAINT ck_cart_items_unit_price CHECK (unit_price_snapshot >= 0)
);

CREATE TABLE orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  order_number VARCHAR(64) NOT NULL,
  customer_id BIGINT NULL,
  buyer_snapshot JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  subtotal NUMERIC(14,2) NOT NULL,
  shipping_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  fulfillment_method VARCHAR(16) NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_customer FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_orders_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_orders_store_number UNIQUE (store_id, order_number),
  CONSTRAINT ck_orders_number CHECK (btrim(order_number) <> ''),
  CONSTRAINT ck_orders_buyer_snapshot_object CHECK (jsonb_typeof(buyer_snapshot) = 'object'),
  CONSTRAINT ck_orders_status CHECK (status IN ('CREATED', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
  CONSTRAINT ck_orders_amounts CHECK (subtotal >= 0 AND shipping_cost >= 0 AND total = subtotal + shipping_cost),
  CONSTRAINT ck_orders_currency CHECK (currency = 'ARS'),
  CONSTRAINT ck_orders_fulfillment_method CHECK (fulfillment_method IS NULL OR fulfillment_method IN ('PICKUP', 'SELF_SHIP', 'CARRIER'))
);
CREATE INDEX ix_orders_store_created ON orders (store_id, created_at DESC);

CREATE TABLE order_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  product_snapshot JSONB NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_order_items_order FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_order_items_variant FOREIGN KEY (store_id, variant_id) REFERENCES product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_order_items_store_id UNIQUE (store_id, id),
  CONSTRAINT ck_order_items_snapshot_object CHECK (jsonb_typeof(product_snapshot) = 'object'),
  CONSTRAINT ck_order_items_quantity CHECK (quantity > 0),
  CONSTRAINT ck_order_items_amounts CHECK (unit_price >= 0 AND subtotal = quantity * unit_price)
);
CREATE INDEX ix_order_items_store_order ON order_items (store_id, order_id);

CREATE TABLE payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'MERCADO_PAGO',
  preference_id VARCHAR(128) NULL,
  payment_id VARCHAR(128) NULL,
  merchant_order_id VARCHAR(128) NULL,
  external_reference VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  status_detail VARCHAR(128) NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  payment_method_id VARCHAR(64) NULL,
  payment_type_id VARCHAR(64) NULL,
  installments INTEGER NULL,
  date_created TIMESTAMPTZ NULL,
  date_approved TIMESTAMPTZ NULL,
  raw_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_payments_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_order FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_payments_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_payments_external_reference UNIQUE (external_reference),
  CONSTRAINT ck_payments_provider CHECK (provider = 'MERCADO_PAGO'),
  CONSTRAINT ck_payments_external_reference CHECK (external_reference ~ '^sc1:[0-9a-fA-F-]{36}:.+$'),
  CONSTRAINT ck_payments_status CHECK (status IN ('PENDING', 'APPROVED', 'IN_PROCESS', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK')),
  CONSTRAINT ck_payments_amount CHECK (amount >= 0),
  CONSTRAINT ck_payments_currency CHECK (currency = 'ARS'),
  CONSTRAINT ck_payments_installments CHECK (installments IS NULL OR installments > 0),
  CONSTRAINT ck_payments_raw_payload_object CHECK (raw_payload IS NULL OR jsonb_typeof(raw_payload) IN ('object', 'array'))
);
CREATE INDEX ix_payments_store_order ON payments (store_id, order_id);

CREATE TABLE mp_webhook_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'MERCADO_PAGO',
  notification_id VARCHAR(128) NOT NULL,
  topic VARCHAR(128) NOT NULL,
  resource_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  failure_reason VARCHAR(500) NULL,
  CONSTRAINT fk_mp_webhook_events_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT uq_mp_webhook_events_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_mp_webhook_events_notification UNIQUE (provider, notification_id),
  CONSTRAINT ck_mp_webhook_events_provider CHECK (provider = 'MERCADO_PAGO'),
  CONSTRAINT ck_mp_webhook_events_notification CHECK (btrim(notification_id) <> ''),
  CONSTRAINT ck_mp_webhook_events_payload CHECK (jsonb_typeof(payload) IN ('object', 'array')),
  CONSTRAINT ck_mp_webhook_events_status CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'UNMATCHED')),
  CONSTRAINT ck_mp_webhook_events_processed CHECK ((status = 'RECEIVED' AND processed_at IS NULL) OR (status <> 'RECEIVED'))
);
CREATE INDEX ix_mp_webhook_events_store_status_received ON mp_webhook_events (store_id, status, received_at);

CREATE TABLE shipments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  carrier VARCHAR(100) NULL,
  tracking_code VARCHAR(128) NULL,
  shipped_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_shipments_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_shipments_order FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT uq_shipments_store_id UNIQUE (store_id, id),
  CONSTRAINT uq_shipments_store_order UNIQUE (store_id, order_id),
  CONSTRAINT ck_shipments_status CHECK (status IN ('PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED')),
  CONSTRAINT ck_shipments_delivered_at CHECK (delivered_at IS NULL OR shipped_at IS NULL OR delivered_at >= shipped_at)
);
CREATE INDEX ix_shipments_store_status ON shipments (store_id, status);
```

## Orden, seeds y gates de Flyway

1. Crear `stores`, `store_hosts`, `roles`, `payment_configs`, `users`, `user_roles`, `categories`, `products`, `product_images`, `product_variants`, `stock_movements`, `customers`, `customer_addresses`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `mp_webhook_events`, `shipments` en ese orden.
2. Sembrar exclusivamente `roles(code, description)`: `ADMIN` / `Administrador de tienda` y `OPERATOR` / `Operador de tienda`. No se siembran stores, hosts, usuarios ni secretos.
3. El provision inserta una fila `stores`, exactamente una fila `store_hosts` `STOREFRONT`, una `ADMIN` opcional y el primer USER ADMIN en una transacción. `primary_host`/`admin_host` no son columnas.
4. Testcontainers debe verificar: host globalmente duplicado; segunda surface por store; producto/categoría cross-store; item/variant cross-store; payment/order cross-store; shipment/order cross-store; y duplicado `(provider, notification_id)`. Todos deben fallar por constraint PostgreSQL.
5. Antes de SQL ejecutable, Sol debe revisar el DDL y decidir GO/NO-GO. Este archivo no cambia el estado de release, no agrega Git allowlist y no autoriza código.

## Fuera de V1

`refresh_tokens`, cupones, lotes/vencimientos, catálogo de atributos, reviews, wishlist, proveedores, factura electrónica y tablas dinámicas. Cualquier relación tenant nueva debe repetir la estrategia de FK compuesta de este contrato.