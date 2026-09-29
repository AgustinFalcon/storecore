-- POSC-002B shared capability cutover. Does not edit V1–V7.
-- No companion schema, no POS guards, no BLACKSTORE_INTEGRATION activation, no GRANT ALL.

DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_capability_admin_owner') THEN
  CREATE ROLE storecore_capability_admin_owner NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_capability_admin') THEN
  CREATE ROLE storecore_capability_admin NOLOGIN;
 END IF;
END; $_roles$;

GRANT USAGE ON SCHEMA public TO storecore_capability_admin_owner, storecore_capability_admin;

REVOKE ALL ON FUNCTION public.capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC, storecore_runtime;

-- Existing triggers have no search_path of their own. Under Tx-C they inherit pg_catalog, pg_temp,
-- so their table references must be schema-qualified. Semantics stay those of V1/V3/V5.
CREATE OR REPLACE FUNCTION public.enforce_future_optional_module_configuration() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, pg_temp
AS $_$
BEGIN
 IF EXISTS (SELECT 1 FROM public.capability_modules WHERE module_code=NEW.module_code AND future_optional=TRUE) AND NEW.state <> 'DISABLED' THEN
  RAISE EXCEPTION 'future optional module % must remain DISABLED', NEW.module_code;
 END IF;
 RETURN NEW;
END;
$_$;

CREATE OR REPLACE FUNCTION public.enforce_module_configuration_mutation() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, pg_temp
AS $_$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'module configuration cannot be deleted'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.module_code IS DISTINCT FROM NEW.module_code OR OLD.scope_kind IS DISTINCT FROM NEW.scope_kind OR OLD.scope_key IS DISTINCT FROM NEW.scope_key OR NEW.config_version<>OLD.config_version+1 OR NEW.updated_by IS NULL THEN RAISE EXCEPTION 'invalid configuration mutation'; END IF;
 IF NOT ((OLD.state='DISABLED' AND NEW.state IN ('DISABLED','READ_ONLY','ACTIVE')) OR (OLD.state='READ_ONLY' AND NEW.state IN ('READ_ONLY','ACTIVE','PAUSED','ERROR','DISABLED')) OR (OLD.state='ACTIVE' AND NEW.state IN ('ACTIVE','READ_ONLY','PAUSED','ERROR','DISABLED')) OR (OLD.state='PAUSED' AND NEW.state IN ('PAUSED','READ_ONLY','ACTIVE','ERROR','DISABLED')) OR (OLD.state='ERROR' AND NEW.state IN ('ERROR','PAUSED','DISABLED'))) THEN RAISE EXCEPTION 'invalid configuration transition'; END IF;
 IF OLD.state=NEW.state AND OLD.config IS NOT DISTINCT FROM NEW.config AND OLD.config_schema_version=NEW.config_schema_version THEN RAISE EXCEPTION 'same-state update requires a configuration change'; END IF;
 IF NEW.module_code='BLACKSTORE_INTEGRATION' THEN
  IF NEW.config_schema_version<>2 OR NOT public.blackstore_schema_v2_valid(NEW.config) THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 ELSIF NEW.config_schema_version<>1 OR NEW.config<>'{}'::jsonb THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 IF EXISTS(SELECT 1 FROM public.capability_modules m WHERE m.module_code=NEW.module_code AND m.future_optional AND NEW.state<>'DISABLED') THEN RAISE EXCEPTION 'future optional must remain disabled'; END IF;
 RETURN NEW;
END; $_$;

CREATE OR REPLACE FUNCTION public.enforce_capability_configuration_audit_action() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, pg_temp
AS $_$
BEGIN
 IF NEW.action_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.capability_actions a WHERE a.module_code=NEW.module_code AND a.action_code=NEW.action_code) THEN RAISE EXCEPTION 'unknown capability audit action'; END IF;
 RETURN NEW;
END; $_$;

