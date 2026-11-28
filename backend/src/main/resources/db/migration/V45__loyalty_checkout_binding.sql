-- PCC-015D2: atomic checkout binding and zero-redemption earning evidence writer.
-- Keeps LOYALTY capability module disabled/future_optional until HTTP activation (PCC-015D3).

CREATE FUNCTION loyalty_checkout_assert_live_customer_session(
 p_customer BIGINT,
 p_session UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.loyalty_assert_live_customer_session(p_customer, p_session);
END $$;

CREATE FUNCTION loyalty_prepare_checkout_bind(
 p_customer BIGINT,
 p_session UUID,
 p_reservation UUID,
 p_expected_revision BIGINT,
 p_cart_fingerprint VARCHAR
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 v_wallet BIGINT;
 v_wallet_row RECORD;
 v_res RECORD;
 v_state RECORD;
 v_quote RECORD;
 v_alloc RECORD;
 v_alloc_count BIGINT := 0;
 v_alloc_sum NUMERIC := 0;
 v_bound_at TIMESTAMPTZ;
BEGIN
 IF p_customer IS NULL OR p_customer<=0 OR p_session IS NULL
  OR p_reservation IS NULL OR p_reservation='00000000-0000-0000-0000-000000000000'::uuid
  OR p_expected_revision IS NULL OR p_expected_revision<0
  OR p_cart_fingerprint IS NULL OR p_cart_fingerprint !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'LOYALTY_BIND_INVALID_INPUT' USING ERRCODE='23514';
 END IF;

 SELECT r.wallet_id INTO v_wallet FROM public.loyalty_reservations r WHERE r.id=p_reservation;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_FOUND' USING ERRCODE='P0002';
 END IF;

 SELECT w.id, w.customer_id, w.revision, w.policy_version INTO STRICT v_wallet_row
  FROM public.loyalty_wallets w WHERE w.id=v_wallet FOR UPDATE;
 IF v_wallet_row.customer_id<>p_customer THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_FOUND' USING ERRCODE='P0002';
 END IF;

 SELECT * INTO STRICT v_res FROM public.loyalty_reservations r
  WHERE r.id=p_reservation AND r.wallet_id=v_wallet FOR UPDATE;
 SELECT * INTO STRICT v_state FROM public.loyalty_reservation_states s
  WHERE s.reservation_id=p_reservation AND s.wallet_id=v_wallet FOR UPDATE;
 SELECT * INTO v_quote FROM public.loyalty_quote_snapshots q
  WHERE q.reservation_id=p_reservation FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'LOYALTY_QUOTE_EVIDENCE_MISSING' USING ERRCODE='23514';
 END IF;

 FOR v_alloc IN
  SELECT a.lot_id, a.points, p.held
   FROM public.loyalty_reservation_allocations a
   JOIN public.loyalty_lots l ON l.id=a.lot_id AND l.wallet_id=v_wallet
   JOIN public.loyalty_lot_partitions p ON p.lot_id=a.lot_id AND p.wallet_id=v_wallet
   WHERE a.reservation_id=p_reservation
   ORDER BY l.id
   FOR UPDATE OF l, p
 LOOP
  v_alloc_count := v_alloc_count + 1;
  v_alloc_sum := v_alloc_sum + v_alloc.points::numeric;
  IF v_alloc.held < v_alloc.points THEN
   RAISE EXCEPTION 'LOYALTY_ALLOCATION_CONTRADICTION' USING ERRCODE='23514';
  END IF;
  PERFORM public.loyalty_assert_lot_closure(v_alloc.lot_id);
 END LOOP;

 IF v_alloc_count=0 OR v_alloc_sum<>v_res.points::numeric THEN
  RAISE EXCEPTION 'LOYALTY_ALLOCATION_CONTRADICTION' USING ERRCODE='23514';
 END IF;

 PERFORM public.loyalty_assert_live_customer_session(p_customer, p_session);
 v_bound_at := date_trunc('second', clock_timestamp());

 IF v_res.policy_version<>'loyalty-policy-v1' OR v_quote.policy_version<>'loyalty-policy-v1' THEN
  RAISE EXCEPTION 'LOYALTY_POLICY_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF v_res.cart_fingerprint IS DISTINCT FROM p_cart_fingerprint
  OR v_quote.cart_fingerprint IS DISTINCT FROM p_cart_fingerprint THEN
  RAISE EXCEPTION 'LOYALTY_CART_FINGERPRINT_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF v_state.state<>'QUOTED' THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_QUOTED' USING ERRCODE='23514';
 END IF;
 IF v_state.revision<>p_expected_revision THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_REVISION_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF v_bound_at<v_res.created_at OR v_bound_at>=v_res.expires_at THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_EXPIRED' USING ERRCODE='23514';
 END IF;
 IF v_wallet_row.revision>=9223372036854775807 OR v_state.revision>=9223372036854775807 THEN
  RAISE EXCEPTION 'LOYALTY_WALLET_REVISION_EXHAUSTED' USING ERRCODE='23514';
 END IF;

 RETURN v_bound_at;
END $$;

CREATE FUNCTION loyalty_record_order_earning_evidence(
 p_order_id BIGINT,
 p_payment_id BIGINT,
 p_cart_fingerprint VARCHAR,
 p_availability VARCHAR,
 p_unavailable_reason VARCHAR,
 p_net_subtotal_minor BIGINT,
 p_shipping_minor BIGINT,
 p_total_minor BIGINT,
 p_final_earning_minor BIGINT,
 p_lines JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 v_recorded_at TIMESTAMPTZ;
BEGIN
 IF p_order_id IS NULL OR p_order_id<=0 OR p_payment_id IS NULL OR p_payment_id<=0
  OR p_cart_fingerprint IS NULL OR p_cart_fingerprint !~ '^[0-9a-f]{64}$'
  OR p_availability NOT IN ('AVAILABLE','UNAVAILABLE')
  OR p_net_subtotal_minor IS NULL OR p_net_subtotal_minor<0
  OR p_shipping_minor IS NULL OR p_shipping_minor<0
  OR p_total_minor IS NULL OR p_total_minor<0
  OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN
  RAISE EXCEPTION 'LOYALTY_EARNING_INVALID_INPUT' USING ERRCODE='23514';
 END IF;

 v_recorded_at := date_trunc('second', clock_timestamp());

 INSERT INTO public.loyalty_order_snapshots(
  order_id, payment_id, cart_fingerprint, policy_version, availability, unavailable_reason,
  reservation_id, quote_hash, net_subtotal_minor, shipping_minor, total_minor, discount_minor,
  final_earning_minor, recorded_at, snapshot_revision, quote_snapshot_revision
 ) VALUES (
  p_order_id, p_payment_id, p_cart_fingerprint, 'loyalty-policy-v1', p_availability, p_unavailable_reason,
  NULL, NULL, p_net_subtotal_minor, p_shipping_minor, p_total_minor, 0,
  p_final_earning_minor, v_recorded_at, 0, NULL
 );

 IF p_availability='AVAILABLE' THEN
  IF jsonb_array_length(p_lines)=0 THEN
   RAISE EXCEPTION 'LOYALTY_ORDER_LINES_EMPTY' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.loyalty_order_lines(
   order_id, order_item_id, cart_item_id, variant_id, profile_id, profile_revision,
   quantity, original_unit_minor, effective_unit_minor, gross_minor, merchandise_minor,
   excluded_tax_minor, eligible_minor, allocated_discount_minor, payable_minor,
   final_earning_minor, classification, existing_discount_state, snapshot_revision
  )
  SELECT
   p_order_id, x.order_item_id, x.cart_item_id, x.variant_id, x.profile_id, x.profile_revision,
   x.quantity, x.original_unit_minor, x.effective_unit_minor, x.gross_minor, x.merchandise_minor,
   x.excluded_tax_minor, x.eligible_minor, x.allocated_discount_minor, x.payable_minor,
   x.final_earning_minor, x.classification, x.existing_discount_state, 0
  FROM jsonb_to_recordset(p_lines) AS x(
   order_item_id BIGINT,
   cart_item_id BIGINT,
   variant_id BIGINT,
   profile_id BIGINT,
   profile_revision BIGINT,
   quantity INTEGER,
   original_unit_minor BIGINT,
   effective_unit_minor BIGINT,
   gross_minor BIGINT,
   merchandise_minor BIGINT,
   excluded_tax_minor BIGINT,
   eligible_minor BIGINT,
   allocated_discount_minor BIGINT,
   payable_minor BIGINT,
   final_earning_minor BIGINT,
   classification VARCHAR,
   existing_discount_state VARCHAR
  );
 ELSIF jsonb_array_length(p_lines)<>0 THEN
  RAISE EXCEPTION 'LOYALTY_UNAVAILABLE_CANNOT_HAVE_LINES' USING ERRCODE='23514';
 END IF;
END $$;

CREATE FUNCTION loyalty_bind_checkout_order(
 p_customer BIGINT,
 p_session UUID,
 p_reservation UUID,
 p_expected_revision BIGINT,
 p_order_id BIGINT,
 p_payment_id BIGINT,
 p_cart_fingerprint VARCHAR,
 p_quote_hash VARCHAR,
 p_quote_snapshot_revision BIGINT,
 p_net_subtotal_minor BIGINT,
 p_shipping_minor BIGINT,
 p_total_minor BIGINT,
 p_discount_minor BIGINT,
 p_final_earning_minor BIGINT,
 p_bound_at TIMESTAMPTZ,
 p_lines JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE
 v_wallet BIGINT;
 v_wallet_row RECORD;
 v_res RECORD;
 v_state RECORD;
 v_quote RECORD;
 v_now TIMESTAMPTZ;
BEGIN
 IF p_customer IS NULL OR p_customer<=0 OR p_session IS NULL
  OR p_reservation IS NULL OR p_reservation='00000000-0000-0000-0000-000000000000'::uuid
  OR p_expected_revision IS NULL OR p_expected_revision<0
  OR p_order_id IS NULL OR p_order_id<=0 OR p_payment_id IS NULL OR p_payment_id<=0
  OR p_cart_fingerprint IS NULL OR p_cart_fingerprint !~ '^[0-9a-f]{64}$'
  OR p_quote_hash IS NULL OR p_quote_hash !~ '^[0-9a-f]{64}$'
  OR p_quote_snapshot_revision IS NULL OR p_quote_snapshot_revision<0
  OR p_net_subtotal_minor IS NULL OR p_net_subtotal_minor<0
  OR p_shipping_minor IS NULL OR p_shipping_minor<0
  OR p_total_minor IS NULL OR p_total_minor<0
  OR p_discount_minor IS NULL OR p_discount_minor<=0
  OR p_final_earning_minor IS NULL OR p_final_earning_minor<0
  OR p_bound_at IS NULL OR NOT isfinite(p_bound_at) OR date_trunc('second', p_bound_at)<>p_bound_at
  OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 THEN
  RAISE EXCEPTION 'LOYALTY_BIND_INVALID_INPUT' USING ERRCODE='23514';
 END IF;

 PERFORM public.loyalty_assert_live_customer_session(p_customer, p_session);
 v_now := date_trunc('second', clock_timestamp());

 SELECT r.wallet_id INTO v_wallet FROM public.loyalty_reservations r WHERE r.id=p_reservation;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_FOUND' USING ERRCODE='P0002';
 END IF;

 SELECT w.id, w.customer_id, w.revision INTO STRICT v_wallet_row
  FROM public.loyalty_wallets w WHERE w.id=v_wallet FOR UPDATE;
 IF v_wallet_row.customer_id<>p_customer THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_FOUND' USING ERRCODE='P0002';
 END IF;

 SELECT * INTO STRICT v_res FROM public.loyalty_reservations r
  WHERE r.id=p_reservation AND r.wallet_id=v_wallet FOR UPDATE;
 SELECT * INTO STRICT v_state FROM public.loyalty_reservation_states s
  WHERE s.reservation_id=p_reservation AND s.wallet_id=v_wallet FOR UPDATE;
 SELECT * INTO STRICT v_quote FROM public.loyalty_quote_snapshots q
  WHERE q.reservation_id=p_reservation FOR SHARE;

 IF v_state.state<>'QUOTED' THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_QUOTED' USING ERRCODE='23514';
 END IF;
 IF v_state.revision<>p_expected_revision OR v_state.revision<>0 THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_REVISION_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF p_bound_at<v_res.created_at OR p_bound_at>=v_res.expires_at OR v_now>=v_res.expires_at THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_EXPIRED' USING ERRCODE='23514';
 END IF;
 IF v_wallet_row.revision>=9223372036854775807 THEN
  RAISE EXCEPTION 'LOYALTY_WALLET_REVISION_EXHAUSTED' USING ERRCODE='23514';
 END IF;
 IF v_quote.cart_fingerprint<>p_cart_fingerprint OR v_quote.snapshot_hash<>p_quote_hash
  OR v_quote.snapshot_revision<>p_quote_snapshot_revision OR v_quote.discount_minor<>p_discount_minor THEN
  RAISE EXCEPTION 'LOYALTY_QUOTE_EVIDENCE_MISMATCH' USING ERRCODE='23514';
 END IF;

 INSERT INTO public.loyalty_order_snapshots(
  order_id, payment_id, cart_fingerprint, policy_version, availability, unavailable_reason,
  reservation_id, quote_hash, net_subtotal_minor, shipping_minor, total_minor, discount_minor,
  final_earning_minor, recorded_at, snapshot_revision, quote_snapshot_revision
 ) VALUES (
  p_order_id, p_payment_id, p_cart_fingerprint, 'loyalty-policy-v1', 'AVAILABLE', NULL,
  p_reservation, p_quote_hash, p_net_subtotal_minor, p_shipping_minor, p_total_minor, p_discount_minor,
  p_final_earning_minor, p_bound_at, 0, p_quote_snapshot_revision
 );

 INSERT INTO public.loyalty_order_lines(
  order_id, order_item_id, cart_item_id, variant_id, profile_id, profile_revision,
  quantity, original_unit_minor, effective_unit_minor, gross_minor, merchandise_minor,
  excluded_tax_minor, eligible_minor, allocated_discount_minor, payable_minor,
  final_earning_minor, classification, existing_discount_state, snapshot_revision
 )
 SELECT
  p_order_id, x.order_item_id, x.cart_item_id, x.variant_id, x.profile_id, x.profile_revision,
  x.quantity, x.original_unit_minor, x.effective_unit_minor, x.gross_minor, x.merchandise_minor,
  x.excluded_tax_minor, x.eligible_minor, x.allocated_discount_minor, x.payable_minor,
  x.final_earning_minor, x.classification, x.existing_discount_state, 0
 FROM jsonb_to_recordset(p_lines) AS x(
  order_item_id BIGINT,
  cart_item_id BIGINT,
  variant_id BIGINT,
  profile_id BIGINT,
  profile_revision BIGINT,
  quantity INTEGER,
  original_unit_minor BIGINT,
  effective_unit_minor BIGINT,
  gross_minor BIGINT,
  merchandise_minor BIGINT,
  excluded_tax_minor BIGINT,
  eligible_minor BIGINT,
  allocated_discount_minor BIGINT,
  payable_minor BIGINT,
  final_earning_minor BIGINT,
  classification VARCHAR,
  existing_discount_state VARCHAR
 );

 INSERT INTO public.loyalty_checkout_bindings(
  reservation_id, order_id, payment_id, bound_at, snapshot_revision
 ) VALUES (
  p_reservation, p_order_id, p_payment_id, p_bound_at, 0
 );

 UPDATE public.loyalty_reservation_states
  SET state='PAYMENT_PENDING', revision=1
  WHERE reservation_id=p_reservation AND wallet_id=v_wallet AND state='QUOTED' AND revision=0;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'LOYALTY_RESERVATION_NOT_QUOTED' USING ERRCODE='23514';
 END IF;

 INSERT INTO public.loyalty_reservation_history(
  reservation_id, wallet_id, revision, from_state, to_state, recorded_at
 ) VALUES (
  p_reservation, v_wallet, 1, 'QUOTED', 'PAYMENT_PENDING', p_bound_at
 );

 UPDATE public.loyalty_wallets
  SET revision=revision+1
  WHERE id=v_wallet;
END $$;

ALTER FUNCTION loyalty_checkout_assert_live_customer_session(BIGINT,UUID) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_prepare_checkout_bind(BIGINT,UUID,UUID,BIGINT,VARCHAR) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_record_order_earning_evidence(BIGINT,BIGINT,VARCHAR,VARCHAR,VARCHAR,BIGINT,BIGINT,BIGINT,BIGINT,JSONB) OWNER TO storecore_migrator;
ALTER FUNCTION loyalty_bind_checkout_order(BIGINT,UUID,UUID,BIGINT,BIGINT,BIGINT,VARCHAR,VARCHAR,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,TIMESTAMPTZ,JSONB) OWNER TO storecore_migrator;

REVOKE ALL ON FUNCTION
 loyalty_checkout_assert_live_customer_session(BIGINT,UUID),
 loyalty_prepare_checkout_bind(BIGINT,UUID,UUID,BIGINT,VARCHAR),
 loyalty_record_order_earning_evidence(BIGINT,BIGINT,VARCHAR,VARCHAR,VARCHAR,BIGINT,BIGINT,BIGINT,BIGINT,JSONB),
 loyalty_bind_checkout_order(BIGINT,UUID,UUID,BIGINT,BIGINT,BIGINT,VARCHAR,VARCHAR,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,TIMESTAMPTZ,JSONB)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
 loyalty_checkout_assert_live_customer_session(BIGINT,UUID),
 loyalty_prepare_checkout_bind(BIGINT,UUID,UUID,BIGINT,VARCHAR),
 loyalty_record_order_earning_evidence(BIGINT,BIGINT,VARCHAR,VARCHAR,VARCHAR,BIGINT,BIGINT,BIGINT,BIGINT,JSONB),
 loyalty_bind_checkout_order(BIGINT,UUID,UUID,BIGINT,BIGINT,BIGINT,VARCHAR,VARCHAR,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,TIMESTAMPTZ,JSONB)
TO storecore_runtime, storecore_migrator;
