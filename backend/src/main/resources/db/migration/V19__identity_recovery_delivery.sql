-- Forward-only: historical accounts have no ownership evidence.
ALTER TABLE users ADD COLUMN email_version BIGINT NOT NULL DEFAULT 1 CHECK(email_version>0);
ALTER TABLE customers ADD COLUMN email_version BIGINT NOT NULL DEFAULT 1 CHECK(email_version>0);

CREATE FUNCTION enforce_identity_email_version() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.email_version<>1 THEN RAISE EXCEPTION 'invalid initial email version' USING ERRCODE='23514'; END IF;
 ELSE
  NEW.email_version := OLD.email_version + CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN 1 ELSE 0 END;
 END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_users_email_version BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION enforce_identity_email_version();
CREATE TRIGGER trg_customers_email_version BEFORE INSERT OR UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION enforce_identity_email_version();

CREATE TABLE identity_email_verification_tokens (
 id UUID PRIMARY KEY,
 realm VARCHAR(16) NOT NULL CHECK(realm IN ('USER','CUSTOMER')),
 user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
 customer_id BIGINT REFERENCES customers(id) ON DELETE RESTRICT,
 token_hash CHAR(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 email_version BIGINT NOT NULL CHECK(email_version>0),
 email_digest CHAR(64) NOT NULL CHECK(email_digest ~ '^[0-9a-f]{64}$'),
 issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), expires_at TIMESTAMPTZ NOT NULL,
 correlation_id UUID NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONSUMED','SUPERSEDED')),
 terminal_at TIMESTAMPTZ, terminal_correlation_id UUID,
 CHECK((realm='USER' AND user_id IS NOT NULL AND customer_id IS NULL) OR (realm='CUSTOMER' AND customer_id IS NOT NULL AND user_id IS NULL)),
 CHECK(expires_at=issued_at+interval '30 minutes'),
 CHECK((state='PENDING' AND terminal_at IS NULL AND terminal_correlation_id IS NULL)
    OR (state IN ('CONSUMED','SUPERSEDED') AND terminal_at IS NOT NULL AND terminal_correlation_id IS NOT NULL AND terminal_at>=issued_at)),
 CHECK(state<>'CONSUMED' OR terminal_at<expires_at)
);
CREATE INDEX ix_email_verification_user_pending ON identity_email_verification_tokens(user_id,expires_at) WHERE state='PENDING';
CREATE INDEX ix_email_verification_customer_pending ON identity_email_verification_tokens(customer_id,expires_at) WHERE state='PENDING';
CREATE FUNCTION enforce_email_verification_token_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'PENDING' THEN RAISE EXCEPTION 'invalid initial verification state' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR OLD.state<>'PENDING' OR NEW.state NOT IN ('CONSUMED','SUPERSEDED')
 OR (to_jsonb(OLD)-ARRAY['state','terminal_at','terminal_correlation_id']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','terminal_at','terminal_correlation_id'])
 OR NEW.terminal_at IS NULL OR NEW.terminal_at<statement_timestamp() OR NEW.terminal_at>clock_timestamp()
 OR (NEW.state='CONSUMED' AND clock_timestamp()>=OLD.expires_at)
 THEN RAISE EXCEPTION 'verification token evidence is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_email_verification_token_mutation BEFORE INSERT OR UPDATE OR DELETE ON identity_email_verification_tokens FOR EACH ROW EXECUTE FUNCTION enforce_email_verification_token_mutation();

CREATE TABLE identity_email_verification_evidence (
 id UUID PRIMARY KEY, verification_token_id UUID NOT NULL UNIQUE REFERENCES identity_email_verification_tokens(id) ON DELETE RESTRICT,
 realm VARCHAR(16) NOT NULL CHECK(realm IN ('USER','CUSTOMER')),
 user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT, customer_id BIGINT REFERENCES customers(id) ON DELETE RESTRICT,
 email_version BIGINT NOT NULL CHECK(email_version>0), email_digest CHAR(64) NOT NULL CHECK(email_digest ~ '^[0-9a-f]{64}$'),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), correlation_id UUID NOT NULL,
 CHECK((realm='USER' AND user_id IS NOT NULL AND customer_id IS NULL) OR (realm='CUSTOMER' AND customer_id IS NOT NULL AND user_id IS NULL))
);
CREATE INDEX ix_email_evidence_user ON identity_email_verification_evidence(user_id,email_version);
CREATE INDEX ix_email_evidence_customer ON identity_email_verification_evidence(customer_id,email_version);
CREATE TRIGGER trg_email_evidence_immutable BEFORE UPDATE OR DELETE ON identity_email_verification_evidence FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE FUNCTION validate_email_verification_evidence() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.identity_email_verification_tokens t
  WHERE t.id=NEW.verification_token_id AND t.state='CONSUMED' AND t.realm=NEW.realm
  AND t.user_id IS NOT DISTINCT FROM NEW.user_id AND t.customer_id IS NOT DISTINCT FROM NEW.customer_id
  AND t.email_version=NEW.email_version AND t.email_digest=NEW.email_digest AND t.terminal_at=NEW.verified_at
  AND t.terminal_correlation_id=NEW.correlation_id)
 THEN RAISE EXCEPTION 'verification evidence does not match consumed token' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $_$;
