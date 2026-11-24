-- Forward-only notification persistence. V1-V32 remain unchanged.
CREATE FUNCTION notification_v1_hash(VARIADIC fields TEXT[]) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$
DECLARE field TEXT; payload BYTEA := ''::bytea; encoded BYTEA;
BEGIN
 FOREACH field IN ARRAY fields LOOP
  IF field IS NULL THEN RETURN NULL; END IF;
  encoded := convert_to(field,'UTF8');
  payload := payload || int4send(octet_length(encoded)) || encoded;
 END LOOP;
 RETURN encode(sha256(payload),'hex');
END $$;

CREATE TABLE notification_alerts (
 id UUID PRIMARY KEY CHECK(id <> '00000000-0000-0000-0000-000000000000'),
 source_type TEXT NOT NULL CHECK(source_type IN ('STORECORE_FACT','BLACKSTORE_STOCK_RECEIPT','SYSTEM_CAMPAIGN')),
 source_id TEXT NOT NULL CHECK(octet_length(source_id) BETWEEN 1 AND 128),
 fingerprint TEXT NOT NULL CHECK(fingerprint COLLATE "C" ~ '^[0-9a-f]{64}$'),
 category TEXT NOT NULL CHECK(category IN ('STOCK','ORDER','PAYMENT','RETURN','INTEGRATION','CAMPAIGN')),
 severity TEXT NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')),
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
 revision BIGINT NOT NULL CHECK(revision>=0),
 created_at TIMESTAMPTZ NOT NULL,
 UNIQUE(source_type,source_id,fingerprint),
 UNIQUE(id,source_type,source_id,fingerprint)
);
CREATE INDEX ix_notification_alerts_inbox ON notification_alerts(created_at DESC,id);

CREATE TABLE notification_source_events (
 delivery_id UUID PRIMARY KEY CHECK(delivery_id <> '00000000-0000-0000-0000-000000000000'),
 alert_id UUID NOT NULL,
 source_type TEXT NOT NULL,
 source_id TEXT NOT NULL CHECK(octet_length(source_id) BETWEEN 1 AND 128),
 fingerprint TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('STOCK','ORDER','PAYMENT','RETURN','INTEGRATION','CAMPAIGN')),
 severity TEXT NOT NULL CHECK(severity IN ('INFO','WARNING','CRITICAL')),
 condition_code TEXT NOT NULL CHECK(condition_code COLLATE "C" ~ '^[A-Z0-9_.-]{1,64}$'),
 episode_key TEXT NOT NULL CHECK(octet_length(episode_key) BETWEEN 1 AND 128),
 event_hash TEXT NOT NULL CHECK(event_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 recorded_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(alert_id,source_type,source_id,fingerprint) REFERENCES notification_alerts(id,source_type,source_id,fingerprint) ON DELETE RESTRICT,
 CHECK(fingerprint=notification_v1_hash('notification-v1',category,condition_code,episode_key)),
 CHECK(event_hash=notification_v1_hash('notification-event-v1',source_type,source_id,category,severity,condition_code,episode_key))
);

CREATE FUNCTION notification_snapshot_valid(snapshot JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(snapshot)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(snapshot))<>8 THEN RETURN FALSE; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(snapshot) e WHERE jsonb_typeof(e.value)<>'string') THEN RETURN FALSE; END IF;
 RETURN coalesce(
  snapshot->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (snapshot->>'id')::uuid<>'00000000-0000-0000-0000-000000000000'::uuid
  AND snapshot->>'sourceType' IN ('STORECORE_FACT','BLACKSTORE_STOCK_RECEIPT','SYSTEM_CAMPAIGN')
  AND octet_length(snapshot->>'sourceId') BETWEEN 1 AND 128
  AND snapshot->>'fingerprint' COLLATE "C" ~ '^[0-9a-f]{64}$'
  AND snapshot->>'category' IN ('STOCK','ORDER','PAYMENT','RETURN','INTEGRATION','CAMPAIGN')
  AND snapshot->>'severity' IN ('INFO','WARNING','CRITICAL')
  AND snapshot->>'lifecycle' IN ('OPEN','ACKNOWLEDGED','RESOLVED')
  AND snapshot->>'revision' ~ '^(0|[1-9][0-9]*)$' AND (snapshot->>'revision')::bigint>=0,FALSE);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN FALSE;
END $$;

