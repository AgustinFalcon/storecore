-- Durable idempotency receipt for local create-only catalog/media composition.
-- V1-V29 remain published and immutable.

CREATE TABLE catalog_media_product_creation_commands (
  draft_id UUID PRIMARY KEY,
  owner_user_id BIGINT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
  product_id BIGINT NULL REFERENCES products(id) ON DELETE RESTRICT,
  result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT fk_media_product_creation_draft_owner
    FOREIGN KEY (draft_id, owner_user_id)
    REFERENCES catalog_media_drafts(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_media_product_creation_product UNIQUE (product_id),
  CONSTRAINT ck_media_product_creation_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_media_product_creation_state CHECK (state IN ('IN_PROGRESS','COMPLETED')),
  CONSTRAINT ck_media_product_creation_result CHECK (result IS NULL OR jsonb_typeof(result)='object'),
  CONSTRAINT ck_media_product_creation_terminal CHECK (
    (state='IN_PROGRESS' AND product_id IS NULL AND result IS NULL AND completed_at IS NULL)
    OR (state='COMPLETED' AND product_id IS NOT NULL AND result IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX ix_media_product_creation_owner_created
  ON catalog_media_product_creation_commands(owner_user_id,created_at DESC);

CREATE FUNCTION enforce_media_product_creation_identity() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.draft_id <> OLD.draft_id OR NEW.owner_user_id <> OLD.owner_user_id
     OR NEW.request_hash <> OLD.request_hash OR NEW.created_at <> OLD.created_at
     OR OLD.state = 'COMPLETED' THEN
    RAISE EXCEPTION 'media product creation identity or terminal receipt is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state <> 'IN_PROGRESS' OR NEW.state <> 'COMPLETED' THEN
    RAISE EXCEPTION 'invalid media product creation transition' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_media_product_creation_identity
BEFORE UPDATE ON catalog_media_product_creation_commands
FOR EACH ROW EXECUTE FUNCTION enforce_media_product_creation_identity();

REVOKE ALL ON catalog_media_product_creation_commands FROM PUBLIC, storecore_runtime;
GRANT SELECT, INSERT, UPDATE ON catalog_media_product_creation_commands TO storecore_runtime;
GRANT SELECT, INSERT ON products TO storecore_runtime;
GRANT SELECT, INSERT ON product_variants, inventory_balances, inventory_ledger TO storecore_runtime;
GRANT INSERT ON audit_events TO storecore_runtime;
GRANT USAGE, SELECT ON SEQUENCE
  products_id_seq, product_variants_id_seq, product_images_id_seq,
  inventory_ledger_id_seq, audit_events_id_seq
TO storecore_runtime;
REVOKE ALL ON FUNCTION enforce_media_product_creation_identity() FROM PUBLIC, storecore_runtime;
