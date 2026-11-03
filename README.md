# Zims Rental Cars — Cloudflare local development starter

This project refines the existing Zims tropical rental website into a premium responsive customer experience and extends the Cloudflare Workers + D1 foundation for fleet management, booking lookup, configurable discounts and guarded PayPal checkout.

## What works in this starter

- Existing brand identity and static HTML/CSS/JavaScript architecture are preserved, with compact section spacing, responsive navigation, a black active-section car indicator, reduced-motion support, a footer hibiscus illustration, and refined vehicle cards.
- Cloudflare Worker API routes and D1 migrations are included.
- Admin sign-in uses environment secrets and a signed, HttpOnly session cookie.
- Admin dashboard can list, edit, add and hide vehicles, manage vehicle-specific automatic discount tiers and codes, edit selected website copy, manage promotional banners, configure bank transfer/M-PAiSA, and review manual payment references. The generic booking editor cannot confirm bookings or change payment status; a separate authenticated review action is available only after the owner independently verifies the actual transaction.
- A separate `public/fleet.html` page provides vehicle-category filters, exterior gallery popups, transparent feature/seating notes, and a link back to the existing booking flow. Public fleet data can load from D1 when the API/database is running.
- Booking availability and price previews use server-side data. The customer can create a 15-minute temporary hold for an enabled PayPal, bank transfer or M-PAiSA method. Manual payment customers switch to their banking app, return to enter a transaction reference, and submit it for owner review; a submitted reference extends the hold to 24 hours. If no payment method is enabled, the customer can request a booking through WhatsApp without creating a hold.

## Not production-complete yet

- This is a development foundation, not a finished payment/production system.
- PayPal checkout endpoints and customer PayPal/card buttons are implemented, including server-side order creation/capture, currency-conversion snapshots and late-capture manual-review handling. Checkout remains disabled until the owner supplies valid PayPal API credentials, selects an account-supported payment currency, and configures an approved FJD-per-unit conversion rate. A PayPal email alone is not enough to authenticate API calls. Guest card checkout is shown only when PayPal marks it eligible for that account and transaction.
- Availability checks and booking submissions treat confirmed bookings and unexpired `pending_payment` holds as conflicts. Expired holds no longer block those checks.
- Vehicle photo uploads accept PNG, JPEG and WebP up to 5 MB, check signatures, ignore client filenames and use generated object keys. Uploads reject detectable EXIF, XMP and common text metadata rather than stripping it; sanitize photos before upload. Upload and serving remain disabled until an owner configures the optional R2 binding below.
- Login and public booking/availability requests use Cloudflare Rate Limiting bindings. These are coarse per-location limits and do not replace Cloudflare zone-level/WAF controls against distributed abuse. Set up edge rate limits and consider a bot challenge before launch.
- Editable general website text/settings, transactional email notifications, password reset, multiple admin accounts/roles, audit logs, backup policy, automated refunds/reconciliation and a formal security review remain to be built. Booking lookup is read-only; changes and cancellations are handed off to WhatsApp.
- Booking records contain personal data. The owner must approve a retention period, deletion/subject-request process, backup retention, and production access before launch.
- Confirm advertised vehicle photos, model years, rates and fleet details with the owner; vehicle visuals remain reference images until verified by the owner; the Honda Fit Shuttle reference has a tropical background and the Ford Ranger source has had its black letterbox bars cropped.

## Requirements

- Node.js LTS (current supported version)
- Internet access for `npm install` and Cloudflare tooling
- Cloudflare account for later deployment; local development can run without deploying the site

## Run locally on Windows

1. Extract this project folder.
2. Install Node.js LTS from https://nodejs.org/ if needed.
3. Open Command Prompt or PowerShell in this folder.
4. Run:

   ```powershell
   npm install
   Copy-Item .dev.vars.example .dev.vars
   ```

5. Edit `.dev.vars` and set a private admin email, a strong unique password and a long random `SESSION_SECRET`. Do not share or commit `.dev.vars`.
6. Apply the local D1 migrations:

   ```powershell
   npx wrangler d1 migrations apply zims-rental-db --local
   ```

