import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

function environment() {
  const database = new DatabaseSync(':memory:');
  const migrations = ['initial','seed_vehicles','booking_holds','booking_cancellation','booking_payment_snapshots','promotional_banners','booking_discounts','manual_payment_review','expand_site_settings','vehicle_fleet_quantity'];
  migrations.forEach((name, i) => database.exec(readFileSync(new URL(`../migrations/${String(i + 1).padStart(4, '0')}_${name}.sql`, import.meta.url), 'utf8')));
  database.prepare('INSERT INTO vehicles (id,name,daily_rate,deposit_percent) VALUES (?,?,?,?)').run('test-car','Test Car',1200,25);
  
  database.prepare(`
    UPDATE payment_method_settings
    SET enabled = 1, config_json = ?
    WHERE method_key = 'bank_transfer'
  `).run(JSON.stringify({
    bank_name: 'Test Bank',
    account_name: 'Zims Rentals',
    account_number: '000123',
    branch: 'Nadi',
    instructions: 'Use booking ID as payment description.'
  }));const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...input) { values = input; return statement; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values) }; },
        async run() { const result = database.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }
      };
      return statement;
    },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { database, env: { DB, BOOKING_LIMITER: { limit: async () => ({ success: true }) },
    PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
    LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
    LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
    ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'test-owner-password', SESSION_SECRET: 'isolated-discount-test-session-secret',
    PAYPAL_CLIENT_ID: 'test-paypal-client-id', PAYPAL_CLIENT_SECRET: 'test-paypal-client-secret',
    PAYPAL_CURRENCY: 'USD', PAYPAL_FJD_PER_UNIT: '2', PAYPAL_MODE: 'sandbox' } };
}

function request(env, input) {
  return worker.fetch(new Request('http://unit.test/api/booking-request', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input)
  }), env);
}

function quoteRequest(env, input) {
  return worker.fetch(new Request('http://unit.test/api/booking-quote', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input)
  }), env);
}

function payload({ start, end, requestId, email = 'guest@example.test', code, ...overrides } = {}) {
  return {
    request_id: requestId || crypto.randomUUID(), customer_name: 'Test Guest', email, phone: '+6790000000',
    vehicle_id: 'test-car', pickup_at: start || '2098-01-01T00:00:00.000Z',
    return_at: end || '2098-01-03T00:00:00.000Z', payment_option: 'deposit',
    ...(code ? { discount_code: code } : {}), ...overrides
  };
}

async function createCode(database, { code = 'TENOFF', percent = 10, limit = 5, startsAt = null, expiresAt = null } = {}) {
  database.prepare(`INSERT INTO discount_codes (id,code,discount_percent,usage_limit,active,starts_at,expires_at)
    VALUES (?,?,?, ?,1,?,?)`).run(crypto.randomUUID(), code, percent, limit, startsAt, expiresAt);
}

test('customer quote uses server discount and payment calculations without reserving a hold or use', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { code: 'QUOTE10' });
    const response = await quoteRequest(env, {
      vehicle_id: 'test-car', pickup_at: '2098-01-01T00:00:00.000Z', return_at: '2098-01-03T00:00:00.000Z',
      email: 'guest@example.test', discount_code: 'quote10', payment_option: 'deposit'
    });
    assert.equal(response.status, 200);
    const quote = await response.json();
    assert.equal(quote.original_subtotal_fjd_minor, 240000);
    assert.equal(quote.discount_amount_fjd_minor, 24000);
    assert.equal(quote.rental_total_fjd_minor, 216000);
    assert.equal(quote.amount_due_fjd_minor, 54000);
    assert.equal(quote.balance_due_fjd_minor, 162000);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM discount_redemptions').get().n, 0);
  } finally { database.close(); }
});

test('booking API saves automatic discount snapshots and rejects client amount tampering', async () => {
  const { database, env } = environment();
  try {
    const response = await request(env, payload({ start: '2098-01-01T00:00:00.000Z', end: '2098-01-08T00:00:00.000Z', total_fjd: 1, discount_amount_fjd_minor: 1 }));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.rental_days, 7);
    assert.equal(body.original_subtotal_fjd_minor, 840000);
    assert.equal(body.discount_amount_fjd_minor, 10000);
    assert.equal(body.rental_total_fjd_minor, 830000);
    const saved = database.prepare('SELECT * FROM bookings WHERE id=?').get(body.booking_id);
    assert.equal(saved.daily_rate_fjd_minor, 120000);
    assert.equal(saved.total_fjd, 8300);
    assert.equal(saved.amount_due_fjd_minor, 207500);
    assert.equal(saved.balance_due_fjd_minor, 622500);
    assert.equal(saved.discount_type, 'automatic');
    database.prepare('UPDATE vehicles SET daily_rate=?,deposit_percent=? WHERE id=?').run(2500, 75, 'test-car');
    const afterRateChange = database.prepare('SELECT daily_rate_fjd_minor,rental_days,original_subtotal_fjd_minor,final_total_fjd_minor,deposit_percent_snapshot,amount_due_fjd_minor,balance_due_fjd_minor FROM bookings WHERE id=?').get(body.booking_id);
    assert.deepEqual({ ...afterRateChange }, {
      daily_rate_fjd_minor: 120000, rental_days: 7, original_subtotal_fjd_minor: 840000,
      final_total_fjd_minor: 830000, deposit_percent_snapshot: 25,
      amount_due_fjd_minor: 207500, balance_due_fjd_minor: 622500
    });
  } finally { database.close(); }
});

