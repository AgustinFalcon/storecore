-- Unactivated quote writer. It is owner-only until the later HTTP/capability gate.
ALTER TABLE loyalty_command_bindings DROP CONSTRAINT loyalty_command_bindings_check;
ALTER TABLE loyalty_command_bindings DROP CONSTRAINT loyalty_command_bindings_aggregate_type_check;
ALTER TABLE loyalty_command_bindings DROP CONSTRAINT loyalty_command_bindings_aggregate_ref_check;
ALTER TABLE loyalty_command_bindings DROP CONSTRAINT loyalty_command_bindings_aggregate_ref_check1;
ALTER TABLE loyalty_command_bindings ADD CONSTRAINT ck_loyalty_command_aggregate CHECK(
 (aggregate_type='WALLET' AND aggregate_ref ~ '^[1-9][0-9]{0,18}$' AND aggregate_ref::numeric<=9223372036854775807)
 OR (aggregate_type='RESERVATION' AND aggregate_ref ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     AND aggregate_ref<>'00000000-0000-0000-0000-000000000000')
);
ALTER TABLE loyalty_command_bindings ADD CONSTRAINT ck_loyalty_command_authority CHECK(
 (realm='USER' AND operation='ADMIN_ADJUSTMENT' AND aggregate_type='WALLET')
 OR (realm='SYSTEM' AND operation='MATERIALIZE_EXPIRY' AND aggregate_type='WALLET')
 OR (realm='CUSTOMER' AND operation='CREATE_RESERVATION' AND aggregate_type='WALLET')
 OR (realm='CUSTOMER' AND operation='CANCEL_RESERVATION' AND aggregate_type='RESERVATION')
 OR (realm='SYSTEM' AND operation='EXPIRE_RESERVATION' AND aggregate_type='RESERVATION')
);

CREATE OR REPLACE FUNCTION loyalty_validate_evidence() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='loyalty_ledger' THEN
  IF NOT EXISTS(SELECT 1 FROM public.loyalty_source_applications s WHERE s.id=NEW.source_application_id AND s.wallet_id=NEW.wallet_id AND s.accepted_at<=NEW.recorded_at
   AND ((NEW.movement='EARN' AND s.source_type='PAYMENT_ACCREDITATION') OR (NEW.movement='MANUAL_ADJUSTMENT' AND s.source_type='ADMIN_ADJUSTMENT') OR (NEW.movement='EXPIRE' AND s.source_type='EXPIRY'))) THEN
   RAISE EXCEPTION 'loyalty movement source mismatch' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='loyalty_lots' THEN
  IF NOT EXISTS(SELECT 1 FROM public.loyalty_ledger e JOIN public.loyalty_source_applications s ON s.id=e.source_application_id
   WHERE e.id=NEW.ledger_id AND e.wallet_id=NEW.wallet_id AND s.accepted_at=NEW.accepted_at
    AND (e.movement='EARN' OR (e.movement='MANUAL_ADJUSTMENT' AND e.direction='CREDIT'))) THEN
   RAISE EXCEPTION 'loyalty lot requires positive issuance evidence' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='loyalty_allocation_events' THEN
  IF NOT EXISTS(SELECT 1 FROM public.loyalty_ledger e JOIN public.loyalty_lots l ON l.id=NEW.lot_id AND l.wallet_id=e.wallet_id
   WHERE e.id=NEW.ledger_id AND e.wallet_id=NEW.wallet_id AND NEW.recorded_at=e.recorded_at AND NEW.points<=e.points AND NEW.points<=l.issued
    AND ((NEW.kind='ISSUE' AND l.ledger_id=e.id AND NEW.points=l.issued)
     OR (NEW.kind='REVERSE' AND e.movement='MANUAL_ADJUSTMENT' AND e.direction='DEBIT')
     OR (NEW.kind='EXPIRE' AND e.movement='EXPIRE' AND NEW.recorded_at>=l.expires_at))) THEN
   RAISE EXCEPTION 'loyalty allocation evidence mismatch' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='loyalty_audit' THEN
  IF NOT EXISTS(SELECT 1 FROM public.loyalty_command_bindings b JOIN public.loyalty_command_receipts r ON r.command_id=b.command_id
   WHERE b.command_id=NEW.command_id AND r.recorded_at=NEW.recorded_at AND (
    (b.aggregate_type='WALLET' AND b.aggregate_ref=NEW.wallet_id::text)
    OR (b.aggregate_type='RESERVATION' AND EXISTS(SELECT 1 FROM public.loyalty_reservations x
        WHERE x.id::text=b.aggregate_ref AND x.wallet_id=NEW.wallet_id))
   )) THEN RAISE EXCEPTION 'loyalty audit command mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE loyalty_reservation_command_results (
 command_id UUID PRIMARY KEY REFERENCES loyalty_command_receipts(command_id) ON DELETE RESTRICT,
 reservation_id UUID NULL REFERENCES loyalty_reservations(id) ON DELETE RESTRICT
);
CREATE TRIGGER trg_loyalty_immutable BEFORE UPDATE OR DELETE ON loyalty_reservation_command_results
 FOR EACH ROW EXECUTE FUNCTION loyalty_reject_evidence_mutation();
