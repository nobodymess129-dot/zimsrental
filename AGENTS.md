# Zims Rental Cars — Project Instructions

## Project and architecture
- This is the Zims Rental Cars website for Nadi, Fiji.
- Keep the existing static HTML/CSS/JavaScript, Cloudflare Worker, D1 database and Wrangler architecture.
- Do not rebuild using another framework unless explicitly approved.
- Develop and test locally first. The live Netlify website must remain untouched until the replacement is approved.

## Working rules
- Inspect the actual current source files before making changes.
- Never guess file contents, routes, API payloads, database fields or existing behavior.
- Work on one clearly defined feature at a time.
- Before editing, explain the intended behavior and files to be changed.
- Preserve existing working functionality.
- Never print or expose secrets from `.dev.vars` or credential files.
- Never stage or commit files unless explicitly approved.
- Never deploy, run remote database migrations or modify production resources without explicit approval.
- Never manually mark bookings as paid or confirmed through the generic booking editor. A dedicated manual-payment review action is allowed only after the owner independently verifies the actual bank/M-PAiSA transaction; it must record the reviewer, timestamp and decision, require a transaction reference, and preserve conflict/hold checks.
- Do not delete booking records without approval.

## Website scope
- Customer-facing rental website with a simple owner-managed admin panel.
- Vehicle editing: names, descriptions, photos and prices.
- Discount codes with configurable rules and limits.
- Automatic rental-duration discounts configured by the owner.
- Website sales and promotional banners.
- Basic booking availability and secure payment processing.
- Do not build fleet maintenance management, booking calendars or business analytics unless requested later.

## Testing and reporting
- Inspect `package.json` before choosing or running commands.
- Propose an automated testing setup compatible with the existing Cloudflare Worker and D1 project.
- Prefer local tests and a local database.
- Test booking availability, overlapping bookings, hold expiry, cancellation, pricing and payment security.
- Never claim a test passed unless it was actually run and passed.
- Report changed files, commands run, test results and remaining risks.
- Do not install packages, change database data or deploy without approval.