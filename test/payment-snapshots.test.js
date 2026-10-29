import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
import { calculateBookingPayment } from '../src/booking-dates.js';

function mockDb(vehicle) {
  const state = { sql: null, values: null, writes: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (sql.includes('SELECT id,status,hold_expires_at')) return null;
          if (sql.includes('SELECT daily_rate,deposit_percent')) return vehicle;
          if (sql.includes('automatic_discount_rules')) return { id: 'long_rental', threshold_days: 7, percentage: 10, max_discount_fjd_minor: 10000, active: 1 };
          return null;
        },
        async all() {
          if (sql.includes('payment_method_settings')) {
            return {
              results: [
                { method_key: 'bank_transfer', enabled: 1, config_json: '{"bank_name":"Test Bank","account_name":"Test Account","account_number":"123456"}' },
                { method_key: 'mpaisa', enabled: 0, config_json: '{}' }
              ]
            };
          }
          return { results: [] };
        },
        async run() { return { meta: { changes: sql.includes('INSERT INTO bookings') ? 1 : 0 } }; }
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) {
        if (statement.sql.includes('INSERT INTO bookings')) {
          state.sql = statement.sql;
          state.values = statement.values;
          state.writes++;
        }
        results.push(await statement.run());
      }
      return results;
    }
  };
  return { state, DB };
}

const details = {
  customer_name: 'Test Customer',
  email: 'test@example.test',
  phone: '+6790000000',
  vehicle_id: 'test-car',
  pickup_at: '2097-06-10T00:00:00.000Z',
  return_at: '2097-06-12T00:00:00.000Z'
};

async function bookingRequest(db, body) {
  return worker.fetch(new Request('http://unit.test/api/booking-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...details, request_id: '11111111-1111-4111-8111-111111111111', ...body })
  }), { DB: db.DB, BOOKING_LIMITER: { limit: async () => ({ success: true }) },
    PAYPAL_CLIENT_ID: 'test-paypal-client-id', PAYPAL_CLIENT_SECRET: 'test-paypal-client-secret',
    PAYPAL_CURRENCY: 'USD', PAYPAL_FJD_PER_UNIT: '2', PAYPAL_MODE: 'sandbox' });
}

test('deposit calculation stores the correct amount and balance in FJD cents', () => {
  assert.deepEqual(calculateBookingPayment(2400, 'deposit', 25), {
    paymentOption: 'deposit',
    depositPercentSnapshot: 25,
    rentalTotalFjd: 2400,
    amountDueFjdMinor: 60000,
    balanceDueFjdMinor: 180000
  });
});

test('full payment makes the total due and snapshots the configured percentage', () => {
  assert.deepEqual(calculateBookingPayment(2400, 'full', 25), {
    paymentOption: 'full',
    depositPercentSnapshot: 25,
    rentalTotalFjd: 2400,
    amountDueFjdMinor: 240000,
    balanceDueFjdMinor: 0
  });
});

test('invalid deposit percentages and missing deposit configuration are rejected', () => {
  for (const percentage of [0, -1, 100.01, 101, NaN, Infinity]) {
    assert.throws(() => calculateBookingPayment(100, 'deposit', percentage), RangeError);
  }
  assert.throws(() => calculateBookingPayment(100, 'deposit', null), /not configured/);
});

