-- Additive Mercado Pago Orders checkout lane. Does not rewrite V1 history or IDs.

ALTER TABLE payments ADD CONSTRAINT ux_payments_id_order UNIQUE (id, order_id);

DO $$
DECLARE c name;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%PENDING_PAYMENT%'
    AND pg_get_constraintdef(oid) LIKE '%buyer_snapshot%';
  IF c IS NULL THEN
    RAISE EXCEPTION 'orders combined status check not found';
  END IF;
  EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', c);
END $$;

ALTER TABLE orders ADD CONSTRAINT ck_orders_status_and_amounts CHECK (
  jsonb_typeof(buyer_snapshot) = 'object'
  AND jsonb_typeof(checkout_snapshot) = 'object'
  AND status IN ('CREATED', 'PENDING_PAYMENT', 'PAID', 'PAID_STOCK_REVIEW', 'CANCELLED', 'EXPIRED', 'REFUNDED')
  AND subtotal >= 0
  AND shipping_cost >= 0
  AND total = subtotal + shipping_cost
  AND currency = 'ARS'
);

CREATE TABLE mp_checkout_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id BIGINT NOT NULL,
  attempt_no INTEGER NOT NULL,
  external_reference VARCHAR(64) NOT NULL UNIQUE,
  idempotency_key UUID NOT NULL UNIQUE,
  request_hash CHAR(64) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  snapshot JSONB NOT NULL,
  provider_order_id VARCHAR(128) NULL UNIQUE,
  checkout_url TEXT NULL,
  state VARCHAR(32) NOT NULL,
  error_sanitized VARCHAR(200) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, attempt_no),
  FOREIGN KEY (payment_id, order_id) REFERENCES payments(id, order_id) ON DELETE RESTRICT,
  CHECK (attempt_no > 0),
  CHECK (char_length(external_reference) <= 64),
  CHECK (currency = 'ARS' AND amount >= 0),
  CHECK (jsonb_typeof(snapshot) = 'object'),
  CHECK (state IN (
    'CREATED', 'POSTING', 'RECOVERY_REQUIRED', 'READY_FOR_REDIRECT', 'AWAITING_RESULT',
    'TERMINAL_UNPAID_VERIFIED', 'ACCREDITED', 'QUARANTINED', 'SUPERSEDED'
  )),
  CHECK (provider_order_id IS NULL OR char_length(provider_order_id) > 0),
  CHECK (checkout_url IS NULL OR checkout_url LIKE 'https://%')
);

CREATE UNIQUE INDEX ux_mp_checkout_attempts_active
  ON mp_checkout_attempts(order_id)
  WHERE state IN ('CREATED', 'POSTING', 'RECOVERY_REQUIRED', 'READY_FOR_REDIRECT', 'AWAITING_RESULT', 'QUARANTINED');

CREATE TABLE mp_order_payment_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES mp_checkout_attempts(id) ON DELETE RESTRICT,
  provider_payment_id VARCHAR(128) NOT NULL UNIQUE,
  provider_order_id VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL,
  status_detail VARCHAR(64) NULL,
  amount_total NUMERIC(14, 2) NOT NULL,
  amount_paid NUMERIC(14, 2) NOT NULL,
  payment_type VARCHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount_total >= 0 AND amount_paid >= 0)
);

CREATE TABLE mp_order_notification_inbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL DEFAULT '',
  body_event_id VARCHAR(128) NOT NULL DEFAULT '',
  raw_topic VARCHAR(64) NOT NULL,
  query_data_id VARCHAR(128) NOT NULL,
  body_data_id VARCHAR(128) NOT NULL DEFAULT '',
  provider_order_id_candidate VARCHAR(128) NOT NULL,
  x_request_id VARCHAR(128) NOT NULL,
  signature_version VARCHAR(16) NOT NULL,
  signature_result VARCHAR(16) NOT NULL,
  application_id VARCHAR(64) NOT NULL DEFAULT '',
  envelope_redacted JSONB NOT NULL,
  disposition VARCHAR(16) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, body_event_id, query_data_id, x_request_id),
  CHECK (jsonb_typeof(envelope_redacted) IN ('object', 'array')),
  CHECK (signature_result = 'ACCEPTED'),
  CHECK (disposition IN ('PROCESSABLE', 'QUARANTINED')),
  CHECK (provider_order_id_candidate = query_data_id)
);

