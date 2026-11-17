-- These trigger functions execute with the invoking runtime role. Pin public
-- before pg_temp so a same-named temporary relation cannot intercept the
-- deferred validation guard or any other catalog relation.
ALTER FUNCTION mark_product_option_validation()
 SET search_path = public, pg_temp;

ALTER FUNCTION validate_product_option_schema()
 SET search_path = public, pg_temp;

ALTER FUNCTION protect_product_option_validation_guard()
 SET search_path = public, pg_temp;

-- SECURITY INVOKER validation locks and reads the owning aggregate, and bumps
-- only the product tuple version while preserving the logical revision.
GRANT SELECT, UPDATE ON products TO storecore_runtime;
GRANT SELECT ON product_variants TO storecore_runtime;
