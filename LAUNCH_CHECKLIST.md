# Zims Rental Cars Nadi — Launch and owner-test checklist

This checklist is intentionally conservative. A green local test suite is not proof that production payments or Cloudflare configuration work.

## Before test deployment

- [ ] Confirm the owner's email, phone/WhatsApp, address, advertised fleet, actual vehicle photos, daily rates, deposits, rental terms, pickup/drop-off terms, and cancellation/refund policy.
- [ ] Set a unique strong `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and random `SESSION_SECRET` in the target environment's secret manager. Never upload `.dev.vars`.
- [ ] Review migrations 0006, 0007 and 0008 against the target database. Apply them to local/staging only after reviewing the database and preserving backups. Do not run remote migrations until explicitly approved.
- [ ] Configure required D1 and rate-limit bindings for the intended environment.
- [ ] If owner vehicle-photo or M-PAiSA QR uploads are needed, create and approve a private R2 bucket and bind `VEHICLE_IMAGES`. Otherwise use an approved HTTPS QR image URL and keep uploads disabled.
- [ ] Set up edge/WAF rate limits and bot protection appropriate for admin login and public booking endpoints.
- [ ] Confirm booking privacy notice, data retention, backup/export schedule, and restore procedure.

## Payment readiness

- [ ] Keep PayPal in sandbox mode for development.
- [ ] Obtain sandbox Client ID and Client Secret from the owner's PayPal developer app; configure as environment secrets/vars, never in source or D1.
- [ ] Verify the owner's merchant eligibility and which supported currency can actually be received. PayPal REST checkout does not list FJD.
- [ ] Owner explicitly approves the payment currency, the FJD-per-unit conversion rate, when the rate is updated, and who bears processing/conversion fees.
- [ ] Test PayPal buyer approval, successful capture, cancellation, decline/failure, duplicate retry, mismatched amount/currency/order, expired hold, and late capture requiring manual review.
- [ ] Verify PayPal booking confirmation only follows verified server-side capture. Do not rely on a customer return URL as proof of payment.
- [ ] Enter and independently verify bank-transfer/M-PAiSA receiving details before enabling those methods. Test temporary holds, reference submission, 24-hour review holds, owner approve/reject, rejected payment release, expired holds and overlap conflicts. A reference or uploaded QR is not proof of payment.
- [ ] Do not activate live mode until the sandbox checks and owner/account checks pass.
- [ ] A 90% discount is for a controlled, unique, low-use test only. Do not leave it publicly enabled; deactivate it after the test. Test discount calculations separately from payment capture.

## Browser / functional tests

- [ ] Customer desktop and mobile navigation, keyboard use, reduced-motion behavior, layout, image loading and console/network errors.
- [ ] All vehicles and rates match the owner's real fleet.
- [ ] Fiji-local pickup/return date calculations, same-day rental, invalid dates, timezone offsets, and calendar-day duration.
- [ ] Available dates, overlapping booking attempts, pending hold expiry, and availability refresh.
- [ ] Quote totals, deposit/full-payment choices, discount tiers, code eligibility, code expiry, usage limits and non-stacking.
- [ ] Booking lookup requires the correct reference and matching email and reveals only appropriate booking information.
- [ ] Admin login/logout, session expiry, unauthorized requests, invalid input, rate limits, vehicle updates, promotion schedules, site copy, discounts and booking status controls.
- [ ] Test API responses and browser headers in the actual Cloudflare staging deployment.

## Launch gates

- [ ] All applicable automated tests pass, including the currently skipped Miniflare D1 concurrency/rollback tests.
- [ ] Test Worker and database are verified without touching production data.
- [ ] Test deployment succeeds with correct secrets and bindings.
- [ ] The owner approves the exact production settings and live payment configuration.
- [ ] Backups and rollback procedure are ready.
- [ ] Only after the above, approve production migration/deployment and DNS/nameserver changes as separate actions.

## Known limitations in this package

- Automated email notifications are not implemented.
- PayPal webhook signature verification, automated reconciliation and refunds are not implemented; late or ambiguous payments require manual review.
- Customer self-service booking changes/cancellations are not implemented; those are handled via WhatsApp.
- Real R2 vehicle-photo and payment-QR upload flows have not been tested against an actual configured bucket.
- Visual browser testing and live payment testing have not been performed in this environment.

## Additional owner-review checks (2026-10-17)
- [ ] Confirm homepage has no vehicle-card grid and the Fleet navigation opens the dedicated Fleet page.
- [ ] Test availability search handoff to Fleet with selected dates; backend availability errors remain a separate follow-up.
- [ ] Open each vehicle gallery and verify exterior, front interior, rear interior and boot/cargo photos.
- [ ] Verify favicon in browser tab and mobile touch icon.
- [ ] Observe header logo animation on initial load and footer logo animation when scrolling down.
- [ ] Check floating hibiscus at desktop/mobile sizes and confirm it never obscures text or controls.
- [ ] Verify compact contact/map section and footer on desktop, tablet and mobile.
- [ ] Review Ford Ranger exterior image: current reference still needs matching tropical background.
