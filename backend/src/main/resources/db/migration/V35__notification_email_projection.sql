-- Forward-only, notification-specific email projection. Identity outboxes are untouched.
CREATE TABLE notification_command_bindings (
 command_id UUID PRIMARY KEY CHECK(command_id<>'00000000-0000-0000-0000-000000000000'),
 family TEXT NOT NULL CHECK(family IN ('LIFECYCLE','EMAIL_PREFERENCE')),
 actor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT CHECK(actor_id>0),
 aggregate_ref TEXT NOT NULL,
 operation TEXT NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 CHECK((family='LIFECYCLE' AND aggregate_ref COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND operation IN ('ACKNOWLEDGE','RESOLVE','REOPEN'))
  OR (family='EMAIL_PREFERENCE' AND aggregate_ref COLLATE "C" ~ '^[1-9][0-9]{0,18}$' AND operation IN ('ENABLE','DISABLE')))
);
INSERT INTO notification_command_bindings SELECT command_id,'LIFECYCLE',actor_id,alert_id::text,operation,payload_hash FROM notification_command_receipts;
CREATE TRIGGER trg_notification_binding_immutable BEFORE UPDATE OR DELETE ON notification_command_bindings FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE FUNCTION notification_email_filters_valid(categories TEXT[],severities TEXT[],enabled BOOLEAN) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN enabled THEN cardinality(categories) BETWEEN 1 AND 5 AND cardinality(severities) BETWEEN 1 AND 2
  AND categories<@ARRAY['STOCK','ORDER','PAYMENT','RETURN','INTEGRATION']::text[] AND severities<@ARRAY['WARNING','CRITICAL']::text[]
  AND categories=ARRAY(SELECT DISTINCT x FROM unnest(categories) x ORDER BY x)
  AND severities=ARRAY(SELECT DISTINCT x FROM unnest(severities) x ORDER BY x)
 ELSE categories=ARRAY[]::text[] AND severities=ARRAY[]::text[] END
$$;
CREATE FUNCTION notification_email_snapshot_valid(value JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE categories_value TEXT[]; severities_value TEXT[]; state_value TEXT; revision_value TEXT; version_value TEXT;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
 IF ARRAY(SELECT k FROM jsonb_object_keys(value) k ORDER BY k) IS DISTINCT FROM ARRAY['categories','emailDigest','emailVersion','revision','severities','state']::text[] THEN RETURN FALSE; END IF;
 IF jsonb_typeof(value->'state') IS DISTINCT FROM 'string' OR jsonb_typeof(value->'revision') IS DISTINCT FROM 'string'
  OR jsonb_typeof(value->'categories') IS DISTINCT FROM 'array' OR jsonb_typeof(value->'severities') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements((value->'categories')||(value->'severities')) e WHERE jsonb_typeof(e)<>'string') THEN RETURN FALSE; END IF;
 categories_value:=ARRAY(SELECT jsonb_array_elements_text(value->'categories'));
 severities_value:=ARRAY(SELECT jsonb_array_elements_text(value->'severities'));
 state_value:=value->>'state'; revision_value:=value->>'revision';
 IF state_value NOT IN ('DISABLED','ENABLED','INVALIDATED') OR NOT coalesce(revision_value COLLATE "C" ~ '^(0|[1-9][0-9]*)$' AND revision_value::bigint>=0,FALSE)
  OR NOT coalesce(public.notification_email_filters_valid(categories_value,severities_value,state_value='ENABLED'),FALSE) THEN RETURN FALSE; END IF;
 IF state_value='ENABLED' THEN
  version_value:=value->>'emailVersion';
  RETURN coalesce(jsonb_typeof(value->'emailVersion')='string' AND version_value COLLATE "C" ~ '^[1-9][0-9]*$' AND version_value::bigint>0
   AND jsonb_typeof(value->'emailDigest')='string' AND value->>'emailDigest' COLLATE "C" ~ '^[0-9a-f]{64}$',FALSE);
 END IF;
 RETURN value->'emailVersion'='null'::jsonb AND value->'emailDigest'='null'::jsonb;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN FALSE;
