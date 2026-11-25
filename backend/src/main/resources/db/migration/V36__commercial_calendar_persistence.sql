-- PCC-007A persistence only. No runner, public route, email or external effect.
CREATE FUNCTION calendar_uuid_valid(value TEXT) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND value<>'00000000-0000-0000-0000-000000000000'
$$;
CREATE FUNCTION calendar_revision_valid(value TEXT) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
BEGIN RETURN value ~ '^(0|[1-9][0-9]*)$' AND value::bigint>=0; EXCEPTION WHEN data_exception THEN RETURN FALSE; END $$;
CREATE FUNCTION calendar_time_valid(local_value TEXT,zone TEXT,chosen_offset TEXT,resolved TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog AS $$
DECLARE local_time TIMESTAMP; at_time TIMESTAMPTZ; offset_seconds INTEGER;
BEGIN
 IF local_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$'
  OR chosen_offset !~ '^(Z|[+-][0-9]{2}:[0-9]{2})$'
  OR zone IN ('ACT','AET','AGT','ART','AST','BET','BST','CAT','CNT','CST','CTT','EAT','ECT','IET','IST','JST','MIT','NET','NST','PLT','PNT','PRT','PST','SST','VST','EST','MST','HST','UTC','GMT','UT')
  OR zone LIKE 'Etc/%' OR zone LIKE 'posix/%' OR zone LIKE 'right/%'
  OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RETURN FALSE; END IF;
 local_time:=local_value::timestamp; at_time:=resolved::timestamptz;
 IF chosen_offset='Z' THEN offset_seconds:=0;
 ELSE
  IF substring(chosen_offset,5,2)::int>59 OR substring(chosen_offset,2,2)::int>18 OR (substring(chosen_offset,2,2)::int=18 AND substring(chosen_offset,5,2)::int<>0) THEN RETURN FALSE; END IF;
  offset_seconds:=(substring(chosen_offset,2,2)::int*3600+substring(chosen_offset,5,2)::int*60)*CASE WHEN left(chosen_offset,1)='-' THEN -1 ELSE 1 END;
 END IF;
 RETURN date_trunc('second',at_time)=at_time AND at_time AT TIME ZONE zone=local_time
  AND extract(epoch FROM local_time)-extract(epoch FROM at_time)=offset_seconds;
EXCEPTION WHEN data_exception THEN RETURN FALSE;
END $$;
CREATE FUNCTION calendar_definition_valid(value JSONB) RETURNS BOOLEAN LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE rule JSONB; previous TEXT := ''; offsets BIGINT[] := '{}'; fields TEXT[]; offset_value BIGINT;
BEGIN
 IF jsonb_typeof(value)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(value))<>14
  OR NOT value ?& ARRAY['revision','title','description','startLocal','endLocal','startAt','endAt','timeZone','startOffset','endOffset','audience','campaign','hash','reminders']
  OR EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE e.key NOT IN ('campaign','reminders') AND jsonb_typeof(e.value)<>'string')
  OR NOT calendar_revision_valid(value->>'revision')
  OR char_length(value->>'title') NOT BETWEEN 1 AND 120 OR value->>'title'<>btrim(value->>'title',E' \t\n\r\013\014')
  OR char_length(value->>'description')>1000 OR value->>'description'<>btrim(value->>'description',E' \t\n\r\013\014')
  OR value->>'audience'<>'INTERNAL_ALL'
  OR (value->'campaign'<>'null'::jsonb AND (jsonb_typeof(value->'campaign')<>'string' OR value->>'campaign' COLLATE "C" !~ '^[A-Z0-9_.-]{1,64}$'))
  OR NOT calendar_time_valid(value->>'startLocal',value->>'timeZone',value->>'startOffset',value->>'startAt')
  OR NOT calendar_time_valid(value->>'endLocal',value->>'timeZone',value->>'endOffset',value->>'endAt')
  OR (value->>'startAt')::timestamptz >= (value->>'endAt')::timestamptz
  OR (value->>'endAt')::timestamptz-(value->>'startAt')::timestamptz>interval '2160 hours'
  OR jsonb_typeof(value->'reminders')<>'array' OR jsonb_array_length(value->'reminders')>5 THEN RETURN FALSE; END IF;
 fields:=ARRAY['calendar-definition-v1',value->>'revision',value->>'title',value->>'description',value->>'startAt',value->>'endAt',value->>'timeZone',value->>'startOffset',value->>'endOffset',value->>'audience',CASE WHEN value->'campaign'='null'::jsonb THEN '0' ELSE '1' END,coalesce(value->>'campaign',''),jsonb_array_length(value->'reminders')::text];
 FOR rule IN SELECT * FROM jsonb_array_elements(value->'reminders') LOOP
  IF jsonb_typeof(rule)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(rule))<>3 OR NOT rule ?& ARRAY['id','channel','offsetSeconds']
   OR jsonb_typeof(rule->'id')<>'string' OR NOT calendar_uuid_valid(rule->>'id') OR rule->>'id' COLLATE "C" <= previous COLLATE "C"
   OR jsonb_typeof(rule->'channel')<>'string' OR rule->>'channel'<>'IN_APP' OR jsonb_typeof(rule->'offsetSeconds')<>'number' OR rule->>'offsetSeconds' !~ '^[0-9]+$' THEN RETURN FALSE; END IF;
  offset_value:=(rule->>'offsetSeconds')::bigint;
  IF offset_value NOT BETWEEN 300 AND 2592000 OR offset_value=ANY(offsets) THEN RETURN FALSE; END IF;
  previous:=rule->>'id'; offsets:=array_append(offsets,offset_value);
  fields:=fields || ARRAY[rule->>'id',rule->>'channel',offset_value::text];
 END LOOP;
 RETURN coalesce(value->>'hash'=notification_v1_hash(VARIADIC fields),FALSE);