CREATE TRIGGER trg_loyalty_immutable_truncate BEFORE TRUNCATE ON loyalty_reservation_command_results
 FOR EACH STATEMENT EXECUTE FUNCTION loyalty_reject_evidence_mutation();

CREATE FUNCTION loyalty_assert_live_customer_session(p_actor BIGINT,p_session UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.identity_sessions s WHERE s.id=p_session AND s.subject_kind='CUSTOMER'
  AND s.customer_id=p_actor AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp()
  AND s.absolute_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.customers c WHERE c.id=p_actor AND c.active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.identity_sessions s WHERE s.id=p_session AND s.subject_kind='CUSTOMER'
  AND s.customer_id=p_actor AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp()
  AND s.absolute_expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION loyalty_wallet_snapshot(p_wallet BIGINT,p_at TIMESTAMPTZ) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object(
  'schemaVersion',1,'walletId',w.id::text,'customerId',w.customer_id::text,'ownerRealm',w.owner_realm,
  'revision',w.revision::text,'policyVersion',w.policy_version,
  'at',to_char(p_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'lots',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',l.id::text,'walletId',l.wallet_id::text,
    'acceptedAt',to_char(l.accepted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'expiresAt',to_char(l.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'policyVersion',l.policy_version,'issued',p.issued::text,'free',p.free::text,'held',p.held::text,
    'redeemed',p.redeemed::text,'expired',p.expired::text,'reversed',p.reversed::text
   ) ORDER BY l.accepted_at,l.id)
   FROM public.loyalty_lots l JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id AND p.wallet_id=l.wallet_id
   WHERE l.wallet_id=w.id),'[]'::jsonb))
 FROM public.loyalty_wallets w WHERE w.id=p_wallet
$$;

