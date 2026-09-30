-- TASK-DSP-009: allow BlackStore local projection causes on the snapshot table.
-- Does not edit V1–V18. No dispatcher, live companion, or delivery mutation.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'channel_listing_stock_projection'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%source_cause%'
  LOOP
    EXECUTE format('ALTER TABLE public.channel_listing_stock_projection DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.channel_listing_stock_projection
  ADD CONSTRAINT channel_listing_stock_projection_source_cause_check
  CHECK (source_cause IN (
    'WEB_RESERVE','WEB_CONSUME','WEB_RELEASE','WEB_EXPIRY','INTERNAL_ADJUSTMENT',
    'LISTING_ACTIVATED','LISTING_MAPPING_CONFIRMED','LISTING_REMAPPED','LISTING_PAUSED',
    'LISTING_REACTIVATED','PRODUCT_DEACTIVATED','VARIANT_DEACTIVATED',
    'PRODUCT_REACTIVATED','VARIANT_REACTIVATED','ACCOUNT_REACTIVATED',
    'CAPABILITY_REACTIVATED','UPGRADE_QUARANTINE',
    'EXTERNAL_BLACKSTORE_COMMIT','EXTERNAL_BLACKSTORE_RELEASE','EXTERNAL_BLACKSTORE_EXPIRY'
  ));
