-- POSC-003E additive request hash algorithm. Does not rewrite V1–V12.
-- Aborts if a live PENDING exists inside the 60s claim window.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.blackstore_integration_operations
     WHERE state = 'PENDING'
       AND created_at > clock_timestamp() - INTERVAL '60 seconds'
  ) THEN
    RAISE EXCEPTION 'POSC-003E abort: live PENDING within 60 seconds';
  END IF;
END
$$;

ALTER TABLE public.blackstore_integration_operations
  ADD COLUMN request_hash_algorithm VARCHAR(8) NOT NULL DEFAULT 'H1';

ALTER TABLE public.blackstore_integration_operations
  ADD CONSTRAINT ck_blackstore_integration_operations_hash_alg
  CHECK (request_hash_algorithm IN ('H1', 'H2'));
