-- TASK-DSP-003 immutable STOCK_DESIRED_CHANGED outbox. Does not edit V1–V17.
-- No dispatcher, delivery state machine, webhook, or live ML caller.

ALTER TABLE public.channel_outbox
  ADD COLUMN projection_version BIGINT NULL;

ALTER TABLE public.channel_outbox
  ADD CONSTRAINT ck_channel_outbox_stock_projection
  CHECK (
    (kind <> 'STOCK_DESIRED_CHANGED' AND projection_version IS NULL)
    OR (kind = 'STOCK_DESIRED_CHANGED' AND listing_id IS NOT NULL
        AND projection_version IS NOT NULL AND projection_version > 0)
  );

CREATE UNIQUE INDEX uq_channel_outbox_stock_projection_version
  ON public.channel_outbox(listing_id, projection_version)
  WHERE kind = 'STOCK_DESIRED_CHANGED';

CREATE INDEX ix_channel_outbox_stock_listing_created
  ON public.channel_outbox(listing_id, created_at)
  WHERE kind = 'STOCK_DESIRED_CHANGED';

CREATE TABLE public.channel_outbox_stock_projection (
  outbox_id BIGINT PRIMARY KEY REFERENCES public.channel_outbox(id) ON DELETE RESTRICT,
  listing_id BIGINT NOT NULL REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  account_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  projection_version BIGINT NOT NULL CHECK (projection_version > 0),
  desired_quantity INTEGER NOT NULL CHECK (desired_quantity >= 0),
  mapping_fingerprint CHAR(64) NOT NULL,
  eligibility_fingerprint CHAR(64) NOT NULL,
  contract_version VARCHAR(32) NOT NULL,
  UNIQUE (listing_id, projection_version)
);

CREATE TRIGGER trg_prevent_immutable_channel_outbox_stock_projection
  BEFORE UPDATE OR DELETE ON public.channel_outbox_stock_projection
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

GRANT INSERT ON TABLE public.channel_outbox TO storecore_runtime;
GRANT INSERT ON TABLE public.channel_outbox_delivery TO storecore_runtime;
GRANT INSERT ON TABLE public.channel_outbox_stock_projection TO storecore_runtime;
REVOKE UPDATE, DELETE ON TABLE public.channel_outbox_stock_projection FROM storecore_runtime;
REVOKE UPDATE, DELETE ON TABLE public.channel_outbox FROM storecore_runtime;
REVOKE DELETE ON TABLE public.channel_outbox_delivery FROM storecore_runtime;
