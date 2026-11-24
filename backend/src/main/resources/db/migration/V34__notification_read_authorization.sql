-- V33 remains published. Do not broaden runtime access to identity tables.
CREATE FUNCTION notification_read_authorized(actor BIGINT,live_session UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF actor IS NULL OR actor<=0 THEN RETURN FALSE; END IF;
 PERFORM pg_advisory_xact_lock(((-actor)>>32)::integer,(((-actor)<<32)>>32)::integer);
 PERFORM 1 FROM public.users u WHERE u.id=actor AND u.active FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 PERFORM 1 FROM public.identity_sessions s WHERE s.id=live_session AND s.subject_kind='USER' AND s.user_id=actor
  AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 PERFORM 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
  WHERE ur.user_id=actor AND r.code IN ('ADMIN','OPERATOR') FOR SHARE OF ur,r;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 -- Wall-clock expiry can happen while any preceding lock is queued.
 RETURN EXISTS(SELECT 1 FROM public.identity_sessions s WHERE s.id=live_session AND s.subject_kind='USER' AND s.user_id=actor
  AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp());
END $$;
ALTER FUNCTION notification_read_authorized(BIGINT,UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION notification_read_authorized(BIGINT,UUID) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION notification_read_authorized(BIGINT,UUID) TO storecore_runtime;
