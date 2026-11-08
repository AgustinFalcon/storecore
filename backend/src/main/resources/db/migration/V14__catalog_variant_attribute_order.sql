-- JSONB owns attribute values; this array owns display order. Existing/direct SQL
-- writers keep their default empty order and reads append keys canonically.
ALTER TABLE product_variants ADD COLUMN attribute_order TEXT[] NOT NULL DEFAULT '{}';
UPDATE product_variants v SET attribute_order=ARRAY(SELECT key FROM jsonb_object_keys(v.attributes) key ORDER BY key COLLATE "C");
