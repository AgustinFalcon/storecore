-- PCC-008D installs an inactive, fenced occurrence writer. No runner or notification effect.
ALTER TABLE public.calendar_reminder_occurrences
 ADD COLUMN next_attempt_at TIMESTAMPTZ,
 ADD COLUMN lease_started_at TIMESTAMPTZ,
 ADD COLUMN terminal_reason TEXT,
 ADD COLUMN terminal_at TIMESTAMPTZ,
 ADD COLUMN last_failure_class TEXT;

-- Earlier cuts never installed a claim writer. Refuse to invent terminal history.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.calendar_reminder_occurrences WHERE state NOT IN ('PENDING','LEASED','EMITTED')) THEN
  RAISE EXCEPTION 'calendar occurrence requires explicit terminal-history reconciliation';
 END IF;
END $$;
UPDATE public.calendar_reminder_occurrences SET next_attempt_at=scheduled_at WHERE state='PENDING' AND attempts=0;
UPDATE public.calendar_reminder_occurrences SET lease_started_at=lease_until-INTERVAL '60 seconds' WHERE state='LEASED';

ALTER TABLE public.calendar_reminder_occurrences
 ADD CONSTRAINT ck_calendar_occurrence_worker_shape CHECK((
  (state='PENDING' AND attempts=0 AND next_attempt_at=scheduled_at AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
  OR (state='PENDING' AND attempts BETWEEN 1 AND 2 AND next_attempt_at IS NOT NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class='RETRYABLE_PRE_HANDOFF')
  OR (state='LEASED' AND attempts BETWEEN 1 AND 3 AND lease_owner IS NOT NULL AND lease_started_at IS NOT NULL AND lease_until=lease_started_at+INTERVAL '60 seconds'
   AND next_attempt_at IS NULL AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
  OR (state='SKIPPED' AND attempts BETWEEN 0 AND 2 AND terminal_reason IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF')
   AND terminal_at IS NOT NULL AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL AND last_failure_class IS NULL)
  OR (state='DEAD' AND attempts BETWEEN 1 AND 3 AND terminal_at IS NOT NULL AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND ((terminal_reason='ATTEMPTS_EXHAUSTED' AND attempts=3 AND (last_failure_class IS NULL OR last_failure_class='RETRYABLE_PRE_HANDOFF'))
    OR (terminal_reason='PERMANENT_FAILURE' AND last_failure_class='PERMANENT_PRE_HANDOFF')))
  OR (state='EMITTED' AND attempts BETWEEN 1 AND 3 AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
   AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
 ) IS TRUE),
 ADD CONSTRAINT ck_calendar_occurrence_worker_instants CHECK(
  isfinite(scheduled_at) AND date_trunc('second',scheduled_at)=scheduled_at
  AND (next_attempt_at IS NULL OR isfinite(next_attempt_at) AND date_trunc('second',next_attempt_at)=next_attempt_at)
  AND (lease_started_at IS NULL OR isfinite(lease_started_at) AND date_trunc('second',lease_started_at)=lease_started_at)
  AND (lease_until IS NULL OR isfinite(lease_until) AND date_trunc('second',lease_until)=lease_until)
  AND (terminal_at IS NULL OR isfinite(terminal_at) AND date_trunc('second',terminal_at)=terminal_at));

CREATE FUNCTION public.calendar_protect_occurrence_worker() RETURNS TRIGGER
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
CREATE TRIGGER trg_calendar_occurrence_worker BEFORE INSERT OR UPDATE OR DELETE ON public.calendar_reminder_occurrences
 FOR EACH ROW EXECUTE FUNCTION public.calendar_protect_occurrence_worker();

CREATE INDEX ix_calendar_occurrence_claim ON public.calendar_reminder_occurrences(scheduled_at,id) WHERE state IN ('PENDING','LEASED');

CREATE FUNCTION public.calendar_lock_due_occurrences(p_observed TIMESTAMPTZ,p_size INTEGER)
RETURNS SETOF public.calendar_reminder_occurrences
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_observed IS NULL OR NOT isfinite(p_observed) OR date_trunc('second',p_observed)<>p_observed OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'invalid calendar occurrence claim arguments' USING ERRCODE='22023';
 END IF;
 RETURN QUERY SELECT o.* FROM public.calendar_reminder_occurrences o
  WHERE o.state='PENDING' AND o.scheduled_at<=p_observed AND o.next_attempt_at<=p_observed
   OR o.state='LEASED' AND o.lease_until<=p_observed
  ORDER BY o.scheduled_at,o.id LIMIT p_size FOR UPDATE SKIP LOCKED;
END $$;

CREATE FUNCTION public.calendar_lease_occurrence(p_id UUID,p_state TEXT,p_attempts INTEGER,p_owner UUID,p_observed TIMESTAMPTZ,p_granted TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_state IS NULL OR p_state NOT IN ('PENDING','LEASED')
  OR p_attempts IS NULL OR p_attempts NOT BETWEEN 0 AND 2 OR p_state='LEASED' AND p_attempts=0
  OR p_owner IS NULL OR p_owner='00000000-0000-0000-0000-000000000000'
  OR p_observed IS NULL OR NOT isfinite(p_observed) OR date_trunc('second',p_observed)<>p_observed
  OR p_granted IS NULL OR NOT isfinite(p_granted) OR date_trunc('second',p_granted)<>p_granted OR p_granted<p_observed THEN
  RAISE EXCEPTION 'invalid calendar occurrence lease arguments' USING ERRCODE='22023';
 END IF;
 UPDATE public.calendar_reminder_occurrences SET state='LEASED',attempts=p_attempts+1,lease_owner=p_owner,
  lease_started_at=p_granted,lease_until=p_granted+INTERVAL '60 seconds',next_attempt_at=NULL,terminal_reason=NULL,terminal_at=NULL,last_failure_class=NULL
  WHERE id=p_id AND state=p_state AND attempts=p_attempts
   AND ((state='PENDING' AND scheduled_at<=p_observed AND next_attempt_at<=p_observed) OR (state='LEASED' AND lease_until<=p_observed));
 RETURN FOUND;
END $$;

CREATE FUNCTION public.calendar_skip_occurrence(p_id UUID,p_state TEXT,p_attempts INTEGER,p_prior_owner UUID,p_reason TEXT,p_observed TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_state IS NULL OR p_state NOT IN ('PENDING','LEASED')
  OR p_attempts IS NULL OR p_attempts NOT BETWEEN 0 AND 2 OR p_state='LEASED' AND p_attempts=0
  OR (p_state='LEASED')<>(p_prior_owner IS NOT NULL) OR p_prior_owner='00000000-0000-0000-0000-000000000000'
  OR p_reason IS NULL OR p_reason NOT IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF')
  OR p_observed IS NULL OR NOT isfinite(p_observed) OR date_trunc('second',p_observed)<>p_observed THEN
  RAISE EXCEPTION 'invalid calendar occurrence skip arguments' USING ERRCODE='22023';
 END IF;
 UPDATE public.calendar_reminder_occurrences SET state='SKIPPED',terminal_reason=p_reason,terminal_at=p_observed,
  next_attempt_at=NULL,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,last_failure_class=NULL
  WHERE id=p_id AND state=p_state AND attempts=p_attempts AND lease_owner IS NOT DISTINCT FROM p_prior_owner
   AND ((state='PENDING' AND scheduled_at<=p_observed AND next_attempt_at<=p_observed) OR (state='LEASED' AND lease_until<=p_observed));
 RETURN FOUND;
END $$;

CREATE FUNCTION public.calendar_exhaust_occurrence(p_id UUID,p_owner UUID,p_attempt INTEGER,p_observed TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_owner IS NULL OR p_owner='00000000-0000-0000-0000-000000000000'
  OR p_attempt IS NULL OR p_attempt<>3 OR p_observed IS NULL OR NOT isfinite(p_observed) OR date_trunc('second',p_observed)<>p_observed THEN
  RAISE EXCEPTION 'invalid calendar occurrence exhaustion arguments' USING ERRCODE='22023';
 END IF;
 UPDATE public.calendar_reminder_occurrences SET state='DEAD',terminal_reason='ATTEMPTS_EXHAUSTED',terminal_at=p_observed,
  next_attempt_at=NULL,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,last_failure_class=NULL
  WHERE id=p_id AND state='LEASED' AND attempts=p_attempt AND lease_owner=p_owner AND lease_until<=p_observed;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.calendar_settle_occurrence_failure(p_id UUID,p_owner UUID,p_attempt INTEGER,p_failure TEXT,p_settled TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE found_row public.calendar_reminder_occurrences%ROWTYPE; result_state TEXT;
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_owner IS NULL OR p_owner='00000000-0000-0000-0000-000000000000'
  OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3 OR p_failure IS NULL OR p_failure NOT IN ('RETRYABLE_PRE_HANDOFF','PERMANENT_PRE_HANDOFF')
  OR p_settled IS NULL OR NOT isfinite(p_settled) OR date_trunc('second',p_settled)<>p_settled THEN
  RAISE EXCEPTION 'invalid calendar occurrence settlement arguments' USING ERRCODE='22023';
 END IF;
 SELECT * INTO found_row FROM public.calendar_reminder_occurrences WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN 'MISSING'; END IF;
 IF found_row.state<>'LEASED' OR found_row.lease_owner IS DISTINCT FROM p_owner OR found_row.attempts<>p_attempt
  OR p_settled<found_row.lease_started_at OR p_settled>=found_row.lease_until THEN RETURN 'LOST_FENCE'; END IF;
 result_state:=CASE WHEN p_failure='RETRYABLE_PRE_HANDOFF' AND p_attempt<3 THEN 'PENDING' ELSE 'DEAD' END;
 UPDATE public.calendar_reminder_occurrences SET state=result_state,
  next_attempt_at=CASE WHEN result_state='PENDING' THEN p_settled+CASE WHEN p_attempt=1 THEN INTERVAL '30 seconds' ELSE INTERVAL '2 minutes' END END,
  terminal_reason=CASE WHEN result_state='DEAD' THEN CASE WHEN p_failure='PERMANENT_PRE_HANDOFF' THEN 'PERMANENT_FAILURE' ELSE 'ATTEMPTS_EXHAUSTED' END END,
  terminal_at=CASE WHEN result_state='DEAD' THEN p_settled END,last_failure_class=p_failure,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL
  WHERE id=p_id AND state='LEASED' AND lease_owner=p_owner AND attempts=p_attempt AND lease_started_at<=p_settled AND p_settled<lease_until;
 IF NOT FOUND THEN RETURN 'LOST_FENCE'; END IF;
 RETURN CASE WHEN result_state='PENDING' THEN 'RETRY_SCHEDULED' ELSE 'DEAD' END;
END $$;

ALTER FUNCTION public.calendar_lock_due_occurrences(TIMESTAMPTZ,INTEGER) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_lease_occurrence(UUID,TEXT,INTEGER,UUID,TIMESTAMPTZ,TIMESTAMPTZ) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_skip_occurrence(UUID,TEXT,INTEGER,UUID,TEXT,TIMESTAMPTZ) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_exhaust_occurrence(UUID,UUID,INTEGER,TIMESTAMPTZ) OWNER TO storecore_migrator;
ALTER FUNCTION public.calendar_settle_occurrence_failure(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.calendar_lock_due_occurrences(TIMESTAMPTZ,INTEGER),public.calendar_lease_occurrence(UUID,TEXT,INTEGER,UUID,TIMESTAMPTZ,TIMESTAMPTZ),
 public.calendar_skip_occurrence(UUID,TEXT,INTEGER,UUID,TEXT,TIMESTAMPTZ),public.calendar_exhaust_occurrence(UUID,UUID,INTEGER,TIMESTAMPTZ),
 public.calendar_settle_occurrence_failure(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.calendar_lock_due_occurrences(TIMESTAMPTZ,INTEGER),public.calendar_lease_occurrence(UUID,TEXT,INTEGER,UUID,TIMESTAMPTZ,TIMESTAMPTZ),
 public.calendar_skip_occurrence(UUID,TEXT,INTEGER,UUID,TEXT,TIMESTAMPTZ),public.calendar_exhaust_occurrence(UUID,UUID,INTEGER,TIMESTAMPTZ),
 public.calendar_settle_occurrence_failure(UUID,UUID,INTEGER,TEXT,TIMESTAMPTZ) TO storecore_runtime;
REVOKE UPDATE,DELETE ON public.calendar_reminder_occurrences FROM PUBLIC,storecore_runtime;