END $$;
CREATE TABLE notification_email_preferences (
 user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT CHECK(user_id>0),
 state TEXT NOT NULL CHECK(state IN ('DISABLED','ENABLED','INVALIDATED')),
 revision BIGINT NOT NULL CHECK(revision>=0),
 categories TEXT[] NOT NULL DEFAULT '{}',severities TEXT[] NOT NULL DEFAULT '{}',
 email_version BIGINT CHECK(email_version>0),email_digest TEXT CHECK(email_digest COLLATE "C" ~ '^[0-9a-f]{64}$'),
 consented_at TIMESTAMPTZ,
 CHECK(notification_email_filters_valid(categories,severities,state='ENABLED')),
 CHECK((state='ENABLED' AND email_version IS NOT NULL AND email_digest IS NOT NULL AND consented_at IS NOT NULL)
  OR (state<>'ENABLED' AND email_version IS NULL AND email_digest IS NULL AND consented_at IS NULL))
);
CREATE TABLE notification_email_preference_receipts (
 command_id UUID PRIMARY KEY REFERENCES notification_command_bindings(command_id) ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT CHECK(user_id>0),
 operation TEXT NOT NULL CHECK(operation IN ('ENABLE','DISABLE')),
 expected_revision BIGINT NOT NULL CHECK(expected_revision>=0),
 categories TEXT[] NOT NULL,severities TEXT[] NOT NULL,
 payload_hash TEXT NOT NULL CHECK(payload_hash COLLATE "C" ~ '^[0-9a-f]{64}$'),
 outcome TEXT NOT NULL CHECK(outcome IN ('APPLIED','REVISION_CONFLICT','EMAIL_UNVERIFIED','REVISION_EXHAUSTED')),
 result JSONB NOT NULL CHECK(notification_email_snapshot_valid(result)),recorded_at TIMESTAMPTZ NOT NULL,
 CHECK(notification_email_filters_valid(categories,severities,operation='ENABLE')),
 CHECK(result ?& ARRAY['state','revision','categories','severities','emailVersion','emailDigest']),
 CHECK(result->>'state' IN ('DISABLED','ENABLED','INVALIDATED')),
 CHECK(result->>'revision' COLLATE "C" ~ '^(0|[1-9][0-9]*)$' AND (result->>'revision')::bigint>=0),
 CHECK(payload_hash=notification_v1_hash(VARIADIC ARRAY['notification-email-preference-command-v1',operation,user_id::text,expected_revision::text,cardinality(categories)::text]||categories||ARRAY[cardinality(severities)::text]||severities)),
 CHECK(CASE outcome WHEN 'APPLIED' THEN CASE WHEN expected_revision=9223372036854775807 THEN FALSE ELSE
  (result->>'revision')::bigint=expected_revision+1 AND result->>'state'=CASE operation WHEN 'ENABLE' THEN 'ENABLED' ELSE 'DISABLED' END
  AND result->'categories'=to_jsonb(categories) AND result->'severities'=to_jsonb(severities) END
  WHEN 'REVISION_CONFLICT' THEN (result->>'revision')::bigint<>expected_revision
  WHEN 'EMAIL_UNVERIFIED' THEN operation='ENABLE' AND (result->>'revision')::bigint=expected_revision
  WHEN 'REVISION_EXHAUSTED' THEN expected_revision=9223372036854775807 AND (result->>'revision')::bigint=expected_revision ELSE FALSE END)
);
CREATE TABLE notification_email_preference_audit (
 id UUID PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 command_id UUID UNIQUE REFERENCES notification_email_preference_receipts(command_id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('COMMAND','INVALIDATED')),revision BIGINT NOT NULL CHECK(revision>=0),
 reason TEXT NOT NULL CHECK(reason IN ('COMMAND','EMAIL_CHANGED','ROLE_LOST','INACTIVE')),recorded_at TIMESTAMPTZ NOT NULL,
 CHECK((kind='COMMAND' AND command_id IS NOT NULL AND reason='COMMAND') OR (kind='INVALIDATED' AND command_id IS NULL AND reason<>'COMMAND'))
);
CREATE TABLE notification_email_outbox (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'),
 alert_id UUID NOT NULL REFERENCES notification_alerts(id) ON DELETE RESTRICT,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT CHECK(user_id>0),
 preference_revision BIGINT NOT NULL CHECK(preference_revision>0),
 email_version BIGINT NOT NULL CHECK(email_version>0),email_digest TEXT NOT NULL CHECK(email_digest COLLATE "C" ~ '^[0-9a-f]{64}$'),
 template TEXT NOT NULL CHECK(template='OPERATIONAL_ALERT_V1'),created_at TIMESTAMPTZ NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
 UNIQUE(alert_id,user_id),CHECK(expires_at=created_at+interval '24 hours')
);
CREATE TABLE notification_email_delivery (
 intent_id UUID PRIMARY KEY REFERENCES notification_email_outbox(id) ON DELETE RESTRICT,
 state TEXT NOT NULL CHECK(state IN ('PENDING','LEASED','RETRY','SENT','UNCERTAIN','DEAD','CANCELLED')),
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 5),lease_owner UUID,lease_until TIMESTAMPTZ,handoff_started_at TIMESTAMPTZ,
 available_at TIMESTAMPTZ NOT NULL,terminal_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('NONE','EXPIRED','INVALIDATED','LEASE_LOST','PRE_DATA_FAILURE','PERMANENT_FAILURE','UNCERTAIN')),
 CHECK((state='LEASED' AND lease_owner IS NOT NULL AND lease_owner<>'00000000-0000-0000-0000-000000000000' AND lease_until IS NOT NULL AND attempts>0)
  OR (state<>'LEASED' AND lease_owner IS NULL AND lease_until IS NULL)),
 CHECK((state IN ('SENT','UNCERTAIN','DEAD','CANCELLED'))=(terminal_at IS NOT NULL)),
 CHECK(state NOT IN ('SENT','UNCERTAIN') OR handoff_started_at IS NOT NULL),
 CHECK(state<>'PENDING' OR (attempts=0 AND handoff_started_at IS NULL)),
 CHECK(state<>'RETRY' OR (attempts BETWEEN 1 AND 4 AND handoff_started_at IS NULL))
);
CREATE INDEX ix_notification_email_available ON notification_email_delivery(available_at,intent_id) WHERE state IN ('PENDING','RETRY','LEASED');
CREATE TABLE notification_email_delivery_evidence (
 id UUID PRIMARY KEY,intent_id UUID NOT NULL REFERENCES notification_email_outbox(id) ON DELETE RESTRICT,
 state TEXT NOT NULL CHECK(state IN ('PENDING','LEASED','RETRY','SENT','UNCERTAIN','DEAD','CANCELLED')),
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 5),handoff_started_at TIMESTAMPTZ,
 reason TEXT NOT NULL CHECK(reason IN ('NONE','EXPIRED','INVALIDATED','LEASE_LOST','PRE_DATA_FAILURE','PERMANENT_FAILURE','UNCERTAIN')),
 recorded_at TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION notification_register_command() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE family_value TEXT; aggregate_value TEXT; actor_value BIGINT; stored public.notification_command_bindings%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='notification_command_receipts' THEN family_value:='LIFECYCLE';aggregate_value:=NEW.alert_id::text;actor_value:=NEW.actor_id;
 ELSE family_value:='EMAIL_PREFERENCE';aggregate_value:=NEW.user_id::text;actor_value:=NEW.user_id; END IF;
 INSERT INTO public.notification_command_bindings VALUES(NEW.command_id,family_value,actor_value,aggregate_value,NEW.operation,NEW.payload_hash) ON CONFLICT DO NOTHING;
 SELECT * INTO stored FROM public.notification_command_bindings WHERE command_id=NEW.command_id;
 IF (stored.family,stored.actor_id,stored.aggregate_ref,stored.operation,stored.payload_hash) IS DISTINCT FROM (family_value,actor_value,aggregate_value,NEW.operation,NEW.payload_hash)
 THEN RAISE EXCEPTION 'notification command key already bound' USING ERRCODE='23505'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_register_lifecycle BEFORE INSERT ON notification_command_receipts FOR EACH ROW EXECUTE FUNCTION notification_register_command();
