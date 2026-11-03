import { normalizeBookingDateRange, BOOKING_OVERLAP_RANGE_SQL, calculateBookingPayment, calculateBookingPaymentMinor } from './booking-dates.js';
import { calculateRentalDiscount, discountCodeStatus, fijiLocalDateTimeToUtc, normalizeCustomerEmail, normalizeDiscountCode } from './discounts.js';
// === EMAIL NOTIFICATIONS via Resend ===
async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY) { console.log('[email] No RESEND_API_KEY - skipping'); return; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Zims Rental Cars <onboarding@resend.dev>', to: [to], subject, html })
    });
    if (!res.ok) console.error('[email] Failed:', res.status);
  } catch (e) { console.error('[email] Error:', e.message); }
}

function bookingEmailHtml(b) {
  return '<div style="font-family:sans-serif;max-width:600px;margin:auto;background:#f8f9fa;padding:20px">'
    + '<div style="background:#0a3d62;color:white;padding:20px;border-radius:8px 8px 0 0">'
    + '<h1 style="margin:0;font-size:22px">Zims Rental Cars - New Booking</h1></div>'
    + '<div style="background:white;padding:20px;border:1px solid #e0e0e0;border-top:none">'
    + '<p><strong>Reference:</strong> ' + b.id + '</p>'
    + '<p><strong>Customer:</strong> ' + b.name + '</p>'
    + '<p><strong>Email:</strong> ' + b.email + '</p>'
    + '<p><strong>Phone:</strong> ' + (b.phone || 'N/A') + '</p>'
    + '<p><strong>Vehicle:</strong> ' + (b.vehicle_name || b.vehicle_id) + '</p>'
    + '<p><strong>Pickup:</strong> ' + b.pickup + '</p>'
    + '<p><strong>Return:</strong> ' + b.ret + '</p>'
    + '<p><strong>Payment:</strong> ' + (b.payment_option === 'arrival' ? 'Pay on Arrival' : b.payment_option) + '</p>'
    + '<p><strong>Total:</strong> FJ$' + (b.total / 100).toFixed(2) + '</p>'
    + (b.notes ? '<p><strong>Notes:</strong> ' + b.notes + '</p>' : '')
    + '</div></div>';
}

function customerConfirmationHtml(b) {
  return '<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">'
    + '<div style="background:#0a3d62;color:white;padding:20px;border-radius:8px">'
    + '<h1 style="margin:0;font-size:22px">Booking Confirmed</h1></div>'
    + '<div style="background:white;padding:20px;border:1px solid #e0e0e0">'
    + '<p>Hi ' + b.name + ', your booking is confirmed!</p>'
    + '<p><strong>Reference:</strong> ' + b.id + '</p>'
    + '<p><strong>Vehicle:</strong> ' + (b.vehicle_name || b.vehicle_id) + '</p>'
    + '<p><strong>Total:</strong> FJ$' + (b.total / 100).toFixed(2) + '</p>'
    + (b.payment_option === 'arrival' ? '<p>Full payment due on pickup.</p>' : '')
    + '<p>Call +679 9042101 for help.</p></div></div>';
}
const COOKIE = 'zims_admin';
const ACTIVE_BOOKING_STATES = ['pending_payment', 'confirmed'];
const MAX_VEHICLE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024;
const MAX_UPLOAD_REQUEST_BYTES = MAX_VEHICLE_IMAGE_BYTES + 64 * 1024;
const JSON_TOO_LARGE = Symbol('json-too-large');
const IMAGE_TYPES = {
  png: { contentType: 'image/png', signature: bytes => bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value) },
  jpg: { contentType: 'image/jpeg', signature: bytes => bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 },
  webp: { contentType: 'image/webp', signature: bytes => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP' }
};
function containsSensitiveImageMetadata(bytes, extension) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (extension === 'jpg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return true;
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) return true;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return true;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) return false;
      if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return true;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return true;
      if (marker === 0xe1 || marker === 0xed || marker === 0xfe) return true;
      offset += length;
    }
    return true;
  }
  if (extension === 'png') {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
      const type = ascii(offset + 4, offset + 8);
      if (['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) return true;
      if (length > bytes.length - offset - 12) return true;
      offset += length + 12;
      if (type === 'IEND') return false;
    }
    return true;
  }
  if (extension === 'webp') {
    if (bytes.length < 12 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return true;
    const declaredLength = bytes[4] + (bytes[5] << 8) + (bytes[6] << 16) + (bytes[7] << 24);
    if (declaredLength + 8 > bytes.length) return true;
    let offset = 12;
    while (offset + 8 <= declaredLength + 8) {
      const type = ascii(offset, offset + 4);
      const length = bytes[offset + 4] + (bytes[offset + 5] << 8) + (bytes[offset + 6] << 16) + (bytes[offset + 7] << 24);
      if (type === 'EXIF' || type === 'XMP ') return true;
      if (length > declaredLength + 8 - offset - 8) return true;
      offset += 8 + length + (length & 1);
    }
    return offset !== declaredLength + 8;
  }
  return true;
}
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
const fail = (message, status = 400) => json({ error: message }, status);
async function readJsonObject(request) {
  try {
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_JSON_BYTES) return JSON_TOO_LARGE;
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
    const bytes = await readBoundedBody(request, MAX_JSON_BYTES);
    if (bytes === null) return JSON_TOO_LARGE;
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
async function readBoundedBody(request, maxBytes) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function rateLimit(request, env, bindingName, scope, identity = '', perIp = true) {
  const binding = env[bindingName];
  if (!binding || typeof binding.limit !== 'function') return fail('Request protection is not configured.', 503);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const keyMaterial = `${scope}:${perIp ? ip : ''}:${identity}`;
  const keyBytes = env.SESSION_SECRET
    ? await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(keyMaterial))
    : await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial));
  const key = b64url(keyBytes);
  try {
    const result = await binding.limit({ key });
    return result && result.success ? null : json({ error: 'Too many requests. Please wait and try again.' }, 429, { 'retry-after': '60' });
  } catch {
    return fail('Request protection is temporarily unavailable.', 503);
  }
}
function rejectOversizedJson(body) {
  return body === JSON_TOO_LARGE ? fail('Request body must be 16 KB or smaller.', 413) : null;
}
function parseUtcScheduleInstant(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) return undefined;
  return value;
}
function validatePromotion(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const startsAt = parseUtcScheduleInstant(body.starts_at);
  const endsAt = parseUtcScheduleInstant(body.ends_at);
  const priority = body.priority === undefined ? 0 : Number(body.priority);
  if (!message || message.length > 240) return { error: 'Enter promotional text with 1 to 240 characters.' };
  if (startsAt === undefined || endsAt === undefined) return { error: 'Schedule times must be valid UTC timestamps in ISO 8601 format.' };
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return { error: 'The expiry time must be after the start time.' };
  if (!Number.isInteger(priority) || priority < -1000 || priority > 1000) return { error: 'Priority must be a whole number from -1000 to 1000.' };
  return { value: { message, startsAt, endsAt, active: body.active === true ? 1 : 0, priority } };
}

function validateDiscountCode(body) {
  if (typeof body.active !== 'boolean') return { error: 'Active must be true or false.' };
  const code = normalizeDiscountCode(body.code);
  const percentage = Number(body.discount_percent);
  const usageLimit = body.usage_limit === null || body.usage_limit === undefined || body.usage_limit === ''
    ? null : Number(body.usage_limit);
  const startsAt = body.starts_at ? fijiLocalDateTimeToUtc(body.starts_at) : null;
  const expiresAt = body.expires_at ? fijiLocalDateTimeToUtc(body.expires_at) : null;
  if (!code) return { error: 'Code must be 3 to 32 letters, numbers, hyphens or underscores.' };
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) return { error: 'Discount percentage must be a whole number from 0 to 100.' };
  if (usageLimit !== null && (!Number.isSafeInteger(usageLimit) || usageLimit < 1 || usageLimit > 1000000)) return { error: 'Usage limit must be blank or a whole number from 1 to 1,000,000.' };
  if ((body.starts_at && startsAt === undefined) || (body.expires_at && expiresAt === undefined)) return { error: 'Schedule must be a valid Fiji local date and time.' };
  if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) return { error: 'Expiry must be after the start time.' };
  return { value: { code, percentage, usageLimit, startsAt, expiresAt, active: body.active === true ? 1 : 0 } };
}

function validateAutomaticDiscountRule(body) {
  if (typeof body.active !== 'boolean') return { error: 'Active must be true or false.' };
  const thresholdDays = Number(body.threshold_days);
  const capFjd = Number(body.max_discount_fjd);
  if (!Number.isInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 3650) return { error: 'Threshold must be a whole number from 1 to 3,650 days.' };
  if (!Number.isSafeInteger(capFjd) || capFjd < 0 || capFjd > 1000000) return { error: 'Maximum discount must be a whole FJD amount from 0 to 1,000,000.' };
  return { value: { thresholdDays, capMinor: capFjd * 100, active: body.active ? 1 : 0 } };
}