EXCEPTION WHEN data_exception THEN RETURN FALSE;
END $$;
CREATE FUNCTION calendar_event_valid(value JSONB) RETURNS BOOLEAN LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE revision BIGINT; definition_revision BIGINT; approved BIGINT; lifecycle TEXT;
BEGIN
 IF jsonb_typeof(value)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(value))<>6 OR NOT value ?& ARRAY['id','revision','lifecycle','approvedDefinitionRevision','createdAt','definition']
  OR EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE e.key NOT IN ('approvedDefinitionRevision','definition') AND jsonb_typeof(e.value)<>'string')
  OR (jsonb_typeof(value->'approvedDefinitionRevision') NOT IN ('string','null'))
  OR NOT calendar_uuid_valid(value->>'id') OR NOT calendar_revision_valid(value->>'revision') OR NOT calendar_definition_valid(value->'definition')
  OR (value->'approvedDefinitionRevision'<>'null'::jsonb AND NOT calendar_revision_valid(value->>'approvedDefinitionRevision')) THEN RETURN FALSE; END IF;
 revision:=(value->>'revision')::bigint; definition_revision:=(value->'definition'->>'revision')::bigint;
 approved:=(value->>'approvedDefinitionRevision')::bigint; lifecycle:=value->>'lifecycle';
 PERFORM (value->>'createdAt')::timestamptz;
 RETURN coalesce(revision>=definition_revision AND lifecycle IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED','COMPLETED','CANCELLED')
  AND (approved IS NULL OR approved=definition_revision) AND (lifecycle<>'DRAFT' OR approved IS NULL)
  AND (lifecycle NOT IN ('SCHEDULED','ACTIVE','PAUSED','COMPLETED') OR approved IS NOT NULL),FALSE);
