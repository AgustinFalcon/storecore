# Modelo de datos V1 — `storecore-core-v1.0.0`

**Status:** `ready_for_sol_review`. V1 is the TASK-002 canonical schema. No `store_id`, shared tenant runtime, BlackStore persistence, fiscal persistence or deferred business objects are added by V1.

## Convenciones e invariantes

IDs use `BIGINT GENERATED ALWAYS AS IDENTITY`; timestamps are `TIMESTAMPTZ`; money is `NUMERIC(14,2)`. V1 append-only facts and checkout/order evidence are database-protected. Corrections append new facts; workers mutate only their dedicated processing/delivery projections.

## DDL contractual V1

```sqlCREATE TABLE installation_settings (
 installation_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(installation_id=1), business_name VARCHAR(160) NOT NULL,
 allowed_host VARCHAR(253) NOT NULL UNIQUE, currency CHAR(3) NOT NULL DEFAULT 'ARS', timezone VARCHAR(64) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(currency='ARS')
);
-- Provisioning inserts the sole row with installation_id=1; application startup fails closed if it is absent and no merchant selector exists.
CREATE TABLE capability_modules (
 module_code VARCHAR(40) PRIMARY KEY, scope_kind VARCHAR(24) NOT NULL DEFAULT 'INSTALLATION', future_optional BOOLEAN NOT NULL DEFAULT FALSE,
 CHECK(module_code IN ('STOREFRONT','CATALOG','PROFILE_CONTENT','PAYMENTS_MP','MANUAL_FULFILLMENT','MARKETPLACE_ML','MANUAL_PROMOTIONS','ML_COMPETITION_INSIGHTS','ML_PRICE_AUTOMATION','ML_PROMOTION_ORCHESTRATOR','WEB_CROSS_SELL_DISCOUNTS','COMMERCIAL_CALENDAR','FAVORITES','LOYALTY','CARRIERS','ML_VIRTUAL_KITS')),
 CHECK(scope_kind='INSTALLATION')
);
CREATE TABLE capability_actions (
 module_code VARCHAR(40) NOT NULL REFERENCES capability_modules(module_code) ON DELETE RESTRICT, action_code VARCHAR(64) NOT NULL, allows_write BOOLEAN NOT NULL,
 PRIMARY KEY(module_code, action_code)
);
CREATE TABLE module_configurations (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, module_code VARCHAR(40) NOT NULL REFERENCES capability_modules(module_code) ON DELETE RESTRICT,
 scope_kind VARCHAR(24) NOT NULL DEFAULT 'INSTALLATION', scope_key VARCHAR(64) NOT NULL DEFAULT 'DEFAULT', state VARCHAR(16) NOT NULL DEFAULT 'DISABLED', config_version INTEGER NOT NULL DEFAULT 1, config JSONB NOT NULL DEFAULT '{}'::jsonb, updated_by BIGINT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(module_code,scope_kind,scope_key), CHECK(scope_kind='INSTALLATION'), CHECK(scope_key='DEFAULT'), CHECK(config_version>0), CHECK(state IN ('DISABLED','READ_ONLY','ACTIVE','PAUSED','ERROR')), CHECK(jsonb_typeof(config)='object')
);
CREATE TABLE capability_kill_switches (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, module_code VARCHAR(40) NOT NULL, action_code VARCHAR(64) NOT NULL,
 scope_kind VARCHAR(24) NOT NULL DEFAULT 'INSTALLATION', scope_key VARCHAR(64) NOT NULL DEFAULT 'DEFAULT', owner VARCHAR(160) NOT NULL, reason VARCHAR(500) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, removal_ticket VARCHAR(100) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), removed_at TIMESTAMPTZ NULL,
 FOREIGN KEY(module_code,action_code) REFERENCES capability_actions(module_code,action_code) ON DELETE RESTRICT,
 CHECK(scope_kind='INSTALLATION'), CHECK(scope_key='DEFAULT'), CHECK(expires_at > created_at), CHECK((active AND removed_at IS NULL) OR (NOT active AND removed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_active_capability_kill_switch ON capability_kill_switches(module_code,action_code,scope_kind,scope_key) WHERE active;
INSERT INTO capability_modules(module_code,future_optional) VALUES
 ('STOREFRONT',FALSE),('CATALOG',FALSE),('PROFILE_CONTENT',FALSE),('PAYMENTS_MP',FALSE),('MANUAL_FULFILLMENT',FALSE),('MARKETPLACE_ML',FALSE),('MANUAL_PROMOTIONS',FALSE),
 ('ML_COMPETITION_INSIGHTS',TRUE),('ML_PRICE_AUTOMATION',TRUE),('ML_PROMOTION_ORCHESTRATOR',TRUE),('WEB_CROSS_SELL_DISCOUNTS',TRUE),('COMMERCIAL_CALENDAR',TRUE),('FAVORITES',TRUE),('LOYALTY',TRUE),('CARRIERS',TRUE),('ML_VIRTUAL_KITS',TRUE);
INSERT INTO capability_actions(module_code,action_code,allows_write) VALUES
 ('STOREFRONT','SERVE',FALSE),('CATALOG','MANAGE',TRUE),('PROFILE_CONTENT','MANAGE',TRUE),('PAYMENTS_MP','PROCESS_WEBHOOK',TRUE),('MANUAL_FULFILLMENT','MANAGE',TRUE),('MARKETPLACE_ML','SYNC',TRUE),('MANUAL_PROMOTIONS','WRITE_PRICE',TRUE),
 ('ML_COMPETITION_INSIGHTS','READ_SIGNALS',FALSE),('ML_PRICE_AUTOMATION','WRITE_PRICE',TRUE),('ML_PROMOTION_ORCHESTRATOR','PUBLISH_PROMOTION',TRUE),('WEB_CROSS_SELL_DISCOUNTS','APPLY_DISCOUNT',TRUE),('COMMERCIAL_CALENDAR','ACTIVATE_CAMPAIGN',TRUE),('FAVORITES','MANAGE',TRUE),('LOYALTY','POST_LEDGER',TRUE),('CARRIERS','SYNC',TRUE),('ML_VIRTUAL_KITS','MANAGE',TRUE);
INSERT INTO module_configurations(module_code,scope_kind,scope_key,state) SELECT module_code,'INSTALLATION','DEFAULT','DISABLED' FROM capability_modules;
CREATE FUNCTION enforce_future_optional_module_configuration() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF EXISTS (SELECT 1 FROM capability_modules WHERE module_code=NEW.module_code AND future_optional=TRUE) AND NEW.state <> 'DISABLED' THEN RAISE EXCEPTION 'future optional module % must remain DISABLED', NEW.module_code; END IF;
 RETURN NEW;
END;
$_$;
CREATE TRIGGER trg_enforce_future_optional_module_configuration BEFORE INSERT OR UPDATE OF module_code,state ON module_configurations FOR EACH ROW EXECUTE FUNCTION enforce_future_optional_module_configuration();
CREATE FUNCTION prevent_future_optional_activation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF NEW.future_optional=TRUE AND EXISTS (SELECT 1 FROM module_configurations WHERE module_code=NEW.module_code AND state <> 'DISABLED') THEN RAISE EXCEPTION 'cannot mark active module % as future optional', NEW.module_code; END IF;
 RETURN NEW;
END;
$_$;
CREATE TRIGGER trg_prevent_future_optional_activation BEFORE UPDATE OF future_optional ON capability_modules FOR EACH ROW EXECUTE FUNCTION prevent_future_optional_activation();
CREATE TABLE universal_profile_imports (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, profile_name VARCHAR(120) NOT NULL, profile_version VARCHAR(32) NOT NULL,
 core_compatibility VARCHAR(64) NOT NULL, diff_snapshot JSONB NOT NULL, merge_selection JSONB NOT NULL, imported_by BIGINT NULL,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(profile_name='universal-tools-profile'), CHECK(jsonb_typeof(diff_snapshot)='object'), CHECK(jsonb_typeof(merge_selection)='object')
);
CREATE TABLE roles (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code VARCHAR(32) NOT NULL UNIQUE, description VARCHAR(160) NOT NULL, CHECK(code IN ('ADMIN','OPERATOR')));
CREATE TABLE users (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, password_hash VARCHAR(100) NOT NULL, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(email=lower(btrim(email)) AND password_hash LIKE '$2%'));
ALTER TABLE module_configurations ADD CONSTRAINT fk_module_configurations_updated_by FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE RESTRICT;
CREATE TABLE user_roles (user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT, PRIMARY KEY(user_id,role_id));
CREATE TABLE customers (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, password_hash VARCHAR(100) NOT NULL, first_name VARCHAR(100) NOT NULL, last_name VARCHAR(100) NOT NULL, phone VARCHAR(64) NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(email=lower(btrim(email)) AND password_hash LIKE '$2%'));
CREATE TABLE customer_addresses (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, street VARCHAR(160) NOT NULL, number VARCHAR(20) NOT NULL, city VARCHAR(100) NOT NULL, province VARCHAR(100) NOT NULL, postal_code VARCHAR(20) NOT NULL, is_default BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX uq_customer_default_address ON customer_addresses(customer_id) WHERE is_default;

CREATE TABLE brands (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL UNIQUE, description TEXT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(slug=lower(btrim(slug))));
CREATE TABLE categories (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, parent_id BIGINT NULL REFERENCES categories(id) ON DELETE RESTRICT, name VARCHAR(160) NOT NULL, slug VARCHAR(160) NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(slug=lower(btrim(slug)) AND sort_order>=0));
CREATE TABLE products (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, brand_id BIGINT NULL REFERENCES brands(id) ON DELETE RESTRICT, category_id BIGINT NULL REFERENCES categories(id) ON DELETE RESTRICT, name VARCHAR(200) NOT NULL, slug VARCHAR(200) NOT NULL UNIQUE, description TEXT NULL, base_price NUMERIC(14,2) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(base_price>=0 AND status IN ('DRAFT','ACTIVE','ARCHIVED')));
CREATE TABLE product_variants (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT, sku VARCHAR(128) NOT NULL UNIQUE, label VARCHAR(200) NOT NULL, attributes JSONB NOT NULL DEFAULT '{}'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(jsonb_typeof(attributes)='object'));
CREATE TABLE product_images (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT, url VARCHAR(2048) NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_primary BOOLEAN NOT NULL DEFAULT FALSE, CHECK(url ~ '^https://' AND sort_order>=0));
CREATE UNIQUE INDEX uq_product_primary_image ON product_images(product_id) WHERE is_primary;
CREATE TABLE home_content_sections (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, section_key VARCHAR(80) NOT NULL UNIQUE, content JSONB NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0, updated_by BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(jsonb_typeof(content)='object' AND sort_order>=0));
CREATE TABLE offers (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name VARCHAR(160) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', priority INTEGER NOT NULL DEFAULT 0, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, discount_type VARCHAR(16) NOT NULL, discount_value NUMERIC(14,2) NOT NULL, min_margin_percent NUMERIC(5,2) NOT NULL, created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_by BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(status IN ('DRAFT','ACTIVE','PAUSED','ENDED') AND ends_at>starts_at AND discount_type IN ('PERCENT','FIXED') AND discount_value>0 AND min_margin_percent>=0), CHECK(status<>'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)));
CREATE TABLE offer_products (offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE RESTRICT, product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT, PRIMARY KEY(offer_id,product_id));

CREATE TABLE inventory_balances (variant_id BIGINT PRIMARY KEY REFERENCES product_variants(id) ON DELETE RESTRICT, available_quantity INTEGER NOT NULL DEFAULT 0, reserved_quantity INTEGER NOT NULL DEFAULT 0, safety_stock INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(available_quantity>=0 AND reserved_quantity>=0 AND safety_stock>=0));
CREATE TABLE inventory_reservations (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, reservation_saga_key UUID NOT NULL, reservation_line_key UUID NOT NULL UNIQUE, quantity INTEGER NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(quantity>0 AND status IN ('ACTIVE','CONSUMED','RELEASED','EXPIRED')), CHECK(expires_at>created_at), UNIQUE(reservation_saga_key,variant_id));
CREATE INDEX ix_active_inventory_reservation_expiry ON inventory_reservations(expires_at) WHERE status='ACTIVE';
CREATE TABLE inventory_ledger (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, reservation_id BIGINT NULL REFERENCES inventory_reservations(id) ON DELETE RESTRICT, event_idempotency_key UUID NOT NULL UNIQUE, event_type VARCHAR(32) NOT NULL, channel VARCHAR(32) NOT NULL, external_order_id VARCHAR(128) NULL, external_order_item_id VARCHAR(128) NULL, variation_id VARCHAR(128) NULL, quantity_delta INTEGER NOT NULL, actor VARCHAR(100) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(event_type IN ('RESERVATION','RELEASE','SALE','REFUND','RETURN_RECEIVED','ADJUSTMENT','RECONCILIATION') AND channel IN ('WEB','MERCADO_LIBRE','INTERNAL') AND quantity_delta<>0));
CREATE INDEX ix_inventory_ledger_variant_created ON inventory_ledger(variant_id,created_at DESC);

CREATE TABLE carts (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, session_id VARCHAR(128) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE cart_items (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE, variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, quantity INTEGER NOT NULL, original_unit_price NUMERIC(14,2) NOT NULL, discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0, offer_id BIGINT NULL REFERENCES offers(id) ON DELETE RESTRICT, campaign_reference VARCHAR(160) NULL, effective_unit_price NUMERIC(14,2) NOT NULL, CHECK(quantity>0 AND original_unit_price>=0 AND discount_amount>=0 AND discount_amount<=original_unit_price AND effective_unit_price=original_unit_price-discount_amount), UNIQUE(cart_id,variant_id));
CREATE TABLE checkout_idempotency_claims (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, checkout_idempotency_key UUID NOT NULL, request_hash CHAR(64) NOT NULL, checkout_snapshot JSONB NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'PENDING', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(customer_id,checkout_idempotency_key), UNIQUE(id,customer_id,checkout_idempotency_key,request_hash), CHECK(jsonb_typeof(checkout_snapshot)='object'), CHECK(state IN ('PENDING','COMPLETED','FAILED')));
CREATE TABLE orders (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_number VARCHAR(64) NOT NULL UNIQUE, checkout_claim_id BIGINT NOT NULL, checkout_idempotency_key UUID NOT NULL, checkout_request_hash CHAR(64) NOT NULL, customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, status VARCHAR(32) NOT NULL DEFAULT 'CREATED', buyer_snapshot JSONB NOT NULL, checkout_snapshot JSONB NOT NULL, subtotal NUMERIC(14,2) NOT NULL, shipping_cost NUMERIC(14,2) NOT NULL DEFAULT 0,total NUMERIC(14,2) NOT NULL,currency CHAR(3) NOT NULL DEFAULT 'ARS',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(checkout_claim_id),UNIQUE(customer_id,checkout_idempotency_key),FOREIGN KEY(checkout_claim_id,customer_id,checkout_idempotency_key,checkout_request_hash) REFERENCES checkout_idempotency_claims(id,customer_id,checkout_idempotency_key,request_hash) ON DELETE RESTRICT,CHECK(jsonb_typeof(buyer_snapshot)='object' AND jsonb_typeof(checkout_snapshot)='object' AND status IN ('CREATED','PENDING_PAYMENT','PAID','CANCELLED','EXPIRED','REFUNDED') AND subtotal>=0 AND shipping_cost>=0 AND total=subtotal+shipping_cost AND currency='ARS'));
CREATE TABLE order_items (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,offer_id BIGINT NULL REFERENCES offers(id) ON DELETE RESTRICT,campaign_reference VARCHAR(160) NULL,product_snapshot JSONB NOT NULL,quantity INTEGER NOT NULL,original_unit_price NUMERIC(14,2) NOT NULL,discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,effective_unit_price NUMERIC(14,2) NOT NULL,subtotal NUMERIC(14,2) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),CHECK(jsonb_typeof(product_snapshot)='object' AND quantity>0 AND original_unit_price>=0 AND discount_amount>=0 AND discount_amount<=original_unit_price AND effective_unit_price=original_unit_price-discount_amount AND subtotal=quantity*effective_unit_price));
CREATE TABLE payments (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT, provider VARCHAR(32) NOT NULL DEFAULT 'MERCADO_PAGO', external_reference VARCHAR(160) NOT NULL UNIQUE, provider_payment_id VARCHAR(128) NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'PENDING', amount NUMERIC(14,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'ARS', raw_payload_redacted JSONB NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(provider='MERCADO_PAGO' AND status IN ('PENDING','APPROVED','REJECTED','CANCELLED','REFUNDED','CHARGED_BACK') AND amount>=0 AND currency='ARS'));
CREATE TABLE payment_event_inbox (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, provider VARCHAR(32) NOT NULL DEFAULT 'MERCADO_PAGO', provider_event_id VARCHAR(160) NOT NULL, resource_reference VARCHAR(256) NOT NULL, envelope_redacted JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(provider,provider_event_id), CHECK(provider='MERCADO_PAGO' AND jsonb_typeof(envelope_redacted) IN ('object','array')));
CREATE TABLE payment_event_processing (inbox_id BIGINT PRIMARY KEY REFERENCES payment_event_inbox(id) ON DELETE RESTRICT, status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED', attempt_count INTEGER NOT NULL DEFAULT 0, lease_expires_at TIMESTAMPTZ NULL, locked_by VARCHAR(100) NULL, last_error VARCHAR(500) NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED') AND attempt_count>=0));
CREATE TABLE payment_event_applications (inbox_id BIGINT PRIMARY KEY REFERENCES payment_event_inbox(id) ON DELETE RESTRICT, payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE RESTRICT, resulting_status VARCHAR(32) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(resulting_status IN ('PENDING','APPROVED','REJECTED','CANCELLED','REFUNDED','CHARGED_BACK')));
CREATE TABLE integration_outbox (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, provider VARCHAR(32) NOT NULL, source_inbox_id BIGINT NOT NULL REFERENCES payment_event_inbox(id) ON DELETE RESTRICT, idempotency_key UUID NOT NULL UNIQUE, kind VARCHAR(64) NOT NULL, payload_redacted JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(provider,source_inbox_id,kind), CHECK(provider='MERCADO_PAGO' AND jsonb_typeof(payload_redacted) IN ('object','array')));
CREATE TABLE integration_outbox_delivery (outbox_id BIGINT PRIMARY KEY REFERENCES integration_outbox(id) ON DELETE RESTRICT, status VARCHAR(16) NOT NULL DEFAULT 'PENDING', attempt_count INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(), lease_expires_at TIMESTAMPTZ NULL, locked_by VARCHAR(100) NULL, last_error VARCHAR(500) NULL, sent_at TIMESTAMPTZ NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(status IN ('PENDING','SENT','FAILED','DEAD') AND attempt_count>=0));
CREATE TABLE shipments (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,status VARCHAR(32) NOT NULL DEFAULT 'PENDING',tracking_code VARCHAR(128) NULL,shipped_at TIMESTAMPTZ NULL,delivered_at TIMESTAMPTZ NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),CHECK(status IN ('PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED')),CHECK((status IN ('PENDING','PREPARING','CANCELLED') AND shipped_at IS NULL AND delivered_at IS NULL) OR (status='SHIPPED' AND shipped_at IS NOT NULL AND delivered_at IS NULL) OR (status='DELIVERED' AND shipped_at IS NOT NULL AND delivered_at IS NOT NULL AND delivered_at>=shipped_at)));
CREATE TABLE fulfillment_events (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, shipment_id BIGINT NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT, event_type VARCHAR(32) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), actor VARCHAR(100) NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb, CHECK(jsonb_typeof(details)='object'));
CREATE TABLE returns (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, rma_number VARCHAR(64) NOT NULL UNIQUE, order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT, status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED', received_at TIMESTAMPTZ NULL, inspection_result VARCHAR(32) NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(status IN ('REQUESTED','APPROVED','RETURN_RECEIVED','INSPECTED','REJECTED','CLOSED') AND (inspection_result IS NULL OR inspection_result IN ('RESTOCK','DAMAGED','REJECTED'))));
CREATE TABLE return_items (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, return_id BIGINT NOT NULL REFERENCES returns(id) ON DELETE RESTRICT, order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT, quantity INTEGER NOT NULL, adjustment_ledger_id BIGINT NULL REFERENCES inventory_ledger(id) ON DELETE RESTRICT, CHECK(quantity>0));

CREATE TABLE channel_accounts (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_key VARCHAR(100) NOT NULL UNIQUE, channel VARCHAR(32) NOT NULL, oauth_secret_reference VARCHAR(255) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'DISABLED', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(channel='MERCADO_LIBRE' AND state IN ('DISABLED','READ_ONLY','ACTIVE','PAUSED','ERROR')));
CREATE TABLE channel_listings (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES channel_accounts(id) ON DELETE RESTRICT, external_listing_id VARCHAR(128) NOT NULL, variation_id VARCHAR(128) NULL, variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, desired_quantity INTEGER NOT NULL DEFAULT 0, observed_quantity INTEGER NULL, manual_intervention_required BOOLEAN NOT NULL DEFAULT FALSE, state VARCHAR(16) NOT NULL DEFAULT 'DISABLED', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(desired_quantity>=0 AND (observed_quantity IS NULL OR observed_quantity>=0) AND state IN ('DISABLED','READ_ONLY','ACTIVE','PAUSED','ERROR')), UNIQUE NULLS NOT DISTINCT(account_id,external_listing_id,variation_id));
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE channel_price_policies (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, listing_id BIGINT NOT NULL REFERENCES channel_listings(id) ON DELETE RESTRICT, currency CHAR(3) NOT NULL DEFAULT 'ARS', price_scope VARCHAR(16) NOT NULL DEFAULT 'DEFAULT', base_price NUMERIC(14,2) NOT NULL, desired_price NUMERIC(14,2) NOT NULL, observed_price NUMERIC(14,2) NULL, effective_promo_price NUMERIC(14,2) NULL, writer_kind VARCHAR(16) NOT NULL DEFAULT 'MANUAL', status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', effective_from TIMESTAMPTZ NOT NULL, effective_to TIMESTAMPTZ NOT NULL, effective_window TSTZRANGE GENERATED ALWAYS AS (tstzrange(effective_from,effective_to,'[)')) STORED, approved_by BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(currency='ARS' AND price_scope IN ('DEFAULT','CAMPAIGN') AND base_price>=0 AND desired_price>=0 AND (observed_price IS NULL OR observed_price>=0) AND (effective_promo_price IS NULL OR effective_promo_price>=0) AND writer_kind='MANUAL' AND status IN ('DRAFT','ACTIVE','PAUSED','ENDED') AND effective_to>effective_from), CHECK(status<>'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)));
ALTER TABLE channel_price_policies ADD CONSTRAINT ex_active_price_policy_window EXCLUDE USING gist (listing_id WITH =, currency WITH =, price_scope WITH =, effective_window WITH &&) WHERE (status='ACTIVE');
CREATE TABLE ml_notification_inbox (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES channel_accounts(id) ON DELETE RESTRICT, notification_id VARCHAR(128) NOT NULL, topic VARCHAR(128) NOT NULL, resource VARCHAR(256) NOT NULL, payload_redacted JSONB NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(account_id,notification_id), CHECK(jsonb_typeof(payload_redacted) IN ('object','array')));
CREATE TABLE ml_notification_processing (inbox_id BIGINT PRIMARY KEY REFERENCES ml_notification_inbox(id) ON DELETE RESTRICT, status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED', attempt_count INTEGER NOT NULL DEFAULT 0, lease_expires_at TIMESTAMPTZ NULL, locked_by VARCHAR(100) NULL, last_error VARCHAR(500) NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED') AND attempt_count>=0));
CREATE TABLE channel_sales (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES channel_accounts(id) ON DELETE RESTRICT, external_order_id VARCHAR(128) NOT NULL, external_order_item_id VARCHAR(128) NOT NULL, variation_id VARCHAR(128) NULL, variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT, ledger_entry_id BIGINT NOT NULL REFERENCES inventory_ledger(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE NULLS NOT DISTINCT(account_id,external_order_id,external_order_item_id,variation_id));
CREATE TABLE channel_outbox (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, idempotency_key UUID NOT NULL UNIQUE, account_id BIGINT NOT NULL REFERENCES channel_accounts(id) ON DELETE RESTRICT, listing_id BIGINT NULL REFERENCES channel_listings(id) ON DELETE RESTRICT, kind VARCHAR(32) NOT NULL, payload_redacted JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(jsonb_typeof(payload_redacted) IN ('object','array')));
CREATE TABLE channel_outbox_delivery (outbox_id BIGINT PRIMARY KEY REFERENCES channel_outbox(id) ON DELETE RESTRICT, status VARCHAR(16) NOT NULL DEFAULT 'PENDING', attempt_count INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT now(), lease_expires_at TIMESTAMPTZ NULL, locked_by VARCHAR(100) NULL, last_error VARCHAR(500) NULL, sent_at TIMESTAMPTZ NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(status IN ('PENDING','SENT','FAILED','DEAD') AND attempt_count>=0));
CREATE TABLE reconciliation_runs (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, account_id BIGINT NOT NULL REFERENCES channel_accounts(id) ON DELETE RESTRICT, feed_cursor VARCHAR(256) NULL, observed_snapshot_hash CHAR(64) NULL, result VARCHAR(32) NOT NULL, manual_intervention_count INTEGER NOT NULL DEFAULT 0, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ NULL, CHECK(result IN ('RUNNING','COMPLETED','PARTIAL','FAILED') AND manual_intervention_count>=0));
CREATE TABLE audit_events (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_type VARCHAR(32) NOT NULL, actor_id VARCHAR(128) NULL, event_type VARCHAR(128) NOT NULL, aggregate_type VARCHAR(64) NOT NULL, aggregate_id BIGINT NULL, payload_redacted JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(jsonb_typeof(payload_redacted) IN ('object','array')));
CREATE FUNCTION prevent_immutable_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 RAISE EXCEPTION '% is immutable; append a correction or update its processing/delivery projection', TG_TABLE_NAME;
 RETURN NULL;
END;
$_$;
CREATE FUNCTION prevent_order_snapshot_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' OR OLD.buyer_snapshot IS DISTINCT FROM NEW.buyer_snapshot OR OLD.checkout_snapshot IS DISTINCT FROM NEW.checkout_snapshot OR OLD.checkout_claim_id IS DISTINCT FROM NEW.checkout_claim_id OR OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.checkout_idempotency_key IS DISTINCT FROM NEW.checkout_idempotency_key OR OLD.checkout_request_hash IS DISTINCT FROM NEW.checkout_request_hash THEN RAISE EXCEPTION 'order evidence is immutable'; END IF;
 RETURN NEW;
END;
$_$;
CREATE FUNCTION prevent_checkout_claim_evidence_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' OR OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.checkout_idempotency_key IS DISTINCT FROM NEW.checkout_idempotency_key OR OLD.request_hash IS DISTINCT FROM NEW.request_hash OR OLD.checkout_snapshot IS DISTINCT FROM NEW.checkout_snapshot THEN RAISE EXCEPTION 'checkout claim evidence is immutable'; END IF;
 RETURN NEW;
END;
$_$;
CREATE TRIGGER trg_prevent_immutable_inventory_ledger BEFORE UPDATE OR DELETE ON inventory_ledger FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_payment_event_inbox BEFORE UPDATE OR DELETE ON payment_event_inbox FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_payment_event_applications BEFORE UPDATE OR DELETE ON payment_event_applications FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_integration_outbox BEFORE UPDATE OR DELETE ON integration_outbox FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_ml_notification_inbox BEFORE UPDATE OR DELETE ON ml_notification_inbox FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_channel_outbox BEFORE UPDATE OR DELETE ON channel_outbox FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_audit_events BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_universal_profile_imports BEFORE UPDATE OR DELETE ON universal_profile_imports FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_order_items BEFORE UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_checkout_claim_evidence_mutation BEFORE UPDATE OR DELETE ON checkout_idempotency_claims FOR EACH ROW EXECUTE FUNCTION prevent_checkout_claim_evidence_mutation();
CREATE TRIGGER trg_prevent_order_snapshot_mutation BEFORE UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION prevent_order_snapshot_mutation();
```