test('discount code redemption is held once and idempotent retries reuse the booking', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { limit: 1 });
    const firstInput = payload({ code: ' tenoff ', requestId: '11111111-1111-4111-8111-111111111111' });
    const first = await request(env, firstInput);
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.discount_type, 'code');
    assert.equal(firstBody.discount_reference, 'TENOFF');
    assert.equal(firstBody.discount_amount_fjd_minor, 24000);
    assert.equal(firstBody.rental_total_fjd_minor, 216000);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM discount_redemptions WHERE state='reserved'").get().n, 1);
    database.prepare("UPDATE discount_codes SET code='RENAMED',discount_percent=50 WHERE code='TENOFF'").run();

    const retry = await request(env, firstInput);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).booking_id, firstBody.booking_id);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM discount_redemptions').get().n, 1);
    const snapshot = database.prepare('SELECT discount_reference,discount_percent,discount_amount_fjd_minor,final_total_fjd_minor FROM bookings WHERE id=?').get(firstBody.booking_id);
    assert.deepEqual({ ...snapshot }, { discount_reference: 'TENOFF', discount_percent: 10, discount_amount_fjd_minor: 24000, final_total_fjd_minor: 216000 });
  } finally { database.close(); }
});

test('one normalized email cannot redeem a code twice and invalid/expired codes consume no use', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { code: 'ONCEONLY', limit: 3 });
    await createCode(database, { code: 'EXPIRED', limit: 2, expiresAt: '2000-01-01T00:00:00.000Z' });
    const first = await request(env, payload({ code: 'onceonly', email: ' Guest@Example.test ' }));
    assert.equal(first.status, 201);
    const duplicateEmail = await request(env, payload({ code: 'ONCEONLY', email: 'guest@example.test', start: '2098-02-01T00:00:00.000Z', end: '2098-02-03T00:00:00.000Z' }));
    assert.equal(duplicateEmail.status, 400);
    assert.match((await duplicateEmail.json()).error, /already used/);
    const expired = await request(env, payload({ code: 'EXPIRED', email: 'other@example.test' }));
    assert.equal(expired.status, 400);
    assert.match((await expired.json()).error, /expired/);
    const invalid = await request(env, payload({ code: 'MISSING', email: 'third@example.test' }));
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /invalid/);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM discount_redemptions').get().n, 1);
  } finally { database.close(); }
});

test('inactive, not-yet-active and exhausted codes are rejected without another booking', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { code: 'LIMITONE', limit: 1 });
    await createCode(database, { code: 'FUTURE', startsAt: '2099-01-01T00:00:00.000Z' });
    await createCode(database, { code: 'INACTIVE', limit: 1 });
    const inactiveId = database.prepare("SELECT id FROM discount_codes WHERE code='INACTIVE'").get().id;
    database.prepare('UPDATE discount_codes SET active=0 WHERE id=?').run(inactiveId);

    const first = await request(env, payload({ code: 'LIMITONE', email: 'first@example.test' }));
    assert.equal(first.status, 201);
    const exhausted = await request(env, payload({ code: 'LIMITONE', email: 'second@example.test', start: '2098-02-01T00:00:00.000Z', end: '2098-02-03T00:00:00.000Z' }));
    assert.match((await exhausted.json()).error, /usage limit/);
    const future = await request(env, payload({ code: 'FUTURE', email: 'third@example.test' }));
    assert.match((await future.json()).error, /not active yet/);
    const inactive = await request(env, payload({ code: 'INACTIVE', email: 'fourth@example.test' }));
    assert.match((await inactive.json()).error, /inactive/);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM discount_redemptions').get().n, 1);
  } finally { database.close(); }
});

test('a failed reservation write rolls back its booking hold', async () => {
  const { database, env } = environment();
  try {
    await createCode(database);
    database.exec(`CREATE TRIGGER reject_test_redemption BEFORE INSERT ON discount_redemptions
      BEGIN SELECT RAISE(ABORT, 'simulated reservation write failure'); END`);
    const response = await request(env, payload({ code: 'TENOFF' }));
    assert.equal(response.status, 500);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM discount_redemptions').get().n, 0);
  } finally { database.close(); }
});

test('cancelling an unpaid booking releases its code reservation only once', async () => {
  const { database, env } = environment();
  try {
    await createCode(database);
    const bookingResponse = await request(env, payload({ code: 'TENOFF' }));
    const booking = await bookingResponse.json();
    const login = await worker.fetch(new Request('http://unit.test/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })
    }), env);
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';', 1)[0];
    const cancel = () => worker.fetch(new Request('http://unit.test/api/admin/bookings/' + booking.booking_id, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ status: 'cancelled', cancellation_reason: 'Customer cancelled request' })
    }), env);
    assert.equal((await cancel()).status, 200);
    assert.equal((await cancel()).status, 200);
    assert.equal(database.prepare('SELECT state FROM discount_redemptions').get().state, 'released');
  } finally { database.close(); }
});

