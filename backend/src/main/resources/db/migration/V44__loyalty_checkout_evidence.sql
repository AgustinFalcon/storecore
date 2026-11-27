-- PCC-015D1: structural evidence only. No runtime writer, capability or provider activation.
-- Historical orders retain NULL. xmin changes on UPDATE and cannot prove creation.
ALTER TABLE orders ADD COLUMN loyalty_creation_xid xid8;
CREATE FUNCTION loyalty_protect_order_creation_xid() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.loyalty_creation_xid:=pg_current_xact_id();
 ELSIF NEW.loyalty_creation_xid IS DISTINCT FROM OLD.loyalty_creation_xid THEN
  RAISE EXCEPTION 'order creation transaction is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_order_creation_xid BEFORE INSERT OR UPDATE ON orders
 FOR EACH ROW EXECUTE FUNCTION loyalty_protect_order_creation_xid();
REVOKE ALL ON FUNCTION loyalty_protect_order_creation_xid() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_protect_order_creation_xid() TO storecore_migrator;

ALTER TABLE loyalty_reservations ADD COLUMN cart_fingerprint VARCHAR(64)
 CHECK(cart_fingerprint ~ '^[0-9a-f]{64}$');
ALTER TABLE loyalty_reservations ALTER COLUMN cart_revision DROP NOT NULL;
ALTER TABLE loyalty_reservations ADD CONSTRAINT ck_loyalty_cart_identity
 CHECK(cart_revision IS NOT NULL OR cart_fingerprint IS NOT NULL);
ALTER TABLE loyalty_reservations ADD CONSTRAINT ux_loyalty_reservation_fingerprint UNIQUE(id,cart_fingerprint);

CREATE TABLE catalog_loyalty_price_profiles (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK(id>0),
 variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 revision BIGINT NOT NULL CHECK(revision>0),
 currency VARCHAR(3) NOT NULL CHECK(currency='ARS'),
 gross_unit_minor BIGINT NOT NULL CHECK(gross_unit_minor>=0),
 merchandise_unit_minor BIGINT NOT NULL CHECK(merchandise_unit_minor>=0),
 excluded_tax_unit_minor BIGINT NOT NULL CHECK(excluded_tax_unit_minor>=0),
 classification VARCHAR(32) NOT NULL CHECK(classification IN ('STANDARD','OUTLET','GIFT_VALUE','LOYALTY_VALUE')),
 evidence_kind VARCHAR(40) NOT NULL CHECK(evidence_kind='MERCHANT_ACCOUNTANT_PROFILE'),
 source_reference TEXT NOT NULL CHECK(octet_length(source_reference) BETWEEN 1 AND 128 AND btrim(source_reference)<>''),
 admin_command_id UUID NOT NULL UNIQUE CHECK(admin_command_id<>'00000000-0000-0000-0000-000000000000'),
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at),
 CHECK(gross_unit_minor::numeric=merchandise_unit_minor::numeric+excluded_tax_unit_minor::numeric),
 UNIQUE(variant_id,revision), UNIQUE(id,variant_id,revision)
);
-- Head is derived from append-only history; there is no independently writable head projection.
CREATE VIEW catalog_loyalty_price_profile_heads AS
 SELECT DISTINCT ON (variant_id) variant_id,id,revision FROM catalog_loyalty_price_profiles ORDER BY variant_id,revision DESC;
CREATE FUNCTION loyalty_serialize_profile_revision() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_product BIGINT; v_head BIGINT;
BEGIN
 SELECT product_id INTO STRICT v_product FROM public.product_variants WHERE id=NEW.variant_id;
 PERFORM 1 FROM public.products WHERE id=v_product FOR UPDATE;
 PERFORM 1 FROM public.product_variants WHERE id=NEW.variant_id AND product_id=v_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile variant changed' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(revision),0) INTO v_head FROM public.catalog_loyalty_price_profiles WHERE variant_id=NEW.variant_id;
 IF NEW.revision::numeric<>v_head::numeric+1 THEN
  RAISE EXCEPTION 'profile requires next serialized revision' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_profile_revision BEFORE INSERT ON catalog_loyalty_price_profiles
 FOR EACH ROW EXECUTE FUNCTION loyalty_serialize_profile_revision();

