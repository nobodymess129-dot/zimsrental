const FIJI_ZONE = 'Pacific/Fiji';
const FIJI_DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: FIJI_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

export function normalizeCustomerEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function normalizeDiscountCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalized) ? normalized : null;
}

export function discountCodeStatus(code, nowIso) {
  if (!code) return 'invalid';
  if (Number(code.active) !== 1) return 'inactive';
  const now = Date.parse(nowIso);
  const startsAt = code.starts_at == null ? null : Date.parse(code.starts_at);
  const expiresAt = code.expires_at == null ? null : Date.parse(code.expires_at);
  if (!Number.isFinite(now) || (startsAt !== null && !Number.isFinite(startsAt))
    || (expiresAt !== null && !Number.isFinite(expiresAt))) return 'invalid';
  if (startsAt !== null && now < startsAt) return 'not_started';
  if (expiresAt !== null && now >= expiresAt) return 'expired';
  return 'valid';
}

function percentAmountMinor(subtotalMinor, percent) {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0
    || !Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError('Invalid discount calculation.');
  }
  return Number((BigInt(subtotalMinor) * BigInt(percent) + 50n) / 100n);
}

export function calculateRentalDiscount({ dailyRateFjd, days, automaticRule, code }) {
  if (!Number.isSafeInteger(dailyRateFjd) || dailyRateFjd < 0
    || !Number.isSafeInteger(days) || days < 1) {
    throw new RangeError('Invalid rental price inputs.');
  }
  const dailyRateMinor = dailyRateFjd * 100;
  const originalSubtotalMinor = dailyRateMinor * days;
  if (!Number.isSafeInteger(dailyRateMinor) || !Number.isSafeInteger(originalSubtotalMinor)) {
    throw new RangeError('Rental price is too large.');
  }

  const globalRule = automaticRule?.globalRule || automaticRule;
  const thresholdDays = Number(globalRule?.threshold_days ?? 7);
  const automaticPercent = Number(globalRule?.percentage ?? 10);
  const automaticCapMinor = Number(globalRule?.max_discount_fjd_minor ?? 10000);
  if (!Number.isSafeInteger(thresholdDays) || thresholdDays < 1
    || !Number.isInteger(automaticPercent) || automaticPercent < 0 || automaticPercent > 100
    || !Number.isSafeInteger(automaticCapMinor) || automaticCapMinor < 0) {
    throw new RangeError('Automatic discount settings are invalid.');
  }

  let selectedAutomaticRule = null;
  if (automaticRule?.vehicleOverride === true) {
    const overrideActive = automaticRule.vehicleOverrideActive === true
      || Number(automaticRule.vehicleOverrideActive) === 1;
    const tiers = Array.isArray(automaticRule.tiers) ? automaticRule.tiers : [];
    const eligibleTiers = overrideActive ? tiers.filter(tier => {
      const threshold = Number(tier.threshold_days);
      const percentage = Number(tier.percentage);
      const cap = Number(tier.max_discount_fjd_minor);
      return Number(tier.active) === 1 && Number.isSafeInteger(threshold) && threshold >= 1
        && Number.isInteger(percentage) && percentage >= 0 && percentage <= 100
        && Number.isSafeInteger(cap) && cap >= 0 && days >= threshold;
    }).sort((a, b) => Number(b.threshold_days) - Number(a.threshold_days)) : [];
    selectedAutomaticRule = eligibleTiers[0] || null;
  } else if (Number(globalRule?.active ?? 1) === 1 && days >= thresholdDays) {
    selectedAutomaticRule = { ...globalRule, id: globalRule?.id || 'long_rental' };
  }

  if (selectedAutomaticRule) {
    if (code) throw new Error('This rental qualifies for the automatic long-rental discount. Discount codes cannot be used on this booking.');
    const selectedPercent = Number(selectedAutomaticRule.percentage);
    const selectedCapMinor = Number(selectedAutomaticRule.max_discount_fjd_minor);
    const selectedThreshold = Number(selectedAutomaticRule.threshold_days);
    if (!Number.isInteger(selectedPercent) || selectedPercent < 0 || selectedPercent > 100
      || !Number.isSafeInteger(selectedCapMinor) || selectedCapMinor < 0
      || !Number.isSafeInteger(selectedThreshold) || selectedThreshold < 1) {
      throw new RangeError('Automatic discount settings are invalid.');
    }
    const discountMinor = Math.min(percentAmountMinor(originalSubtotalMinor, selectedPercent), selectedCapMinor, originalSubtotalMinor);
    const reference = automaticRule?.vehicleOverride === true
      ? `vehicle-tier:${selectedThreshold}`
      : (selectedAutomaticRule.id || 'long_rental');
    return { dailyRateMinor, days, originalSubtotalMinor, discountType: discountMinor ? 'automatic' : null,
      discountReference: reference, discountPercent: selectedPercent,
      discountAmountMinor: discountMinor, finalTotalMinor: originalSubtotalMinor - discountMinor,
      automaticThresholdDays: selectedThreshold, automaticCapMinor: selectedCapMinor,
      automaticTierId: automaticRule?.vehicleOverride === true ? (selectedAutomaticRule.id || null) : null };
  }

  let discountPercent = null;
  let discountMinor = 0;
  let discountReference = null;
  let discountType = null;
  if (code) {
    discountPercent = Number(code.discount_percent);
    if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw new RangeError('Discount code settings are invalid.');
    }
    discountMinor = Math.min(percentAmountMinor(originalSubtotalMinor, discountPercent), originalSubtotalMinor);
    discountReference = code.reference ?? code.id;
    discountType = 'code';
  }
  return { dailyRateMinor, days, originalSubtotalMinor, discountType, discountReference,
    discountPercent, discountAmountMinor: discountMinor, finalTotalMinor: originalSubtotalMinor - discountMinor };
}

function localParts(timestamp) {
  return Object.fromEntries(FIJI_DATE_TIME.formatToParts(new Date(timestamp))
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

export function fijiLocalDateTimeToUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const calendarProbe = new Date(0);
  calendarProbe.setUTCFullYear(year, month - 1, day);
  calendarProbe.setUTCHours(hour, minute, 0, 0);
  if (calendarProbe.getUTCFullYear() !== year || calendarProbe.getUTCMonth() !== month - 1
    || calendarProbe.getUTCDate() !== day || hour > 23 || minute > 59) return undefined;

  const nominal = calendarProbe.getTime();
  const candidates = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = nominal - offsetMinutes * 60000;
    const parts = localParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day
      && parts.hour === hour && parts.minute === minute) candidates.push(candidate);
  }
  if (candidates.length !== 1) return undefined;
  return new Date(candidates[0]).toISOString();
}