CREATE TABLE mp_order_notification_processing (
  inbox_id BIGINT PRIMARY KEY REFERENCES mp_order_notification_inbox(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_expires_at TIMESTAMPTZ NULL,
  locked_by VARCHAR(100) NULL,
  last_error VARCHAR(500) NULL,
  retry_available_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('RECEIVED', 'PROCESSING', 'RETRYABLE', 'PROCESSED', 'QUARANTINED', 'FAILED') AND attempt_count >= 0)
);

CREATE TABLE mp_order_commercial_applications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inbox_id BIGINT NOT NULL REFERENCES mp_order_notification_inbox(id) ON DELETE RESTRICT,
  attempt_id BIGINT NOT NULL REFERENCES mp_checkout_attempts(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider_order_id VARCHAR(128) NOT NULL,
  transition VARCHAR(64) NOT NULL,
  confirmed_amount NUMERIC(14, 2) NOT NULL,
  confirmed_currency CHAR(3) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_order_id, transition),
  CHECK (confirmed_currency = 'ARS' AND confirmed_amount >= 0)
);

CREATE UNIQUE INDEX ux_mp_order_accredited_once
  ON mp_order_commercial_applications(order_id)
  WHERE transition = 'PAYMENT_ACCREDITED';

CREATE TABLE mp_verified_business_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE REFERENCES mp_order_commercial_applications(id) ON DELETE RESTRICT,
  event_key UUID NOT NULL UNIQUE,
  event_type VARCHAR(64) NOT NULL,
  payload_redacted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload_redacted) = 'object')
);

CREATE TABLE mp_order_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_event_id BIGINT NOT NULL UNIQUE REFERENCES mp_verified_business_events(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL UNIQUE,
  kind VARCHAR(64) NOT NULL,
  payload_redacted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(payload_redacted) = 'object')
);

CREATE TABLE mp_order_outbox_delivery (
  outbox_id BIGINT PRIMARY KEY REFERENCES mp_order_outbox(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ NULL,
  locked_by VARCHAR(100) NULL,
  last_error VARCHAR(500) NULL,
  sent_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'DEAD') AND attempt_count >= 0)
);

CREATE TABLE mp_order_reversal_cases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES mp_checkout_attempts(id) ON DELETE RESTRICT,
  provider_order_id VARCHAR(128) NOT NULL,
  provider_payment_id VARCHAR(128) NULL,
  provider_refund_id VARCHAR(128) NULL,
  provider_chargeback_id VARCHAR(128) NULL,
  kind VARCHAR(32) NOT NULL,
  review_status VARCHAR(16) NOT NULL DEFAULT 'UNDER_REVIEW',
  inbox_id BIGINT NULL REFERENCES mp_order_notification_inbox(id) ON DELETE RESTRICT,
  evidence_redacted JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind IN ('REFUND_TOTAL', 'REFUND_PARTIAL', 'CHARGEBACK', 'FRAUD')),
  CHECK (review_status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
  CHECK (jsonb_typeof(evidence_redacted) = 'object')
);

CREATE UNIQUE INDEX ux_mp_order_reversal_identity
  ON mp_order_reversal_cases (
    provider_order_id,
    kind,
    COALESCE(provider_payment_id, ''),
    COALESCE(provider_refund_id, ''),
    COALESCE(provider_chargeback_id, '')
  );

CREATE TABLE mp_order_incidents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id BIGINT NULL REFERENCES mp_checkout_attempts(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  kind VARCHAR(32) NOT NULL,
  review_status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  evidence_redacted JSONB NOT NULL,
  owner_admin_user_id BIGINT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind IN ('DUPLICATE_REMOTE_CREDIT', 'PAID_WITHOUT_STOCK')),
  CHECK (review_status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
  CHECK (jsonb_typeof(evidence_redacted) = 'object')
);

CREATE TRIGGER trg_prevent_immutable_mp_order_notification_inbox
  BEFORE UPDATE OR DELETE ON mp_order_notification_inbox
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_mp_order_commercial_applications
  BEFORE UPDATE OR DELETE ON mp_order_commercial_applications
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_mp_verified_business_events
  BEFORE UPDATE OR DELETE ON mp_verified_business_events
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
CREATE TRIGGER trg_prevent_immutable_mp_order_outbox
  BEFORE UPDATE OR DELETE ON mp_order_outbox
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();