CREATE TABLE loyalty_quote_snapshots (
 reservation_id UUID PRIMARY KEY,
 cart_fingerprint VARCHAR(64) NOT NULL CHECK(cart_fingerprint ~ '^[0-9a-f]{64}$'),
 snapshot_hash VARCHAR(64) NOT NULL CHECK(snapshot_hash ~ '^[0-9a-f]{64}$'),
 policy_version VARCHAR(32) NOT NULL CHECK(policy_version='loyalty-policy-v1'),
 wallet_revision_before BIGINT NOT NULL CHECK(wallet_revision_before>=0),
 wallet_revision_after BIGINT NOT NULL CHECK(wallet_revision_after>0),
 selected_points BIGINT NOT NULL CHECK(selected_points>0),
 discount_minor BIGINT NOT NULL CHECK(discount_minor>0),
 snapshot_revision BIGINT NOT NULL DEFAULT 0 CHECK(snapshot_revision>=0),
 CHECK(wallet_revision_after::numeric=wallet_revision_before::numeric+1),
 CHECK(discount_minor::numeric=selected_points::numeric*100),
 FOREIGN KEY(reservation_id,cart_fingerprint) REFERENCES loyalty_reservations(id,cart_fingerprint) ON DELETE RESTRICT,
 UNIQUE(reservation_id,snapshot_revision), UNIQUE(reservation_id,cart_fingerprint,snapshot_hash,snapshot_revision)
);
CREATE TABLE loyalty_quote_lines (
 reservation_id UUID NOT NULL REFERENCES loyalty_quote_snapshots(reservation_id) ON DELETE RESTRICT,
 cart_item_id BIGINT NOT NULL CHECK(cart_item_id>0), -- stable evidence, intentionally no FK to cleared mutable cart
 variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 profile_id BIGINT NOT NULL,
 profile_revision BIGINT NOT NULL CHECK(profile_revision>0),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 original_unit_minor BIGINT NOT NULL CHECK(original_unit_minor>=0),
 effective_unit_minor BIGINT NOT NULL CHECK(effective_unit_minor=original_unit_minor),
 gross_minor BIGINT NOT NULL CHECK(gross_minor>=0),
 merchandise_minor BIGINT NOT NULL CHECK(merchandise_minor>=0),
 excluded_tax_minor BIGINT NOT NULL CHECK(excluded_tax_minor>=0),
 eligible_minor BIGINT NOT NULL CHECK(eligible_minor>=0),
 classification VARCHAR(32) NOT NULL CHECK(classification IN ('STANDARD','OUTLET','GIFT_VALUE','LOYALTY_VALUE')),
 existing_discount_state VARCHAR(16) NOT NULL CHECK(existing_discount_state='NONE'),
 snapshot_revision BIGINT NOT NULL DEFAULT 0 CHECK(snapshot_revision>=0),
 FOREIGN KEY(reservation_id,snapshot_revision) REFERENCES loyalty_quote_snapshots(reservation_id,snapshot_revision) ON DELETE RESTRICT,
 PRIMARY KEY(reservation_id,cart_item_id), UNIQUE(reservation_id,variant_id),
 FOREIGN KEY(profile_id,variant_id,profile_revision) REFERENCES catalog_loyalty_price_profiles(id,variant_id,revision) ON DELETE RESTRICT,
 CHECK(gross_minor::numeric=quantity::numeric*effective_unit_minor),
 CHECK(gross_minor::numeric=merchandise_minor::numeric+excluded_tax_minor),
 CHECK(eligible_minor=CASE WHEN classification='STANDARD' THEN merchandise_minor ELSE 0 END)
);
CREATE TABLE loyalty_order_snapshots (
 order_id BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
 payment_id BIGINT NOT NULL UNIQUE,
 cart_fingerprint VARCHAR(64) NOT NULL CHECK(cart_fingerprint ~ '^[0-9a-f]{64}$'),
 policy_version VARCHAR(32) NOT NULL CHECK(policy_version='loyalty-policy-v1'),
 availability VARCHAR(16) NOT NULL CHECK(availability IN ('AVAILABLE','UNAVAILABLE')),
 unavailable_reason VARCHAR(40),
 reservation_id UUID UNIQUE,
 quote_hash VARCHAR(64),
 net_subtotal_minor BIGINT NOT NULL CHECK(net_subtotal_minor>=0),
 shipping_minor BIGINT NOT NULL CHECK(shipping_minor>=0),
 total_minor BIGINT NOT NULL CHECK(total_minor>=0),
 discount_minor BIGINT NOT NULL CHECK(discount_minor>=0),
 final_earning_minor BIGINT,
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at),
 snapshot_revision BIGINT NOT NULL DEFAULT 0 CHECK(snapshot_revision>=0),
 quote_snapshot_revision BIGINT CHECK(quote_snapshot_revision>=0),
 UNIQUE(order_id,snapshot_revision),
 CHECK(total_minor::numeric=net_subtotal_minor::numeric+shipping_minor),
 CHECK((availability='AVAILABLE' AND unavailable_reason IS NULL AND final_earning_minor>=0 AND final_earning_minor IS NOT NULL)
    OR (availability='UNAVAILABLE' AND unavailable_reason IS NOT NULL AND unavailable_reason IN
     ('MISSING_PROFILE','MISSING_TAX_EVIDENCE','WRONG_CURRENCY','CONTRADICTORY_BREAKDOWN','STALE_SOURCE','CART_CHANGED','DISCOUNT_PRESENT','UNKNOWN')
     AND reservation_id IS NULL AND quote_hash IS NULL AND quote_snapshot_revision IS NULL AND discount_minor=0 AND final_earning_minor IS NULL)),
 CHECK((reservation_id IS NULL AND quote_hash IS NULL AND quote_snapshot_revision IS NULL AND discount_minor=0) OR
       (reservation_id IS NOT NULL AND quote_hash IS NOT NULL AND quote_snapshot_revision IS NOT NULL AND discount_minor>0)),
 FOREIGN KEY(payment_id,order_id) REFERENCES payments(id,order_id) ON DELETE RESTRICT,
 FOREIGN KEY(reservation_id,cart_fingerprint,quote_hash,quote_snapshot_revision) REFERENCES loyalty_quote_snapshots(reservation_id,cart_fingerprint,snapshot_hash,snapshot_revision) ON DELETE RESTRICT,
 UNIQUE(reservation_id,order_id,payment_id)
);
CREATE TABLE loyalty_order_lines (
 order_id BIGINT NOT NULL REFERENCES loyalty_order_snapshots(order_id) ON DELETE RESTRICT,
 order_item_id BIGINT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
 cart_item_id BIGINT NOT NULL CHECK(cart_item_id>0),
 variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
 profile_id BIGINT NOT NULL,
 profile_revision BIGINT NOT NULL CHECK(profile_revision>0),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 original_unit_minor BIGINT NOT NULL CHECK(original_unit_minor>=0),
 effective_unit_minor BIGINT NOT NULL CHECK(effective_unit_minor>=0 AND effective_unit_minor<=original_unit_minor),
 gross_minor BIGINT NOT NULL CHECK(gross_minor>=0),
 merchandise_minor BIGINT NOT NULL CHECK(merchandise_minor>=0),
 excluded_tax_minor BIGINT NOT NULL CHECK(excluded_tax_minor>=0),
 eligible_minor BIGINT NOT NULL CHECK(eligible_minor>=0),
 allocated_discount_minor BIGINT NOT NULL CHECK(allocated_discount_minor>=0 AND allocated_discount_minor<=eligible_minor),
 payable_minor BIGINT NOT NULL CHECK(payable_minor>=0),
 final_earning_minor BIGINT NOT NULL CHECK(final_earning_minor>=0),
 classification VARCHAR(32) NOT NULL CHECK(classification IN ('STANDARD','OUTLET','GIFT_VALUE','LOYALTY_VALUE')),
 existing_discount_state VARCHAR(16) NOT NULL CHECK(existing_discount_state IN ('NONE','PRESENT')),
 snapshot_revision BIGINT NOT NULL DEFAULT 0 CHECK(snapshot_revision>=0),
 FOREIGN KEY(order_id,snapshot_revision) REFERENCES loyalty_order_snapshots(order_id,snapshot_revision) ON DELETE RESTRICT,
 PRIMARY KEY(order_id,cart_item_id), UNIQUE(order_id,variant_id),
 FOREIGN KEY(profile_id,variant_id,profile_revision) REFERENCES catalog_loyalty_price_profiles(id,variant_id,revision) ON DELETE RESTRICT,
 CHECK(gross_minor::numeric=quantity::numeric*effective_unit_minor),
 CHECK(gross_minor::numeric=merchandise_minor::numeric+excluded_tax_minor),
 CHECK(eligible_minor=CASE WHEN classification='STANDARD' THEN merchandise_minor ELSE 0 END),
 CHECK(payable_minor::numeric=gross_minor::numeric-allocated_discount_minor),
 CHECK(final_earning_minor::numeric=eligible_minor::numeric-allocated_discount_minor),
 CHECK((existing_discount_state='PRESENT' AND original_unit_minor>effective_unit_minor) OR
       (existing_discount_state='NONE' AND original_unit_minor=effective_unit_minor))
);
CREATE TABLE loyalty_checkout_bindings (
 reservation_id UUID PRIMARY KEY,
 order_id BIGINT NOT NULL UNIQUE,
 payment_id BIGINT NOT NULL UNIQUE,
 bound_at TIMESTAMPTZ NOT NULL CHECK(isfinite(bound_at) AND date_trunc('second',bound_at)=bound_at),
 snapshot_revision BIGINT NOT NULL DEFAULT 0 CHECK(snapshot_revision>=0),
 FOREIGN KEY(order_id,snapshot_revision) REFERENCES loyalty_order_snapshots(order_id,snapshot_revision) ON DELETE RESTRICT,
 FOREIGN KEY(reservation_id,order_id,payment_id) REFERENCES loyalty_order_snapshots(reservation_id,order_id,payment_id) ON DELETE RESTRICT
);

