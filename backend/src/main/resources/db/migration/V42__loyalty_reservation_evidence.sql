-- Non-operative reservation evidence. No runtime writer or capability promotion.
CREATE TABLE loyalty_reservations (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'),
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 policy_version VARCHAR(32) NOT NULL DEFAULT 'loyalty-policy-v1' CHECK(policy_version='loyalty-policy-v1'),
 cart_revision BIGINT NOT NULL CHECK(cart_revision>=0),
 wallet_revision BIGINT NOT NULL CHECK(wallet_revision>=0),
 points BIGINT NOT NULL CHECK(points>0),
 created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at) AND date_trunc('second',created_at)=created_at),
 expires_at TIMESTAMPTZ NOT NULL CHECK(isfinite(expires_at) AND date_trunc('second',expires_at)=expires_at),
 CHECK(expires_at=created_at+interval '900 seconds'),
 UNIQUE(id,wallet_id)
);
CREATE INDEX ix_loyalty_reservations_wallet_history ON loyalty_reservations(wallet_id,created_at DESC,id DESC);
CREATE TABLE loyalty_reservation_allocations (
 reservation_id UUID NOT NULL,
 wallet_id BIGINT NOT NULL,
 lot_id BIGINT NOT NULL,
 ordinal INTEGER NOT NULL CHECK(ordinal>0),
 points BIGINT NOT NULL CHECK(points>0),
 PRIMARY KEY(reservation_id,ordinal),
 UNIQUE(reservation_id,lot_id),
 FOREIGN KEY(reservation_id,wallet_id) REFERENCES loyalty_reservations(id,wallet_id) ON DELETE RESTRICT,
 FOREIGN KEY(lot_id,wallet_id) REFERENCES loyalty_lots(id,wallet_id) ON DELETE RESTRICT
);
CREATE INDEX ix_loyalty_reservation_allocations_lot ON loyalty_reservation_allocations(lot_id,reservation_id);
-- Payment states and binding are deliberately unavailable in this structural cut.
CREATE TABLE loyalty_reservation_states (
 reservation_id UUID PRIMARY KEY,
 wallet_id BIGINT NOT NULL,
 state VARCHAR(32) NOT NULL CHECK(state IN ('QUOTED','RELEASED','EXPIRED')),
 revision BIGINT NOT NULL CHECK(revision>=0),
 CHECK((state='QUOTED' AND revision=0) OR (state IN ('RELEASED','EXPIRED') AND revision=1)),
 FOREIGN KEY(reservation_id,wallet_id) REFERENCES loyalty_reservations(id,wallet_id) ON DELETE RESTRICT
);
CREATE TABLE loyalty_reservation_history (
 reservation_id UUID NOT NULL,
 wallet_id BIGINT NOT NULL,
 revision BIGINT NOT NULL CHECK(revision>=0),
 from_state VARCHAR(32),
 to_state VARCHAR(32) NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at),
 PRIMARY KEY(reservation_id,revision),
 CHECK((revision=0 AND from_state IS NULL AND to_state='QUOTED')
    OR (revision=1 AND from_state IS NOT NULL AND from_state='QUOTED' AND to_state IN ('RELEASED','EXPIRED'))),
 FOREIGN KEY(reservation_id,wallet_id) REFERENCES loyalty_reservations(id,wallet_id) ON DELETE RESTRICT
);

CREATE FUNCTION loyalty_protect_reservation_state() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'loyalty reservation projection is durable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUOTED' OR NEW.revision<>0 THEN
   RAISE EXCEPTION 'reservation starts quoted at revision zero' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.reservation_id,NEW.wallet_id) IS DISTINCT FROM ROW(OLD.reservation_id,OLD.wallet_id)
   OR OLD.state<>'QUOTED' OR OLD.revision<>0 OR NEW.state NOT IN ('RELEASED','EXPIRED') OR NEW.revision<>1 THEN
   RAISE EXCEPTION 'invalid reservation transition or identity' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_reservation_state BEFORE INSERT OR UPDATE OR DELETE ON loyalty_reservation_states
 FOR EACH ROW EXECUTE FUNCTION loyalty_protect_reservation_state();
