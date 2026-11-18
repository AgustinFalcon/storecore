-- Forward-only catalog media persistence. V1-V26 are published and immutable.
-- The application remains single-tenant; ownership is the authenticated USER.

ALTER TABLE products
  ADD COLUMN media_revision BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT ck_products_media_revision CHECK (media_revision > 0);

CREATE TABLE catalog_media_drafts (
  id UUID PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_product_id BIGINT NULL REFERENCES products(id) ON DELETE RESTRICT,
  state VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_catalog_media_drafts_state
    CHECK (state IN ('OPEN','CLAIMED','EXPIRED','ABANDONED')),
  CONSTRAINT ck_catalog_media_drafts_claim CHECK (state <> 'CLAIMED' OR target_product_id IS NOT NULL),
  CONSTRAINT ck_catalog_media_drafts_revision CHECK (revision > 0),
  CONSTRAINT ck_catalog_media_drafts_expiry CHECK (expires_at > created_at),
  CONSTRAINT uq_catalog_media_drafts_owner UNIQUE (id, owner_user_id)
);

CREATE INDEX ix_catalog_media_drafts_owner_state
  ON catalog_media_drafts(owner_user_id, state, expires_at);
CREATE INDEX ix_catalog_media_drafts_target
  ON catalog_media_drafts(target_product_id) WHERE target_product_id IS NOT NULL;