CREATE FUNCTION loyalty_quote_reservation(
 p_actor BIGINT,p_session UUID,p_command UUID,p_reservation UUID,p_wallet BIGINT,p_cart_revision BIGINT,
 p_expected_wallet_revision BIGINT,p_points BIGINT,p_eligible_minor BIGINT,p_discount_present BOOLEAN,p_request_hash VARCHAR
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 v_binding RECORD; v_outcome TEXT; v_recorded TIMESTAMPTZ; v_before JSONB; v_after JSONB;
 v_wallet_revision BIGINT; v_customer BIGINT; v_policy TEXT; v_available NUMERIC; v_cap BIGINT;
 v_revision_matches BOOLEAN;
 v_expiry_total NUMERIC; v_source UUID; v_ledger BIGINT; v_expiry_command UUID; v_expiry_before JSONB; v_expiry_after JSONB;
 v_row RECORD; v_remaining BIGINT; v_take BIGINT; v_ordinal INTEGER:=0; v_result UUID;
BEGIN
 IF p_command='00000000-0000-0000-0000-000000000000'::uuid OR p_reservation='00000000-0000-0000-0000-000000000000'::uuid
  OR p_wallet<=0 OR p_cart_revision<0 OR p_expected_wallet_revision<0 OR p_points<=0 OR p_eligible_minor<=0
  OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'INVALID_LOYALTY_QUOTE' USING ERRCODE='22023';
 END IF;
 PERFORM public.loyalty_assert_live_customer_session(p_actor,p_session);

 SELECT * INTO v_binding FROM public.loyalty_command_bindings b WHERE b.command_id=p_command;
 IF FOUND THEN
  IF v_binding.realm<>'CUSTOMER' OR v_binding.actor_id<>p_actor OR v_binding.operation<>'CREATE_RESERVATION'
   OR v_binding.aggregate_type<>'WALLET' OR v_binding.aggregate_ref<>p_wallet::text OR v_binding.request_hash<>p_request_hash THEN
   RAISE EXCEPTION 'LOYALTY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  SELECT r.outcome,x.reservation_id INTO STRICT v_outcome,v_result
   FROM public.loyalty_command_receipts r JOIN public.loyalty_reservation_command_results x ON x.command_id=r.command_id
   WHERE r.command_id=p_command;
  RETURN jsonb_build_object('outcome',v_outcome,'reservationId',v_result);
 END IF;

 SELECT w.revision,w.customer_id,w.policy_version INTO v_wallet_revision,v_customer,v_policy
  FROM public.loyalty_wallets w WHERE w.id=p_wallet AND w.customer_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_WALLET_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 FOR v_row IN SELECT l.id FROM public.loyalty_lots l JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id
  WHERE l.wallet_id=p_wallet ORDER BY l.accepted_at,l.id FOR UPDATE OF l,p LOOP NULL; END LOOP;
 v_recorded:=date_trunc('second',clock_timestamp());
 v_before:=public.loyalty_wallet_snapshot(p_wallet,v_recorded);
 v_revision_matches:=v_wallet_revision=p_expected_wallet_revision;

 SELECT coalesce(sum(p.free::numeric),0) INTO v_expiry_total
  FROM public.loyalty_lots l JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id
  WHERE l.wallet_id=p_wallet AND l.expires_at<=v_recorded AND p.free>0;
 IF v_expiry_total>0 THEN
  IF v_wallet_revision=9223372036854775807 THEN
   v_outcome:=CASE WHEN v_revision_matches THEN 'REVISION_EXHAUSTED' ELSE 'REVISION_CONFLICT' END;
  ELSE
   v_expiry_before:=v_before; v_source:=gen_random_uuid(); v_expiry_command:=gen_random_uuid();
   INSERT INTO public.loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at)
    VALUES(v_source,p_wallet,'EXPIRY','reservation-quote-expiry:'||p_command::text,v_policy,v_expiry_total::bigint,v_recorded);
   INSERT INTO public.loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at)
    VALUES(p_wallet,v_source,'EXPIRE',NULL,v_expiry_total::bigint,v_recorded) RETURNING id INTO v_ledger;
   FOR v_row IN SELECT l.id,p.free FROM public.loyalty_lots l JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id
     WHERE l.wallet_id=p_wallet AND l.expires_at<=v_recorded AND p.free>0 ORDER BY l.accepted_at,l.id LOOP
    INSERT INTO public.loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at)
     VALUES(gen_random_uuid(),p_wallet,v_row.id,v_ledger,'EXPIRE',v_row.free,v_recorded);
    UPDATE public.loyalty_lot_partitions SET free=0,expired=expired+v_row.free WHERE lot_id=v_row.id;
   END LOOP;
   UPDATE public.loyalty_wallets SET revision=revision+1 WHERE id=p_wallet RETURNING revision INTO v_wallet_revision;
   v_expiry_after:=public.loyalty_wallet_snapshot(p_wallet,v_recorded);
   INSERT INTO public.loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash)
    VALUES(v_expiry_command,'SYSTEM',1,'MATERIALIZE_EXPIRY','WALLET',p_wallet::text,
     md5('expiry:'||p_command::text)||md5('expiry-result:'||p_command::text));
   INSERT INTO public.loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at)
    VALUES(v_expiry_command,'APPLIED',200,v_expiry_before,v_expiry_after,v_recorded);
   INSERT INTO public.loyalty_audit(id,command_id,wallet_id,recorded_at) VALUES(gen_random_uuid(),v_expiry_command,p_wallet,v_recorded);
   v_before:=v_expiry_after;
  END IF;
 END IF;

 IF v_outcome IS NULL THEN
  SELECT coalesce(sum(p.free::numeric),0) INTO v_available FROM public.loyalty_lot_partitions p WHERE p.wallet_id=p_wallet;
  v_cap:=least(v_available::bigint,p_eligible_minor/100,p_eligible_minor/1000,10000);
  IF p_points>v_available THEN v_outcome:='INSUFFICIENT_BALANCE';
  ELSIF NOT v_revision_matches THEN v_outcome:='REVISION_CONFLICT';
  ELSIF p_discount_present THEN v_outcome:='STACKING_FORBIDDEN';
  ELSIF p_points>v_cap THEN v_outcome:='INVALID_DEFINITION';
  ELSIF v_wallet_revision=9223372036854775807 THEN v_outcome:='REVISION_EXHAUSTED';
  ELSE v_outcome:='APPLIED'; END IF;
 END IF;

 INSERT INTO public.loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash)
  VALUES(p_command,'CUSTOMER',p_actor,'CREATE_RESERVATION','WALLET',p_wallet::text,p_request_hash);
 IF v_outcome<>'APPLIED' THEN
  INSERT INTO public.loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at)
   VALUES(p_command,v_outcome,409,v_before,v_before,v_recorded);
  INSERT INTO public.loyalty_audit(id,command_id,wallet_id,recorded_at) VALUES(gen_random_uuid(),p_command,p_wallet,v_recorded);
  INSERT INTO public.loyalty_reservation_command_results(command_id,reservation_id) VALUES(p_command,NULL);
  RETURN jsonb_build_object('outcome',v_outcome,'reservationId',NULL);
 END IF;

 INSERT INTO public.loyalty_reservations(id,wallet_id,policy_version,cart_revision,wallet_revision,points,created_at,expires_at)
  VALUES(p_reservation,p_wallet,v_policy,p_cart_revision,v_wallet_revision,p_points,v_recorded,v_recorded+interval '900 seconds');
 v_remaining:=p_points;
 FOR v_row IN SELECT l.id,p.free FROM public.loyalty_lots l JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id
   WHERE l.wallet_id=p_wallet AND l.expires_at>v_recorded AND p.free>0 ORDER BY l.accepted_at,l.id LOOP
  EXIT WHEN v_remaining=0; v_take:=least(v_remaining,v_row.free); v_ordinal:=v_ordinal+1;
  INSERT INTO public.loyalty_reservation_allocations(reservation_id,wallet_id,lot_id,ordinal,points)
   VALUES(p_reservation,p_wallet,v_row.id,v_ordinal,v_take);
  UPDATE public.loyalty_lot_partitions SET free=free-v_take,held=held+v_take WHERE lot_id=v_row.id;
  v_remaining:=v_remaining-v_take;
 END LOOP;
 IF v_remaining<>0 THEN RAISE EXCEPTION 'LOYALTY_ALLOCATION_DRIFT' USING ERRCODE='23514'; END IF;
 INSERT INTO public.loyalty_reservation_states(reservation_id,wallet_id,state,revision) VALUES(p_reservation,p_wallet,'QUOTED',0);
 INSERT INTO public.loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at)
  VALUES(p_reservation,p_wallet,0,NULL,'QUOTED',v_recorded);
 UPDATE public.loyalty_wallets SET revision=revision+1 WHERE id=p_wallet;
 v_after:=public.loyalty_wallet_snapshot(p_wallet,v_recorded);
 INSERT INTO public.loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at)
  VALUES(p_command,'APPLIED',200,v_before,v_after,v_recorded);
 INSERT INTO public.loyalty_audit(id,command_id,wallet_id,recorded_at) VALUES(gen_random_uuid(),p_command,p_wallet,v_recorded);
 INSERT INTO public.loyalty_reservation_command_results(command_id,reservation_id) VALUES(p_command,p_reservation);
 RETURN jsonb_build_object('outcome','APPLIED','reservationId',p_reservation);