## Invariantes V1

- `event_idempotency_key` is distinct for each ledger event; it is not a saga or reservation-line key.
- `available_quantity` already nets reservations; safety stock is applied once by the consuming use case.
- Every capability module has one installation configuration. Future-optional modules remain `DISABLED` in V1 and create no business API, credential, job or external call.

## Delta contractual TASK-004 (migración V2)

TASK-004 is implemented before TASK-003. It creates separate `USER` and `CUSTOMER` realms, server-side opaque sessions and no cross-realm identity lookup. No `store_id`, BlackStore, fiscal, Mercado Pago, Mercado Libre, social login, MFA, password reset or email delivery is introduced.

```sql
ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);
ALTER TABLE customers ALTER COLUMN password_hash TYPE VARCHAR(255);
DO $_$ BEGIN
 IF EXISTS(SELECT 1 FROM users WHERE password_hash NOT LIKE '$argon2id$%') OR EXISTS(SELECT 1 FROM customers WHERE password_hash NOT LIKE '$argon2id$%') THEN RAISE EXCEPTION 'IDENTITY_LEGACY_BCRYPT_PRECHECK_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_check' AND contype='c') OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='customers'::regclass AND conname='customers_check' AND contype='c') THEN RAISE EXCEPTION 'IDENTITY_V1_BASELINE_CONSTRAINT_MISMATCH'; END IF;
END; $_$;
ALTER TABLE users DROP CONSTRAINT users_check;
ALTER TABLE users ADD CONSTRAINT ck_users_email_canonical CHECK(email=lower(btrim(email)) AND password_hash LIKE '$argon2id$%');
ALTER TABLE customers DROP CONSTRAINT customers_check;
ALTER TABLE customers ADD CONSTRAINT ck_customers_email_canonical CHECK(email=lower(btrim(email)) AND password_hash LIKE '$argon2id$%');
INSERT INTO roles(code,description) VALUES ('ADMIN','Internal administrator'),('OPERATOR','Internal operator') ON CONFLICT(code) DO NOTHING;
ALTER TABLE customer_addresses ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE audit_events ADD COLUMN aggregate_reference UUID NULL, ADD COLUMN subject_kind VARCHAR(16) NULL, ADD COLUMN subject_reference BIGINT NULL, ADD COLUMN correlation_id UUID NULL, ADD COLUMN reason_code VARCHAR(64) NULL;
CREATE TABLE identity_sessions (
 id UUID PRIMARY KEY, subject_kind VARCHAR(16) NOT NULL CHECK(subject_kind IN ('USER','CUSTOMER')),
 user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 token_hash CHAR(64) NOT NULL UNIQUE, issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 idle_expires_at TIMESTAMPTZ NOT NULL, absolute_expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ NULL, revocation_kind VARCHAR(16) NULL CHECK(revocation_kind IN ('SELF','ADMIN','SYSTEM')),
 revoked_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, revoked_by_customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT, revocation_correlation_id UUID NULL, revoked_reason VARCHAR(500) NULL,
 CHECK((subject_kind='USER' AND user_id IS NOT NULL AND customer_id IS NULL) OR (subject_kind='CUSTOMER' AND customer_id IS NOT NULL AND user_id IS NULL)),
 CHECK(issued_at<=last_seen_at AND last_seen_at<idle_expires_at AND idle_expires_at<=absolute_expires_at), CHECK(revoked_at IS NULL OR revoked_at>=issued_at),
 CHECK((revoked_at IS NULL AND revocation_kind IS NULL AND revoked_by_user_id IS NULL AND revoked_by_customer_id IS NULL AND revocation_correlation_id IS NULL AND revoked_reason IS NULL) OR (revocation_kind='SELF' AND revocation_correlation_id IS NOT NULL AND revoked_at IS NOT NULL AND ((subject_kind='USER' AND revoked_by_user_id=user_id AND revoked_by_customer_id IS NULL) OR (subject_kind='CUSTOMER' AND revoked_by_customer_id=customer_id AND revoked_by_user_id IS NULL)) AND length(btrim(revoked_reason))>0) OR (revocation_kind='ADMIN' AND revocation_correlation_id IS NOT NULL AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revoked_by_customer_id IS NULL AND length(btrim(revoked_reason))>0) OR (revocation_kind='SYSTEM' AND revocation_correlation_id IS NOT NULL AND revoked_at IS NOT NULL AND revoked_by_user_id IS NULL AND revoked_by_customer_id IS NULL AND length(btrim(revoked_reason))>0))
);
CREATE INDEX ix_identity_sessions_active_user ON identity_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_identity_sessions_active_customer ON identity_sessions(customer_id) WHERE revoked_at IS NULL;
CREATE TABLE identity_session_csrf_tokens (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id UUID NOT NULL REFERENCES identity_sessions(id) ON DELETE RESTRICT,
 token_hash CHAR(64) NOT NULL UNIQUE, generation INTEGER NOT NULL CHECK(generation>0), issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), expires_at TIMESTAMPTZ NOT NULL,
 retired_at TIMESTAMPTZ NULL, UNIQUE(session_id,generation), CHECK(expires_at>issued_at)
);
CREATE UNIQUE INDEX uq_identity_session_active_csrf ON identity_session_csrf_tokens(session_id) WHERE retired_at IS NULL;
CREATE FUNCTION enforce_identity_session_csrf_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' OR OLD.id IS DISTINCT FROM NEW.id OR OLD.session_id IS DISTINCT FROM NEW.session_id OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.generation IS DISTINCT FROM NEW.generation OR OLD.issued_at IS DISTINCT FROM NEW.issued_at OR OLD.expires_at IS DISTINCT FROM NEW.expires_at OR OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL THEN RAISE EXCEPTION 'csrf token evidence is immutable'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_identity_session_csrf_mutation BEFORE UPDATE OR DELETE ON identity_session_csrf_tokens FOR EACH ROW EXECUTE FUNCTION enforce_identity_session_csrf_mutation();
CREATE TABLE installation_bootstrap_markers (
 installation_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(installation_id=1), bootstrap_admin_user_id BIGINT NOT NULL,
 bootstrap_event_id BIGINT NULL REFERENCES audit_events(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER trg_prevent_installation_bootstrap_marker_mutation BEFORE UPDATE OR DELETE ON installation_bootstrap_markers FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE FUNCTION enforce_identity_session_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' OR OLD.id IS DISTINCT FROM NEW.id OR OLD.subject_kind IS DISTINCT FROM NEW.subject_kind OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.issued_at IS DISTINCT FROM NEW.issued_at OR OLD.absolute_expires_at IS DISTINCT FROM NEW.absolute_expires_at OR NEW.last_seen_at<OLD.last_seen_at OR NEW.idle_expires_at>NEW.absolute_expires_at OR NEW.last_seen_at>NEW.absolute_expires_at OR OLD.revoked_at IS NOT NULL OR OLD.idle_expires_at<=clock_timestamp() OR OLD.absolute_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'identity session is immutable, revoked or expired'; END IF;
 IF NEW.revoked_at IS NOT NULL THEN
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at OR NEW.idle_expires_at IS DISTINCT FROM OLD.idle_expires_at OR NEW.revoked_at<OLD.issued_at OR NEW.revocation_kind IS NULL OR NEW.revocation_correlation_id IS NULL OR NEW.revoked_reason IS NULL OR length(btrim(NEW.revoked_reason))=0 THEN RAISE EXCEPTION 'revocation evidence required'; END IF;
 ELSIF NEW.revocation_kind IS NOT NULL OR NEW.revoked_by_user_id IS NOT NULL OR NEW.revoked_by_customer_id IS NOT NULL OR NEW.revocation_correlation_id IS NOT NULL OR NEW.revoked_reason IS NOT NULL OR NEW.last_seen_at<=OLD.last_seen_at OR NEW.idle_expires_at IS DISTINCT FROM LEAST(NEW.absolute_expires_at,NEW.last_seen_at + interval '30 minutes') THEN RAISE EXCEPTION 'invalid identity session touch'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_identity_session_mutation BEFORE UPDATE OR DELETE ON identity_sessions FOR EACH ROW EXECUTE FUNCTION enforce_identity_session_mutation();
```

