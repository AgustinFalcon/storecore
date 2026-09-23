# DDL delta — BlackStore integration contract v1

**Status:** `ready_for_sol_review`. No reemplaza el data-model del baseline. Sin `store_id`. **No aplicar Flyway hasta Sol GO.** El SQL de este archivo es diseño no ejecutable: no autoriza migrations, ports ni runtime.

Este delta asume que `pos-sales-ingestion` **no** se aplicó (mutuamente excluyentes). No reintroduce ISSUE/REVERSAL ni channel `EXTERNAL`.

Tablas de saga: `blackstore_integration_*` (D-PATH; no módulo POS interno).

```sql
ALTER TABLE capability_modules DROP CONSTRAINT IF EXISTS capability_modules_module_code_check;
ALTER TABLE capability_modules DROP CONSTRAINT IF EXISTS ck_capability_modules_module_code;
ALTER TABLE capability_modules ADD CONSTRAINT ck_capability_modules_module_code CHECK (module_code IN (
  'STOREFRONT','CATALOG','PROFILE_CONTENT','PAYMENTS_MP','MANUAL_FULFILLMENT','MARKETPLACE_ML','MANUAL_PROMOTIONS',
  'ML_COMPETITION_INSIGHTS','ML_PRICE_AUTOMATION','ML_PROMOTION_ORCHESTRATOR','WEB_CROSS_SELL_DISCOUNTS',
  'COMMERCIAL_CALENDAR','FAVORITES','LOYALTY','CARRIERS','ML_VIRTUAL_KITS',
  'BLACKSTORE_INTEGRATION'
));
-- V4 / TASK-PIC-001 is the only owner of this registry. Each action must declare
-- action_kind and allowed_when_paused. Do not insert (module_code, action_code, allows_write) alone.
INSERT INTO capability_modules(module_code, future_optional) VALUES ('BLACKSTORE_INTEGRATION', TRUE);
INSERT INTO capability_actions(module_code, action_code, allows_write, action_kind, allowed_when_paused) VALUES
  ('BLACKSTORE_INTEGRATION','CATALOG_READ', FALSE, 'READ', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_RESERVE', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_COMMIT', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_RELEASE', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_READ', FALSE, 'READ', FALSE),
  ('BLACKSTORE_INTEGRATION','COST_READ', FALSE, 'READ', FALSE),
  ('BLACKSTORE_INTEGRATION','PRICE_OVERRIDE', TRUE, 'WRITE', FALSE);
INSERT INTO module_configurations(module_code, state, config) VALUES (
  'BLACKSTORE_INTEGRATION',
  'DISABLED',
  '{
    "reservation_ttl_seconds": 900,
    "reservation_ttl_min_seconds": 60,
    "reservation_ttl_max_seconds": 3600,
    "catalog_page_size": 200,
    "cursor_retention_days": 7,
    "reserve_rate_limit_rps": 30,
    "reserve_burst": 10,
    "catalog_rate_limit_rps": 60,
    "stock_read_rate_limit_rps": 60,
    "reconcile_rate_limit_rps": 5,
    "pending_claim_max_seconds": 60,
    "expiry_worker_interval_seconds": 30,
    "expiry_worker_batch_size": 100
  }'::jsonb
);

CREATE TABLE blackstore_companions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_instance_id UUID NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'DISABLED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  CHECK (status IN ('DISABLED','ACTIVE','REVOKED')),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX uq_blackstore_companion_live
  ON blackstore_companions ((TRUE)) WHERE status <> 'REVOKED';

CREATE TABLE blackstore_companion_credentials (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  companion_id BIGINT NOT NULL REFERENCES blackstore_companions(id) ON DELETE RESTRICT,
  credential_secret_ref VARCHAR(255) NOT NULL,
  credential_version INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  UNIQUE (companion_id, credential_version),
  CHECK (status IN ('ACTIVE','REVOKED')),
  CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL))
);
-- One ACTIVE per companion. Rotate in one transaction: REVOKE current, then INSERT new ACTIVE.
CREATE UNIQUE INDEX uq_blackstore_companion_one_active_secret
  ON blackstore_companion_credentials (companion_id) WHERE status = 'ACTIVE';
```

Rotación atómica (P1) — unique parcial se evalúa por statement, por eso **primero revocar**:

```sql
BEGIN;
UPDATE blackstore_companion_credentials
   SET status = 'REVOKED', revoked_at = now()
 WHERE companion_id = $id AND status = 'ACTIVE';
INSERT INTO blackstore_companion_credentials
  (companion_id, credential_secret_ref, credential_version, status)
VALUES ($id, $new_ref, $n+1, 'ACTIVE');
COMMIT;
```

Ventana de cero ACTIVE = esa transacción. Verifier acepta el token N hasta `revoked_at` + 30s (grace en proceso, no en SQL).

