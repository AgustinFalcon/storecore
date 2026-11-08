-- PSD-T02: additive customer-owned favorites and explicit customer capability.
CREATE TABLE customer_favorites (
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_id, variant_id)
);
CREATE INDEX ix_customer_favorites_list ON customer_favorites(customer_id, added_at DESC, variant_id);
GRANT SELECT, INSERT, DELETE ON customer_favorites TO storecore_runtime;

ALTER TABLE capability_actions ADD COLUMN customer_allowed BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
DECLARE
  v_promoted INT;
  v_manage INT;
BEGIN
  LOCK TABLE capability_modules IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE capability_actions IN ACCESS EXCLUSIVE MODE;
  IF (SELECT future_optional FROM capability_modules WHERE module_code='FAVORITES') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'PSD-T02 expected FAVORITES future_optional=true';
  END IF;

  ALTER TABLE capability_modules DISABLE TRIGGER trg_prevent_capability_module_mutation;
  ALTER TABLE capability_actions DISABLE TRIGGER trg_prevent_capability_action_mutation;

  UPDATE capability_modules SET future_optional=FALSE WHERE module_code='FAVORITES' AND future_optional=TRUE;
  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  INSERT INTO capability_actions(module_code,action_code,allows_write,action_kind,allowed_when_paused,customer_allowed)
  VALUES ('FAVORITES','READ',FALSE,'READ',FALSE,TRUE)
  ON CONFLICT(module_code,action_code) DO UPDATE SET action_kind='READ',allows_write=FALSE,allowed_when_paused=FALSE,customer_allowed=TRUE;
  UPDATE capability_actions SET customer_allowed=TRUE WHERE module_code='FAVORITES' AND action_code='MANAGE';
  GET DIAGNOSTICS v_manage = ROW_COUNT;

  ALTER TABLE capability_actions ENABLE ALWAYS TRIGGER trg_prevent_capability_action_mutation;
  ALTER TABLE capability_modules ENABLE ALWAYS TRIGGER trg_prevent_capability_module_mutation;

  IF v_promoted <> 1 OR v_manage <> 1 THEN
    RAISE EXCEPTION 'PSD-T02 expected one FAVORITES module and one MANAGE action';
  END IF;
END $$;
