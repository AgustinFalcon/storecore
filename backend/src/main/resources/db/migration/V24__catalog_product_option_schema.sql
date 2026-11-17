-- Explicit options never reinterpret legacy descriptive attributes.
ALTER TABLE products ADD COLUMN has_option_schema BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN option_schema_revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE products ADD CONSTRAINT ck_products_option_schema_revision
 CHECK (option_schema_revision BETWEEN 1 AND 2147483647);
ALTER TABLE product_variants ADD CONSTRAINT uq_product_variants_product_id UNIQUE(product_id,id);

CREATE TABLE product_option_axes (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
 code VARCHAR(64) NOT NULL, label VARCHAR(80) NOT NULL,
 presentation VARCHAR(16) NOT NULL, sort_order INTEGER NOT NULL,
 CONSTRAINT uq_product_option_axes_product_id UNIQUE(product_id,id),
 CONSTRAINT uq_product_option_axes_code UNIQUE(product_id,code) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT uq_product_option_axes_order UNIQUE(product_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT ck_product_option_axes_code CHECK(code COLLATE "C" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
 CONSTRAINT ck_product_option_axes_label CHECK(char_length(label) BETWEEN 1 AND 80 AND btrim(label)<>'' AND label !~ '[[:cntrl:]]'),
 CONSTRAINT ck_product_option_axes_presentation CHECK(presentation IN ('SELECT','SWATCH')),
 CONSTRAINT ck_product_option_axes_order CHECK(sort_order>=0)
);
CREATE TABLE product_option_values (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id BIGINT NOT NULL, axis_id BIGINT NOT NULL,
 code VARCHAR(64) NOT NULL, label VARCHAR(80) NOT NULL,
 swatch_color VARCHAR(7), sort_order INTEGER NOT NULL,
 CONSTRAINT fk_product_option_values_axis FOREIGN KEY(product_id,axis_id)
  REFERENCES product_option_axes(product_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT uq_product_option_values_owner UNIQUE(product_id,axis_id,id),
 CONSTRAINT uq_product_option_values_code UNIQUE(axis_id,code) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT uq_product_option_values_order UNIQUE(axis_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT ck_product_option_values_code CHECK(code COLLATE "C" ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
 CONSTRAINT ck_product_option_values_label CHECK(char_length(label) BETWEEN 1 AND 80 AND btrim(label)<>'' AND label !~ '[[:cntrl:]]'),
 CONSTRAINT ck_product_option_values_color CHECK(swatch_color IS NULL OR swatch_color COLLATE "C" ~ '^#[0-9a-f]{6}$'),
 CONSTRAINT ck_product_option_values_order CHECK(sort_order>=0)
);
CREATE TABLE variant_option_values (
 product_id BIGINT NOT NULL, variant_id BIGINT NOT NULL, axis_id BIGINT NOT NULL, value_id BIGINT NOT NULL,
 CONSTRAINT pk_variant_option_values PRIMARY KEY(variant_id,axis_id) DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT fk_variant_option_values_variant FOREIGN KEY(product_id,variant_id)
  REFERENCES product_variants(product_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT fk_variant_option_values_value FOREIGN KEY(product_id,axis_id,value_id)
  REFERENCES product_option_values(product_id,axis_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_variant_option_values_product ON variant_option_values(product_id);
CREATE TABLE variant_option_vectors (
 variant_id BIGINT PRIMARY KEY, product_id BIGINT NOT NULL, vector JSONB NOT NULL,
 CONSTRAINT fk_variant_option_vectors_variant FOREIGN KEY(product_id,variant_id)
  REFERENCES product_variants(product_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
 CONSTRAINT ck_variant_option_vectors_shape CHECK(jsonb_typeof(vector)='array' AND jsonb_array_length(vector) BETWEEN 1 AND 4),
 CONSTRAINT uq_variant_option_vectors_combination UNIQUE(product_id,vector) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE product_option_validation_guard (
 product_id BIGINT NOT NULL, transaction_id XID8 NOT NULL DEFAULT pg_current_xact_id(),
 PRIMARY KEY(product_id,transaction_id)
);

-- This marker is consumed by an EXTERNAL admission wrapper, before launching
-- an artifact. It cannot make an already-running legacy binary compatible.
CREATE TABLE catalog_schema_compatibility_version (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 version INTEGER NOT NULL CHECK(version=2)
);
INSERT INTO catalog_schema_compatibility_version(singleton,version) VALUES(TRUE,2);

CREATE FUNCTION mark_product_option_validation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_product BIGINT; new_product BIGINT; touched_product BIGINT;
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF TG_TABLE_NAME='products' THEN old_product:=OLD.id; ELSE old_product:=OLD.product_id; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  IF TG_TABLE_NAME='products' THEN new_product:=NEW.id; ELSE new_product:=NEW.product_id; END IF;
 END IF;
 FOR touched_product IN
  SELECT DISTINCT candidate FROM unnest(ARRAY[old_product,new_product]) candidate
  WHERE candidate IS NOT NULL ORDER BY candidate
 LOOP
  -- All supported writers already lock parent before children. The lock also
  -- serializes independent SQL writers before the deferred aggregate check.
  PERFORM id FROM products WHERE id=touched_product FOR NO KEY UPDATE;
  IF FOUND THEN
   INSERT INTO product_option_validation_guard(product_id,transaction_id)
    VALUES(touched_product,pg_current_xact_id()) ON CONFLICT DO NOTHING;
   IF FOUND THEN
    -- Once per guard, create a parent tuple version without a logical revision
    -- bump. REPEATABLE READ writers with an older snapshot must serialize-fail,
    -- rather than validate sibling changes against a snapshot from before wait.
    UPDATE products SET option_schema_revision=option_schema_revision WHERE id=touched_product;
   END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END;
$$;

CREATE FUNCTION validate_product_option_schema() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE present BOOLEAN; axis_count INTEGER;
BEGIN
 -- A prior SET CONSTRAINTS IMMEDIATE can have consumed this queued event.
 IF NOT EXISTS(SELECT 1 FROM product_option_validation_guard
  WHERE product_id=NEW.product_id AND transaction_id=NEW.transaction_id) THEN RETURN NULL; END IF;
 SELECT has_option_schema INTO present FROM products WHERE id=NEW.product_id FOR NO KEY UPDATE;
 IF NOT FOUND THEN
  DELETE FROM product_option_validation_guard WHERE product_id=NEW.product_id AND transaction_id=NEW.transaction_id;
  RETURN NULL;
 END IF;
 SELECT count(*) INTO axis_count FROM product_option_axes WHERE product_id=NEW.product_id;
 IF NOT present THEN
  IF axis_count<>0 OR EXISTS(SELECT 1 FROM variant_option_values WHERE product_id=NEW.product_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_ABSENT_HAS_OPTIONS';
  END IF;
 ELSE
  IF axis_count NOT BETWEEN 1 AND 4 THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_AXIS_COUNT_INVALID';
  END IF;
  IF EXISTS(SELECT 1 FROM product_option_axes a LEFT JOIN product_option_values v ON v.axis_id=a.id
   WHERE a.product_id=NEW.product_id GROUP BY a.id HAVING count(v.id) NOT BETWEEN 1 AND 50) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_VALUE_COUNT_INVALID';
  END IF;
  IF EXISTS(SELECT 1 FROM product_option_values v JOIN product_option_axes a ON a.id=v.axis_id
   WHERE v.product_id=NEW.product_id AND a.presentation<>'SWATCH' AND v.swatch_color IS NOT NULL) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_COLOR_PRESENTATION_INVALID';
  END IF;
  IF (SELECT count(*) FROM product_variants WHERE product_id=NEW.product_id)>1000
   OR (SELECT count(*) FROM variant_option_values WHERE product_id=NEW.product_id)>4000 THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_ASSIGNMENT_LIMIT_EXCEEDED';
  END IF;
  IF EXISTS(SELECT 1 FROM product_variants v LEFT JOIN variant_option_values a ON a.variant_id=v.id
   WHERE v.product_id=NEW.product_id AND v.active GROUP BY v.id HAVING count(a.axis_id)<>axis_count) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_ACTIVE_ASSIGNMENT_INCOMPLETE';
  END IF;
 END IF;
 -- Rebuild once per touched product, after all intermediate edits. Nested JSON
 -- pairs preserve boundaries, axis identity and the current explicit axis order.
 DELETE FROM variant_option_vectors WHERE product_id=NEW.product_id;
 IF present THEN
  INSERT INTO variant_option_vectors(variant_id,product_id,vector)
   SELECT v.id,v.product_id,jsonb_agg(jsonb_build_array(a.code,o.code) ORDER BY a.sort_order)
   FROM product_variants v JOIN variant_option_values av ON av.variant_id=v.id
   JOIN product_option_axes a ON a.id=av.axis_id
   JOIN product_option_values o ON o.id=av.value_id
   WHERE v.product_id=NEW.product_id AND v.active
   GROUP BY v.id,v.product_id;
 END IF;
 DELETE FROM product_option_validation_guard WHERE product_id=NEW.product_id AND transaction_id=NEW.transaction_id;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ct_product_option_validation
 AFTER INSERT ON product_option_validation_guard DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION validate_product_option_schema();

-- Prevent a direct SQL writer from suppressing its pending validation. The
-- validator's nested DELETE is the sole supported consumer of these rows.
CREATE FUNCTION protect_product_option_validation_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' OR pg_trigger_depth()<2 THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CATALOG_OPTION_VALIDATION_GUARD_IMMUTABLE';
 END IF;
 RETURN OLD;
END;
$$;
CREATE TRIGGER trg_product_option_guard_protect BEFORE UPDATE OR DELETE ON product_option_validation_guard
 FOR EACH ROW EXECUTE FUNCTION protect_product_option_validation_guard();

CREATE TRIGGER trg_products_option_validation AFTER INSERT OR UPDATE OF has_option_schema ON products
 FOR EACH ROW EXECUTE FUNCTION mark_product_option_validation();
CREATE TRIGGER trg_product_variants_option_validation AFTER INSERT OR DELETE OR UPDATE OF product_id,active ON product_variants
 FOR EACH ROW EXECUTE FUNCTION mark_product_option_validation();
CREATE TRIGGER trg_product_option_axes_validation AFTER INSERT OR UPDATE OR DELETE ON product_option_axes
 FOR EACH ROW EXECUTE FUNCTION mark_product_option_validation();
CREATE TRIGGER trg_product_option_values_validation AFTER INSERT OR UPDATE OR DELETE ON product_option_values
 FOR EACH ROW EXECUTE FUNCTION mark_product_option_validation();
CREATE TRIGGER trg_variant_option_values_validation AFTER INSERT OR UPDATE OR DELETE ON variant_option_values
 FOR EACH ROW EXECUTE FUNCTION mark_product_option_validation();
-- Derived-vector SQL edits are repaired by the same final-state validator.
CREATE TRIGGER trg_variant_option_vectors_validation AFTER INSERT OR UPDATE OR DELETE ON variant_option_vectors
 FOR EACH ROW EXECUTE FUNCTION mark_product_option_validation();

-- Unicode label normalization/uniqueness belongs to OptionLabel at the domain
-- boundary. SQL lower()/collations do not implement its exact NFKC/case fold.
