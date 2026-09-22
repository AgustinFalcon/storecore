ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);
ALTER TABLE customers ALTER COLUMN password_hash TYPE VARCHAR(255);
DO $_$ BEGIN
 IF EXISTS(SELECT 1 FROM users WHERE password_hash NOT LIKE '$argon2id$%') OR EXISTS(SELECT 1 FROM customers WHERE password_hash NOT LIKE '$argon2id$%') THEN RAISE EXCEPTION 'IDENTITY_LEGACY_BCRYPT_PRECHECK_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND conname='users_check' AND contype='c') OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='customers'::regclass AND conname='customers_check' AND contype='c') THEN RAISE EXCEPTION 'IDENTITY_V1_BASELINE_CONSTRAINT_MISMATCH'; END IF;
END; $_$;
ALTER TABLE users DROP CONSTRAINT users_check;
ALTER TABLE users ADD CONSTRAINT ck_users_email_canonical CHECK(email=lower(btrim(email)) AND password_hash LIKE '$argon2id$%');
ALTER TABLE customers DROP CONSTRAINT customers_check;
ALTER TABLE customers ADD CONSTRAINT ck_customers_email_canonical CHECK(email=lower(btrim(email)) AND password_hash LIKE '$argon2id$%');
INSERT INTO roles(code,description) VALUES ('ADMIN','Internal administrator'),('OPERATOR','Internal operator') ON CONFLICT(code) DO NOTHING;
ALTER TABLE customer_addresses ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE audit_events ADD COLUMN aggregate_reference UUID NULL, ADD COLUMN subject_kind VARCHAR(16) NULL, ADD COLUMN subject_reference BIGINT NULL, ADD COLUMN correlation_id UUID NULL, ADD COLUMN reason_code VARCHAR(64) NULL;
CREATE TABLE identity_sessions (
 id UUID PRIMARY KEY, subject_kind VARCHAR(16) NOT NULL CHECK(subject_kind IN ('USER','CUSTOMER')),
 user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 token_hash CHAR(64) NOT NULL UNIQUE, issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 idle_expires_at TIMESTAMPTZ NOT NULL, absolute_expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ NULL, revocation_kind VARCHAR(16) NULL CHECK(revocation_kind IN ('SELF','ADMIN','SYSTEM')),
 revoked_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, revoked_by_customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT, revocation_correlation_id UUID NULL, revoked_reason VARCHAR(500) NULL,
 CHECK((subject_kind='USER' AND user_id IS NOT NULL AND customer_id IS NULL) OR (subject_kind='CUSTOMER' AND customer_id IS NOT NULL AND user_id IS NULL)),
 CHECK(issued_at<=last_seen_at AND last_seen_at<idle_expires_at AND idle_expires_at<=absolute_expires_at), CHECK(revoked_at IS NULL OR revoked_at>=issued_at),
 CHECK((revoked_at IS NULL AND revocation_kind IS NULL AND revoked_by_user_id IS NULL AND revoked_by_customer_id IS NULL AND revocation_correlation_id IS NULL AND revoked_reason IS NULL) OR (revocation_kind='SELF' AND revocation_correlation_id IS NOT NULL AND revoked_at IS NOT NULL AND ((subject_kind='USER' AND revoked_by_user_id=user_id AND revoked_by_customer_id IS NULL) OR (subject_kind='CUSTOMER' AND revoked_by_customer_id=customer_id AND revoked_by_user_id IS NULL)) AND length(btrim(revoked_reason))>0) OR (revocation_kind='ADMIN' AND revocation_correlation_id IS NOT NULL AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revoked_by_customer_id IS NULL AND length(btrim(revoked_reason))>0) OR (revocation_kind='SYSTEM' AND revocation_correlation_id IS NOT NULL AND revoked_at IS NOT NULL AND revoked_by_user_id IS NULL AND revoked_by_customer_id IS NULL AND length(btrim(revoked_reason))>0))
);
CREATE INDEX ix_identity_sessions_active_user ON identity_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_identity_sessions_active_customer ON identity_sessions(customer_id) WHERE revoked_at IS NULL;
CREATE TABLE identity_session_csrf_tokens (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, session_id UUID NOT NULL REFERENCES identity_sessions(id) ON DELETE RESTRICT,
 token_hash CHAR(64) NOT NULL UNIQUE, generation INTEGER NOT NULL CHECK(generation>0), issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), expires_at TIMESTAMPTZ NOT NULL,
 retired_at TIMESTAMPTZ NULL, UNIQUE(session_id,generation), CHECK(expires_at>issued_at)
);
CREATE UNIQUE INDEX uq_identity_session_active_csrf ON identity_session_csrf_tokens(session_id) WHERE retired_at IS NULL;
CREATE FUNCTION enforce_identity_session_csrf_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' OR OLD.id IS DISTINCT FROM NEW.id OR OLD.session_id IS DISTINCT FROM NEW.session_id OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.generation IS DISTINCT FROM NEW.generation OR OLD.issued_at IS DISTINCT FROM NEW.issued_at OR OLD.expires_at IS DISTINCT FROM NEW.expires_at OR OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL THEN RAISE EXCEPTION 'csrf token evidence is immutable'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_identity_session_csrf_mutation BEFORE UPDATE OR DELETE ON identity_session_csrf_tokens FOR EACH ROW EXECUTE FUNCTION enforce_identity_session_csrf_mutation();
CREATE TABLE installation_bootstrap_markers (
 installation_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(installation_id=1), bootstrap_admin_user_id BIGINT NOT NULL,
 bootstrap_event_id BIGINT NULL REFERENCES audit_events(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER trg_prevent_installation_bootstrap_marker_mutation BEFORE UPDATE OR DELETE ON installation_bootstrap_markers FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE FUNCTION enforce_identity_session_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' OR OLD.id IS DISTINCT FROM NEW.id OR OLD.subject_kind IS DISTINCT FROM NEW.subject_kind OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.customer_id IS DISTINCT FROM NEW.customer_id OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.issued_at IS DISTINCT FROM NEW.issued_at OR OLD.absolute_expires_at IS DISTINCT FROM NEW.absolute_expires_at OR NEW.last_seen_at<OLD.last_seen_at OR NEW.idle_expires_at>NEW.absolute_expires_at OR NEW.last_seen_at>NEW.absolute_expires_at OR OLD.revoked_at IS NOT NULL OR OLD.idle_expires_at<=clock_timestamp() OR OLD.absolute_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'identity session is immutable, revoked or expired'; END IF;
 IF NEW.revoked_at IS NOT NULL THEN
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at OR NEW.idle_expires_at IS DISTINCT FROM OLD.idle_expires_at OR NEW.revoked_at<OLD.issued_at OR NEW.revocation_kind IS NULL OR NEW.revocation_correlation_id IS NULL OR NEW.revoked_reason IS NULL OR length(btrim(NEW.revoked_reason))=0 THEN RAISE EXCEPTION 'revocation evidence required'; END IF;
 ELSIF NEW.revocation_kind IS NOT NULL OR NEW.revoked_by_user_id IS NOT NULL OR NEW.revoked_by_customer_id IS NOT NULL OR NEW.revocation_correlation_id IS NOT NULL OR NEW.revoked_reason IS NOT NULL OR NEW.last_seen_at<=OLD.last_seen_at OR NEW.idle_expires_at IS DISTINCT FROM LEAST(NEW.absolute_expires_at,NEW.last_seen_at + interval '30 minutes') THEN RAISE EXCEPTION 'invalid identity session touch'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_identity_session_mutation BEFORE UPDATE OR DELETE ON identity_sessions FOR EACH ROW EXECUTE FUNCTION enforce_identity_session_mutation();
