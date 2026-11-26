-- PCC-008E: inactive atomic in-app handoff. Published migrations remain unchanged.
ALTER TABLE public.calendar_reminder_occurrences DROP CONSTRAINT ck_calendar_occurrence_worker_shape;
ALTER TABLE public.calendar_reminder_occurrences ADD CONSTRAINT ck_calendar_occurrence_worker_shape CHECK((
  (state='PENDING' AND attempts=0 AND next_attempt_at=scheduled_at AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
  OR (state='PENDING' AND attempts BETWEEN 1 AND 2 AND next_attempt_at IS NOT NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class='RETRYABLE_PRE_HANDOFF')
  OR (state='LEASED' AND attempts BETWEEN 1 AND 3 AND lease_owner IS NOT NULL AND lease_started_at IS NOT NULL AND lease_until=lease_started_at+INTERVAL '60 seconds'
   AND next_attempt_at IS NULL AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
  OR (state='SKIPPED' AND attempts BETWEEN 0 AND 3 AND terminal_reason IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF')
   AND terminal_at IS NOT NULL AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL AND last_failure_class IS NULL)
  OR (state='DEAD' AND attempts BETWEEN 1 AND 3 AND terminal_at IS NOT NULL AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND ((terminal_reason='ATTEMPTS_EXHAUSTED' AND attempts=3 AND (last_failure_class IS NULL OR last_failure_class='RETRYABLE_PRE_HANDOFF'))
    OR (terminal_reason='PERMANENT_FAILURE' AND last_failure_class='PERMANENT_PRE_HANDOFF')))
  OR (state='EMITTED' AND attempts BETWEEN 1 AND 3 AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
 ) IS TRUE);

CREATE TABLE public.calendar_occurrence_handoffs (
 occurrence_id UUID PRIMARY KEY REFERENCES public.calendar_reminder_occurrences(id) ON DELETE RESTRICT,
 lease_owner UUID NOT NULL CHECK(lease_owner<>'00000000-0000-0000-0000-000000000000'),
 attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 3),
 delivery_id UUID NOT NULL UNIQUE REFERENCES public.notification_source_events(delivery_id) ON DELETE RESTRICT,
 alert_id UUID NOT NULL UNIQUE REFERENCES public.notification_alerts(id) ON DELETE RESTRICT,
 emitted_at TIMESTAMPTZ NOT NULL CHECK(isfinite(emitted_at) AND date_trunc('second',emitted_at)=emitted_at),
 CHECK(occurrence_id<>'00000000-0000-0000-0000-000000000000'),
 CHECK(delivery_id=occurrence_id),
 CHECK(alert_id<>'00000000-0000-0000-0000-000000000000')
);
CREATE TRIGGER trg_calendar_handoff_immutable BEFORE UPDATE OR DELETE ON public.calendar_occurrence_handoffs
 FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

CREATE OR REPLACE FUNCTION public.calendar_protect_occurrence_worker() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'PENDING' OR NEW.attempts<>0 OR NEW.next_attempt_at IS NOT NULL AND NEW.next_attempt_at<>NEW.scheduled_at THEN
   RAISE EXCEPTION 'invalid initial calendar occurrence worker state' USING ERRCODE='23514';
  END IF;
  NEW.next_attempt_at:=NEW.scheduled_at;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.event_id<>OLD.event_id OR NEW.approved_definition_revision<>OLD.approved_definition_revision
  OR NEW.rule_id<>OLD.rule_id OR NEW.scheduled_at<>OLD.scheduled_at THEN
  RAISE EXCEPTION 'calendar occurrence identity is immutable' USING ERRCODE='23514';
 END IF;
 IF NOT (
  (OLD.state IN ('PENDING','LEASED') AND OLD.attempts<3 AND NEW.state='LEASED' AND NEW.attempts=OLD.attempts+1
   AND ((OLD.state='PENDING' AND OLD.scheduled_at<=NEW.lease_started_at AND OLD.next_attempt_at<=NEW.lease_started_at)
    OR (OLD.state='LEASED' AND OLD.lease_until<=NEW.lease_started_at)))
  OR (OLD.state IN ('PENDING','LEASED') AND OLD.attempts<3 AND NEW.state='SKIPPED' AND NEW.attempts=OLD.attempts
   AND ((OLD.state='PENDING' AND OLD.scheduled_at<=NEW.terminal_at AND OLD.next_attempt_at<=NEW.terminal_at)
    OR (OLD.state='LEASED' AND OLD.lease_until<=NEW.terminal_at)))
  OR (OLD.state='LEASED' AND NEW.attempts=OLD.attempts AND NEW.state='SKIPPED'
   AND OLD.lease_started_at<=NEW.terminal_at AND NEW.terminal_at<OLD.lease_until)
  OR (OLD.state='LEASED' AND NEW.attempts=OLD.attempts AND NEW.state='EMITTED'
   AND EXISTS(SELECT 1 FROM public.calendar_occurrence_handoffs h WHERE h.occurrence_id=OLD.id
    AND h.lease_owner=OLD.lease_owner AND h.attempt=OLD.attempts
    AND OLD.lease_started_at<=h.emitted_at AND h.emitted_at<OLD.lease_until))
  OR (OLD.state='LEASED' AND NEW.attempts=OLD.attempts AND
   ((NEW.state='PENDING' AND OLD.attempts<3 AND NEW.last_failure_class='RETRYABLE_PRE_HANDOFF'
     AND NEW.next_attempt_at-CASE WHEN OLD.attempts=1 THEN INTERVAL '30 seconds' ELSE INTERVAL '2 minutes' END>=OLD.lease_started_at
     AND NEW.next_attempt_at-CASE WHEN OLD.attempts=1 THEN INTERVAL '30 seconds' ELSE INTERVAL '2 minutes' END<OLD.lease_until)
    OR (NEW.state='DEAD' AND NEW.terminal_at>=OLD.lease_started_at
     AND ((NEW.terminal_reason='PERMANENT_FAILURE' AND NEW.terminal_at<OLD.lease_until)
      OR (OLD.attempts=3 AND NEW.terminal_reason='ATTEMPTS_EXHAUSTED'
       AND ((NEW.last_failure_class IS NULL AND NEW.terminal_at>=OLD.lease_until)
        OR (NEW.last_failure_class='RETRYABLE_PRE_HANDOFF' AND NEW.terminal_at<OLD.lease_until)))))))
 ) THEN RAISE EXCEPTION 'invalid calendar occurrence transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- Validate final transaction state from every participating relation. Alert lifecycle
-- may advance later; its immutable identity and the source event must remain exact.
CREATE FUNCTION public.calendar_assert_handoff_consistent(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE o public.calendar_reminder_occurrences%ROWTYPE;
 h public.calendar_occurrence_handoffs%ROWTYPE; has_h BOOLEAN; fp TEXT;
BEGIN
 fp:=public.notification_v1_hash('notification-v1','CAMPAIGN','CALENDAR_REMINDER_DUE',p_id::text);
 SELECT * INTO o FROM public.calendar_reminder_occurrences WHERE id=p_id;
 SELECT * INTO h FROM public.calendar_occurrence_handoffs WHERE occurrence_id=p_id;
 has_h:=FOUND;
 IF has_h THEN
  IF o.id IS NULL OR o.state<>'EMITTED' OR o.attempts<>h.attempt OR h.delivery_id<>p_id
   OR NOT EXISTS(SELECT 1 FROM public.notification_source_events s JOIN public.notification_alerts a ON a.id=s.alert_id
    WHERE s.delivery_id=p_id AND s.alert_id=h.alert_id
     AND s.source_type='SYSTEM_CAMPAIGN' AND s.source_id=p_id::text AND s.fingerprint=fp
     AND s.category='CAMPAIGN' AND s.severity='INFO' AND s.condition_code='CALENDAR_REMINDER_DUE' AND s.episode_key=p_id::text
     AND s.event_hash=public.notification_v1_hash('notification-event-v1','SYSTEM_CAMPAIGN',p_id::text,'CAMPAIGN','INFO','CALENDAR_REMINDER_DUE',p_id::text)
     AND a.source_type='SYSTEM_CAMPAIGN' AND a.source_id=p_id::text AND a.fingerprint=fp AND a.category='CAMPAIGN' AND a.severity='INFO') THEN
   RAISE EXCEPTION 'inconsistent calendar handoff evidence' USING ERRCODE='23514';
  END IF;
 ELSE
  IF o.state='EMITTED' OR EXISTS(SELECT 1 FROM public.notification_source_events s WHERE s.delivery_id=p_id
    OR s.source_type='SYSTEM_CAMPAIGN' AND s.source_id=p_id::text AND s.fingerprint=fp)
   OR EXISTS(SELECT 1 FROM public.notification_alerts a WHERE a.source_type='SYSTEM_CAMPAIGN' AND a.source_id=p_id::text AND a.fingerprint=fp) THEN
   RAISE EXCEPTION 'calendar handoff evidence missing' USING ERRCODE='23514';
  END IF;
 END IF;
END $$;

CREATE FUNCTION public.calendar_check_handoff_consistency() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE candidate UUID;
BEGIN
 IF TG_TABLE_NAME='calendar_reminder_occurrences' THEN
  PERFORM public.calendar_assert_handoff_consistent(NEW.id);
 ELSIF TG_TABLE_NAME='calendar_occurrence_handoffs' THEN
  PERFORM public.calendar_assert_handoff_consistent(NEW.occurrence_id);
 ELSE
  IF TG_TABLE_NAME='notification_source_events' THEN
   -- No producer may counterfeit the reserved calendar condition with another identity.
   IF NEW.condition_code='CALENDAR_REMINDER_DUE' THEN
    IF NEW.source_type<>'SYSTEM_CAMPAIGN' OR NEW.source_id<>NEW.delivery_id::text
     OR NEW.episode_key<>NEW.delivery_id::text OR NEW.category<>'CAMPAIGN' OR NEW.severity<>'INFO' THEN
     RAISE EXCEPTION 'invalid calendar notification identity' USING ERRCODE='23514';
    END IF;
    PERFORM public.calendar_assert_handoff_consistent(NEW.delivery_id);
   END IF;
   IF EXISTS(SELECT 1 FROM public.calendar_reminder_occurrences WHERE id=NEW.delivery_id) THEN
    PERFORM public.calendar_assert_handoff_consistent(NEW.delivery_id);
   END IF;
  END IF;
  IF NEW.source_type='SYSTEM_CAMPAIGN' AND NEW.source_id COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
   candidate:=NEW.source_id::uuid;
   IF NEW.fingerprint=public.notification_v1_hash('notification-v1','CAMPAIGN','CALENDAR_REMINDER_DUE',candidate::text) THEN
    PERFORM public.calendar_assert_handoff_consistent(candidate);
   END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_calendar_occurrence_handoff_consistency AFTER INSERT OR UPDATE ON public.calendar_reminder_occurrences
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.calendar_check_handoff_consistency();
CREATE CONSTRAINT TRIGGER trg_calendar_handoff_consistency AFTER INSERT ON public.calendar_occurrence_handoffs
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.calendar_check_handoff_consistency();
CREATE CONSTRAINT TRIGGER trg_calendar_source_handoff_consistency AFTER INSERT ON public.notification_source_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.calendar_check_handoff_consistency();
CREATE CONSTRAINT TRIGGER trg_calendar_alert_handoff_consistency AFTER INSERT OR UPDATE ON public.notification_alerts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.calendar_check_handoff_consistency();

-- PostgreSQL requires table UPDATE privilege for SELECT ... FOR UPDATE. Keep the
-- runtime role read-only on the occurrence table and expose only this exact lock.
CREATE FUNCTION public.calendar_lock_occurrence(p_id UUID)
RETURNS SETOF public.calendar_reminder_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' THEN
  RAISE EXCEPTION 'invalid calendar occurrence lock argument' USING ERRCODE='22023';
 END IF;
 RETURN QUERY SELECT * FROM public.calendar_reminder_occurrences WHERE id=p_id FOR UPDATE;
END
$$;

CREATE FUNCTION public.calendar_skip_leased_occurrence(p_id UUID,p_owner UUID,p_attempt INTEGER,p_reason TEXT,p_handoff TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_owner IS NULL OR p_owner='00000000-0000-0000-0000-000000000000'
  OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3
  OR p_reason IS NULL OR p_reason NOT IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF')
  OR p_handoff IS NULL OR NOT isfinite(p_handoff) OR date_trunc('second',p_handoff)<>p_handoff THEN
  RAISE EXCEPTION 'invalid calendar handoff skip arguments' USING ERRCODE='22023';
 END IF;
 UPDATE public.calendar_reminder_occurrences SET state='SKIPPED',terminal_reason=p_reason,terminal_at=p_handoff,
  next_attempt_at=NULL,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,last_failure_class=NULL
  WHERE id=p_id AND state='LEASED' AND lease_owner=p_owner AND attempts=p_attempt AND lease_started_at<=p_handoff AND p_handoff<lease_until;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.calendar_complete_occurrence_handoff(p_id UUID,p_owner UUID,p_attempt INTEGER,p_alert UUID,p_handoff TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_owner IS NULL OR p_owner='00000000-0000-0000-0000-000000000000'
  OR p_alert IS NULL OR p_alert='00000000-0000-0000-0000-000000000000' OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3
  OR p_handoff IS NULL OR NOT isfinite(p_handoff) OR date_trunc('second',p_handoff)<>p_handoff THEN
  RAISE EXCEPTION 'invalid calendar handoff arguments' USING ERRCODE='22023';
 END IF;
 -- The caller already holds this row and all delivery/episode locks before its
 -- fresh decision instant. Repeat the fence in both evidence insert and update.
 IF NOT EXISTS(SELECT 1 FROM public.notification_alerts a JOIN public.notification_source_events s ON s.alert_id=a.id
  WHERE a.id=p_alert AND a.lifecycle='OPEN' AND a.revision=0 AND s.delivery_id=p_id
   AND a.source_type='SYSTEM_CAMPAIGN' AND a.source_id=p_id::text AND a.category='CAMPAIGN' AND a.severity='INFO'
   AND s.source_type='SYSTEM_CAMPAIGN' AND s.source_id=p_id::text AND s.category='CAMPAIGN' AND s.severity='INFO'
   AND s.condition_code='CALENDAR_REMINDER_DUE' AND s.episode_key=p_id::text
   AND a.fingerprint=public.notification_v1_hash('notification-v1','CAMPAIGN','CALENDAR_REMINDER_DUE',p_id::text)
   AND s.fingerprint=a.fingerprint
   AND s.event_hash=public.notification_v1_hash('notification-event-v1','SYSTEM_CAMPAIGN',p_id::text,'CAMPAIGN','INFO','CALENDAR_REMINDER_DUE',p_id::text)) THEN
  RAISE EXCEPTION 'invalid newly-created calendar notification' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.calendar_occurrence_handoffs(occurrence_id,lease_owner,attempt,delivery_id,alert_id,emitted_at)
  SELECT id,p_owner,p_attempt,id,p_alert,p_handoff FROM public.calendar_reminder_occurrences
  WHERE id=p_id AND state='LEASED' AND lease_owner=p_owner AND attempts=p_attempt AND lease_started_at<=p_handoff AND p_handoff<lease_until;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 UPDATE public.calendar_reminder_occurrences SET state='EMITTED',next_attempt_at=NULL,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,
  terminal_reason=NULL,terminal_at=NULL,last_failure_class=NULL
  WHERE id=p_id AND state='LEASED' AND lease_owner=p_owner AND attempts=p_attempt AND lease_started_at<=p_handoff AND p_handoff<lease_until;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'calendar handoff lost final fence' USING ERRCODE='23514';
 END IF;
 PERFORM public.calendar_assert_handoff_consistent(p_id);
 RETURN TRUE;
END $$;

ALTER TABLE public.calendar_occurrence_handoffs OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_assert_handoff_consistent(UUID) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_check_handoff_consistency() OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_lock_occurrence(UUID) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_skip_leased_occurrence(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_complete_occurrence_handoff(UUID,UUID,INTEGER,UUID,TIMESTAMPTZ) OWNER TO storecore_migrator;
REVOKE ALL ON public.calendar_occurrence_handoffs FROM PUBLIC,storecore_runtime;
GRANT SELECT ON public.calendar_occurrence_handoffs TO storecore_runtime;
REVOKE UPDATE,DELETE ON public.calendar_reminder_occurrences FROM PUBLIC,storecore_runtime;
REVOKE ALL ON FUNCTION public.calendar_assert_handoff_consistent(UUID),public.calendar_check_handoff_consistency(),
 public.calendar_lock_occurrence(UUID),public.calendar_skip_leased_occurrence(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ),public.calendar_complete_occurrence_handoff(UUID,UUID,INTEGER,UUID,TIMESTAMPTZ) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.calendar_lock_occurrence(UUID),public.calendar_skip_leased_occurrence(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ),
 public.calendar_complete_occurrence_handoff(UUID,UUID,INTEGER,UUID,TIMESTAMPTZ) TO storecore_runtime;

-- Existing EMITTED rows or orphan calendar notifications must never be silently
-- adopted: an upgrade with such historical corruption requires reconciliation.
DO $$ DECLARE row_id UUID; BEGIN
 FOR row_id IN SELECT id FROM public.calendar_reminder_occurrences LOOP
  PERFORM public.calendar_assert_handoff_consistent(row_id);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.notification_source_events WHERE condition_code='CALENDAR_REMINDER_DUE') THEN
  RAISE EXCEPTION 'calendar handoff notification history requires reconciliation' USING ERRCODE='23514';
 END IF;
END $$;
