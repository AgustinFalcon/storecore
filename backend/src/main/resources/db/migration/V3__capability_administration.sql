DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='storecore_migrator') THEN CREATE ROLE storecore_migrator NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='storecore_runtime') THEN CREATE ROLE storecore_runtime NOLOGIN; END IF;
END; $_roles$;
GRANT USAGE ON SCHEMA public TO storecore_migrator, storecore_runtime;
GRANT ALL ON ALL TABLES IN SCHEMA public TO storecore_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO storecore_migrator;

ALTER TABLE capability_actions ADD COLUMN action_kind VARCHAR(16) NOT NULL DEFAULT 'WRITE', ADD COLUMN allowed_when_paused BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE capability_actions SET action_kind=CASE WHEN (module_code,action_code) IN (('STOREFRONT','SERVE'),('ML_COMPETITION_INSIGHTS','READ_SIGNALS')) THEN 'READ' WHEN action_code='PUBLISH_PROMOTION' THEN 'PUBLISH' ELSE 'WRITE' END;
INSERT INTO capability_actions(module_code,action_code,allows_write,action_kind,allowed_when_paused) SELECT module_code,'READ_STATUS',FALSE,'STATUS',TRUE FROM capability_modules ON CONFLICT(module_code,action_code) DO NOTHING;
INSERT INTO capability_actions(module_code,action_code,allows_write,action_kind,allowed_when_paused) SELECT module_code,'HEALTH',FALSE,'HEALTH',TRUE FROM capability_modules ON CONFLICT(module_code,action_code) DO NOTHING;
INSERT INTO capability_actions(module_code,action_code,allows_write,action_kind,allowed_when_paused) VALUES
 ('CATALOG','READ',FALSE,'READ',FALSE),
 ('PAYMENTS_MP','CLAIM_CHECKOUT',TRUE,'WRITE',FALSE),
 ('PAYMENTS_MP','APPLY_EVENT',TRUE,'WRITE',FALSE),
 ('MANUAL_PROMOTIONS','READ',FALSE,'READ',FALSE),
 ('MANUAL_FULFILLMENT','READ',FALSE,'READ',FALSE),
 ('MARKETPLACE_ML','READ',FALSE,'READ',FALSE),
 ('PROFILE_CONTENT','READ',FALSE,'READ',FALSE)
ON CONFLICT(module_code,action_code) DO NOTHING;
ALTER TABLE capability_actions ALTER COLUMN action_kind DROP DEFAULT;
ALTER TABLE capability_actions ADD CONSTRAINT ck_capability_action_kind CHECK(action_kind IN ('READ','WRITE','PUBLISH','STATUS','HEALTH'));
CREATE FUNCTION enforce_capability_action_semantics() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF (NEW.action_kind IN ('READ','STATUS','HEALTH') AND NEW.allows_write) OR (NEW.action_kind IN ('WRITE','PUBLISH') AND NOT NEW.allows_write) OR (NEW.allowed_when_paused AND NEW.action_kind NOT IN ('STATUS','HEALTH')) THEN RAISE EXCEPTION 'invalid capability action semantics'; END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_capability_action_semantics BEFORE INSERT OR UPDATE ON capability_actions FOR EACH ROW EXECUTE FUNCTION enforce_capability_action_semantics();

