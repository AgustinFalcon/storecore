CREATE TABLE unified_access_challenges (
 id UUID PRIMARY KEY,
 challenge_hash CHAR(64) NOT NULL UNIQUE,
 binding_nonce_hash CHAR(64) NOT NULL,
 accepted_origin VARCHAR(2048) NOT NULL CHECK(length(btrim(accepted_origin)) > 0),
 customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 return_destination VARCHAR(32) NOT NULL CHECK(return_destination IN ('HOME','CATALOG','CUSTOMER_PROFILE','CUSTOMER_ORDERS','USER_ORDERS')),
 issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ NULL,
 audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
 CHECK(expires_at = issued_at + interval '120 seconds'),
 CHECK(consumed_at IS NULL OR (consumed_at >= issued_at AND consumed_at <= expires_at)),
 CHECK(jsonb_typeof(audit_metadata) = 'object')
);

CREATE UNIQUE INDEX uq_unified_access_active_binding
 ON unified_access_challenges(binding_nonce_hash) WHERE consumed_at IS NULL;
CREATE INDEX ix_unified_access_challenge_expiry
 ON unified_access_challenges(expires_at) WHERE consumed_at IS NULL;

CREATE FUNCTION enforce_unified_access_challenge_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP = 'DELETE'
    OR OLD.id IS DISTINCT FROM NEW.id
    OR OLD.challenge_hash IS DISTINCT FROM NEW.challenge_hash
    OR OLD.binding_nonce_hash IS DISTINCT FROM NEW.binding_nonce_hash
    OR OLD.accepted_origin IS DISTINCT FROM NEW.accepted_origin
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.return_destination IS DISTINCT FROM NEW.return_destination
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.audit_metadata IS DISTINCT FROM NEW.audit_metadata
    OR OLD.consumed_at IS NOT NULL
    OR NEW.consumed_at IS NULL
    OR NEW.consumed_at < OLD.issued_at
    OR NEW.consumed_at > OLD.expires_at
    OR NEW.consumed_at < statement_timestamp()
    OR NEW.consumed_at > clock_timestamp()
 THEN
  RAISE EXCEPTION 'unified access challenge evidence is immutable'
   USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END; $_$;

CREATE TRIGGER trg_enforce_unified_access_challenge_mutation
 BEFORE UPDATE OR DELETE ON unified_access_challenges
 FOR EACH ROW EXECUTE FUNCTION enforce_unified_access_challenge_mutation();

ALTER TABLE unified_access_challenges OWNER TO storecore_migrator;
ALTER FUNCTION enforce_unified_access_challenge_mutation() OWNER TO storecore_migrator;
REVOKE ALL ON unified_access_challenges FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION enforce_unified_access_challenge_mutation() FROM PUBLIC, storecore_runtime;
GRANT SELECT, INSERT, UPDATE ON unified_access_challenges TO storecore_runtime;
GRANT ALL ON unified_access_challenges TO storecore_migrator;
