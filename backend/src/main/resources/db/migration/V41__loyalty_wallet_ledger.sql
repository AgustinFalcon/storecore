-- Non-operative persistence foundation. No capability promotion or privileged writer.
CREATE TABLE loyalty_wallets (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 customer_id BIGINT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
 owner_realm VARCHAR(16) NOT NULL DEFAULT 'CUSTOMER' CHECK(owner_realm='CUSTOMER'),
 policy_version VARCHAR(32) NOT NULL DEFAULT 'loyalty-policy-v1' CHECK(policy_version='loyalty-policy-v1'),
 revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('second',clock_timestamp()),
 CHECK(isfinite(created_at) AND date_trunc('second',created_at)=created_at)
);
CREATE TABLE loyalty_source_applications (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'),
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 source_type VARCHAR(32) NOT NULL CHECK(source_type IN ('PAYMENT_ACCREDITATION','ADMIN_ADJUSTMENT','EXPIRY')),
 source_id VARCHAR(256) NOT NULL CHECK(source_id<>'' AND source_id=btrim(source_id) AND source_id !~ '[[:cntrl:]]'),
 policy_version VARCHAR(32) NOT NULL CHECK(policy_version='loyalty-policy-v1'),
 points BIGINT NOT NULL CHECK(points>0),
 accepted_at TIMESTAMPTZ NOT NULL CHECK(isfinite(accepted_at) AND date_trunc('second',accepted_at)=accepted_at),
 UNIQUE(source_type,source_id,policy_version), UNIQUE(id,wallet_id,points)
);
CREATE TABLE loyalty_ledger (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 source_application_id UUID NOT NULL UNIQUE,
 movement VARCHAR(32) NOT NULL CHECK(movement IN ('EARN','MANUAL_ADJUSTMENT','EXPIRE')),
 direction VARCHAR(8) NULL,
 points BIGINT NOT NULL CHECK(points>0),
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at),
 CHECK((movement='MANUAL_ADJUSTMENT' AND direction IS NOT NULL AND direction IN ('CREDIT','DEBIT')) OR (movement<>'MANUAL_ADJUSTMENT' AND direction IS NULL)),
 FOREIGN KEY(source_application_id,wallet_id,points) REFERENCES loyalty_source_applications(id,wallet_id,points) ON DELETE RESTRICT,
 UNIQUE(id,wallet_id), UNIQUE(id,wallet_id,points)
);
CREATE INDEX ix_loyalty_ledger_wallet_history ON loyalty_ledger(wallet_id,recorded_at DESC,id DESC);
CREATE TABLE loyalty_lots (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 ledger_id BIGINT NOT NULL UNIQUE,
 policy_version VARCHAR(32) NOT NULL DEFAULT 'loyalty-policy-v1' CHECK(policy_version='loyalty-policy-v1'),
 issued BIGINT NOT NULL CHECK(issued>0),
 accepted_at TIMESTAMPTZ NOT NULL CHECK(isfinite(accepted_at) AND date_trunc('second',accepted_at)=accepted_at),
 expires_at TIMESTAMPTZ NOT NULL CHECK(isfinite(expires_at) AND date_trunc('second',expires_at)=expires_at),
 CHECK(expires_at=accepted_at+interval '31536000 seconds'),
 FOREIGN KEY(ledger_id,wallet_id,issued) REFERENCES loyalty_ledger(id,wallet_id,points) ON DELETE RESTRICT,
 UNIQUE(id,wallet_id), UNIQUE(id,wallet_id,issued)
);
CREATE INDEX ix_loyalty_lots_wallet_fifo ON loyalty_lots(wallet_id,accepted_at,id);
CREATE TABLE loyalty_lot_partitions (
 lot_id BIGINT PRIMARY KEY,
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 -- Issued is a constrained copy, tied to the immutable lot by the composite FK.
 issued BIGINT NOT NULL CHECK(issued>0),
 free BIGINT NOT NULL CHECK(free>=0),
 held BIGINT NOT NULL CHECK(held>=0),
 redeemed BIGINT NOT NULL CHECK(redeemed>=0),
 expired BIGINT NOT NULL CHECK(expired>=0),
 reversed BIGINT NOT NULL CHECK(reversed>=0),
 CHECK(issued::numeric=free::numeric+held::numeric+redeemed::numeric+expired::numeric+reversed::numeric),
 FOREIGN KEY(lot_id,wallet_id,issued) REFERENCES loyalty_lots(id,wallet_id,issued) ON DELETE RESTRICT
);
CREATE INDEX ix_loyalty_partitions_wallet ON loyalty_lot_partitions(wallet_id,lot_id);
CREATE TABLE loyalty_allocation_events (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'),
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 lot_id BIGINT NOT NULL,
 ledger_id BIGINT NOT NULL,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('ISSUE','REVERSE','EXPIRE')),
 points BIGINT NOT NULL CHECK(points>0),
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at),
 FOREIGN KEY(lot_id,wallet_id) REFERENCES loyalty_lots(id,wallet_id) ON DELETE RESTRICT,
 FOREIGN KEY(ledger_id,wallet_id) REFERENCES loyalty_ledger(id,wallet_id) ON DELETE RESTRICT,
 UNIQUE(lot_id,ledger_id,kind)
);
CREATE UNIQUE INDEX uq_loyalty_lot_issue ON loyalty_allocation_events(lot_id) WHERE kind='ISSUE';
CREATE TABLE loyalty_command_bindings (
 command_id UUID PRIMARY KEY CHECK(command_id<>'00000000-0000-0000-0000-000000000000'),
 realm VARCHAR(16) NOT NULL,
 actor_id BIGINT NOT NULL CHECK(actor_id>0),
 operation VARCHAR(32) NOT NULL,
 aggregate_type VARCHAR(16) NOT NULL CHECK(aggregate_type='WALLET'),
 aggregate_ref TEXT NOT NULL CHECK(length(aggregate_ref) BETWEEN 1 AND 19 AND aggregate_ref ~ '^[1-9][0-9]*$'),
 request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 CHECK((realm='USER' AND operation='ADMIN_ADJUSTMENT') OR (realm='SYSTEM' AND operation='MATERIALIZE_EXPIRY')),
 CHECK(CASE WHEN aggregate_ref ~ '^[1-9][0-9]{0,18}$' THEN aggregate_ref::numeric<=9223372036854775807 ELSE false END)
);
CREATE TABLE loyalty_command_receipts (
 command_id UUID PRIMARY KEY REFERENCES loyalty_command_bindings(command_id) ON DELETE RESTRICT,
 outcome VARCHAR(32) NOT NULL CHECK(outcome IN ('APPLIED','INSUFFICIENT_BALANCE','REVISION_CONFLICT','INVALID_STATE','INVALID_DEFINITION','POLICY_MISMATCH','CART_CHANGED','INELIGIBLE','STACKING_FORBIDDEN','RECONCILIATION_REQUIRED','REVISION_EXHAUSTED')),
 original_http_status INTEGER NOT NULL,
 before_snapshot JSONB NOT NULL CHECK(jsonb_typeof(before_snapshot)='object'),
 after_snapshot JSONB NOT NULL CHECK(jsonb_typeof(after_snapshot)='object'),
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at),
 CHECK((outcome='APPLIED' AND original_http_status=200) OR (outcome<>'APPLIED' AND original_http_status=409))
);
CREATE TABLE loyalty_audit (
 id UUID PRIMARY KEY CHECK(id<>'00000000-0000-0000-0000-000000000000'),
 command_id UUID NOT NULL UNIQUE REFERENCES loyalty_command_receipts(command_id) ON DELETE RESTRICT,
 wallet_id BIGINT NOT NULL REFERENCES loyalty_wallets(id) ON DELETE RESTRICT,
 action VARCHAR(32) NOT NULL DEFAULT 'COMMAND_RECORDED' CHECK(action='COMMAND_RECORDED'),
 recorded_at TIMESTAMPTZ NOT NULL CHECK(isfinite(recorded_at) AND date_trunc('second',recorded_at)=recorded_at)
);
CREATE INDEX ix_loyalty_audit_wallet_history ON loyalty_audit(wallet_id,recorded_at DESC,id DESC);