const EDITABLE_SITE_SETTINGS = new Set([
  'hero_title_line1',
  'hero_title_line2',
  'hero_subtitle',
  'about_heading',
  'about_body',
  'guide_heading',
  'guide_body',
  'contact_heading',
  'footer_tagline',
  'about_brochure_mode',
  'about_brochure_text',
  'about_brochure_image_url',
  'business_name',
  'business_address',
  'business_phone',
  'business_whatsapp',
  'business_email',
  'business_facebook',
  'business_map_url',
  'airport_pickup_text',
  'business_logo_url'
]);
function validateSiteSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.settings
    || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
    return { error: 'Settings must be provided as an object.' };
  }

  const entries = Object.entries(body.settings);
  if (!entries.length || entries.length > EDITABLE_SITE_SETTINGS.size) {
    return { error: 'Provide one or more supported website settings.' };
  }

  const urlFields = new Set([
    'business_facebook',
    'business_map_url',
    'business_logo_url'
  ]);

  const settings = [];

  for (const [key, raw] of entries) {
    if (!EDITABLE_SITE_SETTINGS.has(key)) {
      return { error: 'Unsupported website setting.' };
    }

    if (typeof raw !== 'string' || raw.length > 1000) {
      return { error: 'Website settings must be text up to 1,000 characters.' };
    }

    const value = raw.trim();

    if (key === 'business_email' && value
      && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { error: 'Enter a valid business email address.' };
    }

    if (key === 'business_phone' && value
      && !/^[+()\d\s.-]{7,25}$/.test(value)) {
      return { error: 'Enter a valid business phone number.' };
    }

    if (key === 'business_whatsapp' && value
      && !/^\+?[\d\s()-]{7,25}$/.test(value)) {
      return { error: 'Enter a valid WhatsApp phone number.' };
    }

    if (urlFields.has(key) && value) {
      const isLocalLogo = key === 'business_logo_url'
        && /^assets\/[a-zA-Z0-9._/-]+$/.test(value)
        && !value.split('/').includes('..')
        && !value.includes('//');

      if (!isLocalLogo) {
        let parsedUrl;

        try {
          parsedUrl = new URL(value);
        } catch {
          return { error: 'Enter a valid HTTPS URL or a supported local logo path.' };
        }

        if (parsedUrl.protocol !== 'https:'
          || !parsedUrl.hostname
          || parsedUrl.username
          || parsedUrl.password) {
          return { error: 'Website URLs must use HTTPS and cannot contain credentials.' };
        }
      }
    }

    settings.push({ key, value });
  }

  return { value: settings };
}

function validateVehicleDiscountOverride(body) {
  if (typeof body.active !== 'boolean') return { error: 'Vehicle discount override must be enabled or disabled.' };
  if (!Array.isArray(body.tiers) || body.tiers.length > 30) return { error: 'Provide up to 30 discount tiers.' };
  const seen = new Set();
  const tiers = [];
  for (const item of body.tiers) {
    const thresholdDays = Number(item?.threshold_days);
    const percentage = Number(item?.percentage);
    const capFjd = Number(item?.max_discount_fjd);
    const active = item?.active === undefined ? true : item.active;
    if (typeof active !== 'boolean') return { error: 'Each tier must have an enabled or disabled state.' };
    if (!Number.isInteger(thresholdDays) || thresholdDays < 1 || thresholdDays > 3650) return { error: 'Each tier threshold must be a whole number from 1 to 3,650 days.' };
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) return { error: 'Each tier percentage must be a whole number from 0 to 100.' };
    if (!Number.isSafeInteger(capFjd) || capFjd < 0 || capFjd > 1000000) return { error: 'Each tier cap must be a whole FJD amount from 0 to 1,000,000.' };
    if (seen.has(thresholdDays)) return { error: 'Each vehicle can have only one tier per duration threshold.' };
    seen.add(thresholdDays);
    tiers.push({ thresholdDays, percentage, capMinor: capFjd * 100, active: active ? 1 : 0 });
  }
  tiers.sort((a, b) => a.thresholdDays - b.thresholdDays);
  return { value: { active: body.active ? 1 : 0, tiers } };
}

async function releaseExpiredDiscountReservations(env) {
  await env.DB.prepare(`UPDATE discount_redemptions SET state='released',released_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE state='reserved' AND EXISTS (
      SELECT 1 FROM bookings b WHERE b.id=discount_redemptions.booking_id
        AND (b.status IN ('cancelled','rejected')
          OR (b.status='pending_payment' AND b.hold_expires_at IS NOT NULL
            AND b.hold_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')))
        AND b.payment_status NOT IN ('paid','deposit_paid','pay_on_arrival')
    )`).run();
}