ALTER TABLE notification_command_receipts ADD CONSTRAINT fk_notification_command_binding FOREIGN KEY(command_id) REFERENCES notification_command_bindings(command_id) ON DELETE RESTRICT;
CREATE TRIGGER trg_notification_register_preference BEFORE INSERT ON notification_email_preference_receipts FOR EACH ROW EXECUTE FUNCTION notification_register_command();

CREATE FUNCTION notification_email_account(subject BIGINT) RETURNS TABLE(email_version BIGINT,email_digest TEXT,eligible BOOLEAN,verified BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT u.email_version,encode(sha256(convert_to(u.email,'UTF8')),'hex'),
  u.active AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code IN ('ADMIN','OPERATOR')),
  EXISTS(SELECT 1 FROM public.identity_email_verification_evidence e WHERE e.realm='USER' AND e.user_id=u.id AND e.email_version=u.email_version AND e.email_digest=encode(sha256(convert_to(u.email,'UTF8')),'hex'))
 FROM public.users u WHERE u.id=subject
$$;

CREATE FUNCTION notification_email_protect_preference() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'notification email preference cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'DISABLED' OR NEW.revision<>0 THEN RAISE EXCEPTION 'invalid initial email preference' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.user_id<>OLD.user_id OR NOT ((OLD.revision<9223372036854775807 AND NEW.revision=OLD.revision+1)
   OR (OLD.revision=9223372036854775807 AND NEW.revision=OLD.revision AND NEW.state='INVALIDATED'))
  THEN RAISE EXCEPTION 'invalid email preference revision' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_email_preference_guard BEFORE INSERT OR UPDATE OR DELETE ON notification_email_preferences FOR EACH ROW EXECUTE FUNCTION notification_email_protect_preference();

