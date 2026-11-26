-- PCC-008B contract and persistence only. No runner, timer, claim or notification effect.

ALTER TABLE capability_modules DISABLE TRIGGER trg_prevent_capability_module_mutation;
UPDATE capability_modules SET future_optional=FALSE WHERE module_code='COMMERCIAL_CALENDAR' AND future_optional;
ALTER TABLE capability_modules ENABLE ALWAYS TRIGGER trg_prevent_capability_module_mutation;

INSERT INTO capability_actions(module_code,action_code,allows_write,action_kind,allowed_when_paused)
VALUES('COMMERCIAL_CALENDAR','EMIT_IN_APP_CAMPAIGN_REMINDER',TRUE,'PUBLISH',FALSE)
ON CONFLICT(module_code,action_code) DO NOTHING;

ALTER TABLE calendar_command_bindings DROP CONSTRAINT calendar_command_bindings_family_check;
ALTER TABLE calendar_command_bindings ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE calendar_command_bindings ADD CONSTRAINT ck_calendar_command_binding_family
 CHECK(family IN ('EVENT','PREFLIGHT','REMINDER_SWITCH'));
ALTER TABLE calendar_command_bindings ADD CONSTRAINT ck_calendar_command_binding_target
 CHECK((family IN ('EVENT','PREFLIGHT') AND event_id IS NOT NULL) OR (family='REMINDER_SWITCH' AND event_id IS NULL));

ALTER TABLE calendar_reminder_switch
 ADD COLUMN owner TEXT,
 ADD COLUMN reason TEXT,
 ADD COLUMN created_at TIMESTAMPTZ,
 ADD COLUMN expires_at TIMESTAMPTZ,
 ADD COLUMN removal_ticket TEXT,
 ADD COLUMN affected_action TEXT,
 ADD CONSTRAINT ck_calendar_reminder_switch_governance CHECK(
  (revision=0 AND state='DISABLED' AND owner IS NULL AND reason IS NULL AND created_at IS NULL AND expires_at IS NULL AND removal_ticket IS NULL AND affected_action IS NULL)
  OR (revision>0 AND char_length(owner) BETWEEN 1 AND 160 AND owner=btrim(owner,E' \t\n\r\013\014')
   AND char_length(reason) BETWEEN 1 AND 500 AND reason=btrim(reason,E' \t\n\r\013\014')
   AND date_trunc('second',created_at)=created_at AND date_trunc('second',expires_at)=expires_at AND expires_at>created_at
   AND char_length(removal_ticket) BETWEEN 1 AND 100 AND removal_ticket=btrim(removal_ticket,E' \t\n\r\013\014')
   AND affected_action='EMIT_IN_APP_CAMPAIGN_REMINDER')
 );

CREATE FUNCTION calendar_switch_metadata_valid(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE created TIMESTAMPTZ; expires TIMESTAMPTZ;
BEGIN
 IF jsonb_typeof(value)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(value))<>6
  OR NOT value ?& ARRAY['owner','reason','createdAt','expiresAt','removalTicket','affectedAction']
  OR EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE jsonb_typeof(e.value)<>'string')
  OR char_length(value->>'owner') NOT BETWEEN 1 AND 160 OR value->>'owner'<>btrim(value->>'owner',E' \t\n\r\013\014')
  OR char_length(value->>'reason') NOT BETWEEN 1 AND 500 OR value->>'reason'<>btrim(value->>'reason',E' \t\n\r\013\014')
  OR char_length(value->>'removalTicket') NOT BETWEEN 1 AND 100 OR value->>'removalTicket'<>btrim(value->>'removalTicket',E' \t\n\r\013\014')
  OR value->>'affectedAction'<>'EMIT_IN_APP_CAMPAIGN_REMINDER' THEN RETURN FALSE; END IF;
 created:=(value->>'createdAt')::timestamptz; expires:=(value->>'expiresAt')::timestamptz;
 RETURN date_trunc('second',created)=created AND date_trunc('second',expires)=expires AND expires>created;
EXCEPTION WHEN data_exception THEN RETURN FALSE;
END $$;

CREATE FUNCTION calendar_switch_effectivity(value JSONB,at_time TIMESTAMPTZ) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
BEGIN
 IF value->>'configuredState'='DISABLED' THEN RETURN 'DISABLED'; END IF;
 IF value->>'configuredState'<>'ENABLED' OR jsonb_typeof(value->'metadata')<>'object' OR NOT calendar_switch_metadata_valid(value->'metadata') THEN RETURN 'UNKNOWN'; END IF;
 RETURN CASE WHEN at_time<(value->'metadata'->>'expiresAt')::timestamptz THEN 'EFFECTIVE' ELSE 'EXPIRED' END;