CREATE TRIGGER trg_loyalty_reservation_state_truncate BEFORE TRUNCATE ON loyalty_reservation_states
 FOR EACH STATEMENT EXECUTE FUNCTION loyalty_reject_evidence_mutation();

CREATE FUNCTION loyalty_validate_reservation_history() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE created TIMESTAMPTZ; expires TIMESTAMPTZ;
BEGIN
 SELECT r.created_at,r.expires_at INTO STRICT created,expires FROM public.loyalty_reservations r
  WHERE r.id=NEW.reservation_id AND r.wallet_id=NEW.wallet_id;
 IF (NEW.revision=0 AND NEW.recorded_at<>created) OR NEW.recorded_at<created
  OR (NEW.to_state='EXPIRED' AND NEW.recorded_at<expires) THEN
  RAISE EXCEPTION 'reservation history instant mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_reservation_history_valid BEFORE INSERT ON loyalty_reservation_history
 FOR EACH ROW EXECUTE FUNCTION loyalty_validate_reservation_history();

-- Replace the B-only held=0 closure without changing V41 or loosening ledger evidence.
CREATE FUNCTION loyalty_assert_lot_closure(target_lot BIGINT) RETURNS VOID LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE expected BIGINT; issued_events NUMERIC; reversed_events NUMERIC; expired_events NUMERIC; held_allocations NUMERIC;
BEGIN
 SELECT l.issued INTO STRICT expected FROM public.loyalty_lots l WHERE l.id=target_lot;
 SELECT coalesce(sum(a.points::numeric) FILTER(WHERE a.kind='ISSUE'),0),
        coalesce(sum(a.points::numeric) FILTER(WHERE a.kind='REVERSE'),0),
        coalesce(sum(a.points::numeric) FILTER(WHERE a.kind='EXPIRE'),0)
  INTO issued_events,reversed_events,expired_events
  FROM public.loyalty_allocation_events a WHERE a.lot_id=target_lot;
 SELECT coalesce(sum(a.points::numeric),0) INTO held_allocations
  FROM public.loyalty_reservation_allocations a JOIN public.loyalty_reservation_states s
   ON s.reservation_id=a.reservation_id AND s.wallet_id=a.wallet_id
  WHERE a.lot_id=target_lot AND s.state='QUOTED';
 IF issued_events<>expected::numeric OR NOT EXISTS(
  SELECT 1 FROM public.loyalty_lot_partitions p WHERE p.lot_id=target_lot
   AND p.issued::numeric=issued_events AND p.reversed::numeric=reversed_events
   AND p.expired::numeric=expired_events AND p.held::numeric=held_allocations AND p.redeemed=0
   AND p.free::numeric=issued_events-reversed_events-expired_events-held_allocations
 ) THEN RAISE EXCEPTION 'loyalty lot projection requires complete matching evidence' USING ERRCODE='23514'; END IF;
END $$;
CREATE OR REPLACE FUNCTION loyalty_check_lot_closure() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target_lot BIGINT;
BEGIN
 IF TG_TABLE_NAME='loyalty_lots' THEN target_lot:=NEW.id;
 ELSE target_lot:=NEW.lot_id; END IF;
 PERFORM public.loyalty_assert_lot_closure(target_lot);
 RETURN NULL;
END $$;

CREATE FUNCTION loyalty_check_reservation_closure() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target_reservation UUID; definition RECORD; projection RECORD; allocation_count BIGINT;
 allocated NUMERIC; first_ordinal INTEGER; last_ordinal INTEGER; history_count BIGINT; allocated_lot BIGINT;
