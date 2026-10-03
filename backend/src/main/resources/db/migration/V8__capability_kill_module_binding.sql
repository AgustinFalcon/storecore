-- Bind console kill-switch mutations to the module selected in the URL without
-- granting UPDATE to the restricted runtime role.

CREATE FUNCTION capability_admin_remove_kill_switch(
  p_actor BIGINT,
  p_expected_module VARCHAR,
  p_expected_active_id BIGINT,
  p_reason VARCHAR,
  p_correlation UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $_$
DECLARE
  old_row capability_kill_switches%ROWTYPE;
  new_row capability_kill_switches%ROWTYPE;
  expected_action VARCHAR;
BEGIN
  SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
  IF NOT FOUND OR old_row.module_code<>p_expected_module THEN
    RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT';
  END IF;
  expected_action:=old_row.action_code;
  PERFORM 1 FROM capability_actions
    WHERE module_code=p_expected_module AND action_code=expected_action FOR UPDATE;
  SELECT * INTO old_row FROM capability_kill_switches
    WHERE id=p_expected_active_id FOR UPDATE;
  IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>p_expected_module OR old_row.action_code<>expected_action THEN
    RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    WHERE u.id=p_actor AND u.active AND r.code='ADMIN'
  ) THEN
    RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED';
  END IF;
  UPDATE capability_kill_switches
    SET active=FALSE,
        removed_at=clock_timestamp(),
        removed_by_user_id=p_actor,
        removal_reason=p_reason,
        removal_correlation_id=p_correlation
    WHERE id=old_row.id AND active=TRUE
    RETURNING * INTO new_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
  INSERT INTO capability_configuration_audit_events(
    correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,
    reason,before_snapshot,after_snapshot
  ) VALUES(
    p_correlation,p_actor,'KILL_SWITCH_REMOVED',old_row.module_code,old_row.action_code,
    new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row)
  );
END;
$_$;

CREATE FUNCTION capability_admin_replace_kill_switch(
  p_actor BIGINT,
  p_expected_module VARCHAR,
  p_expected_active_id BIGINT,
  p_owner VARCHAR,
  p_reason VARCHAR,
  p_expires TIMESTAMPTZ,
  p_ticket VARCHAR,
  p_correlation UUID
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $_$
DECLARE
  old_row capability_kill_switches%ROWTYPE;
  closed_row capability_kill_switches%ROWTYPE;
  new_row capability_kill_switches%ROWTYPE;
  expected_action VARCHAR;
BEGIN
  SELECT * INTO old_row FROM capability_kill_switches WHERE id=p_expected_active_id;
  IF NOT FOUND OR old_row.module_code<>p_expected_module THEN
    RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT';
  END IF;
  expected_action:=old_row.action_code;
  PERFORM 1 FROM capability_actions
    WHERE module_code=p_expected_module AND action_code=expected_action FOR UPDATE;
  SELECT * INTO old_row FROM capability_kill_switches
    WHERE id=p_expected_active_id FOR UPDATE;
  IF NOT FOUND OR NOT old_row.active OR old_row.module_code<>p_expected_module OR old_row.action_code<>expected_action THEN
    RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM users u
    JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id
    WHERE u.id=p_actor AND u.active AND r.code='ADMIN'
  ) THEN
    RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED';
  END IF;
  UPDATE capability_kill_switches
    SET active=FALSE,
        removed_at=clock_timestamp(),
        removed_by_user_id=p_actor,
        removal_reason=p_reason,
        removal_correlation_id=p_correlation
    WHERE id=old_row.id AND active=TRUE
    RETURNING * INTO closed_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'CAPABILITY_KILL_SWITCH_VERSION_CONFLICT'; END IF;
  INSERT INTO capability_kill_switches(
    module_code,action_code,owner,reason,expires_at,removal_ticket,
    created_by_user_id,replaces_kill_switch_id
  ) VALUES(
    old_row.module_code,old_row.action_code,p_owner,p_reason,p_expires,p_ticket,
    p_actor,closed_row.id
  ) RETURNING * INTO new_row;
  INSERT INTO capability_configuration_audit_events(
    correlation_id,actor_user_id,event_kind,module_code,action_code,kill_switch_id,
    reason,before_snapshot,after_snapshot
  ) VALUES(
    p_correlation,p_actor,'KILL_SWITCH_REPLACED',new_row.module_code,new_row.action_code,
    new_row.id,p_reason,to_jsonb(old_row),to_jsonb(new_row)
  );
  RETURN new_row.id;
END;
$_$;

ALTER FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID)
  OWNER TO storecore_migrator;
ALTER FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID)
  OWNER TO storecore_migrator;

REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
