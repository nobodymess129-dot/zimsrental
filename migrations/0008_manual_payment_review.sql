-- Owner-managed manual payment methods and transaction-reference review.
CREATE TABLE IF NOT EXISTS payment_method_settings (
  method_key TEXT PRIMARY KEY CHECK (method_key IN ('bank_transfer','mpaisa')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO payment_method_settings (method_key, enabled, config_json)
VALUES ('bank_transfer', 0, '{}'), ('mpaisa', 0, '{}');

ALTER TABLE bookings ADD COLUMN customer_payment_reference TEXT;
ALTER TABLE bookings ADD COLUMN payment_submitted_at TEXT;
ALTER TABLE bookings ADD COLUMN payment_review_note TEXT;
ALTER TABLE bookings ADD COLUMN payment_reviewed_at TEXT;
ALTER TABLE bookings ADD COLUMN payment_reviewed_by TEXT;
