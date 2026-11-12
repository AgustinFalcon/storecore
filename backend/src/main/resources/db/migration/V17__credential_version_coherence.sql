-- Published V1-V16 remain unchanged. Legacy challenges cannot prove a credential version.
ALTER TABLE users ADD COLUMN credential_version BIGINT NOT NULL DEFAULT 1 CHECK(credential_version>0);
ALTER TABLE customers ADD COLUMN credential_version BIGINT NOT NULL DEFAULT 1 CHECK(credential_version>0);
ALTER TABLE unified_access_challenges
 ADD COLUMN credential_evidence VARCHAR(32) NOT NULL DEFAULT 'LEGACY_UNVERIFIABLE',
 ADD COLUMN customer_credential_version BIGINT NULL,
 ADD COLUMN user_credential_version BIGINT NULL,
 ADD CONSTRAINT ck_unified_access_credential_evidence CHECK(
   (credential_evidence='LEGACY_UNVERIFIABLE' AND customer_credential_version IS NULL AND user_credential_version IS NULL)
   OR (credential_evidence='VERIFIED' AND customer_credential_version IS NOT NULL AND customer_credential_version>0
       AND user_credential_version IS NOT NULL AND user_credential_version>0)
 );

CREATE OR REPLACE FUNCTION enforce_unified_access_challenge_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
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
    OR OLD.credential_evidence IS DISTINCT FROM NEW.credential_evidence
    OR OLD.customer_credential_version IS DISTINCT FROM NEW.customer_credential_version
    OR OLD.user_credential_version IS DISTINCT FROM NEW.user_credential_version
    OR OLD.credential_evidence <> 'VERIFIED'
    OR OLD.consumed_at IS NOT NULL
    OR NEW.consumed_at IS NULL
    OR NEW.consumed_at < OLD.issued_at
    OR NEW.consumed_at > OLD.expires_at
    OR NEW.consumed_at < statement_timestamp()
    OR NEW.consumed_at > clock_timestamp()
 THEN
  RAISE EXCEPTION 'unified access challenge evidence is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END; $_$;

-- Match the exclusive USER advisory root used by IdentityMutationLocks, including
-- callers that invoke the granted capability definer directly rather than HTTP.
CREATE OR REPLACE FUNCTION capability_assert_live_admin_session(p_actor BIGINT,p_live_session UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $_$
BEGIN
 IF p_actor IS NULL OR p_actor<=0 THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 PERFORM pg_advisory_xact_lock(((-p_actor)>>32)::integer,(((-p_actor)<<32)>>32)::integer);
 PERFORM 1 FROM public.users u WHERE u.id=p_actor AND u.active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 PERFORM 1 FROM public.identity_sessions s
 WHERE s.id=p_live_session AND s.subject_kind='USER' AND s.user_id=p_actor
 AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 PERFORM 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
 WHERE ur.user_id=p_actor AND r.code='ADMIN' FOR UPDATE OF ur;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 PERFORM 1 FROM public.identity_sessions s
 WHERE s.id=p_live_session AND s.subject_kind='USER' AND s.user_id=p_actor
 AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
END; $_$;
