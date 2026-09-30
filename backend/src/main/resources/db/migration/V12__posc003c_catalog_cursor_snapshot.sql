-- POSC-003C opaque catalog cursor, page snapshots, and quote retention.
-- Does not edit V1–V11. Does not activate BLACKSTORE_INTEGRATION.

ALTER TABLE public.blackstore_catalog_cursors
  ADD COLUMN last_variant_id BIGINT NULL,
  ADD COLUMN page_size INTEGER NULL,
  ADD COLUMN visibility_digest CHAR(64) NULL,
  ADD COLUMN format_version VARCHAR(16) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();

UPDATE public.blackstore_catalog_cursors
   SET format_version = 'LEGACY'
 WHERE last_variant_id IS NULL;

ALTER TABLE public.blackstore_catalog_cursors
  ADD CONSTRAINT ck_blackstore_catalog_cursors_format
  CHECK (format_version IN ('LEGACY', 'C1'));

CREATE TABLE public.blackstore_catalog_page_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_instance_id UUID NOT NULL REFERENCES public.blackstore_companions(client_instance_id) ON DELETE RESTRICT,
  request_cursor VARCHAR(160) NOT NULL DEFAULT '',
  page_size INTEGER NOT NULL,
  visibility_digest CHAR(64) NOT NULL,
  content_digest CHAR(64) NOT NULL,
  generation INTEGER NOT NULL,
  catalog_version VARCHAR(64) NOT NULL,
  etag VARCHAR(64) NOT NULL,
  next_cursor VARCHAR(160) NULL,
  body JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  UNIQUE (client_instance_id, request_cursor, page_size, visibility_digest, content_digest, generation),
  CHECK (page_size BETWEEN 1 AND 200),
  CHECK (generation > 0),
  CHECK (jsonb_typeof(body) = 'object')
);

CREATE TABLE public.blackstore_price_quotes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_instance_id UUID NOT NULL REFERENCES public.blackstore_companions(client_instance_id) ON DELETE RESTRICT,
  variant_id BIGINT NOT NULL,
  price_version VARCHAR(64) NOT NULL,
  catalog_version VARCHAR(64) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (client_instance_id, variant_id, price_version),
  CHECK (expires_at > issued_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blackstore_catalog_page_snapshots, public.blackstore_price_quotes TO storecore_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.blackstore_catalog_page_snapshots_id_seq TO storecore_runtime;
GRANT USAGE, SELECT ON SEQUENCE public.blackstore_price_quotes_id_seq TO storecore_runtime;
GRANT ALL ON public.blackstore_catalog_page_snapshots, public.blackstore_price_quotes TO storecore_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO storecore_migrator;