Runtime resolves only `token_hash`; it verifies selected cookie realm, `revoked_at IS NULL`, idle/absolute expiry and active subject on every request, then reloads USER roles. `touchSession` is the only non-revocation update: it locks the row and uses a CAS on the prior `last_seen_at`, requires `revoked_at IS NULL`, both expiries later than `clock_timestamp()` and the same realm, advances only when last touch is at least 60 seconds old, and sets `idle_expires_at=LEAST(absolute_expires_at, clock_timestamp()+interval '30 minutes')`. A stale, revoked or expired session cannot be revived. The CSRF use case locks that session and its active CSRF row, checks the presented SHA-256 token hash constant-time, verifies CSRF expiry is not later than session expiry, retires that row and inserts exactly one next generation in the same business-mutation transaction; concurrent stale tokens get `403 CSRF_INVALID` and recover through the safe csrf endpoint.

Passwords use the maintained `de.mkammerer:argon2-jvm` Argon2id PHC implementation with `m>=19456,t>=2,p=1`, salt >=16 bytes and a 12..128 Unicode-code-point policy. The verifier enforces bounded PHC input/parameters before work and a dummy comparison using current parameters for missing subjects. Email canonicalization is Unicode NFKC, trim and Locale.ROOT lowercase before validation/storage; duplicate CUSTOMER is rejected but the same canonical email may exist in USER. Login rate-limit is per realm + source IP + SHA-256 canonical-email key (never raw email), five failures per 15 minutes, generic `429 AUTH_RATE_LIMITED` with `Retry-After`; absent, inactive, wrong-password and wrong-realm behavior remains indistinguishable.

