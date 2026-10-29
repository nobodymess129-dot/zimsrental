import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);

test('admin HTML contains the two primary sections', () => {
  assert.match(html, /data-main-tab="dashboard"/);
  assert.match(html, /data-main-tab="setup"/);
  assert.match(html, /id="dashboard-tab"/);
  assert.match(html, /id="setup-tab"/);
});

test('admin dashboard includes operational summaries and lists', () => {
  for (const id of ['dash-active-cars', 'dash-bookings', 'dash-pending', 'dash-pickups', 'dash-returns', 'dash-revenue', 'dash-upcoming', 'dash-recent']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
});

test('admin retains existing management sections', () => {
  for (const id of ['vehicles-tab', 'bookings-tab', 'promotions-tab', 'discounts-tab', 'website-tab', 'payments-tab']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
});

test('admin element IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate id attributes found');
});

test('inline admin JavaScript parses', () => {
  assert.ok(scriptMatch, 'inline script is missing');
  assert.doesNotThrow(() => new Script(scriptMatch[1]));
});
