-- A reminder capability or kill change after switch enable must stop every new
-- claim and every not-yet-emitted handoff without inventing a switch state.
CREATE FUNCTION public.calendar_reminder_runtime_admission() RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 config_row RECORD;
 action_row RECORD;
 kill_row RECORD;
 live_kills INTEGER:=0;
 invalid_kills INTEGER:=0;
BEGIN
 SELECT action_kind,allows_write,allowed_when_paused,customer_allowed INTO action_row FROM public.capability_actions
  WHERE module_code='COMMERCIAL_CALENDAR' AND action_code='EMIT_IN_APP_CAMPAIGN_REMINDER' FOR SHARE;
 IF NOT FOUND OR action_row.action_kind<>'PUBLISH' OR action_row.allows_write IS NOT TRUE
  OR action_row.allowed_when_paused IS NOT FALSE OR action_row.customer_allowed IS NOT FALSE THEN RETURN 'UNKNOWN'; END IF;

 SELECT state,config,config_schema_version INTO config_row FROM public.module_configurations
  WHERE module_code='COMMERCIAL_CALENDAR' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' FOR SHARE;
 IF NOT FOUND OR config_row.config_schema_version<>1 OR config_row.config<>'{}'::jsonb THEN RETURN 'UNKNOWN'; END IF;

 -- Capability administration takes this action row FOR UPDATE before creating,
 -- removing or replacing a kill. Taking it first closes the empty-set insert
 -- race: a new kill can neither pass this admission nor appear before commit.
 FOR kill_row IN SELECT expires_at,owner,reason FROM public.capability_kill_switches
  WHERE module_code='COMMERCIAL_CALENDAR' AND action_code='EMIT_IN_APP_CAMPAIGN_REMINDER'
   AND scope_kind='INSTALLATION' AND scope_key='DEFAULT' AND active FOR SHARE
 LOOP
  IF kill_row.expires_at IS NULL OR NOT isfinite(kill_row.expires_at)
   OR kill_row.owner IS NULL OR btrim(kill_row.owner)=''
   OR kill_row.reason IS NULL OR btrim(kill_row.reason)='' THEN
   invalid_kills:=invalid_kills+1;
  ELSIF kill_row.expires_at>clock_timestamp() THEN live_kills:=live_kills+1;
  END IF;
 END LOOP;
 IF invalid_kills<>0 OR live_kills>1 THEN RETURN 'UNKNOWN'; END IF;
 IF live_kills=1 OR config_row.state IN ('DISABLED','READ_ONLY','PAUSED','ERROR') THEN RETURN 'BLOCKED'; END IF;
 IF config_row.state<>'ACTIVE' THEN RETURN 'UNKNOWN'; END IF;
 RETURN 'ADMITTED';
END $$;

ALTER FUNCTION public.calendar_reminder_runtime_admission() OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.calendar_reminder_runtime_admission() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.calendar_reminder_runtime_admission() TO storecore_runtime;

ALTER TABLE public.calendar_reminder_occurrences DROP CONSTRAINT ck_calendar_occurrence_worker_shape;
ALTER TABLE public.calendar_reminder_occurrences ADD CONSTRAINT ck_calendar_occurrence_worker_shape CHECK((
 (state='PENDING' AND attempts=0 AND next_attempt_at=scheduled_at AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
  AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
 OR (state='PENDING' AND attempts BETWEEN 1 AND 2 AND next_attempt_at IS NOT NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
  AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class='RETRYABLE_PRE_HANDOFF')
 OR (state='LEASED' AND attempts BETWEEN 1 AND 3 AND lease_owner IS NOT NULL AND lease_started_at IS NOT NULL AND lease_until=lease_started_at+INTERVAL '60 seconds'
  AND next_attempt_at IS NULL AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
 OR (state='SKIPPED' AND attempts BETWEEN 0 AND 3 AND terminal_reason IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF','CAPABILITY_BLOCKED')
  AND terminal_at IS NOT NULL AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL AND last_failure_class IS NULL)
 OR (state='DEAD' AND attempts BETWEEN 1 AND 3 AND terminal_at IS NOT NULL AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
  AND ((terminal_reason='ATTEMPTS_EXHAUSTED' AND attempts=3 AND (last_failure_class IS NULL OR last_failure_class='RETRYABLE_PRE_HANDOFF'))
   OR (terminal_reason='PERMANENT_FAILURE' AND last_failure_class='PERMANENT_PRE_HANDOFF')))
 OR (state='EMITTED' AND attempts BETWEEN 1 AND 3 AND next_attempt_at IS NULL AND lease_owner IS NULL AND lease_started_at IS NULL AND lease_until IS NULL
  AND terminal_reason IS NULL AND terminal_at IS NULL AND last_failure_class IS NULL)
) IS TRUE);

CREATE OR REPLACE FUNCTION public.calendar_skip_occurrence(p_id UUID,p_state TEXT,p_attempts INTEGER,p_prior_owner UUID,p_reason TEXT,p_observed TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_state IS NULL OR p_state NOT IN ('PENDING','LEASED')
  OR p_attempts IS NULL OR p_attempts NOT BETWEEN 0 AND 2 OR p_state='LEASED' AND p_attempts=0
  OR (p_state='LEASED')<>(p_prior_owner IS NOT NULL) OR p_prior_owner='00000000-0000-0000-0000-000000000000'
  OR p_reason IS NULL OR p_reason NOT IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF','CAPABILITY_BLOCKED')
  OR p_observed IS NULL OR NOT isfinite(p_observed) OR date_trunc('second',p_observed)<>p_observed THEN
  RAISE EXCEPTION 'invalid calendar occurrence skip arguments' USING ERRCODE='22023';
 END IF;
 UPDATE public.calendar_reminder_occurrences SET state='SKIPPED',terminal_reason=p_reason,terminal_at=p_observed,
  next_attempt_at=NULL,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,last_failure_class=NULL
  WHERE id=p_id AND state=p_state AND attempts=p_attempts AND lease_owner IS NOT DISTINCT FROM p_prior_owner
   AND ((state='PENDING' AND scheduled_at<=p_observed AND next_attempt_at<=p_observed) OR (state='LEASED' AND lease_until<=p_observed));
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.calendar_skip_leased_occurrence(p_id UUID,p_owner UUID,p_attempt INTEGER,p_reason TEXT,p_handoff TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_id IS NULL OR p_id='00000000-0000-0000-0000-000000000000' OR p_owner IS NULL OR p_owner='00000000-0000-0000-0000-000000000000'
  OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3
  OR p_reason IS NULL OR p_reason NOT IN ('LATE','SWITCH_DISABLED','SWITCH_EXPIRED','ENABLE_CUTOFF','EVENT_INELIGIBLE','DEFINITION_CHANGED','RESUME_CUTOFF','CAPABILITY_BLOCKED')
  OR p_handoff IS NULL OR NOT isfinite(p_handoff) OR date_trunc('second',p_handoff)<>p_handoff THEN
  RAISE EXCEPTION 'invalid calendar handoff skip arguments' USING ERRCODE='22023';
 END IF;
 UPDATE public.calendar_reminder_occurrences SET state='SKIPPED',terminal_reason=p_reason,terminal_at=p_handoff,
  next_attempt_at=NULL,lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,last_failure_class=NULL
  WHERE id=p_id AND state='LEASED' AND lease_owner=p_owner AND attempts=p_attempt AND lease_started_at<=p_handoff AND p_handoff<lease_until;
 RETURN FOUND;
END $$;
