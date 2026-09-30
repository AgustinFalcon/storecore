-- TASK-DSP-002 monotonic listing stock projection. Does not edit V1–V16.
-- No webhook binding, outbox kind, dispatcher, or delivery mutation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $_chk$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.channel_listings l
    LEFT JOIN public.channel_accounts a ON a.id = l.account_id
    WHERE a.id IS NULL
  ) THEN
    RAISE EXCEPTION 'DSP002_BROKEN_LISTING_ACCOUNT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.channel_listings l
    LEFT JOIN public.product_variants v ON v.id = l.variant_id
    WHERE v.id IS NULL
  ) THEN
    RAISE EXCEPTION 'DSP002_BROKEN_LISTING_VARIANT';
  END IF;
END; $_chk$;

CREATE TABLE public.channel_listing_stock_projection (
  listing_id BIGINT PRIMARY KEY REFERENCES public.channel_listings(id) ON DELETE RESTRICT,
  account_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  external_listing_id VARCHAR(128) NOT NULL,
  variation_id VARCHAR(128) NULL,
  desired_quantity INTEGER NOT NULL CHECK (desired_quantity >= 0),
  projection_version BIGINT NOT NULL CHECK (projection_version > 0),
  projection_state VARCHAR(16) NOT NULL CHECK (projection_state IN ('WITHHELD', 'EMITTED')),
  withholding_reason VARCHAR(64) NULL,
  mapping_fingerprint CHAR(64) NOT NULL,
  eligibility_fingerprint CHAR(64) NOT NULL,
  source_cause VARCHAR(64) NOT NULL CHECK (source_cause IN (
    'WEB_RESERVE','WEB_RELEASE','WEB_EXPIRY','INTERNAL_ADJUSTMENT',
    'LISTING_ACTIVATED','LISTING_MAPPING_CONFIRMED','LISTING_REMAPPED','LISTING_PAUSED',
    'LISTING_REACTIVATED','PRODUCT_DEACTIVATED','VARIANT_DEACTIVATED',
    'PRODUCT_REACTIVATED','VARIANT_REACTIVATED','ACCOUNT_REACTIVATED',
    'CAPABILITY_REACTIVATED','UPGRADE_QUARANTINE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((projection_state = 'WITHHELD') = (withholding_reason IS NOT NULL))
);

INSERT INTO public.channel_listing_stock_projection
  (listing_id, account_id, variant_id, external_listing_id, variation_id, desired_quantity,
   projection_version, projection_state, withholding_reason, mapping_fingerprint,
   eligibility_fingerprint, source_cause)
SELECT l.id, l.account_id, l.variant_id, l.external_listing_id, l.variation_id,
       GREATEST(0, COALESCE(b.available_quantity, 0) - COALESCE(b.safety_stock, 0)),
       1, 'WITHHELD', 'UPGRADE_CLASSIFICATION_REQUIRED',
       encode(digest(concat_ws('|', l.account_id::text, l.external_listing_id,
         COALESCE(l.variation_id, ''), l.variant_id::text), 'sha256'), 'hex'),
       repeat('0', 64),
       'UPGRADE_QUARANTINE'
  FROM public.channel_listings l
  LEFT JOIN public.inventory_balances b ON b.variant_id = l.variant_id
ON CONFLICT (listing_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON TABLE public.channel_listing_stock_projection TO storecore_runtime;
REVOKE DELETE ON TABLE public.channel_listing_stock_projection FROM storecore_runtime;
