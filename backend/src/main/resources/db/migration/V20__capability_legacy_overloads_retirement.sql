-- Capability admin lineage convergence: retire every legacy mutation signature
-- that may exist on the integration lineage. V1-V19 remain immutable.
-- Missing overloads are tolerated only on this lineage; master drift is gated
-- by its own preflight before the corresponding cut is implemented.
DO $$
DECLARE
  signature text;
  set_reachable_execute boolean;
  signatures text[] := ARRAY[
    'public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)',
    'public.capability_admin_create_kill_switch(bigint,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,uuid)',
    'public.capability_admin_remove_kill_switch(bigint,bigint,character varying,uuid)',
    'public.capability_admin_replace_kill_switch(bigint,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)',
    'public.capability_admin_remove_kill_switch(bigint,character varying,bigint,character varying,uuid)',
    'public.capability_admin_replace_kill_switch(bigint,character varying,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)'
  ];
BEGIN
  FOREACH signature IN ARRAY signatures LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, storecore_runtime', signature);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  signature text;
  signatures text[] := ARRAY[
    'public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)',
    'public.capability_admin_create_kill_switch(bigint,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,uuid)',
    'public.capability_admin_remove_kill_switch(bigint,bigint,character varying,uuid)',
    'public.capability_admin_replace_kill_switch(bigint,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)',
    'public.capability_admin_remove_kill_switch(bigint,character varying,bigint,character varying,uuid)',
    'public.capability_admin_replace_kill_switch(bigint,character varying,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)'
  ];
BEGIN
  FOREACH signature IN ARRAY signatures LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      WITH RECURSIVE set_reachable(role_oid) AS (
        SELECT oid FROM pg_roles WHERE rolname = 'storecore_runtime'
        UNION
        SELECT membership.roleid
        FROM pg_auth_members membership
        JOIN set_reachable reachable ON reachable.role_oid = membership.member
        WHERE membership.set_option
      )
      SELECT EXISTS (
        SELECT 1
        FROM set_reachable reachable
        WHERE has_function_privilege(reachable.role_oid, signature, 'EXECUTE')
      ) INTO set_reachable_execute;

      IF has_function_privilege('public', signature, 'EXECUTE') OR set_reachable_execute THEN
        RAISE EXCEPTION 'legacy capability signature remains executable: %', signature;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Do not grant a fallback path. The Tx-C role remains the only runtime
-- capability-admin entry point and its effective privileges are asserted by
-- the upgrade/security test suite.