EXCEPTION WHEN data_exception THEN RETURN FALSE;
END $$;
CREATE TABLE calendar_events (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'),
 revision BIGINT NOT NULL CHECK(revision>=0), definition_revision BIGINT NOT NULL CHECK(definition_revision>=0),
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED','COMPLETED','CANCELLED')),
 snapshot JSONB NOT NULL CHECK(calendar_event_valid(snapshot)),
 CHECK(snapshot->>'id'=id::text AND snapshot->>'revision'=revision::text AND snapshot->>'lifecycle'=lifecycle AND snapshot->'definition'->>'revision'=definition_revision::text)
);
CREATE TABLE calendar_definitions (
 event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE RESTRICT,
 definition_revision BIGINT NOT NULL CHECK(definition_revision>=0),
 definition_hash TEXT NOT NULL CHECK(definition_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 snapshot JSONB NOT NULL CHECK(calendar_definition_valid(snapshot)),
 PRIMARY KEY(event_id,definition_revision), UNIQUE(event_id,definition_revision,definition_hash),
 CHECK(snapshot->>'revision'=definition_revision::text AND snapshot->>'hash'=definition_hash)
);
ALTER TABLE calendar_events ADD CONSTRAINT fk_calendar_current_definition FOREIGN KEY(id,definition_revision) REFERENCES calendar_definitions(event_id,definition_revision) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE calendar_reminder_rules (
 event_id UUID NOT NULL, definition_revision BIGINT NOT NULL, rule_id UUID NOT NULL CHECK(rule_id<>'00000000-0000-0000-0000-000000000000'),
 channel TEXT NOT NULL CHECK(channel='IN_APP'), offset_seconds BIGINT NOT NULL CHECK(offset_seconds BETWEEN 300 AND 2592000),
 PRIMARY KEY(event_id,definition_revision,rule_id), UNIQUE(event_id,definition_revision,offset_seconds),
 FOREIGN KEY(event_id,definition_revision) REFERENCES calendar_definitions(event_id,definition_revision) ON DELETE RESTRICT
);
CREATE TABLE calendar_preflights (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'), event_id UUID NOT NULL REFERENCES calendar_events(id),
 revision BIGINT NOT NULL CHECK(revision>=0), definition_revision BIGINT NOT NULL, definition_hash TEXT NOT NULL,
 issues JSONB NOT NULL CHECK(jsonb_typeof(issues)='array' AND issues <@ '["INVALID_LIFECYCLE","LEAD_TOO_SHORT","HORIZON_EXCEEDED","INVALID_WINDOW"]'::jsonb),
 checked_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at=checked_at+interval '10 minutes'),
 FOREIGN KEY(event_id,definition_revision,definition_hash) REFERENCES calendar_definitions(event_id,definition_revision,definition_hash)
);
CREATE TABLE calendar_command_bindings (
 command_id UUID PRIMARY KEY CHECK(command_id<>'00000000-0000-0000-0000-000000000000'),
 family TEXT NOT NULL CHECK(family IN ('EVENT','PREFLIGHT')), actor_id BIGINT REFERENCES users(id) CHECK(actor_id>0),
 event_id UUID NOT NULL REFERENCES calendar_events(id), payload_hash TEXT NOT NULL CHECK(payload_hash COLLATE "C" ~ '^[0-9a-f]{64}$')
);
CREATE TABLE calendar_preflight_requests (
 command_id UUID PRIMARY KEY REFERENCES calendar_command_bindings(command_id), actor_id BIGINT NOT NULL REFERENCES users(id),
 event_id UUID NOT NULL REFERENCES calendar_events(id), expected_revision BIGINT NOT NULL CHECK(expected_revision>=0),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED','REVISION_CONFLICT','INVALID_TRANSITION')),
 preflight_id UUID REFERENCES calendar_preflights(id), event_snapshot JSONB NOT NULL CHECK(calendar_event_valid(event_snapshot)),
 CHECK((outcome='APPLIED')=(preflight_id IS NOT NULL)), CHECK(event_snapshot->>'id'=event_id::text)
);
CREATE TABLE calendar_command_receipts (
 command_id UUID PRIMARY KEY REFERENCES calendar_command_bindings(command_id), event_id UUID NOT NULL REFERENCES calendar_events(id),
 actor_id BIGINT REFERENCES users(id) CHECK(actor_id>0),
 operation TEXT NOT NULL CHECK(operation IN ('CREATE','EDIT','SCHEDULE','PAUSE','RESUME','CANCEL','SYSTEM_ACTIVATE','SYSTEM_COMPLETE')),
 expected_revision BIGINT CHECK(expected_revision>=0), reason TEXT CHECK(char_length(reason) BETWEEN 1 AND 500 AND reason=btrim(reason,E' \t\n\r\013\014')),
 requested_definition_hash TEXT CHECK(requested_definition_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 preflight_id UUID CHECK(preflight_id<>'00000000-0000-0000-0000-000000000000'),
 payload_hash TEXT NOT NULL CHECK(payload_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED','REVISION_CONFLICT','INVALID_TRANSITION','INVALID_DEFINITION','PREFLIGHT_REQUIRED','PREFLIGHT_EXPIRED','PREFLIGHT_STALE','REVISION_EXHAUSTED')),
 before_snapshot JSONB CHECK(calendar_event_valid(before_snapshot)), after_snapshot JSONB NOT NULL CHECK(calendar_event_valid(after_snapshot)), recorded_at TIMESTAMPTZ NOT NULL,
 CHECK(after_snapshot->>'id'=event_id::text AND (before_snapshot IS NULL OR before_snapshot->>'id'=event_id::text)),
 CHECK((operation IN ('SYSTEM_ACTIVATE','SYSTEM_COMPLETE'))=(actor_id IS NULL)),
 CHECK((operation='EDIT')=(requested_definition_hash IS NOT NULL)),
 CHECK(operation='SCHEDULE' OR preflight_id IS NULL),
 CHECK((operation='CREATE' AND expected_revision IS NULL AND reason IS NULL AND before_snapshot IS NULL AND outcome='APPLIED' AND after_snapshot->>'revision'='0' AND after_snapshot->>'lifecycle'='DRAFT')
  OR (operation<>'CREATE' AND expected_revision IS NOT NULL AND before_snapshot IS NOT NULL AND reason IS NOT NULL)),
 CHECK(payload_hash=CASE WHEN operation='CREATE'
  THEN public.notification_v1_hash('calendar-create-v1',actor_id::text,after_snapshot->'definition'->>'hash')
  ELSE public.notification_v1_hash('calendar-command-v1',coalesce(actor_id::text,'SYSTEM'),event_id::text,operation,expected_revision::text,reason,
   coalesce(requested_definition_hash,''),coalesce(preflight_id::text,'')) END),
 CHECK(operation='CREATE' OR (outcome='APPLIED' AND (after_snapshot->>'revision')::bigint-1=(before_snapshot->>'revision')::bigint) OR (outcome<>'APPLIED' AND after_snapshot=before_snapshot))
);
ALTER TABLE calendar_command_receipts ADD CONSTRAINT ck_calendar_receipt_revision_result CHECK(operation='CREATE'
 OR (outcome='REVISION_CONFLICT' AND (before_snapshot->>'revision')::bigint<>expected_revision)
 OR (outcome<>'REVISION_CONFLICT' AND (before_snapshot->>'revision')::bigint=expected_revision));
ALTER TABLE calendar_command_receipts ADD CONSTRAINT ck_calendar_receipt_rejection_semantics CHECK(
 (outcome NOT IN ('PREFLIGHT_REQUIRED','PREFLIGHT_EXPIRED','PREFLIGHT_STALE') OR operation='SCHEDULE')
 AND (outcome<>'INVALID_DEFINITION' OR operation IN ('EDIT','SCHEDULE'))
 AND (outcome<>'REVISION_EXHAUSTED' OR (before_snapshot->>'revision')::bigint=9223372036854775807
  OR (operation='EDIT' AND (before_snapshot->'definition'->>'revision')::bigint=9223372036854775807))
);
ALTER TABLE calendar_command_receipts ADD CONSTRAINT ck_calendar_receipt_applied_transition CHECK(operation='CREATE' OR outcome<>'APPLIED' OR (
 before_snapshot->>'createdAt'=after_snapshot->>'createdAt' AND (
  (operation='EDIT' AND before_snapshot->>'lifecycle'='DRAFT' AND after_snapshot->>'lifecycle'='DRAFT'
   AND (after_snapshot->'definition'->>'revision')::bigint-1=(before_snapshot->'definition'->>'revision')::bigint)
  OR (operation<>'EDIT' AND before_snapshot->'definition'=after_snapshot->'definition' AND (
    (operation='SCHEDULE' AND before_snapshot->>'lifecycle'='DRAFT' AND after_snapshot->>'lifecycle'='SCHEDULED'
     AND after_snapshot->>'approvedDefinitionRevision'=before_snapshot->'definition'->>'revision')
    OR (before_snapshot->'approvedDefinitionRevision'=after_snapshot->'approvedDefinitionRevision' AND (
      (operation='PAUSE' AND before_snapshot->>'lifecycle' IN ('SCHEDULED','ACTIVE') AND after_snapshot->>'lifecycle'='PAUSED')
      OR (operation='RESUME' AND before_snapshot->>'lifecycle'='PAUSED' AND recorded_at<(before_snapshot->'definition'->>'endAt')::timestamptz
       AND after_snapshot->>'lifecycle'=CASE WHEN recorded_at<(before_snapshot->'definition'->>'startAt')::timestamptz THEN 'SCHEDULED' ELSE 'ACTIVE' END)
      OR (operation='CANCEL' AND before_snapshot->>'lifecycle' IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED') AND after_snapshot->>'lifecycle'='CANCELLED')
      OR (operation='SYSTEM_ACTIVATE' AND before_snapshot->>'lifecycle'='SCHEDULED' AND after_snapshot->>'lifecycle'='ACTIVE'
       AND recorded_at>=(before_snapshot->'definition'->>'startAt')::timestamptz AND recorded_at<(before_snapshot->'definition'->>'endAt')::timestamptz)
      OR (operation='SYSTEM_COMPLETE' AND before_snapshot->>'lifecycle' IN ('SCHEDULED','ACTIVE','PAUSED') AND after_snapshot->>'lifecycle'='COMPLETED'
       AND recorded_at>=(before_snapshot->'definition'->>'endAt')::timestamptz)
    )))
  ))
 ));
CREATE TABLE calendar_audit (command_id UUID PRIMARY KEY REFERENCES calendar_command_receipts(command_id) ON DELETE RESTRICT);
CREATE FUNCTION calendar_consistent_receipt_binding() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.calendar_command_bindings b WHERE b.command_id=NEW.command_id AND b.family='EVENT'
  AND b.actor_id IS NOT DISTINCT FROM NEW.actor_id AND b.event_id=NEW.event_id AND b.payload_hash=NEW.payload_hash) THEN
  RAISE EXCEPTION 'calendar receipt binding mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_calendar_receipt_binding_consistency AFTER INSERT ON calendar_command_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION calendar_consistent_receipt_binding();
CREATE TABLE calendar_reminder_occurrences (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'), event_id UUID NOT NULL, approved_definition_revision BIGINT NOT NULL,
 rule_id UUID NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL, state TEXT NOT NULL CHECK(state IN ('PENDING','LEASED','EMITTED','SKIPPED','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), lease_owner UUID, lease_until TIMESTAMPTZ,
 UNIQUE(event_id,approved_definition_revision,rule_id,scheduled_at),
 FOREIGN KEY(event_id,approved_definition_revision,rule_id) REFERENCES calendar_reminder_rules(event_id,definition_revision,rule_id),
 CHECK((state='LEASED')=(lease_owner IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((lease_owner IS NULL)=(lease_until IS NULL)), CHECK(lease_owner IS NULL OR lease_owner<>'00000000-0000-0000-0000-000000000000'),
 CHECK(state<>'LEASED' OR attempts>0)
);
CREATE TABLE calendar_reminder_switch (
 id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL CHECK(state IN ('DISABLED','ENABLED')), revision BIGINT NOT NULL CHECK(revision>=0)
);
INSERT INTO calendar_reminder_switch VALUES(1,'DISABLED',0);
CREATE FUNCTION calendar_admin_authorized(actor BIGINT,live_session UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN PERFORM public.capability_assert_live_admin_session(actor,live_session); RETURN TRUE;
EXCEPTION WHEN raise_exception THEN RETURN FALSE; END $$;
ALTER FUNCTION calendar_admin_authorized(BIGINT,UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION calendar_admin_authorized(BIGINT,UUID) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION calendar_admin_authorized(BIGINT,UUID) TO storecore_runtime;
-- Row locking normally requires UPDATE privilege; expose only locking, never mutation, on immutable snapshots.
CREATE FUNCTION calendar_lock_preflight(requested UUID) RETURNS SETOF calendar_preflights
LANGUAGE SQL SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT * FROM public.calendar_preflights WHERE id=requested FOR UPDATE
$$;
ALTER FUNCTION calendar_lock_preflight(UUID) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION calendar_lock_preflight(UUID) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION calendar_lock_preflight(UUID) TO storecore_runtime;

CREATE FUNCTION calendar_protect_event() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.lifecycle<>'DRAFT' OR NEW.revision<>0 OR NEW.definition_revision<>0 THEN RAISE EXCEPTION 'calendar must begin as draft revision zero' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'calendar event is durable' USING ERRCODE='23514'; END IF;
 IF OLD.revision=9223372036854775807 OR NEW.revision-1<>OLD.revision OR NEW.id<>OLD.id OR NEW.snapshot->>'createdAt'<>OLD.snapshot->>'createdAt'
  OR NOT ((OLD.lifecycle='DRAFT' AND NEW.lifecycle='DRAFT' AND OLD.definition_revision<9223372036854775807 AND NEW.definition_revision-1=OLD.definition_revision)
   OR (NEW.definition_revision=OLD.definition_revision AND NEW.snapshot->'definition'=OLD.snapshot->'definition'
    AND ((OLD.lifecycle='DRAFT' AND NEW.lifecycle IN ('SCHEDULED','CANCELLED'))
      OR (OLD.lifecycle='SCHEDULED' AND NEW.lifecycle IN ('ACTIVE','PAUSED','COMPLETED','CANCELLED'))
      OR (OLD.lifecycle='ACTIVE' AND NEW.lifecycle IN ('PAUSED','COMPLETED','CANCELLED'))
      OR (OLD.lifecycle='PAUSED' AND NEW.lifecycle IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED'))))) THEN
  RAISE EXCEPTION 'invalid calendar mutation' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_calendar_event BEFORE INSERT OR UPDATE OR DELETE ON calendar_events FOR EACH ROW EXECUTE FUNCTION calendar_protect_event();
CREATE FUNCTION calendar_consistent_definition() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target_event UUID;
BEGIN
 target_event:=NEW.id;
 IF EXISTS(SELECT 1 FROM calendar_events e JOIN calendar_definitions d ON d.event_id=e.id AND d.definition_revision=e.definition_revision WHERE e.id=target_event AND e.snapshot->'definition'<>d.snapshot) THEN
  RAISE EXCEPTION 'calendar definition projection mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_calendar_definition_consistency AFTER INSERT OR UPDATE ON calendar_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION calendar_consistent_definition();
CREATE FUNCTION calendar_consistent_rules() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE expected JSONB; actual JSONB;
BEGIN
 SELECT snapshot->'reminders' INTO expected FROM calendar_definitions WHERE event_id=NEW.event_id AND definition_revision=NEW.definition_revision;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',rule_id::text,'channel',channel,'offsetSeconds',offset_seconds) ORDER BY rule_id::text),'[]'::jsonb) INTO actual FROM calendar_reminder_rules WHERE event_id=NEW.event_id AND definition_revision=NEW.definition_revision;
 IF expected IS DISTINCT FROM actual THEN RAISE EXCEPTION 'calendar reminder definition mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_calendar_rules_definition AFTER INSERT ON calendar_definitions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION calendar_consistent_rules();
CREATE CONSTRAINT TRIGGER trg_calendar_rules_rows AFTER INSERT ON calendar_reminder_rules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION calendar_consistent_rules();
CREATE TRIGGER trg_calendar_definitions_immutable BEFORE UPDATE OR DELETE ON calendar_definitions FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_rules_immutable BEFORE UPDATE OR DELETE ON calendar_reminder_rules FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_preflights_immutable BEFORE UPDATE OR DELETE ON calendar_preflights FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_receipts_immutable BEFORE UPDATE OR DELETE ON calendar_command_receipts FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_audit_immutable BEFORE UPDATE OR DELETE ON calendar_audit FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_bindings_immutable BEFORE UPDATE OR DELETE ON calendar_command_bindings FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_calendar_preflight_requests_immutable BEFORE UPDATE OR DELETE ON calendar_preflight_requests FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE FUNCTION calendar_occurrence_insert_valid() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.state<>'PENDING' OR NEW.attempts<>0 OR NOT EXISTS(
  SELECT 1 FROM public.calendar_events e JOIN public.calendar_definitions d ON d.event_id=e.id AND d.definition_revision=e.definition_revision
   JOIN public.calendar_reminder_rules r ON r.event_id=d.event_id AND r.definition_revision=d.definition_revision
  WHERE e.id=NEW.event_id AND e.lifecycle='SCHEDULED' AND e.snapshot->>'approvedDefinitionRevision'=NEW.approved_definition_revision::text
   AND r.rule_id=NEW.rule_id AND NEW.scheduled_at=(d.snapshot->>'startAt')::timestamptz-make_interval(secs=>r.offset_seconds::double precision)
 ) THEN RAISE EXCEPTION 'invalid initial calendar occurrence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_calendar_occurrence_initial BEFORE INSERT ON calendar_reminder_occurrences FOR EACH ROW EXECUTE FUNCTION calendar_occurrence_insert_valid();
-- No occurrence claims or switch mutations are granted in this disabled-runner slice.
REVOKE ALL ON calendar_events,calendar_definitions,calendar_reminder_rules,calendar_preflights,calendar_command_receipts,calendar_audit,calendar_reminder_occurrences,calendar_reminder_switch,calendar_command_bindings,calendar_preflight_requests FROM PUBLIC,storecore_runtime;
GRANT SELECT,INSERT ON calendar_events,calendar_definitions,calendar_reminder_rules,calendar_preflights,calendar_command_receipts,calendar_audit,calendar_reminder_occurrences,calendar_command_bindings,calendar_preflight_requests TO storecore_runtime;
GRANT UPDATE(revision,definition_revision,lifecycle,snapshot) ON calendar_events TO storecore_runtime;

GRANT SELECT ON calendar_reminder_switch TO storecore_runtime;
GRANT ALL ON calendar_events,calendar_definitions,calendar_reminder_rules,calendar_preflights,calendar_command_receipts,calendar_audit,calendar_reminder_occurrences,calendar_reminder_switch,calendar_command_bindings,calendar_preflight_requests TO storecore_migrator;