ALTER TABLE module_configurations ADD COLUMN config_schema_version SMALLINT NOT NULL DEFAULT 1, ADD CONSTRAINT ck_module_configuration_schema_version CHECK(config_schema_version>0);
ALTER TABLE capability_kill_switches ADD COLUMN created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN removed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT, ADD COLUMN removal_reason VARCHAR(500) NULL, ADD COLUMN removal_correlation_id UUID NULL, ADD COLUMN replaces_kill_switch_id BIGINT NULL REFERENCES capability_kill_switches(id) ON DELETE RESTRICT;
CREATE TABLE capability_configuration_audit_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, correlation_id UUID NOT NULL, actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 event_kind VARCHAR(32) NOT NULL CHECK(event_kind IN ('CONFIGURATION_CHANGED','KILL_SWITCH_CREATED','KILL_SWITCH_REMOVED','KILL_SWITCH_REPLACED')),
 module_code VARCHAR(40) NOT NULL REFERENCES capability_modules(module_code) ON DELETE RESTRICT, action_code VARCHAR(64) NULL, configuration_id BIGINT NULL REFERENCES module_configurations(id) ON DELETE RESTRICT, kill_switch_id BIGINT NULL REFERENCES capability_kill_switches(id) ON DELETE RESTRICT,
 reason VARCHAR(500) NOT NULL CHECK(length(btrim(reason))>0), previous_state VARCHAR(16) NULL, next_state VARCHAR(16) NULL, expected_config_version INTEGER NULL, resulting_config_version INTEGER NULL, before_snapshot JSONB NOT NULL, after_snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(before_snapshot)='object' AND jsonb_typeof(after_snapshot)='object'),
 CHECK((event_kind='CONFIGURATION_CHANGED' AND action_code IS NULL AND configuration_id IS NOT NULL AND kill_switch_id IS NULL AND previous_state IS NOT NULL AND next_state IS NOT NULL AND expected_config_version IS NOT NULL AND resulting_config_version IS NOT NULL AND resulting_config_version=expected_config_version+1) OR (event_kind IN ('KILL_SWITCH_CREATED','KILL_SWITCH_REMOVED','KILL_SWITCH_REPLACED') AND action_code IS NOT NULL AND configuration_id IS NULL AND kill_switch_id IS NOT NULL AND previous_state IS NULL AND next_state IS NULL AND expected_config_version IS NULL AND resulting_config_version IS NULL))
);
CREATE FUNCTION enforce_capability_configuration_audit_action() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF NEW.action_code IS NOT NULL AND NOT EXISTS (SELECT 1 FROM capability_actions a WHERE a.module_code=NEW.module_code AND a.action_code=NEW.action_code) THEN RAISE EXCEPTION 'unknown capability audit action'; END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_capability_configuration_audit_action BEFORE INSERT ON capability_configuration_audit_events FOR EACH ROW EXECUTE FUNCTION enforce_capability_configuration_audit_action();
CREATE TRIGGER trg_prevent_immutable_capability_configuration_audit_events BEFORE UPDATE OR DELETE ON capability_configuration_audit_events FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE FUNCTION enforce_module_configuration_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'module configuration cannot be deleted'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.module_code IS DISTINCT FROM NEW.module_code OR OLD.scope_kind IS DISTINCT FROM NEW.scope_kind OR OLD.scope_key IS DISTINCT FROM NEW.scope_key OR NEW.config_version<>OLD.config_version+1 OR NEW.updated_by IS NULL THEN RAISE EXCEPTION 'invalid configuration mutation'; END IF;
 IF NOT ((OLD.state='DISABLED' AND NEW.state IN ('DISABLED','READ_ONLY','ACTIVE')) OR (OLD.state='READ_ONLY' AND NEW.state IN ('READ_ONLY','ACTIVE','PAUSED','ERROR','DISABLED')) OR (OLD.state='ACTIVE' AND NEW.state IN ('ACTIVE','READ_ONLY','PAUSED','ERROR','DISABLED')) OR (OLD.state='PAUSED' AND NEW.state IN ('PAUSED','READ_ONLY','ACTIVE','ERROR','DISABLED')) OR (OLD.state='ERROR' AND NEW.state IN ('ERROR','PAUSED','DISABLED'))) THEN RAISE EXCEPTION 'invalid configuration transition'; END IF;
 IF OLD.state=NEW.state AND OLD.config IS NOT DISTINCT FROM NEW.config AND OLD.config_schema_version=NEW.config_schema_version THEN RAISE EXCEPTION 'same-state update requires a configuration change'; END IF;
 IF NEW.config_schema_version<>1 OR NEW.config<>'{}'::jsonb THEN RAISE EXCEPTION 'unsupported capability configuration schema'; END IF;
 IF EXISTS(SELECT 1 FROM capability_modules m WHERE m.module_code=NEW.module_code AND m.future_optional AND NEW.state<>'DISABLED') THEN RAISE EXCEPTION 'future optional must remain disabled'; END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_module_configuration_mutation BEFORE UPDATE OR DELETE ON module_configurations FOR EACH ROW EXECUTE FUNCTION enforce_module_configuration_mutation();

CREATE FUNCTION enforce_kill_switch_lifecycle() RETURNS TRIGGER LANGUAGE plpgsql AS $_$
DECLARE predecessor capability_kill_switches%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'kill switch cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT NEW.active OR NEW.removed_at IS NOT NULL OR NEW.removed_by_user_id IS NOT NULL OR NEW.removal_reason IS NOT NULL OR NEW.removal_correlation_id IS NOT NULL OR NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'invalid active kill switch'; END IF;
  IF NEW.replaces_kill_switch_id IS NOT NULL THEN SELECT * INTO predecessor FROM capability_kill_switches WHERE id=NEW.replaces_kill_switch_id FOR KEY SHARE; IF NOT FOUND OR predecessor.active OR (predecessor.module_code,predecessor.action_code,predecessor.scope_kind,predecessor.scope_key)<>(NEW.module_code,NEW.action_code,NEW.scope_kind,NEW.scope_key) THEN RAISE EXCEPTION 'invalid replacement'; END IF; END IF;
 ELSE
  IF NOT OLD.active OR NEW.active OR NEW.id IS DISTINCT FROM OLD.id OR NEW.module_code IS DISTINCT FROM OLD.module_code OR NEW.action_code IS DISTINCT FROM OLD.action_code OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.scope_key IS DISTINCT FROM OLD.scope_key OR NEW.owner IS DISTINCT FROM OLD.owner OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.removal_ticket IS DISTINCT FROM OLD.removal_ticket OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.replaces_kill_switch_id IS DISTINCT FROM OLD.replaces_kill_switch_id OR NEW.removed_at IS NULL OR NEW.removed_by_user_id IS NULL OR NEW.removal_reason IS NULL OR length(btrim(NEW.removal_reason))=0 OR NEW.removal_correlation_id IS NULL THEN RAISE EXCEPTION 'invalid kill switch closure'; END IF;
 END IF; RETURN NEW;
