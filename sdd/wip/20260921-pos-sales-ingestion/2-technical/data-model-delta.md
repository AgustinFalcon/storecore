# DDL delta — `pos-sales-ingestion`

> **HISTÓRICO — NO IMPLEMENTAR.** Superseded para companion BlackStore (2026-09-21). Contrato vivo: `../20260921-storecore-pos-integration-contract-v1/`. Companion: BlackStore `blackstore-pilot`.

**Status:** `superseded`. PostgreSQL 16. No reemplaza `data-model-v1.md`. Sin `store_id`. Sin secretos.

```sql
-- Capability futura opcional (CHECK cerrado del baseline: reponer lista completa + este código)
ALTER TABLE capability_modules DROP CONSTRAINT IF EXISTS capability_modules_module_code_check;
ALTER TABLE capability_modules ADD CONSTRAINT capability_modules_module_code_check CHECK (module_code IN (
  'STOREFRONT','CATALOG','PROFILE_CONTENT','PAYMENTS_MP','MANUAL_FULFILLMENT','MARKETPLACE_ML','MANUAL_PROMOTIONS',
  'ML_COMPETITION_INSIGHTS','ML_PRICE_AUTOMATION','ML_PROMOTION_ORCHESTRATOR','WEB_CROSS_SELL_DISCOUNTS',
  'COMMERCIAL_CALENDAR','FAVORITES','LOYALTY','CARRIERS','ML_VIRTUAL_KITS','EXTERNAL_INVENTORY_INGESTION'
));
INSERT INTO capability_modules(module_code, future_optional) VALUES ('EXTERNAL_INVENTORY_INGESTION', TRUE);
INSERT INTO capability_actions(module_code, action_code, allows_write) VALUES
  ('EXTERNAL_INVENTORY_INGESTION', 'INGEST', TRUE),
  ('EXTERNAL_INVENTORY_INGESTION', 'READ_BALANCE', FALSE);
INSERT INTO module_configurations(module_code, state) VALUES ('EXTERNAL_INVENTORY_INGESTION', 'DISABLED');

-- Oversell autorizado: available puede ser negativo sólo con oversell_open
ALTER TABLE inventory_balances DROP CONSTRAINT IF EXISTS inventory_balances_available_quantity_check;
ALTER TABLE inventory_balances DROP CONSTRAINT IF EXISTS inventory_balances_check;
ALTER TABLE inventory_balances ADD COLUMN oversell_open BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balances_qty_check CHECK (
  reserved_quantity >= 0
  AND safety_stock >= 0
  AND (
    (available_quantity >= 0 AND oversell_open = FALSE)
    OR (available_quantity < 0 AND oversell_open = TRUE)
  )
);

-- Ledger: UUID interno intacto + clave de negocio UNIQUE
ALTER TABLE inventory_ledger ADD COLUMN business_key VARCHAR(160) NULL;
CREATE UNIQUE INDEX uq_inventory_ledger_business_key ON inventory_ledger (business_key) WHERE business_key IS NOT NULL;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_event_type_check;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_channel_check;
ALTER TABLE inventory_ledger DROP CONSTRAINT IF EXISTS inventory_ledger_check;
ALTER TABLE inventory_ledger ADD CONSTRAINT inventory_ledger_check CHECK (
  event_type IN (
    'RESERVATION','RELEASE','SALE','REFUND','RETURN_RECEIVED','ADJUSTMENT','RECONCILIATION',
    'INVENTORY_ISSUE_EXTERNAL','INVENTORY_REVERSAL_EXTERNAL'
  )
  AND channel IN ('WEB','MERCADO_LIBRE','INTERNAL','EXTERNAL')
  AND quantity_delta <> 0
  AND (
    event_type NOT IN ('INVENTORY_ISSUE_EXTERNAL','INVENTORY_REVERSAL_EXTERNAL')
    OR (business_key IS NOT NULL AND channel = 'EXTERNAL')
  )
  AND (event_type <> 'SALE' OR channel IN ('WEB','MERCADO_LIBRE'))
);

CREATE TABLE inventory_external_operations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_key VARCHAR(160) NOT NULL UNIQUE,
  operation_kind VARCHAR(16) NOT NULL,
  external_system VARCHAR(64) NOT NULL,
  external_ref VARCHAR(160) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  request_hash CHAR(64) NOT NULL,
  result_code VARCHAR(32) NOT NULL,
  result_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (operation_kind IN ('ISSUE','REVERSAL')),
  CHECK (result_code IN ('OK','NO_STOCK','DUPLICATE','INVALID_SKU','INVALID_QUANTITY','REVERSAL_NOT_ALLOWED')),
  CHECK (jsonb_typeof(result_body) = 'object')
);
CREATE UNIQUE INDEX uq_external_ok_issue_ref
  ON inventory_external_operations (external_ref) WHERE operation_kind = 'ISSUE' AND result_code = 'OK';
CREATE UNIQUE INDEX uq_external_ok_reversal_ref
  ON inventory_external_operations (external_ref) WHERE operation_kind = 'REVERSAL' AND result_code = 'OK';
```
