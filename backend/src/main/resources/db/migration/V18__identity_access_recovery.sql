CREATE TABLE identity_recovery_tokens (
 id UUID PRIMARY KEY,
 realm VARCHAR(16) NOT NULL CHECK(realm IN ('USER','CUSTOMER')),
 user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
 customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 token_hash CHAR(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 credential_version BIGINT NOT NULL CHECK(credential_version>0),
 email_digest CHAR(64) NOT NULL CHECK(email_digest ~ '^[0-9a-f]{64}$'),
 issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 expires_at TIMESTAMPTZ NOT NULL,
 correlation_id UUID NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONSUMED','SUPERSEDED')),
 terminal_at TIMESTAMPTZ NULL,
 terminal_reason VARCHAR(32) NULL CHECK(terminal_reason IN ('PASSWORD_RECOVERY','EMAIL_CHANGED')),
 terminal_correlation_id UUID NULL,
 CHECK((realm='USER' AND user_id IS NOT NULL AND customer_id IS NULL)
    OR (realm='CUSTOMER' AND customer_id IS NOT NULL AND user_id IS NULL)),
 CHECK(expires_at=issued_at+interval '15 minutes'),
 CHECK((state='PENDING' AND terminal_at IS NULL AND terminal_reason IS NULL AND terminal_correlation_id IS NULL)
    OR (state IN ('CONSUMED','SUPERSEDED') AND terminal_at IS NOT NULL AND terminal_at>=issued_at
        AND terminal_reason IS NOT NULL AND terminal_correlation_id IS NOT NULL)),
 CHECK(state<>'CONSUMED' OR (terminal_at<expires_at AND terminal_reason='PASSWORD_RECOVERY'))
);
CREATE INDEX ix_identity_recovery_customer ON identity_recovery_tokens(customer_id) WHERE state='PENDING';
CREATE INDEX ix_identity_recovery_user ON identity_recovery_tokens(user_id) WHERE state='PENDING';
CREATE INDEX ix_identity_recovery_expiry ON identity_recovery_tokens(expires_at) WHERE state='PENDING';

CREATE FUNCTION enforce_identity_recovery_token_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE'
 OR OLD.id IS DISTINCT FROM NEW.id OR OLD.realm IS DISTINCT FROM NEW.realm
 OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
 OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.credential_version IS DISTINCT FROM NEW.credential_version
 OR OLD.email_digest IS DISTINCT FROM NEW.email_digest OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
 OR OLD.expires_at IS DISTINCT FROM NEW.expires_at OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
 OR OLD.state<>'PENDING' OR NEW.state NOT IN ('CONSUMED','SUPERSEDED')
 OR NEW.terminal_at IS NULL OR NEW.terminal_at<statement_timestamp() OR NEW.terminal_at>clock_timestamp()
 OR (NEW.state='CONSUMED' AND NEW.terminal_at>=OLD.expires_at)
 THEN RAISE EXCEPTION 'recovery token evidence is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_identity_recovery_token_mutation BEFORE UPDATE OR DELETE ON identity_recovery_tokens
 FOR EACH ROW EXECUTE FUNCTION enforce_identity_recovery_token_mutation();

-- The profile writer already holds the exclusive CUSTOMER scope (V17). A changed
-- address retires every pending authorization in the same transaction, including
-- expired rows; obsolete evidence can never consume the three-live-token budget.
CREATE FUNCTION supersede_recovery_tokens_after_email_change() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF OLD.email IS DISTINCT FROM NEW.email THEN
   UPDATE public.identity_recovery_tokens
      SET state='SUPERSEDED',terminal_at=clock_timestamp(),terminal_reason='EMAIL_CHANGED',
          terminal_correlation_id=gen_random_uuid()
    WHERE customer_id=NEW.id AND realm='CUSTOMER' AND state='PENDING';
 END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_recovery_customer_email_changed AFTER UPDATE OF email ON customers
 FOR EACH ROW EXECUTE FUNCTION supersede_recovery_tokens_after_email_change();

ALTER TABLE identity_recovery_tokens OWNER TO storecore_migrator;
ALTER FUNCTION enforce_identity_recovery_token_mutation() OWNER TO storecore_migrator;
ALTER FUNCTION supersede_recovery_tokens_after_email_change() OWNER TO storecore_migrator;
REVOKE ALL ON identity_recovery_tokens FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION enforce_identity_recovery_token_mutation() FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION supersede_recovery_tokens_after_email_change() FROM PUBLIC,storecore_runtime;
GRANT SELECT,INSERT,UPDATE ON identity_recovery_tokens TO storecore_runtime;
GRANT ALL ON identity_recovery_tokens TO storecore_migrator;