CREATE FUNCTION loyalty_reject_evidence_mutation() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'loyalty evidence is append-only' USING ERRCODE='23514';
END $$;
CREATE FUNCTION loyalty_protect_wallet() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'loyalty wallet is durable' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>0 THEN RAISE EXCEPTION 'initial wallet revision must be zero' USING ERRCODE='23514'; END IF;
 ELSE
  IF ROW(NEW.id,NEW.customer_id,NEW.owner_realm,NEW.policy_version,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.customer_id,OLD.owner_realm,OLD.policy_version,OLD.created_at)
   OR NEW.revision::numeric<>OLD.revision::numeric+1 THEN
   RAISE EXCEPTION 'invalid loyalty wallet revision or identity' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_wallet BEFORE INSERT OR UPDATE OR DELETE ON loyalty_wallets FOR EACH ROW EXECUTE FUNCTION loyalty_protect_wallet();
CREATE TRIGGER trg_loyalty_wallet_truncate BEFORE TRUNCATE ON loyalty_wallets FOR EACH STATEMENT EXECUTE FUNCTION loyalty_reject_evidence_mutation();
CREATE FUNCTION loyalty_protect_partition() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'loyalty partition is durable' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.lot_id,NEW.wallet_id,NEW.issued) IS DISTINCT FROM ROW(OLD.lot_id,OLD.wallet_id,OLD.issued) THEN
  RAISE EXCEPTION 'loyalty partition identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_partition BEFORE UPDATE OR DELETE ON loyalty_lot_partitions FOR EACH ROW EXECUTE FUNCTION loyalty_protect_partition();
