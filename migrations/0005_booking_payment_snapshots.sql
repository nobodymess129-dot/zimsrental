-- Add owner-configurable deposits and immutable booking payment snapshots.
ALTER TABLE vehicles ADD COLUMN deposit_percent REAL
  CHECK (deposit_percent IS NULL OR (deposit_percent > 0 AND deposit_percent <= 100));

ALTER TABLE bookings ADD COLUMN payment_option TEXT NOT NULL DEFAULT 'full'
  CHECK (payment_option IN ('full','deposit'));
ALTER TABLE bookings ADD COLUMN deposit_percent_snapshot REAL
  CHECK (deposit_percent_snapshot IS NULL OR (deposit_percent_snapshot > 0 AND deposit_percent_snapshot <= 100));
ALTER TABLE bookings ADD COLUMN amount_due_fjd_minor INTEGER NOT NULL DEFAULT 0
  CHECK (amount_due_fjd_minor >= 0);
ALTER TABLE bookings ADD COLUMN balance_due_fjd_minor INTEGER NOT NULL DEFAULT 0
  CHECK (balance_due_fjd_minor >= 0);

-- Existing records remain full-payment requests at their saved total.
UPDATE bookings SET amount_due_fjd_minor = total_fjd * 100, balance_due_fjd_minor = 0;
