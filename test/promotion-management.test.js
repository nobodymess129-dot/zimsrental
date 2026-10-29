import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const credentials = {
  ADMIN_EMAIL: 'owner@example.test',
  ADMIN_PASSWORD: 'unit-test-password',
  SESSION_SECRET: 'unit-test-session-secret-for-promotion-tests',
  LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
  LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
  PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
  BOOKING_LIMITER: { limit: async () => ({ success: true }) },
  ADMIN_UPLOAD_LIMITER: { limit: async () => ({ success: true }) }
};

function isolatedEnv() {
  const database = new DatabaseSync(':memory:');
  for (let index = 1; index <= 7; index++) {
    const migration = String(index).padStart(4, '0');
    database.exec(readFileSync(new URL(`../migrations/${migration}_${[
      'initial', 'seed_vehicles', 'booking_holds', 'booking_cancellation',
      'booking_payment_snapshots', 'promotional_banners', 'booking_discounts', 'manual_payment_review'
    ][index - 1]}.sql`, import.meta.url), 'utf8'));
  }
  const env = {
    ...credentials,
    DB: {
      prepare(sql) {
        let values = [];
        const statement = {
          bind(...boundValues) { values = boundValues; return statement; },
          async first() { return database.prepare(sql).get(...values) ?? null; },
          async all() { return { results: database.prepare(sql).all(...values) }; },
          async run() {
            const result = database.prepare(sql).run(...values);
            return { meta: { changes: Number(result.changes) } };
          }
        };
        return statement;
      }
    }
  };
  return { database, env };
}

async function ownerCookie(env) {
  const response = await worker.fetch(new Request('http://unit.test/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: credentials.ADMIN_EMAIL, password: credentials.ADMIN_PASSWORD })
  }), env);
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