Only local interactive `bootstrap-admin` may create the first ADMIN: it rejects non-TTY stdin; under `pg_advisory_xact_lock(hashtext('storecore:bootstrap-admin'))` it requires zero USER rows and no `installation_bootstrap_markers(1)`, then creates Argon2id USER, ADMIN role, immutable SYSTEM/BOOTSTRAP `BOOTSTRAP_ADMIN_CREATED` audit and marker in one transaction. Marker UPDATE/DELETE is blocked. Any missing role, marker, audit failure or statement failure rolls back, and later deactivation/deletion cannot reopen bootstrap. There is no bootstrap HTTP endpoint and no credential in argv, environment or logs.

A successful `SELF`, `ADMIN` or `SYSTEM` revocation conditionally locks one still-live session, changes it once and appends exactly one immutable `audit_events` row in the same transaction. The row uses `event_type='IDENTITY_SESSION_REVOKED'`, `aggregate_type='IDENTITY_SESSION'`, `aggregate_reference=<target session UUID>`, actor kind/id, subject kind/id, correlation id, reason code and transition result. `payload_redacted` contains only `{correlationId, revocationKind, subjectKind, result:'REVOKED'}`; never session/CSRF token or hash, password/PHC, email or address. An already revoked/expired logout only clears its cookie and returns 204; it adds no audit event.