CREATE TRIGGER trg_loyalty_partition_truncate BEFORE TRUNCATE ON loyalty_lot_partitions FOR EACH STATEMENT EXECUTE FUNCTION loyalty_reject_evidence_mutation();
CREATE FUNCTION loyalty_validate_evidence() RETURNS TRIGGER LANGUAGE plpgsql
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
   WHERE b.command_id=NEW.command_id AND b.aggregate_ref=NEW.wallet_id::text AND r.recorded_at=NEW.recorded_at) THEN
   RAISE EXCEPTION 'loyalty audit command mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_loyalty_ledger_valid BEFORE INSERT ON loyalty_ledger FOR EACH ROW EXECUTE FUNCTION loyalty_validate_evidence();
CREATE TRIGGER trg_loyalty_lot_valid BEFORE INSERT ON loyalty_lots FOR EACH ROW EXECUTE FUNCTION loyalty_validate_evidence();
CREATE TRIGGER trg_loyalty_allocation_valid BEFORE INSERT ON loyalty_allocation_events FOR EACH ROW EXECUTE FUNCTION loyalty_validate_evidence();
CREATE TRIGGER trg_loyalty_audit_valid BEFORE INSERT ON loyalty_audit FOR EACH ROW EXECUTE FUNCTION loyalty_validate_evidence();
-- Cross-row evidence is complete at transaction end, never at an intermediate insert.
-- Future reservation/correction slices must replace these B-only partitions explicitly.
CREATE FUNCTION loyalty_check_ledger_closure() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target_ledger BIGINT; expected BIGINT; allocated NUMERIC;
BEGIN
 IF TG_TABLE_NAME='loyalty_ledger' THEN target_ledger:=NEW.id;
 ELSE target_ledger:=NEW.ledger_id; END IF;
 SELECT e.points INTO STRICT expected FROM public.loyalty_ledger e WHERE e.id=target_ledger;
 SELECT coalesce(sum(a.points::numeric),0) INTO allocated
  FROM public.loyalty_allocation_events a WHERE a.ledger_id=target_ledger;
 IF allocated<>expected::numeric THEN
  RAISE EXCEPTION 'loyalty ledger requires exact complete allocations' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_ledger_closure AFTER INSERT ON loyalty_ledger
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_ledger_closure();
CREATE CONSTRAINT TRIGGER trg_loyalty_event_ledger_closure AFTER INSERT ON loyalty_allocation_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_ledger_closure();
CREATE FUNCTION loyalty_check_lot_closure() RETURNS TRIGGER LANGUAGE plpgsql
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target_lot BIGINT; expected BIGINT; issued_events NUMERIC; reversed_events NUMERIC; expired_events NUMERIC;
BEGIN
 IF TG_TABLE_NAME='loyalty_lots' THEN target_lot:=NEW.id;
 ELSE target_lot:=NEW.lot_id; END IF;
 SELECT l.issued INTO STRICT expected FROM public.loyalty_lots l WHERE l.id=target_lot;
 SELECT coalesce(sum(a.points::numeric) FILTER(WHERE a.kind='ISSUE'),0),
        coalesce(sum(a.points::numeric) FILTER(WHERE a.kind='REVERSE'),0),
        coalesce(sum(a.points::numeric) FILTER(WHERE a.kind='EXPIRE'),0)
  INTO issued_events,reversed_events,expired_events
  FROM public.loyalty_allocation_events a WHERE a.lot_id=target_lot;
 IF issued_events<>expected::numeric OR NOT EXISTS(
  SELECT 1 FROM public.loyalty_lot_partitions p WHERE p.lot_id=target_lot
   AND p.issued::numeric=issued_events AND p.reversed::numeric=reversed_events
   AND p.expired::numeric=expired_events AND p.held=0 AND p.redeemed=0
   AND p.free::numeric=issued_events-reversed_events-expired_events
 ) THEN RAISE EXCEPTION 'loyalty lot projection requires complete matching evidence' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_loyalty_lot_closure AFTER INSERT ON loyalty_lots
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_lot_closure();
CREATE CONSTRAINT TRIGGER trg_loyalty_partition_closure AFTER INSERT OR UPDATE ON loyalty_lot_partitions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_lot_closure();
CREATE CONSTRAINT TRIGGER trg_loyalty_event_lot_closure AFTER INSERT ON loyalty_allocation_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION loyalty_check_lot_closure();
DO $$
DECLARE evidence TEXT;
BEGIN
 FOREACH evidence IN ARRAY ARRAY['loyalty_source_applications','loyalty_ledger','loyalty_lots','loyalty_allocation_events','loyalty_command_bindings','loyalty_command_receipts','loyalty_audit'] LOOP
  EXECUTE format('CREATE TRIGGER trg_loyalty_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.loyalty_reject_evidence_mutation()',evidence);
  EXECUTE format('CREATE TRIGGER trg_loyalty_immutable_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.loyalty_reject_evidence_mutation()',evidence);
 END LOOP;
