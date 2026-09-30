-- POSC-004A worker-owned PENDING drain and terminal purge.
-- Does not edit V1–V13. Does not activate BLACKSTORE_INTEGRATION. No GRANT ALL.

DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_blackstore_worker_owner') THEN
  CREATE ROLE storecore_blackstore_worker_owner NOLOGIN;
 END IF;
END; $_roles$;

GRANT USAGE ON SCHEMA public TO storecore_blackstore_worker_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blackstore_integration_operations TO storecore_blackstore_worker_owner;
GRANT SELECT, DELETE ON public.blackstore_integration_reservation_lines TO storecore_blackstore_worker_owner;
GRANT SELECT, INSERT ON public.blackstore_integration_operation_tombstones TO storecore_blackstore_worker_owner;
GRANT USAGE, SELECT ON SEQUENCE public.blackstore_integration_operations_id_seq TO storecore_blackstore_worker_owner;
GRANT USAGE, SELECT ON SEQUENCE public.blackstore_integration_operation_tombstones_id_seq TO storecore_blackstore_worker_owner;
GRANT USAGE, SELECT ON SEQUENCE public.blackstore_integration_reservation_lines_id_seq TO storecore_blackstore_worker_owner;

CREATE FUNCTION public.storecore_blackstore_delete_stale_pending() RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 deleted INTEGER;
BEGIN
 DELETE FROM public.blackstore_integration_operations
  WHERE state = 'PENDING'
    AND receipt IS NULL
    AND created_at < pg_catalog.clock_timestamp() - INTERVAL '60 seconds';
 GET DIAGNOSTICS deleted = ROW_COUNT;
 RETURN deleted;
END;
$_$;

ALTER FUNCTION public.storecore_blackstore_delete_stale_pending() OWNER TO storecore_blackstore_worker_owner;

CREATE FUNCTION public.storecore_blackstore_purge_terminal(
 p_client_instance_id UUID,
 p_device_id VARCHAR,
 p_sale_id VARCHAR,
 p_operation_id UUID
) RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 op RECORD;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext(p_client_instance_id::text || '|' || p_operation_id::text),
  pg_catalog.hashtext(p_device_id || '|' || p_sale_id)
 );
 IF EXISTS (
  SELECT 1 FROM public.blackstore_integration_operation_tombstones
   WHERE client_instance_id = p_client_instance_id
     AND device_id = p_device_id
     AND sale_id = p_sale_id
     AND operation_id = p_operation_id
 ) THEN
  RAISE EXCEPTION 'OPERATION_RETIRED' USING ERRCODE = 'P0001';
 END IF;
 SELECT * INTO op
   FROM public.blackstore_integration_operations
  WHERE client_instance_id = p_client_instance_id
    AND device_id = p_device_id
    AND sale_id = p_sale_id
    AND operation_id = p_operation_id
    FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
 END IF;
 IF op.state NOT IN ('COMMITTED', 'RELEASED', 'EXPIRED') THEN
  RAISE EXCEPTION 'OPERATION_STATE_CONFLICT' USING ERRCODE = '25001';
 END IF;
 IF op.updated_at > pg_catalog.clock_timestamp() - INTERVAL '90 days' THEN
  RAISE EXCEPTION 'RETENTION_ACTIVE' USING ERRCODE = '25001';
 END IF;
 INSERT INTO public.blackstore_integration_operation_tombstones(
  client_instance_id, device_id, sale_id, operation_id, request_hash, final_state,
  receipt, reservation_ref, retired_at, retention_until
 ) VALUES (
  p_client_instance_id, p_device_id, p_sale_id, p_operation_id, op.request_hash, op.state,
  op.receipt, op.reservation_ref, pg_catalog.clock_timestamp(),
  pg_catalog.clock_timestamp() + INTERVAL '7 years'
 );
 DELETE FROM public.blackstore_integration_reservation_lines WHERE operation_pk = op.id;
 DELETE FROM public.blackstore_integration_operations WHERE id = op.id;
END;
$_$;

ALTER FUNCTION public.storecore_blackstore_purge_terminal(UUID, VARCHAR, VARCHAR, UUID)
 OWNER TO storecore_blackstore_worker_owner;

REVOKE ALL ON FUNCTION public.storecore_blackstore_delete_stale_pending() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.storecore_blackstore_purge_terminal(UUID, VARCHAR, VARCHAR, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storecore_blackstore_delete_stale_pending() TO storecore_runtime;
GRANT EXECUTE ON FUNCTION public.storecore_blackstore_purge_terminal(UUID, VARCHAR, VARCHAR, UUID) TO storecore_runtime;

REVOKE DELETE ON public.blackstore_integration_operations FROM storecore_runtime;
REVOKE DELETE ON public.blackstore_integration_reservation_lines FROM storecore_runtime;
REVOKE INSERT, UPDATE, DELETE ON public.blackstore_integration_operation_tombstones FROM storecore_runtime;
GRANT SELECT ON public.blackstore_integration_operation_tombstones TO storecore_runtime;