EXCEPTION WHEN data_exception THEN RETURN 'UNKNOWN';
END $$;

CREATE FUNCTION calendar_switch_snapshot_valid(value JSONB,at_time TIMESTAMPTZ) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public AS $$
DECLARE revision_value BIGINT; effectivity TEXT;
BEGIN
 IF jsonb_typeof(value)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(value))<>4
  OR NOT value ?& ARRAY['configuredState','effectivity','revision','metadata']
  OR jsonb_typeof(value->'configuredState')<>'string' OR jsonb_typeof(value->'effectivity')<>'string'
  OR jsonb_typeof(value->'revision')<>'string' OR NOT calendar_revision_valid(value->>'revision')
  OR value->>'configuredState' NOT IN ('DISABLED','ENABLED') THEN RETURN FALSE; END IF;
 revision_value:=(value->>'revision')::bigint; effectivity:=calendar_switch_effectivity(value,at_time);
 IF revision_value=0 THEN RETURN value->>'configuredState'='DISABLED' AND value->>'effectivity'='DISABLED' AND value->'metadata'='null'::jsonb; END IF;
 RETURN calendar_switch_metadata_valid(value->'metadata') AND value->>'effectivity'=effectivity AND effectivity<>'UNKNOWN';
EXCEPTION WHEN data_exception THEN RETURN FALSE;
END $$;

CREATE TABLE calendar_switch_command_receipts (
 command_id UUID PRIMARY KEY REFERENCES calendar_command_bindings(command_id) ON DELETE RESTRICT,
 actor_id BIGINT NOT NULL REFERENCES users(id) CHECK(actor_id>0),
 operation TEXT NOT NULL CHECK(operation IN ('ENABLE','DISABLE')),
 expected_revision BIGINT NOT NULL CHECK(expected_revision>=0),
 requested_metadata JSONB NOT NULL CHECK(calendar_switch_metadata_valid(requested_metadata)),
 payload_hash TEXT NOT NULL CHECK(payload_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED','REVISION_CONFLICT','INVALID_TRANSITION','CAPABILITY_NOT_ACTIVE','REVISION_EXHAUSTED')),
 before_snapshot JSONB NOT NULL,
 after_snapshot JSONB NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL CHECK(date_trunc('second',recorded_at)=recorded_at),
 CHECK(calendar_switch_snapshot_valid(before_snapshot,recorded_at)),
 CHECK(calendar_switch_snapshot_valid(after_snapshot,recorded_at)),
 CHECK((requested_metadata->>'createdAt')::timestamptz=recorded_at),
 CHECK(payload_hash=public.notification_v1_hash('calendar-reminder-switch-v1',actor_id::text,operation,expected_revision::text,
  requested_metadata->>'owner',requested_metadata->>'reason',requested_metadata->>'expiresAt',requested_metadata->>'removalTicket',requested_metadata->>'affectedAction')),
 CHECK((outcome='REVISION_CONFLICT')=((before_snapshot->>'revision')::bigint<>expected_revision)),
 CHECK(outcome='REVISION_CONFLICT' OR (before_snapshot->>'revision')::bigint=expected_revision),
 CHECK((outcome='APPLIED' AND (after_snapshot->>'revision')::bigint=(before_snapshot->>'revision')::bigint+1
   AND after_snapshot->'metadata'=requested_metadata
   AND ((operation='ENABLE' AND after_snapshot->>'configuredState'='ENABLED' AND before_snapshot->>'effectivity' IN ('DISABLED','EXPIRED'))
     OR (operation='DISABLE' AND after_snapshot->>'configuredState'='DISABLED' AND before_snapshot->>'effectivity'='EFFECTIVE')))
  OR (outcome<>'APPLIED' AND after_snapshot=before_snapshot)),
 CHECK(outcome<>'INVALID_TRANSITION' OR (operation='ENABLE' AND before_snapshot->>'effectivity'='EFFECTIVE')
   OR (operation='DISABLE' AND before_snapshot->>'effectivity'<>'EFFECTIVE')),
 CHECK(outcome<>'CAPABILITY_NOT_ACTIVE' OR operation='ENABLE'),
 CHECK(outcome<>'REVISION_EXHAUSTED' OR (before_snapshot->>'revision')::bigint=9223372036854775807)
);

CREATE TABLE calendar_switch_audit (
 command_id UUID PRIMARY KEY REFERENCES calendar_switch_command_receipts(command_id) ON DELETE RESTRICT
);

CREATE FUNCTION calendar_consistent_switch_receipt_binding() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.calendar_command_bindings b WHERE b.command_id=NEW.command_id AND b.family='REMINDER_SWITCH'
  AND b.actor_id=NEW.actor_id AND b.event_id IS NULL AND b.payload_hash=NEW.payload_hash) THEN
  RAISE EXCEPTION 'calendar switch receipt binding mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_calendar_switch_receipt_binding_consistency AFTER INSERT ON calendar_switch_command_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION calendar_consistent_switch_receipt_binding();

