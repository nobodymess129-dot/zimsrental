import assert from 'node:assert/strict';
import test from 'node:test';
let Miniflare;
try { ({ Miniflare } = await import('miniflare')); } catch { /* Optional local test dependency may not be installed in restricted environments. */ }

async function isolatedD1(t) {
  const miniflare = new Miniflare({
    workers: [{
      config: {
        name: 'zims-discount-atomicity-test',
        compatibilityDate: '2026-10-14',
        manifest: {
          mainModule: 'index.js',
          modules: { 'index.js': { type: 'esm', contents: 'export default { async fetch() { return new Response("ok"); } }' } }
        },
        env: { DB: { type: 'd1', id: 'isolated-test-id' } }
      }
    }]
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database('DB');
  await database.batch([
    database.prepare('CREATE TABLE bookings (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, pickup_at TEXT NOT NULL, return_at TEXT NOT NULL)'),
    database.prepare(`CREATE TABLE redemptions (
      booking_id TEXT PRIMARY KEY,
      code_id TEXT NOT NULL,
      email_norm TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('reserved','released','redeemed'))
    )`),
    database.prepare('CREATE TABLE codes (id TEXT PRIMARY KEY, max_uses INTEGER NOT NULL)')
  ]);
  await database.prepare(`CREATE UNIQUE INDEX active_email_redemption
    ON redemptions(code_id,email_norm) WHERE state IN ('reserved','redeemed')`).run();
  return database;
}

function reserveStatements(database, id, email) {
  return [
    database.prepare(`
      INSERT INTO bookings (id, vehicle_id, pickup_at, return_at)
      SELECT ?, 'car', '2099-01-01T00:00:00.000Z', '2099-01-03T00:00:00.000Z'
      WHERE (SELECT COUNT(*) FROM redemptions WHERE code_id='welcome' AND state IN ('reserved','redeemed'))
        < (SELECT max_uses FROM codes WHERE id='welcome')
        AND NOT EXISTS (SELECT 1 FROM redemptions WHERE code_id='welcome' AND email_norm=? AND state IN ('reserved','redeemed'))
        AND NOT EXISTS (
          SELECT 1 FROM bookings
          WHERE vehicle_id='car'
            AND julianday(pickup_at) < julianday('2099-01-03T00:00:00.000Z')
            AND julianday(return_at) > julianday('2099-01-01T00:00:00.000Z')
        )
    `).bind(id, email),
    database.prepare(`
      INSERT INTO redemptions (booking_id, code_id, email_norm, state)
      SELECT ?, 'welcome', ?, 'reserved'
      WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)
    `).bind(id, email, id)
  ];
}

test('isolated D1 serializes competing final-use and overlapping booking batches', { skip: !Miniflare && 'Install project devDependencies to run Miniflare D1 concurrency coverage.' }, async t => {
  const database = await isolatedD1(t);
  await database.prepare('INSERT INTO codes (id, max_uses) VALUES (?, ?)').bind('welcome', 1).run();

  const results = await Promise.all([
    database.batch(reserveStatements(database, 'first-booking', 'guest@example.test')),
    database.batch(reserveStatements(database, 'second-booking', 'other@example.test'))
  ]);

  assert.equal(results.flat().filter(result => result.meta.changes === 1).length, 2);
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM bookings').first()).count, 1);
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM redemptions WHERE state="reserved"').first()).count, 1);
  const winnerEmail = (await database.prepare('SELECT email_norm FROM redemptions WHERE state="reserved"').first()).email_norm;
  await assert.rejects(database.batch([
    database.prepare("INSERT INTO bookings VALUES ('reservation-rollback','car','2099-02-01T00:00:00.000Z','2099-02-03T00:00:00.000Z')"),
    database.prepare("INSERT INTO redemptions VALUES ('reservation-rollback','welcome',?,'reserved')").bind(winnerEmail)
  ]));
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM bookings WHERE id='reservation-rollback'").first()).count, 0);
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM redemptions').first()).count, 1);
});

test('isolated D1 batch rolls back earlier writes when a later statement fails', { skip: !Miniflare && 'Install project devDependencies to run Miniflare D1 rollback coverage.' }, async t => {
  const database = await isolatedD1(t);
  await assert.rejects(database.batch([
    database.prepare("INSERT INTO bookings VALUES ('rolled-back','car','2099-01-01T00:00:00.000Z','2099-01-03T00:00:00.000Z')"),
    database.prepare("INSERT INTO bookings VALUES ('rolled-back','car','2099-02-01T00:00:00.000Z','2099-02-03T00:00:00.000Z')")
  ]));
  assert.equal((await database.prepare('SELECT COUNT(*) AS count FROM bookings').first()).count, 0);
});
