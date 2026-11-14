ALTER TABLE installation_settings
 ADD COLUMN branding_revision BIGINT NOT NULL DEFAULT 1 CHECK (branding_revision > 0),
 ADD COLUMN logo_url VARCHAR(2048),
 ADD COLUMN primary_color CHAR(7) NOT NULL DEFAULT '#0f172a' CHECK (primary_color ~ '^#[0-9a-f]{6}$'),
 ADD COLUMN on_primary_color CHAR(7) NOT NULL DEFAULT '#f8fafc' CHECK (on_primary_color ~ '^#[0-9a-f]{6}$');