async function calculateServerQuote(env, { vehicle, dateRange, emailNormalized, code, paymentOption, now }) {
  const vehicleRecord = await env.DB.prepare('SELECT daily_rate,deposit_percent FROM vehicles WHERE id=? AND active=1').bind(vehicle).first();
  if (!vehicleRecord) return { error: 'Selected vehicle was not found or is unavailable.', status: 400 };
  const rule = await env.DB.prepare("SELECT * FROM automatic_discount_rules WHERE id='long_rental'").first();
  if (!rule) return { error: 'Discount settings are not initialized. Apply the reviewed migration before accepting bookings.', status: 503 };
  const override = await env.DB.prepare('SELECT vehicle_id,active FROM vehicle_automatic_discount_overrides WHERE vehicle_id=?').bind(vehicle).first();
  const tiers = override ? (await env.DB.prepare('SELECT id,threshold_days,percentage,max_discount_fjd_minor,active FROM vehicle_automatic_discount_tiers WHERE vehicle_id=? ORDER BY threshold_days ASC').bind(vehicle).all()).results : [];
  const appliedRule = override ? { ...rule, vehicleOverride: true, vehicleOverrideActive: Number(override.active), tiers } : rule;

  let codeRecord = null;
  if (code) {
    const codeResult = await env.DB.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM discount_redemptions r WHERE r.code_id=c.id AND r.state IN ('reserved','redeemed')) AS uses,
      EXISTS(SELECT 1 FROM discount_redemptions r WHERE r.code_id=c.id AND r.email_normalized=? AND r.state IN ('reserved','redeemed')) AS used_by_email
      FROM discount_codes c WHERE c.code=?`).bind(emailNormalized || '', code).first();
    const codeState = discountCodeStatus(codeResult, now);
    if (codeState === 'invalid') return { error: 'This discount code is invalid.', status: 400 };
    if (codeState === 'inactive') return { error: 'This discount code is inactive.', status: 400 };
    if (codeState === 'not_started') return { error: 'This discount code is not active yet.', status: 400 };
    if (codeState === 'expired') return { error: 'This discount code has expired.', status: 400 };
    if (codeResult.usage_limit !== null && Number(codeResult.uses) >= Number(codeResult.usage_limit)) return { error: 'This discount code has reached its usage limit.', status: 400 };
    if (emailNormalized && codeResult.used_by_email) return { error: 'This email has already used this discount code.', status: 400 };
    codeRecord = { ...codeResult, reference: codeResult.code };
  }

  try {
    const discount = calculateRentalDiscount({ dailyRateFjd: Number(vehicleRecord.daily_rate), days: dateRange.days,
      automaticRule: appliedRule, code: codeRecord });
    const payment = calculateBookingPaymentMinor(discount.finalTotalMinor, paymentOption,
      vehicleRecord.deposit_percent == null ? null : Number(vehicleRecord.deposit_percent));
    return { value: { vehicleRecord, rule, override, tiers, appliedRule, codeRecord, discount, payment } };
  } catch (error) {
    return { error: error.message, status: 400 };
  }
}
const PAYMENT_METHOD_DEFAULTS = {
  bank_transfer: { enabled: false, bank_name: '', account_name: '', account_number: '', branch: '', instructions: '' },
  mpaisa: { enabled: false, recipient_name: '', mobile_number: '', qr_image_url: '', instructions: '' }
};
function cleanPaymentMethodConfig(method, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Provide valid payment method settings.' };
  const fields = method === 'bank_transfer'
    ? ['bank_name','account_name','account_number','branch','instructions']
    : ['recipient_name','mobile_number','qr_image_url','instructions'];
  const value = { enabled: input.enabled === true };
  for (const field of fields) {
    const raw = input[field] == null ? '' : String(input[field]).trim();
    const max = field === 'instructions' ? 1000 : field === 'qr_image_url' ? 500 : 160;
    if (raw.length > max) return { error: `${field.replaceAll('_',' ')} is too long.` };
    if (field === 'qr_image_url' && raw && !/^https:\/\//i.test(raw) && !/^\/api\/payment-qr\//i.test(raw)) return { error: 'QR image must use HTTPS or an approved local payment QR path.' };
    value[field] = raw;
  }
  if (value.enabled) {
    const required = method === 'bank_transfer' ? ['bank_name','account_name','account_number'] : ['recipient_name','mobile_number'];
    if (required.some(field => !value[field])) return { error: `Complete ${required.join(', ')} before enabling ${method === 'mpaisa' ? 'M-PAiSA' : 'bank transfer'}.` };
  }
  return { value };
}
async function readPaymentMethods(env) {
  const { results } = await env.DB.prepare('SELECT method_key,enabled,config_json FROM payment_method_settings').all();
  const methods = structuredClone(PAYMENT_METHOD_DEFAULTS);
  for (const row of results) {
    let saved = {};
    try { saved = JSON.parse(row.config_json || '{}'); } catch { saved = {}; }
    const method = methods[row.method_key];
    if (method) Object.assign(method, saved, { enabled: !!row.enabled });
  }
  return methods;
}
function publicPaymentMethods(methods) {
  const visible = (key, label) =>
    methods[key]?.enabled
      ? { ...methods[key], enabled: true, label }
      : { enabled: false, label };

  return {
    methods: {
      bank_transfer: visible('bank_transfer', 'Bank transfer'),
      mpaisa: visible('mpaisa', 'M-PAiSA')
    }
  };
}

function b64url(bytes) {
  let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function decodeB64url(s) { return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)); }
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}
async function issueCookie(env, email, role, secure) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ email, role, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  const token = `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure ? '; Secure' : ''}`;
}
async function getSession(request, env) {
  const token = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!token || !env.SESSION_SECRET) return null;
  const parts = token.split('.'); if (parts.length !== 2) return null;
  const expected = await sign(parts[0], env.SESSION_SECRET);
  if (expected.length !== parts[1].length) return null;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
  if (diff) return null;
  try { const payload = JSON.parse(decodeB64url(parts[0])); return payload.exp > Date.now() ? payload : null; } catch { return null; }
}
async function requireAdmin(request, env) { return await getSession(request, env); }
function secureRequest(request) { return new URL(request.url).protocol === 'https:'; }
function sameSecret(a, b, key) { return sign(String(a), key).then(x => sign(String(b), key).then(y => { if (x.length !== y.length) return false; let d=0; for(let i=0;i<x.length;i++) d |= x.charCodeAt(i)^y.charCodeAt(i); return d===0; })); }

function secureAssetResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return secureAssetResponse(await env.ASSETS.fetch(request));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'zims-api', mode: 'development-starter' });
      const publicImageMatch = url.pathname.match(/^\/api\/(vehicle-images|payment-qr)\/([0-9a-f-]{36})\.(png|jpg|webp)$/i);
      if (publicImageMatch && request.method === 'GET') {
        if (!env.VEHICLE_IMAGES) return fail('Vehicle image storage is not configured.', 503);
        const [, folder, id, extension] = publicImageMatch;
        const prefix = folder === 'payment-qr' ? 'payment-qr' : 'vehicle-images';
        const image = await env.VEHICLE_IMAGES.get(`${prefix}/${id}.${extension.toLowerCase()}`);
        if (!image) return fail('Image not found.', 404);
        const headers = new Headers({
          'content-type': IMAGE_TYPES[extension.toLowerCase()].contentType,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff'
        });
        if (image.httpEtag) headers.set('etag', image.httpEtag);
        return new Response(image.body, { headers });
      }
      if (url.pathname === '/api/login' && request.method === 'POST') {
        const ipLimit = await rateLimit(request, env, 'LOGIN_IP_LIMITER', 'login-ip');
        if (ipLimit) return ipLimit;
        const body = await readJsonObject(request);
        const bodySizeError = rejectOversizedJson(body);
        if (bodySizeError) return bodySizeError;
        if (!body) return fail('Request body must be a valid JSON object.');
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const accountLimit = await rateLimit(request, env, 'LOGIN_ACCOUNT_LIMITER', 'login-account', email.slice(0, 254), false);
        if (accountLimit) return accountLimit;
        if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return fail('Admin secrets are not configured. See README.md.', 503);
        const validEmail = await sameSecret(email, env.ADMIN_EMAIL.trim().toLowerCase(), env.SESSION_SECRET);
        const validPassword = await sameSecret(password, env.ADMIN_PASSWORD, env.SESSION_SECRET);
        if (!validEmail || !validPassword) return fail('Email or password is incorrect.', 401);
        return json({ ok: true, user: { email, role: 'owner' } }, 200, { 'set-cookie': await issueCookie(env, email, 'owner', secureRequest(request)) });
      }
      if (url.pathname === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secureRequest(request) ? '; Secure' : ''}` });
      if (url.pathname === '/api/me' && request.method === 'GET') {
        const user = await getSession(request, env); return user ? json({ user: { email: user.email, role: user.role } }) : fail('Not signed in.', 401);
      }
      if (url.pathname === '/api/booking-lookup' && request.method === 'POST') {
        const limited = await rateLimit(request, env, 'PUBLIC_API_LIMITER', 'booking-lookup');
        if (limited) return limited;
        const body = await readJsonObject(request);
        const bodySizeError = rejectOversizedJson(body);
        if (bodySizeError) return bodySizeError;
        if (!body) return fail('Request body must be a valid JSON object.');
        const bookingId = String(body.booking_id || '').trim();
        const email = normalizeCustomerEmail(body.email);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId) || !email || email.length > 254) return fail('Enter a valid booking reference and email.');
        const booking = await env.DB.prepare(`SELECT b.id,b.status,b.payment_status,b.payment_option,b.pickup_at,b.return_at,b.total_fjd,
          b.final_total_fjd_minor,b.amount_due_fjd_minor,b.balance_due_fjd_minor,b.hold_expires_at,b.payment_currency,
          b.payment_amount_minor,v.name AS vehicle_name FROM bookings b LEFT JOIN vehicles v ON v.id=b.vehicle_id
          WHERE b.id=? AND lower(trim(b.email))=?`).bind(bookingId,email).first();
        if (!booking) return fail('We could not find a booking matching those details. Check the reference and email, or contact Zims.',404);
        const holdExpired = booking.status === 'pending_payment' && (!booking.hold_expires_at || Date.parse(booking.hold_expires_at) <= Date.now());
        return json({ booking: { reference: booking.id, status: booking.status, payment_status: booking.payment_status,
          payment_option: booking.payment_option, vehicle_name: booking.vehicle_name || 'Vehicle details unavailable',
          pickup_at: booking.pickup_at, return_at: booking.return_at,
          rental_total_fjd: Number(booking.final_total_fjd_minor ?? Number(booking.total_fjd) * 100) / 100,
          amount_due_fjd_minor: Number(booking.amount_due_fjd_minor || 0), balance_due_fjd_minor: Number(booking.balance_due_fjd_minor || 0),
          hold_expires_at: booking.hold_expires_at, hold_expired: holdExpired,
          payment_currency: booking.payment_currency, payment_amount_minor: booking.payment_amount_minor } });
      }
      if (url.pathname === '/api/site-settings' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT setting_key,setting_value FROM site_settings').all();
        return json({ settings: Object.fromEntries(results.map(row => [row.setting_key, row.setting_value])) });
      }
      if (url.pathname === '/api/payment-methods' && request.method === 'GET') {
        const methods = await readPaymentMethods(env);
        return json(publicPaymentMethods(methods));
      }
      if (url.pathname === '/api/manual-payment/submit' && request.method === 'POST') {
        const limited = await rateLimit(request, env, 'BOOKING_LIMITER', 'manual-payment-submit');
        if (limited) return limited;
        const body = await readJsonObject(request);
        const bodySizeError = rejectOversizedJson(body);
        if (bodySizeError) return bodySizeError;
        if (!body) return fail('Request body must be a valid JSON object.');
        const bookingId = String(body.booking_id || '').trim();
        const email = normalizeCustomerEmail(body.email);
        const reference = String(body.transaction_reference || '').trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId) || !email || email.length > 254 || reference.length < 3 || reference.length > 160) return fail('Enter a valid booking reference, email and transaction reference (3–160 characters).');
        const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id=? AND lower(trim(email))=?').bind(bookingId,email).first();
        if (!booking) return fail('Booking reference or email was not found.',404);
        if (!['bank_transfer','mpaisa'].includes(booking.payment_provider)) return fail('This booking is not awaiting a manual payment reference.',409);
        if (booking.status !== 'pending_payment' || booking.payment_status !== 'pending') return fail('This booking is no longer awaiting payment.',409);
        if (!booking.hold_expires_at || Date.parse(booking.hold_expires_at) <= Date.now()) return fail('Your temporary hold has expired. Please start a new booking request.',409);
        const now = new Date().toISOString();
        const reviewHold = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const saved = await env.DB.prepare(`UPDATE bookings SET customer_payment_reference=?,payment_submitted_at=?,hold_expires_at=?
          WHERE id=? AND lower(trim(email))=? AND payment_provider IN ('bank_transfer','mpaisa') AND status='pending_payment' AND payment_status='pending' AND hold_expires_at>?`)
          .bind(reference,now,reviewHold,bookingId,email,now).run();
        if (saved.meta?.changes !== 1) return fail('The booking hold expired or changed. Please refresh and try again.',409);
        return json({ ok:true, status:'pending_payment', payment_status:'pending', hold_expires_at:reviewHold,
          message:'Payment reference submitted. Your booking is held for owner review; it is not confirmed yet.' });
      }
      if (url.pathname.startsWith('/api/admin/')) {
        const user = await requireAdmin(request, env);
        if (!user) return fail('Please sign in.', 401);
        if (url.pathname === '/api/admin/payment-methods' && request.method === 'GET') {
          return json({ methods: await readPaymentMethods(env) });
        }
        if (url.pathname === '/api/admin/payment-methods' && request.method === 'PUT') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body || !body.methods || typeof body.methods !== 'object') return fail('Provide bank transfer and M-PAiSA settings.');
          const checked = [];
          for (const method of ['bank_transfer','mpaisa']) {
            const result = cleanPaymentMethodConfig(method, body.methods[method]);
            if (result.error) return fail(result.error);
            checked.push({ method, ...result.value });
          }
          await env.DB.batch(checked.map(item => env.DB.prepare(`INSERT INTO payment_method_settings (method_key,enabled,config_json,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(method_key) DO UPDATE SET enabled=excluded.enabled,config_json=excluded.config_json,updated_at=CURRENT_TIMESTAMP`)
            .bind(item.method, item.enabled ? 1 : 0, JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !['method','enabled'].includes(key)))))));
          return json({ ok: true });
        }
        const reviewPaymentMatch = url.pathname.match(/^\/api\/admin\/bookings\/([^/]+)\/review-payment$/);
        if (reviewPaymentMatch && request.method === 'POST') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body || !['approve','reject'].includes(body.action)) return fail('Choose approve or reject.');
          const id = decodeURIComponent(reviewPaymentMatch[1]);
          const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
          if (!booking) return fail('Booking not found.',404);
          if (!['bank_transfer','mpaisa'].includes(booking.payment_provider)) return fail('This booking is not using a manual payment method.',409);
          if (!booking.customer_payment_reference || !booking.payment_submitted_at) return fail('The customer has not submitted a payment reference yet.',409);
          if (booking.status !== 'pending_payment' || booking.payment_status !== 'pending') return fail('This booking is no longer awaiting manual payment review.',409);
          if (!booking.hold_expires_at || Date.parse(booking.hold_expires_at) <= Date.now()) return fail('The manual-review hold has expired. Contact the customer and resolve availability before taking any further action.',409);
          const now = new Date().toISOString();
          const note = String(body.note || '').trim().slice(0,1000);
          if (body.action === 'approve') {
            const capacity = await env.DB.prepare(
  'SELECT fleet_quantity FROM vehicles WHERE id=? AND active=1'
).bind(booking.vehicle_id).first();

if (!capacity || Number(capacity.fleet_quantity) < 1) {
  return fail('This vehicle is no longer available.', 409);
}

const { results: overlappingBookings } = await env.DB.prepare(`
  SELECT id, pickup_at, return_at
  FROM bookings
  WHERE vehicle_id=? AND id<>?
    AND (
      status='confirmed'
      OR (status='pending_payment' AND hold_expires_at IS NOT NULL AND hold_expires_at>?)
    )
    AND ${BOOKING_OVERLAP_RANGE_SQL}
`).bind(booking.vehicle_id, id, now, booking.return_at, booking.pickup_at).all();

const pickupMs = Date.parse(booking.pickup_at);
const returnMs = Date.parse(booking.return_at);
const checkPoints = [
  pickupMs,
  ...overlappingBookings
    .map(item => Date.parse(item.pickup_at))
    .filter(time => time >= pickupMs && time < returnMs)
];

const exceedsCapacity = checkPoints.some(point => {
  const inUse = overlappingBookings.filter(item =>
    Date.parse(item.pickup_at) <= point &&
    Date.parse(item.return_at) > point
  ).length;

  return inUse >= Number(capacity.fleet_quantity);
});

if (exceedsCapacity) {
  return fail('The fleet is fully booked for part or all of these dates.', 409);
}
            const paymentStatus = booking.payment_option === 'deposit' ? 'deposit_paid' : booking.payment_option === 'arrival' ? 'pay_on_arrival' : 'paid';
            const results = await env.DB.batch([
              env.DB.prepare(`UPDATE bookings SET status='confirmed',payment_status=?,payment_review_note=?,payment_reviewed_at=?,payment_reviewed_by=?
                WHERE id=? AND status='pending_payment' AND payment_status='pending' AND customer_payment_reference=? AND payment_submitted_at=? AND hold_expires_at>?
                AND (SELECT COUNT(*) FROM bookings other WHERE other.vehicle_id=bookings.vehicle_id AND other.id<>bookings.id
                  AND (other.status='confirmed' OR (other.status='pending_payment' AND other.hold_expires_at IS NOT NULL AND other.hold_expires_at>?))
                  AND julianday(other.pickup_at)<=julianday(bookings.pickup_at) AND julianday(other.return_at)>julianday(bookings.pickup_at))
                  < (SELECT fleet_quantity FROM vehicles WHERE id=bookings.vehicle_id)
                AND NOT EXISTS (
                  SELECT 1 FROM bookings event WHERE event.vehicle_id=bookings.vehicle_id AND event.id<>bookings.id
                  AND (event.status='confirmed' OR (event.status='pending_payment' AND event.hold_expires_at IS NOT NULL AND event.hold_expires_at>?))
                  AND julianday(event.pickup_at)>julianday(bookings.pickup_at) AND julianday(event.pickup_at)<julianday(bookings.return_at)
                  AND (SELECT COUNT(*) FROM bookings active WHERE active.vehicle_id=event.vehicle_id AND active.id<>bookings.id
                    AND (active.status='confirmed' OR (active.status='pending_payment' AND active.hold_expires_at IS NOT NULL AND active.hold_expires_at>?))
                    AND julianday(active.pickup_at)<=julianday(event.pickup_at) AND julianday(active.return_at)>julianday(event.pickup_at))
                    >= (SELECT fleet_quantity FROM vehicles WHERE id=event.vehicle_id)
                )`)
                .bind(paymentStatus,note || 'Manual payment verified by owner.',now,user.email,id,booking.customer_payment_reference,booking.payment_submitted_at,now,now,now,now),
              env.DB.prepare(`UPDATE discount_redemptions SET state='redeemed',redeemed_at=COALESCE(redeemed_at,CURRENT_TIMESTAMP) WHERE booking_id=? AND state='reserved' AND EXISTS (SELECT 1 FROM bookings WHERE id=? AND status='confirmed' AND payment_status IN ('paid','deposit_paid','pay_on_arrival'))`).bind(id,id)
            ]);
            if (results[0]?.meta?.changes !== 1) return fail('Booking changed during review or the vehicle dates are no longer available. Refresh and check availability again.',409);
            return json({ ok:true, status:'confirmed', payment_status:paymentStatus });
          }
          if (!note) return fail('Enter a reason when rejecting a manual payment.');
          const results = await env.DB.batch([
            env.DB.prepare(`UPDATE bookings SET status='rejected',payment_status='failed',hold_expires_at=?,payment_review_note=?,payment_reviewed_at=?,payment_reviewed_by=?,cancellation_reason=?
              WHERE id=? AND status='pending_payment' AND payment_status='pending' AND customer_payment_reference=? AND payment_submitted_at=? AND hold_expires_at>?`).bind(now,note,now,user.email,note,id,booking.customer_payment_reference,booking.payment_submitted_at,now),
            env.DB.prepare(`UPDATE discount_redemptions SET state='released',released_at=CURRENT_TIMESTAMP WHERE booking_id=? AND state='reserved' AND EXISTS (SELECT 1 FROM bookings WHERE id=? AND status='rejected' AND payment_status='failed')`).bind(id,id)
          ]);
          if (results[0]?.meta?.changes !== 1) return fail('Booking changed during review. Refresh and try again.',409);
          return json({ ok:true, status:'rejected', payment_status:'failed' });
        }
        if (url.pathname === '/api/admin/vehicles' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM vehicles ORDER BY name').all(); return json({ vehicles: results });
        }
        if (url.pathname === '/api/admin/promotions' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM promo_banners ORDER BY priority DESC, created_at ASC').all();
          return json({ promotions: results });
        }
        if (url.pathname === '/api/admin/discount-rule' && request.method === 'GET') {
          const rule = await env.DB.prepare('SELECT * FROM automatic_discount_rules WHERE id=\'long_rental\'').first();
          return rule ? json({ rule }) : fail('Discount settings are not initialized. Apply the reviewed local migration first.', 503);
        }
        if (url.pathname === '/api/admin/discount-rule' && request.method === 'PUT') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body) return fail('Request body must be a valid JSON object.');
          const checked = validateAutomaticDiscountRule(body);
          if (checked.error) return fail(checked.error);
          const { thresholdDays, capMinor, active } = checked.value;
          const result = await env.DB.prepare(`UPDATE automatic_discount_rules
            SET threshold_days=?,max_discount_fjd_minor=?,active=?,updated_at=CURRENT_TIMESTAMP
            WHERE id='long_rental'`).bind(thresholdDays, capMinor, active).run();
          if (!result.meta || result.meta.changes !== 1) return fail('Discount settings are not initialized. Apply the reviewed migration first.', 503);
          return json({ ok: true });
        }
        if (url.pathname === '/api/admin/site-settings' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT setting_key,setting_value,updated_at FROM site_settings ORDER BY setting_key').all();
          return json({ settings: Object.fromEntries(results.map(row => [row.setting_key, row.setting_value])), updated_at: results.reduce((latest,row)=>!latest||row.updated_at>latest?row.updated_at:latest,null) });
        }
        if (url.pathname === '/api/admin/site-settings' && request.method === 'PUT') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body) return fail('Request body must be a valid JSON object.');
          const checked = validateSiteSettings(body);
          if (checked.error) return fail(checked.error);
          const statements = checked.value.map(({key,value}) => value
            ? env.DB.prepare(`INSERT INTO site_settings (setting_key,setting_value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
              ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP`).bind(key,value)
            : env.DB.prepare('DELETE FROM site_settings WHERE setting_key=?').bind(key));
          try { await env.DB.batch(statements); } catch { return fail('Website text could not be saved. Check that the reviewed migration is applied.',503); }
          return json({ ok:true, saved:checked.value.length });
        }
        if (url.pathname === '/api/admin/vehicle-discount-rules' && request.method === 'GET') {
          const { results: overrides } = await env.DB.prepare(`SELECT o.vehicle_id,o.active,o.updated_at,v.name AS vehicle_name
            FROM vehicle_automatic_discount_overrides o JOIN vehicles v ON v.id=o.vehicle_id ORDER BY v.name`).all();
          const { results: tiers } = await env.DB.prepare(`SELECT id,vehicle_id,threshold_days,percentage,max_discount_fjd_minor,active,updated_at
            FROM vehicle_automatic_discount_tiers ORDER BY vehicle_id,threshold_days`).all();
          return json({ rules: overrides.map(rule => ({ ...rule, tiers: tiers.filter(tier => tier.vehicle_id === rule.vehicle_id) })) });
        }
        const vehicleDiscountMatch = url.pathname.match(/^\/api\/admin\/vehicles\/([^/]+)\/discount-rules$/);
        if (vehicleDiscountMatch && request.method === 'DELETE') {
          const vehicleId = decodeURIComponent(vehicleDiscountMatch[1]);
          await env.DB.batch([
            env.DB.prepare('DELETE FROM vehicle_automatic_discount_tiers WHERE vehicle_id=?').bind(vehicleId),
            env.DB.prepare('DELETE FROM vehicle_automatic_discount_overrides WHERE vehicle_id=?').bind(vehicleId)
          ]);
          return json({ ok: true, vehicle_id: vehicleId, use_global_defaults: true });
        }
        if (vehicleDiscountMatch && request.method === 'PUT') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body) return fail('Request body must be a valid JSON object.');
          const vehicleId = decodeURIComponent(vehicleDiscountMatch[1]);
          if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(vehicleId)) return fail('Invalid vehicle identifier.');
          const vehicle = await env.DB.prepare('SELECT id FROM vehicles WHERE id=?').bind(vehicleId).first();
          if (!vehicle) return fail('Vehicle not found.', 404);
          const checked = validateVehicleDiscountOverride(body);
          if (checked.error) return fail(checked.error);
          const { active, tiers } = checked.value;
          const statements = [env.DB.prepare(`INSERT INTO vehicle_automatic_discount_overrides (vehicle_id,active,updated_at)
            VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(vehicle_id) DO UPDATE SET active=excluded.active,updated_at=CURRENT_TIMESTAMP`).bind(vehicleId, active),
            env.DB.prepare('DELETE FROM vehicle_automatic_discount_tiers WHERE vehicle_id=?').bind(vehicleId),
            ...tiers.map(tier => env.DB.prepare(`INSERT INTO vehicle_automatic_discount_tiers
              (id,vehicle_id,threshold_days,percentage,max_discount_fjd_minor,active,updated_at)
              VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(), vehicleId, tier.thresholdDays, tier.percentage, tier.capMinor, tier.active))];
          try { await env.DB.batch(statements); } catch { return fail('Vehicle discount settings could not be saved. Check that the discount migration is applied.', 503); }
          return json({ ok: true, vehicle_id: vehicleId, active: !!active, tiers_saved: tiers.length });
        }
        if (url.pathname === '/api/admin/discount-codes' && request.method === 'GET') {
          await releaseExpiredDiscountReservations(env);
          const { results } = await env.DB.prepare(`SELECT c.*,
            (SELECT COUNT(*) FROM discount_redemptions r WHERE r.code_id=c.id AND r.state IN ('reserved','redeemed')) AS uses
            FROM discount_codes c ORDER BY c.created_at DESC`).all();
          return json({ codes: results });
        }
        if (url.pathname === '/api/admin/discount-codes' && request.method === 'POST') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body) return fail('Request body must be a valid JSON object.');
          const checked = validateDiscountCode(body);
          if (checked.error) return fail(checked.error);
          const id = body.id === undefined ? crypto.randomUUID() : String(body.id);
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail('Invalid discount code identifier.');
          const c = checked.value;
          try {
            if (body.id) {
              const currentUses = await env.DB.prepare(`SELECT COUNT(*) AS uses FROM discount_redemptions
                WHERE code_id=? AND state IN ('reserved','redeemed')`).bind(id).first();
              if (c.usageLimit !== null && c.usageLimit < Number(currentUses?.uses || 0)) {
                return fail('Usage limit cannot be lower than the number of reserved or completed redemptions.');
              }
            }
            await env.DB.prepare(`INSERT INTO discount_codes
              (id,code,discount_percent,usage_limit,active,starts_at,expires_at,updated_at)
              VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET code=excluded.code,discount_percent=excluded.discount_percent,
                usage_limit=excluded.usage_limit,active=excluded.active,starts_at=excluded.starts_at,
                expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP`)
              .bind(id, c.code, c.percentage, c.usageLimit, c.active, c.startsAt, c.expiresAt).run();
          } catch {
            return fail('That code already exists or conflicts with a saved redemption.', 409);
          }
          return json({ ok: true, id });
        }
        if (url.pathname === '/api/admin/promotions' && request.method === 'POST') {
          const body = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(body);
          if (bodySizeError) return bodySizeError;
          if (!body) return fail('Request body must be a valid JSON object.');
          const checked = validatePromotion(body);
          if (checked.error) return fail(checked.error);
          const id = body.id === undefined ? crypto.randomUUID() : String(body.id);
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail('Invalid promotion identifier.');
          const p = checked.value;
          await env.DB.prepare(`
            INSERT INTO promo_banners (id,message,starts_at,ends_at,active,priority,updated_at)
            VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET message=excluded.message,starts_at=excluded.starts_at,
              ends_at=excluded.ends_at,active=excluded.active,priority=excluded.priority,updated_at=CURRENT_TIMESTAMP
          `).bind(id,p.message,p.startsAt,p.endsAt,p.active,p.priority).run();
          return json({ ok: true, id });
        }
        const promotionMatch = url.pathname.match(/^\/api\/admin\/promotions\/([0-9a-f-]{36})$/i);
        if (promotionMatch && request.method === 'DELETE') {
          const result = await env.DB.prepare('DELETE FROM promo_banners WHERE id=?').bind(promotionMatch[1]).run();
          if (!result.meta || result.meta.changes !== 1) return fail('Promotion not found.', 404);
          return json({ ok: true });
        }
        if (url.pathname === '/api/admin/vehicles' && request.method === 'POST') {
          const b = await readJsonObject(request);
          const bodySizeError = rejectOversizedJson(b);
          if (bodySizeError) return bodySizeError;
          if (!b) return fail('Request body must be a valid JSON object.');
          const id = String(b.id || crypto.randomUUID()).trim().slice(0,80), name = String(b.name || '').trim().slice(0,120), rate = Number(b.daily_rate), image = String(b.image_path || '').trim().slice(0,500), description = String(b.description || '').trim().slice(0,1000), active = b.active === false || b.active === 0 ? 0 : 1;
          const depositPercent = b.deposit_percent === null || b.deposit_percent === undefined || b.deposit_percent === '' ? null : Number(b.deposit_percent);
          const fleetQuantity = Number(b.fleet_quantity ?? 1);
          if (!name || !Number.isInteger(rate) || rate < 0 || rate > 1000000) return fail('Enter a vehicle name and a valid daily rate.');
          if (!Number.isInteger(fleetQuantity) || fleetQuantity < 0 || fleetQuantity > 10000) return fail('Fleet quantity must be a whole number from 0 to 10000.');
          if (depositPercent !== null && (!Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent > 100)) return fail('Deposit percentage must be greater than 0 and no more than 100.');
          await env.DB.prepare('INSERT INTO vehicles (id,name,daily_rate,image_path,description,active,deposit_percent,fleet_quantity,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name=excluded.name,daily_rate=excluded.daily_rate,image_path=excluded.image_path,description=excluded.description,active=excluded.active,deposit_percent=excluded.deposit_percent,fleet_quantity=excluded.fleet_quantity,updated_at=CURRENT_TIMESTAMP').bind(id,name,rate,image,description,active,depositPercent,fleetQuantity).run();
          return json({ ok: true, id });
        }
        if (url.pathname === '/api/admin/payment-qr/image' && request.method === 'POST') {
          const uploadLimit = await rateLimit(request, env, 'ADMIN_UPLOAD_LIMITER', 'admin-payment-qr-upload', user.email || 'owner');
          if (uploadLimit) return uploadLimit;
          if (!env.VEHICLE_IMAGES) return fail('Image storage is not configured.',503);
          const contentLength = Number(request.headers.get('content-length') || 0);
          if (contentLength > MAX_UPLOAD_REQUEST_BYTES) return fail('QR image must be 5 MB or smaller.',413);
          const uploadBytes = await readBoundedBody(request, MAX_UPLOAD_REQUEST_BYTES);
          if (uploadBytes === null) return fail('QR image must be 5 MB or smaller.',413);
          const form = await new Request(request.url,{method:'POST',headers:request.headers,body:uploadBytes}).formData();
          const file = form.get('file');
          if (!(file instanceof File)) return fail('Choose a PNG, JPEG or WebP QR image.');
          if (!file.size) return fail('The selected QR image is empty.');
          if (file.size > MAX_VEHICLE_IMAGE_BYTES) return fail('QR image must be 5 MB or smaller.',413);
          const bytes = new Uint8Array(await file.arrayBuffer());
          const imageType = Object.entries(IMAGE_TYPES).find(([,spec])=>spec.signature(bytes));
          if (!imageType) return fail('Only valid PNG, JPEG and WebP images are accepted.',415);
          const [extension,spec] = imageType;
          if (containsSensitiveImageMetadata(bytes,extension)) return fail('Remove image metadata (including EXIF/location data) before upload.',415);
          const methods = await readPaymentMethods(env);
          const oldPath = methods.mpaisa.qr_image_url || '';
          const objectId = crypto.randomUUID();
          const key = `payment-qr/${objectId}.${extension}`;
          await env.VEHICLE_IMAGES.put(key,bytes,{httpMetadata:{contentType:spec.contentType,cacheControl:'public, max-age=31536000, immutable'}});
          const imagePath = `/api/payment-qr/${objectId}.${extension}`;
          methods.mpaisa.qr_image_url = imagePath;
          try {
            await env.DB.prepare(`INSERT INTO payment_method_settings (method_key,enabled,config_json,updated_at) VALUES ('mpaisa',?,?,CURRENT_TIMESTAMP)
              ON CONFLICT(method_key) DO UPDATE SET config_json=excluded.config_json,updated_at=CURRENT_TIMESTAMP`)
              .bind(methods.mpaisa.enabled ? 1 : 0,JSON.stringify(Object.fromEntries(Object.entries(methods.mpaisa).filter(([keyName])=>keyName!=='enabled')))).run();
          } catch (error) { await env.VEHICLE_IMAGES.delete(key).catch(()=>{}); throw error; }
          const oldMatch = oldPath.match(/^\/api\/payment-qr\/([0-9a-f-]{36})\.(png|jpg|webp)$/i);
          if(oldMatch) await env.VEHICLE_IMAGES.delete(`payment-qr/${oldMatch[1]}.${oldMatch[2].toLowerCase()}`).catch(()=>{});
          return json({ok:true,image_path:imagePath});
        }
        const imageUploadMatch = url.pathname.match(/^\/api\/admin\/vehicles\/([^/]+)\/image$/);
        if (imageUploadMatch && request.method === 'POST') {
          const uploadLimit = await rateLimit(request, env, 'ADMIN_UPLOAD_LIMITER', 'admin-image-upload', user.email || 'owner');
          if (uploadLimit) return uploadLimit;
          if (!env.VEHICLE_IMAGES) return fail('Vehicle image storage is not configured.', 503);
          const contentLength = Number(request.headers.get('content-length') || 0);
          if (contentLength > MAX_UPLOAD_REQUEST_BYTES) return fail('Image must be 5 MB or smaller.', 413);
          const vehicleId = decodeURIComponent(imageUploadMatch[1]);
          const vehicle = await env.DB.prepare('SELECT id,image_path FROM vehicles WHERE id=?').bind(vehicleId).first();
          if (!vehicle) return fail('Vehicle not found.', 404);
          const uploadBytes = await readBoundedBody(request, MAX_UPLOAD_REQUEST_BYTES);
          if (uploadBytes === null) return fail('Image must be 5 MB or smaller.', 413);
          const form = await new Request(request.url, { method: 'POST', headers: request.headers, body: uploadBytes }).formData();
          const file = form.get('file');
          if (!(file instanceof File)) return fail('Choose a PNG, JPEG or WebP image.');
          if (file.size > MAX_VEHICLE_IMAGE_BYTES) return fail('Image must be 5 MB or smaller.', 413);
          if (!file.size) return fail('The selected image is empty.');
          const bytes = new Uint8Array(await file.arrayBuffer());
          const imageType = Object.entries(IMAGE_TYPES).find(([, spec]) => spec.signature(bytes));
          if (!imageType) return fail('Only valid PNG, JPEG and WebP images are accepted.', 415);
          const [extension, spec] = imageType;
          if (containsSensitiveImageMetadata(bytes, extension)) return fail('Remove image metadata (including EXIF/location data) before upload.', 415);
          const objectId = crypto.randomUUID();
          const key = `vehicle-images/${objectId}.${extension}`;
          await env.VEHICLE_IMAGES.put(key, bytes, {
            httpMetadata: { contentType: spec.contentType, cacheControl: 'public, max-age=31536000, immutable' }
          });
          const imagePath = `/api/vehicle-images/${objectId}.${extension}`;
          try {
            await env.DB.prepare('UPDATE vehicles SET image_path=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(imagePath, vehicleId).run();
          } catch (error) {
            await env.VEHICLE_IMAGES.delete(key).catch(() => {});
            throw error;
          }
          const oldImageMatch = String(vehicle.image_path || '').match(/^\/api\/vehicle-images\/([0-9a-f-]{36})\.(png|jpg|webp)$/i);
          if (oldImageMatch) {
            const oldKey = `vehicle-images/${oldImageMatch[1]}.${oldImageMatch[2].toLowerCase()}`;
            if (oldKey !== key) await env.VEHICLE_IMAGES.delete(oldKey).catch(() => {});
          }
          return json({ ok: true, image_path: imagePath });
        }
        const vehicleMatch = url.pathname.match(/^\/api\/admin\/vehicles\/([^/]+)$/);
        if (vehicleMatch && request.method === 'DELETE') {
          await env.DB.prepare('UPDATE vehicles SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(decodeURIComponent(vehicleMatch[1])).run(); return json({ ok: true });
        }
        
        // Read-only booking history with server-side search, filters and pagination.
        // This route stays inside the existing /api/admin/ authentication guard.
        if (url.pathname === '/api/admin/booking-history' && request.method === 'GET') {
          const params = url.searchParams;
          const search = String(params.get('search') || '').trim().slice(0, 120);
          const pickupFrom = params.get('pickup_from') || '';
          const pickupTo = params.get('pickup_to') || '';
          const bookingStatus = params.get('status') || '';
          const paymentStatus = params.get('payment_status') || '';

          const validDate = value =>
            /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(Date.parse(value + 'T00:00:00Z')) &&
            new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;

          const validBookingStatuses = [
            'requested', 'pending_payment', 'confirmed',
            'rejected', 'cancelled', 'completed'
          ];
          const validPaymentStatuses = [
            'unpaid', 'pending', 'deposit_paid', 'paid',
            'refunded', 'failed'
          ];

          if ((pickupFrom && !validDate(pickupFrom)) ||
              (pickupTo && !validDate(pickupTo))) {
            return fail('Pickup date filters must use YYYY-MM-DD.', 400);
          }
          if (pickupFrom && pickupTo && pickupFrom > pickupTo) {
            return fail('Pickup start date must not be after the end date.', 400);
          }
          if (bookingStatus && !validBookingStatuses.includes(bookingStatus)) {
            return fail('Invalid booking status filter.', 400);
          }
          if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
            return fail('Invalid payment status filter.', 400);
          }

          const pageValue = Number(params.get('page') || 1);
          const pageSizeValue = Number(params.get('page_size') || 50);

          if (!Number.isSafeInteger(pageValue) || pageValue < 1 ||
              !Number.isSafeInteger(pageSizeValue) ||
              pageSizeValue < 1 || pageSizeValue > 50) {
            return fail('Invalid page or page size.', 400);
          }

          const conditions = [];
          const bindings = [];

          if (search) {
            conditions.push(`(
              b.id LIKE ? COLLATE NOCASE OR
              b.customer_name LIKE ? COLLATE NOCASE OR
              b.email LIKE ? COLLATE NOCASE OR
              b.phone LIKE ? COLLATE NOCASE OR
              v.name LIKE ? COLLATE NOCASE
            )`);
            const term = '%' + search + '%';
            bindings.push(term, term, term, term, term);
          }

          if (pickupFrom) {
            conditions.push("substr(b.pickup_at, 1, 10) >= ?");
            bindings.push(pickupFrom);
          }
          if (pickupTo) {
            conditions.push("substr(b.pickup_at, 1, 10) <= ?");
            bindings.push(pickupTo);
          }
          if (bookingStatus) {
            conditions.push('b.status = ?');
            bindings.push(bookingStatus);
          }
          if (paymentStatus) {
            conditions.push('b.payment_status = ?');
            bindings.push(paymentStatus);
          }

          const where = conditions.length
            ? ' WHERE ' + conditions.join(' AND ')
            : '';

          const count = await env.DB.prepare(
            `SELECT COUNT(*) AS total
             FROM bookings b
             LEFT JOIN vehicles v ON v.id = b.vehicle_id${where}`
          ).bind(...bindings).first();

          const total = Number(count?.total || 0);
          const totalPages = Math.ceil(total / pageSizeValue);
          const page = Math.min(pageValue, Math.max(totalPages, 1));
          const offset = (page - 1) * pageSizeValue;

          const { results } = await env.DB.prepare(
            `SELECT b.*, v.name AS vehicle_name
             FROM bookings b
             LEFT JOIN vehicles v ON v.id = b.vehicle_id${where}
             ORDER BY b.created_at DESC, b.id DESC
             LIMIT ? OFFSET ?`
          ).bind(...bindings, pageSizeValue, offset).all();

          return json({
            bookings: results,
            pagination: {
              page,
              page_size: pageSizeValue,
              total,
              total_pages: totalPages
            }
          });
        }

        if (url.pathname === '/api/admin/bookings' && request.method === 'GET') {
          const { results } = await env.DB.prepare('SELECT b.*, v.name AS vehicle_name FROM bookings b LEFT JOIN vehicles v ON v.id=b.vehicle_id ORDER BY b.created_at DESC LIMIT 500').all(); return json({ bookings: results });
        }
        const bookingMatch = url.pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
        if (bookingMatch && request.method === 'PATCH') {
  const b = await readJsonObject(request);
  const bodySizeError = rejectOversizedJson(b);
  if (bodySizeError) return bodySizeError;
  if (!b) return fail('Request body must be a valid JSON object.');

  const allowedStatus = [
    'requested',
    'pending_payment',
    'confirmed',
    'rejected',
    'cancelled',
    'completed'
  ];

  const allowedPayment = [
    'unpaid',
    'pending',
    'deposit_paid',
    'paid',
    'refunded',
    'failed'
  ];

  if (b.status && !allowedStatus.includes(b.status)) {
    return fail('Invalid booking status.');
  }

  // Only verified payment processing can confirm bookings.
  if (b.status === 'confirmed') {
    return fail(
      'Bookings can only be confirmed by verified payment processing.',
      403
    );
  }

  if (b.payment_status && !allowedPayment.includes(b.payment_status)) {
    return fail('Invalid payment status.');
  }

  // Only verified payment processing can change payment status.
  if (b.payment_status) {
    return fail(
      'Payment status can only be updated by verified payment processing.',
      403
    );
  }

  if (!b.status) {
    return fail('A booking status is required.');
  }

  const id = decodeURIComponent(bookingMatch[1]);
  const booking = await env.DB
    .prepare('SELECT * FROM bookings WHERE id = ?')
    .bind(id)
    .first();

  if (!booking) {
    return fail('Booking not found.', 404);
  }

  const reason = String(b.cancellation_reason || '')
    .trim()
    .slice(0, 1000);

  if (['bank_transfer','mpaisa'].includes(booking.payment_provider) && booking.customer_payment_reference
    && booking.status === 'pending_payment' && booking.payment_status === 'pending' && b.status && b.status !== booking.status) {
    return fail('Use the dedicated manual payment review action for this booking.',403);
  }

  // A reason is required when rejecting or cancelling.
  if (
    ['rejected', 'cancelled'].includes(b.status) &&
    !reason
  ) {
    return fail(
      'Enter a reason before rejecting or cancelling this booking.'
    );
  }

  // Check date conflicts before allowing an active status.
  if (ACTIVE_BOOKING_STATES.includes(b.status)) {
    const now = new Date().toISOString();

    const capacity = await env.DB.prepare(
      'SELECT fleet_quantity FROM vehicles WHERE id=? AND active=1'
    ).bind(booking.vehicle_id).first();

    if (!capacity || Number(capacity.fleet_quantity) < 1) {
      return fail('This vehicle is no longer available.', 409);
    }

    const { results: overlappingBookings } = await env.DB.prepare(`
      SELECT id, pickup_at, return_at
      FROM bookings
      WHERE vehicle_id=? AND id<>?
        AND (
          status='confirmed'
          OR (status='pending_payment' AND hold_expires_at IS NOT NULL AND hold_expires_at>?)
        )
        AND ${BOOKING_OVERLAP_RANGE_SQL}
    `).bind(booking.vehicle_id, id, now, booking.return_at, booking.pickup_at).all();

    const pickupMs = Date.parse(booking.pickup_at);
    const returnMs = Date.parse(booking.return_at);
    const checkPoints = [
      pickupMs,
      ...overlappingBookings
        .map(item => Date.parse(item.pickup_at))
        .filter(time => time >= pickupMs && time < returnMs)
    ];

    const exceedsCapacity = checkPoints.some(point => {
      const inUse = overlappingBookings.filter(item =>
        Date.parse(item.pickup_at) <= point &&
        Date.parse(item.return_at) > point
      ).length;

      return inUse >= Number(capacity.fleet_quantity);
    });

    if (exceedsCapacity) {
      return fail('The fleet is fully booked for part or all of these dates.', 409);
    }
  }

  if (['rejected', 'cancelled'].includes(b.status)) {
    const results = await env.DB.batch([
      env.DB.prepare(`
      UPDATE bookings
      SET status = ?, cancellation_reason = ?
      WHERE id = ?
      `).bind(b.status, reason, id),
      env.DB.prepare(`UPDATE discount_redemptions SET state='released',released_at=CURRENT_TIMESTAMP
        WHERE booking_id=? AND state='reserved'
          AND EXISTS (SELECT 1 FROM bookings b WHERE b.id=? AND b.status IN ('cancelled','rejected')
            AND b.payment_status NOT IN ('paid','deposit_paid','pay_on_arrival'))`).bind(id, id)
    ]);
    if (results[0]?.meta?.changes !== 1) return fail('Booking status was not updated.', 409);
  } else {
    const wasActive = ACTIVE_BOOKING_STATES.includes(booking.status);
    const isActive = ACTIVE_BOOKING_STATES.includes(b.status);
    if (!wasActive && isActive) {
      const now = new Date().toISOString();
      const results = await env.DB.batch([
        env.DB.prepare(`UPDATE bookings SET status=? WHERE id=?
          AND (SELECT COUNT(*) FROM bookings other WHERE other.vehicle_id=bookings.vehicle_id AND other.id<>bookings.id
            AND (other.status='confirmed' OR (other.status='pending_payment' AND other.hold_expires_at IS NOT NULL AND other.hold_expires_at>?))
            AND julianday(other.pickup_at)<=julianday(bookings.pickup_at) AND julianday(other.return_at)>julianday(bookings.pickup_at))
            < (SELECT fleet_quantity FROM vehicles WHERE id=bookings.vehicle_id)
          AND NOT EXISTS (
            SELECT 1 FROM bookings event WHERE event.vehicle_id=bookings.vehicle_id AND event.id<>bookings.id
            AND (event.status='confirmed' OR (event.status='pending_payment' AND event.hold_expires_at IS NOT NULL AND other.hold_expires_at>?))
            AND julianday(event.pickup_at)>julianday(bookings.pickup_at) AND julianday(event.pickup_at)<julianday(bookings.return_at)
            AND (SELECT COUNT(*) FROM bookings active WHERE active.vehicle_id=event.vehicle_id AND active.id<>bookings.id
              AND (active.status='confirmed' OR (active.status='pending_payment' AND active.hold_expires_at IS NOT NULL AND active.hold_expires_at>?))
              AND julianday(active.pickup_at)<=julianday(event.pickup_at) AND julianday(active.return_at)>julianday(event.pickup_at))
              >= (SELECT fleet_quantity FROM vehicles WHERE id=event.vehicle_id)
          )`)
          .bind(b.status, id, now, now, now)
      ]);
      if (results[0]?.meta?.changes !== 1) return fail('Booking changed during update or the vehicle dates are no longer available. Refresh and check availability again.', 409);
    } else {
      await env.DB.prepare(
        'UPDATE bookings SET status = ? WHERE id = ?'
      ).bind(b.status, id).run();
    }
  }

  return json({ ok: true });
}
        return fail('Admin endpoint not found.', 404);
      }
      
      if (url.pathname === '/api/booking-quote' && request.method === 'POST') {
        const limited = await rateLimit(request, env, 'PUBLIC_API_LIMITER', 'booking-quote');
        if (limited) return limited;
        const b = await readJsonObject(request);
        const bodySizeError = rejectOversizedJson(b);
        if (bodySizeError) return bodySizeError;
        if (!b) return fail('Request body must be a valid JSON object.');
        const vehicle = String(b.vehicle_id || '');
        const dateRange = normalizeBookingDateRange(String(b.pickup_at || ''), String(b.return_at || ''));
        const email = String(b.email || '').trim();
        const emailNormalized = email ? normalizeCustomerEmail(email) : '';
        const paymentOption = String(b.payment_option || 'full');
        const codeText = String(b.discount_code || '').trim();
        const code = codeText ? normalizeDiscountCode(codeText) : null;
        if (!vehicle || !dateRange || !['full','deposit','arrival'].includes(paymentOption)
          || (email && !/^\S+@\S+\.\S+$/.test(email)) || (codeText && !code)) {
          return fail('Please provide a vehicle, valid dates and a valid email address or discount code.');
        }
        await releaseExpiredDiscountReservations(env);
        const quote = await calculateServerQuote(env, { vehicle, dateRange, emailNormalized, code, paymentOption, now: new Date().toISOString() });
        if (quote.error) return fail(quote.error, quote.status);
        const { discount, payment } = quote.value;
        return json({ rental_days: discount.days, daily_rate_fjd_minor: discount.dailyRateMinor,
          original_subtotal_fjd_minor: discount.originalSubtotalMinor, discount_type: discount.discountType,
          discount_reference: discount.discountReference, discount_percent: discount.discountPercent,
          discount_amount_fjd_minor: discount.discountAmountMinor, rental_total_fjd_minor: discount.finalTotalMinor,
          rental_total_fjd: payment.rentalTotalFjd, payment_option: payment.paymentOption,
          deposit_percent_snapshot: payment.depositPercentSnapshot,
          amount_due_fjd_minor: payment.amountDueFjdMinor, balance_due_fjd_minor: payment.balanceDueFjdMinor });
      }

      if (url.pathname === '/api/booking-request' && request.method === 'POST') {
        const limited = await rateLimit(request, env, 'BOOKING_LIMITER', 'booking-request');
        if (limited) return limited;
        const b = await readJsonObject(request);
        const bodySizeError = rejectOversizedJson(b);
        if (bodySizeError) return bodySizeError;
        if (!b) return fail('Request body must be a valid JSON object.');

        const name = String(b.customer_name || '').trim().slice(0, 120);
        const email = String(b.email || '').trim().slice(0, 180);
        const emailNormalized = normalizeCustomerEmail(email);
        const phone = String(b.phone || '').trim().slice(0, 60);
        const vehicle = String(b.vehicle_id || '');
        const pickupInput = String(b.pickup_at || '');
        const returnInput = String(b.return_at || '');
        const notes = String(b.notes || '').trim().slice(0, 1000);
        const paymentOption = String(b.payment_option || 'full');
        const paymentMethod = String(b.payment_method || 'bank_transfer');
        const requestId = String(b.request_id || '');
        const codeText = String(b.discount_code || '').trim();
        const code = codeText ? normalizeDiscountCode(codeText) : null;

        const dateRange = normalizeBookingDateRange(pickupInput, returnInput);

        if (
          !name ||
          !/^\S+@\S+\.\S+$/.test(email) ||
          !vehicle ||
          !dateRange ||
          !['full', 'deposit', 'arrival'].includes(paymentOption) ||
          !['bank_transfer','mpaisa','none'].includes(paymentMethod) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
          (codeText && !code)
        ) {
          return fail('Please provide valid contact details, vehicle and rental dates.');
        }

        const previous = await env.DB.prepare(`SELECT id,email,status,hold_expires_at,total_fjd,payment_provider,
          final_total_fjd_minor,discount_type,discount_amount_fjd_minor,amount_due_fjd_minor,balance_due_fjd_minor
          FROM bookings WHERE request_id=?`).bind(requestId).first();
        if (previous && normalizeCustomerEmail(previous.email) !== emailNormalized) return fail('This request identifier is already in use.', 409);
        if (previous && previous.payment_provider && previous.payment_provider !== paymentMethod) return fail('This request identifier is already associated with another payment method. Start a new booking request.',409);
        if (previous) return json({ ok: true, booking_id: previous.id, status: previous.status, payment_method: previous.payment_provider || paymentMethod,
          hold_expires_at: previous.hold_expires_at, rental_total_fjd: Number(previous.final_total_fjd_minor ?? previous.total_fjd * 100) / 100,
          rental_total_fjd_minor: previous.final_total_fjd_minor, discount_type: previous.discount_type,
          discount_amount_fjd_minor: previous.discount_amount_fjd_minor, amount_due_fjd_minor: previous.amount_due_fjd_minor,
          balance_due_fjd_minor: previous.balance_due_fjd_minor, idempotent_replay: true });

        const pickup = dateRange.pickupAt;
        const ret = dateRange.returnAt;

        const now = new Date().toISOString();
        const methods = await readPaymentMethods(env);

if (!methods[paymentMethod]?.enabled) {
  return fail(
    'That payment method is not currently available. Refresh and choose another method.',
    409
  );
}
        await releaseExpiredDiscountReservations(env);
        const quote = await calculateServerQuote(env, { vehicle, dateRange, emailNormalized, code, paymentOption, now });
        if (quote.error) return fail(quote.error, quote.status);
        const { vehicleRecord, rule, override, tiers, codeRecord, discount, payment } = quote.value;
        if (payment.amountDueFjdMinor <= 0 && payment.paymentOption !== 'arrival') return fail('This booking has no payable balance and cannot be confirmed automatically. Please contact Zims for manual confirmation.', 400);
        const overrideState = override ? Number(override.active) : -1;
        const selectedTier = discount.automaticTierId ? tiers.find(tier => tier.id === discount.automaticTierId) : null;
        const holdExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const id = crypto.randomUUID();
        const statements = [
          env.DB.prepare(`UPDATE discount_redemptions SET state='released',released_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE state='reserved' AND EXISTS (SELECT 1 FROM bookings b WHERE b.id=discount_redemptions.booking_id
              AND (b.status IN ('cancelled','rejected') OR (b.status='pending_payment'
                AND b.hold_expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')))
              AND b.payment_status NOT IN ('paid','deposit_paid','pay_on_arrival'))`),
          env.DB.prepare(`
          INSERT INTO bookings (
            id, customer_name, email, phone, vehicle_id,
            pickup_at, return_at, status, payment_status,
            total_fjd, notes, hold_expires_at, payment_option,
            deposit_percent_snapshot, amount_due_fjd_minor, balance_due_fjd_minor,
            daily_rate_fjd_minor,rental_days,original_subtotal_fjd_minor,discount_type,
            discount_reference,discount_percent,discount_amount_fjd_minor,final_total_fjd_minor,request_id,payment_provider
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, 'pending_payment', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM vehicles
            WHERE id = ? AND active = 1 AND daily_rate=? AND deposit_percent IS ?
          )
          AND (SELECT fleet_quantity FROM vehicles WHERE id = ?) > 0
          AND (
            SELECT COUNT(*)
            FROM bookings active
            WHERE active.vehicle_id = ?
              AND (
                active.status = 'confirmed'
                OR (
                  active.status = 'pending_payment'
                  AND active.hold_expires_at IS NOT NULL
                  AND active.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
                )
              )
              AND julianday(active.pickup_at) <= julianday(?)
              AND julianday(active.return_at) > julianday(?)
          ) < (SELECT fleet_quantity FROM vehicles WHERE id = ?)
          AND NOT EXISTS (
            SELECT 1
            FROM bookings event
            WHERE event.vehicle_id = ?
              AND (
                event.status = 'confirmed'
                OR (
                  event.status = 'pending_payment'
                  AND event.hold_expires_at IS NOT NULL
                  AND event.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
                )
              )
              AND julianday(event.pickup_at) > julianday(?)
              AND julianday(event.pickup_at) < julianday(?)
              AND (
                SELECT COUNT(*)
                FROM bookings active
                WHERE active.vehicle_id = event.vehicle_id
                  AND (
                    active.status = 'confirmed'
                    OR (
                      active.status = 'pending_payment'
                      AND active.hold_expires_at IS NOT NULL
                      AND active.hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    )
                  )
                  AND julianday(active.pickup_at) <= julianday(event.pickup_at)
                  AND julianday(active.return_at) > julianday(event.pickup_at)
              ) >= (
                SELECT fleet_quantity
                FROM vehicles
                WHERE id = event.vehicle_id
              )
          )
          AND EXISTS (SELECT 1 FROM automatic_discount_rules r WHERE r.id='long_rental'
            AND r.threshold_days=? AND r.percentage=? AND r.max_discount_fjd_minor=? AND r.active=?)
          AND COALESCE((SELECT o.active FROM vehicle_automatic_discount_overrides o WHERE o.vehicle_id=?),-1)=?
          AND (?=-1 OR ?=0 OR (?=1 AND (
            (? IS NULL AND NOT EXISTS (SELECT 1 FROM vehicle_automatic_discount_tiers t
              WHERE t.vehicle_id=? AND t.active=1 AND t.threshold_days<=?))
            OR (? IS NOT NULL AND EXISTS (SELECT 1 FROM vehicle_automatic_discount_tiers t
              WHERE t.id=? AND t.vehicle_id=? AND t.active=1 AND t.threshold_days=? AND t.percentage=? AND t.max_discount_fjd_minor=?)
              AND (SELECT MAX(t.threshold_days) FROM vehicle_automatic_discount_tiers t
                WHERE t.vehicle_id=? AND t.active=1 AND t.threshold_days<=?)=? )
          )))
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM discount_codes c
            WHERE c.id=? AND c.code=? AND c.active=1
              AND c.discount_percent=?
              AND (c.starts_at IS NULL OR c.starts_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              AND (c.expires_at IS NULL OR c.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              AND (c.usage_limit IS NULL OR (SELECT COUNT(*) FROM discount_redemptions r
                WHERE r.code_id=c.id AND r.state IN ('reserved','redeemed')) < c.usage_limit)
              AND NOT EXISTS (SELECT 1 FROM discount_redemptions r
                WHERE r.code_id=c.id AND r.email_normalized=? AND r.state IN ('reserved','redeemed'))
          ))
        `).bind(
          id,
          name,
          email,
          phone,
          vehicle,
          pickup,
          ret,
          payment.rentalTotalFjd,
          notes,
          holdExpires,
          payment.paymentOption,
          payment.depositPercentSnapshot,
          payment.amountDueFjdMinor,
          payment.balanceDueFjdMinor,
          discount.dailyRateMinor,
          discount.days,
          discount.originalSubtotalMinor,
          discount.discountType,
          discount.discountReference,
          discount.discountPercent,
          discount.discountAmountMinor,
          discount.finalTotalMinor,
          requestId,
          paymentMethod,
          vehicle,
          Number(vehicleRecord.daily_rate),
          vehicleRecord.deposit_percent == null ? null : Number(vehicleRecord.deposit_percent),
          vehicle,
          vehicle,
          pickup,
          pickup,
          vehicle,
          vehicle,
          pickup,
          ret,
          Number(rule.threshold_days),
          Number(rule.percentage),
          Number(rule.max_discount_fjd_minor),
          Number(rule.active),
          vehicle,
          overrideState,
          overrideState,
          overrideState,
          overrideState,
          discount.automaticTierId ?? null,
          vehicle,
          discount.days,
          discount.automaticTierId ?? null,
          discount.automaticTierId ?? null,
          vehicle,
          Number(discount.automaticThresholdDays ?? 0),
          Number(discount.discountPercent ?? 0),
          Number(discount.automaticCapMinor ?? 0),
          vehicle,
          discount.days,
          Number(discount.automaticThresholdDays ?? 0),
          codeRecord?.id ?? null,
          codeRecord?.id ?? null,
          code ?? null,
          Number(codeRecord?.discount_percent ?? 0),
          emailNormalized
        ),
        ...(codeRecord ? [env.DB.prepare(`INSERT INTO discount_redemptions
          (id,code_id,booking_id,email_normalized,state)
          SELECT ?,?,?,?,'reserved' WHERE EXISTS (SELECT 1 FROM bookings WHERE id=?)`)
          .bind(crypto.randomUUID(), codeRecord.id, id, emailNormalized, id)] : [])
        ];

        let results;
        try {
          results = await env.DB.batch(statements);
        } catch (error) {
          const replay = await env.DB.prepare(`SELECT id,email,status,hold_expires_at,total_fjd,payment_provider,
            final_total_fjd_minor,discount_type,discount_amount_fjd_minor,amount_due_fjd_minor,balance_due_fjd_minor
            FROM bookings WHERE request_id=?`).bind(requestId).first();
          if (replay && normalizeCustomerEmail(replay.email) === emailNormalized) {
            return json({ ok: true, booking_id: replay.id, status: replay.status, payment_method: replay.payment_provider || paymentMethod,
              hold_expires_at: replay.hold_expires_at,
              rental_total_fjd: Number(replay.final_total_fjd_minor ?? replay.total_fjd * 100) / 100,
              rental_total_fjd_minor: replay.final_total_fjd_minor, discount_type: replay.discount_type,
              discount_amount_fjd_minor: replay.discount_amount_fjd_minor,
              amount_due_fjd_minor: replay.amount_due_fjd_minor,
              balance_due_fjd_minor: replay.balance_due_fjd_minor, idempotent_replay: true });
          }
          throw error;
        }
        const result = results[1];

        if (!result.meta || result.meta.changes !== 1) {
          return fail(
            'Vehicle availability or pricing changed. Please refresh and try again.',
            409
          );
        }
                // Send email notifications
        const vehicleRec = await env.DB.prepare('SELECT name FROM vehicles WHERE id=?').bind(vehicle).first();
        const emailData = { id, name, email, phone, vehicle_id: vehicle, vehicle_name: vehicleRec?.name || vehicle, pickup, ret, payment_option: payment.paymentOption, total: payment.rentalTotalFjdMinor, amount_due: payment.amountDueFjdMinor, notes };
        const ownerEmail = env.OWNER_EMAIL || 'zimsrentalfj@gmail.com';
      await sendEmail(env, ownerEmail, 'New Booking - ' + id + ' - ' + (vehicleRec?.name || 'Vehicle'), bookingEmailHtml(emailData));
        await sendEmail(env, email, 'Booking Confirmed - Zims Rental Cars - ' + id, customerConfirmationHtml(emailData));
        return json({
          ok: true,
          booking_id: id,
          status: 'pending_payment',
          hold_expires_at: holdExpires,
          rental_total_fjd: payment.rentalTotalFjd,
          rental_total_fjd_minor: payment.rentalTotalFjdMinor,
          daily_rate_fjd_minor: discount.dailyRateMinor,
          rental_days: discount.days,
          original_subtotal_fjd_minor: discount.originalSubtotalMinor,
          discount_type: discount.discountType,
          discount_reference: discount.discountReference,
          discount_percent: discount.discountPercent,
          discount_amount_fjd_minor: discount.discountAmountMinor,
          payment_option: payment.paymentOption,
          payment_method: paymentMethod,
          deposit_percent_snapshot: payment.depositPercentSnapshot,
          amount_due_fjd_minor: payment.amountDueFjdMinor,
          balance_due_fjd_minor: payment.balanceDueFjdMinor,
          message: 'Vehicle temporarily held while you make payment and submit your transaction reference.'
        }, 201);
      }

      if (url.pathname === '/api/availability' && request.method === 'POST') {
        const limited = await rateLimit(request, env, 'PUBLIC_API_LIMITER', 'availability');
        if (limited) return limited;
        const b = await readJsonObject(request);
        const bodySizeError = rejectOversizedJson(b);
        if (bodySizeError) return bodySizeError;
        if (!b) return fail('Request body must be a valid JSON object.');
        const vehicle = String(b.vehicle_id || '');
        const pickupInput = String(b.pickup_at || '');
        const returnInput = String(b.return_at || '');

        const dateRange = normalizeBookingDateRange(pickupInput, returnInput);

        if (
          !vehicle ||
          !dateRange
        ) {
          return fail('Please provide a vehicle and valid rental dates.');
        }

        const pickup = dateRange.pickupAt;
        const ret = dateRange.returnAt;

        const now = new Date().toISOString();
        await releaseExpiredDiscountReservations(env);
        const availability = await env.DB.prepare(`
          SELECT id, fleet_quantity
          FROM vehicles
          WHERE id = ? AND active = 1
        `).bind(vehicle).first();

        if (!availability) {
          return json({ available: false, reason: 'vehicle_unavailable' });
        }

        const { results: overlappingBookings } = await env.DB.prepare(`
          SELECT b.pickup_at, b.return_at
          FROM bookings b
          WHERE b.vehicle_id = ?
            AND (
              b.status = 'confirmed'
              OR (
                b.status = 'pending_payment'
                AND b.hold_expires_at IS NOT NULL
                AND b.hold_expires_at > ?
              )
            )
            AND julianday(b.pickup_at) < julianday(?)
            AND julianday(b.return_at) > julianday(?)
        `).bind(vehicle, now, ret, pickup).all();

        const pickupMs = Date.parse(pickup);
        const returnMs = Date.parse(ret);
        const capacity = Number(availability.fleet_quantity ?? 1);

        const checkPoints = [
          pickupMs,
          ...overlappingBookings
            .map(booking => Date.parse(booking.pickup_at))
            .filter(time => time >= pickupMs && time < returnMs)
        ];

        const hasCapacity = capacity > 0 && checkPoints.every(point => {
          const inUse = overlappingBookings.filter(booking =>
            Date.parse(booking.pickup_at) <= point &&
            Date.parse(booking.return_at) > point
          ).length;

          return inUse < capacity;
        });

        return json({
          available: hasCapacity,
          reason: hasCapacity ? null : 'dates_unavailable'
        });
      }

      if (url.pathname === '/api/vehicles' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id,name,daily_rate,image_path,description,deposit_percent FROM vehicles WHERE active=1 ORDER BY name'
        ).all();
        return json({ vehicles: results });
      }
      if (url.pathname === '/api/promotions' && request.method === 'GET') {
        const now = new Date().toISOString();
        const { results } = await env.DB.prepare(`
          SELECT id,message,priority FROM promo_banners
          WHERE active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>?)
          ORDER BY priority DESC, starts_at ASC, created_at ASC LIMIT 10
        `).bind(now,now).all();
        return json({ promotions: results });
      }
      return fail('API endpoint not found.',404);
    } catch (error) {
      console.error('Zims API request failed', error instanceof Error ? error.name : 'UnknownError');
      return fail('Something went wrong. Please try again or contact the site administrator.',500);
    }
  }
};
