-- The application datasource runs as storecore_runtime while Flyway owns the
-- schema. Keep the option aggregate private from PUBLIC and grant only the
-- access required by the catalog readers, CAS writer and SECURITY INVOKER
-- validation triggers.
REVOKE ALL ON
 product_option_axes,
 product_option_values,
 variant_option_values,
 variant_option_vectors,
 product_option_validation_guard,
 catalog_schema_compatibility_version
FROM PUBLIC, storecore_runtime;

GRANT SELECT ON catalog_schema_compatibility_version TO storecore_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON
 product_option_axes,
 product_option_values,
 variant_option_values,
 variant_option_vectors,
 product_option_validation_guard
TO storecore_runtime;

GRANT USAGE, SELECT ON SEQUENCE
 product_option_axes_id_seq,
 product_option_values_id_seq
TO storecore_runtime;