CREATE OR REPLACE FUNCTION public.enforce_kill_switch_lifecycle() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, pg_temp
AS $_$
DECLARE predecessor public.capability_kill_switches%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'kill switch cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT NEW.active OR NEW.removed_at IS NOT NULL OR NEW.removed_by_user_id IS NOT NULL OR NEW.removal_reason IS NOT NULL OR NEW.removal_correlation_id IS NOT NULL OR NEW.expires_at<=pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'invalid active kill switch'; END IF;
  IF NEW.replaces_kill_switch_id IS NOT NULL THEN
   SELECT * INTO predecessor FROM public.capability_kill_switches WHERE id=NEW.replaces_kill_switch_id FOR KEY SHARE;
   IF NOT FOUND OR predecessor.active OR (predecessor.module_code,predecessor.action_code,predecessor.scope_kind,predecessor.scope_key)<>(NEW.module_code,NEW.action_code,NEW.scope_kind,NEW.scope_key) THEN RAISE EXCEPTION 'invalid replacement'; END IF;
  END IF;
 ELSE
  IF NOT OLD.active OR NEW.active OR NEW.id IS DISTINCT FROM OLD.id OR NEW.module_code IS DISTINCT FROM OLD.module_code OR NEW.action_code IS DISTINCT FROM OLD.action_code OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.scope_key IS DISTINCT FROM OLD.scope_key OR NEW.owner IS DISTINCT FROM OLD.owner OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.removal_ticket IS DISTINCT FROM OLD.removal_ticket OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.replaces_kill_switch_id IS DISTINCT FROM OLD.replaces_kill_switch_id OR NEW.removed_at IS NULL OR NEW.removed_by_user_id IS NULL OR NEW.removal_reason IS NULL OR length(pg_catalog.btrim(NEW.removal_reason))=0 OR NEW.removal_correlation_id IS NULL THEN RAISE EXCEPTION 'invalid kill switch closure'; END IF;
 END IF;
 RETURN NEW;
END; $_$;