Session cookies are `__Host-storecore-customer` and `__Host-storecore-internal` with `Secure; HttpOnly; SameSite=Lax; Path=/` and no Domain. Login/register sets a cookie but never returns its value, auth responses are `Cache-Control: no-store`, and logout clears the same name/path with `Max-Age=0`. CSRF is independent 32-byte CSPRNG material, stored only as SHA-256 and delivered only via `X-CSRF-Token` after login/register, GET csrf (which atomically rotates) and successful authenticated mutation; it is never stored raw. Authenticated mutation, including logout, requires valid CSRF and exact same-installation Origin. The normal deployment is same-origin; any exceptional CORS config permits only the explicit installation origin with credentials, never wildcard, and allows/exposes only `X-CSRF-Token`.
## Delta contractual TASK-003 (migración V3)

V3 is planned only after TASK-004 supplies real internal `USER`/`ADMIN` identity. V1 above stays unmodified. This delta contains no BlackStore, fiscal, `store_id` or secret.

```sql
ALTER TABLE capability_actions ADD COLUMN action_kind VARCHAR(16) NOT NULL DEFAULT 'WRITE', ADD COLUMN allowed_when_paused BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE capability_actions SET action_kind=CASE WHEN (module_code,action_code) IN (('STOREFRONT','SERVE'),('ML_COMPETITION_INSIGHTS','READ_SIGNALS')) THEN 'READ' WHEN action_code='PUBLISH_PROMOTION' THEN 'PUBLISH' ELSE 'WRITE' END;
INSERT INTO capability_actions(module_code,action_code,allows_write,action_kind,allowed_when_paused) SELECT module_code,'READ_STATUS',FALSE,'STATUS',TRUE FROM capability_modules ON CONFLICT(module_code,action_code) DO NOTHING;
ALTER TABLE capability_actions ALTER COLUMN action_kind DROP DEFAULT;
ALTER TABLE capability_actions ADD CONSTRAINT ck_capability_action_kind CHECK(action_kind IN ('READ','WRITE','PUBLISH','STATUS','HEALTH'));
CREATE FUNCTION enforce_capability_action_semantics() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF (NEW.action_kind IN ('READ','STATUS','HEALTH') AND NEW.allows_write) OR (NEW.action_kind IN ('WRITE','PUBLISH') AND NOT NEW.allows_write) OR (NEW.allowed_when_paused AND NEW.action_kind NOT IN ('STATUS','HEALTH')) THEN RAISE EXCEPTION 'invalid capability action semantics'; END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_capability_action_semantics BEFORE INSERT OR UPDATE ON capability_actions FOR EACH ROW EXECUTE FUNCTION enforce_capability_action_semantics();

ALTER TABLE module_configurations ADD COLUMN config_schema_version SMALLINT NOT NULL DEFAULT 1, ADD CONSTRAINT ck_module_configuration_schema_version CHECK(config_schema_version>0);
ALTER TABLE capability_kill_switches ADD COLUMN created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN removed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN removal_reason VARCHAR(500) NULL, ADD COLUMN removal_correlation_id UUID NULL, ADD COLUMN replaces_kill_switch_id BIGINT NULL REFERENCES capability_kill_switches(id) ON DELETE RESTRICT;
CREATE TABLE capability_configuration_audit_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, correlation_id UUID NOT NULL, actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 event_kind VARCHAR(32) NOT NULL CHECK(event_kind IN ('CONFIGURATION_CHANGED','KILL_SWITCH_CREATED','KILL_SWITCH_REMOVED','KILL_SWITCH_REPLACED')),
 module_code VARCHAR(40) NOT NULL REFERENCES capability_modules(module_code) ON DELETE RESTRICT, action_code VARCHAR(64) NULL, configuration_id BIGINT NULL REFERENCES module_configurations(id) ON DELETE RESTRICT, kill_switch_id BIGINT NULL REFERENCES capability_kill_switches(id) ON DELETE RESTRICT,
 reason VARCHAR(500) NOT NULL CHECK(length(btrim(reason))>0), previous_state VARCHAR(16) NULL, next_state VARCHAR(16) NULL, expected_config_version INTEGER NULL, resulting_config_version INTEGER NULL, before_snapshot JSONB NOT NULL, after_snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(before_snapshot)='object' AND jsonb_typeof(after_snapshot)='object'),
 CHECK((event_kind='CONFIGURATION_CHANGED' AND action_code IS NULL AND configuration_id IS NOT NULL AND kill_switch_id IS NULL AND previous_state IS NOT NULL AND next_state IS NOT NULL AND expected_config_version IS NOT NULL AND resulting_config_version IS NOT NULL AND resulting_config_version=expected_config_version+1) OR (event_kind IN ('KILL_SWITCH_CREATED','KILL_SWITCH_REMOVED','KILL_SWITCH_REPLACED') AND action_code IS NOT NULL AND configuration_id IS NULL AND kill_switch_id IS NOT NULL AND previous_state IS NULL AND next_state IS NULL AND expected_config_version IS NULL AND resulting_config_version IS NULL))
);
CREATE FUNCTION enforce_capability_configuration_audit_action() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF NEW.action_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM capability_actions a WHERE a.module_code=NEW.module_code AND a.action_code=NEW.action_code) THEN RAISE EXCEPTION 'unknown capability audit action'; END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_capability_configuration_audit_action BEFORE INSERT ON capability_configuration_audit_events FOR EACH ROW EXECUTE FUNCTION enforce_capability_configuration_audit_action();
CREATE TRIGGER trg_prevent_immutable_capability_configuration_audit_events BEFORE UPDATE OR DELETE ON capability_configuration_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE FUNCTION enforce_module_configuration_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'module configuration cannot be deleted'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.module_code IS DISTINCT FROM NEW.module_code OR OLD.scope_kind IS DISTINCT FROM NEW.scope_kind OR OLD.scope_key IS DISTINCT FROM NEW.scope_key OR NEW.config_version<>OLD.config_version+1 OR NEW.updated_by IS NULL THEN RAISE EXCEPTION 'invalid configuration mutation'; END IF;
 IF NOT ((OLD.state='DISABLED' AND NEW.state IN ('DISABLED','READ_ONLY','ACTIVE')) OR (OLD.state='READ_ONLY' AND NEW.state IN ('READ_ONLY','ACTIVE','PAUSED','ERROR','DISABLED')) OR (OLD.state='ACTIVE' AND NEW.state IN ('ACTIVE','READ_ONLY','PAUSED','ERROR','DISABLED')) OR (OLD.state='PAUSED' AND NEW.state IN ('PAUSED','READ_ONLY','ACTIVE','ERROR','DISABLED')) OR (OLD.state='ERROR' AND NEW.state IN ('ERROR','PAUSED','DISABLED'))) THEN RAISE EXCEPTION 'invalid configuration transition'; END IF;
 IF OLD.state=NEW.state AND OLD.config IS NOT DISTINCT FROM NEW.config AND OLD.config_schema_version=NEW.config_schema_version THEN RAISE EXCEPTION 'same-state update requires a configuration change'; END IF;
 IF NEW.config_schema_version<>1 OR NEW.config<>'{}'::jsonb THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 IF EXISTS(SELECT 1 FROM capability_modules m WHERE m.module_code=NEW.module_code AND m.future_optional AND NEW.state<>'DISABLED') THEN RAISE EXCEPTION 'future optional must remain disabled'; END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_module_configuration_mutation BEFORE UPDATE OR DELETE ON module_configurations FOR EACH ROW EXECUTE FUNCTION enforce_module_configuration_mutation();

CREATE FUNCTION enforce_kill_switch_lifecycle() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
DECLARE predecessor capability_kill_switches%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'kill switch cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT NEW.active OR NEW.removed_at IS NOT NULL OR NEW.removed_by_user_id IS NOT NULL OR NEW.removal_reason IS NOT NULL OR NEW.removal_correlation_id IS NOT NULL OR NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'invalid active kill switch'; END IF;
  IF NEW.replaces_kill_switch_id IS NOT NULL THEN SELECT * INTO predecessor FROM capability_kill_switches WHERE id=NEW.replaces_kill_switch_id FOR KEY SHARE; IF NOT FOUND OR predecessor.active OR (predecessor.module_code,predecessor.action_code,predecessor.scope_kind,predecessor.scope_key)<>(NEW.module_code,NEW.action_code,NEW.scope_kind,NEW.scope_key) THEN RAISE EXCEPTION 'invalid replacement'; END IF; END IF;
 ELSE
  IF NOT OLD.active OR NEW.active OR NEW.id IS DISTINCT FROM OLD.id OR NEW.module_code IS DISTINCT FROM OLD.module_code OR NEW.action_code IS DISTINCT FROM OLD.action_code OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.scope_key IS DISTINCT FROM OLD.scope_key OR NEW.owner IS DISTINCT FROM OLD.owner OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.removal_ticket IS DISTINCT FROM OLD.removal_ticket OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.replaces_kill_switch_id IS DISTINCT FROM OLD.replaces_kill_switch_id OR NEW.removed_at IS NULL OR NEW.removed_by_user_id IS NULL OR NEW.removal_reason IS NULL OR length(btrim(NEW.removal_reason))=0 OR NEW.removal_correlation_id IS NULL THEN RAISE EXCEPTION 'invalid kill switch closure'; END IF;
 END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_kill_switch_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON capability_kill_switches FOR EACH ROW EXECUTE FUNCTION enforce_kill_switch_lifecycle();
CREATE TRIGGER trg_prevent_capability_module_mutation BEFORE UPDATE OR DELETE ON capability_modules FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_capability_action_mutation BEFORE UPDATE OR DELETE ON capability_actions FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
REVOKE INSERT,UPDATE,DELETE ON module_configurations,capability_kill_switches,capability_configuration_audit_events FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON capability_modules,capability_actions FROM PUBLIC;
```

