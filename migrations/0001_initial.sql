CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  daily_rate INTEGER NOT NULL CHECK (daily_rate >= 0),
  image_path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  vehicle_id TEXT NOT NULL,
  pickup_at TEXT NOT NULL,
  return_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','pending_payment','confirmed','rejected','cancelled','completed')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','deposit_paid','paid','refunded','failed')),
  total_fjd INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);
CREATE INDEX IF NOT EXISTS bookings_vehicle_dates ON bookings(vehicle_id, pickup_at, return_at, status);
CREATE INDEX IF NOT EXISTS bookings_created_at ON bookings(created_at DESC);
