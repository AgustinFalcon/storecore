-- Durable deletion is separate from upload commands. A remote put can finish
-- after its database lease was fenced, so tombstones remain reconcilable.
CREATE TABLE media_delete_commands (
  asset_id UUID PRIMARY KEY REFERENCES media_assets(id) ON DELETE RESTRICT,
  purpose VARCHAR(16) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  lease_owner UUID NULL,
  lease_until TIMESTAMPTZ NULL,
  fence_version BIGINT NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_checked_at TIMESTAMPTZ NULL,
  tombstoned_at TIMESTAMPTZ NULL,
  last_outcome VARCHAR(24) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_media_delete_commands_purpose CHECK (purpose IN ('USER_DELETE','ORPHAN_GC')),
  CONSTRAINT ck_media_delete_commands_state CHECK (state IN ('PENDING','CLAIMED','RETRY','TOMBSTONED','BLOCKED')),
  CONSTRAINT ck_media_delete_commands_lease CHECK (
    (state = 'CLAIMED' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL)
    OR (state <> 'CLAIMED' AND lease_owner IS NULL AND lease_until IS NULL)
  ),
  CONSTRAINT ck_media_delete_commands_fence CHECK (fence_version >= 0),
  CONSTRAINT ck_media_delete_commands_attempt CHECK (attempt_count >= 0),
  CONSTRAINT ck_media_delete_commands_outcome CHECK (
    last_outcome IS NULL OR last_outcome IN ('DELETED','ALREADY_ABSENT','RETRYABLE_FAILURE','DIGEST_MISMATCH','UNKNOWN')
  ),
  CONSTRAINT ck_media_delete_commands_tombstone CHECK (
    (state = 'TOMBSTONED' AND tombstoned_at IS NOT NULL AND last_outcome IS NOT NULL
      AND last_outcome IN ('DELETED','ALREADY_ABSENT'))
    OR state <> 'TOMBSTONED'
  ),
  CONSTRAINT ck_media_delete_commands_blocked CHECK (
    (state = 'BLOCKED' AND last_outcome IS NOT NULL AND last_outcome = 'DIGEST_MISMATCH')
    OR state <> 'BLOCKED'
  ),
  CONSTRAINT ck_media_delete_commands_timestamps CHECK (
    updated_at >= created_at AND (last_checked_at IS NULL OR last_checked_at >= created_at)
    AND (tombstoned_at IS NULL OR tombstoned_at >= created_at)
  )
);

CREATE INDEX ix_media_delete_commands_claimable
  ON media_delete_commands(state, available_at, asset_id)
  WHERE state IN ('PENDING','RETRY','TOMBSTONED','CLAIMED');

CREATE FUNCTION enforce_media_delete_command_identity() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.asset_id <> OLD.asset_id OR NEW.purpose <> OLD.purpose OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'media delete command identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_media_delete_command_identity
BEFORE UPDATE ON media_delete_commands
FOR EACH ROW EXECUTE FUNCTION enforce_media_delete_command_identity();

CREATE FUNCTION catalog_media_owner_exists(candidate_owner_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = candidate_owner_id)
$$;

REVOKE ALL ON media_delete_commands FROM PUBLIC, storecore_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON media_delete_commands TO storecore_runtime;
REVOKE ALL ON FUNCTION enforce_media_delete_command_identity() FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION catalog_media_owner_exists(BIGINT) FROM PUBLIC, storecore_runtime;
GRANT EXECUTE ON FUNCTION catalog_media_owner_exists(BIGINT) TO storecore_runtime;
