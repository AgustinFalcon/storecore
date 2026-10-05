-- Master-only forward migration. V1-V9 are published and remain immutable.
-- Admission to each capability mutation is linearized by locking the live USER
-- session, its active user and the current ADMIN membership before invoking the
-- owner-only V3/V8 mutation body. Those locks are held until transaction end.

CREATE FUNCTION capability_assert_live_admin_session(
  p_actor BIGINT,
  p_live_session UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $_$
BEGIN
  PERFORM 1
    FROM public.identity_sessions s
   WHERE s.id=p_live_session
     AND s.subject_kind='USER'
     AND s.user_id=p_actor
     AND s.revoked_at IS NULL
     AND s.idle_expires_at>clock_timestamp()
     AND s.absolute_expires_at>clock_timestamp()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED';
  END IF;

  PERFORM 1
    FROM public.users u
   WHERE u.id=p_actor AND u.active
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED';
  END IF;

  PERFORM 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id=ur.role_id
   WHERE ur.user_id=p_actor AND r.code='ADMIN'
   FOR UPDATE OF ur;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED';
  END IF;

  -- A preceding row lock may have waited. Re-evaluate both deadlines only
  -- after all authorization locks have been acquired.
  PERFORM 1
    FROM public.identity_sessions s
   WHERE s.id=p_live_session
     AND s.subject_kind='USER'
     AND s.user_id=p_actor
     AND s.revoked_at IS NULL
     AND s.idle_expires_at>clock_timestamp()
     AND s.absolute_expires_at>clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAPABILITY_ACTOR_NOT_AUTHORIZED';
  END IF;
END;
$_$;

CREATE FUNCTION capability_session_change_configuration(
  p_actor BIGINT,
  p_live_session UUID,
  p_module VARCHAR,
  p_expected INTEGER,
  p_state VARCHAR,
  p_config JSONB,
  p_correlation UUID,
  p_reason VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $_$
BEGIN
  PERFORM public.capability_assert_live_admin_session(p_actor,p_live_session);
  PERFORM public.capability_admin_change_configuration(
    p_actor,p_module,p_expected,p_state,p_config,p_correlation,p_reason
  );
END;
$_$;

CREATE FUNCTION capability_session_create_kill_switch(
  p_actor BIGINT,
  p_live_session UUID,
  p_module VARCHAR,
  p_action VARCHAR,
  p_owner VARCHAR,
  p_reason VARCHAR,
  p_expires TIMESTAMPTZ,
  p_ticket VARCHAR,
  p_correlation UUID
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $_$
BEGIN
  PERFORM public.capability_assert_live_admin_session(p_actor,p_live_session);
  RETURN public.capability_admin_create_kill_switch(
    p_actor,p_module,p_action,p_owner,p_reason,p_expires,p_ticket,p_correlation
  );
END;
$_$;

CREATE FUNCTION capability_session_remove_kill_switch(
  p_actor BIGINT,
  p_live_session UUID,
  p_expected_module VARCHAR,
  p_expected_active_id BIGINT,
  p_reason VARCHAR,
  p_correlation UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $_$
BEGIN
  PERFORM public.capability_assert_live_admin_session(p_actor,p_live_session);
  PERFORM public.capability_admin_remove_kill_switch(
    p_actor,p_expected_module,p_expected_active_id,p_reason,p_correlation
  );
END;
$_$;

CREATE FUNCTION capability_session_replace_kill_switch(
  p_actor BIGINT,
  p_live_session UUID,
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
SET search_path=pg_catalog,public,pg_temp
AS $_$
BEGIN
  PERFORM public.capability_assert_live_admin_session(p_actor,p_live_session);
  RETURN public.capability_admin_replace_kill_switch(
    p_actor,p_expected_module,p_expected_active_id,p_owner,p_reason,p_expires,p_ticket,p_correlation
  );
END;
$_$;

ALTER FUNCTION capability_assert_live_admin_session(BIGINT,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_session_change_configuration(BIGINT,UUID,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION capability_session_create_kill_switch(BIGINT,UUID,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_session_remove_kill_switch(BIGINT,UUID,VARCHAR,BIGINT,VARCHAR,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION capability_session_replace_kill_switch(BIGINT,UUID,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator;

REVOKE ALL ON FUNCTION capability_assert_live_admin_session(BIGINT,UUID) FROM PUBLIC,storecore_runtime;

REVOKE ALL ON FUNCTION capability_admin_change_configuration(BIGINT,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION capability_admin_create_kill_switch(BIGINT,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,BIGINT,VARCHAR,UUID) FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC,storecore_runtime;

REVOKE ALL ON FUNCTION capability_session_change_configuration(BIGINT,UUID,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_session_create_kill_switch(BIGINT,UUID,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_session_remove_kill_switch(BIGINT,UUID,VARCHAR,BIGINT,VARCHAR,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION capability_session_replace_kill_switch(BIGINT,UUID,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION capability_session_change_configuration(BIGINT,UUID,VARCHAR,INTEGER,VARCHAR,JSONB,UUID,VARCHAR) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_session_create_kill_switch(BIGINT,UUID,VARCHAR,VARCHAR,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_session_remove_kill_switch(BIGINT,UUID,VARCHAR,BIGINT,VARCHAR,UUID) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION capability_session_replace_kill_switch(BIGINT,UUID,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO storecore_runtime;

-- Fail the migration if a SET-reachable parent role can still execute a legacy
-- actor-only entrypoint, including through PUBLIC or inherited grants.
DO $_$
DECLARE
  legacy_execute_count INTEGER;
  session_execute_count INTEGER;
BEGIN
  WITH RECURSIVE reachable(role_oid) AS (
    SELECT oid FROM pg_catalog.pg_roles WHERE rolname='storecore_runtime'
    UNION
    SELECT memberships.roleid
      FROM reachable current_role
      JOIN pg_catalog.pg_auth_members memberships ON memberships.member=current_role.role_oid
     WHERE memberships.set_option
  ), legacy_functions(function_oid) AS (
    SELECT p.oid
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.oid IN (
         'public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)'::regprocedure,
         'public.capability_admin_create_kill_switch(bigint,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,uuid)'::regprocedure,
         'public.capability_admin_remove_kill_switch(bigint,bigint,character varying,uuid)'::regprocedure,
         'public.capability_admin_replace_kill_switch(bigint,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)'::regprocedure,
         'public.capability_admin_remove_kill_switch(bigint,character varying,bigint,character varying,uuid)'::regprocedure,
         'public.capability_admin_replace_kill_switch(bigint,character varying,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)'::regprocedure
       )
  )
  SELECT count(*) INTO legacy_execute_count
    FROM reachable r CROSS JOIN legacy_functions f
   WHERE pg_catalog.has_function_privilege(r.role_oid,f.function_oid,'EXECUTE');

  SELECT count(*) INTO session_execute_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname LIKE 'capability_session_%'
     AND pg_catalog.has_function_privilege('storecore_runtime',p.oid,'EXECUTE')
     AND NOT EXISTS (
       SELECT 1
         FROM pg_catalog.aclexplode(pg_catalog.coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
     )
     AND p.prosecdef
     AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
     AND pg_catalog.pg_get_userbyid(p.proowner)='storecore_migrator';

  IF legacy_execute_count<>0 OR session_execute_count<>4 THEN
    RAISE EXCEPTION 'CAPABILITY_SESSION_BOUND_ACL_POSTCONDITION_FAILED';
  END IF;
END;
$_$;