END $$;

CREATE FUNCTION loyalty_reservation_snapshot(p_reservation UUID,p_at TIMESTAMPTZ) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object(
  'schemaVersion',1,'reservationId',r.id::text,'walletId',r.wallet_id::text,'policyVersion',r.policy_version,
  'cartRevision',r.cart_revision::text,'walletRevision',r.wallet_revision::text,'points',r.points::text,
  'createdAt',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'expiresAt',to_char(r.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'state',s.state,'revision',s.revision::text,
  'at',to_char(p_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'ordinal',a.ordinal,'lotId',a.lot_id::text,'points',a.points::text) ORDER BY a.ordinal)
    FROM public.loyalty_reservation_allocations a WHERE a.reservation_id=r.id),'[]'::jsonb)
 )
 FROM public.loyalty_reservations r JOIN public.loyalty_reservation_states s
  ON s.reservation_id=r.id AND s.wallet_id=r.wallet_id
 WHERE r.id=p_reservation
$$;

CREATE FUNCTION loyalty_finish_reservation(
 p_realm VARCHAR,p_actor BIGINT,p_command UUID,p_reservation UUID,p_expected_revision BIGINT,
 p_operation VARCHAR,p_target VARCHAR,p_require_expired BOOLEAN,p_request_hash VARCHAR
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 v_binding RECORD; v_definition RECORD; v_state RECORD; v_allocation RECORD; v_result UUID;
 v_wallet BIGINT; v_customer BIGINT; v_wallet_revision BIGINT; v_policy TEXT;
 v_recorded TIMESTAMPTZ; v_before JSONB; v_after JSONB; v_outcome TEXT;
 v_expired_total NUMERIC; v_source UUID; v_ledger BIGINT;
BEGIN
 IF p_command='00000000-0000-0000-0000-000000000000'::uuid
  OR p_reservation='00000000-0000-0000-0000-000000000000'::uuid
  OR p_expected_revision<0 OR p_request_hash !~ '^[0-9a-f]{64}$'
  OR NOT ((p_realm='CUSTOMER' AND p_actor>0 AND p_operation='CANCEL_RESERVATION' AND p_target='RELEASED' AND NOT p_require_expired)
       OR (p_realm='SYSTEM' AND p_actor=1 AND p_operation='EXPIRE_RESERVATION' AND p_target='EXPIRED' AND p_require_expired)) THEN
  RAISE EXCEPTION 'INVALID_LOYALTY_TERMINAL_COMMAND' USING ERRCODE='22023';
 END IF;

 SELECT * INTO v_binding FROM public.loyalty_command_bindings b WHERE b.command_id=p_command;
 IF FOUND THEN
  IF v_binding.realm<>p_realm OR v_binding.actor_id<>p_actor OR v_binding.operation<>p_operation
   OR v_binding.aggregate_type<>'RESERVATION' OR v_binding.aggregate_ref<>p_reservation::text
   OR v_binding.request_hash<>p_request_hash THEN
   RAISE EXCEPTION 'LOYALTY_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  SELECT r.outcome,x.reservation_id INTO STRICT v_outcome,v_result
   FROM public.loyalty_command_receipts r JOIN public.loyalty_reservation_command_results x ON x.command_id=r.command_id
   WHERE r.command_id=p_command;
  RETURN jsonb_build_object('outcome',v_outcome,'reservationId',v_result);
 END IF;

 SELECT r.*,w.customer_id INTO v_definition
  FROM public.loyalty_reservations r JOIN public.loyalty_wallets w ON w.id=r.wallet_id
  WHERE r.id=p_reservation;
 IF NOT FOUND OR (p_realm='CUSTOMER' AND v_definition.customer_id<>p_actor) THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_FOUND' USING ERRCODE='P0002';
 END IF;
 v_wallet:=v_definition.wallet_id;
 SELECT w.revision,w.customer_id,w.policy_version INTO STRICT v_wallet_revision,v_customer,v_policy
  FROM public.loyalty_wallets w WHERE w.id=v_wallet FOR UPDATE;
 SELECT * INTO v_state FROM public.loyalty_reservation_states s
  WHERE s.reservation_id=p_reservation AND s.wallet_id=v_wallet FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_RESERVATION_CORRUPT' USING ERRCODE='23514'; END IF;
 FOR v_allocation IN SELECT l.id FROM public.loyalty_reservation_allocations a
  JOIN public.loyalty_lots l ON l.id=a.lot_id AND l.wallet_id=a.wallet_id
  JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id AND p.wallet_id=l.wallet_id
  WHERE a.reservation_id=p_reservation ORDER BY l.id FOR UPDATE OF l,p LOOP NULL; END LOOP;
 v_recorded:=date_trunc('second',clock_timestamp());
 v_before:=public.loyalty_reservation_snapshot(p_reservation,v_recorded);

 IF v_state.state<>'QUOTED' THEN v_outcome:='INVALID_STATE';
 ELSIF v_state.revision<>p_expected_revision THEN v_outcome:='REVISION_CONFLICT';
 ELSIF p_require_expired AND v_recorded<v_definition.expires_at THEN v_outcome:='INVALID_STATE';
 ELSIF v_wallet_revision=9223372036854775807 THEN v_outcome:='REVISION_EXHAUSTED';
 ELSE v_outcome:='APPLIED'; END IF;

 INSERT INTO public.loyalty_command_bindings(command_id,realm,actor_id,operation,aggregate_type,aggregate_ref,request_hash)
  VALUES(p_command,p_realm,p_actor,p_operation,'RESERVATION',p_reservation::text,p_request_hash);
 IF v_outcome='APPLIED' THEN
  SELECT coalesce(sum(a.points::numeric),0) INTO v_expired_total
   FROM public.loyalty_reservation_allocations a JOIN public.loyalty_lots l ON l.id=a.lot_id
   WHERE a.reservation_id=p_reservation AND l.expires_at<=v_recorded;
  IF v_expired_total>0 THEN
   v_source:=gen_random_uuid();
   INSERT INTO public.loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at)
    VALUES(v_source,v_wallet,'EXPIRY','reservation-terminal-expiry:'||p_command::text,v_policy,v_expired_total::bigint,v_recorded);
   INSERT INTO public.loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at)
    VALUES(v_wallet,v_source,'EXPIRE',NULL,v_expired_total::bigint,v_recorded) RETURNING id INTO v_ledger;
  END IF;
  FOR v_allocation IN SELECT a.lot_id,a.points,l.expires_at FROM public.loyalty_reservation_allocations a
    JOIN public.loyalty_lots l ON l.id=a.lot_id WHERE a.reservation_id=p_reservation ORDER BY a.lot_id LOOP
   IF v_allocation.expires_at<=v_recorded THEN
    INSERT INTO public.loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at)
     VALUES(gen_random_uuid(),v_wallet,v_allocation.lot_id,v_ledger,'EXPIRE',v_allocation.points,v_recorded);
    UPDATE public.loyalty_lot_partitions SET held=held-v_allocation.points,expired=expired+v_allocation.points
     WHERE lot_id=v_allocation.lot_id AND wallet_id=v_wallet;
   ELSE
    UPDATE public.loyalty_lot_partitions SET held=held-v_allocation.points,free=free+v_allocation.points
     WHERE lot_id=v_allocation.lot_id AND wallet_id=v_wallet;
   END IF;
  END LOOP;
  UPDATE public.loyalty_reservation_states SET state=p_target,revision=1 WHERE reservation_id=p_reservation;
  INSERT INTO public.loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at)
   VALUES(p_reservation,v_wallet,1,'QUOTED',p_target,v_recorded);
  UPDATE public.loyalty_wallets SET revision=revision+1 WHERE id=v_wallet;
 END IF;
 v_after:=public.loyalty_reservation_snapshot(p_reservation,v_recorded);
 INSERT INTO public.loyalty_command_receipts(command_id,outcome,original_http_status,before_snapshot,after_snapshot,recorded_at)
  VALUES(p_command,v_outcome,CASE WHEN v_outcome='APPLIED' THEN 200 ELSE 409 END,v_before,v_after,v_recorded);
 INSERT INTO public.loyalty_audit(id,command_id,wallet_id,recorded_at) VALUES(gen_random_uuid(),p_command,v_wallet,v_recorded);
 INSERT INTO public.loyalty_reservation_command_results(command_id,reservation_id) VALUES(p_command,p_reservation);
 RETURN jsonb_build_object('outcome',v_outcome,'reservationId',p_reservation);
