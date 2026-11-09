-- A received return remains unclassified. Published inspection_result values are
-- retained as historical evidence and never backfilled into item outcomes.
CREATE TABLE rma_disposition_commands (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 return_id BIGINT NOT NULL UNIQUE REFERENCES returns(id) ON DELETE RESTRICT,
 idempotency_key UUID NOT NULL UNIQUE,
 request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 confirmed_at TIMESTAMPTZ NOT NULL,
 result JSONB NOT NULL CHECK (jsonb_typeof(result)='object')
);
ALTER TABLE return_items
 ADD COLUMN disposition_command_id BIGINT NULL REFERENCES rma_disposition_commands(id) ON DELETE RESTRICT,
 ADD COLUMN restock_quantity INTEGER NULL,
 ADD COLUMN damaged_quantity INTEGER NULL,
 ADD COLUMN rejected_quantity INTEGER NULL,
 ADD COLUMN damage_reason VARCHAR(32) NULL,
 ADD COLUMN rejection_reason VARCHAR(32) NULL,
 ADD COLUMN inspection_observation VARCHAR(500) NULL;
ALTER TABLE return_items ADD CONSTRAINT ck_return_item_disposition CHECK (
 (disposition_command_id IS NULL AND restock_quantity IS NULL AND damaged_quantity IS NULL AND rejected_quantity IS NULL AND damage_reason IS NULL AND rejection_reason IS NULL AND inspection_observation IS NULL)
 OR
 (disposition_command_id IS NOT NULL AND restock_quantity IS NOT NULL AND damaged_quantity IS NOT NULL AND rejected_quantity IS NOT NULL
  AND restock_quantity>=0 AND damaged_quantity>=0 AND rejected_quantity>=0
  AND restock_quantity::bigint+damaged_quantity::bigint+rejected_quantity::bigint=quantity::bigint
  AND ((damaged_quantity=0 AND damage_reason IS NULL) OR (damaged_quantity>0 AND damage_reason IS NOT NULL AND damage_reason IN ('COSMETIC','FUNCTIONAL','MISSING_PARTS','UNSAFE','OTHER')))
  AND ((rejected_quantity=0 AND rejection_reason IS NULL) OR (rejected_quantity>0 AND rejection_reason IS NOT NULL AND rejection_reason IN ('NOT_OUR_ITEM','SERIAL_MISMATCH','OUT_OF_POLICY','INCOMPLETE_RETURN','OTHER')))
  AND ((restock_quantity=0 AND adjustment_ledger_id IS NULL) OR (restock_quantity>0 AND adjustment_ledger_id IS NOT NULL)))
);
CREATE UNIQUE INDEX ux_return_item_disposition_ledger ON return_items(adjustment_ledger_id) WHERE disposition_command_id IS NOT NULL;

ALTER TABLE inventory_ledger DROP CONSTRAINT ck_inventory_ledger_event_type;
ALTER TABLE inventory_ledger ADD CONSTRAINT ck_inventory_ledger_event_type CHECK (
 event_type IN ('RESERVATION','RELEASE','SALE','REFUND','RETURN_RECEIVED','ADJUSTMENT','RECONCILIATION','STOCK_COMMIT_EXTERNAL','RMA_RESTOCK')
);
ALTER TABLE inventory_ledger DROP CONSTRAINT ck_inventory_ledger_event_channel_pairing;
ALTER TABLE inventory_ledger ADD CONSTRAINT ck_inventory_ledger_event_channel_pairing CHECK (
 (event_type='SALE' AND channel IN ('WEB','MERCADO_LIBRE'))
 OR (event_type='STOCK_COMMIT_EXTERNAL' AND channel='EXTERNAL_BLACKSTORE')
 OR (event_type IN ('RESERVATION','RELEASE') AND channel IN ('WEB','MERCADO_LIBRE','INTERNAL','EXTERNAL_BLACKSTORE'))
 OR (event_type IN ('REFUND','RETURN_RECEIVED','ADJUSTMENT','RECONCILIATION') AND channel IN ('WEB','MERCADO_LIBRE','INTERNAL'))
 OR (event_type='RMA_RESTOCK' AND channel='INTERNAL' AND quantity_delta>0)
);

CREATE FUNCTION protect_return_disposition() RETURNS TRIGGER LANGUAGE plpgsql AS $body$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.disposition_command_id IS NOT NULL THEN
  RAISE EXCEPTION 'confirmed return item is immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.disposition_command_id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM rma_disposition_commands c WHERE c.id=NEW.disposition_command_id AND c.return_id=NEW.return_id) THEN
   RAISE EXCEPTION 'disposition command must belong to the return';
  END IF;
  IF NEW.restock_quantity>0 AND NOT EXISTS (
   SELECT 1 FROM inventory_ledger l JOIN order_items oi ON oi.id=NEW.order_item_id
   WHERE l.id=NEW.adjustment_ledger_id AND l.variant_id=oi.variant_id AND l.event_type='RMA_RESTOCK' AND l.channel='INTERNAL' AND l.quantity_delta=NEW.restock_quantity
  ) THEN RAISE EXCEPTION 'restock ledger does not match inspected item'; END IF;
 END IF;
 RETURN NEW;
END;
$body$;
CREATE TRIGGER trg_protect_return_disposition BEFORE INSERT OR UPDATE OR DELETE ON return_items FOR EACH ROW EXECUTE FUNCTION protect_return_disposition();
CREATE TRIGGER trg_immutable_rma_disposition_commands BEFORE UPDATE OR DELETE ON rma_disposition_commands FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
GRANT SELECT, INSERT ON rma_disposition_commands TO storecore_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO storecore_runtime;
GRANT ALL ON rma_disposition_commands TO storecore_migrator;