test('codes are rejected on automatic-discount rentals and overlap rejection does not reserve usage', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { code: 'NOTSTACK', limit: 3 });
    const eligible = await request(env, payload({ code: 'NOTSTACK', start: '2098-01-01T00:00:00.000Z', end: '2098-01-08T00:00:00.000Z' }));
    assert.equal(eligible.status, 400);
    assert.match((await eligible.json()).error, /automatic long-rental discount/);
    const first = await request(env, payload({ code: 'NOTSTACK' }));
    assert.equal(first.status, 201);
    const overlap = await request(env, payload({ code: 'NOTSTACK', email: 'other@example.test' }));
    assert.equal(overlap.status, 409);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM discount_redemptions WHERE state='reserved'").get().n, 1);
  } finally { database.close(); }
});

test('expired holds release the reserved code use on the next booking request', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { limit: 1 });
    const first = await request(env, payload({ code: 'TENOFF' }));
    assert.equal(first.status, 201);
    database.prepare("UPDATE bookings SET hold_expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run((await first.json()).booking_id);
    const next = await request(env, payload({ code: 'TENOFF', email: 'guest@example.test', start: '2098-02-01T00:00:00.000Z', end: '2098-02-03T00:00:00.000Z' }));
    assert.equal(next.status, 201);
    const states = database.prepare('SELECT state FROM discount_redemptions ORDER BY created_at').all().map(row => row.state);
    assert.deepEqual(states.sort(), ['released', 'reserved']);
  } finally { database.close(); }
});

test('vehicle-specific discount tiers use the highest qualifying tier and save the selected tier snapshot', async () => {
  const { database, env } = environment();
  try {
    database.prepare('INSERT INTO vehicle_automatic_discount_overrides (vehicle_id,active) VALUES (?,1)').run('test-car');
    const insertTier = database.prepare(`INSERT INTO vehicle_automatic_discount_tiers
      (id,vehicle_id,threshold_days,percentage,max_discount_fjd_minor,active) VALUES (?,?,?,?,?,1)`);
    insertTier.run('tier-3', 'test-car', 3, 5, 1000000);
    insertTier.run('tier-7', 'test-car', 7, 10, 1000000);
    insertTier.run('tier-14', 'test-car', 14, 15, 1000000);
    const response = await quoteRequest(env, {
      vehicle_id: 'test-car', pickup_at: '2098-01-01T00:00:00.000Z', return_at: '2098-01-15T00:00:00.000Z',
      email: 'tier-guest@example.test', payment_option: 'full'
    });
    assert.equal(response.status, 200);
    const quote = await response.json();
    assert.equal(quote.discount_percent, 15);
    assert.equal(quote.discount_amount_fjd_minor, 252000);
    assert.equal(quote.rental_total_fjd_minor, 1428000);

    const bookingResponse = await request(env, payload({
      start: '2098-02-01T00:00:00.000Z', end: '2098-02-15T00:00:00.000Z', email: 'tier-booking@example.test'
    }));
    assert.equal(bookingResponse.status, 201);
    const booking = await bookingResponse.json();
    assert.equal(booking.discount_reference, 'vehicle-tier:14');
    assert.equal(booking.discount_percent, 15);
    assert.equal(database.prepare('SELECT discount_reference FROM bookings WHERE id=?').get(booking.booking_id).discount_reference, 'vehicle-tier:14');
  } finally { database.close(); }
});

test('admin can configure per-vehicle discount tiers and duplicate thresholds are rejected', async () => {
  const { database, env } = environment();
  try {
    const login = await worker.fetch(new Request('http://unit.test/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.test', password: 'test-owner-password' })
    }), env);
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const save = body => worker.fetch(new Request('http://unit.test/api/admin/vehicles/test-car/discount-rules', {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body)
    }), env);
    const saved = await save({ active: true, tiers: [
      { threshold_days: 3, percentage: 5, max_discount_fjd: 100 },
      { threshold_days: 7, percentage: 10, max_discount_fjd: 200 }
    ] });
    assert.equal(saved.status, 200);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM vehicle_automatic_discount_tiers WHERE vehicle_id=?').get('test-car').n, 2);
    const invalid = await save({ active: true, tiers: [
      { threshold_days: 3, percentage: 5, max_discount_fjd: 100 },
      { threshold_days: 3, percentage: 10, max_discount_fjd: 200 }
    ] });
    assert.equal(invalid.status, 400);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM vehicle_automatic_discount_tiers WHERE vehicle_id=?').get('test-car').n, 2);
  } finally { database.close(); }
});

test('100% discount cannot create a zero-value booking hold that would bypass checkout', async () => {
  const { database, env } = environment();
  try {
    await createCode(database, { code: 'FREE100', percent: 100 });
    const response = await request(env, payload({ code: 'FREE100' }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /no payable balance/i);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM discount_redemptions').get().n, 0);
  } finally { database.close(); }
});

