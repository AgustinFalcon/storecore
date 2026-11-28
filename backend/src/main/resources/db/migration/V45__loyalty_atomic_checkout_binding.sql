-- PCC-015D2. Runtime receives narrow execution authority, never loyalty DML.
-- Global lock order: customer/session, cart (caller), all products ASC,
-- all variants ASC, profiles/inventory, wallet, state, lots FIFO/id.
-- Deferred triggers run at COMMIT after an entry-point definer has returned.
-- Keep their internal closure helper private while retaining commit-time checks.
ALTER FUNCTION public.loyalty_check_lot_closure() SECURITY DEFINER;
ALTER FUNCTION public.loyalty_check_lot_closure() OWNER TO storecore_migrator;
ALTER FUNCTION public.loyalty_check_reservation_closure() SECURITY DEFINER;
ALTER FUNCTION public.loyalty_check_reservation_closure() OWNER TO storecore_migrator;
ALTER FUNCTION public.loyalty_check_order_evidence() SECURITY DEFINER;
ALTER FUNCTION public.loyalty_check_order_evidence() OWNER TO storecore_migrator;

CREATE FUNCTION public.loyalty_lock_checkout_catalog(p_actor BIGINT,p_session UUID,p_variants BIGINT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v BIGINT; products_before BIGINT[];
BEGIN
 PERFORM public.loyalty_assert_live_customer_session(p_actor,p_session);
 IF p_variants IS NULL OR cardinality(p_variants)=0 OR EXISTS(SELECT 1 FROM unnest(p_variants) x WHERE x IS NULL OR x<=0) THEN
  RAISE EXCEPTION 'INVALID_LOYALTY_CATALOG_LOCK' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT pv.product_id ORDER BY pv.product_id) INTO products_before FROM public.product_variants pv WHERE pv.id=ANY(p_variants);
 FOR v IN SELECT unnest(products_before) LOOP
  PERFORM 1 FROM public.products WHERE id=v FOR UPDATE;
 END LOOP;
 FOR v IN SELECT DISTINCT x FROM unnest(p_variants) x ORDER BY x LOOP
  PERFORM 1 FROM public.product_variants WHERE id=v FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOYALTY_VARIANT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 END LOOP;
 IF products_before IS DISTINCT FROM (SELECT array_agg(DISTINCT pv.product_id ORDER BY pv.product_id)
   FROM public.product_variants pv WHERE pv.id=ANY(p_variants)) THEN
  RAISE EXCEPTION 'LOYALTY_VARIANT_CHANGED' USING ERRCODE='23514'; END IF;
 PERFORM p.id FROM public.catalog_loyalty_price_profiles p JOIN public.catalog_loyalty_price_profile_heads h ON h.id=p.id
  WHERE p.variant_id=ANY(p_variants) ORDER BY p.variant_id FOR SHARE OF p;
END $$;

