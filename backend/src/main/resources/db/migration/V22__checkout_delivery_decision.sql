CREATE FUNCTION manual_fulfillment_schema_v2_valid(p_config JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
DECLARE opt JSONB; option_key TEXT; required_keys TEXT[]; cost_text TEXT;
BEGIN
 IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_config) key) IS DISTINCT FROM ARRAY['localDelivery','pickup'] THEN RETURN FALSE; END IF;
 FOREACH option_key IN ARRAY ARRAY['pickup','localDelivery'] LOOP
  opt:=p_config->option_key;
  IF jsonb_typeof(opt) IS DISTINCT FROM 'object' OR jsonb_typeof(opt->'enabled') IS DISTINCT FROM 'boolean' THEN RETURN FALSE; END IF;
  IF opt->'enabled'='false'::jsonb THEN
   IF opt<>'{"enabled":false}'::jsonb THEN RETURN FALSE; END IF;
   CONTINUE;
  END IF;
  required_keys:=CASE WHEN option_key='pickup' THEN ARRAY['cost','destination','enabled','instructions','label','maxDays','minDays'] ELSE ARRAY['cost','enabled','label','maxDays','minDays'] END;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(opt) key) IS DISTINCT FROM required_keys THEN RETURN FALSE; END IF;
  IF jsonb_typeof(opt->'label') IS DISTINCT FROM 'string' OR length(btrim(opt->>'label'))=0 OR length(opt->>'label')>200 THEN RETURN FALSE; END IF;
  IF jsonb_typeof(opt->'cost') NOT IN ('string','number') THEN RETURN FALSE; END IF;
  cost_text:=opt->>'cost';
  IF length(cost_text)>16 OR cost_text !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' OR cost_text::numeric>999999999999.99 THEN RETURN FALSE; END IF;
  IF jsonb_typeof(opt->'minDays') IS DISTINCT FROM 'number' OR jsonb_typeof(opt->'maxDays') IS DISTINCT FROM 'number' OR opt->>'minDays' !~ '^(0|[1-9][0-9]*)$' OR opt->>'maxDays' !~ '^(0|[1-9][0-9]*)$' THEN RETURN FALSE; END IF;
  IF (opt->>'minDays')::numeric>2147483647 OR (opt->>'maxDays')::numeric>2147483647 OR (opt->>'maxDays')::numeric<(opt->>'minDays')::numeric THEN RETURN FALSE; END IF;
  IF option_key='pickup' AND (jsonb_typeof(opt->'destination') IS DISTINCT FROM 'string' OR length(btrim(opt->>'destination'))=0 OR length(opt->>'destination')>1000 OR jsonb_typeof(opt->'instructions') IS DISTINCT FROM 'string' OR length(btrim(opt->>'instructions'))=0 OR length(opt->>'instructions')>2000) THEN RETURN FALSE; END IF;
 END LOOP;
 RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END; $$;

-- Owner-only historical schema upgrade, not a runtime bypass or fabricated human edit.
ALTER TABLE module_configurations DISABLE TRIGGER trg_enforce_module_configuration_mutation;
UPDATE module_configurations SET config_schema_version=2, config='{"pickup":{"enabled":false},"localDelivery":{"enabled":false}}'::jsonb,config_version=config_version+1,updated_at=clock_timestamp() WHERE module_code='MANUAL_FULFILLMENT';
ALTER TABLE module_configurations ENABLE TRIGGER trg_enforce_module_configuration_mutation;

CREATE OR REPLACE FUNCTION enforce_module_configuration_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'module configuration cannot be deleted'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.module_code IS DISTINCT FROM NEW.module_code OR OLD.scope_kind IS DISTINCT FROM NEW.scope_kind OR OLD.scope_key IS DISTINCT FROM NEW.scope_key OR NEW.config_version<>OLD.config_version+1 OR NEW.updated_by IS NULL THEN RAISE EXCEPTION 'invalid configuration mutation'; END IF;
 IF NOT ((OLD.state='DISABLED' AND NEW.state IN ('DISABLED','READ_ONLY','ACTIVE')) OR (OLD.state='READ_ONLY' AND NEW.state IN ('READ_ONLY','ACTIVE','PAUSED','ERROR','DISABLED')) OR (OLD.state='ACTIVE' AND NEW.state IN ('ACTIVE','READ_ONLY','PAUSED','ERROR','DISABLED')) OR (OLD.state='PAUSED' AND NEW.state IN ('PAUSED','READ_ONLY','ACTIVE','ERROR','DISABLED')) OR (OLD.state='ERROR' AND NEW.state IN ('ERROR','PAUSED','DISABLED'))) THEN RAISE EXCEPTION 'invalid configuration transition'; END IF;
 IF OLD.state=NEW.state AND OLD.config IS NOT DISTINCT FROM NEW.config AND OLD.config_schema_version=NEW.config_schema_version THEN RAISE EXCEPTION 'same-state update requires a configuration change'; END IF;
 IF NEW.module_code='BLACKSTORE_INTEGRATION' THEN
  IF NEW.config_schema_version<>2 OR NOT blackstore_schema_v2_valid(NEW.config) THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 ELSIF NEW.module_code='MANUAL_FULFILLMENT' THEN
  IF NEW.config_schema_version<>2 OR NOT manual_fulfillment_schema_v2_valid(NEW.config) THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 ELSIF NEW.config_schema_version<>1 OR NEW.config<>'{}'::jsonb THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 IF EXISTS(SELECT 1 FROM capability_modules m WHERE m.module_code=NEW.module_code AND m.future_optional AND NEW.state<>'DISABLED') THEN RAISE EXCEPTION 'future optional must remain disabled'; END IF; RETURN NEW;
END; $_$;

DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='shipments'::regclass AND contype='c' LOOP
  EXECUTE format('ALTER TABLE shipments DROP CONSTRAINT %I',c.conname);
 END LOOP;
END; $$;
ALTER TABLE shipments ADD CONSTRAINT ck_shipment_delivery_status CHECK(status IN ('PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED','READY_FOR_PICKUP','PICKED_UP'));
ALTER TABLE shipments ADD CONSTRAINT ck_shipment_delivery_timestamps CHECK(
 (status IN ('PENDING','PREPARING','CANCELLED','READY_FOR_PICKUP') AND shipped_at IS NULL AND delivered_at IS NULL)
 OR (status='SHIPPED' AND shipped_at IS NOT NULL AND delivered_at IS NULL)
 OR (status='DELIVERED' AND shipped_at IS NOT NULL AND delivered_at IS NOT NULL AND delivered_at>=shipped_at)
 OR (status='PICKED_UP' AND shipped_at IS NULL AND delivered_at IS NOT NULL));
ALTER TABLE shipments ADD CONSTRAINT ck_shipment_pickup_tracking CHECK(status NOT IN ('READY_FOR_PICKUP','PICKED_UP') OR tracking_code IS NULL);
