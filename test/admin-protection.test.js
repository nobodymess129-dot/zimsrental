import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const env = {
  ADMIN_EMAIL: 'owner@example.test',
  ADMIN_PASSWORD: 'fixture-password-not-a-real-credential',
  SESSION_SECRET: 'unit-test-only-session-secret-with-sufficient-length',
  LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
  LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
  PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
  BOOKING_LIMITER: { limit: async () => ({ success: true }) },
  ADMIN_UPLOAD_LIMITER: { limit: async () => ({ success: true }) }
};

async function request(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  return worker.fetch(new Request('http://unit.test' + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}

async function signIn() {
  const response = await request('/api/login', {
    method: 'POST',
    body: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  return setCookie.split(';', 1)[0];
}

test('admin routes reject unauthenticated requests', async () => {
  const cases = [
    ['GET', '/api/admin/vehicles'],
    ['GET', '/api/admin/bookings'],
    ['GET', '/api/admin/promotions'],
    ['GET', '/api/admin/discount-rule'],
    ['PUT', '/api/admin/discount-rule'],
    ['GET', '/api/admin/discount-codes'],
    ['POST', '/api/admin/discount-codes'],
    ['POST', '/api/admin/promotions'],
    ['DELETE', '/api/admin/promotions/11111111-1111-4111-8111-111111111111'],
    ['POST', '/api/admin/vehicles'],
    ['POST', '/api/admin/vehicles/synthetic-id/image'],
    ['PATCH', '/api/admin/bookings/synthetic-id'],
    ['DELETE', '/api/admin/vehicles/synthetic-id']
  ];
  for (const [method, path] of cases) {
    const response = await request(path, { method });
    assert.equal(response.status, 401, method + ' ' + path);
  }
});

test('a signed owner session cannot manually confirm bookings or change payment status', async () => {
  const cookie = await signIn();
  const session = await request('/api/me', { cookie });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.role, 'owner');

  const confirmation = await request('/api/admin/bookings/synthetic-id', {
    method: 'PATCH',
    cookie,
    body: { status: 'confirmed' }
  });
  assert.equal(confirmation.status, 403);
  assert.match((await confirmation.json()).error, /verified payment processing/);

  const paymentChange = await request('/api/admin/bookings/synthetic-id', {
    method: 'PATCH',
    cookie,
    body: { status: 'pending_payment', payment_status: 'paid' }
  });
  assert.equal(paymentChange.status, 403);
  assert.match((await paymentChange.json()).error, /verified payment processing/);
});

test('tampered admin session is rejected', async () => {
  const cookie = await signIn();
  const [name, value] = cookie.split('=');
  const tampered = name + '=' + value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a');
  const response = await request('/api/admin/vehicles', { cookie: tampered });
  assert.equal(response.status, 401);
});

test('HTTPS admin session cookie uses secure HttpOnly and same-site flags', async () => {
  const response = await worker.fetch(new Request('https://unit.test/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD })
  }), env);
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=28800/);
});

test('API preflight does not grant credentialed cross-origin access', async () => {
  const response = await worker.fetch(new Request('http://unit.test/api/admin/vehicles', {
    method: 'OPTIONS',
    headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'GET' }
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('malformed JSON is rejected as a client error', async () => {
  const response = await worker.fetch(new Request('http://unit.test/api/booking-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json'
  }), { PUBLIC_API_LIMITER: env.PUBLIC_API_LIMITER, BOOKING_LIMITER: env.BOOKING_LIMITER, DB: { prepare() { throw new Error('Database must not be reached'); } } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid JSON object/);
});

test('unexpected API errors do not log exception details or return them to callers', async () => {
  const captured = [];
  const original = console.error;
  console.error = (...args) => captured.push(args);
  try {
    const response = await worker.fetch(new Request('http://unit.test/api/vehicles'), {
      DB: { prepare() { throw new Error('private customer details in synthetic failure'); } }
    });
    assert.equal(response.status, 500);
    assert.doesNotMatch(await response.text(), /private customer details/);
  } finally {
    console.error = original;
  }
  assert.deepEqual(captured, [['Zims API request failed', 'Error']]);
});
