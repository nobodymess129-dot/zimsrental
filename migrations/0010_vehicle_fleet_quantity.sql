-- Add owner-managed fleet capacity per vehicle type.
-- Existing vehicle records start with a quantity of 1,
-- preserving the current one-booking-per-type behaviour.

ALTER TABLE vehicles
ADD COLUMN fleet_quantity INTEGER NOT NULL DEFAULT 1
CHECK (fleet_quantity >= 0 AND fleet_quantity <= 10000);

-- Helps availability checks for overlapping bookings.
CREATE INDEX IF NOT EXISTS bookings_fleet_capacity
ON bookings(vehicle_id, status, pickup_at, return_at, hold_expires_at);
