-- Global expiry maintenance has no actor predicate; V27's actor-first index is insufficient.
CREATE INDEX ix_catalog_media_drafts_open_expiry
  ON catalog_media_drafts(expires_at,id) WHERE state='OPEN';

-- Retained tombstones and attached history must not dominate every orphan scan.
CREATE INDEX ix_media_assets_orphan_candidates
  ON media_assets(id) WHERE state IN ('AWAITING_BYTES','STORED_PRIVATE','FAILED');
