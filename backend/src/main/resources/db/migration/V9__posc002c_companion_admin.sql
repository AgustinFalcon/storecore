-- POSC-002C companion schema and Tx-P/Tx-C admin functions.
-- Does not edit V1–V8. No POS effect/read guards. No BLACKSTORE_INTEGRATION activation. No GRANT ALL.

DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_companion_admin_owner') THEN
  CREATE ROLE storecore_companion_admin_owner NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_companion_admin') THEN
  CREATE ROLE storecore_companion_admin NOLOGIN;
 END IF;
END; $_roles$;

GRANT USAGE ON SCHEMA public TO storecore_companion_admin_owner, storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.capability_admin_session_is_live_admin(BIGINT, UUID) TO storecore_companion_admin_owner;

ALTER TABLE public.blackstore_companion_credentials
  ADD COLUMN token_fingerprint CHAR(64) NULL CHECK (token_fingerprint IS NULL OR token_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD COLUMN scopes TEXT[] NULL,
  ADD COLUMN service_role VARCHAR(16) NULL CHECK (service_role IS NULL OR service_role='SERVICE'),
  ADD COLUMN auth_ready BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.blackstore_companion_credentials
  ADD CONSTRAINT ck_blackstore_companion_credential_ready CHECK (
    (NOT auth_ready AND token_fingerprint IS NULL AND scopes IS NULL AND service_role IS NULL)
    OR (auth_ready AND token_fingerprint IS NOT NULL AND scopes IS NOT NULL AND service_role='SERVICE')
  );

CREATE UNIQUE INDEX uq_blackstore_companion_token_fingerprint
  ON public.blackstore_companion_credentials (token_fingerprint)
  WHERE token_fingerprint IS NOT NULL;

CREATE TABLE public.blackstore_companion_admin_commands (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 correlation_id UUID NOT NULL UNIQUE,
 actor_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 session_id UUID NOT NULL REFERENCES public.identity_sessions(id) ON DELETE RESTRICT,
 operation_kind VARCHAR(16) NOT NULL CHECK (operation_kind IN ('PAIR','ROTATE','ACTIVATE','SUSPEND','REVOKE')),
 client_instance_id UUID NULL,
 companion_id BIGINT NULL REFERENCES public.blackstore_companions(id) ON DELETE RESTRICT,
 expected_state VARCHAR(16) NULL CHECK (expected_state IS NULL OR expected_state IN ('DISABLED','ACTIVE','REVOKED')),
 expected_credential_version INTEGER NULL CHECK (expected_credential_version IS NULL OR expected_credential_version > 0),
 scopes TEXT[] NULL,
 service_role VARCHAR(16) NULL CHECK (service_role IS NULL OR service_role='SERVICE'),
 reason VARCHAR(500) NOT NULL CHECK (length(pg_catalog.btrim(reason))>0),
 command_hash CHAR(64) NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
 status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','READY','COMPLETED','ABORTED')),
 token_fingerprint CHAR(64) NULL CHECK (token_fingerprint IS NULL OR token_fingerprint ~ '^[0-9a-f]{64}$'),
 secret_ref VARCHAR(255) NULL,
 result JSONB NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 finished_at TIMESTAMPTZ NULL,
 CHECK (
  (operation_kind='PAIR' AND client_instance_id IS NOT NULL AND companion_id IS NULL AND expected_state IS NULL AND expected_credential_version IS NULL AND scopes IS NOT NULL AND service_role='SERVICE')
  OR (operation_kind='ROTATE' AND companion_id IS NOT NULL AND expected_state IS NOT NULL AND expected_credential_version IS NOT NULL AND scopes IS NOT NULL AND service_role='SERVICE')
  OR (operation_kind IN ('ACTIVATE','SUSPEND','REVOKE') AND companion_id IS NOT NULL AND expected_state IS NOT NULL AND expected_credential_version IS NOT NULL AND scopes IS NULL AND service_role IS NULL AND client_instance_id IS NULL)
 ),
 CHECK ((status='PENDING' AND token_fingerprint IS NULL AND secret_ref IS NULL AND result IS NULL AND finished_at IS NULL)
     OR (status='READY' AND token_fingerprint IS NOT NULL AND secret_ref IS NOT NULL AND result IS NULL AND finished_at IS NULL)
     OR (status='COMPLETED' AND result IS NOT NULL AND finished_at IS NOT NULL)
     OR (status='ABORTED' AND result = '{"status":"ABORTED"}'::jsonb AND finished_at IS NOT NULL))
);

CREATE TABLE public.blackstore_companion_admin_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 correlation_id UUID NOT NULL,
 actor_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 event_kind VARCHAR(16) NOT NULL CHECK (event_kind IN ('PREPARED','ATTACHED','COMPLETED','ABORTED')),
 operation_kind VARCHAR(16) NOT NULL,
 companion_id BIGINT NULL,
 reason VARCHAR(500) NOT NULL CHECK (length(pg_catalog.btrim(reason))>0),
 before_snapshot JSONB NOT NULL,
 after_snapshot JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CHECK (jsonb_typeof(before_snapshot)='object' AND jsonb_typeof(after_snapshot)='object')
);

