-- TASK-PIC-002 / ADR-008 ownership V5 (Flyway V6). Not TASK-PIC-010 / ADR V6 future_optional flip.

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

DO $$
DECLARE c name;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'inventory_ledger'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%RESERVATION%'
    AND pg_get_constraintdef(oid) LIKE '%MERCADO_LIBRE%';
  IF c IS NULL THEN
    RAISE EXCEPTION 'inventory_ledger event/channel check not found';
  END IF;
  EXECUTE format('ALTER TABLE inventory_ledger DROP CONSTRAINT %I', c);
END $$;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  blackstore_integration_operations,
  blackstore_integration_operation_tombstones,
  blackstore_integration_reservation_lines,
  blackstore_catalog_cursors
  TO storecore_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO storecore_runtime;
GRANT ALL ON ALL TABLES IN SCHEMA public TO storecore_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO storecore_migrator;
