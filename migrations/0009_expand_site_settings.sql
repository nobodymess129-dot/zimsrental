PRAGMA foreign_keys=OFF;

CREATE TABLE site_settings_new (
  setting_key TEXT PRIMARY KEY CHECK (setting_key IN (
    'hero_title_line1',
    'hero_title_line2',
    'hero_subtitle',
    'about_heading',
    'about_body',
    'guide_heading',
    'guide_body',
    'contact_heading',
    'footer_tagline',
    'about_brochure_mode',
    'about_brochure_text',
    'about_brochure_image_url',
    'business_name',
    'business_address',
    'business_phone',
    'business_whatsapp',
    'business_email',
    'business_facebook',
    'business_map_url',
    'airport_pickup_text',
    'business_logo_url'
  )),
  setting_value TEXT NOT NULL CHECK (length(setting_value) <= 1000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO site_settings_new (setting_key, setting_value, updated_at)
SELECT setting_key, setting_value, updated_at
FROM site_settings;

DROP TABLE site_settings;
ALTER TABLE site_settings_new RENAME TO site_settings;

PRAGMA foreign_keys=ON;