test('booking API ignores tampered client amounts and stores the server calculation', async () => {
  const db = mockDb({ daily_rate: 1200, deposit_percent: 25 });
  const response = await bookingRequest(db, {
    payment_option: 'deposit',
    total_fjd: 1,
    deposit_percent_snapshot: 100,
    amount_due_fjd_minor: 1,
    balance_due_fjd_minor: 0
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.rental_total_fjd, 2400);
  assert.equal(payload.payment_option, 'deposit');
  assert.equal(payload.deposit_percent_snapshot, 25);
  assert.equal(payload.amount_due_fjd_minor, 60000);
  assert.equal(payload.balance_due_fjd_minor, 180000);
  assert.equal(db.state.writes, 1);
  assert.match(db.state.sql, /NOT EXISTS/);
  assert.match(db.state.sql, /hold_expires_at >/);
  assert.match(db.state.sql, /julianday\(active\.pickup_at\) <= julianday\(event\.pickup_at\)/);
assert.match(db.state.sql, /julianday\(active\.return_at\) > julianday\(event\.pickup_at\)/);
assert.match(db.state.sql, /SELECT fleet_quantity FROM vehicles/);
  assert.equal(db.state.values[7], 2400);
  assert.equal(db.state.values[10], 'deposit');
  assert.equal(db.state.values[11], 25);
  assert.equal(db.state.values[12], 60000);
  assert.equal(db.state.values[13], 180000);
  assert.ok(Date.parse(db.state.values[9]) > Date.now() + 14 * 60 * 1000);
  assert.ok(Date.parse(db.state.values[9]) <= Date.now() + 15 * 60 * 1000);
});

test('booking API calculates full amount from the saved rate', async () => {
  const db = mockDb({ daily_rate: 1200, deposit_percent: 25 });
  const response = await bookingRequest(db, { payment_option: 'full' });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.rental_total_fjd, 2400);
  assert.equal(payload.amount_due_fjd_minor, 240000);
  assert.equal(payload.balance_due_fjd_minor, 0);
  assert.equal(db.state.values[10], 'full');
});

test('booking API total uses Fiji calendar days and the saved vehicle rate', async () => {
  const db = mockDb({ daily_rate: 1200, deposit_percent: null });
  const response = await bookingRequest(db, {
    pickup_at: '2031-01-09T22:00:00.000Z',
    return_at: '2031-01-10T23:00:00.000Z',
    payment_option: 'full'
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.rental_total_fjd, 1200);
  assert.equal(db.state.values[7], 1200);
});

test('booking API rejects invalid saved percentages without inserting a booking', async () => {
  for (const percentage of [0, 100.01]) {
    const db = mockDb({ daily_rate: 1200, deposit_percent: percentage });
    const response = await bookingRequest(db, { payment_option: 'deposit' });
    assert.equal(response.status, 400);
    assert.equal(db.state.writes, 0);
  }
});

test('migration backfills old bookings and later vehicle edits leave snapshots unchanged', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of [
      'migrations/0001_initial.sql',
      'migrations/0002_seed_vehicles.sql',
      'migrations/0003_booking_holds.sql',
      'migrations/0004_booking_cancellation.sql'
    ]) db.exec(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
    db.prepare('INSERT INTO vehicles (id,name,daily_rate) VALUES (?,?,?)')
      .run('test-car', 'Test Car', 1200);
    db.prepare("INSERT INTO bookings (id,customer_name,email,vehicle_id,pickup_at,return_at,status,payment_status,total_fjd) VALUES (?,?,?,?,?,?,'pending_payment','pending',2400)")
      .run('old-booking', 'Old Customer', 'old@example.test', 'test-car', '2097-06-10T00:00:00.000Z', '2097-06-12T00:00:00.000Z');
    db.exec(readFileSync(new URL('../migrations/0005_booking_payment_snapshots.sql', import.meta.url), 'utf8'));
    assert.deepEqual({ ...db.prepare("SELECT payment_option,deposit_percent_snapshot,total_fjd,amount_due_fjd_minor,balance_due_fjd_minor FROM bookings WHERE id='old-booking'").get() }, {
      payment_option: 'full',
      deposit_percent_snapshot: null,
      total_fjd: 2400,
      amount_due_fjd_minor: 240000,
      balance_due_fjd_minor: 0
    });
    assert.throws(() => db.prepare('UPDATE vehicles SET deposit_percent=0 WHERE id=?').run('test-car'), /CHECK constraint failed/);
    assert.throws(() => db.prepare('UPDATE vehicles SET deposit_percent=100.01 WHERE id=?').run('test-car'), /CHECK constraint failed/);
    assert.throws(() => db.prepare("UPDATE bookings SET payment_option='other' WHERE id='old-booking'").run(), /CHECK constraint failed/);
    db.prepare('UPDATE vehicles SET daily_rate=2500,deposit_percent=40 WHERE id=?').run('test-car');
    db.prepare("INSERT INTO bookings (id,customer_name,email,vehicle_id,pickup_at,return_at,status,payment_status,total_fjd,payment_option,deposit_percent_snapshot,amount_due_fjd_minor,balance_due_fjd_minor) VALUES (?,?,?,?,?,?,'pending_payment','pending',?,'deposit',?,?,?)")
      .run('deposit-booking', 'Test Customer', 'test@example.test', 'test-car', '2097-07-10T00:00:00.000Z', '2097-07-12T00:00:00.000Z', 2400, 25, 60000, 180000);
    db.prepare('UPDATE vehicles SET daily_rate=3000,deposit_percent=80 WHERE id=?').run('test-car');
    assert.deepEqual({ ...db.prepare("SELECT total_fjd,payment_option,deposit_percent_snapshot,amount_due_fjd_minor,balance_due_fjd_minor FROM bookings WHERE id='deposit-booking'").get() }, {
      total_fjd: 2400,
      payment_option: 'deposit',
      deposit_percent_snapshot: 25,
      amount_due_fjd_minor: 60000,
      balance_due_fjd_minor: 180000
    });
  } finally {
    db.close();
  }
});
const testAdmin = {
  ADMIN_EMAIL: 'owner@example.test',
  ADMIN_PASSWORD: 'unit-test-password',
  SESSION_SECRET: 'unit-test-session-secret-not-a-real-credential',
  LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
  LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
  PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
  BOOKING_LIMITER: { limit: async () => ({ success: true }) },
  ADMIN_UPLOAD_LIMITER: { limit: async () => ({ success: true }) }
};