CREATE CONSTRAINT TRIGGER trg_email_evidence_token AFTER INSERT ON identity_email_verification_evidence
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_email_verification_evidence();

CREATE TABLE identity_message_outbox (
 id UUID PRIMARY KEY, kind VARCHAR(32) NOT NULL CHECK(kind IN ('EMAIL_VERIFICATION','PASSWORD_RECOVERY')),
 realm VARCHAR(16) NOT NULL CHECK(realm IN ('USER','CUSTOMER')),
 user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT, customer_id BIGINT REFERENCES customers(id) ON DELETE RESTRICT,
 verification_token_id UUID UNIQUE REFERENCES identity_email_verification_tokens(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 recovery_token_id UUID UNIQUE REFERENCES identity_recovery_tokens(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), expires_at TIMESTAMPTZ NOT NULL, correlation_id UUID NOT NULL,
 CHECK((realm='USER' AND user_id IS NOT NULL AND customer_id IS NULL) OR (realm='CUSTOMER' AND customer_id IS NOT NULL AND user_id IS NULL)),
 CHECK((kind='EMAIL_VERIFICATION' AND verification_token_id IS NOT NULL AND recovery_token_id IS NULL)
    OR (kind='PASSWORD_RECOVERY' AND recovery_token_id IS NOT NULL AND verification_token_id IS NULL)),
 CHECK(expires_at>created_at)
);
CREATE TRIGGER trg_identity_outbox_immutable BEFORE UPDATE OR DELETE ON identity_message_outbox FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE FUNCTION validate_identity_outbox_token() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
DECLARE valid BOOLEAN;
BEGIN
 IF NEW.kind='EMAIL_VERIFICATION' THEN
  SELECT EXISTS(SELECT 1 FROM public.identity_email_verification_tokens t WHERE t.id=NEW.verification_token_id AND t.realm=NEW.realm
    AND t.user_id IS NOT DISTINCT FROM NEW.user_id AND t.customer_id IS NOT DISTINCT FROM NEW.customer_id AND t.expires_at=NEW.expires_at) INTO valid;
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.identity_recovery_tokens t WHERE t.id=NEW.recovery_token_id AND t.realm=NEW.realm
    AND t.user_id IS NOT DISTINCT FROM NEW.user_id AND t.customer_id IS NOT DISTINCT FROM NEW.customer_id AND t.expires_at=NEW.expires_at) INTO valid;
 END IF;
 IF NOT valid THEN RAISE EXCEPTION 'outbox token identity mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $_$;
CREATE CONSTRAINT TRIGGER trg_identity_outbox_token AFTER INSERT ON identity_message_outbox
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_identity_outbox_token();