CREATE FUNCTION notification_email_protect_delivery() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'notification delivery cannot be deleted' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'PENDING' OR NEW.attempts<>0 THEN RAISE EXCEPTION 'invalid initial notification delivery' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.intent_id<>OLD.intent_id OR OLD.state IN ('SENT','UNCERTAIN','DEAD','CANCELLED') THEN RAISE EXCEPTION 'terminal notification delivery is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state IN ('PENDING','RETRY') AND NEW.state='LEASED' THEN
   IF NEW.attempts<>OLD.attempts+1 OR NEW.handoff_started_at IS NOT NULL THEN RAISE EXCEPTION 'invalid notification lease' USING ERRCODE='23514'; END IF;
  ELSIF OLD.state IN ('PENDING','RETRY') AND NEW.state='CANCELLED' THEN
   IF NEW.attempts<>OLD.attempts THEN RAISE EXCEPTION 'invalid notification cancellation' USING ERRCODE='23514'; END IF;
  ELSIF OLD.state='LEASED' AND NEW.state='LEASED' THEN
   IF OLD.handoff_started_at IS NOT NULL OR NEW.handoff_started_at IS NULL OR (NEW.lease_owner,NEW.lease_until,NEW.attempts) IS DISTINCT FROM (OLD.lease_owner,OLD.lease_until,OLD.attempts)
   THEN RAISE EXCEPTION 'invalid notification handoff' USING ERRCODE='23514'; END IF;
  ELSIF OLD.state='LEASED' AND NEW.state IN ('SENT','RETRY','UNCERTAIN','DEAD','CANCELLED') THEN
   IF NEW.attempts<>OLD.attempts OR (NEW.state='CANCELLED' AND OLD.handoff_started_at IS NOT NULL)
    OR (NEW.state IN ('SENT','UNCERTAIN') AND OLD.handoff_started_at IS NULL)
   THEN RAISE EXCEPTION 'invalid notification settlement' USING ERRCODE='23514'; END IF;
   IF (NEW.state='RETRY' AND NOT ((OLD.handoff_started_at IS NULL AND NEW.reason='LEASE_LOST') OR (OLD.handoff_started_at IS NOT NULL AND NEW.reason='PRE_DATA_FAILURE')))
    OR (OLD.handoff_started_at IS NOT NULL AND NEW.state='DEAD' AND NEW.reason NOT IN ('PRE_DATA_FAILURE','PERMANENT_FAILURE'))
    OR (NEW.state='SENT' AND NEW.reason<>'NONE') OR (NEW.state='UNCERTAIN' AND NEW.reason<>'UNCERTAIN')
   THEN RAISE EXCEPTION 'notification retry requires pre-DATA proof' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'invalid notification delivery transition' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_email_delivery_guard BEFORE INSERT OR UPDATE OR DELETE ON notification_email_delivery FOR EACH ROW EXECUTE FUNCTION notification_email_protect_delivery();
CREATE FUNCTION notification_email_record_delivery() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 INSERT INTO public.notification_email_delivery_evidence VALUES(gen_random_uuid(),NEW.intent_id,NEW.state,NEW.attempts,NEW.handoff_started_at,NEW.reason,clock_timestamp()); RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_email_delivery_evidence AFTER INSERT OR UPDATE ON notification_email_delivery FOR EACH ROW EXECUTE FUNCTION notification_email_record_delivery();

