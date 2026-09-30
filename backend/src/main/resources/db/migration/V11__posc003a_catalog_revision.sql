-- POSC-003A catalog revision singleton, writer triggers, and BlackStore audit port.
-- Does not edit V1–V10. Does not activate BLACKSTORE_INTEGRATION. No GRANT ALL.

DO $_roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_catalog_revision_owner') THEN
  CREATE ROLE storecore_catalog_revision_owner NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='storecore_blackstore_audit_owner') THEN
  CREATE ROLE storecore_blackstore_audit_owner NOLOGIN;
 END IF;
END; $_roles$;

GRANT USAGE ON SCHEMA public TO storecore_catalog_revision_owner, storecore_blackstore_audit_owner;

CREATE TABLE public.blackstore_catalog_revision (
 id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.blackstore_catalog_revision (id, revision) VALUES (1, 1);

ALTER TABLE public.blackstore_catalog_revision OWNER TO storecore_catalog_revision_owner;

CREATE FUNCTION public.blackstore_bump_catalog_revision() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
BEGIN
 UPDATE public.blackstore_catalog_revision
    SET revision = revision + 1,
        updated_at = clock_timestamp()
  WHERE id = 1;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'BLACKSTORE_CATALOG_REVISION_MISSING' USING ERRCODE = 'P0002';
 END IF;
 IF TG_OP = 'DELETE' THEN
  RETURN OLD;
 END IF;
 RETURN NEW;
END;
$_$;

ALTER FUNCTION public.blackstore_bump_catalog_revision() OWNER TO storecore_catalog_revision_owner;

CREATE FUNCTION public.blackstore_catalog_revision_share() RETURNS BIGINT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 locked_revision BIGINT;
BEGIN
 SELECT revision INTO STRICT locked_revision
   FROM public.blackstore_catalog_revision
  WHERE id = 1
    FOR SHARE;
 RETURN locked_revision;
END;
$_$;

ALTER FUNCTION public.blackstore_catalog_revision_share() OWNER TO storecore_catalog_revision_owner;

CREATE TRIGGER trg_blackstore_catalog_revision_products
 BEFORE INSERT OR UPDATE OR DELETE ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.blackstore_bump_catalog_revision();
CREATE TRIGGER trg_blackstore_catalog_revision_product_variants
 BEFORE INSERT OR UPDATE OR DELETE ON public.product_variants
 FOR EACH ROW EXECUTE FUNCTION public.blackstore_bump_catalog_revision();
CREATE TRIGGER trg_blackstore_catalog_revision_product_images
 BEFORE INSERT OR UPDATE OR DELETE ON public.product_images
 FOR EACH ROW EXECUTE FUNCTION public.blackstore_bump_catalog_revision();
CREATE TRIGGER trg_blackstore_catalog_revision_offers
 BEFORE INSERT OR UPDATE OR DELETE ON public.offers
 FOR EACH ROW EXECUTE FUNCTION public.blackstore_bump_catalog_revision();
CREATE TRIGGER trg_blackstore_catalog_revision_offer_products
 BEFORE INSERT OR UPDATE OR DELETE ON public.offer_products
 FOR EACH ROW EXECUTE FUNCTION public.blackstore_bump_catalog_revision();
CREATE TRIGGER trg_blackstore_catalog_revision_installation_settings
 BEFORE INSERT OR UPDATE OR DELETE ON public.installation_settings
 FOR EACH ROW EXECUTE FUNCTION public.blackstore_bump_catalog_revision();

CREATE FUNCTION public.storecore_blackstore_audit_override(
 p_event_type VARCHAR,
 p_actor_type VARCHAR,
 p_actor_id VARCHAR,
 p_aggregate_type VARCHAR,
 p_aggregate_id BIGINT,
 p_correlation UUID,
 p_reason_code VARCHAR,
 p_payload JSONB
) RETURNS BIGINT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO pg_catalog, pg_temp AS $_$
DECLARE
 inserted_id BIGINT;
BEGIN
 IF p_event_type NOT IN ('BLACKSTORE_PRICE_OVERRIDE', 'BLACKSTORE_CATALOG_SKU_EXCLUDED') THEN
  RAISE EXCEPTION 'BLACKSTORE_AUDIT_EVENT_DENIED' USING ERRCODE = '22023';
 END IF;
 IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
  RAISE EXCEPTION 'BLACKSTORE_AUDIT_PAYLOAD_INVALID' USING ERRCODE = '22023';
 END IF;
 IF p_payload ? 'bearer' OR p_payload ? 'secret' OR p_payload ? 'secret_ref' THEN
  RAISE EXCEPTION 'BLACKSTORE_AUDIT_SECRET_REJECTED' USING ERRCODE = '22023';
 END IF;
 INSERT INTO public.audit_events(
  actor_type, actor_id, event_type, aggregate_type, aggregate_id,
  correlation_id, reason_code, payload_redacted
 ) VALUES (
  p_actor_type, p_actor_id, p_event_type, p_aggregate_type, p_aggregate_id,
  p_correlation, p_reason_code, p_payload
 ) RETURNING id INTO inserted_id;
 RETURN inserted_id;
END;
$_$;

ALTER FUNCTION public.storecore_blackstore_audit_override(VARCHAR, VARCHAR, VARCHAR, VARCHAR, BIGINT, UUID, VARCHAR, JSONB)
 OWNER TO storecore_blackstore_audit_owner;

GRANT INSERT, SELECT ON public.audit_events TO storecore_blackstore_audit_owner;
GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO storecore_blackstore_audit_owner;

REVOKE ALL ON FUNCTION public.blackstore_bump_catalog_revision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blackstore_bump_catalog_revision() TO storecore_runtime;
REVOKE ALL ON FUNCTION public.blackstore_catalog_revision_share() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blackstore_catalog_revision_share() TO storecore_runtime;
REVOKE ALL ON FUNCTION public.storecore_blackstore_audit_override(VARCHAR, VARCHAR, VARCHAR, VARCHAR, BIGINT, UUID, VARCHAR, JSONB)
 FROM PUBLIC, storecore_companion_admin, storecore_capability_admin;

GRANT EXECUTE ON FUNCTION public.storecore_blackstore_audit_override(VARCHAR, VARCHAR, VARCHAR, VARCHAR, BIGINT, UUID, VARCHAR, JSONB)
 TO storecore_runtime;

GRANT SELECT ON TABLE public.blackstore_catalog_revision TO storecore_runtime;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.blackstore_catalog_revision FROM PUBLIC, storecore_runtime;

GRANT ALL ON public.blackstore_catalog_revision TO storecore_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO storecore_migrator;
