-- TASK-PIC-010 / ADR-008. V7 only: flip BLACKSTORE_INTEGRATION.future_optional true→false.
-- V6 is saga DDL. Module stays DISABLED. No config, actions, companion, or other modules.

DO $$
DECLARE
  v_optional BOOLEAN;
  v_state TEXT;
  v_schema INT;
  v_updated INT;
  v_optional_others INT;
BEGIN
  LOCK TABLE capability_modules IN ACCESS EXCLUSIVE MODE;
  SELECT future_optional INTO STRICT v_optional
    FROM capability_modules WHERE module_code = 'BLACKSTORE_INTEGRATION';
  SELECT state, config_schema_version INTO STRICT v_state, v_schema
    FROM module_configurations
    WHERE module_code = 'BLACKSTORE_INTEGRATION' AND scope_kind = 'INSTALLATION' AND scope_key = 'DEFAULT';
  IF v_optional IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'PIC-010 expected future_optional=true';
  END IF;
  IF v_state IS DISTINCT FROM 'DISABLED' OR v_schema IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'PIC-010 expected DISABLED schema v2';
  END IF;
  IF NOT blackstore_schema_v2_valid((
    SELECT config FROM module_configurations
    WHERE module_code = 'BLACKSTORE_INTEGRATION' AND scope_kind = 'INSTALLATION' AND scope_key = 'DEFAULT'
  )) THEN
    RAISE EXCEPTION 'PIC-010 expected valid schema v2';
  END IF;
  SELECT COUNT(*) INTO v_optional_others
    FROM capability_modules WHERE module_code <> 'BLACKSTORE_INTEGRATION' AND future_optional;

  EXECUTE 'ALTER TABLE capability_modules DISABLE TRIGGER trg_prevent_capability_module_mutation';
  UPDATE capability_modules
     SET future_optional = FALSE
   WHERE module_code = 'BLACKSTORE_INTEGRATION' AND future_optional = TRUE;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  EXECUTE 'ALTER TABLE capability_modules ENABLE ALWAYS TRIGGER trg_prevent_capability_module_mutation';

  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'PIC-010 must update exactly one row';
  END IF;
  IF EXISTS (SELECT 1 FROM capability_modules WHERE module_code = 'BLACKSTORE_INTEGRATION' AND future_optional) THEN
    RAISE EXCEPTION 'PIC-010 flip failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM module_configurations
    WHERE module_code = 'BLACKSTORE_INTEGRATION' AND state <> 'DISABLED'
  ) THEN
    RAISE EXCEPTION 'PIC-010 must not activate the module';
  END IF;
  IF (SELECT COUNT(*) FROM capability_modules WHERE module_code <> 'BLACKSTORE_INTEGRATION' AND future_optional) <> v_optional_others THEN
    RAISE EXCEPTION 'PIC-010 must not touch other modules';
  END IF;
END $$;