BEGIN
 IF TG_TABLE_NAME='loyalty_reservations' THEN target_reservation:=NEW.id;
 ELSE target_reservation:=NEW.reservation_id; END IF;
 SELECT * INTO STRICT definition FROM public.loyalty_reservations r WHERE r.id=target_reservation;
 SELECT * INTO projection FROM public.loyalty_reservation_states s WHERE s.reservation_id=target_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'reservation projection is required' USING ERRCODE='23514'; END IF;
 SELECT count(*),coalesce(sum(a.points::numeric),0),min(a.ordinal),max(a.ordinal)
  INTO allocation_count,allocated,first_ordinal,last_ordinal
  FROM public.loyalty_reservation_allocations a WHERE a.reservation_id=target_reservation;
 IF allocation_count=0 OR allocated<>definition.points::numeric OR first_ordinal<>1 OR last_ordinal<>allocation_count THEN
  RAISE EXCEPTION 'reservation requires exact ordered allocations' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.loyalty_reservation_allocations a JOIN public.loyalty_lots l ON l.id=a.lot_id
  WHERE a.reservation_id=target_reservation AND (a.points>l.issued OR l.accepted_at>definition.created_at OR l.expires_at<=definition.created_at)) THEN
  RAISE EXCEPTION 'reservation allocation contradicts original lot evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM (
  SELECT l.accepted_at,l.id,lag(l.accepted_at) OVER(ORDER BY a.ordinal) AS previous_at,
   lag(l.id) OVER(ORDER BY a.ordinal) AS previous_id
  FROM public.loyalty_reservation_allocations a JOIN public.loyalty_lots l ON l.id=a.lot_id
  WHERE a.reservation_id=target_reservation
 ) ordered WHERE ROW(ordered.previous_at,ordered.previous_id)>ROW(ordered.accepted_at,ordered.id)) THEN
  RAISE EXCEPTION 'reservation allocations must retain FIFO order' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO history_count FROM public.loyalty_reservation_history h WHERE h.reservation_id=target_reservation;
 IF history_count<>projection.revision+1 OR NOT EXISTS(
  SELECT 1 FROM public.loyalty_reservation_history h WHERE h.reservation_id=target_reservation
   AND h.revision=projection.revision AND h.to_state=projection.state
 ) THEN RAISE EXCEPTION 'reservation history and projection mismatch' USING ERRCODE='23514'; END IF;
 FOR allocated_lot IN SELECT a.lot_id FROM public.loyalty_reservation_allocations a
  WHERE a.reservation_id=target_reservation ORDER BY a.lot_id LOOP
  PERFORM public.loyalty_assert_lot_closure(allocated_lot);
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_reservation_closure AFTER INSERT ON loyalty_reservations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_reservation_closure();
CREATE CONSTRAINT TRIGGER trg_loyalty_reservation_allocation_closure AFTER INSERT ON loyalty_reservation_allocations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_reservation_closure();
CREATE CONSTRAINT TRIGGER trg_loyalty_reservation_state_closure AFTER INSERT OR UPDATE ON loyalty_reservation_states
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_reservation_closure();
CREATE CONSTRAINT TRIGGER trg_loyalty_reservation_history_closure AFTER INSERT ON loyalty_reservation_history
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_reservation_closure();

DO $$
DECLARE evidence TEXT;
BEGIN
 FOREACH evidence IN ARRAY ARRAY['loyalty_reservations','loyalty_reservation_allocations','loyalty_reservation_history'] LOOP
  EXECUTE format('CREATE TRIGGER trg_loyalty_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.loyalty_reject_evidence_mutation()',evidence);
  EXECUTE format('CREATE TRIGGER trg_loyalty_immutable_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.loyalty_reject_evidence_mutation()',evidence);
 END LOOP;
END $$;
REVOKE ALL ON loyalty_reservations,loyalty_reservation_allocations,loyalty_reservation_states,loyalty_reservation_history FROM PUBLIC,storecore_runtime;
GRANT SELECT ON loyalty_reservations,loyalty_reservation_allocations,loyalty_reservation_states,loyalty_reservation_history TO storecore_runtime;
GRANT ALL ON loyalty_reservations,loyalty_reservation_allocations,loyalty_reservation_states,loyalty_reservation_history TO storecore_migrator;
REVOKE ALL ON FUNCTION loyalty_protect_reservation_state(),loyalty_validate_reservation_history(),loyalty_assert_lot_closure(BIGINT),loyalty_check_reservation_closure() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_protect_reservation_state(),loyalty_validate_reservation_history(),loyalty_assert_lot_closure(BIGINT),loyalty_check_reservation_closure() TO storecore_migrator;
