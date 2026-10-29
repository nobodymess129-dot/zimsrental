import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

function testEnvironment() {
  const database = new DatabaseSync(':memory:');
  const names = ['initial', 'seed_vehicles', 'booking_holds', 'booking_cancellation', 'booking_payment_snapshots', 'promotional_banners', 'booking_discounts','manual_payment_review','expand_site_settings','vehicle_fleet_quantity'];
  names.forEach((name, index) => database.exec(readFileSync(new URL(`../migrations/${String(index + 1).padStart(4, '0')}_${name}.sql`, import.meta.url), 'utf8')));
  return {
    database,
    env: {
      PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
      DB: {
        prepare(sql) {
          let values = [];
          const statement = {
            bind(...args) { values = args; return statement; },
            async first() { return database.prepare(sql).get(...values) ?? null; },
            async all() { return { results: database.prepare(sql).all(...values) }; },
            async run() { const result = database.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; }
          };
          return statement;
        }
      }
    }
  };
}

async function availability(env, vehicleId = 'fielder') {
  return worker.fetch(new Request('http://unit.test/api/availability', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, pickup_at: '2097-11-20T00:00:00.000Z', return_at: '2097-11-22T00:00:00.000Z' })
  }), env);
}

test('availability uses one query and retains overlap and expired-hold behavior', async () => {
  const { database, env } = testEnvironment();
  try {
    const available = await availability(env);
    assert.equal(available.status, 200);
    assert.deepEqual(await available.json(), { available: true, reason: null });

    database.prepare(`INSERT INTO bookings (id,customer_name,email,vehicle_id,pickup_at,return_at,status,payment_status,hold_expires_at)
      VALUES ('active-hold','Test','test@example.test','fielder','2097-11-20T12:00:00.000Z','2097-11-21T12:00:00.000Z','pending_payment','pending','2097-11-01T00:00:00.000Z')`).run();
    const overlapping = await availability(env);
    assert.deepEqual(await overlapping.json(), { available: false, reason: 'dates_unavailable' });

    database.prepare("UPDATE bookings SET hold_expires_at='2000-01-01T00:00:00.000Z'").run();
    const expired = await availability(env);
    assert.deepEqual(await expired.json(), { available: true, reason: null });

    const unavailableVehicle = await availability(env, 'missing-car');
    assert.deepEqual(await unavailableVehicle.json(), { available: false, reason: 'vehicle_unavailable' });
  } finally {
    database.close();
  }
});