CREATE FUNCTION public.enforce_companion_admin_command_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'companion admin command is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
   OR OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
   OR OLD.session_id IS DISTINCT FROM NEW.session_id
   OR OLD.operation_kind IS DISTINCT FROM NEW.operation_kind
   OR OLD.command_hash IS DISTINCT FROM NEW.command_hash
   OR OLD.reason IS DISTINCT FROM NEW.reason
   OR OLD.client_instance_id IS DISTINCT FROM NEW.client_instance_id
   OR OLD.companion_id IS DISTINCT FROM NEW.companion_id
   OR OLD.expected_state IS DISTINCT FROM NEW.expected_state
   OR OLD.expected_credential_version IS DISTINCT FROM NEW.expected_credential_version
   OR OLD.scopes IS DISTINCT FROM NEW.scopes
   OR OLD.service_role IS DISTINCT FROM NEW.service_role THEN
   RAISE EXCEPTION 'companion admin command admission is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT ((OLD.status='PENDING' AND NEW.status IN ('READY','COMPLETED','ABORTED'))
       OR (OLD.status='READY' AND NEW.status IN ('COMPLETED','ABORTED'))
       OR (OLD.status IN ('COMPLETED','ABORTED') AND NEW.status=OLD.status AND NEW.result IS NOT DISTINCT FROM OLD.result)) THEN
   RAISE EXCEPTION 'invalid companion command transition' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $_$;

CREATE TRIGGER trg_enforce_companion_admin_command_mutation
BEFORE UPDATE OR DELETE ON public.blackstore_companion_admin_commands
FOR EACH ROW EXECUTE FUNCTION public.enforce_companion_admin_command_mutation();

CREATE FUNCTION public.prevent_companion_admin_audit_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 RAISE EXCEPTION 'companion admin audit is append-only' USING ERRCODE='23514';
END; $_$;

CREATE TRIGGER trg_prevent_companion_admin_audit_mutation
BEFORE UPDATE OR DELETE ON public.blackstore_companion_admin_audit
FOR EACH ROW EXECUTE FUNCTION public.prevent_companion_admin_audit_mutation();