CREATE FUNCTION public.loyalty_prepare_checkout(p_actor BIGINT,p_session UUID,p_reservation UUID,p_expected_revision BIGINT,p_fingerprint VARCHAR)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r RECORD; s RECORD; q RECORD; rev BIGINT; now_at TIMESTAMPTZ; lot BIGINT;
BEGIN
 PERFORM public.loyalty_assert_live_customer_session(p_actor,p_session);
 IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_LOYALTY_FINGERPRINT' USING ERRCODE='22023'; END IF;
 IF p_reservation IS NULL THEN
  IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'INVALID_LOYALTY_SELECTION' USING ERRCODE='22023'; END IF;
  RETURN 0;
 END IF;
 SELECT x.*,w.customer_id INTO r FROM public.loyalty_reservations x JOIN public.loyalty_wallets w ON w.id=x.wallet_id WHERE x.id=p_reservation;
 IF NOT FOUND OR r.customer_id<>p_actor THEN RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF r.cart_fingerprint IS DISTINCT FROM p_fingerprint THEN
  RAISE EXCEPTION 'LOYALTY_QUOTE_CHANGED' USING ERRCODE='23514'; END IF;
 PERFORM public.loyalty_lock_checkout_catalog(p_actor,p_session,ARRAY(SELECT variant_id FROM public.loyalty_quote_lines WHERE reservation_id=p_reservation ORDER BY variant_id));
 SELECT revision INTO STRICT rev FROM public.loyalty_wallets WHERE id=r.wallet_id FOR UPDATE;
 PERFORM 1 FROM public.loyalty_reservations WHERE id=p_reservation FOR UPDATE;
 SELECT * INTO STRICT s FROM public.loyalty_reservation_states WHERE reservation_id=p_reservation FOR UPDATE;
 PERFORM l.id FROM public.loyalty_lots l JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id
  JOIN public.loyalty_reservation_allocations a ON a.lot_id=l.id AND a.reservation_id=p_reservation
  ORDER BY l.accepted_at,l.id FOR UPDATE OF l,p;
 -- Auth locks were acquired before wallet; only reread authority after waiting.
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_actor AND active) OR NOT EXISTS(
  SELECT 1 FROM public.identity_sessions WHERE id=p_session AND subject_kind='CUSTOMER' AND customer_id=p_actor
   AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'LOYALTY_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 now_at:=date_trunc('second',clock_timestamp());
 IF s.state<>'QUOTED' OR p_expected_revision IS NULL OR s.revision<>p_expected_revision THEN RAISE EXCEPTION 'LOYALTY_RESERVATION_CONFLICT' USING ERRCODE='23514'; END IF;
 IF now_at>=r.expires_at OR now_at<r.created_at THEN RAISE EXCEPTION 'LOYALTY_RESERVATION_EXPIRED' USING ERRCODE='23514'; END IF;
 IF rev=9223372036854775807 THEN RAISE EXCEPTION 'LOYALTY_REVISION_EXHAUSTED' USING ERRCODE='23514'; END IF;
 IF (SELECT coalesce(sum(points::numeric),0) FROM public.loyalty_reservation_allocations WHERE reservation_id=p_reservation)<>r.points::numeric THEN
  RAISE EXCEPTION 'LOYALTY_ALLOCATION_DRIFT' USING ERRCODE='23514'; END IF;
 FOR lot IN SELECT lot_id FROM public.loyalty_reservation_allocations WHERE reservation_id=p_reservation ORDER BY lot_id LOOP
  PERFORM public.loyalty_assert_lot_closure(lot);
 END LOOP;
 SELECT * INTO STRICT q FROM public.loyalty_quote_snapshots WHERE reservation_id=p_reservation;
 IF r.cart_fingerprint IS DISTINCT FROM p_fingerprint OR q.cart_fingerprint<>p_fingerprint OR EXISTS(
  SELECT 1 FROM public.loyalty_quote_lines l JOIN public.catalog_loyalty_price_profile_heads h ON h.variant_id=l.variant_id
   WHERE l.reservation_id=p_reservation AND (h.id<>l.profile_id OR h.revision<>l.profile_revision)) THEN
  RAISE EXCEPTION 'LOYALTY_QUOTE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN q.discount_minor;
END $$;

CREATE FUNCTION public.loyalty_freeze_checkout(p_actor BIGINT,p_session UUID,p_reservation UUID,p_expected_revision BIGINT,
 p_order BIGINT,p_payment BIGINT,p_fingerprint VARCHAR,p_lines JSONB,p_unavailable_reason VARCHAR DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE discount BIGINT; o RECORD; quote_hash VARCHAR; quote_revision BIGINT; earning BIGINT; at_time TIMESTAMPTZ; wallet BIGINT;
BEGIN
 discount:=public.loyalty_prepare_checkout(p_actor,p_session,p_reservation,p_expected_revision,p_fingerprint);
 SELECT * INTO STRICT o FROM public.orders WHERE id=p_order AND customer_id=p_actor FOR UPDATE;
 IF o.loyalty_creation_xid IS DISTINCT FROM pg_current_xact_id() OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN
  RAISE EXCEPTION 'LOYALTY_ATOMIC_CHECKOUT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF p_reservation IS NOT NULL THEN SELECT snapshot_hash,snapshot_revision INTO STRICT quote_hash,quote_revision FROM public.loyalty_quote_snapshots WHERE reservation_id=p_reservation; END IF;
 SELECT sum(x.final_earning_minor)::bigint INTO earning FROM jsonb_to_recordset(p_lines) x(final_earning_minor BIGINT);
 at_time:=date_trunc('second',clock_timestamp());
 INSERT INTO public.loyalty_order_snapshots(order_id,payment_id,cart_fingerprint,policy_version,availability,unavailable_reason,
  reservation_id,quote_hash,net_subtotal_minor,shipping_minor,total_minor,discount_minor,final_earning_minor,recorded_at,quote_snapshot_revision)
 VALUES(p_order,p_payment,p_fingerprint,'loyalty-policy-v1',CASE WHEN p_unavailable_reason IS NULL THEN 'AVAILABLE' ELSE 'UNAVAILABLE' END,
  p_unavailable_reason,p_reservation,quote_hash,(o.subtotal*100)::bigint,(o.shipping_cost*100)::bigint,(o.total*100)::bigint,discount,earning,at_time,quote_revision);
 INSERT INTO public.loyalty_order_lines(order_id,order_item_id,cart_item_id,variant_id,profile_id,profile_revision,quantity,
  original_unit_minor,effective_unit_minor,gross_minor,merchandise_minor,excluded_tax_minor,eligible_minor,allocated_discount_minor,
  payable_minor,final_earning_minor,classification,existing_discount_state)
 SELECT p_order,x.* FROM jsonb_to_recordset(p_lines) x(order_item_id BIGINT,cart_item_id BIGINT,variant_id BIGINT,profile_id BIGINT,
  profile_revision BIGINT,quantity INTEGER,original_unit_minor BIGINT,effective_unit_minor BIGINT,gross_minor BIGINT,
  merchandise_minor BIGINT,excluded_tax_minor BIGINT,eligible_minor BIGINT,allocated_discount_minor BIGINT,payable_minor BIGINT,
  final_earning_minor BIGINT,classification VARCHAR,existing_discount_state VARCHAR);
 IF p_reservation IS NOT NULL THEN
  SELECT wallet_id INTO STRICT wallet FROM public.loyalty_reservations WHERE id=p_reservation;
  INSERT INTO public.loyalty_checkout_bindings(reservation_id,order_id,payment_id,bound_at) VALUES(p_reservation,p_order,p_payment,at_time);
  UPDATE public.loyalty_reservation_states SET state='PAYMENT_PENDING',revision=1 WHERE reservation_id=p_reservation;
  INSERT INTO public.loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at)
   VALUES(p_reservation,wallet,1,'QUOTED','PAYMENT_PENDING',at_time);
  UPDATE public.loyalty_wallets SET revision=revision+1 WHERE id=wallet;
 END IF;
END $$;

CREATE FUNCTION public.loyalty_quote_checkout_reservation(
 p_actor BIGINT,p_session UUID,p_command UUID,p_reservation UUID,p_wallet BIGINT,p_cart_revision BIGINT,
 p_expected_wallet_revision BIGINT,p_points BIGINT,p_eligible_minor BIGINT,p_discount_present BOOLEAN,p_request_hash VARCHAR,
 p_fingerprint VARCHAR,p_snapshot_hash VARCHAR,p_lines JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 v_binding RECORD; v_outcome TEXT; v_recorded TIMESTAMPTZ; v_before JSONB; v_after JSONB;
 v_wallet_revision BIGINT; v_customer BIGINT; v_policy TEXT; v_available NUMERIC; v_cap BIGINT;
 v_revision_matches BOOLEAN;
 v_expiry_total NUMERIC; v_source UUID; v_ledger BIGINT; v_expiry_command UUID; v_expiry_before JSONB; v_expiry_after JSONB;
 v_row RECORD; v_remaining BIGINT; v_take BIGINT; v_ordinal INTEGER:=0; v_result UUID;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_command IS NULL OR p_reservation IS NULL OR p_wallet IS NULL
  OR p_cart_revision IS NULL OR p_expected_wallet_revision IS NULL OR p_points IS NULL OR p_eligible_minor IS NULL
  OR p_discount_present IS NULL OR p_request_hash IS NULL
  OR p_command='00000000-0000-0000-0000-000000000000'::uuid OR p_reservation='00000000-0000-0000-0000-000000000000'::uuid
  OR p_wallet<=0 OR p_cart_revision<0 OR p_expected_wallet_revision<0 OR p_points<=0 OR p_eligible_minor<=0
  OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'INVALID_LOYALTY_QUOTE' USING ERRCODE='22023';
 END IF;
 IF p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_snapshot_hash IS NULL OR p_snapshot_hash !~ '^[0-9a-f]{64}$'
 OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN
 RAISE EXCEPTION 'INVALID_LOYALTY_QUOTE_EVIDENCE' USING ERRCODE='22023'; END IF;
 PERFORM public.loyalty_lock_checkout_catalog(p_actor,p_session,ARRAY(SELECT variant_id FROM jsonb_to_recordset(p_lines) x(variant_id BIGINT)));

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
 PERFORM public.loyalty_assert_live_customer_session(p_actor,p_session);
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

 INSERT INTO public.loyalty_reservations(id,wallet_id,policy_version,cart_revision,wallet_revision,points,created_at,expires_at,cart_fingerprint)
  VALUES(p_reservation,p_wallet,v_policy,p_cart_revision,v_wallet_revision,p_points,v_recorded,v_recorded+interval '900 seconds',p_fingerprint);
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
 INSERT INTO public.loyalty_quote_snapshots(reservation_id,cart_fingerprint,snapshot_hash,policy_version,wallet_revision_before,wallet_revision_after,selected_points,discount_minor)
 VALUES(p_reservation,p_fingerprint,p_snapshot_hash,v_policy,v_wallet_revision,v_wallet_revision+1,p_points,p_points*100);
 INSERT INTO public.loyalty_quote_lines(reservation_id,cart_item_id,variant_id,profile_id,profile_revision,quantity,original_unit_minor,effective_unit_minor,
 gross_minor,merchandise_minor,excluded_tax_minor,eligible_minor,classification,existing_discount_state)
 SELECT p_reservation,x.* FROM jsonb_to_recordset(p_lines) x(cart_item_id BIGINT,variant_id BIGINT,profile_id BIGINT,profile_revision BIGINT,
 quantity INTEGER,original_unit_minor BIGINT,effective_unit_minor BIGINT,gross_minor BIGINT,merchandise_minor BIGINT,excluded_tax_minor BIGINT,
 eligible_minor BIGINT,classification VARCHAR,existing_discount_state VARCHAR);
 RETURN jsonb_build_object('outcome','APPLIED','reservationId',p_reservation);
END $$;

ALTER FUNCTION public.loyalty_lock_checkout_catalog(BIGINT,UUID,BIGINT[]) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.loyalty_lock_checkout_catalog(BIGINT,UUID,BIGINT[]) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.loyalty_lock_checkout_catalog(BIGINT,UUID,BIGINT[]) TO storecore_runtime;

ALTER FUNCTION public.loyalty_prepare_checkout(BIGINT,UUID,UUID,BIGINT,VARCHAR) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.loyalty_prepare_checkout(BIGINT,UUID,UUID,BIGINT,VARCHAR) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.loyalty_prepare_checkout(BIGINT,UUID,UUID,BIGINT,VARCHAR) TO storecore_runtime;

ALTER FUNCTION public.loyalty_freeze_checkout(BIGINT,UUID,UUID,BIGINT,BIGINT,BIGINT,VARCHAR,JSONB,VARCHAR) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.loyalty_freeze_checkout(BIGINT,UUID,UUID,BIGINT,BIGINT,BIGINT,VARCHAR,JSONB,VARCHAR) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.loyalty_freeze_checkout(BIGINT,UUID,UUID,BIGINT,BIGINT,BIGINT,VARCHAR,JSONB,VARCHAR) TO storecore_runtime;

ALTER FUNCTION public.loyalty_quote_checkout_reservation(BIGINT,UUID,UUID,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN,VARCHAR,VARCHAR,VARCHAR,JSONB) OWNER TO storecore_migrator;
REVOKE ALL ON FUNCTION public.loyalty_quote_checkout_reservation(BIGINT,UUID,UUID,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN,VARCHAR,VARCHAR,VARCHAR,JSONB) FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION public.loyalty_quote_checkout_reservation(BIGINT,UUID,UUID,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BOOLEAN,VARCHAR,VARCHAR,VARCHAR,JSONB) TO storecore_runtime;
