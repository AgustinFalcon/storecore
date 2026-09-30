-- POSC-002E POS companion effect/read guards. Does not edit V1–V9.
-- No BLACKSTORE_INTEGRATION activation. No GRANT ALL. No companion admin HTTP.

DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_pos_guard_owner') THEN
  CREATE ROLE storecore_pos_guard_owner NOLOGIN;
 END IF;
END; $_roles$;

GRANT USAGE ON SCHEMA public TO storecore_pos_guard_owner;

CREATE FUNCTION public.pos_companion_effect_guard(
 p_companion_id BIGINT, p_credential_id BIGINT, p_credential_version INTEGER, p_action VARCHAR
) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 required_scope TEXT;
 action_found BOOLEAN;
 capability_state VARCHAR;
 companion_status VARCHAR;
 cred RECORD;
BEGIN
 IF pg_catalog.lower(pg_catalog.current_setting('transaction_isolation')) IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'POS_GUARD_ISOLATION' USING ERRCODE='25000';
 END IF;
 IF p_action NOT IN ('CATALOG_READ','STOCK_RESERVE','STOCK_COMMIT','STOCK_RELEASE','STOCK_READ','COST_READ','PRICE_OVERRIDE','READ_STATUS','HEALTH') THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
 required_scope := CASE p_action
  WHEN 'CATALOG_READ' THEN 'catalog:read'
  WHEN 'STOCK_RESERVE' THEN 'stock:reserve'
  WHEN 'STOCK_COMMIT' THEN 'stock:commit'
  WHEN 'STOCK_RELEASE' THEN 'stock:release'
  WHEN 'STOCK_READ' THEN 'stock:read'
  WHEN 'COST_READ' THEN 'cost:read'
  WHEN 'PRICE_OVERRIDE' THEN 'price:override'
  WHEN 'READ_STATUS' THEN 'stock:read'
  WHEN 'HEALTH' THEN 'stock:read'
  ELSE NULL
 END;
 PERFORM 1 FROM public.capability_actions WHERE module_code='BLACKSTORE_INTEGRATION' ORDER BY action_code FOR SHARE;
 SELECT EXISTS (
  SELECT 1 FROM public.capability_actions WHERE module_code='BLACKSTORE_INTEGRATION' AND action_code=p_action
 ) INTO action_found;
 IF NOT action_found THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT state INTO capability_state
   FROM public.module_configurations
  WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'
  FOR SHARE;
 IF capability_state IS NULL THEN
  RAISE EXCEPTION 'CAPABILITY_DISABLED' USING ERRCODE='P0001';
 END IF;
 IF p_action IN ('STOCK_RESERVE','STOCK_COMMIT','STOCK_RELEASE','PRICE_OVERRIDE') THEN
  IF capability_state IS DISTINCT FROM 'ACTIVE' THEN
   RAISE EXCEPTION 'CAPABILITY_DISABLED' USING ERRCODE='P0001';
  END IF;
 ELSIF capability_state NOT IN ('ACTIVE','READ_ONLY') THEN
  RAISE EXCEPTION 'CAPABILITY_DISABLED' USING ERRCODE='P0001';
 END IF;
 PERFORM 1 FROM public.capability_kill_switches WHERE module_code='BLACKSTORE_INTEGRATION' ORDER BY action_code, id FOR SHARE;
 IF EXISTS (
  SELECT 1 FROM public.capability_kill_switches
   WHERE module_code='BLACKSTORE_INTEGRATION' AND action_code=p_action
     AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' AND active
     AND expires_at > pg_catalog.clock_timestamp()
 ) THEN
  RAISE EXCEPTION 'CAPABILITY_DISABLED' USING ERRCODE='P0001';
 END IF;
 SELECT status INTO companion_status FROM public.blackstore_companions WHERE id=p_companion_id FOR SHARE;
 IF companion_status IS DISTINCT FROM 'ACTIVE' THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO cred FROM public.blackstore_companion_credentials
  WHERE companion_id=p_companion_id AND credential_version=p_credential_version FOR SHARE;
 IF cred.id IS DISTINCT FROM p_credential_id
  OR cred.status IS DISTINCT FROM 'ACTIVE'
  OR cred.auth_ready IS DISTINCT FROM TRUE
  OR required_scope IS NULL
  OR NOT (required_scope = ANY (cred.scopes)) THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
END; $_$;

CREATE FUNCTION public.pos_companion_read_guard(
 p_companion_id BIGINT, p_credential_id BIGINT, p_credential_version INTEGER, p_action VARCHAR
) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 required_scope TEXT;
 action_found BOOLEAN;
 capability_state VARCHAR;
 companion_status VARCHAR;
 cred RECORD;
