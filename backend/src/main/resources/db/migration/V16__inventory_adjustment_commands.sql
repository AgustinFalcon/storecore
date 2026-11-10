CREATE TABLE inventory_adjustment_commands (
 command_id UUID PRIMARY KEY,
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 request_content JSONB NOT NULL CHECK (jsonb_typeof(request_content)='array'),
 state VARCHAR(16) NOT NULL CHECK (state IN ('APPLIED','REJECTED')),
 rejection_reason VARCHAR(48) NULL,
 ledger_id BIGINT NULL UNIQUE REFERENCES inventory_ledger(id) ON DELETE RESTRICT,
 recorded_at TIMESTAMPTZ NOT NULL,
 result JSONB NOT NULL CHECK (jsonb_typeof(result)='object'),
 CHECK ((state='APPLIED' AND rejection_reason IS NULL AND ledger_id IS NOT NULL)
     OR (state='REJECTED' AND rejection_reason IS NOT NULL AND rejection_reason IN ('BALANCE_CHANGED','BALANCE_MISSING','WOULD_MAKE_AVAILABLE_NEGATIVE','QUANTITY_OVERFLOW') AND ledger_id IS NULL)),
 CHECK (result ?& ARRAY['state','commandId','variantId','reason','before','after','ledgerId','recordedAt']),
 CHECK (coalesce(result->>'state'=state AND result->>'commandId'=command_id::text AND result->>'variantId'=variant_id::text, false)),
 CHECK ((result->>'reason') IS NOT DISTINCT FROM rejection_reason),
 CHECK ((result->>'ledgerId') IS NOT DISTINCT FROM ledger_id::text)
);
CREATE INDEX ix_inventory_adjustment_actor_variant ON inventory_adjustment_commands(actor_id,variant_id);
CREATE TRIGGER trg_prevent_immutable_inventory_adjustment_commands
 BEFORE UPDATE OR DELETE ON inventory_adjustment_commands
 FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
REVOKE ALL ON inventory_adjustment_commands FROM PUBLIC, storecore_runtime;
GRANT SELECT, INSERT ON inventory_adjustment_commands TO storecore_runtime;
GRANT ALL ON inventory_adjustment_commands TO storecore_migrator;