END $$;

CREATE FUNCTION loyalty_cancel_reservation(
 p_actor BIGINT,p_session UUID,p_command UUID,p_reservation UUID,p_expected_revision BIGINT,p_request_hash VARCHAR
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.loyalty_assert_live_customer_session(p_actor,p_session);
 RETURN public.loyalty_finish_reservation('CUSTOMER',p_actor,p_command,p_reservation,p_expected_revision,
  'CANCEL_RESERVATION','RELEASED',false,p_request_hash);
END $$;

CREATE FUNCTION loyalty_expire_reservation(
 p_command UUID,p_reservation UUID,p_expected_revision BIGINT,p_request_hash VARCHAR
) RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.loyalty_finish_reservation('SYSTEM',1,p_command,p_reservation,p_expected_revision,
  'EXPIRE_RESERVATION','EXPIRED',true,p_request_hash)
$$;

REVOKE ALL ON loyalty_reservation_command_results FROM PUBLIC,storecore_runtime;
GRANT SELECT ON loyalty_reservation_command_results TO storecore_runtime;
GRANT ALL ON loyalty_reservation_command_results TO storecore_migrator;
ALTER FUNCTION loyalty_assert_live_customer_session(BIGINT,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_wallet_snapshot(BIGINT,TIMESTAMPTZ) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_quote_reservation(BIGINT,UUID,UUID,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_reservation_snapshot(UUID,TIMESTAMPTZ) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_finish_reservation(VARCHAR,BIGINT,UUID,UUID,BIGINT,VARCHAR,VARCHAR,BOOLEAN,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_cancel_reservation(BIGINT,UUID,UUID,UUID,BIGINT,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_expire_reservation(UUID,UUID,BIGINT,VARCHAR) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION loyalty_assert_live_customer_session(BIGINT,UUID),loyalty_wallet_snapshot(BIGINT,TIMESTAMPTZ),
 loyalty_quote_reservation(BIGINT,UUID,UUID,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN,VARCHAR),
 loyalty_reservation_snapshot(UUID,TIMESTAMPTZ),
 loyalty_finish_reservation(VARCHAR,BIGINT,UUID,UUID,BIGINT,VARCHAR,VARCHAR,BOOLEAN,VARCHAR),
 loyalty_cancel_reservation(BIGINT,UUID,UUID,UUID,BIGINT,VARCHAR),
 loyalty_expire_reservation(UUID,UUID,BIGINT,VARCHAR) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_assert_live_customer_session(BIGINT,UUID),loyalty_wallet_snapshot(BIGINT,TIMESTAMPTZ),
 loyalty_quote_reservation(BIGINT,UUID,UUID,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN,VARCHAR),
 loyalty_reservation_snapshot(UUID,TIMESTAMPTZ),
 loyalty_finish_reservation(VARCHAR,BIGINT,UUID,UUID,BIGINT,VARCHAR,VARCHAR,BOOLEAN,VARCHAR),
 loyalty_cancel_reservation(BIGINT,UUID,UUID,UUID,BIGINT,VARCHAR),
 loyalty_expire_reservation(UUID,UUID,BIGINT,VARCHAR) TO storecore_migrator;
