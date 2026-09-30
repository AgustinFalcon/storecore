-- TASK-DSP-000B ML SYNC capability snapshot. Does not edit V1–V14 files.
-- MARKETPLACE_ML/SYNC is a constant pair. No arbitrary module argument.

DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_ml_sync_guard_owner') THEN
  CREATE ROLE storecore_ml_sync_guard_owner NOLOGIN;
 END IF;
END; $_roles$;

GRANT USAGE ON SCHEMA public TO storecore_ml_sync_guard_owner;
GRANT SELECT, UPDATE ON TABLE
  public.capability_actions,
  public.module_configurations,
  public.capability_kill_switches
TO storecore_ml_sync_guard_owner;

CREATE FUNCTION public.marketplace_ml_sync_snapshot() RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, pg_temp
AS $_$
DECLARE
 action_n INTEGER;
 action_row public.capability_actions%ROWTYPE;
 config_n INTEGER;
 config_row public.module_configurations%ROWTYPE;
 switches JSONB;
BEGIN
 SELECT COUNT(*) INTO action_n
   FROM public.capability_actions
  WHERE module_code='MARKETPLACE_ML' AND action_code='SYNC';
 IF action_n IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'ML_SYNC_GUARD_DENIED' USING ERRCODE='P0001';
 END IF;
 SELECT * INTO action_row
   FROM public.capability_actions
  WHERE module_code='MARKETPLACE_ML' AND action_code='SYNC'
  FOR SHARE;
 IF action_row.action_kind IS NULL
    OR action_row.action_kind NOT IN ('READ','WRITE','PUBLISH','STATUS','HEALTH')
    OR action_row.allows_write IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'ML_SYNC_GUARD_DENIED' USING ERRCODE='P0001';
 END IF;

 SELECT COUNT(*) INTO config_n
   FROM public.module_configurations
  WHERE module_code='MARKETPLACE_ML' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT';
 IF config_n IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'ML_SYNC_GUARD_DENIED' USING ERRCODE='P0001';
 END IF;
 SELECT * INTO config_row
   FROM public.module_configurations
  WHERE module_code='MARKETPLACE_ML' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'
  FOR SHARE;
 IF config_row.state IS NULL
    OR config_row.state NOT IN ('DISABLED','READ_ONLY','ACTIVE','PAUSED','ERROR')
    OR config_row.config_version IS NULL
    OR config_row.config_version < 1 THEN
  RAISE EXCEPTION 'ML_SYNC_GUARD_DENIED' USING ERRCODE='P0001';
 END IF;

 PERFORM 1
   FROM public.capability_kill_switches
  WHERE module_code='MARKETPLACE_ML'
    AND action_code='SYNC'
    AND scope_kind='INSTALLATION'
    AND scope_key='DEFAULT'
  ORDER BY scope_key, id
  FOR SHARE;

 SELECT coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', ks.id,
              'active', ks.active,
              'owner', ks.owner,
              'reason', ks.reason,
              'expiresAt', ks.expires_at
            )
            ORDER BY ks.scope_key, ks.id
          ),
          '[]'::jsonb
        )
   INTO switches
   FROM public.capability_kill_switches ks
  WHERE ks.module_code='MARKETPLACE_ML'
    AND ks.action_code='SYNC'
    AND ks.scope_kind='INSTALLATION'
    AND ks.scope_key='DEFAULT'
    AND ks.active;

 RETURN jsonb_build_object(
   'moduleCode', 'MARKETPLACE_ML',
   'actionCode', 'SYNC',
   'actionKind', action_row.action_kind,
   'allowsWrite', action_row.allows_write,
   'allowedWhenPaused', action_row.allowed_when_paused,
   'state', config_row.state,
   'configVersion', config_row.config_version,
   'configSchemaVersion', config_row.config_schema_version,
   'switches', switches
 );
END;
$_$;

ALTER FUNCTION public.marketplace_ml_sync_snapshot() OWNER TO storecore_ml_sync_guard_owner;
REVOKE ALL ON FUNCTION public.marketplace_ml_sync_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketplace_ml_sync_snapshot() TO storecore_runtime;