-- Replace named-by-PostgreSQL V42 finite-state constraints forward only.
DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.loyalty_reservation_states'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%state%' LOOP
  EXECUTE format('ALTER TABLE public.loyalty_reservation_states DROP CONSTRAINT %I',c.conname);
 END LOOP;
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.loyalty_reservation_history'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%to_state%' LOOP
  EXECUTE format('ALTER TABLE public.loyalty_reservation_history DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE loyalty_reservation_states ADD CONSTRAINT ck_loyalty_reservation_state_d CHECK
 ((state='QUOTED' AND revision=0) OR (state IN ('RELEASED','EXPIRED','PAYMENT_PENDING') AND revision=1)
 OR (state='RECONCILIATION_REQUIRED' AND revision=2));
ALTER TABLE loyalty_reservation_history ADD CONSTRAINT ck_loyalty_reservation_history_d CHECK
 ((revision=0 AND from_state IS NULL AND to_state='QUOTED')
 OR (revision=1 AND from_state IS NOT NULL AND from_state='QUOTED' AND to_state IN ('RELEASED','EXPIRED','PAYMENT_PENDING'))
 OR (revision=2 AND from_state IS NOT NULL AND from_state='PAYMENT_PENDING' AND to_state='RECONCILIATION_REQUIRED'));
CREATE OR REPLACE FUNCTION loyalty_protect_reservation_state() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'loyalty reservation projection is durable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUOTED' OR NEW.revision<>0 THEN RAISE EXCEPTION 'reservation starts quoted' USING ERRCODE='23514'; END IF;
 ELSIF ROW(NEW.reservation_id,NEW.wallet_id) IS DISTINCT FROM ROW(OLD.reservation_id,OLD.wallet_id)
  OR NOT ((OLD.state='QUOTED' AND OLD.revision=0 AND NEW.state IN ('RELEASED','EXPIRED','PAYMENT_PENDING') AND NEW.revision=1)
   OR (OLD.state='PAYMENT_PENDING' AND OLD.revision=1 AND NEW.state='RECONCILIATION_REQUIRED' AND NEW.revision=2)) THEN
  RAISE EXCEPTION 'invalid reservation transition or identity' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION loyalty_validate_price_line() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p RECORD; v_product BIGINT; v_head BIGINT;
BEGIN
 SELECT product_id INTO STRICT v_product FROM public.product_variants WHERE id=NEW.variant_id;
 PERFORM 1 FROM public.products WHERE id=v_product FOR UPDATE;
 PERFORM 1 FROM public.product_variants WHERE id=NEW.variant_id AND product_id=v_product FOR UPDATE;
 SELECT max(revision) INTO v_head FROM public.catalog_loyalty_price_profiles WHERE variant_id=NEW.variant_id;
 IF NEW.profile_revision<>v_head THEN RAISE EXCEPTION 'stale profile head' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT p FROM public.catalog_loyalty_price_profiles WHERE id=NEW.profile_id FOR SHARE;
 IF NEW.classification<>p.classification OR NEW.effective_unit_minor<>p.gross_unit_minor
  OR NEW.merchandise_minor::numeric<>NEW.quantity::numeric*p.merchandise_unit_minor
  OR NEW.excluded_tax_minor::numeric<>NEW.quantity::numeric*p.excluded_tax_unit_minor THEN
  RAISE EXCEPTION 'line contradicts profile evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_quote_profile BEFORE INSERT ON loyalty_quote_lines
 FOR EACH ROW EXECUTE FUNCTION loyalty_validate_price_line();
CREATE TRIGGER trg_loyalty_order_profile BEFORE INSERT ON loyalty_order_lines
 FOR EACH ROW EXECUTE FUNCTION loyalty_validate_price_line();

CREATE FUNCTION loyalty_check_quote_evidence() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE q RECORD; r RECORD; total_eligible NUMERIC; n BIGINT; target UUID;
BEGIN
 target:=NEW.reservation_id;
 SELECT * INTO STRICT q FROM public.loyalty_quote_snapshots WHERE reservation_id=target;
 SELECT * INTO STRICT r FROM public.loyalty_reservations WHERE id=target;
 SELECT count(*),coalesce(sum(eligible_minor::numeric),0) INTO n,total_eligible FROM public.loyalty_quote_lines WHERE reservation_id=target;
 IF n=0 OR r.points<>q.selected_points OR r.policy_version<>q.policy_version
  OR r.wallet_revision<>q.wallet_revision_before OR q.discount_minor>total_eligible
  OR q.selected_points>least(total_eligible/1000,10000) THEN
  RAISE EXCEPTION 'incomplete or contradictory quote evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_quote_closure AFTER INSERT ON loyalty_quote_snapshots
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_quote_evidence();
CREATE CONSTRAINT TRIGGER trg_loyalty_quote_line_closure AFTER INSERT ON loyalty_quote_lines
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_quote_evidence();

CREATE FUNCTION loyalty_check_order_evidence() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target BIGINT; s RECORD; o RECORD; p RECORD; n BIGINT; item_count BIGINT;
 net NUMERIC; discount NUMERIC; earning NUMERIC; base NUMERIC; floors NUMERIC;
BEGIN
 target:=NEW.order_id;
 SELECT * INTO STRICT s FROM public.loyalty_order_snapshots WHERE order_id=target;
 SELECT * INTO STRICT o FROM public.orders WHERE id=target;
 SELECT * INTO STRICT p FROM public.payments WHERE id=s.payment_id;
 IF o.subtotal*100<>s.net_subtotal_minor OR o.shipping_cost*100<>s.shipping_minor
  OR o.total*100<>s.total_minor OR p.amount*100<>s.total_minor OR o.currency<>'ARS' OR p.currency<>'ARS' THEN
  RAISE EXCEPTION 'frozen order and payment amount mismatch' USING ERRCODE='23514'; END IF;
 SELECT count(*),coalesce(sum(payable_minor::numeric),0),coalesce(sum(allocated_discount_minor::numeric),0),
  coalesce(sum(final_earning_minor::numeric),0),coalesce(sum(eligible_minor::numeric),0)
  INTO n,net,discount,earning,base FROM public.loyalty_order_lines WHERE order_id=target;
 IF s.availability='UNAVAILABLE' THEN
  IF n<>0 THEN RAISE EXCEPTION 'unavailable snapshot cannot fabricate lines' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 SELECT count(*) INTO item_count FROM public.order_items WHERE order_id=target;
 IF n=0 OR n<>item_count OR net<>s.net_subtotal_minor OR discount<>s.discount_minor OR earning<>s.final_earning_minor THEN
  RAISE EXCEPTION 'final lines and order totals mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.loyalty_order_lines l JOIN public.order_items i ON i.id=l.order_item_id WHERE l.order_id=target
  AND (i.order_id<>target OR i.variant_id<>l.variant_id OR i.quantity<>l.quantity
   OR i.original_unit_price*100<>l.original_unit_minor OR i.effective_unit_price*100<>l.effective_unit_minor
   OR i.subtotal*100<>l.gross_minor OR (l.existing_discount_state='NONE' AND (i.discount_amount<>0 OR i.offer_id IS NOT NULL OR i.campaign_reference IS NOT NULL)))) THEN
  RAISE EXCEPTION 'order item correlation mismatch' USING ERRCODE='23514'; END IF;
 IF s.reservation_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.loyalty_checkout_bindings b JOIN public.loyalty_reservation_states st ON st.reservation_id=b.reservation_id
    WHERE b.reservation_id=s.reservation_id AND b.order_id=target AND b.payment_id=s.payment_id AND st.state IN ('PAYMENT_PENDING','RECONCILIATION_REQUIRED'))
   OR (SELECT count(*) FROM public.loyalty_quote_lines WHERE reservation_id=s.reservation_id)<>n
   OR EXISTS(SELECT 1 FROM public.loyalty_order_lines l LEFT JOIN public.loyalty_quote_lines q
    ON q.reservation_id=s.reservation_id AND q.cart_item_id=l.cart_item_id WHERE l.order_id=target
    AND (q.cart_item_id IS NULL OR ROW(q.variant_id,q.profile_id,q.profile_revision,q.quantity,q.original_unit_minor,q.effective_unit_minor,
      q.gross_minor,q.merchandise_minor,q.excluded_tax_minor,q.eligible_minor,q.classification,q.existing_discount_state)
     IS DISTINCT FROM ROW(l.variant_id,l.profile_id,l.profile_revision,l.quantity,l.original_unit_minor,l.effective_unit_minor,
      l.gross_minor,l.merchandise_minor,l.excluded_tax_minor,l.eligible_minor,l.classification,l.existing_discount_state)))
   OR o.customer_id<>(SELECT w.customer_id FROM public.loyalty_reservations r JOIN public.loyalty_wallets w ON w.id=r.wallet_id WHERE r.id=s.reservation_id)
   OR s.discount_minor<>(SELECT discount_minor FROM public.loyalty_quote_snapshots WHERE reservation_id=s.reservation_id) THEN
   RAISE EXCEPTION 'reservation quote final bijection mismatch' USING ERRCODE='23514'; END IF;
  SELECT sum(floor(s.discount_minor::numeric*eligible_minor/base)) INTO floors FROM public.loyalty_order_lines WHERE order_id=target;
  IF EXISTS(SELECT 1 FROM (
   SELECT allocated_discount_minor, floor(s.discount_minor::numeric*eligible_minor/base) AS f,
    row_number() OVER(ORDER BY order_item_id) AS ordinal
   FROM public.loyalty_order_lines WHERE order_id=target AND eligible_minor>0
  ) allocation WHERE allocated_discount_minor<>f+CASE WHEN ordinal<=s.discount_minor-floors THEN 1 ELSE 0 END) THEN
   RAISE EXCEPTION 'allocation must use exact floors and final item id remainder' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_order_closure AFTER INSERT ON loyalty_order_snapshots
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_order_evidence();
CREATE CONSTRAINT TRIGGER trg_loyalty_order_line_closure AFTER INSERT ON loyalty_order_lines
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_order_evidence();
CREATE CONSTRAINT TRIGGER trg_loyalty_binding_order_closure AFTER INSERT ON loyalty_checkout_bindings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_order_evidence();

