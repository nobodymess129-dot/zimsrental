/**
 * API dates are YYYY-MM-DD (interpreted as UTC midnight) or ISO 8601
 * date-times with an explicit Z/UTC offset. Normalize both to UTC so stored
 * booking times have one stable representation.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONED_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/i;
const FIJI_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Pacific/Fiji',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function fijiCalendarDayNumber(instant) {
  const parts = Object.fromEntries(
    FIJI_DATE_FORMATTER.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  return date.getTime() / 86400000;
}

function validCalendarDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}

function parseApiDate(value) {
  if (typeof value !== 'string') return null;

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    if (!validCalendarDate(year, month, day)) return null;
  } else {
    const parts = ZONED_DATE_TIME.exec(value);
    if (!parts) return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, , offsetHourText, offsetMinuteText] = parts;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = secondText === undefined ? 0 : Number(secondText);
    if (!validCalendarDate(year, month, day)
      || hour > 23
      || minute > 59
      || second > 59) return null;

    if (zone !== 'Z' && zone !== 'z') {
      const offsetHour = Number(offsetHourText);
      const offsetMinute = Number(offsetMinuteText);
      if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
    }
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function normalizeBookingDateRange(pickupInput, returnInput) {
  const pickupMs = parseApiDate(pickupInput);
  const returnMs = parseApiDate(returnInput);
  if (pickupMs === null || returnMs === null || returnMs <= pickupMs) return null;

  return {
    pickupAt: new Date(pickupMs).toISOString(),
    returnAt: new Date(returnMs).toISOString(),
    days: Math.max(1, fijiCalendarDayNumber(returnMs) - fijiCalendarDayNumber(pickupMs))
  };
}

// Keep the half-open rental interval comparison in one predicate for all
// Worker overlap checks and the in-memory SQLite regression tests.
export const BOOKING_OVERLAP_RANGE_SQL =
  'julianday(pickup_at) < julianday(?) AND julianday(return_at) > julianday(?)';

// Money due and balance are stored as integer FJD cents.
export function calculateBookingPayment(totalFjd, paymentOption, depositPercent) {
  if (!Number.isSafeInteger(totalFjd) || totalFjd < 0) throw new RangeError('Invalid rental total.');
  if (!['full', 'deposit', 'arrival'].includes(paymentOption)) throw new RangeError('Invalid payment option.');
  if (depositPercent !== null && depositPercent !== undefined
    && (!Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent > 100)) {
    throw new RangeError('Deposit percentage must be greater than 0 and no more than 100.');
  }
  if (paymentOption === 'deposit' && depositPercent == null) throw new RangeError('A deposit is not configured for this vehicle.');
  const totalMinor = totalFjd * 100;
  if (!Number.isSafeInteger(totalMinor)) throw new RangeError('Rental total is too large.');
  const dueMinor = paymentOption === 'full' ? totalMinor : Math.round(totalMinor * depositPercent / 100);
  return { paymentOption, depositPercentSnapshot: depositPercent ?? null, rentalTotalFjd: totalFjd, amountDueFjdMinor: dueMinor, balanceDueFjdMinor: totalMinor - dueMinor };
}

// Discounted totals are already integer FJD minor units; keep every subsequent
// payment calculation in cents to avoid repeating a dollar conversion.
export function calculateBookingPaymentMinor(totalMinor, paymentOption, depositPercent) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new RangeError('Invalid rental total.');
  if (!['full', 'deposit', 'arrival'].includes(paymentOption)) throw new RangeError('Invalid payment option.');
  if (depositPercent !== null && depositPercent !== undefined
    && (!Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent > 100)) {
    throw new RangeError('Deposit percentage must be greater than 0 and no more than 100.');
  }
  if (paymentOption === 'deposit' && depositPercent == null) throw new RangeError('A deposit is not configured for this vehicle.');
  let dueMinor = totalMinor;
  if (paymentOption === 'arrival') { dueMinor = 0; }
  if (paymentOption === 'deposit') {
    const percentText = String(depositPercent);
    if (!/^\d{1,3}(?:\.\d{1,12})?$/.test(percentText)) throw new RangeError('Deposit percentage precision is invalid.');
    const [whole, fraction = ''] = percentText.split('.');
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(whole + fraction) * BigInt(totalMinor);
    dueMinor = Number((numerator + denominator * 50n) / (denominator * 100n));
  }
  return { paymentOption, depositPercentSnapshot: depositPercent ?? null,
    rentalTotalFjd: totalMinor / 100, rentalTotalFjdMinor: totalMinor,
    amountDueFjdMinor: dueMinor, balanceDueFjdMinor: totalMinor - dueMinor };
}