CREATE TABLE notification_command_receipts (
 command_id UUID PRIMARY KEY CHECK(command_id <> '00000000-0000-0000-0000-000000000000'),
 alert_id UUID NOT NULL REFERENCES notification_alerts(id) ON DELETE RESTRICT,
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT CHECK(actor_id>0),
 operation TEXT NOT NULL CHECK(operation IN ('ACKNOWLEDGE','RESOLVE','REOPEN')),
 expected_revision BIGINT NOT NULL CHECK(expected_revision>=0),
 reason TEXT NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500 AND reason=btrim(reason,E' \t\n\r\013\014')),
 payload_hash TEXT NOT NULL CHECK(payload_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED','REVISION_CONFLICT','INVALID_TRANSITION','REVISION_EXHAUSTED')),
 before_snapshot JSONB NOT NULL CHECK(notification_snapshot_valid(before_snapshot)),
 recorded_at TIMESTAMPTZ NOT NULL,
 CHECK(before_snapshot->>'id'=alert_id::text),
 CHECK(payload_hash=notification_v1_hash('notification-command-v1',operation,alert_id::text,actor_id::text,expected_revision::text,reason)),
 CHECK((outcome='REVISION_CONFLICT' AND (before_snapshot->>'revision')::bigint<>expected_revision)
  OR (outcome<>'REVISION_CONFLICT' AND (before_snapshot->>'revision')::bigint=expected_revision)),
 CHECK(outcome=CASE
  WHEN (before_snapshot->>'revision')::bigint<>expected_revision THEN 'REVISION_CONFLICT'
  WHEN NOT ((operation='ACKNOWLEDGE' AND before_snapshot->>'lifecycle'='OPEN')
   OR (operation='RESOLVE' AND before_snapshot->>'lifecycle' IN ('OPEN','ACKNOWLEDGED'))
   OR (operation='REOPEN' AND before_snapshot->>'lifecycle'='RESOLVED')) THEN 'INVALID_TRANSITION'
  WHEN expected_revision=9223372036854775807 THEN 'REVISION_EXHAUSTED' ELSE 'APPLIED' END)
);

CREATE TABLE notification_lifecycle_audit (
 command_id UUID PRIMARY KEY REFERENCES notification_command_receipts(command_id) ON DELETE RESTRICT
);

CREATE FUNCTION notification_protect_projection() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'notification projection cannot be deleted' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'lifecycle'-'revision') IS DISTINCT FROM (to_jsonb(OLD)-'lifecycle'-'revision')
  OR OLD.revision=9223372036854775807 OR NEW.revision-1<>OLD.revision
  OR NOT ((OLD.lifecycle='OPEN' AND NEW.lifecycle IN ('ACKNOWLEDGED','RESOLVED'))
   OR (OLD.lifecycle='ACKNOWLEDGED' AND NEW.lifecycle='RESOLVED') OR (OLD.lifecycle='RESOLVED' AND NEW.lifecycle='OPEN')) THEN
  RAISE EXCEPTION 'invalid notification projection mutation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_projection BEFORE UPDATE OR DELETE ON notification_alerts FOR EACH ROW EXECUTE FUNCTION notification_protect_projection();
CREATE TRIGGER trg_notification_source_immutable BEFORE UPDATE OR DELETE ON notification_source_events FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_notification_receipt_immutable BEFORE UPDATE OR DELETE ON notification_command_receipts FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_notification_audit_immutable BEFORE UPDATE OR DELETE ON notification_lifecycle_audit FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

-- Reuse the existing live USER root/session/ADMIN locking contract without
-- granting callers direct execution of the broader capability guard.
CREATE FUNCTION notification_admin_authorized(actor BIGINT, live_session UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.capability_assert_live_admin_session(actor,live_session);
 RETURN TRUE;
EXCEPTION WHEN raise_exception THEN RETURN FALSE;
END $$;
ALTER FUNCTION notification_admin_authorized(BIGINT,UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION notification_admin_authorized(BIGINT,UUID) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION notification_admin_authorized(BIGINT,UUID) TO storecore_runtime;
REVOKE ALL ON notification_alerts,notification_source_events,notification_command_receipts,notification_lifecycle_audit FROM PUBLIC,storecore_runtime;
GRANT SELECT,INSERT ON notification_alerts,notification_source_events,notification_command_receipts,notification_lifecycle_audit TO storecore_runtime;
GRANT UPDATE(lifecycle,revision) ON notification_alerts TO storecore_runtime;
GRANT ALL ON notification_alerts,notification_source_events,notification_command_receipts,notification_lifecycle_audit TO storecore_migrator;