CREATE FUNCTION loyalty_check_binding_state() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target UUID; current_state TEXT; b RECORD; r RECORD;
BEGIN
 target:=NEW.reservation_id;
 SELECT state INTO STRICT current_state FROM public.loyalty_reservation_states WHERE reservation_id=target;
 SELECT * INTO b FROM public.loyalty_checkout_bindings WHERE reservation_id=target;
 IF (current_state IN ('PAYMENT_PENDING','RECONCILIATION_REQUIRED')) IS DISTINCT FROM (b.reservation_id IS NOT NULL) THEN
  RAISE EXCEPTION 'payment state requires exact durable binding' USING ERRCODE='23514'; END IF;
 IF b.reservation_id IS NOT NULL THEN
  SELECT * INTO STRICT r FROM public.loyalty_reservations WHERE id=target;
  IF b.bound_at<r.created_at OR b.bound_at>=r.expires_at OR NOT EXISTS(
   SELECT 1 FROM public.loyalty_reservation_history h WHERE h.reservation_id=target AND h.revision=1
    AND h.to_state='PAYMENT_PENDING' AND h.recorded_at=b.bound_at) THEN
   RAISE EXCEPTION 'binding history or quote TTL mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_state_binding AFTER INSERT OR UPDATE ON loyalty_reservation_states
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_binding_state();
CREATE CONSTRAINT TRIGGER trg_loyalty_binding_state AFTER INSERT ON loyalty_checkout_bindings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_binding_state();

