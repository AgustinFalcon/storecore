-- TASK-DSP-001 typed channel account purpose. Does not edit V1–V15.
-- Backfill is UNCLASSIFIED. No webhook binding, projection, or outbox DDL.

ALTER TABLE public.channel_accounts
  ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN eligibility_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.products
  ADD COLUMN eligibility_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.product_variants
  ADD COLUMN eligibility_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.channel_listings
  ADD COLUMN mapping_revision BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.channel_accounts
  ADD CONSTRAINT ck_channel_account_purpose
  CHECK (purpose IN ('UNCLASSIFIED', 'EXTERNAL_ML_SYNC', 'INTERNAL_PRICE_POLICY'));