CREATE FUNCTION notification_email_cancel_obsolete() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 UPDATE public.notification_email_delivery d SET state='CANCELLED',lease_owner=NULL,lease_until=NULL,terminal_at=clock_timestamp(),updated_at=clock_timestamp(),reason='INVALIDATED'
 FROM public.notification_email_outbox o WHERE o.id=d.intent_id AND o.user_id=NEW.user_id AND (NEW.state<>'ENABLED' OR o.preference_revision<>NEW.revision)
 AND (d.state IN ('PENDING','RETRY') OR (d.state='LEASED' AND d.handoff_started_at IS NULL));
 RETURN NEW;
END $$;
CREATE TRIGGER trg_notification_email_cancel_obsolete AFTER UPDATE ON notification_email_preferences FOR EACH ROW EXECUTE FUNCTION notification_email_cancel_obsolete();

CREATE FUNCTION notification_email_invalidate(subject BIGINT,cause TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE new_revision BIGINT;
BEGIN
 UPDATE public.notification_email_preferences SET state='INVALIDATED',revision=CASE WHEN revision<9223372036854775807 THEN revision+1 ELSE revision END,
  categories='{}',severities='{}',email_version=NULL,email_digest=NULL,consented_at=NULL WHERE user_id=subject AND state='ENABLED' RETURNING revision INTO new_revision;
 IF FOUND THEN INSERT INTO public.notification_email_preference_audit VALUES(gen_random_uuid(),subject,NULL,'INVALIDATED',new_revision,cause,clock_timestamp()); END IF;
END $$;
CREATE FUNCTION notification_email_identity_changed() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE subject BIGINT;
BEGIN
 IF TG_TABLE_NAME='users' THEN
  IF NEW.email_version<>OLD.email_version THEN PERFORM public.notification_email_invalidate(NEW.id,'EMAIL_CHANGED');
  ELSIF NOT NEW.active THEN PERFORM public.notification_email_invalidate(NEW.id,'INACTIVE'); END IF;
 ELSIF TG_TABLE_NAME='user_roles' THEN
  subject:=OLD.user_id;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=subject AND r.code IN ('ADMIN','OPERATOR'))
  THEN PERFORM public.notification_email_invalidate(subject,'ROLE_LOST'); END IF;
 ELSE
  FOR subject IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role_id=NEW.id ORDER BY ur.user_id LOOP
   IF NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=subject AND r.code IN ('ADMIN','OPERATOR'))
   THEN PERFORM public.notification_email_invalidate(subject,'ROLE_LOST'); END IF;
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER trg_notification_email_user_changed AFTER UPDATE OF email,active ON users FOR EACH ROW EXECUTE FUNCTION notification_email_identity_changed();
CREATE TRIGGER trg_notification_email_role_removed AFTER DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION notification_email_identity_changed();
CREATE TRIGGER trg_notification_email_role_replaced AFTER UPDATE OF user_id,role_id ON user_roles FOR EACH ROW EXECUTE FUNCTION notification_email_identity_changed();
CREATE TRIGGER trg_notification_email_role_changed AFTER UPDATE OF code ON roles FOR EACH ROW EXECUTE FUNCTION notification_email_identity_changed();