CREATE FUNCTION loyalty_protect_frozen_order() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target BIGINT;
BEGIN
 IF TG_TABLE_NAME='orders' THEN target:=OLD.id; ELSE target:=OLD.order_id; END IF;
 IF TG_TABLE_NAME='order_items' AND TG_OP='UPDATE' THEN
  IF EXISTS(SELECT 1 FROM public.loyalty_order_snapshots WHERE order_id IN (OLD.order_id,NEW.order_id)) THEN
   RAISE EXCEPTION 'loyalty monetary evidence is frozen' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.loyalty_order_snapshots WHERE order_id=target) THEN
  IF TG_OP='DELETE' OR TG_TABLE_NAME='order_items' THEN
   RAISE EXCEPTION 'loyalty monetary evidence is frozen' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='orders' THEN
   IF ROW(NEW.subtotal,NEW.shipping_cost,NEW.total,NEW.currency,NEW.customer_id) IS DISTINCT FROM
      ROW(OLD.subtotal,OLD.shipping_cost,OLD.total,OLD.currency,OLD.customer_id) THEN
    RAISE EXCEPTION 'order monetary evidence is frozen' USING ERRCODE='23514'; END IF;
  ELSIF ROW(NEW.order_id,NEW.amount,NEW.currency) IS DISTINCT FROM ROW(OLD.order_id,OLD.amount,OLD.currency) THEN
   RAISE EXCEPTION 'payment monetary evidence is frozen' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_frozen_order BEFORE UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION loyalty_protect_frozen_order();
