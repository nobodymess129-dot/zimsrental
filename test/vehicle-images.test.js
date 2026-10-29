import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const credentials = {
  ADMIN_EMAIL: 'owner@example.test',
  ADMIN_PASSWORD: 'unit-test-password',
  SESSION_SECRET: 'unit-test-session-secret-for-image-tests',
  LOGIN_IP_LIMITER: { limit: async () => ({ success: true }) },
  LOGIN_ACCOUNT_LIMITER: { limit: async () => ({ success: true }) },
  PUBLIC_API_LIMITER: { limit: async () => ({ success: true }) },
  BOOKING_LIMITER: { limit: async () => ({ success: true }) },
  ADMIN_UPLOAD_LIMITER: { limit: async () => ({ success: true }) }
};
const pngHeader = Uint8Array.from([
  137,80,78,71,13,10,26,10,
  0,0,0,13,73,72,68,82, 0,0,0,1,0,0,0,1,8,2,0,0,0, 0,0,0,0,
  0,0,0,0,73,69,78,68, 0,0,0,0
]);

async function ownerCookie() {
  const response = await worker.fetch(new Request('http://unit.test/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: credentials.ADMIN_EMAIL, password: credentials.ADMIN_PASSWORD })
  }), credentials);
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';', 1)[0];
}

function imageEnvironment({ imagePath = '/assets/toyota-fielder.jpg' } = {}) {
  const state = { imagePath, stored: new Map(), deleted: [] };
  const env = {
    ...credentials,
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              async first() {
                if (sql.startsWith('SELECT id,image_path')) return { id: values[0], image_path: state.imagePath };
                return null;
              },
              async run() {
                if (sql.startsWith('UPDATE vehicles SET image_path')) state.imagePath = values[0];
                return { meta: { changes: 1 } };
              }
            };
          }
        };
      }
    },
    VEHICLE_IMAGES: {
      async put(key, bytes, options) { state.stored.set(key, { bytes: Uint8Array.from(bytes), options }); },
      async delete(key) { state.deleted.push(key); state.stored.delete(key); },
      async get(key) {
        const object = state.stored.get(key);
        if (!object) return null;
        return { body: new Response(object.bytes).body, httpEtag: 'test-etag' };
      }
    }
  };
  return { env, state };
}

async function upload(cookie, bytes = pngHeader, filename = 'untrusted-name.png', type = 'image/png', env) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type }), filename);
  return worker.fetch(new Request('http://unit.test/api/admin/vehicles/test-car/image', {
    method: 'POST', headers: { cookie }, body: form
  }), env);
}

test('vehicle image upload requires owner authentication and configured storage', async () => {
  const { env, state } = imageEnvironment();
  const unauthenticated = await upload('', pngHeader, 'photo.png', 'image/png', env);
  assert.equal(unauthenticated.status, 401);
  const noStorage = await upload(await ownerCookie(), pngHeader, 'photo.png', 'image/png', { ...credentials, ADMIN_UPLOAD_LIMITER: credentials.ADMIN_UPLOAD_LIMITER, DB: env.DB });
  assert.equal(noStorage.status, 503);
  assert.equal(state.stored.size, 0);
});

test('vehicle image upload rejects invalid signatures and files over 5 MB', async () => {
  const cookie = await ownerCookie();
  const { env, state } = imageEnvironment();
  const wrongSignature = await upload(cookie, Uint8Array.from([1, 2, 3]), 'fake.png', 'image/png', env);
  assert.equal(wrongSignature.status, 415);
  const tooLarge = await upload(cookie, new Uint8Array(5 * 1024 * 1024 + 1), 'large.png', 'image/png', env);
  assert.equal(tooLarge.status, 413);
  assert.equal(state.stored.size, 0);
});

test('vehicle image upload rejects embedded EXIF and location metadata before public serving', async () => {
  const cookie = await ownerCookie();
  const { env, state } = imageEnvironment();
  const metadataChunk = Uint8Array.from([0,0,0,1,101,88,73,102,0,0,0,0]);
  const withExif = Uint8Array.from([...pngHeader.slice(0, 33), ...metadataChunk, ...pngHeader.slice(33)]);
  const response = await upload(cookie, withExif, 'photo.png', 'image/png', env);
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /metadata/);
  assert.equal(state.stored.size, 0);

  const jpegExif = Uint8Array.from([255,216,255,225,0,8,69,120,105,102,0,0,255,217]);
  const jpegResponse = await upload(cookie, jpegExif, 'photo.jpg', 'image/jpeg', env);
  assert.equal(jpegResponse.status, 415);

  const webpExif = Uint8Array.from([82,73,70,70,14,0,0,0,87,69,66,80,69,88,73,70,2,0,0,0,1,2]);
  const webpResponse = await upload(cookie, webpExif, 'photo.webp', 'image/webp', env);
  assert.equal(webpResponse.status, 415);
  assert.equal(state.stored.size, 0);
});

test('valid upload ignores the client filename, replaces the saved path, and serves typed media', async () => {
  const cookie = await ownerCookie();
  const oldId = '11111111-1111-4111-8111-111111111111';
  const oldKey = `vehicle-images/${oldId}.jpg`;
  const { env, state } = imageEnvironment({ imagePath: `/api/vehicle-images/${oldId}.jpg` });
  state.stored.set(oldKey, { bytes: Uint8Array.of(255, 216, 255), options: {} });
  const response = await upload(cookie, pngHeader, '../../private/name.svg', 'image/png', env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.image_path, /^\/api\/vehicle-images\/[0-9a-f-]{36}\.png$/);
  assert.equal(state.imagePath, payload.image_path);
  assert.deepEqual(state.deleted, [oldKey]);
  const newKey = payload.image_path.slice('/api/'.length);
  assert.equal(state.stored.get(newKey).options.httpMetadata.contentType, 'image/png');

  const served = await worker.fetch(new Request(`http://unit.test${payload.image_path}`), env);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(served.headers.get('etag'), 'test-etag');
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), pngHeader);
});