7. Start the local server:

   ```powershell
   npm run dev
   ```

8. Open the local URL printed by Wrangler (usually `http://localhost:8787`). The public website is at `/`; the admin dashboard is at `/admin.html`.

If Wrangler says the database is not configured, check `wrangler.toml` and ensure the `database_name` matches `zims-rental-db`. The UUID currently in the file is a local placeholder; when creating the remote D1 database, replace it with the real ID returned by Wrangler.

## Prepare Cloudflare deployment later

1. Sign in to Cloudflare from the terminal: `npx wrangler login`.
2. Create the production database: `npx wrangler d1 create zims-rental-db`.
3. Replace `database_id` in `wrangler.toml` with the real production D1 ID.
4. Apply migrations remotely: `npx wrangler d1 migrations apply zims-rental-db --remote`.
5. Set production secrets without putting them in files:

   ```powershell
   npx wrangler secret put ADMIN_EMAIL
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put PAYPAL_CLIENT_ID
   npx wrangler secret put PAYPAL_CLIENT_SECRET
   # Optional: set only if you want to pin the intended PayPal payee
   npx wrangler secret put PAYPAL_RECEIVER_EMAIL
   ```

   Configure `PAYPAL_MODE`, `PAYPAL_CURRENCY` and the owner-approved `PAYPAL_FJD_PER_UNIT` in the intended Worker environment. Keep `PAYPAL_MODE=sandbox` until sandbox tests pass. Never copy credentials into source files or commit `.dev.vars`. Use a long, unique admin password and a separate random session secret. For production, prefer a proper multi-user identity system and add role management before giving the client access.
6. Deploy only after security, sandbox payment, database migration and booking testing: `npm run deploy`.

Do not add the client's live domain or change DNS until the client approves the test deployment. Keep the existing Netlify version live as rollback.

## Main files

- `public/index.html` — approved public website
- `public/admin.html` — admin dashboard UI, discount-tier editor and selected website-copy editor
- `public/assets/` — original project assets
- `src/index.js` — Worker API
- `migrations/` — D1 schema and starter fleet seed
- `wrangler.toml` — Cloudflare Worker/static assets/D1 configuration


## Tests

Run `npm test` to execute the automated suite. It covers booking and quote APIs, discount tiers, PayPal order/capture behavior with a mocked API, booking lookup, admin protections, request guards, and Fiji-local dates. Two additional tests use Miniflare to exercise D1 concurrency/rollback; they are skipped with an explicit reason if project dependencies are not installed. Mocked PayPal tests do not prove live merchant eligibility or settlement.


## Deposit preferences and checkout readiness

Vehicle deposit percentages are optional and configured per vehicle. Booking records snapshot the selected payment option, configured percentage, total rental price, amount due and balance due. PayPal REST does not list FJD as a supported payment currency, so checkout remains disabled until the owner approves a supported currency and conversion policy and confirms Fiji merchant account eligibility.

## PayPal checkout configuration

The customer page loads enabled methods from `/api/payment-methods`. PayPal checkout creates a 15-minute booking hold, creates the PayPal order server-side, captures only after PayPal approval, verifies the returned order/capture/amount/currency, and updates the booking from verified capture data. Bank transfer and M-PAiSA create the same initial 15-minute hold, show owner-configured instructions, and let the customer submit a transaction reference. A submitted reference extends the hold to 24 hours for review. Only the authenticated owner can approve/reject through the dedicated review endpoint, and approval is refused if the hold expired or dates now conflict. The owner must independently verify funds in the real bank/payment account; a reference or screenshot alone is not proof. The customer never submits card details to this Worker.

PayPal does not support FJD as a checkout currency. Before enabling payments, the owner must confirm that their Fiji merchant account can receive payments in the selected currency, decide who bears PayPal's conversion/processing fees, and approve an explicit conversion rate. The Worker snapshots the currency, amount and FJD-per-currency-unit rate on each booking so later configuration changes do not rewrite old payment amounts. Supported checkout currency values in this implementation are `USD`, `AUD`, `NZD`, `CAD`, `EUR`, `GBP` and `SGD`; account eligibility still must be verified.