CREATE TRIGGER trg_loyalty_frozen_payment BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION loyalty_protect_frozen_order();
CREATE TRIGGER trg_loyalty_frozen_item BEFORE UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION loyalty_protect_frozen_order();
CREATE FUNCTION loyalty_protect_frozen_order_insert() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.loyalty_order_snapshots WHERE order_id=NEW.order_id) THEN
  RAISE EXCEPTION 'frozen order cannot gain items' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_frozen_item_insert BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION loyalty_protect_frozen_order_insert();

DO $$ DECLARE evidence TEXT; BEGIN
 FOREACH evidence IN ARRAY ARRAY['catalog_loyalty_price_profiles','loyalty_quote_snapshots','loyalty_quote_lines',
  'loyalty_order_snapshots','loyalty_order_lines','loyalty_checkout_bindings'] LOOP
  EXECUTE format('CREATE TRIGGER trg_loyalty_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.loyalty_reject_evidence_mutation()',evidence);
  EXECUTE format('CREATE TRIGGER trg_loyalty_immutable_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.loyalty_reject_evidence_mutation()',evidence);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,storecore_runtime',evidence);
  EXECUTE format('GRANT SELECT ON public.%I TO storecore_runtime',evidence);
  EXECUTE format('GRANT ALL ON public.%I TO storecore_migrator',evidence);
 END LOOP;
