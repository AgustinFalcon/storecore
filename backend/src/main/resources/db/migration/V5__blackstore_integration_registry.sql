-- TASK-PIC-001 / ADR-008 ownership V4 (Flyway V5; V4 is Mercado Pago Orders).
-- BLACKSTORE_INTEGRATION stays future_optional=true and DISABLED. Not TASK-PIC-010.

ALTER TABLE capability_modules DROP CONSTRAINT IF EXISTS capability_modules_module_code_check;
ALTER TABLE capability_modules DROP CONSTRAINT IF EXISTS ck_capability_modules_module_code;
ALTER TABLE capability_modules DROP CONSTRAINT IF EXISTS capability_modules_module_code_check1;

DO $$
DECLARE c name;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'capability_modules'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%STOREFRONT%'
    AND pg_get_constraintdef(oid) LIKE '%ML_VIRTUAL_KITS%'
    AND pg_get_constraintdef(oid) NOT LIKE '%BLACKSTORE_INTEGRATION%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE capability_modules DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE capability_modules ADD CONSTRAINT ck_capability_modules_module_code CHECK (module_code IN (
  'STOREFRONT','CATALOG','PROFILE_CONTENT','PAYMENTS_MP','MANUAL_FULFILLMENT','MARKETPLACE_ML','MANUAL_PROMOTIONS',
  'ML_COMPETITION_INSIGHTS','ML_PRICE_AUTOMATION','ML_PROMOTION_ORCHESTRATOR','WEB_CROSS_SELL_DISCOUNTS',
  'COMMERCIAL_CALENDAR','FAVORITES','LOYALTY','CARRIERS','ML_VIRTUAL_KITS',
  'BLACKSTORE_INTEGRATION'
));

INSERT INTO capability_modules(module_code, future_optional) VALUES ('BLACKSTORE_INTEGRATION', TRUE);

INSERT INTO capability_actions(module_code, action_code, allows_write, action_kind, allowed_when_paused) VALUES
  ('BLACKSTORE_INTEGRATION','CATALOG_READ', FALSE, 'READ', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_RESERVE', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_COMMIT', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_RELEASE', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','STOCK_READ', FALSE, 'READ', FALSE),
  ('BLACKSTORE_INTEGRATION','COST_READ', FALSE, 'READ', FALSE),
  ('BLACKSTORE_INTEGRATION','PRICE_OVERRIDE', TRUE, 'WRITE', FALSE),
  ('BLACKSTORE_INTEGRATION','READ_STATUS', FALSE, 'STATUS', TRUE),
  ('BLACKSTORE_INTEGRATION','HEALTH', FALSE, 'HEALTH', TRUE);

CREATE FUNCTION blackstore_schema_v2_valid(p_config JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN jsonb_typeof(p_config) = 'object'
    AND (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_config) AS key) =
        ARRAY[
          'catalog_page_size','catalog_rate_limit_rps','cursor_retention_days','expiry_worker_batch_size',
          'expiry_worker_interval_seconds','pending_claim_max_seconds','reconcile_rate_limit_rps',
          'reservation_ttl_max_seconds','reservation_ttl_min_seconds','reservation_ttl_seconds',
          'reserve_burst','reserve_rate_limit_rps','stock_read_rate_limit_rps'
        ]
    AND (p_config->>'reservation_ttl_seconds') ~ '^[0-9]+$'
    AND (p_config->>'reservation_ttl_min_seconds') = '60'
    AND (p_config->>'reservation_ttl_max_seconds') = '3600'
    AND (p_config->>'reservation_ttl_seconds')::int BETWEEN 60 AND 3600
    AND (p_config->>'catalog_page_size') = '200'
    AND (p_config->>'cursor_retention_days') = '7'
    AND (p_config->>'reserve_rate_limit_rps') = '30'
    AND (p_config->>'reserve_burst') = '10'
    AND (p_config->>'catalog_rate_limit_rps') = '60'
    AND (p_config->>'stock_read_rate_limit_rps') = '60'
    AND (p_config->>'reconcile_rate_limit_rps') = '5'
    AND (p_config->>'pending_claim_max_seconds') = '60'
    AND (p_config->>'expiry_worker_interval_seconds') = '30'
    AND (p_config->>'expiry_worker_batch_size') = '100';
END;
$$;

CREATE OR REPLACE FUNCTION enforce_module_configuration_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'module configuration cannot be deleted'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.module_code IS DISTINCT FROM NEW.module_code OR OLD.scope_kind IS DISTINCT FROM NEW.scope_kind OR OLD.scope_key IS DISTINCT FROM NEW.scope_key OR NEW.config_version<>OLD.config_version+1 OR NEW.updated_by IS NULL THEN RAISE EXCEPTION 'invalid configuration mutation'; END IF;
 IF NOT ((OLD.state='DISABLED' AND NEW.state IN ('DISABLED','READ_ONLY','ACTIVE')) OR (OLD.state='READ_ONLY' AND NEW.state IN ('READ_ONLY','ACTIVE','PAUSED','ERROR','DISABLED')) OR (OLD.state='ACTIVE' AND NEW.state IN ('ACTIVE','READ_ONLY','PAUSED','ERROR','DISABLED')) OR (OLD.state='PAUSED' AND NEW.state IN ('PAUSED','READ_ONLY','ACTIVE','ERROR','DISABLED')) OR (OLD.state='ERROR' AND NEW.state IN ('ERROR','PAUSED','DISABLED'))) THEN RAISE EXCEPTION 'invalid configuration transition'; END IF;
 IF OLD.state=NEW.state AND OLD.config IS NOT DISTINCT FROM NEW.config AND OLD.config_schema_version=NEW.config_schema_version THEN RAISE EXCEPTION 'same-state update requires a configuration change'; END IF;
 IF NEW.module_code='BLACKSTORE_INTEGRATION' THEN
  IF NEW.config_schema_version<>2 OR NOT blackstore_schema_v2_valid(NEW.config) THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 ELSIF NEW.config_schema_version<>1 OR NEW.config<>'{}'::jsonb THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 IF EXISTS(SELECT 1 FROM capability_modules m WHERE m.module_code=NEW.module_code AND m.future_optional AND NEW.state<>'DISABLED') THEN RAISE EXCEPTION 'future optional must remain disabled'; END IF; RETURN NEW;
END; $_$;

INSERT INTO module_configurations(module_code, scope_kind, scope_key, state, config_schema_version, config) VALUES (
  'BLACKSTORE_INTEGRATION',
  'INSTALLATION',
  'DEFAULT',
  'DISABLED',
  2,
  '{
    "catalog_page_size": 200,
    "catalog_rate_limit_rps": 60,
    "cursor_retention_days": 7,
    "expiry_worker_batch_size": 100,
    "expiry_worker_interval_seconds": 30,
    "pending_claim_max_seconds": 60,
    "reconcile_rate_limit_rps": 5,
    "reservation_ttl_max_seconds": 3600,
    "reservation_ttl_min_seconds": 60,
    "reservation_ttl_seconds": 900,
    "reserve_burst": 10,
    "reserve_rate_limit_rps": 30,
    "stock_read_rate_limit_rps": 60
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
CREATE UNIQUE INDEX uq_blackstore_companion_one_active_secret
  ON blackstore_companion_credentials (companion_id) WHERE status = 'ACTIVE';

GRANT SELECT, INSERT, UPDATE, DELETE ON blackstore_companions, blackstore_companion_credentials TO storecore_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO storecore_runtime;
GRANT ALL ON ALL TABLES IN SCHEMA public TO storecore_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO storecore_migrator;