`CapabilityAdministrationPort` is the only runtime write surface. It runs at `REPEATABLE READ`, locks `capability_actions(module_code,action_code)` for every kill create/remove/replace, checks `expected_active_kill_switch_id` under that lock, performs the guarded mutation and immutable audit in the same transaction. Runtime has no direct DML grants; migrations own registry changes. Application validation accepts exactly `{}` for schema v1 and rejects unknown keys/types/versions, generic flags and secret-like fields.

## Runtime invariants TASK-003

Decision order is kill switch → configuration → typed action → authenticated internal actor. No active kill is normal; active expired/malformed kills deny. Missing/duplicate/corrupt configuration, action or actor denies. `expected_config_version` is only for configuration; `expected_active_kill_switch_id` is only for kill remove/replace.
## Privileged administration surface (V3 required DDL)

Deployment creates no-login roles `storecore_migrator` (owner of this schema and the functions below) and `storecore_runtime`. The runtime role has `SELECT` on capability read models, **no** direct `INSERT|UPDATE|DELETE` on `module_configurations`, `capability_kill_switches`, `capability_configuration_audit_events`, `capability_modules` or `capability_actions`, and only `EXECUTE` on these controlled functions. The application data source uses `storecore_runtime`; migrations use `storecore_migrator`. Direct DML is therefore not an alternative to the audit path.

