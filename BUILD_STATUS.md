# Zims Rental Cars Nadi — Development status

## Changes in this working package

- Premium visual refinement for the existing tropical brand: responsive navigation, polished vehicle cards and containers, hover/scroll transitions, keyboard focus states, and reduced-motion support.
- Higher-resolution Honda Fit Shuttle and Ford Ranger reference images; other vehicle imagery still needs owner verification against the real fleet.
- Owner dashboard support for vehicle management, deposit percentages, promotional banners, discount codes, global discount defaults, per-vehicle multi-tier automatic discounts, and allowlisted website copy.
- Read-only booking lookup by reference and normalized email; customer changes/cancellations are handed to WhatsApp.
- PayPal server-side order creation/capture groundwork, supported-currency conversion snapshots, guest-card button when PayPal indicates eligibility, and late-capture manual-review handling.
- Added owner-configurable bank transfer and M-PAiSA settings, customer transaction-reference submission, a 15-minute initial hold extended to 24 hours after submission, and a dedicated authenticated owner review action that records reviewer/time/decision and checks expiry/overlap before confirmation.
- Added validated M-PAiSA QR image upload/serving using the existing image-storage binding and a separate `payment-qr/` object prefix.
- PayPal checkout fails closed unless credentials, a supported currency, and an owner-approved FJD conversion rate are configured. If no method is enabled, customers are routed to WhatsApp without creating a temporary booking hold; enabled manual methods can create a temporary hold without PayPal credentials.
- Zero-value bookings are rejected instead of creating a hold that bypasses payment.
- Added baseline security headers to static customer/admin assets: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy` disabling unused camera/microphone/geolocation access.
- Corrected customer-facing contact email to `zimsrentalfj@gmail.com` and added a regression test.
- Added `LAUNCH_CHECKLIST.md` with deployment, security, payment, browser-test and owner approval gates.

## Automated verification

Latest `npm test`: **92 discovered, 90 passed, 0 failed, 2 skipped**. The skipped tests exercise Miniflare D1 concurrency and rollback; Miniflare could not be resolved/installed in this environment. These tests remain a blocker to claiming complete database concurrency verification.

`node --check src/index.js` and `node --check test/request-guards.test.js` passed. The new asset-header test and contact-email regression test passed as part of the full suite.

PayPal tests mock the provider API; they do not verify live merchant eligibility, guest-card availability, real currency settlement, or a real payment. No visual browser run occurred in this environment.

## Not done / launch blockers

- No migrations have been applied to local or remote Cloudflare D1 by this pass. Migrations 0007 and 0008 still require review/application in an isolated local/staging database before enabling these routes against a deployed database.
- No Worker was deployed and no DNS/nameserver settings were changed.
- PayPal sandbox credentials, supported currency, conversion policy/rate, and Fiji merchant eligibility are not configured/verified. FJD is not a PayPal REST checkout currency.
- PayPal webhooks/signature verification, automated reconciliation/refunds, and email notifications are not implemented. Payment ambiguity needs manual review.
- R2 vehicle and payment-QR image upload require an owner-configured bucket/binding. QR upload was tested with a mocked bucket; no real R2 upload or browser rendering test was performed.
- Real browser/mobile visual tests, live account checks, fleet/photo/rate verification, privacy/retention policy, backups/restore rehearsal, and a formal security review remain outstanding.

The package is improved and testable, but it is **not honestly certifiable as production-ready yet**. Use the checklist before launch and keep live payments disabled until the provider and account checks are completed.

## Owner-requested website review update (2026-10-17, Version 4)

Implemented in this handover copy:
- Reduced the vertical spacing in the hero, homepage sections, fleet introduction, contact area, and footer while keeping the booking panel's dimensions/layout rules intact.
- Reworked the contact area into a compact combined WhatsApp/call + email card alongside a fixed-height Google Maps card, and changed the map query to include the business name and supplied Nadi address. The owner must verify that the returned map pin is the exact business entrance.
- Replaced the small geometric flower with a transparent tattoo-inspired hibiscus illustration, contained within the footer so it does not float over the map, booking buttons, or body content.
- Replaced the Honda Fit Shuttle image with a high-resolution tropical-background reference image and cropped the visible black letterbox bars from the supplied Ford Ranger reference. Other fleet images use a consistent wide image area; the Ranger background is still a different reference setting and needs owner approval.
- Refined fleet card proportions, image-to-title spacing, vehicle-name typography, price/features hierarchy, and photo-gallery styling on both the homepage and dedicated Fleet page.
- Added a compact footer to the dedicated Fleet page and matched its card/footer styling to the homepage.
- Replaced the emoji navigation indicator with a black side-view car SVG and corrected the scroll observer so it tracks Home, fleet preview, How It Works, About Us, Travel Guide, and Contact without duplicate indicators.
- Added a custom country calling-code field for countries not listed in the common-code dropdown, with validation and inclusion in the WhatsApp enquiry phone number.
- Added a real `public/favicon.ico` generated from the supplied business logo.
- Added regression tests for the dedicated Fleet page, new visual assets, compact contact/map layout, navigation indicator, and custom international calling-code entry.

## Validation for Version 4
- `node --check` passed for the inline JavaScript in `public/index.html` and `public/fleet.html`.
- `npm test`: **85 discovered, 83 passed, 0 failed, 2 skipped**. The two skipped tests cover Miniflare D1 concurrency and rollback; the local Miniflare package could not be resolved in this environment. The owner previously reported all 81 tests passing on their Windows installation before these UI changes.
- Static HTML parsing completed for `index.html`, `fleet.html`, and `admin.html`. A headless Chromium screenshot attempt did not complete in this environment, so this is not a substitute for the owner's visual browser review.
- No migrations, production deployment, DNS changes, or production resource modifications were made. API 500 errors and availability-search failures remain intentionally deferred until after the owner's visual review, as requested.

## Remaining owner checks and launch blockers
- Verify the exact Google Maps business pin and confirm the new Honda image is representative of the actual vehicle. The Ford Ranger reference has had black bars cropped, but still has a different background style; a matching tropical Ford image remains a visual follow-up.
- Interior photos for the exact vehicles have not been supplied. Gallery popups disclose this instead of inventing interiors.
- Seating, equipment, fuel-economy ratings, model years, vehicle images and rates require owner verification. Fuel economy remains explicitly not rated.
- Local admin login still requires a private `.dev.vars` file and a local D1 schema; do not include credentials in this ZIP. Follow README.md for setup, and review local migrations before applying them.
- The observed local API 500 errors and availability-search failure remain unresolved until the owner approves that stage. Do not deploy this build as production-ready.
- PayPal sandbox credentials, supported currency, owner-approved conversion policy, Fiji merchant eligibility, webhook/reconciliation, automated refunds, privacy/retention policy, backup/restore rehearsal and formal security review remain outstanding.

## Owner review implementation pass (2026-10-17)

Implemented in this working copy:
- Removed the vehicle-card grid from the homepage; the full fleet remains on `public/fleet.html`.
- Updated the homepage availability-search success path to pass selected dates and available vehicle IDs to the dedicated Fleet page, and carried selected dates into the booking flow.
- Added all 21 owner-supplied vehicle gallery images (front interior, rear interior and boot/cargo area for each of seven vehicles) under `public/assets/interiors/`.
- Updated the Fleet gallery with labeled thumbnails, click-to-view selection, keyboard left/right navigation, Escape-to-close, and booking handoff.
- Generated and integrated a compact Zims tropical app icon for `favicon.ico`, PNG favicon and Apple touch icon.
- Slowed the logo/name entrance animation and made the footer logo animation begin when the footer enters view.
- Moved the hibiscus decoration to a fixed floating layer on both customer pages; it shrinks and fades when contact/map or footer areas are visible to reduce obstruction.
- Tightened contact/map sizing and footer spacing with responsive overrides.
- Updated markup tests for the dedicated Fleet page and the owner-supplied gallery images.

Validation performed:
- `npm test`: 83 passed, 0 failed, 2 skipped.
- Inline JavaScript syntax checks passed for index.html, fleet.html and admin.html.
- Checked local asset references in index.html and fleet.html; no missing referenced local assets were found.
- Confirmed the homepage no longer contains the vehicle fleet section.

Known limitations / still needs visual confirmation:
- Backend API/availability console errors are intentionally deferred until the owner reviews the visual changes.
- The Ford Ranger exterior image still uses the existing reference photograph and has not yet been harmonized to the same tropical background as the other cars.
- Exterior vehicle references, exact model year, seating and equipment need owner verification before production use.
- No production deployment, remote migration, DNS change, or production secret change was performed.


## Visual correction update — 2026-10-18

- Replaced the low-resolution Ford Ranger exterior reference with a new high-resolution tropical-background image at `public/assets/ford-ranger.jpg` (1440×810). It uses a front three-quarter view and the same 16:9 card ratio as the fleet imagery. This is an illustrative generated image; verify it against the owner's actual vehicle before publishing.
- Changed the homepage Google Maps iframe to a square 1:1 viewport across desktop and mobile breakpoints.
- Added a regression assertion for the square map styling.
- Automated test run after these changes: 83 passed, 0 failed, 2 skipped (D1 concurrency/rollback coverage).
- Remaining image quality note: the original Toyota Fielder, Toyota Corolla, Nissan AD Wagon, Kia Sportage, and Nissan X-Trail source images are approximately 200×115 pixels and can still look soft when enlarged. They need approved high-resolution replacements before production if accurate exterior photos are available.


## Visual correction update — 2026-10-18 (compact map)

- Removed the square map sizing that made the homepage contact section excessively tall. The map is now a compact 205px-tall panel on desktop, 190px on tablet, and 165px on small mobile screens; the call/email panel is vertically balanced alongside it.
- Reprocessed the existing Toyota Fielder and Toyota Corolla reference assets to 1200px wide with restrained sharpening and contrast adjustments, preserving the existing image content and tropical-style reference appearance. This is an upscaling/sharpening pass, not a substitute for original high-resolution vehicle photography; inspect the cards in the browser before approving them for production.
- Updated the contact-layout regression test to enforce compact map sizing and prevent the old square-map rule from returning.
- `node --test`: 83 passed, 0 failed, 2 skipped (D1 concurrency/rollback tests).
- No backend/API changes, migrations, deployments, DNS changes, or production resources were touched.


## Vehicle image replacement and final handover audit — 2026-10-18

- Replaced the Toyota Fielder, Toyota Corolla, Nissan AD Wagon, Kia Sportage, and Nissan X-Trail exterior assets with individually cropped panels from the owner-approved generated tropical vehicle collage. The files are stored separately at `public/assets/toyota-fielder.jpg`, `toyota-corolla.jpg`, `nissan-ad-wagon.jpg`, `kia-sportage.jpg`, and `nissan-x-trail.jpg`.
- Standardized each replacement image to 1440×810 (16:9) JPEG so the five assets have consistent card dimensions and crisp rendering. These are AI-generated illustrative vehicle images, not photographs verified against the owner's actual fleet. Owner should confirm that the visible trim/model is representative before publishing.
- The existing homepage and Fleet page already reference these exact asset paths; no page markup changes were needed for the replacement.
- Re-ran `node --check src/index.js` successfully and `npm test`: 85 discovered, 83 passed, 0 failed, 2 skipped. The skipped tests are D1 concurrency/rollback coverage because the Miniflare test dependency is not available in this environment.
- A headless Chromium screenshot attempt timed out in this environment, so desktop/mobile visual rendering is still not verified by screenshot. Static tests do not prove the deployed Worker APIs work.
- No `.dev.vars` secrets were included, no local or remote database migrations were run, no bookings were changed, and no production deployment or DNS changes were made.

### Remaining launch blockers (not represented as complete)
- Resolve the previously observed Worker API 500 errors and availability-search failure using the user's local environment and configured bindings/database, then test the real page through `wrangler dev`.
- Configure and test the local admin login with private local secrets and an isolated local D1 schema.
- Finish the browser/mobile visual check and confirm the exact map pin.
- Complete payment-provider eligibility/currency/conversion approval, webhook/reconciliation and live/sandbox checkout validation before enabling payments.
- Review privacy/retention, backups/restore, actual fleet photos/rates/equipment, and security before production.

## 2026-10-18 — Contact section refinement (Version 9)

- Changed the homepage contact methods to stack vertically: WhatsApp/Call, Email, and Facebook.
- Added the Facebook display name **Zims Rental Cars** linking to the supplied Facebook page (`https://www.facebook.com/zimsfiji`).
- Changed the contact grid to a broad left column for the stacked contact options and a compact right column for the map.
- The map iframe is square on desktop (300 × 300 px), scales down on smaller screens, and stays in a centered compact card on mobile.
- Added a customer-markup regression test for the vertical stack, Facebook label/link, and square map styling.
- Validation: `node --check src/index.js` passed; `node --test` reports 85 tests, 83 passed, 0 failed, 2 skipped. Skipped tests are D1 concurrency and rollback coverage requiring installed project dev dependencies.
- No production deployment, DNS changes, remote migrations, secret edits, or booking mutations performed. Browser screenshot verification is still outstanding.


## Contact balance and gallery refinement — 2026-10-18

- Updated the homepage contact section so the contact list and compact map are vertically centred against each other on desktop. Reduced section bottom padding to avoid excess pale-blue space. Map iframe is 176px tall on desktop, 190px on tablet/mobile, and 175px on small mobile.
- Redesigned the Fleet page gallery thumbnails as consistent selectable image tiles with labels below the images, clear active-state styling, and responsive sizing. This fixes the label/image overlap visible in the supplied screenshot.
- Kept the existing booking logic, car data, map destination, and customer contact details unchanged.
- Added markup/CSS regression assertions for the new contact balance and gallery tile layout.
- Browser screenshot rendering still needs owner confirmation; automated checks do not guarantee identical rendering in every browser.
