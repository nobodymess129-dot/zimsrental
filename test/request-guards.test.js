import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const secret = 'test-session-secret-for-request-guard-regressions';
function baseEnv(overrides = {}) {
  return {
    SESSION_SECRET: secret,
    ADMIN_EMAIL: 'owner@example.test',
    ADMIN_PASSWORD: 'test-password',
    LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
    LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
    PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
    BOOKING_LIMITER: { limit: async () => ({ success: true }) },
    ADMIN_UPLOAD_LIMITER: { limit: async () => ({ success: true }) },
    DB: { prepare() { throw new Error('Database must not be reached'); } },
    ...overrides
  };
}

function request(path, { method = 'POST', body = {}, ip = '192.0.2.10', headers = {} } = {}) {
  return new Request('https://unit.test' + path, {
    method,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...headers },
    body: body === null ? undefined : JSON.stringify(body)
  });
}

test('login applies independent IP and account limits with pseudonymous keys', async () => {
  const ipKeys = [];
  const accountKeys = [];
  const env = baseEnv({
    LOGIN_IP_LIMITER: { async limit({ key }) { ipKeys.push(key); return { success: true }; } },
    LOGIN_ACCOUNT_LIMITER: { async limit({ key }) { accountKeys.push(key); return { success: true }; } }
  });
  for (const ip of ['192.0.2.10', '192.0.2.11']) {
    const response = await worker.fetch(request('/api/login', { ip, body: { email: 'Owner@Example.test', password: 'bad' } }), env);
    assert.equal(response.status, 401);
  }
  assert.notEqual(ipKeys[0], ipKeys[1]);
  assert.equal(accountKeys[0], accountKeys[1]);
  assert.ok([...ipKeys, ...accountKeys].every(key => !key.includes('192.0.2') && !key.includes('owner@example')));
});

test('rate-limited login, booking and availability requests return 429 before database access', async () => {
  const denied = { limit: async () => ({ success: false }) };
  const login = await worker.fetch(request('/api/login', { body: { email: 'owner@example.test', password: 'bad' } }), baseEnv({ LOGIN_IP_LIMITER: denied }));
  assert.equal(login.status, 429);
  assert.equal(login.headers.get('retry-after'), '60');

  for (const [route, binding] of [['/api/booking-request', 'BOOKING_LIMITER'], ['/api/booking-quote', 'PUBLIC_API_LIMITER'], ['/api/availability', 'PUBLIC_API_LIMITER']]) {
    const response = await worker.fetch(request(route), baseEnv({ [binding]: denied }));
    assert.equal(response.status, 429, route);
  }
});

test('missing or failed request protection fails closed', async () => {
  const missing = await worker.fetch(request('/api/availability'), baseEnv({ PUBLIC_API_LIMITER: undefined }));
  assert.equal(missing.status, 503);
  const failed = await worker.fetch(request('/api/booking-request'), baseEnv({ BOOKING_LIMITER: { limit() { throw new Error('private limiter details'); } } }));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private limiter details/);
});

test('public JSON requests enforce a 16 KB streamed body limit before D1 access', async () => {
  const response = await worker.fetch(request('/api/booking-request', { body: { notes: 'x'.repeat(20 * 1024) } }), baseEnv());
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /16 KB/);
});

test('JSON endpoints reject non-JSON content types without reaching D1', async () => {
  const response = await worker.fetch(request('/api/availability', { headers: { 'content-type': 'text/plain' } }), baseEnv());
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid JSON object/);
});


test('static website responses include baseline browser security headers', async () => {
  const env = baseEnv({ ASSETS: { fetch: async () => new Response('<!doctype html><title>Zims</title>', {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  }) } });
  const response = await worker.fetch(new Request('https://unit.test/'), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
});
