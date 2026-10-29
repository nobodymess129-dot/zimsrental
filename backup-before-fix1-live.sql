PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_initial.sql','2026-10-19 05:10:08');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_seed_vehicles.sql','2026-10-19 05:10:08');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003_booking_holds.sql','2026-10-19 05:10:08');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0004_booking_cancellation.sql','2026-10-19 05:10:09');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0005_booking_payment_snapshots.sql','2026-10-19 05:10:09');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0006_promotional_banners.sql','2026-10-19 05:10:09');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(7,'0007_booking_discounts.sql','2026-10-19 05:10:09');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(8,'0008_manual_payment_review.sql','2026-10-19 05:10:09');
CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  daily_rate INTEGER NOT NULL CHECK (daily_rate >= 0),
  image_path TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, deposit_percent REAL
  CHECK (deposit_percent IS NULL OR (deposit_percent > 0 AND deposit_percent <= 100)));
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('fielder','Toyota Fielder',110,'/assets/toyota-fielder.jpg','Comfortable, practical and economical.',1,'2026-10-19 05:10:08','2026-10-19 05:10:08',NULL);
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('corolla','Toyota Corolla',115,'/assets/toyota-corolla.jpg','Reliable everyday transport.',1,'2026-10-19 05:10:08','2026-10-19 05:10:08',NULL);
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('fit-shuttle','Honda Fit Shuttle',110,'/assets/honda-fit-shuttle.jpg','Spacious and fuel-efficient wagon.',1,'2026-10-19 05:10:08','2026-10-19 05:10:08',NULL);
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('ad-wagon','Nissan AD Wagon / Wingroad',115,'/assets/nissan-ad-wagon.jpg','Practical space for your Fiji trip.',1,'2026-10-19 05:10:08','2026-10-19 05:10:08',NULL);
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('sportage','Kia Sportage',175,'/assets/kia-sportage.jpg','Comfortable SUV for your journey.',1,'2026-10-19 05:10:08','2026-10-19 05:10:08',NULL);
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('x-trail','Nissan X-Trail',270,'/assets/nissan-x-trail.jpg','Roomy SUV for exploring Fiji.',1,'2026-10-19 05:10:08','2026-10-19 05:10:08',NULL);
INSERT INTO "vehicles" ("id","name","daily_rate","image_path","description","active","created_at","updated_at","deposit_percent") VALUES('ranger','Ford Ranger',490,'/api/vehicle-images/e02c0827-169d-40d4-acbd-6c87de0aa95a.jpg','Rugged pickup for your plans.',1,'2026-10-19 05:10:08','2026-10-19 05:44:53',NULL);
CREATE TABLE bookings (
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, hold_expires_at TEXT, payment_provider TEXT, payment_reference TEXT, cancellation_reason TEXT NOT NULL DEFAULT '', payment_option TEXT NOT NULL DEFAULT 'full'
  CHECK (payment_option IN ('full','deposit')), deposit_percent_snapshot REAL
  CHECK (deposit_percent_snapshot IS NULL OR (deposit_percent_snapshot > 0 AND deposit_percent_snapshot <= 100)), amount_due_fjd_minor INTEGER NOT NULL DEFAULT 0
  CHECK (amount_due_fjd_minor >= 0), balance_due_fjd_minor INTEGER NOT NULL DEFAULT 0
  CHECK (balance_due_fjd_minor >= 0), daily_rate_fjd_minor INTEGER CHECK (daily_rate_fjd_minor IS NULL OR daily_rate_fjd_minor >= 0), rental_days INTEGER CHECK (rental_days IS NULL OR rental_days >= 1), original_subtotal_fjd_minor INTEGER CHECK (original_subtotal_fjd_minor IS NULL OR original_subtotal_fjd_minor >= 0), discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('automatic','code')), discount_reference TEXT, discount_percent INTEGER CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100), discount_amount_fjd_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount_fjd_minor >= 0), final_total_fjd_minor INTEGER CHECK (final_total_fjd_minor IS NULL OR final_total_fjd_minor >= 0), request_id TEXT, payment_currency TEXT, payment_amount_minor INTEGER CHECK (payment_amount_minor IS NULL OR payment_amount_minor >= 0), payment_fjd_per_unit_micros INTEGER CHECK (payment_fjd_per_unit_micros IS NULL OR payment_fjd_per_unit_micros > 0), payment_capture_reference TEXT, customer_payment_reference TEXT, payment_submitted_at TEXT, payment_review_note TEXT, payment_reviewed_at TEXT, payment_reviewed_by TEXT,
  FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
);
INSERT INTO "bookings" ("id","customer_name","email","phone","vehicle_id","pickup_at","return_at","status","payment_status","total_fjd","notes","created_at","hold_expires_at","payment_provider","payment_reference","cancellation_reason","payment_option","deposit_percent_snapshot","amount_due_fjd_minor","balance_due_fjd_minor","daily_rate_fjd_minor","rental_days","original_subtotal_fjd_minor","discount_type","discount_reference","discount_percent","discount_amount_fjd_minor","final_total_fjd_minor","request_id","payment_currency","payment_amount_minor","payment_fjd_per_unit_micros","payment_capture_reference","customer_payment_reference","payment_submitted_at","payment_review_note","payment_reviewed_at","payment_reviewed_by") VALUES('b895e422-303f-49a1-aaaa-469524f0ddbc','test1','test@gmail.com','+679 203930','fielder','2026-10-18T22:00:00.000Z','2026-10-24T22:00:00.000Z','rejected','failed',660,'Child seat — ask for price','2026-10-19 06:16:12','2026-10-19T06:25:03.865Z','bank_transfer',NULL,'Test booking only — payment not made. Rejecting to clean up test record.','full',NULL,66000,0,11000,6,66000,NULL,NULL,NULL,0,66000,'26806771-d753-4938-bf1f-dec8ae3377c7',NULL,NULL,NULL,NULL,'10293949','2026-10-19T06:16:58.349Z','Test booking only — payment not made. Rejecting to clean up test record.','2026-10-19T06:25:03.865Z','zimsrentalfj@gmail.com');
INSERT INTO "bookings" ("id","customer_name","email","phone","vehicle_id","pickup_at","return_at","status","payment_status","total_fjd","notes","created_at","hold_expires_at","payment_provider","payment_reference","cancellation_reason","payment_option","deposit_percent_snapshot","amount_due_fjd_minor","balance_due_fjd_minor","daily_rate_fjd_minor","rental_days","original_subtotal_fjd_minor","discount_type","discount_reference","discount_percent","discount_amount_fjd_minor","final_total_fjd_minor","request_id","payment_currency","payment_amount_minor","payment_fjd_per_unit_micros","payment_capture_reference","customer_payment_reference","payment_submitted_at","payment_review_note","payment_reviewed_at","payment_reviewed_by") VALUES('8b4f2eea-b671-478d-b804-99572513bd47','test','t@gmail.com','+679 8968968','fielder','2026-10-18T22:00:00.000Z','2026-10-24T22:00:00.000Z','pending_payment','pending',660,'No extra','2026-10-19 06:30:03','2026-10-20T06:30:10.609Z','bank_transfer',NULL,'','full',NULL,66000,0,11000,6,66000,NULL,NULL,NULL,0,66000,'36eef53f-3d5e-403b-99da-dedf9a29c418',NULL,NULL,NULL,NULL,'767968','2026-10-19T06:30:10.609Z',NULL,NULL,NULL);
CREATE TABLE promo_banners (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 240),
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN -1000 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE automatic_discount_rules (
  id TEXT PRIMARY KEY CHECK (id = 'long_rental'),
  threshold_days INTEGER NOT NULL CHECK (threshold_days >= 1 AND threshold_days <= 3650),
  percentage INTEGER NOT NULL DEFAULT 10 CHECK (percentage = 10),
  max_discount_fjd_minor INTEGER NOT NULL CHECK (max_discount_fjd_minor >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "automatic_discount_rules" ("id","threshold_days","percentage","max_discount_fjd_minor","active","updated_at") VALUES('long_rental',7,10,10000,1,'2026-10-19 05:10:09');
CREATE TABLE discount_codes (
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
CREATE TABLE discount_redemptions (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL REFERENCES discount_codes(id),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  email_normalized TEXT NOT NULL CHECK (email_normalized = lower(trim(email_normalized))),
  state TEXT NOT NULL CHECK (state IN ('reserved','released','redeemed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT,
  redeemed_at TEXT
);
CREATE TABLE vehicle_automatic_discount_overrides (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE vehicle_automatic_discount_tiers (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  threshold_days INTEGER NOT NULL CHECK (threshold_days >= 1 AND threshold_days <= 3650),
  percentage INTEGER NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  max_discount_fjd_minor INTEGER NOT NULL CHECK (max_discount_fjd_minor >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vehicle_id, threshold_days)
);
CREATE TABLE site_settings (
  setting_key TEXT PRIMARY KEY CHECK (setting_key IN ('hero_title_line1','hero_title_line2','hero_subtitle','about_heading','about_body','guide_heading','guide_body','contact_heading','footer_tagline')),
  setting_value TEXT NOT NULL CHECK (length(setting_value) <= 1000),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE payment_method_settings (
  method_key TEXT PRIMARY KEY CHECK (method_key IN ('bank_transfer','mpaisa')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "payment_method_settings" ("method_key","enabled","config_json","updated_at") VALUES('bank_transfer',1,'{"bank_name":"Westpac Banking Corporation","account_name":"Zims Rental Cars","account_number":"9806951308","branch":"Nadi","instructions":"Kindly transfer the total amount shown to the above bank details. Enter the Transaction Number For faster confirmation.\nBooking is confirmed upon successful verification of the transfer."}','2026-10-19 06:15:20');
INSERT INTO "payment_method_settings" ("method_key","enabled","config_json","updated_at") VALUES('mpaisa',1,'{"recipient_name":"Mohammed Fazim","mobile_number":"2312510","qr_image_url":"","instructions":"Kindly transfer the total amount shown to the above Mpaisa details. Enter the Receipt Number For faster confirmation.\nBooking is confirmed upon successful verification of the transfer."}','2026-10-19 06:15:20');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',8);
CREATE INDEX bookings_vehicle_dates ON bookings(vehicle_id, pickup_at, return_at, status);
CREATE INDEX bookings_created_at ON bookings(created_at DESC);
CREATE INDEX bookings_availability_check
ON bookings(vehicle_id, status, pickup_at, return_at);
CREATE INDEX bookings_hold_expiry
ON bookings(status, hold_expires_at);
CREATE INDEX promo_banners_schedule
ON promo_banners(active, starts_at, ends_at, priority);
CREATE UNIQUE INDEX discount_redemptions_one_active_email
ON discount_redemptions(code_id, email_normalized)
WHERE state IN ('reserved','redeemed');
CREATE INDEX discount_redemptions_code_state
ON discount_redemptions(code_id, state);
CREATE UNIQUE INDEX bookings_request_id ON bookings(request_id);
CREATE INDEX vehicle_automatic_discount_tiers_lookup
ON vehicle_automatic_discount_tiers(vehicle_id, active, threshold_days DESC);
CREATE UNIQUE INDEX bookings_payment_capture_reference
ON bookings(payment_capture_reference) WHERE payment_capture_reference IS NOT NULL;
CREATE UNIQUE INDEX bookings_payment_order_reference
ON bookings(payment_reference) WHERE payment_provider='paypal' AND payment_reference IS NOT NULL;