CREATE TABLE identity_message_delivery (
 event_id UUID PRIMARY KEY REFERENCES identity_message_outbox(id) ON DELETE RESTRICT,
 state VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','LEASED','RETRY','SENT','UNCERTAIN','DEAD','CANCELLED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), lease_owner UUID, lease_until TIMESTAMPTZ,
 handoff_started_at TIMESTAMPTZ,
 last_error VARCHAR(32) CHECK(last_error IN ('TRANSIENT','AUTHENTICATION','CONFIGURATION','REJECTED','EXPIRED','OBSOLETE','AMBIGUOUS','PAYLOAD_INVALID','ATTEMPTS_EXHAUSTED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), terminal_at TIMESTAMPTZ,
 CHECK((state='LEASED' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL AND attempts>0) OR (state<>'LEASED' AND lease_owner IS NULL AND lease_until IS NULL)),
 CHECK((state IN ('SENT','UNCERTAIN','DEAD','CANCELLED') AND terminal_at IS NOT NULL) OR (state IN ('PENDING','LEASED','RETRY') AND terminal_at IS NULL)),
 CHECK((state IN ('PENDING','RETRY') AND handoff_started_at IS NULL) OR state NOT IN ('PENDING','RETRY')),
 CHECK(state NOT IN ('SENT','UNCERTAIN') OR handoff_started_at IS NOT NULL),
 CHECK(updated_at>=created_at AND (terminal_at IS NULL OR terminal_at>=created_at)),
 CHECK(state<>'UNCERTAIN' OR last_error IS NOT DISTINCT FROM 'AMBIGUOUS')
);
CREATE INDEX ix_identity_delivery_acquire ON identity_message_delivery(available_at,event_id) WHERE state IN ('PENDING','RETRY');
CREATE INDEX ix_identity_delivery_lease ON identity_message_delivery(lease_until) WHERE state='LEASED';
CREATE TABLE identity_message_secret (
 event_id UUID PRIMARY KEY REFERENCES identity_message_outbox(id) ON DELETE RESTRICT,
 key_id VARCHAR(128) NOT NULL CHECK(length(btrim(key_id))>0),
 ciphertext BYTEA NOT NULL CHECK(octet_length(ciphertext)>=16), nonce BYTEA NOT NULL CHECK(octet_length(nonce)=12),
 wrapped_dek BYTEA NOT NULL CHECK(octet_length(wrapped_dek)=48), wrap_nonce BYTEA NOT NULL CHECK(octet_length(wrap_nonce)=12)
);
CREATE TRIGGER trg_identity_secret_immutable BEFORE UPDATE ON identity_message_secret FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE FUNCTION validate_identity_message_secret_insert() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 PERFORM 1 FROM public.identity_message_delivery d JOIN public.identity_message_outbox o ON o.id=d.event_id
 WHERE d.event_id=NEW.event_id AND d.state IN ('PENDING','LEASED','RETRY') AND o.expires_at>clock_timestamp() FOR UPDATE OF d;
 IF NOT FOUND THEN RAISE EXCEPTION 'secret requires active unexpired delivery' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_identity_secret_active BEFORE INSERT ON identity_message_secret FOR EACH ROW EXECUTE FUNCTION validate_identity_message_secret_insert();
CREATE FUNCTION enforce_identity_delivery_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'PENDING' OR NEW.attempts<>0 THEN RAISE EXCEPTION 'invalid initial delivery' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR OLD.state IN ('SENT','UNCERTAIN','DEAD','CANCELLED') OR NEW.updated_at<OLD.updated_at
 OR NOT ((OLD.state IN ('PENDING','RETRY') AND NEW.state IN ('LEASED','CANCELLED'))
      OR (OLD.state='LEASED' AND NEW.state IN ('SENT','RETRY','UNCERTAIN','DEAD','CANCELLED'))
      OR (OLD.state='LEASED' AND NEW.state='LEASED' AND OLD.handoff_started_at IS NULL AND NEW.handoff_started_at IS NOT NULL))
 OR (OLD.state IN ('PENDING','RETRY') AND NEW.state='LEASED' AND (NEW.attempts<>OLD.attempts+1 OR NEW.lease_until<=clock_timestamp() OR NEW.handoff_started_at IS NOT NULL))
 OR (OLD.state='LEASED' AND NEW.state='LEASED' AND (NEW.attempts<>OLD.attempts OR NEW.lease_owner IS DISTINCT FROM OLD.lease_owner OR NEW.lease_until IS DISTINCT FROM OLD.lease_until OR NEW.handoff_started_at<statement_timestamp() OR NEW.handoff_started_at>clock_timestamp()))
 OR (NEW.state<>'LEASED' AND NEW.attempts<>OLD.attempts)
 OR (OLD.state='LEASED' AND NEW.state IN ('SENT','UNCERTAIN') AND OLD.handoff_started_at IS NULL)
 OR (NEW.handoff_started_at IS DISTINCT FROM OLD.handoff_started_at
     AND NOT (OLD.state='LEASED' AND NEW.state='LEASED')
     AND NOT (OLD.state='LEASED' AND NEW.state='RETRY' AND NEW.handoff_started_at IS NULL))
 THEN RAISE EXCEPTION 'invalid delivery transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_identity_delivery_mutation BEFORE INSERT OR UPDATE OR DELETE ON identity_message_delivery FOR EACH ROW EXECUTE FUNCTION enforce_identity_delivery_mutation();

-- Runtime cannot delete secret rows directly. This narrow definer is the only
-- granted erasure operation, and cannot erase an unexpired active message.
CREATE FUNCTION shred_identity_message_secret(p_event UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $_$
BEGIN
 PERFORM 1 FROM public.identity_message_delivery WHERE event_id=p_event FOR UPDATE;
 DELETE FROM public.identity_message_secret s USING public.identity_message_outbox o,public.identity_message_delivery d
 WHERE s.event_id=p_event AND o.id=s.event_id AND d.event_id=s.event_id
 AND (d.state IN ('SENT','UNCERTAIN','DEAD','CANCELLED') OR o.expires_at<=clock_timestamp());
END; $_$;
CREATE FUNCTION erase_terminal_identity_message_secret() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $_$
BEGIN
 IF NEW.state IN ('SENT','UNCERTAIN','DEAD','CANCELLED') THEN PERFORM public.shred_identity_message_secret(NEW.event_id); END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_identity_delivery_erase AFTER UPDATE ON identity_message_delivery FOR EACH ROW EXECUTE FUNCTION erase_terminal_identity_message_secret();

CREATE FUNCTION retire_verification_after_email_change() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF OLD.email IS DISTINCT FROM NEW.email THEN
  -- V18 already retires CUSTOMER recovery tokens; extend the same invariant to
  -- USER without replacing or weakening the published trigger.
  UPDATE public.identity_recovery_tokens SET state='SUPERSEDED',terminal_at=clock_timestamp(),terminal_reason='EMAIL_CHANGED',terminal_correlation_id=gen_random_uuid()
  WHERE state='PENDING' AND TG_TABLE_NAME='users' AND realm='USER' AND user_id=NEW.id;
  UPDATE public.identity_email_verification_tokens SET state='SUPERSEDED',terminal_at=clock_timestamp(),terminal_correlation_id=gen_random_uuid()
  WHERE state='PENDING' AND ((TG_TABLE_NAME='users' AND realm='USER' AND user_id=NEW.id) OR (TG_TABLE_NAME='customers' AND realm='CUSTOMER' AND customer_id=NEW.id));
  UPDATE public.identity_message_delivery d SET state='CANCELLED',lease_owner=NULL,lease_until=NULL,last_error='OBSOLETE',updated_at=clock_timestamp(),terminal_at=clock_timestamp()
  FROM public.identity_message_outbox o WHERE o.id=d.event_id AND d.state IN ('PENDING','RETRY','LEASED')
  AND ((TG_TABLE_NAME='users' AND o.realm='USER' AND o.user_id=NEW.id) OR (TG_TABLE_NAME='customers' AND o.realm='CUSTOMER' AND o.customer_id=NEW.id));
 END IF;
 RETURN NEW;
END; $_$;
CREATE TRIGGER trg_users_retire_verification AFTER UPDATE OF email ON users FOR EACH ROW EXECUTE FUNCTION retire_verification_after_email_change();
CREATE TRIGGER trg_customers_retire_verification AFTER UPDATE OF email ON customers FOR EACH ROW EXECUTE FUNCTION retire_verification_after_email_change();

DO $_$
DECLARE object_name TEXT;
BEGIN
 FOREACH object_name IN ARRAY ARRAY['identity_email_verification_tokens','identity_email_verification_evidence','identity_message_outbox','identity_message_secret','identity_message_delivery'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO storecore_migrator',object_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,storecore_runtime',object_name);
  EXECUTE format('GRANT SELECT,INSERT ON public.%I TO storecore_runtime',object_name);
 END LOOP;
 FOREACH object_name IN ARRAY ARRAY['enforce_identity_email_version','enforce_email_verification_token_mutation','validate_email_verification_evidence','validate_identity_outbox_token','validate_identity_message_secret_insert','enforce_identity_delivery_mutation','erase_terminal_identity_message_secret','retire_verification_after_email_change'] LOOP
  EXECUTE format('ALTER FUNCTION public.%I() OWNER TO storecore_migrator',object_name);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC,storecore_runtime',object_name);
 END LOOP;
END; $_$;
ALTER FUNCTION shred_identity_message_secret(UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION shred_identity_message_secret(UUID) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION shred_identity_message_secret(UUID) TO storecore_runtime;
GRANT UPDATE ON identity_email_verification_tokens,identity_message_delivery TO storecore_runtime;
