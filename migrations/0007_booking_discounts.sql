-- Discount rules, code reservations and immutable integer-cent booking snapshots.
CREATE TABLE IF NOT EXISTS automatic_discount_rules (
  id TEXT PRIMARY KEY CHECK (id = 'long_rental'),
  threshold_days INTEGER NOT NULL CHECK (threshold_days >= 1 AND threshold_days <= 3650),
  percentage INTEGER NOT NULL DEFAULT 10 CHECK (percentage = 10),
  max_discount_fjd_minor INTEGER NOT NULL CHECK (max_discount_fjd_minor >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO automatic_discount_rules
  (id, threshold_days, percentage, max_discount_fjd_minor, active)
VALUES ('long_rental', 7, 10, 10000, 1);

CREATE TABLE IF NOT EXISTS discount_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code = upper(trim(code)) AND length(code) BETWEEN 3 AND 32),
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit >= 1),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  starts_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (starts_at IS NULL OR expires_at IS NULL OR julianday(expires_at) > julianday(starts_at))
);

CREATE TABLE IF NOT EXISTS discount_redemptions (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL REFERENCES discount_codes(id),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  email_normalized TEXT NOT NULL CHECK (email_normalized = lower(trim(email_normalized))),
  state TEXT NOT NULL CHECK (state IN ('reserved','released','redeemed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT,
  redeemed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_one_active_email
ON discount_redemptions(code_id, email_normalized)
WHERE state IN ('reserved','redeemed');
CREATE INDEX IF NOT EXISTS discount_redemptions_code_state
ON discount_redemptions(code_id, state);

ALTER TABLE bookings ADD COLUMN daily_rate_fjd_minor INTEGER CHECK (daily_rate_fjd_minor IS NULL OR daily_rate_fjd_minor >= 0);
ALTER TABLE bookings ADD COLUMN rental_days INTEGER CHECK (rental_days IS NULL OR rental_days >= 1);
ALTER TABLE bookings ADD COLUMN original_subtotal_fjd_minor INTEGER CHECK (original_subtotal_fjd_minor IS NULL OR original_subtotal_fjd_minor >= 0);
ALTER TABLE bookings ADD COLUMN discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('automatic','code'));
ALTER TABLE bookings ADD COLUMN discount_reference TEXT;
ALTER TABLE bookings ADD COLUMN discount_percent INTEGER CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100);
ALTER TABLE bookings ADD COLUMN discount_amount_fjd_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_fjd_minor >= 0);
ALTER TABLE bookings ADD COLUMN final_total_fjd_minor INTEGER CHECK (final_total_fjd_minor IS NULL OR final_total_fjd_minor >= 0);
ALTER TABLE bookings ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_request_id ON bookings(request_id);

-- Optional per-vehicle overrides. When an override exists, its tier list replaces
-- the global default for that vehicle. Only the highest eligible active tier applies.
CREATE TABLE IF NOT EXISTS vehicle_automatic_discount_overrides (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicle_automatic_discount_tiers (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  threshold_days INTEGER NOT NULL CHECK (threshold_days >= 1 AND threshold_days <= 3650),
  percentage INTEGER NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  max_discount_fjd_minor INTEGER NOT NULL CHECK (max_discount_fjd_minor >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vehicle_id, threshold_days)
);

CREATE INDEX IF NOT EXISTS vehicle_automatic_discount_tiers_lookup
ON vehicle_automatic_discount_tiers(vehicle_id, active, threshold_days DESC);


-- PayPal checkout snapshots. The owner must configure a supported transaction
-- currency and an explicit FJD-per-currency-unit rate before checkout is enabled.
ALTER TABLE bookings ADD COLUMN payment_currency TEXT;
ALTER TABLE bookings ADD COLUMN payment_amount_minor INTEGER CHECK (payment_amount_minor IS NULL OR payment_amount_minor >= 0);
ALTER TABLE bookings ADD COLUMN payment_fjd_per_unit_micros INTEGER CHECK (payment_fjd_per_unit_micros IS NULL OR payment_fjd_per_unit_micros > 0);
ALTER TABLE bookings ADD COLUMN payment_capture_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_capture_reference
ON bookings(payment_capture_reference) WHERE payment_capture_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_payment_order_reference
ON bookings(payment_reference) WHERE payment_provider='paypal' AND payment_reference IS NOT NULL;

-- Owner-editable public copy. Values are rendered with textContent, never as HTML.
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY CHECK (setting_key IN ('hero_title_line1','hero_title_line2','hero_subtitle','about_heading','about_body','guide_heading','guide_body','contact_heading','footer_tagline')),
  setting_value TEXT NOT NULL CHECK (length(setting_value) <= 1000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
