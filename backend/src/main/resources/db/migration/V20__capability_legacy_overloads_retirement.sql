-- Capability admin lineage convergence: retire every legacy mutation signature
-- that may exist on the integration lineage. V1-V19 remain immutable.
-- Missing overloads are tolerated only on this lineage; master drift is gated
-- by its own preflight before the corresponding cut is implemented.
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
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, storecore_runtime', signature);
    END IF;
  END LOOP;
END $$;

-- Do not grant a fallback path. The Tx-C role remains the only runtime
-- capability-admin entry point and its effective privileges are asserted by
-- the upgrade/security test suite.