CREATE FUNCTION public.companion_admin_allowed_scopes(p_scopes TEXT[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path TO pg_catalog, pg_temp AS $_$
 SELECT p_scopes IS NOT NULL
    AND p_scopes <> '{}'::text[]
    AND p_scopes <@ ARRAY['catalog:read','stock:reserve','stock:commit','stock:release','stock:read','cost:read','price:override']::text[];
$_$;

CREATE FUNCTION public.companion_admin_command_digest(
 p_operation VARCHAR, p_client UUID, p_companion BIGINT, p_state VARCHAR, p_version INTEGER, p_scopes TEXT[], p_role VARCHAR, p_reason VARCHAR
) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO pg_catalog, pg_temp AS $_$
 SELECT pg_catalog.encode(
  pg_catalog.sha256(
   pg_catalog.convert_to(
    coalesce(p_operation,'') || chr(31) ||
    coalesce(p_client::text,'') || chr(31) ||
    coalesce(p_companion::text,'') || chr(31) ||
    coalesce(p_state,'') || chr(31) ||
    coalesce(p_version::text,'') || chr(31) ||
    coalesce((SELECT pg_catalog.string_agg(s, ',' ORDER BY s) FROM pg_catalog.unnest(p_scopes) AS s),'') || chr(31) ||
    coalesce(p_role,'') || chr(31) ||
    coalesce(p_reason,'')
   ,'UTF8')
  )
 ,'hex');
$_$;

CREATE FUNCTION public.companion_admin_lock_shared_anchor() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 PERFORM 1 FROM public.capability_actions WHERE module_code='BLACKSTORE_INTEGRATION' ORDER BY action_code FOR UPDATE;
 PERFORM 1 FROM public.module_configurations WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE;
 PERFORM 1 FROM public.capability_kill_switches WHERE module_code='BLACKSTORE_INTEGRATION' ORDER BY id FOR UPDATE;
END; $_$;

CREATE FUNCTION public.companion_admin_prepare_command(
 p_actor BIGINT, p_operation_kind VARCHAR, p_client_instance_id UUID, p_companion_id BIGINT,
 p_expected_state VARCHAR, p_expected_credential_version INTEGER, p_scopes TEXT[], p_service_role VARCHAR,
 p_correlation UUID, p_reason VARCHAR, p_command_hash CHAR(64), p_live_session UUID
) RETURNS TABLE(command_state VARCHAR, command_hash CHAR(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE command public.blackstore_companion_admin_commands%ROWTYPE;
DECLARE digest TEXT;
BEGIN
 IF p_operation_kind NOT IN ('PAIR','ROTATE') OR NOT public.companion_admin_allowed_scopes(p_scopes) OR p_service_role IS DISTINCT FROM 'SERVICE' THEN
  RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
 END IF;
 digest := public.companion_admin_command_digest(p_operation_kind, p_client_instance_id, p_companion_id, p_expected_state, p_expected_credential_version, p_scopes, p_service_role, p_reason);
 IF digest IS DISTINCT FROM p_command_hash THEN
  RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF FOUND THEN
  IF command.actor_user_id IS DISTINCT FROM p_actor
   OR command.operation_kind IS DISTINCT FROM p_operation_kind
   OR command.client_instance_id IS DISTINCT FROM p_client_instance_id
   OR command.companion_id IS DISTINCT FROM p_companion_id
   OR command.expected_state IS DISTINCT FROM p_expected_state
   OR command.expected_credential_version IS DISTINCT FROM p_expected_credential_version
   OR command.scopes IS DISTINCT FROM p_scopes
   OR command.service_role IS DISTINCT FROM p_service_role
   OR command.command_hash IS DISTINCT FROM p_command_hash
   OR command.reason IS DISTINCT FROM p_reason THEN
   RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
  END IF;
  command_state := command.status;
  command_hash := command.command_hash;
  RETURN NEXT;
  RETURN;
 END IF;
 INSERT INTO public.blackstore_companion_admin_commands(
  correlation_id, actor_user_id, session_id, operation_kind, client_instance_id, companion_id,
  expected_state, expected_credential_version, scopes, service_role, reason, command_hash, status
 ) VALUES (
  p_correlation, p_actor, p_live_session, p_operation_kind, p_client_instance_id, p_companion_id,
  p_expected_state, p_expected_credential_version, p_scopes, p_service_role, p_reason, p_command_hash, 'PENDING'
 );
 INSERT INTO public.blackstore_companion_admin_audit(correlation_id, actor_user_id, event_kind, operation_kind, reason, before_snapshot, after_snapshot)
 VALUES (p_correlation, p_actor, 'PREPARED', p_operation_kind, p_reason, '{}'::jsonb, pg_catalog.jsonb_build_object('status','PENDING'));
 command_state := 'PENDING';
 command_hash := p_command_hash;
 RETURN NEXT;
END; $_$;

CREATE FUNCTION public.companion_admin_attach_secret(
 p_actor BIGINT, p_correlation UUID, p_command_hash CHAR(64), p_token_fingerprint CHAR(64), p_secret_ref VARCHAR, p_live_session UUID
) RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE command public.blackstore_companion_admin_commands%ROWTYPE;
BEGIN
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF NOT FOUND OR command.actor_user_id IS DISTINCT FROM p_actor OR command.command_hash IS DISTINCT FROM p_command_hash THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF command.status IN ('COMPLETED','ABORTED') THEN
  RETURN command.status;
 END IF;
 IF command.status='READY' THEN
  IF command.token_fingerprint IS DISTINCT FROM p_token_fingerprint OR command.secret_ref IS DISTINCT FROM p_secret_ref THEN
   RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN 'READY';
 END IF;
 IF command.status<>'PENDING' OR command.session_id IS DISTINCT FROM p_live_session THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 UPDATE public.blackstore_companion_admin_commands
    SET status='READY', token_fingerprint=p_token_fingerprint, secret_ref=p_secret_ref
  WHERE id=command.id;
 INSERT INTO public.blackstore_companion_admin_audit(correlation_id, actor_user_id, event_kind, operation_kind, reason, before_snapshot, after_snapshot)
 VALUES (p_correlation, p_actor, 'ATTACHED', command.operation_kind, command.reason, '{}'::jsonb, pg_catalog.jsonb_build_object('status','READY'));
 RETURN 'READY';
END; $_$;

CREATE FUNCTION public.companion_admin_command_status(
 p_actor BIGINT, p_correlation UUID, p_live_session UUID
) RETURNS TABLE(command_state VARCHAR, operation_kind VARCHAR, companion_id BIGINT, credential_version INTEGER, token_fingerprint CHAR(64))
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE command public.blackstore_companion_admin_commands%ROWTYPE;
BEGIN
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation;
 IF NOT FOUND OR command.actor_user_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 command_state := command.status;
 operation_kind := command.operation_kind;
 companion_id := COALESCE(command.companion_id, (command.result->>'companionId')::bigint);
 credential_version := (command.result->>'credentialVersion')::integer;
 token_fingerprint := COALESCE(command.token_fingerprint, command.result->>'tokenFingerprint');
 RETURN NEXT;
END; $_$;

CREATE FUNCTION public.companion_admin_abort_command(
 p_actor BIGINT, p_correlation UUID, p_command_hash CHAR(64), p_reason VARCHAR, p_live_session UUID
) RETURNS VARCHAR
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE command public.blackstore_companion_admin_commands%ROWTYPE;
BEGIN
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF NOT FOUND OR command.actor_user_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF command.status IN ('COMPLETED','ABORTED') THEN
  IF command.status='COMPLETED' THEN
   RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN 'ABORTED';
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) OR command.command_hash IS DISTINCT FROM p_command_hash THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 UPDATE public.blackstore_companion_admin_commands
    SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp()
  WHERE id=command.id;
 INSERT INTO public.blackstore_companion_admin_audit(correlation_id, actor_user_id, event_kind, operation_kind, reason, before_snapshot, after_snapshot)
 VALUES (p_correlation, p_actor, 'ABORTED', command.operation_kind, p_reason, '{}'::jsonb, '{"status":"ABORTED"}'::jsonb);
 RETURN 'ABORTED';
END; $_$;

CREATE FUNCTION public.companion_admin_pair(
 p_actor BIGINT, p_client_instance_id UUID, p_token_fingerprint CHAR(64), p_secret_ref VARCHAR,
 p_scopes TEXT[], p_service_role VARCHAR, p_correlation UUID, p_reason VARCHAR, p_live_session UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 command public.blackstore_companion_admin_commands%ROWTYPE;
 created public.blackstore_companions%ROWTYPE;
 cred public.blackstore_companion_credentials%ROWTYPE;
 persisted JSONB;
BEGIN
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF NOT FOUND OR command.actor_user_id IS DISTINCT FROM p_actor OR command.operation_kind<>'PAIR' THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF command.status IN ('COMPLETED','ABORTED') THEN
  RETURN command.result;
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) OR command.session_id IS DISTINCT FROM p_live_session THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF command.status<>'READY'
  OR command.client_instance_id IS DISTINCT FROM p_client_instance_id
  OR command.token_fingerprint IS DISTINCT FROM p_token_fingerprint
  OR command.secret_ref IS DISTINCT FROM p_secret_ref
  OR command.scopes IS DISTINCT FROM p_scopes
  OR command.service_role IS DISTINCT FROM p_service_role
  OR command.reason IS DISTINCT FROM p_reason THEN
  RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
 END IF;
 PERFORM public.companion_admin_lock_shared_anchor();
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM public.blackstore_companions WHERE status<>'REVOKED' FOR UPDATE) THEN
  UPDATE public.blackstore_companion_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
  RETURN persisted;
 END IF;
 INSERT INTO public.blackstore_companions(client_instance_id, status) VALUES (p_client_instance_id, 'DISABLED') RETURNING * INTO created;
 INSERT INTO public.blackstore_companion_credentials(companion_id, credential_secret_ref, credential_version, status, token_fingerprint, scopes, service_role, auth_ready)
 VALUES (created.id, p_secret_ref, 1, 'ACTIVE', p_token_fingerprint, p_scopes, p_service_role, TRUE)
 RETURNING * INTO cred;
 persisted := pg_catalog.jsonb_build_object('companionId', created.id, 'credentialVersion', cred.credential_version, 'tokenFingerprint', cred.token_fingerprint, 'status', created.status);
 UPDATE public.blackstore_companion_admin_commands SET status='COMPLETED', result=persisted, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id;
 INSERT INTO public.blackstore_companion_admin_audit(correlation_id, actor_user_id, event_kind, operation_kind, companion_id, reason, before_snapshot, after_snapshot)
 VALUES (p_correlation, p_actor, 'COMPLETED', 'PAIR', created.id, p_reason, '{}'::jsonb, persisted);
 RETURN persisted;
END; $_$;

CREATE FUNCTION public.companion_admin_rotate(
 p_actor BIGINT, p_companion_id BIGINT, p_expected_state VARCHAR, p_expected_credential_version INTEGER,
 p_new_token_fingerprint CHAR(64), p_new_secret_ref VARCHAR, p_new_scopes TEXT[], p_new_service_role VARCHAR,
 p_correlation UUID, p_reason VARCHAR, p_live_session UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 command public.blackstore_companion_admin_commands%ROWTYPE;
 companion public.blackstore_companions%ROWTYPE;
 old_cred public.blackstore_companion_credentials%ROWTYPE;
 new_cred public.blackstore_companion_credentials%ROWTYPE;
 persisted JSONB;
BEGIN
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF NOT FOUND OR command.actor_user_id IS DISTINCT FROM p_actor OR command.operation_kind<>'ROTATE' THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF command.status IN ('COMPLETED','ABORTED') THEN
  RETURN command.result;
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) OR command.session_id IS DISTINCT FROM p_live_session THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF command.status<>'READY'
  OR command.companion_id IS DISTINCT FROM p_companion_id
  OR command.expected_state IS DISTINCT FROM p_expected_state
  OR command.expected_credential_version IS DISTINCT FROM p_expected_credential_version
  OR command.token_fingerprint IS DISTINCT FROM p_new_token_fingerprint
  OR command.secret_ref IS DISTINCT FROM p_new_secret_ref
  OR command.scopes IS DISTINCT FROM p_new_scopes
  OR command.service_role IS DISTINCT FROM p_new_service_role THEN
  RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
 END IF;
 PERFORM public.companion_admin_lock_shared_anchor();
 SELECT * INTO companion FROM public.blackstore_companions WHERE id=p_companion_id FOR UPDATE;
 SELECT * INTO old_cred FROM public.blackstore_companion_credentials WHERE companion_id=p_companion_id AND status='ACTIVE' FOR UPDATE;
 IF companion.id IS NULL OR companion.status='REVOKED' OR companion.status IS DISTINCT FROM p_expected_state
  OR old_cred.id IS NULL OR old_cred.credential_version IS DISTINCT FROM p_expected_credential_version
  OR old_cred.credential_version >= 2147483647 THEN
  UPDATE public.blackstore_companion_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
  RETURN persisted;
 END IF;
 UPDATE public.blackstore_companion_credentials
    SET status='REVOKED', revoked_at=pg_catalog.clock_timestamp()
  WHERE id=old_cred.id;
 INSERT INTO public.blackstore_companion_credentials(companion_id, credential_secret_ref, credential_version, status, token_fingerprint, scopes, service_role, auth_ready)
 VALUES (companion.id, p_new_secret_ref, old_cred.credential_version+1, 'ACTIVE', p_new_token_fingerprint, p_new_scopes, p_new_service_role, TRUE)
 RETURNING * INTO new_cred;
 persisted := pg_catalog.jsonb_build_object('companionId', companion.id, 'credentialVersion', new_cred.credential_version, 'tokenFingerprint', new_cred.token_fingerprint, 'status', companion.status);
 UPDATE public.blackstore_companion_admin_commands SET status='COMPLETED', result=persisted, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id;
 INSERT INTO public.blackstore_companion_admin_audit(correlation_id, actor_user_id, event_kind, operation_kind, companion_id, reason, before_snapshot, after_snapshot)
 VALUES (p_correlation, p_actor, 'COMPLETED', 'ROTATE', companion.id, p_reason, pg_catalog.to_jsonb(old_cred), persisted);
 RETURN persisted;
END; $_$;

CREATE FUNCTION public.companion_admin_apply_state(
 p_actor BIGINT, p_companion_id BIGINT, p_expected_state VARCHAR, p_expected_credential_version INTEGER,
 p_correlation UUID, p_reason VARCHAR, p_live_session UUID, p_operation VARCHAR, p_next VARCHAR
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 command public.blackstore_companion_admin_commands%ROWTYPE;
 companion public.blackstore_companions%ROWTYPE;
 cred public.blackstore_companion_credentials%ROWTYPE;
 digest TEXT;
 persisted JSONB;
 capability_state VARCHAR;
BEGIN
 digest := public.companion_admin_command_digest(p_operation, NULL, p_companion_id, p_expected_state, p_expected_credential_version, NULL, NULL, p_reason);
 SELECT * INTO command FROM public.blackstore_companion_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF FOUND THEN
  IF command.actor_user_id IS DISTINCT FROM p_actor OR command.operation_kind IS DISTINCT FROM p_operation OR command.command_hash IS DISTINCT FROM digest THEN
   RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
  END IF;
  IF command.status IN ('COMPLETED','ABORTED') THEN
   RETURN command.result;
  END IF;
 ELSE
  IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
   RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.blackstore_companion_admin_commands(
   correlation_id, actor_user_id, session_id, operation_kind, companion_id, expected_state, expected_credential_version, reason, command_hash, status
  ) VALUES (p_correlation, p_actor, p_live_session, p_operation, p_companion_id, p_expected_state, p_expected_credential_version, p_reason, digest, 'PENDING')
  RETURNING * INTO command;
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) OR command.session_id IS DISTINCT FROM p_live_session THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM public.companion_admin_lock_shared_anchor();
 SELECT state INTO capability_state FROM public.module_configurations WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT';
 SELECT * INTO companion FROM public.blackstore_companions WHERE id=p_companion_id FOR UPDATE;
 SELECT * INTO cred FROM public.blackstore_companion_credentials WHERE companion_id=p_companion_id AND status='ACTIVE' FOR UPDATE;
 IF companion.id IS NULL OR companion.status IS DISTINCT FROM p_expected_state OR cred.credential_version IS DISTINCT FROM p_expected_credential_version
  OR (p_next='ACTIVE' AND capability_state<>'ACTIVE')
  OR (p_next='REVOKED' AND companion.status='REVOKED')
  OR (p_next='DISABLED' AND companion.status<>'ACTIVE') THEN
  UPDATE public.blackstore_companion_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
  RETURN persisted;
 END IF;
 IF p_next='REVOKED' THEN
  UPDATE public.blackstore_companions SET status='REVOKED', revoked_at=pg_catalog.clock_timestamp() WHERE id=companion.id RETURNING * INTO companion;
  UPDATE public.blackstore_companion_credentials SET status='REVOKED', revoked_at=pg_catalog.clock_timestamp() WHERE id=cred.id;
 ELSIF p_next='DISABLED' THEN
  UPDATE public.blackstore_companions SET status='DISABLED' WHERE id=companion.id RETURNING * INTO companion;
 ELSE
  UPDATE public.blackstore_companions SET status='ACTIVE' WHERE id=companion.id RETURNING * INTO companion;
 END IF;
 persisted := pg_catalog.jsonb_build_object('companionId', companion.id, 'status', companion.status, 'credentialVersion', cred.credential_version);
 UPDATE public.blackstore_companion_admin_commands SET status='COMPLETED', result=persisted, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id;
 INSERT INTO public.blackstore_companion_admin_audit(correlation_id, actor_user_id, event_kind, operation_kind, companion_id, reason, before_snapshot, after_snapshot)
 VALUES (p_correlation, p_actor, 'COMPLETED', p_operation, companion.id, p_reason, '{}'::jsonb, persisted);
 RETURN persisted;
END; $_$;

CREATE FUNCTION public.companion_admin_activate(
 p_actor BIGINT, p_companion_id BIGINT, p_expected_state VARCHAR, p_expected_credential_version INTEGER,
 p_correlation UUID, p_reason VARCHAR, p_live_session UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 RETURN public.companion_admin_apply_state(p_actor, p_companion_id, p_expected_state, p_expected_credential_version, p_correlation, p_reason, p_live_session, 'ACTIVATE', 'ACTIVE');
END; $_$;

CREATE FUNCTION public.companion_admin_suspend(
 p_actor BIGINT, p_companion_id BIGINT, p_expected_state VARCHAR, p_expected_credential_version INTEGER,
 p_correlation UUID, p_reason VARCHAR, p_live_session UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 RETURN public.companion_admin_apply_state(p_actor, p_companion_id, p_expected_state, p_expected_credential_version, p_correlation, p_reason, p_live_session, 'SUSPEND', 'DISABLED');
END; $_$;

CREATE FUNCTION public.companion_admin_revoke(
 p_actor BIGINT, p_companion_id BIGINT, p_expected_state VARCHAR, p_expected_credential_version INTEGER,
 p_correlation UUID, p_reason VARCHAR, p_live_session UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 RETURN public.companion_admin_apply_state(p_actor, p_companion_id, p_expected_state, p_expected_credential_version, p_correlation, p_reason, p_live_session, 'REVOKE', 'REVOKED');
END; $_$;

ALTER FUNCTION public.companion_admin_allowed_scopes(TEXT[]) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_command_digest(VARCHAR, UUID, BIGINT, VARCHAR, INTEGER, TEXT[], VARCHAR, VARCHAR) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_lock_shared_anchor() OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_prepare_command(BIGINT, VARCHAR, UUID, BIGINT, VARCHAR, INTEGER, TEXT[], VARCHAR, UUID, VARCHAR, CHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_attach_secret(BIGINT, UUID, CHAR, CHAR, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_command_status(BIGINT, UUID, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_abort_command(BIGINT, UUID, CHAR, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_pair(BIGINT, UUID, CHAR, VARCHAR, TEXT[], VARCHAR, UUID, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_rotate(BIGINT, BIGINT, VARCHAR, INTEGER, CHAR, VARCHAR, TEXT[], VARCHAR, UUID, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_apply_state(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID, VARCHAR, VARCHAR) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_activate(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_suspend(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.companion_admin_revoke(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.enforce_companion_admin_command_mutation() OWNER TO storecore_companion_admin_owner;
ALTER FUNCTION public.prevent_companion_admin_audit_mutation() OWNER TO storecore_companion_admin_owner;

REVOKE ALL ON FUNCTION public.companion_admin_prepare_command(BIGINT, VARCHAR, UUID, BIGINT, VARCHAR, INTEGER, TEXT[], VARCHAR, UUID, VARCHAR, CHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_attach_secret(BIGINT, UUID, CHAR, CHAR, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_command_status(BIGINT, UUID, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_abort_command(BIGINT, UUID, CHAR, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_pair(BIGINT, UUID, CHAR, VARCHAR, TEXT[], VARCHAR, UUID, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_rotate(BIGINT, BIGINT, VARCHAR, INTEGER, CHAR, VARCHAR, TEXT[], VARCHAR, UUID, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_apply_state(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID, VARCHAR, VARCHAR) FROM PUBLIC, storecore_runtime, storecore_capability_admin, storecore_companion_admin;
REVOKE ALL ON FUNCTION public.companion_admin_activate(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_suspend(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_revoke(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.companion_admin_lock_shared_anchor() FROM PUBLIC, storecore_runtime, storecore_capability_admin, storecore_companion_admin;
REVOKE ALL ON FUNCTION public.companion_admin_allowed_scopes(TEXT[]) FROM PUBLIC, storecore_runtime, storecore_capability_admin, storecore_companion_admin;
REVOKE ALL ON FUNCTION public.companion_admin_command_digest(VARCHAR, UUID, BIGINT, VARCHAR, INTEGER, TEXT[], VARCHAR, VARCHAR) FROM PUBLIC, storecore_runtime, storecore_capability_admin, storecore_companion_admin;

GRANT EXECUTE ON FUNCTION public.companion_admin_prepare_command(BIGINT, VARCHAR, UUID, BIGINT, VARCHAR, INTEGER, TEXT[], VARCHAR, UUID, VARCHAR, CHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_attach_secret(BIGINT, UUID, CHAR, CHAR, VARCHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_command_status(BIGINT, UUID, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_abort_command(BIGINT, UUID, CHAR, VARCHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_pair(BIGINT, UUID, CHAR, VARCHAR, TEXT[], VARCHAR, UUID, VARCHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_rotate(BIGINT, BIGINT, VARCHAR, INTEGER, CHAR, VARCHAR, TEXT[], VARCHAR, UUID, VARCHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_activate(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_suspend(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) TO storecore_companion_admin;
GRANT EXECUTE ON FUNCTION public.companion_admin_revoke(BIGINT, BIGINT, VARCHAR, INTEGER, UUID, VARCHAR, UUID) TO storecore_companion_admin;

GRANT SELECT (id, active) ON public.users TO storecore_companion_admin_owner;
GRANT SELECT (user_id, role_id) ON public.user_roles TO storecore_companion_admin_owner;
GRANT SELECT (id, code) ON public.roles TO storecore_companion_admin_owner;
GRANT SELECT (id, subject_kind, user_id, revoked_at, idle_expires_at, absolute_expires_at) ON public.identity_sessions TO storecore_companion_admin_owner;
GRANT SELECT ON public.capability_actions TO storecore_companion_admin_owner;
GRANT UPDATE (action_code) ON public.capability_actions TO storecore_companion_admin_owner;
GRANT SELECT ON public.module_configurations TO storecore_companion_admin_owner;
GRANT UPDATE (updated_at) ON public.module_configurations TO storecore_companion_admin_owner;
GRANT SELECT ON public.capability_kill_switches TO storecore_companion_admin_owner;
GRANT UPDATE (id) ON public.capability_kill_switches TO storecore_companion_admin_owner;
GRANT SELECT, INSERT, UPDATE ON public.blackstore_companions TO storecore_companion_admin_owner;
GRANT SELECT, INSERT, UPDATE ON public.blackstore_companion_credentials TO storecore_companion_admin_owner;
GRANT SELECT, INSERT, UPDATE ON public.blackstore_companion_admin_commands TO storecore_companion_admin_owner;
GRANT INSERT ON public.blackstore_companion_admin_audit TO storecore_companion_admin_owner;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.blackstore_companions, public.blackstore_companion_credentials FROM storecore_runtime, PUBLIC, storecore_companion_admin, storecore_capability_admin;
GRANT SELECT (id, client_instance_id, status, revoked_at) ON public.blackstore_companions TO storecore_runtime;
GRANT SELECT (id, companion_id, credential_secret_ref, credential_version, status, revoked_at, token_fingerprint, scopes, service_role, auth_ready) ON public.blackstore_companion_credentials TO storecore_runtime;
REVOKE ALL ON public.blackstore_companion_admin_commands, public.blackstore_companion_admin_audit FROM PUBLIC, storecore_runtime, storecore_companion_admin, storecore_capability_admin;