BEGIN
 IF pg_catalog.lower(pg_catalog.current_setting('transaction_isolation')) IS DISTINCT FROM 'repeatable read' THEN
  RAISE EXCEPTION 'POS_GUARD_ISOLATION' USING ERRCODE='25000';
 END IF;
 IF p_action NOT IN ('CATALOG_READ','STOCK_READ','READ_STATUS','HEALTH') THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
 required_scope := CASE p_action
  WHEN 'CATALOG_READ' THEN 'catalog:read'
  WHEN 'STOCK_READ' THEN 'stock:read'
  WHEN 'READ_STATUS' THEN 'stock:read'
  WHEN 'HEALTH' THEN 'stock:read'
  ELSE NULL
 END;
 SELECT EXISTS (
  SELECT 1 FROM public.capability_actions WHERE module_code='BLACKSTORE_INTEGRATION' AND action_code=p_action
 ) INTO action_found;
 IF NOT action_found THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT state INTO capability_state
   FROM public.module_configurations
  WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT';
 IF capability_state IS NULL OR capability_state NOT IN ('ACTIVE','READ_ONLY') THEN
  RAISE EXCEPTION 'CAPABILITY_DISABLED' USING ERRCODE='P0001';
 END IF;
 IF EXISTS (
  SELECT 1 FROM public.capability_kill_switches
   WHERE module_code='BLACKSTORE_INTEGRATION' AND action_code=p_action
     AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' AND active
     AND expires_at > now()
 ) THEN
  RAISE EXCEPTION 'CAPABILITY_DISABLED' USING ERRCODE='P0001';
 END IF;
 SELECT status INTO companion_status FROM public.blackstore_companions WHERE id=p_companion_id;
 IF companion_status IS DISTINCT FROM 'ACTIVE' THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO cred FROM public.blackstore_companion_credentials
  WHERE companion_id=p_companion_id AND credential_version=p_credential_version;
 IF cred.id IS DISTINCT FROM p_credential_id
  OR cred.status IS DISTINCT FROM 'ACTIVE'
  OR cred.auth_ready IS DISTINCT FROM TRUE
  OR required_scope IS NULL
  OR NOT (required_scope = ANY (cred.scopes)) THEN
  RAISE EXCEPTION 'POS_GUARD_DENIED' USING ERRCODE='42501';
 END IF;
END; $_$;

ALTER FUNCTION public.pos_companion_effect_guard(BIGINT, BIGINT, INTEGER, VARCHAR) OWNER TO storecore_pos_guard_owner;
ALTER FUNCTION public.pos_companion_read_guard(BIGINT, BIGINT, INTEGER, VARCHAR) OWNER TO storecore_pos_guard_owner;

REVOKE ALL ON FUNCTION public.pos_companion_effect_guard(BIGINT, BIGINT, INTEGER, VARCHAR) FROM PUBLIC, storecore_companion_admin, storecore_capability_admin;
REVOKE ALL ON FUNCTION public.pos_companion_read_guard(BIGINT, BIGINT, INTEGER, VARCHAR) FROM PUBLIC, storecore_companion_admin, storecore_capability_admin;
GRANT EXECUTE ON FUNCTION public.pos_companion_effect_guard(BIGINT, BIGINT, INTEGER, VARCHAR) TO storecore_runtime;
GRANT EXECUTE ON FUNCTION public.pos_companion_read_guard(BIGINT, BIGINT, INTEGER, VARCHAR) TO storecore_runtime;

GRANT SELECT ON public.capability_actions TO storecore_pos_guard_owner;
GRANT UPDATE (action_code) ON public.capability_actions TO storecore_pos_guard_owner;
GRANT SELECT ON public.module_configurations TO storecore_pos_guard_owner;
GRANT UPDATE (updated_at) ON public.module_configurations TO storecore_pos_guard_owner;
GRANT SELECT ON public.capability_kill_switches TO storecore_pos_guard_owner;
GRANT UPDATE (id) ON public.capability_kill_switches TO storecore_pos_guard_owner;
GRANT SELECT ON public.blackstore_companions TO storecore_pos_guard_owner;
GRANT UPDATE (created_at) ON public.blackstore_companions TO storecore_pos_guard_owner;
GRANT SELECT ON public.blackstore_companion_credentials TO storecore_pos_guard_owner;
GRANT UPDATE (created_at) ON public.blackstore_companion_credentials TO storecore_pos_guard_owner;