```sql
CREATE TABLE blackstore_integration_operations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_instance_id UUID NOT NULL REFERENCES blackstore_companions(client_instance_id) ON DELETE RESTRICT,
  device_id VARCHAR(80) NOT NULL,
  sale_id VARCHAR(80) NOT NULL,
  operation_id UUID NOT NULL,
  reservation_ref UUID NULL UNIQUE,
  state VARCHAR(16) NOT NULL,
  request_hash CHAR(64) NULL,
  receipt VARCHAR(128) NULL UNIQUE,
  catalog_version VARCHAR(64) NULL,
  expires_at TIMESTAMPTZ NULL,
  result_body JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_instance_id, device_id, sale_id, operation_id),
  CHECK (state IN ('PENDING','RESERVED','COMMITTED','RELEASED','EXPIRED')),
  CHECK (result_body IS NULL OR jsonb_typeof(result_body) = 'object'),
  CHECK (
    (state = 'PENDING' AND receipt IS NULL AND reservation_ref IS NULL AND request_hash IS NOT NULL)
    OR (state <> 'PENDING' AND receipt IS NOT NULL AND reservation_ref IS NOT NULL AND request_hash IS NOT NULL)
  ),
  CHECK ((state <> 'RESERVED') OR expires_at IS NOT NULL)
);

CREATE TABLE blackstore_integration_operation_tombstones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_instance_id UUID NOT NULL,
  device_id VARCHAR(80) NOT NULL,
  sale_id VARCHAR(80) NOT NULL,
  operation_id UUID NOT NULL,
  request_hash CHAR(64) NOT NULL,
  final_state VARCHAR(16) NOT NULL,
  receipt VARCHAR(128) NOT NULL,
  reservation_ref UUID NOT NULL,
  retired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until TIMESTAMPTZ NOT NULL,
  UNIQUE (client_instance_id, device_id, sale_id, operation_id),
  CHECK (final_state IN ('COMMITTED','RELEASED','EXPIRED')),
  CHECK (retention_until >= retired_at + INTERVAL '7 years')
);

CREATE TABLE blackstore_integration_reservation_lines (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_pk BIGINT NOT NULL REFERENCES blackstore_integration_operations(id) ON DELETE RESTRICT,
  reservation_ref UUID NOT NULL,
  variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  sku VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL,
  accepted_price_version VARCHAR(64) NOT NULL,
  inventory_reservation_operation_key UUID NOT NULL UNIQUE,
  ledger_reserve_operation_key UUID NOT NULL UNIQUE,
  ledger_commit_operation_key UUID NOT NULL UNIQUE,
  ledger_release_operation_key UUID NOT NULL UNIQUE,
  CHECK (quantity > 0),
  UNIQUE (reservation_ref, variant_id)
);

CREATE TABLE blackstore_catalog_cursors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_instance_id UUID NOT NULL REFERENCES blackstore_companions(client_instance_id) ON DELETE RESTRICT,
  catalog_version VARCHAR(64) NOT NULL,
  cursor_token VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_blackstore_catalog_cursors_companion_version
  ON blackstore_catalog_cursors (client_instance_id, catalog_version);

ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_check;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS ck_inventory_ledger_event_type;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS ck_inventory_ledger_channel;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS ck_inventory_ledger_qty;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS ck_inventory_ledger_event_channel_pairing;

ALTER TABLE inventory_ledger ADD CONSTRAINT ck_inventory_ledger_event_type CHECK (
  event_type IN (
    'RESERVATION','RELEASE','SALE','REFUND','RETURN_RECEIVED','ADJUSTMENT','RECONCILIATION',
    'STOCK_COMMIT_EXTERNAL'
  )
);
ALTER TABLE inventory_ledger ADD CONSTRAINT ck_inventory_ledger_channel CHECK (
  channel IN ('WEB','MERCADO_LIBRE','INTERNAL','EXTERNAL_BLACKSTORE')
);
ALTER TABLE inventory_ledger ADD CONSTRAINT ck_inventory_ledger_qty CHECK (quantity_delta <> 0);
ALTER TABLE inventory_ledger ADD CONSTRAINT ck_inventory_ledger_event_channel_pairing CHECK (
  (event_type = 'SALE' AND channel IN ('WEB','MERCADO_LIBRE'))
  OR (event_type = 'STOCK_COMMIT_EXTERNAL' AND channel = 'EXTERNAL_BLACKSTORE')
  OR (event_type IN ('RESERVATION','RELEASE') AND channel IN ('WEB','MERCADO_LIBRE','INTERNAL','EXTERNAL_BLACKSTORE'))
  OR (event_type IN ('REFUND','RETURN_RECEIVED','ADJUSTMENT','RECONCILIATION') AND channel IN ('WEB','MERCADO_LIBRE','INTERNAL'))
);
```

## Claves UUIDv5

Namespace `6f1c2a10-9b3e-4d71-9c0a-4c58a7c724b4`.

- `inventory_reservation_operation_key` = UUIDv5(ns, `res:{reservation_ref}:{variant_id}`)
- ledger keys = UUIDv5(ns, `led:{reservation_ref}:{variant_id}:{event_type}`)

## Semántica

- Locks: advisory transaction lock de la cuádruple (ADR-007) en reserve/commit/release/purge; **después** saga `FOR UPDATE`; **después** todos los `inventory_balances` `ORDER BY variant_id ASC`. Tombstone existente → 410 `OPERATION_RETIRED`.
- `available_quantity` ya es neta de `reserved_quantity`. Sellable = `GREATEST(0, available_quantity - safety_stock)`. No volver a descontar reserved.
- Transiciones: reserve `available -= q, reserved += q`; commit `reserved -= q`; release/expiry `available += q, reserved -= q`.
- PENDING durable = Tx-A COMMIT con `request_hash` NOT NULL, receipt/ref NULL. Worker DELETE PENDING > 60s sin ledger.
- Purge terminales (90d), una sola transacción (ADR-007): advisory lock + lock de saga; INSERT tombstone (`retention_until >= retired_at + 7 years`); DELETE `blackstore_integration_reservation_lines`; DELETE `blackstore_integration_operations`. Ledger no se borra. GET sin fila + tombstone → 410 `OPERATION_RETIRED` (no re-POST).
- Matriz 409: INSUFFICIENT_STOCK/STALE/VALIDATION borran claim en Tx-B; CONFLICT (deadlock) conserva estado previo; `OPERATION_STATE_CONFLICT` es comando incompatible sobre fila terminal viva (`retryable=false`); IDEMPOTENCY y EXPIRED conservan fila.
- `receipt` UNIQUE para reconcile por intersección. Reconcile no escribe.