async function testOwnerCookie() {
  const response = await worker.fetch(new Request('http://unit.test/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: testAdmin.ADMIN_EMAIL, password: testAdmin.ADMIN_PASSWORD })
  }), { ...testAdmin });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

test('admin vehicle API rejects invalid deposit percentages before database access', async () => {
  const cookie = await testOwnerCookie();
  for (const percentage of [0, 100.01, 'not-a-number']) {
    const response = await worker.fetch(new Request('http://unit.test/api/admin/vehicles', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test Car', daily_rate: 100, deposit_percent: percentage })
    }), {
      ...testAdmin,
      DB: { prepare() { throw new Error('Invalid deposit reached database'); } }
    });
    assert.equal(response.status, 400);
  }
});
test('admin can set and edit a vehicle deposit percentage, including clearing it', async () => {
  const cookie = await testOwnerCookie();
  const writes = [];
  const env = {
    ...testAdmin,
    DB: {
      prepare(sql) {
        return { bind(...values) { return { async run() { writes.push({ sql, values }); return { meta: { changes: 1 } }; } }; } };
      }
    }
  };
  async function save(body) {
    return worker.fetch(new Request('http://unit.test/api/admin/vehicles', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }), env);
  }
  const created = await save({ id: 'test-car', name: 'Test Car', daily_rate: 1200, deposit_percent: 20.5 });
  assert.equal(created.status, 200);
  assert.equal(writes[0].values[0], 'test-car');
  assert.equal(writes[0].values[6], 20.5);
  assert.match(writes[0].sql, /ON CONFLICT/);
  const edited = await save({ id: 'test-car', name: 'Test Car', daily_rate: 1300, deposit_percent: null });
  assert.equal(edited.status, 200);
  assert.equal(writes[1].values[0], 'test-car');
  assert.equal(writes[1].values[6], null);
  assert.equal(writes.length, 2);
});

test('customer preview offers configured deposit and sends only the payment choice', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="paymentOption"/);
  assert.match(html, /depositPercent/);
  assert.match(html, /estimated rental total/i);
  assert.match(html, /amount due/i);
  assert.match(html, /remaining balance/i);
  assert.match(html, /payment_option:\$\('paymentOption'\)\.value/);
  assert.doesNotMatch(html, /JSON\.stringify\(\{[^}]*amount_due_fjd_minor/);
  assert.doesNotMatch(html, /JSON\.stringify\(\{[^}]*total_fjd/);
});

test('admin booking display includes the saved payment snapshot amounts', () => {
  const html = readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
  for (const field of ['payment_option', 'deposit_percent_snapshot', 'amount_due_fjd_minor', 'balance_due_fjd_minor']) {
    assert.ok(html.includes(field), `Admin booking display should use ${field}`);
  }
});