async function send(env, path, { method = 'GET', cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return worker.fetch(new Request('http://unit.test' + path, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}

function scheduledMessage(message, overrides = {}) {
  return {
    message,
    starts_at: '2030-01-01T00:00:00.000Z',
    ends_at: '2030-02-01T00:00:00.000Z',
    priority: 0,
    active: false,
    ...overrides
  };
}

test('owner can create, edit, deactivate, and safely delete banners', async () => {
  const { database, env } = isolatedEnv();
  try {
    const cookie = await ownerCookie(env);
    const created = await send(env, '/api/admin/promotions', {
      method: 'POST', cookie, body: scheduledMessage('Owner-written offer', { active: true, priority: 10 })
    });
    assert.equal(created.status, 200);
    const id = (await created.json()).id;
    assert.match(id, /^[0-9a-f-]{36}$/i);

    const edited = await send(env, '/api/admin/promotions', {
      method: 'POST', cookie, body: { ...scheduledMessage('Updated message'), id, active: false, priority: -2 }
    });
    assert.equal(edited.status, 200);
    const listed = await send(env, '/api/admin/promotions', { cookie });
    const rows = (await listed.json()).promotions;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].message, 'Updated message');
    assert.equal(rows[0].active, 0);
    assert.equal(rows[0].priority, -2);

    const removed = await send(env, '/api/admin/promotions/' + id, { method: 'DELETE', cookie });
    assert.equal(removed.status, 200);
    const missing = await send(env, '/api/admin/promotions/' + id, { method: 'DELETE', cookie });
    assert.equal(missing.status, 404);
  } finally {
    database.close();
  }
});

test('owner can configure the automatic rule and scheduled discount codes with Fiji-local times', async () => {
  const { database, env } = isolatedEnv();
  try {
    const cookie = await ownerCookie(env);
    const initial = await send(env, '/api/admin/discount-rule', { cookie });
    assert.equal(initial.status, 200);
    assert.equal((await initial.json()).rule.threshold_days, 7);

    const rule = await send(env, '/api/admin/discount-rule', {
      method: 'PUT', cookie, body: { threshold_days: 8, max_discount_fjd: 125, active: true }
    });
    assert.equal(rule.status, 200);
    const savedRule = database.prepare("SELECT * FROM automatic_discount_rules WHERE id='long_rental'").get();
    assert.equal(savedRule.threshold_days, 8);
    assert.equal(savedRule.percentage, 10);
    assert.equal(savedRule.max_discount_fjd_minor, 12500);

    const create = await send(env, '/api/admin/discount-codes', {
      method: 'POST', cookie,
      body: { code: ' fiji-guest ', discount_percent: 100, usage_limit: 10,
        starts_at: '2030-01-01T12:00', expires_at: '2030-02-01T12:00', active: true }
    });
    assert.equal(create.status, 200);
    const row = database.prepare('SELECT * FROM discount_codes WHERE id=?').get((await create.json()).id);
    assert.equal(row.code, 'FIJI-GUEST');
    assert.equal(row.discount_percent, 100);
    assert.equal(row.starts_at, '2030-01-01T00:00:00.000Z');
    assert.equal(row.expires_at, '2030-02-01T00:00:00.000Z');

    const invalid = await send(env, '/api/admin/discount-codes', {
      method: 'POST', cookie, body: { code: 'BADCODE', discount_percent: 101, active: true }
    });
    assert.equal(invalid.status, 400);
  } finally {
    database.close();
  }
});

test('public banners exclude inactive, future, and expired entries and sort by priority', async () => {
  const { database, env } = isolatedEnv();
  try {
    const cookie = await ownerCookie(env);
    const now = Date.now();
    const activeStart = new Date(now - 60_000).toISOString();
    const activeEnd = new Date(now + 3_600_000).toISOString();
    const entries = [
      scheduledMessage('Lower priority', { starts_at: activeStart, ends_at: activeEnd, active: true, priority: 1 }),
      scheduledMessage('Top priority', { starts_at: activeStart, ends_at: activeEnd, active: true, priority: 8 }),
      scheduledMessage('Disabled', { starts_at: activeStart, ends_at: activeEnd, active: false, priority: 99 }),
      scheduledMessage('Expired', { starts_at: '2000-01-01T00:00:00.000Z', ends_at: '2001-01-01T00:00:00.000Z', active: true, priority: 50 }),
      scheduledMessage('Not started', { starts_at: new Date(now + 3_600_000).toISOString(), ends_at: new Date(now + 7_200_000).toISOString(), active: true, priority: 40 })
    ];
    for (const body of entries) {
      const response = await send(env, '/api/admin/promotions', { method: 'POST', cookie, body });
      assert.equal(response.status, 200);
    }
    const response = await send(env, '/api/promotions');
    assert.equal(response.status, 200);
    const promotions = (await response.json()).promotions;
    assert.deepEqual(promotions.map(item => item.message), ['Top priority', 'Lower priority']);
  } finally {
    database.close();
  }
});

test('server rejects invalid banner content, dates, timezones, priority, and identifiers', async () => {
  const { database, env } = isolatedEnv();
  try {
    const cookie = await ownerCookie(env);
    const invalid = [
      scheduledMessage('  '),
      scheduledMessage('x'.repeat(241)),
      scheduledMessage('Bad calendar', { starts_at: '2030-02-30T00:00:00.000Z' }),
      scheduledMessage('Offset instead of canonical UTC', { starts_at: '2030-01-01T00:00:00.000+00:00' }),
      scheduledMessage('Reversed schedule', { starts_at: '2030-02-01T00:00:00.000Z', ends_at: '2030-01-01T00:00:00.000Z' }),
      scheduledMessage('Fractional priority', { priority: 1.5 }),
      scheduledMessage('Out of range priority', { priority: 1001 }),
      { ...scheduledMessage('Bad id'), id: 'unsafe-id' }
    ];
    for (const body of invalid) {
      const response = await send(env, '/api/admin/promotions', { method: 'POST', cookie, body });
      assert.equal(response.status, 400);
    }
    const listed = await send(env, '/api/admin/promotions', { cookie });
    assert.equal((await listed.json()).promotions.length, 0);
  } finally {
    database.close();
  }
});

test('banner migration constrains content, activation, and priority in SQLite', () => {
  const { database } = isolatedEnv();
  try {
    assert.throws(() => database.prepare('INSERT INTO promo_banners (id,message) VALUES (?,?)').run('invalid', '  '), /CHECK constraint failed/);
    assert.throws(() => database.prepare('INSERT INTO promo_banners (id,message,priority) VALUES (?,?,?)').run('invalid', 'Hello', 1001), /CHECK constraint failed/);
    assert.throws(() => database.prepare('INSERT INTO promo_banners (id,message,active) VALUES (?,?,?)').run('invalid', 'Hello', 2), /CHECK constraint failed/);
  } finally {
    database.close();
  }
});

test('admin and customer pages wire banner editing and text-only display', () => {
  const admin = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
  const customer = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const id of ['promotion-form', 'promotion-message', 'promotion-start', 'promotion-end', 'promotion-priority', 'promotion-active']) {
    assert.ok(admin.includes(`id="${id}"`));
  }
  assert.match(admin, /api\('\/admin\/promotions'/);
  assert.match(customer, /id="promo-announcement"/);
  assert.match(customer, /banner\.textContent=promotion\.message/);
  assert.doesNotMatch(customer, /promo-announcement[^\n]*innerHTML/);
});