CREATE TABLE public.capability_admin_intents (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 correlation_id UUID NOT NULL UNIQUE,
 actor_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 session_id UUID NOT NULL REFERENCES public.identity_sessions(id) ON DELETE RESTRICT,
 module_code VARCHAR(40) NOT NULL REFERENCES public.capability_modules(module_code) ON DELETE RESTRICT,
 operation_code VARCHAR(16) NOT NULL CHECK (operation_code IN ('CHANGE_STATE','KILL_CREATE','KILL_REPLACE','KILL_REMOVE')),
 request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 expected_config_version INTEGER NULL CHECK (expected_config_version IS NULL OR expected_config_version > 0),
 next_state VARCHAR(16) NULL CHECK (next_state IS NULL OR next_state IN ('DISABLED','READ_ONLY','ACTIVE','PAUSED','ERROR')),
 action_code VARCHAR(64) NULL,
 kill_owner VARCHAR(160) NULL,
 reason VARCHAR(500) NULL,
 expires_at TIMESTAMPTZ NULL,
 removal_ticket VARCHAR(100) NULL,
 expected_active_id BIGINT NULL,
 capability_lock_version INTEGER NOT NULL DEFAULT 0 CHECK (capability_lock_version >= 0),
 companion_lock_version INTEGER NOT NULL DEFAULT 0 CHECK (companion_lock_version >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 CHECK (
  (operation_code='CHANGE_STATE' AND expected_config_version IS NOT NULL AND next_state IS NOT NULL AND reason IS NOT NULL AND length(pg_catalog.btrim(reason))>0 AND action_code IS NULL AND kill_owner IS NULL AND expires_at IS NULL AND removal_ticket IS NULL AND expected_active_id IS NULL)
  OR (operation_code='KILL_CREATE' AND action_code IS NOT NULL AND kill_owner IS NOT NULL AND reason IS NOT NULL AND length(pg_catalog.btrim(reason))>0 AND expires_at IS NOT NULL AND removal_ticket IS NOT NULL AND expected_config_version IS NULL AND next_state IS NULL AND expected_active_id IS NULL)
  OR (operation_code='KILL_REPLACE' AND expected_active_id IS NOT NULL AND kill_owner IS NOT NULL AND reason IS NOT NULL AND length(pg_catalog.btrim(reason))>0 AND expires_at IS NOT NULL AND removal_ticket IS NOT NULL AND expected_config_version IS NULL AND next_state IS NULL AND action_code IS NULL)
  OR (operation_code='KILL_REMOVE' AND expected_active_id IS NOT NULL AND reason IS NOT NULL AND length(pg_catalog.btrim(reason))>0 AND expected_config_version IS NULL AND next_state IS NULL AND action_code IS NULL AND kill_owner IS NULL AND expires_at IS NULL AND removal_ticket IS NULL)
 )
);

CREATE FUNCTION public.enforce_capability_admin_intent_admission() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, pg_temp
AS $_$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'capability admin intent is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.id IS DISTINCT FROM NEW.id
  OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
  OR OLD.actor_user_id IS DISTINCT FROM NEW.actor_user_id
  OR OLD.session_id IS DISTINCT FROM NEW.session_id
  OR OLD.module_code IS DISTINCT FROM NEW.module_code
  OR OLD.operation_code IS DISTINCT FROM NEW.operation_code
  OR OLD.request_hash IS DISTINCT FROM NEW.request_hash
  OR OLD.expected_config_version IS DISTINCT FROM NEW.expected_config_version
  OR OLD.next_state IS DISTINCT FROM NEW.next_state
  OR OLD.action_code IS DISTINCT FROM NEW.action_code
  OR OLD.kill_owner IS DISTINCT FROM NEW.kill_owner
  OR OLD.reason IS DISTINCT FROM NEW.reason
  OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
  OR OLD.removal_ticket IS DISTINCT FROM NEW.removal_ticket
  OR OLD.expected_active_id IS DISTINCT FROM NEW.expected_active_id
  OR OLD.companion_lock_version IS DISTINCT FROM NEW.companion_lock_version
  OR OLD.created_at IS DISTINCT FROM NEW.created_at
  OR NEW.capability_lock_version IS DISTINCT FROM OLD.capability_lock_version + 1
 THEN
  RAISE EXCEPTION 'capability admin intent admission is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $_$;

CREATE TRIGGER trg_enforce_capability_admin_intent_admission
BEFORE UPDATE OR DELETE ON public.capability_admin_intents
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_admin_intent_admission();

CREATE TABLE public.capability_admin_commands (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 correlation_id UUID NOT NULL UNIQUE REFERENCES public.capability_admin_intents(correlation_id) ON DELETE RESTRICT,
 status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','COMPLETED','ABORTED')),
 result JSONB NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 finished_at TIMESTAMPTZ NULL,
 CHECK (
  (status='PENDING' AND result IS NULL AND finished_at IS NULL)
  OR (status='ABORTED' AND result='{"status":"ABORTED"}'::jsonb AND finished_at IS NOT NULL)
  OR (status='COMPLETED' AND result IS NOT NULL AND finished_at IS NOT NULL)
 )
);

CREATE FUNCTION public.enforce_capability_admin_command_terminal() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, pg_temp
AS $_$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'capability admin command is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (OLD.correlation_id IS DISTINCT FROM NEW.correlation_id OR OLD.id IS DISTINCT FROM NEW.id OR OLD.created_at IS DISTINCT FROM NEW.created_at) THEN
  RAISE EXCEPTION 'capability admin command identity is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (OLD.status<>'PENDING' OR NEW.status NOT IN ('COMPLETED','ABORTED')) THEN
  RAISE EXCEPTION 'capability admin command is already terminal' USING ERRCODE='23514';
 END IF;
 IF NEW.status='ABORTED' AND NEW.result IS DISTINCT FROM '{"status":"ABORTED"}'::jsonb THEN
  RAISE EXCEPTION 'aborted capability command result is closed' USING ERRCODE='23514';
 END IF;
 IF NEW.status='COMPLETED' AND NOT (
  ((SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(NEW.result) AS key)=ARRAY['configVersion','module','state']::text[]
    AND NEW.result->>'state' IN ('DISABLED','READ_ONLY','ACTIVE','PAUSED','ERROR')
    AND pg_catalog.jsonb_typeof(NEW.result->'configVersion')='number')
  OR ((SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(NEW.result) AS key)=ARRAY['killSwitchId','module']::text[]
    AND pg_catalog.jsonb_typeof(NEW.result->'killSwitchId')='number')
  OR ((SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(NEW.result) AS key)=ARRAY['killSwitchId','module','removed']::text[]
    AND NEW.result->>'removed'='true'
    AND pg_catalog.jsonb_typeof(NEW.result->'killSwitchId')='number')
 ) THEN
  RAISE EXCEPTION 'completed capability command result is closed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $_$;

CREATE TRIGGER trg_enforce_capability_admin_command_terminal
BEFORE INSERT OR UPDATE OR DELETE ON public.capability_admin_commands
FOR EACH ROW EXECUTE FUNCTION public.enforce_capability_admin_command_terminal();

CREATE FUNCTION public.capability_admin_session_is_live_admin(p_actor BIGINT, p_live_session UUID) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp
AS $_$
 SELECT EXISTS (
  SELECT 1
    FROM public.identity_sessions s
    JOIN public.users u ON u.id=s.user_id
    JOIN public.user_roles ur ON ur.user_id=u.id
    JOIN public.roles r ON r.id=ur.role_id
   WHERE s.id=p_live_session
     AND s.subject_kind='USER'
     AND s.user_id=p_actor
     AND s.revoked_at IS NULL
     AND s.idle_expires_at>pg_catalog.clock_timestamp()
     AND s.absolute_expires_at>pg_catalog.clock_timestamp()
     AND u.active
     AND r.code='ADMIN'
 );
$_$;

ALTER FUNCTION public.capability_admin_session_is_live_admin(BIGINT, UUID) OWNER TO storecore_capability_admin_owner;
REVOKE ALL ON FUNCTION public.capability_admin_session_is_live_admin(BIGINT, UUID) FROM PUBLIC, storecore_runtime, storecore_capability_admin;

CREATE FUNCTION public.capability_tx_c_execute(p_correlation UUID, p_actor BIGINT, p_live_session UUID, p_module VARCHAR) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp
AS $_$
DECLARE
 intent public.capability_admin_intents%ROWTYPE;
 command public.capability_admin_commands%ROWTYPE;
 command_found BOOLEAN;
 config public.module_configurations%ROWTYPE;
 updated public.module_configurations%ROWTYPE;
 closed_switch public.capability_kill_switches%ROWTYPE;
 opened_switch public.capability_kill_switches%ROWTYPE;
 persisted JSONB;
BEGIN
 SELECT * INTO intent FROM public.capability_admin_intents WHERE correlation_id=p_correlation FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'CAPABILITY_INTENT_MISSING' USING ERRCODE='P0002';
 END IF;
 IF intent.actor_user_id IS DISTINCT FROM p_actor OR intent.module_code IS DISTINCT FROM p_module THEN
  RAISE EXCEPTION 'CAPABILITY_PAYLOAD_CONFLICT' USING ERRCODE='23514';
 END IF;

 SELECT * INTO command FROM public.capability_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 command_found := FOUND;
 IF command_found AND command.status IN ('COMPLETED','ABORTED') THEN
  RETURN command.result;
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) OR intent.session_id IS DISTINCT FROM p_live_session THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 IF NOT command_found THEN
  INSERT INTO public.capability_admin_commands(correlation_id, status) VALUES (p_correlation, 'PENDING') RETURNING * INTO command;
 END IF;

 PERFORM 1 FROM public.capability_actions WHERE module_code=intent.module_code ORDER BY action_code FOR UPDATE;
 SELECT * INTO config FROM public.module_configurations WHERE module_code=intent.module_code AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE;
 PERFORM 1 FROM public.capability_kill_switches WHERE module_code=intent.module_code ORDER BY id FOR UPDATE;

 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;

 IF intent.module_code='BLACKSTORE_INTEGRATION' THEN
  UPDATE public.capability_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
  RETURN persisted;
 END IF;

 IF intent.operation_code='CHANGE_STATE' THEN
  IF config.id IS NULL OR config.config_version IS DISTINCT FROM intent.expected_config_version OR intent.next_state IS NULL THEN
   UPDATE public.capability_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
   RETURN persisted;
  END IF;
  UPDATE public.module_configurations
     SET state=intent.next_state, config='{}'::jsonb, updated_by=intent.actor_user_id, config_version=config_version+1, updated_at=pg_catalog.clock_timestamp()
   WHERE id=config.id AND config_version=intent.expected_config_version
   RETURNING * INTO updated;
  IF NOT FOUND THEN
   UPDATE public.capability_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
   RETURN persisted;
  END IF;
  persisted := pg_catalog.jsonb_build_object('module', updated.module_code, 'state', updated.state, 'configVersion', updated.config_version);
  INSERT INTO public.capability_configuration_audit_events(correlation_id, actor_user_id, event_kind, module_code, configuration_id, reason, previous_state, next_state, expected_config_version, resulting_config_version, before_snapshot, after_snapshot)
  VALUES (p_correlation, intent.actor_user_id, 'CONFIGURATION_CHANGED', updated.module_code, updated.id, intent.reason, config.state, updated.state, intent.expected_config_version, updated.config_version, pg_catalog.to_jsonb(config), pg_catalog.to_jsonb(updated));
 ELSIF intent.operation_code='KILL_CREATE' THEN
  IF EXISTS (SELECT 1 FROM public.capability_kill_switches WHERE module_code=intent.module_code AND action_code=intent.action_code AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' AND active) THEN
   UPDATE public.capability_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
   RETURN persisted;
  END IF;
  INSERT INTO public.capability_kill_switches(module_code, action_code, owner, reason, expires_at, removal_ticket, created_by_user_id)
  VALUES (intent.module_code, intent.action_code, intent.kill_owner, intent.reason, intent.expires_at, intent.removal_ticket, intent.actor_user_id)
  RETURNING * INTO opened_switch;
  persisted := pg_catalog.jsonb_build_object('module', opened_switch.module_code, 'killSwitchId', opened_switch.id);
  INSERT INTO public.capability_configuration_audit_events(correlation_id, actor_user_id, event_kind, module_code, action_code, kill_switch_id, reason, before_snapshot, after_snapshot)
  VALUES (p_correlation, intent.actor_user_id, 'KILL_SWITCH_CREATED', opened_switch.module_code, opened_switch.action_code, opened_switch.id, intent.reason, '{}'::jsonb, pg_catalog.to_jsonb(opened_switch));
 ELSIF intent.operation_code='KILL_REMOVE' THEN
  SELECT * INTO closed_switch FROM public.capability_kill_switches WHERE id=intent.expected_active_id AND active FOR UPDATE;
  IF NOT FOUND THEN
   UPDATE public.capability_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
   RETURN persisted;
  END IF;
  UPDATE public.capability_kill_switches
     SET active=FALSE, removed_at=pg_catalog.clock_timestamp(), removed_by_user_id=intent.actor_user_id, removal_reason=intent.reason, removal_correlation_id=p_correlation
   WHERE id=closed_switch.id AND active
   RETURNING * INTO opened_switch;
  persisted := pg_catalog.jsonb_build_object('module', opened_switch.module_code, 'killSwitchId', opened_switch.id, 'removed', TRUE);
  INSERT INTO public.capability_configuration_audit_events(correlation_id, actor_user_id, event_kind, module_code, action_code, kill_switch_id, reason, before_snapshot, after_snapshot)
  VALUES (p_correlation, intent.actor_user_id, 'KILL_SWITCH_REMOVED', opened_switch.module_code, opened_switch.action_code, opened_switch.id, intent.reason, pg_catalog.to_jsonb(closed_switch), pg_catalog.to_jsonb(opened_switch));
 ELSE
  SELECT * INTO closed_switch FROM public.capability_kill_switches WHERE id=intent.expected_active_id AND active FOR UPDATE;
  IF NOT FOUND THEN
   UPDATE public.capability_admin_commands SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
   RETURN persisted;
  END IF;
  UPDATE public.capability_kill_switches
     SET active=FALSE, removed_at=pg_catalog.clock_timestamp(), removed_by_user_id=intent.actor_user_id, removal_reason=intent.reason, removal_correlation_id=p_correlation
   WHERE id=closed_switch.id AND active
   RETURNING * INTO opened_switch;
  INSERT INTO public.capability_kill_switches(module_code, action_code, owner, reason, expires_at, removal_ticket, created_by_user_id, replaces_kill_switch_id)
  VALUES (closed_switch.module_code, closed_switch.action_code, intent.kill_owner, intent.reason, intent.expires_at, intent.removal_ticket, intent.actor_user_id, opened_switch.id)
  RETURNING * INTO opened_switch;
  persisted := pg_catalog.jsonb_build_object('module', opened_switch.module_code, 'killSwitchId', opened_switch.id);
  INSERT INTO public.capability_configuration_audit_events(correlation_id, actor_user_id, event_kind, module_code, action_code, kill_switch_id, reason, before_snapshot, after_snapshot)
  VALUES (p_correlation, intent.actor_user_id, 'KILL_SWITCH_REPLACED', opened_switch.module_code, opened_switch.action_code, opened_switch.id, intent.reason, pg_catalog.to_jsonb(closed_switch), pg_catalog.to_jsonb(opened_switch));
 END IF;

 UPDATE public.capability_admin_intents SET capability_lock_version=capability_lock_version+1 WHERE id=intent.id;
 UPDATE public.capability_admin_commands SET status='COMPLETED', result=persisted, finished_at=pg_catalog.clock_timestamp() WHERE id=command.id RETURNING result INTO persisted;
 RETURN persisted;
END; $_$;

CREATE FUNCTION public.capability_tx_c_status(p_correlation UUID, p_actor BIGINT, p_live_session UUID) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp
AS $_$
DECLARE
 intent public.capability_admin_intents%ROWTYPE;
 command public.capability_admin_commands%ROWTYPE;
BEGIN
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO intent FROM public.capability_admin_intents WHERE correlation_id=p_correlation;
 IF NOT FOUND OR intent.actor_user_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO command FROM public.capability_admin_commands WHERE correlation_id=p_correlation;
 IF NOT FOUND OR command.status='PENDING' THEN
  RETURN NULL;
 END IF;
 RETURN command.result;
END; $_$;

CREATE FUNCTION public.capability_tx_c_abort(p_correlation UUID, p_actor BIGINT, p_live_session UUID) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp
AS $_$
DECLARE
 intent public.capability_admin_intents%ROWTYPE;
 command public.capability_admin_commands%ROWTYPE;
 persisted JSONB;
BEGIN
 SELECT * INTO intent FROM public.capability_admin_intents WHERE correlation_id=p_correlation FOR UPDATE;
 IF NOT FOUND OR intent.actor_user_id IS DISTINCT FROM p_actor THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO command FROM public.capability_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF FOUND AND command.status IN ('COMPLETED','ABORTED') THEN
  RETURN command.result;
 END IF;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.capability_actions WHERE module_code=intent.module_code ORDER BY action_code FOR UPDATE;
 PERFORM 1 FROM public.module_configurations WHERE module_code=intent.module_code AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE;
 PERFORM 1 FROM public.capability_kill_switches WHERE module_code=intent.module_code ORDER BY id FOR UPDATE;
 IF NOT public.capability_admin_session_is_live_admin(p_actor, p_live_session) THEN
  RAISE EXCEPTION 'CAPABILITY_SESSION_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO command FROM public.capability_admin_commands WHERE correlation_id=p_correlation FOR UPDATE;
 IF FOUND AND command.status IN ('COMPLETED','ABORTED') THEN
  RETURN command.result;
 END IF;
 IF NOT FOUND THEN
  INSERT INTO public.capability_admin_commands(correlation_id, status, result, finished_at)
  VALUES (p_correlation, 'ABORTED', '{"status":"ABORTED"}'::jsonb, pg_catalog.clock_timestamp())
  RETURNING result INTO persisted;
  RETURN persisted;
 END IF;
 UPDATE public.capability_admin_commands
    SET status='ABORTED', result='{"status":"ABORTED"}'::jsonb, finished_at=pg_catalog.clock_timestamp()
  WHERE id=command.id
  RETURNING result INTO persisted;
 RETURN persisted;
END; $_$;

ALTER FUNCTION public.capability_tx_c_execute(UUID, BIGINT, UUID, VARCHAR) OWNER TO storecore_capability_admin_owner;
ALTER FUNCTION public.capability_tx_c_status(UUID, BIGINT, UUID) OWNER TO storecore_capability_admin_owner;
ALTER FUNCTION public.capability_tx_c_abort(UUID, BIGINT, UUID) OWNER TO storecore_capability_admin_owner;
ALTER FUNCTION public.enforce_capability_admin_intent_admission() OWNER TO storecore_capability_admin_owner;
ALTER FUNCTION public.enforce_capability_admin_command_terminal() OWNER TO storecore_capability_admin_owner;

REVOKE ALL ON FUNCTION public.capability_tx_c_execute(UUID, BIGINT, UUID, VARCHAR) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_tx_c_status(UUID, BIGINT, UUID) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_tx_c_abort(UUID, BIGINT, UUID) FROM PUBLIC, storecore_runtime;
GRANT EXECUTE ON FUNCTION public.capability_tx_c_execute(UUID, BIGINT, UUID, VARCHAR) TO storecore_capability_admin;
GRANT EXECUTE ON FUNCTION public.capability_tx_c_status(UUID, BIGINT, UUID) TO storecore_capability_admin;
GRANT EXECUTE ON FUNCTION public.capability_tx_c_abort(UUID, BIGINT, UUID) TO storecore_capability_admin;

GRANT SELECT (id, active) ON public.users TO storecore_capability_admin_owner, storecore_runtime;
GRANT SELECT (user_id, role_id) ON public.user_roles TO storecore_capability_admin_owner, storecore_runtime;
GRANT SELECT (id, code) ON public.roles TO storecore_capability_admin_owner, storecore_runtime;
GRANT SELECT (id, subject_kind, user_id, revoked_at, idle_expires_at, absolute_expires_at) ON public.identity_sessions TO storecore_capability_admin_owner, storecore_runtime;

GRANT INSERT (
 correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
 expected_config_version, next_state, action_code, kill_owner, reason, expires_at, removal_ticket, expected_active_id
) ON public.capability_admin_intents TO storecore_runtime;
GRANT SELECT (
 id, correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
 expected_config_version, next_state, action_code, kill_owner, reason, expires_at, removal_ticket, expected_active_id, capability_lock_version
) ON public.capability_admin_intents TO storecore_runtime;

GRANT SELECT ON public.capability_admin_intents TO storecore_capability_admin_owner;
GRANT UPDATE (capability_lock_version) ON public.capability_admin_intents TO storecore_capability_admin_owner;
GRANT SELECT, INSERT, UPDATE ON public.capability_admin_commands TO storecore_capability_admin_owner;
GRANT SELECT (module_code, future_optional) ON public.capability_modules TO storecore_capability_admin_owner;
GRANT SELECT ON public.capability_actions TO storecore_capability_admin_owner;
GRANT UPDATE (action_code) ON public.capability_actions TO storecore_capability_admin_owner;
GRANT SELECT ON public.module_configurations TO storecore_capability_admin_owner;
GRANT UPDATE (state, config, updated_by, config_version, updated_at) ON public.module_configurations TO storecore_capability_admin_owner;
GRANT SELECT, INSERT ON public.capability_kill_switches TO storecore_capability_admin_owner;
GRANT UPDATE (active, removed_at, removed_by_user_id, removal_reason, removal_correlation_id) ON public.capability_kill_switches TO storecore_capability_admin_owner;
GRANT INSERT ON public.capability_configuration_audit_events TO storecore_capability_admin_owner;

REVOKE ALL ON public.capability_admin_intents, public.capability_admin_commands FROM PUBLIC, storecore_capability_admin;
REVOKE INSERT, UPDATE, DELETE ON public.capability_admin_commands, public.capability_configuration_audit_events, public.module_configurations, public.capability_kill_switches FROM storecore_runtime;
