
-- Add fields needed for temporary checkout holds and payment tracking.
ALTER TABLE bookings ADD COLUMN hold_expires_at TEXT;
ALTER TABLE bookings ADD COLUMN payment_provider TEXT;
ALTER TABLE bookings ADD COLUMN payment_reference TEXT;

-- Index for checking active reservations by vehicle and date range.
CREATE INDEX IF NOT EXISTS bookings_availability_check
ON bookings(vehicle_id, status, pickup_at, return_at);

-- Index for finding bookings whose payment holds have expired.
CREATE INDEX IF NOT EXISTS bookings_hold_expiry
ON bookings(status, hold_expires_at);