CREATE FUNCTION calendar_protect_reminder_switch() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_OP='INSERT' OR NEW.id<>1 OR OLD.id<>1 OR NEW.revision<>OLD.revision+1
  OR NEW.revision<=0 OR NEW.owner IS NULL OR NEW.reason IS NULL OR NEW.created_at IS NULL OR NEW.expires_at IS NULL
  OR NEW.removal_ticket IS NULL OR NEW.affected_action<>'EMIT_IN_APP_CAMPAIGN_REMINDER' THEN
  RAISE EXCEPTION 'invalid calendar reminder switch mutation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_calendar_protect_reminder_switch BEFORE INSERT OR UPDATE OR DELETE ON calendar_reminder_switch
 FOR EACH ROW EXECUTE FUNCTION calendar_protect_reminder_switch();

CREATE FUNCTION calendar_lock_reminder_switch() RETURNS SETOF calendar_reminder_switch
LANGUAGE SQL SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT * FROM public.calendar_reminder_switch WHERE id=1 FOR UPDATE
$$;
ALTER FUNCTION calendar_lock_reminder_switch() OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION calendar_lock_reminder_switch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_lock_reminder_switch() TO storecore_runtime;

CREATE TRIGGER trg_calendar_switch_receipts_immutable BEFORE UPDATE OR DELETE ON calendar_switch_command_receipts
 FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_switch_audit_immutable BEFORE UPDATE OR DELETE ON calendar_switch_audit
 FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE FUNCTION calendar_record_switch_command(
 p_actor BIGINT,p_session UUID,p_command UUID,p_operation TEXT,p_expected BIGINT,p_requested JSONB,p_hash TEXT,
 p_outcome TEXT,p_before JSONB,p_after JSONB,p_recorded TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT public.calendar_admin_authorized(p_actor,p_session) THEN RAISE EXCEPTION 'calendar switch actor unauthorized'; END IF;
 INSERT INTO public.calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash)
 VALUES(p_command,'REMINDER_SWITCH',p_actor,NULL,p_hash);
 IF p_outcome='APPLIED' THEN
  UPDATE public.calendar_reminder_switch SET state=p_after->>'configuredState',revision=(p_after->>'revision')::bigint,
   owner=p_requested->>'owner',reason=p_requested->>'reason',created_at=(p_requested->>'createdAt')::timestamptz,
   expires_at=(p_requested->>'expiresAt')::timestamptz,removal_ticket=p_requested->>'removalTicket',affected_action=p_requested->>'affectedAction'
  WHERE id=1 AND revision=p_expected;
  IF NOT FOUND THEN RAISE EXCEPTION 'calendar switch revision changed'; END IF;
 END IF;
 INSERT INTO public.calendar_switch_command_receipts(command_id,actor_id,operation,expected_revision,requested_metadata,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
 VALUES(p_command,p_actor,p_operation,p_expected,p_requested,p_hash,p_outcome,p_before,p_after,p_recorded);
 INSERT INTO public.calendar_switch_audit(command_id) VALUES(p_command);
END $$;
ALTER FUNCTION calendar_record_switch_command(BIGINT,UUID,UUID,TEXT,BIGINT,JSONB,TEXT,TEXT,JSONB,JSONB,TIMESTAMPTZ) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION calendar_record_switch_command(BIGINT,UUID,UUID,TEXT,BIGINT,JSONB,TEXT,TEXT,JSONB,JSONB,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION calendar_record_switch_command(BIGINT,UUID,UUID,TEXT,BIGINT,JSONB,TEXT,TEXT,JSONB,JSONB,TIMESTAMPTZ) TO storecore_runtime;

REVOKE ALL ON calendar_switch_command_receipts,calendar_switch_audit FROM PUBLIC,storecore_runtime;
GRANT SELECT ON calendar_switch_command_receipts,calendar_switch_audit TO storecore_runtime;
GRANT ALL ON calendar_switch_command_receipts,calendar_switch_audit TO storecore_migrator;