CREATE TABLE media_assets (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL,
  owner_user_id BIGINT NOT NULL,
  upload_id UUID NOT NULL,
  original_sha256 CHAR(64) NOT NULL,
  normalized_sha256 CHAR(64) NOT NULL,
  format VARCHAR(8) NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  normalized_size BIGINT NOT NULL,
  state VARCHAR(24) NOT NULL DEFAULT 'AWAITING_BYTES',
  provider_kind VARCHAR(16) NOT NULL DEFAULT 'UNCONFIGURED',
  provider_key VARCHAR(255) NULL,
  failure_code VARCHAR(32) NOT NULL DEFAULT 'NONE',
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  delete_requested_at TIMESTAMPTZ NULL,
  CONSTRAINT fk_media_assets_draft_owner FOREIGN KEY (draft_id, owner_user_id)
    REFERENCES catalog_media_drafts(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT uq_media_assets_upload UNIQUE (draft_id, upload_id),
  CONSTRAINT uq_media_assets_command_scope UNIQUE (id, draft_id, owner_user_id, upload_id),
  CONSTRAINT ck_media_assets_owner_creator CHECK (owner_user_id = created_by),
  CONSTRAINT ck_media_assets_hashes CHECK (
    original_sha256 ~ '^[0-9a-f]{64}$' AND normalized_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_media_assets_format CHECK (format IN ('JPEG','PNG','WEBP')),
  CONSTRAINT ck_media_assets_dimensions CHECK (
    width BETWEEN 320 AND 6000 AND height BETWEEN 320 AND 6000
    AND width::BIGINT * height::BIGINT <= 16000000
  ),
  CONSTRAINT ck_media_assets_size CHECK (normalized_size > 0),
  CONSTRAINT ck_media_assets_state CHECK (state IN (
    'AWAITING_BYTES','STORED_PRIVATE','ATTACHED','DELETE_PENDING','DELETED','FAILED'
  )),
  CONSTRAINT ck_media_assets_provider CHECK (provider_kind IN ('UNCONFIGURED','TEST_STUB','CLOUDINARY')),
  CONSTRAINT ck_media_assets_provider_key CHECK (
    (provider_kind = 'UNCONFIGURED' AND provider_key IS NULL)
    OR (provider_kind IN ('TEST_STUB','CLOUDINARY') AND provider_key IS NOT NULL
        AND provider_key ~ '^[a-z0-9][a-z0-9/_-]{0,254}$'
        AND provider_key NOT LIKE '%//%' AND provider_key NOT LIKE '%/')
  ),
  CONSTRAINT ck_media_assets_failure CHECK (
    (state = 'FAILED' AND failure_code IN (
      'UNAUTHORISED','INVALID_FORMAT','INVALID_DIMENSIONS','SIZE_EXCEEDED','CORRUPT_BYTES',
      'ANIMATED_MEDIA','STORAGE_UNAVAILABLE','SCOPE_CONFLICT'
    )) OR (state <> 'FAILED' AND failure_code = 'NONE')
  ),
  CONSTRAINT ck_media_assets_delete_request CHECK (
    (state = 'DELETE_PENDING' AND delete_requested_at IS NOT NULL)
    OR (state <> 'DELETE_PENDING')
  ),
  CONSTRAINT ck_media_assets_timestamps CHECK (updated_at >= created_at)
);

CREATE INDEX ix_media_assets_owner_state ON media_assets(owner_user_id, state, updated_at);
CREATE INDEX ix_media_assets_draft ON media_assets(draft_id, created_at);
CREATE UNIQUE INDEX uq_media_assets_provider_object
  ON media_assets(provider_kind, provider_key) WHERE provider_key IS NOT NULL;

CREATE TABLE media_upload_commands (
  draft_id UUID NOT NULL,
  owner_user_id BIGINT NOT NULL,
  upload_id UUID NOT NULL,
  original_hash CHAR(64) NOT NULL,
  normalized_hash CHAR(64) NOT NULL,
  asset_id UUID NOT NULL,
  deterministic_key VARCHAR(255) NOT NULL,
  state VARCHAR(24) NOT NULL DEFAULT 'AWAITING_BYTES',
  lease_owner VARCHAR(128) NULL,
  lease_until TIMESTAMPTZ NULL,
  fence_version BIGINT NOT NULL DEFAULT 0,
  outcome VARCHAR(16) NULL,
  result JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (draft_id, upload_id),
  CONSTRAINT fk_media_upload_commands_draft_owner FOREIGN KEY (draft_id, owner_user_id)
    REFERENCES catalog_media_drafts(id, owner_user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_media_upload_commands_asset_scope
    FOREIGN KEY (asset_id, draft_id, owner_user_id, upload_id)
    REFERENCES media_assets(id, draft_id, owner_user_id, upload_id) ON DELETE RESTRICT,
  CONSTRAINT uq_media_upload_commands_asset UNIQUE (asset_id),
  CONSTRAINT ck_media_upload_commands_hashes CHECK (
    original_hash ~ '^[0-9a-f]{64}$' AND normalized_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT ck_media_upload_commands_key CHECK (
    deterministic_key ~ '^[a-z0-9][a-z0-9/_-]{0,254}$'
    AND deterministic_key NOT LIKE '%//%' AND deterministic_key NOT LIKE '%/'
  ),
  CONSTRAINT ck_media_upload_commands_state CHECK (state IN (
    'AWAITING_BYTES','CLAIMED','STORED_PRIVATE','ATTACHED','DELETE_PENDING','COMPLETED','FAILED'
  )),
  CONSTRAINT ck_media_upload_commands_lease CHECK (
    (state = 'CLAIMED' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL)
    OR (state <> 'CLAIMED' AND lease_owner IS NULL AND lease_until IS NULL)
  ),
  CONSTRAINT ck_media_upload_commands_fence CHECK (fence_version >= 0),
  CONSTRAINT ck_media_upload_commands_outcome CHECK (
    outcome IS NULL OR outcome IN ('CREATED','REPLAY','REJECTED','CONFLICT','FAILED')
  ),
  CONSTRAINT ck_media_upload_commands_result CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  CONSTRAINT ck_media_upload_commands_terminal_result CHECK (
    (state = 'COMPLETED' AND outcome IS NOT NULL AND outcome IN ('CREATED','REPLAY') AND result IS NOT NULL)
    OR (state = 'FAILED' AND outcome IS NOT NULL AND outcome IN ('REJECTED','CONFLICT','FAILED') AND result IS NOT NULL)
    OR (state NOT IN ('COMPLETED','FAILED') AND outcome IS NULL AND result IS NULL)
  ),
  CONSTRAINT ck_media_upload_commands_timestamps CHECK (updated_at >= created_at)
);

CREATE INDEX ix_media_upload_commands_claimable
  ON media_upload_commands(state, lease_until, updated_at);

ALTER TABLE product_images
  ADD COLUMN media_asset_id UUID NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  ADD COLUMN source_kind VARCHAR(16) NOT NULL DEFAULT 'LEGACY_URL',
  ADD COLUMN alt_text VARCHAR(180) NULL;

-- Every legal V1 row is preserved. Ties are made deterministic without imposing
-- a gallery-size limit, and a missing primary selects the first existing row.
WITH ranked AS (
  SELECT i.id,
         row_number() OVER (PARTITION BY i.product_id ORDER BY i.sort_order, i.id) - 1 AS new_order,
         first_value(i.id) OVER (
           PARTITION BY i.product_id
           ORDER BY CASE WHEN i.is_primary THEN 0 ELSE 1 END, i.sort_order, i.id
         ) AS primary_id,
         left(COALESCE(NULLIF(btrim(p.name), ''), 'Producto ' || i.product_id::text), 180) AS new_alt
  FROM product_images i
  JOIN products p ON p.id = i.product_id
)
UPDATE product_images i
SET sort_order = ranked.new_order,
    is_primary = (i.id = ranked.primary_id),
    alt_text = ranked.new_alt
FROM ranked
WHERE ranked.id = i.id;

ALTER TABLE product_images
  ALTER COLUMN url DROP NOT NULL,
  ALTER COLUMN alt_text SET DEFAULT 'Imagen de producto',
  ALTER COLUMN alt_text SET NOT NULL;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.product_images'::regclass
      AND c.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%url%https%'
  LOOP
    EXECUTE format('ALTER TABLE public.product_images DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE product_images
  ADD CONSTRAINT ck_product_images_source_kind CHECK (source_kind IN ('LEGACY_URL','MANAGED')),
  ADD CONSTRAINT ck_product_images_source CHECK (
    (source_kind = 'LEGACY_URL' AND url IS NOT NULL AND url ~ '^https://' AND media_asset_id IS NULL)
    OR (source_kind = 'MANAGED' AND url IS NULL AND media_asset_id IS NOT NULL)
  ),
  ADD CONSTRAINT ck_product_images_sort_order CHECK (sort_order >= 0),
  ADD CONSTRAINT ck_product_images_alt_text CHECK (
    alt_text = btrim(alt_text) AND char_length(alt_text) BETWEEN 1 AND 180
  ),
  ADD CONSTRAINT uq_product_images_product_id_id UNIQUE (product_id, id),
  ADD CONSTRAINT uq_product_images_media_asset UNIQUE (media_asset_id);

CREATE UNIQUE INDEX uq_product_images_order ON product_images(product_id, sort_order);

CREATE TABLE variant_images (
  product_id BIGINT NOT NULL,
  variant_id BIGINT NOT NULL,
  product_image_id BIGINT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (variant_id, product_image_id),
  CONSTRAINT fk_variant_images_variant_product FOREIGN KEY (product_id, variant_id)
    REFERENCES product_variants(product_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_variant_images_image_product FOREIGN KEY (product_id, product_image_id)
    REFERENCES product_images(product_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT ck_variant_images_sort_order CHECK (sort_order >= 0),
  CONSTRAINT uq_variant_images_order UNIQUE (variant_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE UNIQUE INDEX uq_variant_images_primary ON variant_images(variant_id) WHERE is_primary;
CREATE INDEX ix_variant_images_product ON variant_images(product_id, variant_id);

CREATE FUNCTION enforce_catalog_media_draft_identity() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.owner_user_id <> OLD.owner_user_id OR NEW.created_at <> OLD.created_at
     OR (OLD.target_product_id IS NOT NULL AND NEW.target_product_id IS DISTINCT FROM OLD.target_product_id) THEN
    RAISE EXCEPTION 'catalog media draft identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_catalog_media_draft_identity
BEFORE UPDATE ON catalog_media_drafts
FOR EACH ROW EXECUTE FUNCTION enforce_catalog_media_draft_identity();

CREATE FUNCTION enforce_media_asset_identity() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.draft_id <> OLD.draft_id OR NEW.owner_user_id <> OLD.owner_user_id
     OR NEW.upload_id <> OLD.upload_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR NEW.original_sha256 <> OLD.original_sha256 OR NEW.normalized_sha256 <> OLD.normalized_sha256
     OR NEW.format <> OLD.format OR NEW.width <> OLD.width OR NEW.height <> OLD.height
     OR NEW.normalized_size <> OLD.normalized_size THEN
    RAISE EXCEPTION 'media asset identity and normalized payload are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_media_asset_identity
BEFORE UPDATE ON media_assets
FOR EACH ROW EXECUTE FUNCTION enforce_media_asset_identity();

CREATE FUNCTION enforce_media_upload_command_identity() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.draft_id <> OLD.draft_id OR NEW.owner_user_id <> OLD.owner_user_id OR NEW.upload_id <> OLD.upload_id
     OR NEW.asset_id <> OLD.asset_id OR NEW.original_hash <> OLD.original_hash
     OR NEW.normalized_hash <> OLD.normalized_hash OR NEW.deterministic_key <> OLD.deterministic_key
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'media upload command identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_media_upload_command_identity
BEFORE UPDATE ON media_upload_commands
FOR EACH ROW EXECUTE FUNCTION enforce_media_upload_command_identity();

CREATE FUNCTION enforce_single_product_image_primary() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE checked_product BIGINT; locked_product BIGINT; old_product BIGINT; new_product BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_product := OLD.product_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_product := NEW.product_id; END IF;
  checked_product := COALESCE(new_product, old_product);
  FOR locked_product IN
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[old_product,new_product]) candidate
    WHERE candidate IS NOT NULL ORDER BY candidate
  LOOP
    PERFORM 1 FROM public.products WHERE id = locked_product FOR NO KEY UPDATE;
    -- Create a parent tuple version. REPEATABLE READ writers with an older
    -- snapshot must serialize-fail instead of validating invisible siblings.
    UPDATE public.products SET media_revision = media_revision WHERE id = locked_product;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.product_images WHERE product_id = checked_product)
     AND (SELECT count(*) FROM public.product_images WHERE product_id = checked_product AND is_primary) <> 1 THEN
    RAISE EXCEPTION 'product gallery % must have exactly one primary image', checked_product USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.product_id <> NEW.product_id
     AND EXISTS (SELECT 1 FROM public.product_images WHERE product_id = OLD.product_id)
     AND (SELECT count(*) FROM public.product_images WHERE product_id = OLD.product_id AND is_primary) <> 1 THEN
    RAISE EXCEPTION 'product gallery % must have exactly one primary image', OLD.product_id USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_product_images_exact_primary
AFTER INSERT OR DELETE OR UPDATE OF product_id, is_primary ON product_images
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_single_product_image_primary();

CREATE FUNCTION enforce_single_variant_image_primary() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE checked_variant BIGINT; locked_variant BIGINT; old_variant BIGINT; new_variant BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_variant := OLD.variant_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_variant := NEW.variant_id; END IF;
  checked_variant := COALESCE(new_variant, old_variant);
  FOR locked_variant IN
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[old_variant,new_variant]) candidate
    WHERE candidate IS NOT NULL ORDER BY candidate
  LOOP
    PERFORM 1 FROM public.product_variants WHERE id = locked_variant FOR NO KEY UPDATE;
    UPDATE public.product_variants SET updated_at = updated_at WHERE id = locked_variant;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.variant_images WHERE variant_id = checked_variant)
     AND (SELECT count(*) FROM public.variant_images WHERE variant_id = checked_variant AND is_primary) <> 1 THEN
    RAISE EXCEPTION 'variant gallery % must have exactly one primary image', checked_variant USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.variant_id <> NEW.variant_id
     AND EXISTS (SELECT 1 FROM public.variant_images WHERE variant_id = OLD.variant_id)
     AND (SELECT count(*) FROM public.variant_images WHERE variant_id = OLD.variant_id AND is_primary) <> 1 THEN
    RAISE EXCEPTION 'variant gallery % must have exactly one primary image', OLD.variant_id USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_variant_images_exact_primary
AFTER INSERT OR DELETE OR UPDATE OF variant_id, is_primary ON variant_images
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_single_variant_image_primary();

-- Version 3 means the database owns managed media persistence. The deployment
-- interlock rejects every older artifact (including version 2) before startup.
ALTER TABLE catalog_schema_compatibility_version
  DROP CONSTRAINT catalog_schema_compatibility_version_version_check;
UPDATE catalog_schema_compatibility_version SET version = 3 WHERE singleton;
ALTER TABLE catalog_schema_compatibility_version
  ADD CONSTRAINT catalog_schema_compatibility_version_version_check CHECK (version = 3);

REVOKE ALL ON catalog_media_drafts, media_assets, media_upload_commands, variant_images
  FROM PUBLIC, storecore_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  catalog_media_drafts, media_assets, media_upload_commands, variant_images, product_images
  TO storecore_runtime;
GRANT USAGE, SELECT ON SEQUENCE product_images_id_seq TO storecore_runtime;
GRANT SELECT ON catalog_schema_compatibility_version TO storecore_runtime;
REVOKE ALL ON FUNCTION enforce_catalog_media_draft_identity() FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION enforce_media_asset_identity() FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION enforce_media_upload_command_identity() FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION enforce_single_product_image_primary() FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION enforce_single_variant_image_primary() FROM PUBLIC, storecore_runtime;
