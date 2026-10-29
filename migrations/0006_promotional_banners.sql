CREATE TABLE IF NOT EXISTS promo_banners (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 240),
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -1000 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS promo_banners_schedule
ON promo_banners(active, starts_at, ends_at, priority);
