import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const localLinks = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);

test('every customer-page in-page link has a matching target', () => {
  assert.ok(localLinks.length > 0);
  for (const target of localLinks) {
    assert.ok(ids.has(target), 'missing in-page target #' + target);
  }
});


test('customer page includes responsive navigation, reduced-motion support, and checkout-safe copy', () => {
  assert.match(html, /id="mobileMenuToggle"/);
  assert.match(html, /id="mobileNav"/);
  assert.match(html, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /id="manageResult"/);
  assert.match(html, /no booking hold was created/i);
  assert.match(html, /id="paymentMethod"/);
  assert.match(html, /id="manualPaymentForm"/);
  assert.match(html, /owner checks the actual transaction/i);
});


test('customer contact details use the supplied business email consistently', () => {
  assert.ok(html.includes('zimsrental@gmail.com'));
  assert.ok(!html.includes('zimsrentalfj@gmail.com'));
});



test('customer page includes the dedicated fleet link, scroll-active car marker, and compact contact/map layout', () => {
  assert.match(html, /href="fleet\.html"/);
  assert.doesNotMatch(html, /<section id="fleet" class="section wrap">/);
  assert.match(html, /location\.href = 'fleet\.html\?' \+ params\.toString\(\)/);
  assert.match(html, /function initScrollReveals\(\)/);
  assert.match(html, /nav-car-indicator/);
  assert.match(html, /class="contact-card contact-combined"/);
  assert.match(html, /class="map-frame"/);

  // Verify the current approved contact layout, not the old CSS values.
  assert.match(html, /\.contact-section \.contact-grid\{[^}]*grid-template-columns:minmax\(0,855px\) minmax\(300px,405px\)!important/);
  assert.match(html, /\.contact-section \.contact-grid\{[^}]*align-items:center!important/);
  assert.match(html, /\.contact-section \.map-frame\{[^}]*height:180px!important;min-height:180px!important;max-height:180px!important/);
  assert.match(html, /@media\(max-width:780px\)/);
  assert.match(html, /@media\(max-width:520px\)/);
  assert.match(html, /\.contact-section \.map-frame\{height:160px!important;min-height:160px!important;max-height:160px!important\}/);
  assert.match(html, /class="contact-half"><div class="big" aria-hidden="true">f<\/div><h3>Facebook<\/h3><p data-site-setting="business_name">Zims Rental Cars<\/p>/);
  assert.match(html, /assets\/hibiscus-tattoo\.webp/);
});


test('international phone entry supports a custom country calling code', () => {
  assert.match(html, /id="guestPhoneCode"/);
  assert.match(html, /id="guestPhoneCustomCode"[^>]*pattern="\\\+\[0-9\]\{1,4\}"/);
  assert.match(html, /function fullGuestPhone\(\)\{[^}]*guestPhoneCustomCode/s);
});



test('contact section balances the map vertically and reduces excess section padding', () => {
  assert.match(html, /\.contact-section\{padding:0 0 16px!important/);
  assert.match(html, /\.contact-section \.section-title\{margin-bottom:16px!important/);
  assert.match(html, /\.contact-section \.contact-grid\{[^}]*align-items:center!important/);
  assert.match(html, /\.contact-section \.contact-grid\{[^}]*gap:26px!important/);
  assert.match(html, /\.contact-section \.contact-combined\{display:flex!important;flex-direction:column!important/);
  assert.match(html, /\.contact-section \.map-frame\{[^}]*height:180px!important/);
  assert.match(html, /@media\(max-width:780px\)/);
  assert.match(html, /@media\(max-width:520px\)/);
});


test('fleet gallery thumbnails use clean image tiles with labels below the image', () => {
  const fleetHtml = readFileSync(new URL('../public/fleet.html', import.meta.url), 'utf8');
  assert.match(fleetHtml, /gallery-thumbs button\{display:flex;flex-direction:column/);
  assert.match(fleetHtml, /gallery-thumbs img\{display:block;width:100%;height:76px/);
  assert.match(fleetHtml, /gallery-thumbs span\{display:block;padding:8px 4px 3px/);
  assert.match(fleetHtml, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