END; $_$;
CREATE TRIGGER trg_enforce_kill_switch_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON capability_kill_switches FOR EACH ROW EXECUTE FUNCTION enforce_kill_switch_lifecycle();
CREATE TRIGGER trg_prevent_capability_module_mutation BEFORE UPDATE OR DELETE ON capability_modules FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_capability_action_mutation BEFORE UPDATE OR DELETE ON capability_actions FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
REVOKE INSERT,UPDATE,DELETE ON module_configurations,capability_kill_switches,capability_configuration_audit_events FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON capability_modules,capability_actions FROM PUBLIC;

CREATE FUNCTION capability_admin_change_configuration(p_actor BIGINT,p_module VARCHAR,p_expected INTEGER,p_state VARCHAR,p_config JSONB,p_correlation UUID,p_reason VARCHAR)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row module_configurations%ROWTYPE; new_row module_configurations%ROWTYPE;
BEGIN
 SELECT * INTO old_row FROM module_configurations WHERE module_code=p_module AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR UPDATE;
 IF NOT FOUND OR old_row.config_version<>p_expected THEN RAISE EXCEPTION 'CAPABILITY_CONFIG_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE module_configurations SET state=p_state,config=p_config,updated_by=p_actor,config_version=config_version+1,updated_at=clock_timestamp() WHERE id=old_row.id AND config_version=p_expected RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_CONFIG_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,configuration_id,reason,previous_state,next_state,expected_config_version,resulting_config_version,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'CONFIGURATION_CHANGED',p_module,old_row.id,p_reason,old_row.state,new_row.state,p_expected,new_row.config_version,to_jsonb(old_row),to_jsonb(new_row));
END; $_$;
CREATE FUNCTION capability_admin_create_kill_switch(p_actor BIGINT,p_module VARCHAR,p_action VARCHAR,p_owner VARCHAR,p_reason VARCHAR,p_expires TIMESTAMPTZ,p_ticket VARCHAR,p_correlation UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE created_row capability_kill_switches%ROWTYPE;
BEGIN
 PERFORM 1 FROM capability_actions WHERE module_code=p_module AND action_code=p_action FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 INSERT INTO capability_kill_switches(module_code,action_code,owner,reason,expires_at,removal_ticket,created_by_user_id) VALUES(p_module,p_action,p_owner,p_reason,p_expires,p_ticket,p_actor) RETURNING * INTO created_row;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_CREATED',p_module,p_action,created_row.id,p_reason,'{}'::jsonb,to_jsonb(created_row));
 RETURN created_row.id;
END; $_$;
CREATE FUNCTION capability_admin_remove_kill_switch(p_actor BIGINT,p_expected_active_id BIGINT,p_reason VARCHAR,p_correlation UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row capability_kill_switches%ROWTYPE; new_row capability_kill_switches%ROWTYPE; expected_module VARCHAR; expected_action VARCHAR;
BEGIN
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 expected_module:=old_row.module_code; expected_action:=old_row.action_code;
 PERFORM 1 FROM capability_actions WHERE module_code=expected_module AND action_code=expected_action FOR UPDATE;
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id FOR UPDATE;
 IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>expected_module OR old_row.action_code<>expected_action THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=p_actor AND u.active AND r.code='ADMIN') THEN RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED'; END IF;
 UPDATE capability_kill_switches SET active=FALSE,removed_at=clock_timestamp(),removed_by_user_id=p_actor,removal_reason=p_reason,removal_correlation_id=p_correlation WHERE id=old_row.id AND active=TRUE RETURNING * INTO new_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
 INSERT INTO capability_configuration_audit_events(correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,reason,before_snapshot,after_snapshot) VALUES(p_correlation,p_actor,'KILL_SWITCH_REMOVED',old_row.module_code,old_row.action_code,new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row));
END; $_$;
CREATE FUNCTION capability_admin_replace_kill_switch(p_actor BIGINT,p_expected_active_id BIGINT,p_owner VARCHAR,p_reason VARCHAR,p_expires TIMESTAMPTZ,p_ticket VARCHAR,p_correlation UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $_$
DECLARE old_row capability_kill_switches%ROWTYPE; closed_row capability_kill_switches%ROWTYPE; new_row capability_kill_switches%ROWTYPE; expected_module VARCHAR; expected_action VARCHAR;
BEGIN
 SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
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
ALTER FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
REVOKE ALL ON module_configurations,capability_kill_switches,capability_configuration_audit_events,capability_modules,capability_actions FROM storecore_runtime;
GRANT SELECT ON module_configurations,capability_kill_switches,capability_modules,capability_actions TO storecore_runtime;
REVOKE ALL ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) TO storecore_runtime, PUBLIC;
GRANT EXECUTE ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime, PUBLIC;
GRANT EXECUTE ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) TO storecore_runtime, PUBLIC;
GRANT EXECUTE ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime, PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO storecore_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO storecore_migrator;