-- V3 generic admin must refuse MARKETPLACE_ML before taking config/switch locks.
CREATE OR REPLACE FUNCTION public.capability_admin_change_configuration(p_actor BIGINT,p_module VARCHAR,p_expected INTEGER,p_state VARCHAR,p_config JSONB,p_correlation UUID,p_reason VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row module_configurations%ROWTYPE; new_row module_configurations%ROWTYPE;
BEGIN
 IF p_module='MARKETPLACE_ML' THEN RAISE EXCEPTION 'CAPABILITY_ML_GENERIC_DENIED'; END IF;
 SELECT * INTO old_row FROM module_configurations WHERE module_code=p_module AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE;
 IF NOT FOUND OR old_row.config_version<>p_expected THEN RAISE EXCEPTION 'CAPABILITY_CONFIG_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE module_configurations SET state=p_state,config=p_config,updated_by=p_actor,config_version=config_version+1,updated_at=clock_timestamp() WHERE id=old_row.id AND config_version=p_expected RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_CONFIG_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,configuration_id,reason,previous_state,next_state,expected_config_version,resulting_config_version,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'CONFIGURATION_CHANGED',p_module,old_row.id,p_reason,old_row.state,new_row.state,p_expected,new_row.config_version,to_jsonb(old_row),to_jsonb(new_row));
END; $_$;

CREATE OR REPLACE FUNCTION public.capability_admin_create_kill_switch(p_actor BIGINT,p_module VARCHAR,p_action VARCHAR,p_owner VARCHAR,p_reason VARCHAR,p_expires TIMESTAMPTZ,p_ticket VARCHAR,p_correlation UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE created_row capability_kill_switches%ROWTYPE;
BEGIN
 IF p_module='MARKETPLACE_ML' THEN RAISE EXCEPTION 'CAPABILITY_ML_GENERIC_DENIED'; END IF;
 PERFORM 1 FROM capability_actions WHERE module_code=p_module AND action_code=p_action FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 INSERT INTO capability_kill_switches(module_code,action_code,owner,reason,expires_at,removal_ticket,created_by_user_id) VALUES(p_module,p_action,p_owner,p_reason,p_expires,p_ticket,p_actor) RETURNING * INTO created_row;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_CREATED',p_module,p_action,created_row.id,p_reason,'{}'::jsonb,to_jsonb(created_row));
 RETURN created_row.id;
END; $_$;

CREATE OR REPLACE FUNCTION public.capability_admin_remove_kill_switch(p_actor BIGINT,p_expected_active_id BIGINT,p_reason VARCHAR,p_correlation UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row capability_kill_switches%ROWTYPE; new_row capability_kill_switches%ROWTYPE; expected_module VARCHAR; expected_action VARCHAR;
BEGIN
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF old_row.module_code='MARKETPLACE_ML' THEN RAISE EXCEPTION 'CAPABILITY_ML_GENERIC_DENIED'; END IF;
 expected_module:=old_row.module_code; expected_action:=old_row.action_code;
 PERFORM 1 FROM capability_actions WHERE module_code=expected_module AND action_code=expected_action FOR UPDATE;
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id FOR UPDATE;
 IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>expected_module OR old_row.action_code<>expected_action THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE capability_kill_switches SET active=FALSE,removed_at=clock_timestamp(),removed_by_user_id=p_actor,removal_reason=p_reason,removal_correlation_id=p_correlation WHERE id=old_row.id AND active=TRUE RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_REMOVED',old_row.module_code,old_row.action_code,new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row));
END; $_$;

CREATE OR REPLACE FUNCTION public.capability_admin_replace_kill_switch(p_actor BIGINT,p_expected_active_id BIGINT,p_owner VARCHAR,p_reason VARCHAR,p_expires TIMESTAMPTZ,p_ticket VARCHAR,p_correlation UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row capability_kill_switches%ROWTYPE; closed_row capability_kill_switches%ROWTYPE; new_row capability_kill_switches%ROWTYPE; expected_module VARCHAR; expected_action VARCHAR;
BEGIN
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF old_row.module_code='MARKETPLACE_ML' THEN RAISE EXCEPTION 'CAPABILITY_ML_GENERIC_DENIED'; END IF;
 expected_module:=old_row.module_code; expected_action:=old_row.action_code;
 PERFORM 1 FROM capability_actions WHERE module_code=expected_module AND action_code=expected_action FOR UPDATE;
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id FOR UPDATE;
 IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>expected_module OR old_row.action_code<>expected_action THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE capability_kill_switches SET active=FALSE,removed_at=clock_timestamp(),removed_by_user_id=p_actor,removal_reason=p_reason,removal_correlation_id=p_correlation WHERE id=old_row.id AND active=TRUE RETURNING * INTO closed_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_kill_switches(module_code,action_code,owner,reason,expires_at,removal_ticket,created_by_user_id,replaces_kill_switch_id) VALUES(old_row.module_code,old_row.action_code,p_owner,p_reason,p_expires,p_ticket,p_actor,closed_row.id) RETURNING * INTO new_row;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_REPLACED',new_row.module_code,new_row.action_code,new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row));
 RETURN new_row.id;
END; $_$;

ALTER FUNCTION public.capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION public.capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION public.capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION public.capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) FROM PUBLIC, storecore_runtime;
REVOKE ALL ON FUNCTION public.capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC, storecore_runtime;