```sql
REVOKE ALL ON module_configurations,capability_kill_switches,capability_configuration_audit_events,capability_modules,capability_actions FROM storecore_runtime;
GRANT SELECT ON module_configurations,capability_kill_switches,capability_modules,capability_actions TO storecore_runtime;

CREATE FUNCTION capability_admin_change_configuration(p_actor BIGINT,p_module VARCHAR,p_expected INTEGER,p_state VARCHAR,p_config JSONB,p_correlation UUID,p_reason VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row module_configurations%ROWTYPE; new_row module_configurations%ROWTYPE;
BEGIN
 SELECT * INTO old_row FROM module_configurations WHERE module_code=p_module AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE;
 IF NOT FOUND OR old_row.config_version<>p_expected THEN RAISE EXCEPTION 'CAPABILITY_CONFIG_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE module_configurations SET state=p_state,config=p_config,updated_by=p_actor,config_version=config_version+1,updated_at=clock_timestamp() WHERE id=old_row.id AND config_version=p_expected RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_CONFIG_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,configuration_id,reason,previous_state,next_state,expected_config_version,resulting_config_version,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'CONFIGURATION_CHANGED',p_module,old_row.id,p_reason,old_row.state,new_row.state,p_expected,new_row.config_version,to_jsonb(old_row),to_jsonb(new_row));
END; $_$;
ALTER FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) OWNER TO storecore_migrator;
GRANT EXECUTE ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) TO storecore_runtime;

CREATE FUNCTION capability_admin_create_kill_switch(p_actor BIGINT,p_module VARCHAR,p_action VARCHAR,p_owner VARCHAR,p_reason VARCHAR,p_expires TIMESTAMPTZ,p_ticket VARCHAR,p_correlation UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE created_row capability_kill_switches%ROWTYPE;
BEGIN
 PERFORM 1 FROM capability_actions WHERE module_code=p_module AND action_code=p_action FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 INSERT INTO capability_kill_switches(module_code,action_code,owner,reason,expires_at,removal_ticket,created_by_user_id) VALUES(p_module,p_action,p_owner,p_reason,p_expires,p_ticket,p_actor) RETURNING * INTO created_row;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_CREATED',p_module,p_action,created_row.id,p_reason,'{}'::jsonb,to_jsonb(created_row));
 RETURN created_row.id;
END; $_$;

CREATE FUNCTION capability_admin_remove_kill_switch(p_actor BIGINT,p_expected_active_id BIGINT,p_reason VARCHAR,p_correlation UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row capability_kill_switches%ROWTYPE; new_row capability_kill_switches%ROWTYPE; expected_module VARCHAR; expected_action VARCHAR;
BEGIN
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 expected_module:=old_row.module_code; expected_action:=old_row.action_code;
 PERFORM 1 FROM capability_actions WHERE module_code=expected_module AND action_code=expected_action FOR UPDATE;
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id FOR UPDATE;
 IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>expected_module OR old_row.action_code<>expected_action THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE capability_kill_switches SET active=FALSE,removed_at=clock_timestamp(),removed_by_user_id=p_actor,removal_reason=p_reason,removal_correlation_id=p_correlation WHERE id=old_row.id AND active=TRUE RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_REMOVED',old_row.module_code,old_row.action_code,new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row));
END; $_$;

CREATE FUNCTION capability_admin_replace_kill_switch(p_actor BIGINT,p_expected_active_id BIGINT,p_owner VARCHAR,p_reason VARCHAR,p_expires TIMESTAMPTZ,p_ticket VARCHAR,p_correlation UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row capability_kill_switches%ROWTYPE; closed_row capability_kill_switches%ROWTYPE; new_row capability_kill_switches%ROWTYPE; expected_module VARCHAR; expected_action VARCHAR;
BEGIN
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 expected_module:=old_row.module_code; expected_action:=old_row.action_code;
 PERFORM 1 FROM capability_actions WHERE module_code=expected_module AND action_code=expected_action FOR UPDATE;
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id FOR UPDATE;
 IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>expected_module OR old_row.action_code<>expected_action THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE capability_kill_switches SET active=FALSE,removed_at=clock_timestamp(),removed_by_user_id=p_actor,removal_reason=p_reason,removal_correlation_id=p_correlation WHERE id=old_row.id AND active=TRUE RETURNING * INTO closed_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_kill_switches(module_code,action_code,owner,reason,expires_at,removal_ticket,created_by_user_id,replaces_kill_switch_id) VALUES(old_row.module_code,old_row.action_code,p_owner,p_reason,p_expires,p_ticket,p_actor,closed_row.id) RETURNING * INTO new_row;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_REPLACED',new_row.module_code,new_row.action_code,new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row));
 RETURN new_row.id;
END; $_$;
ALTER FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
```

The V3 migration must implement those three kill functions with the same privilege boundary before granting runtime `EXECUTE`; no Kotlin repository may issue direct DML to these tables.
