-- PSD-T06-A: one optimistic revision for the complete home composition.
CREATE TABLE home_content_compositions (
  singleton_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO home_content_compositions(singleton_id, revision) VALUES (1, 0);

GRANT SELECT, UPDATE ON home_content_compositions TO storecore_runtime;
