ALTER TABLE product_variants ADD COLUMN base_price_override NUMERIC(14,2) NULL;
ALTER TABLE product_variants ADD CONSTRAINT ck_variant_base_price_override CHECK (base_price_override IS NULL OR (base_price_override >= 0 AND base_price_override <> 'NaN'::numeric));