END $$;
REVOKE ALL ON catalog_loyalty_price_profile_heads FROM PUBLIC,storecore_runtime;
GRANT SELECT ON catalog_loyalty_price_profile_heads TO storecore_runtime,storecore_migrator;
REVOKE ALL ON FUNCTION loyalty_serialize_profile_revision(),loyalty_validate_price_line(),loyalty_check_quote_evidence(),
 loyalty_check_order_evidence(),loyalty_check_binding_state(),loyalty_protect_frozen_order(),loyalty_protect_frozen_order_insert() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_serialize_profile_revision(),loyalty_validate_price_line(),loyalty_check_quote_evidence(),
 loyalty_check_order_evidence(),loyalty_check_binding_state(),loyalty_protect_frozen_order(),loyalty_protect_frozen_order_insert() TO storecore_migrator;
CREATE OR REPLACE FUNCTION loyalty_assert_lot_closure(target_lot BIGINT) RETURNS VOID LANGUAGE plpgsql
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
  WHERE a.lot_id=target_lot AND s.state IN ('QUOTED','PAYMENT_PENDING','RECONCILIATION_REQUIRED');
 IF issued_events<>expected::numeric OR NOT EXISTS(
  SELECT 1 FROM public.loyalty_lot_partitions p WHERE p.lot_id=target_lot
   AND p.issued::numeric=issued_events AND p.reversed::numeric=reversed_events
   AND p.expired::numeric=expired_events AND p.held::numeric=held_allocations AND p.redeemed=0
   AND p.free::numeric=issued_events-reversed_events-expired_events-held_allocations
 ) THEN RAISE EXCEPTION 'loyalty lot projection requires complete matching evidence' USING ERRCODE='23514'; END IF;
