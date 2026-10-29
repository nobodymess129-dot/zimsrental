import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const fleet = readFileSync(new URL('../public/fleet.html', import.meta.url), 'utf8');

test('homepage binds saved business contact details to visible text and links', () => {
  assert.match(home, /data-site-setting="business_phone"/);
  assert.match(home, /data-site-setting="business_email"/);
  assert.match(home, /data-site-setting-href="business_whatsapp"/);
  assert.match(home, /data-site-setting-href="business_facebook"/);
  assert.match(home, /data-site-setting-href="business_map_url"/);
  assert.match(home, /data-site-setting-src="business_logo_url"/);
});

test('fleet page binds shared address, contact, WhatsApp and logo settings', () => {
  assert.match(fleet, /data-site-setting="business_address"/);
  assert.match(fleet, /data-site-setting="business_phone"/);
  assert.match(fleet, /data-site-setting="business_email"/);
  assert.match(fleet, /data-site-setting-href="business_whatsapp"/);
  assert.match(fleet, /data-site-setting-src="business_logo_url"/);
  assert.match(fleet, /loadFleetSiteSettings\(\)/);
});
