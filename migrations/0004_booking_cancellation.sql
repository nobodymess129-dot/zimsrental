
-- Record why a booking was cancelled or rejected.
ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT '';
