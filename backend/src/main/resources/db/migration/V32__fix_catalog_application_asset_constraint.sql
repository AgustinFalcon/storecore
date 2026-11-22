ALTER TABLE product_images DROP CONSTRAINT ck_product_images_source;

ALTER TABLE product_images
  ADD CONSTRAINT ck_product_images_source CHECK (
    (
      source_kind = 'LEGACY_URL'
      AND url IS NOT NULL
      AND (
        url ~ '^https://'
        OR url ~ '^/assets/[A-Za-z0-9._/-]+\.(avif|gif|jpeg|jpg|png|svg|webp)$'
      )
      AND media_asset_id IS NULL
    )
    OR (source_kind = 'MANAGED' AND url IS NULL AND media_asset_id IS NOT NULL)
  );