END $$;
REVOKE ALL ON loyalty_wallets,loyalty_source_applications,loyalty_ledger,loyalty_lots,loyalty_lot_partitions,loyalty_allocation_events,loyalty_command_bindings,loyalty_command_receipts,loyalty_audit FROM PUBLIC,storecore_runtime;
GRANT SELECT ON loyalty_wallets,loyalty_source_applications,loyalty_ledger,loyalty_lots,loyalty_lot_partitions,loyalty_allocation_events,loyalty_command_bindings,loyalty_command_receipts,loyalty_audit TO storecore_runtime;
GRANT ALL ON loyalty_wallets,loyalty_source_applications,loyalty_ledger,loyalty_lots,loyalty_lot_partitions,loyalty_allocation_events,loyalty_command_bindings,loyalty_command_receipts,loyalty_audit TO storecore_migrator;
REVOKE ALL ON SEQUENCE loyalty_wallets_id_seq,loyalty_ledger_id_seq,loyalty_lots_id_seq FROM PUBLIC,storecore_runtime;
GRANT ALL ON SEQUENCE loyalty_wallets_id_seq,loyalty_ledger_id_seq,loyalty_lots_id_seq TO storecore_migrator;
REVOKE ALL ON FUNCTION loyalty_reject_evidence_mutation(),loyalty_protect_wallet(),loyalty_protect_partition(),loyalty_validate_evidence(),loyalty_check_ledger_closure(),loyalty_check_lot_closure() FROM PUBLIC,storecore_runtime;
GRANT EXECUTE ON FUNCTION loyalty_reject_evidence_mutation(),loyalty_protect_wallet(),loyalty_protect_partition(),loyalty_validate_evidence(),loyalty_check_ledger_closure(),loyalty_check_lot_closure() TO storecore_migrator;