CREATE FUNCTION notification_email_begin_handoff(intent UUID,owner UUID,attempt INTEGER,deadline TIMESTAMPTZ,checked_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o public.notification_email_outbox%ROWTYPE; d public.notification_email_delivery%ROWTYPE; p public.notification_email_preferences%ROWTYPE; u public.users%ROWTYPE; valid_role BOOLEAN; verified BOOLEAN;
BEGIN
 IF intent IS NULL OR owner IS NULL OR owner='00000000-0000-0000-0000-000000000000' OR attempt IS NULL OR attempt NOT BETWEEN 1 AND 5 OR deadline IS NULL OR checked_at IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO o FROM public.notification_email_outbox WHERE id=intent; IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(((-o.user_id)>>32)::integer,(((-o.user_id)<<32)>>32)::integer);
 SELECT * INTO u FROM public.users WHERE id=o.user_id FOR UPDATE;
 SELECT * INTO p FROM public.notification_email_preferences WHERE user_id=o.user_id FOR SHARE;
 PERFORM 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=o.user_id AND r.code IN ('ADMIN','OPERATOR') FOR SHARE OF ur,r; valid_role:=FOUND;
 SELECT EXISTS(SELECT 1 FROM public.identity_email_verification_evidence e WHERE e.realm='USER' AND e.user_id=o.user_id AND e.email_version=u.email_version AND e.email_digest=o.email_digest) INTO verified;
 SELECT * INTO d FROM public.notification_email_delivery WHERE intent_id=intent FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF d.state<>'LEASED' OR d.lease_owner IS DISTINCT FROM owner OR d.attempts<>attempt OR d.lease_until IS DISTINCT FROM deadline OR d.handoff_started_at IS NOT NULL
  OR d.lease_until<=GREATEST(clock_timestamp(),checked_at) THEN RETURN NULL; END IF;
 IF NOT coalesce(u.active AND valid_role AND verified AND p.state='ENABLED' AND p.revision=o.preference_revision AND p.email_version=o.email_version AND p.email_digest=o.email_digest
  AND u.email_version=o.email_version AND encode(sha256(convert_to(u.email,'UTF8')),'hex')=o.email_digest AND o.expires_at>GREATEST(clock_timestamp(),checked_at),FALSE) THEN
  UPDATE public.notification_email_delivery SET state='CANCELLED',lease_owner=NULL,lease_until=NULL,terminal_at=clock_timestamp(),updated_at=clock_timestamp(),reason='INVALIDATED' WHERE intent_id=intent;
  RETURN NULL;
 END IF;
 UPDATE public.notification_email_delivery SET handoff_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE intent_id=intent;
 RETURN u.email;
END $$;

CREATE TRIGGER trg_notification_email_receipt_immutable BEFORE UPDATE OR DELETE ON notification_email_preference_receipts FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_notification_email_audit_immutable BEFORE UPDATE OR DELETE ON notification_email_preference_audit FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_notification_email_outbox_immutable BEFORE UPDATE OR DELETE ON notification_email_outbox FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_notification_email_evidence_immutable BEFORE UPDATE OR DELETE ON notification_email_delivery_evidence FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

ALTER FUNCTION notification_register_command() OWNER TO storecore_migrator;
ALTER FUNCTION notification_email_account(BIGINT) OWNER TO storecore_migrator;
ALTER FUNCTION notification_email_record_delivery() OWNER TO storecore_migrator;
ALTER FUNCTION notification_email_cancel_obsolete() OWNER TO storecore_migrator;
ALTER FUNCTION notification_email_invalidate(BIGINT,TEXT) OWNER TO storecore_migrator;
ALTER FUNCTION notification_email_identity_changed() OWNER TO storecore_migrator;
ALTER FUNCTION notification_email_begin_handoff(UUID,UUID,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION notification_register_command(),notification_email_account(BIGINT),notification_email_record_delivery(),notification_email_cancel_obsolete(),notification_email_invalidate(BIGINT,TEXT),notification_email_identity_changed(),notification_email_begin_handoff(UUID,UUID,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION notification_email_account(BIGINT),notification_email_begin_handoff(UUID,UUID,INTEGER,TIMESTAMPTZ,TIMESTAMPTZ) TO storecore_runtime;
REVOKE ALL ON notification_command_bindings,notification_email_preferences,notification_email_preference_receipts,notification_email_preference_audit,notification_email_outbox,notification_email_delivery,notification_email_delivery_evidence FROM PUBLIC,storecore_runtime;
GRANT SELECT ON notification_command_bindings,notification_email_delivery_evidence TO storecore_runtime;
GRANT SELECT,INSERT ON notification_email_preferences,notification_email_preference_receipts,notification_email_preference_audit,notification_email_outbox,notification_email_delivery TO storecore_runtime;
GRANT UPDATE(state,revision,categories,severities,email_version,email_digest,consented_at) ON notification_email_preferences TO storecore_runtime;
GRANT UPDATE(state,attempts,lease_owner,lease_until,handoff_started_at,available_at,terminal_at,updated_at,reason) ON notification_email_delivery TO storecore_runtime;
GRANT ALL ON notification_command_bindings,notification_email_preferences,notification_email_preference_receipts,notification_email_preference_audit,notification_email_outbox,notification_email_delivery,notification_email_delivery_evidence TO storecore_migrator;
