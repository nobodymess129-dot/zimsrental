import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../public/fleet.html', import.meta.url), 'utf8');

test('fleet page has independent page structure, filters, vehicle gallery and booking handoff', () => {
  assert.match(html, /<title>Our Fleet \| Zims Rental Cars Nadi<\/title>/);
  assert.match(html, /data-filter="SUV"/);
  assert.match(html, /id="fleetGrid"/);
  assert.match(html, /id="galleryBg"/);
  assert.match(html, /Front interior/);
  assert.match(html, /nissan-ad-wagon-front\.jpg/);
  assert.match(html, /ford-ranger-boot\.jpg/);
  assert.match(html, /availabilityMessage/);
  assert.match(html, /function bookingUrl\(c\)/);
  assert.match(html, /active-section/);
  assert.match(html, /fleet-footer/);
});

test('new visual assets exist and the homepage favicon is supplied', () => {
  const assets = new URL('../public/assets/', import.meta.url);
  assert.ok(existsSync(new URL('hibiscus-tattoo.webp', assets)));
  assert.ok(existsSync(new URL('honda-fit-shuttle.jpg', assets)));
  assert.ok(existsSync(new URL('ford-ranger.jpg', assets)));
  assert.ok(existsSync(new URL('../public/favicon.ico', import.meta.url)));
  assert.ok(existsSync(new URL('zims-app-icon.png', assets)));
  for (const photo of ['toyota-fielder-front.jpg','toyota-corolla-back.jpg','honda-fit-shuttle-boot.jpg','nissan-ad-wagon-front.jpg','kia-sportage-back.jpg','nissan-x-trail-boot.jpg','ford-ranger-front.jpg']) assert.ok(existsSync(new URL('interiors/'+photo, assets)), 'missing '+photo);
});