END $$;

-- A snapshot is sealed by its creating transaction. Append-only child rows cannot
-- be appended in a later transaction to change an already published snapshot.
CREATE FUNCTION loyalty_require_atomic_evidence_parent() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE parent_xid xid; current_xid xid; order_creation_xid xid8;
BEGIN
 IF TG_TABLE_NAME='loyalty_order_snapshots' THEN
  SELECT loyalty_creation_xid INTO STRICT order_creation_xid FROM public.orders WHERE id=NEW.order_id;
  IF order_creation_xid IS DISTINCT FROM pg_current_xact_id() THEN
   RAISE EXCEPTION 'evidence must be complete in original atomic transaction' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 current_xid:=(pg_current_xact_id()::text::numeric % 4294967296)::text::xid;
 IF TG_TABLE_NAME='loyalty_quote_snapshots' THEN
  SELECT xmin INTO STRICT parent_xid FROM public.loyalty_reservations WHERE id=NEW.reservation_id;
 ELSIF TG_TABLE_NAME='loyalty_quote_lines' THEN
  SELECT xmin INTO STRICT parent_xid FROM public.loyalty_quote_snapshots WHERE reservation_id=NEW.reservation_id;
 ELSE
  SELECT xmin INTO STRICT parent_xid FROM public.loyalty_order_snapshots WHERE order_id=NEW.order_id;
 END IF;
 IF parent_xid<>current_xid THEN
  RAISE EXCEPTION 'evidence must be complete in original atomic transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE evidence TEXT; BEGIN
 FOREACH evidence IN ARRAY ARRAY['loyalty_quote_snapshots','loyalty_quote_lines','loyalty_order_snapshots','loyalty_order_lines','loyalty_checkout_bindings'] LOOP
  EXECUTE format('CREATE TRIGGER trg_loyalty_atomic_evidence BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.loyalty_require_atomic_evidence_parent()',evidence);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION loyalty_require_atomic_evidence_parent() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_require_atomic_evidence_parent() TO storecore_migrator;
CREATE FUNCTION loyalty_check_exact_reservation_evidence() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.cart_fingerprint IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.loyalty_quote_snapshots WHERE reservation_id=NEW.id AND cart_fingerprint=NEW.cart_fingerprint) THEN
  RAISE EXCEPTION 'exact cart reservation requires complete quote evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_exact_reservation_evidence AFTER INSERT ON loyalty_reservations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_exact_reservation_evidence();
REVOKE ALL ON FUNCTION loyalty_check_exact_reservation_evidence() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_check_exact_reservation_evidence() TO storecore_migrator;

REVOKE ALL ON SEQUENCE catalog_loyalty_price_profiles_id_seq FROM PUBLIC,storecore_runtime;
GRANT USAGE, SELECT ON SEQUENCE catalog_loyalty_price_profiles_id_seq TO storecore_migrator;