For local sandbox testing, copy `.dev.vars.example` to `.dev.vars` and configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=sandbox`, `PAYPAL_CURRENCY`, and `PAYPAL_FJD_PER_UNIT`. `PAYPAL_RECEIVER_EMAIL` is optional and can pin the intended payee, but the API credentials are still required. Never put live credentials in source files. For production, add the client ID/secret and optional receiver email through Cloudflare's secret manager; configure mode, currency and the approved rate in the intended Worker environment. Keep `PAYPAL_MODE=sandbox` until sandbox flows are verified, and do not enable live mode until the merchant account and rate policy are approved.

The built-in payment tests mock PayPal's API. They verify order creation, conversion snapshots, successful capture, and late capture handling; they do not prove live merchant eligibility, guest-card availability or a real PayPal settlement. No payment credentials are included in this ZIP.

## Vehicle image storage setup

No R2 bucket has been created or configured by this project. To enable the guarded upload route, the owner must create an R2 bucket in the intended Cloudflare account and add this binding to `wrangler.toml`, replacing the placeholder with the exact bucket name:

```toml
[[r2_buckets]]
binding = "VEHICLE_IMAGES"
bucket_name = "<owner-created-bucket-name>"
```

Keep the bucket private; the Worker serves only generated image keys saved for vehicles. Configure the same binding for local development before testing uploads. Remove private EXIF/location metadata from images before upload; the Worker validates signatures but does not rewrite image metadata. Do not add production bucket settings or deploy until the owner approves the account, bucket, retention, and access configuration.

## Discounts and promotions

Promotional banners are owner-authored, have an enabled flag, UTC start/expiry instants and integer priority. A start instant is inclusive, expiry is exclusive, and the highest-priority currently eligible banner is shown in the existing top strip. No offer text or urgency is generated by the site. Migration `0006_promotional_banners.sql` adds the banner table; apply it only through the approved migration process before enabling this feature in a deployed environment.

Booking discounts are calculated from the saved vehicle daily rate and Fiji calendar-day duration. The automatic rule starts at seven billable days, applies 10%, and caps the discount at FJ$100. A percentage code can be used only below the automatic threshold; codes never stack. Codes are normalized to uppercase and limited to one active/completed redemption per normalized booking email. Their start time is inclusive and their expiry instant is exclusive. Admin schedule fields are Fiji local times; unique local instants are stored in UTC and ambiguous/nonexistent times are rejected. All discount, final-total, deposit and balance snapshots are stored in integer FJD cents. The customer preview is an estimate; the Worker recalculates and saves the authoritative values.

Migration `0007_booking_discounts.sql` adds automatic-rule configuration, per-vehicle tier overrides, discount codes, one-use reservations, idempotency keys, immutable booking/payment snapshots and allowlisted website-copy settings. Migration `0008_manual_payment_review.sql` adds owner-configured manual payment methods and transaction-reference/review audit fields. Neither migration has been applied to a live database. Review the migration and approve it separately before enabling the new routes against a local D1 database. Existing bookings retain their original totals and payment snapshots; historical rates and durations remain unknown. PayPal order creation/capture is implemented behind explicit environment configuration. Successful captures mark code reservations redeemed; a capture that completes after the hold expires is recorded but is not automatically confirmed and requires manual review. Refund processing and a PayPal webhook/reconciliation job are not implemented; do not issue refunds or treat a refund as restoring a discount-code use automatically.

## Manual bank transfer and M-PAiSA review

The owner configures bank name/account holder/account number/instructions and M-PAiSA recipient/mobile number/instructions in the new **Payment methods** admin tab. Each method can be enabled independently. M-PAiSA QR images can be uploaded through the authenticated admin route when the existing image-storage binding is configured; the upload validates PNG/JPEG/WebP signatures, limits files to 5 MB, rejects detectable EXIF/XMP/text metadata, and uses generated object keys. The QR upload shares the existing `VEHICLE_IMAGES` R2 binding but stores objects under a separate `payment-qr/` prefix.

Manual checkout sequence: create a validated 15-minute hold; customer makes the payment in their bank/M-PAiSA app; customer submits the transaction reference; the hold is extended to 24 hours; owner independently checks the transaction and uses **Verify payment & confirm** or **Reject payment** in the admin dashboard. Approval records reviewer and timestamp, marks full payment as `paid` or deposit as `deposit_paid`, redeems reserved discount usage and confirms only if the hold is still valid and dates do not conflict. Rejection requires a reason, marks payment `failed`, releases the hold and releases reserved discount usage. Generic booking-status edits cannot confirm or reject a booking after a manual reference has been submitted.

Do not enable manual methods until the owner has entered and checked the real receiving details. This workflow is manual verification, not a bank/M-PAiSA API integration. The website does not independently prove that funds arrived.

## Security and operations

### Request limits and validation

The Worker uses the Wrangler Cloudflare Rate Limiting bindings declared in `wrangler.toml`: login is limited to 5 attempts per minute per source IP and 10 per minute per normalized account; booking creation is limited to 5 per minute per IP; availability checks are limited to 30 per minute per IP; admin image uploads are limited to 10 per minute per IP. Rate-limit keys are HMAC-derived with `SESSION_SECRET` when configured; the raw address/email is not sent as a binding key. Denials return HTTP 429 with `Retry-After: 60`. Protected request routes fail closed with HTTP 503 if a required binding is unavailable. Cloudflare documents these counters as per-location and eventually consistent, and warns that IP limits can affect users sharing a public address. Configure zone-level/WAF limits and bot protections for distributed sources, and review thresholds against real traffic before launch.

JSON request bodies are streamed with a 16 KB cap and must use `application/json`. Image uploads are streamed with a 5 MB file cap plus bounded multipart overhead. Uploads validate file signatures and generated storage keys; the submitted filename is ignored. The Worker rejects JPEG APP1/APP13/comment segments, PNG EXIF/text chunks and WebP EXIF/XMP chunks. This is a metadata rejection check, not an image re-encoder or complete image-file validator; use a trusted metadata-removal tool before upload and confirm the sanitized result. No R2 bucket is created by this project.

The booking insert performs the overlap test and creates the 15-minute hold in one D1 statement. Availability is advisory; the booking insert remains the authoritative conflict check. Do not split that statement into separate availability/read and insert operations.

### Environment configuration

The Worker expects D1 binding `DB`, static assets binding `ASSETS`, and the three rate-limit bindings in `wrangler.toml`. Admin login requires secret values named `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `SESSION_SECRET`; provide these through the deployment platform's secret manager, never source control. Optional vehicle image storage uses an owner-created private R2 bucket bound as `VEHICLE_IMAGES`; no bucket or production binding is provisioned here. Configure equivalent bindings in each intended environment. Do not copy `.dev.vars` into test copies or inspect it when checking configuration.

Before launch, verify binding presence in a non-production environment, test 429 and fail-closed behavior, and confirm Cloudflare overwrites `CF-Connecting-IP` at the edge. Direct/local requests without that header share the `unknown` bucket. Keep the admin session secret stable for active sessions, rotate it after suspected exposure, and expect rotation to invalidate existing sessions.

### Privacy, retention, backup and recovery

Bookings contain names, email addresses, phone numbers, rental dates and optional customer notes. Minimize notes, restrict dashboard and D1 access to named operators, use HTTPS, avoid copying production data into development, and do not place personal data or secrets in logs. This repository does not establish the legal retention period or automatic deletion policy; the owner must approve both and check applicable Fiji privacy obligations before accepting live bookings.

The project does not configure backups or recovery. Before production use, the owner should select a D1 backup/export cadence and retention period, restrict and encrypt exported copies, store recovery material separately from the application account, document who can restore it, and rehearse restoring into a separate non-production database. Decide acceptable recovery-point and recovery-time targets; verify the chosen Cloudflare account/plan supports any desired point-in-time recovery. Never test recovery by resetting or overwriting production data.
