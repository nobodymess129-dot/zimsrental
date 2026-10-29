import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  addCalendarDays,
  calendarDaysBetween,
  fijiCurrentDate,
  fijiLocalDateTimeToIso
} from '../public/assets/booking-date-time.js';
import {
  BOOKING_OVERLAP_RANGE_SQL,
  normalizeBookingDateRange
} from '../src/booking-dates.js';

function findOverlap(bookedPickup, bookedReturn, requestedPickup, requestedReturn) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE bookings (id TEXT, pickup_at TEXT, return_at TEXT)');
    db.prepare('INSERT INTO bookings (id, pickup_at, return_at) VALUES (?, ?, ?)')
      .run('existing', bookedPickup, bookedReturn);
    return db.prepare('SELECT id FROM bookings WHERE ' + BOOKING_OVERLAP_RANGE_SQL)
      .get(requestedReturn, requestedPickup)?.id ?? null;
  } finally {
    db.close();
  }
}

test('normalizes UTC timestamps without changing their instant', () => {
  assert.deepEqual(
    normalizeBookingDateRange(
      '2097-04-10T00:00:00.000Z',
      '2097-04-11T00:00:00.000Z'
    ),
    {
      pickupAt: '2097-04-10T00:00:00.000Z',
      returnAt: '2097-04-11T00:00:00.000Z',
      days: 1
    }
  );
});

test('normalizes explicit timezone offsets to the same UTC interval', () => {
  assert.deepEqual(
    normalizeBookingDateRange(
      '2097-04-11T01:00:00+02:00',
      '2097-04-11T03:00:00+02:00'
    ),
    {
      pickupAt: '2097-04-10T23:00:00.000Z',
      returnAt: '2097-04-11T01:00:00.000Z',
      days: 1
    }
  );
});

test('interprets date-only inputs as UTC midnight', () => {
  assert.deepEqual(
    normalizeBookingDateRange('2097-05-01', '2097-05-02'),
    {
      pickupAt: '2097-05-01T00:00:00.000Z',
      returnAt: '2097-05-02T00:00:00.000Z',
      days: 1
    }
  );
});

test('rejects invalid, ambiguous, and non-positive date ranges', () => {
  assert.equal(normalizeBookingDateRange('not-a-date', '2097-05-02T00:00:00Z'), null);
  assert.equal(normalizeBookingDateRange('2097-02-30', '2097-03-02'), null);
  assert.equal(normalizeBookingDateRange('2097-05-01T09:00:00', '2097-05-01T10:00:00'), null);
  assert.equal(normalizeBookingDateRange('2097-05-01T10:00:00Z', '2097-05-01T09:00:00Z'), null);
});

test('accepts positive same-day rentals and bills at least one day', () => {
  const range = normalizeBookingDateRange(
    '2097-05-03T09:00:00Z',
    '2097-05-03T12:00:00Z'
  );
  assert.ok(range);
  assert.equal(range.days, 1);
});

test('bills one day for a same-day Fiji rental under 24 hours', () => {
  const pickup = fijiLocalDateTimeToIso('2031-01-10', '09:00');
  const ret = fijiLocalDateTimeToIso('2031-01-10', '18:00');
  assert.equal(normalizeBookingDateRange(pickup, ret).days, 1);
});

test('bills by Fiji calendar dates when a rental crosses one date boundary over 24 hours', () => {
  const pickup = fijiLocalDateTimeToIso('2031-01-10', '10:00');
  const ret = fijiLocalDateTimeToIso('2031-01-11', '11:00');
  assert.equal(Date.parse(ret) - Date.parse(pickup), 25 * 60 * 60 * 1000);
  assert.equal(normalizeBookingDateRange(pickup, ret).days, 1);
});

test('bills two days when a rental spans two Fiji date boundaries over 24 hours', () => {
  const pickup = fijiLocalDateTimeToIso('2031-01-10', '23:30');
  const ret = fijiLocalDateTimeToIso('2031-01-12', '00:30');
  assert.equal(Date.parse(ret) - Date.parse(pickup), 25 * 60 * 60 * 1000);
  assert.equal(normalizeBookingDateRange(pickup, ret).days, 2);
});

test('equivalent Z and explicit-offset instants use the same Fiji calendar duration', () => {
  const fromZ = normalizeBookingDateRange(
    '2031-01-09T22:00:00.000Z',
    '2031-01-10T23:00:00.000Z'
  );
  const fromOffset = normalizeBookingDateRange(
    '2031-01-10T00:00:00+02:00',
    '2031-01-11T01:00:00+02:00'
  );
  assert.deepEqual(fromOffset, fromZ);
  assert.equal(fromZ.days, 1);
});

test('SQLite overlap predicate detects an offset-form interval overlapping UTC booking', () => {
  assert.deepEqual(
    findOverlap(
      '2097-04-10T00:00:00.000Z',
      '2097-04-11T00:00:00.000Z',
      '2097-04-11T01:00:00+02:00',
      '2097-04-11T03:00:00+02:00'
    ),
    'existing'
  );
});

test('SQLite overlap predicate preserves exclusive end boundaries', () => {
  assert.equal(
    findOverlap(
      '2097-04-10T00:00:00.000Z',
      '2097-04-11T00:00:00.000Z',
      '2097-04-11T00:00:00Z',
      '2097-04-11T02:00:00+02:00'
    ),
    null
  );
});

test('SQLite overlap predicate handles existing offset and date-only rows', () => {
  assert.deepEqual(
    findOverlap(
      '2097-04-11T01:00:00+02:00',
      '2097-04-11T03:00:00+02:00',
      '2097-04-10T23:30:00.000Z',
      '2097-04-11T00:30:00.000Z'
    ),
    'existing'
  );
  assert.deepEqual(
    findOverlap(
      '2097-05-01',
      '2097-05-02',
      '2097-05-01T12:00:00Z',
      '2097-05-01T18:00:00Z'
    ),
    'existing'
  );
});

test('Fiji current date and calendar-day calculations ignore visitor timezone', () => {
  const oldTimezone = process.env.TZ;
  try {
    const instant = new Date('2031-01-10T23:30:00.000Z');
    process.env.TZ = 'UTC';
    const utcMachineDate = fijiCurrentDate(instant);
    process.env.TZ = 'America/Los_Angeles';
    const losAngelesMachineDate = fijiCurrentDate(instant);
    assert.equal(utcMachineDate, '2031-01-11');
    assert.equal(losAngelesMachineDate, utcMachineDate);
    assert.equal(addCalendarDays('2031-12-31', 1), '2032-01-01');
    assert.equal(calendarDaysBetween('2031-03-08', '2031-03-10'), 2);
    assert.equal(calendarDaysBetween('invalid', '2031-03-10'), null);
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
  }
});
test('Fiji local times resolve independently of the visitor timezone', () => {
  const oldTimezone = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const fromUtcBrowser = fijiLocalDateTimeToIso('2031-01-10', '09:00');
    process.env.TZ = 'America/Los_Angeles';
    const fromLosAngelesBrowser = fijiLocalDateTimeToIso('2031-01-10', '09:00');
    assert.equal(fromUtcBrowser, '2031-01-09T21:00:00.000Z');
    assert.equal(fromLosAngelesBrowser, fromUtcBrowser);
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
  }
});

test('Fiji local conversion rejects invalid dates, times, and DST gaps', () => {
  assert.equal(fijiLocalDateTimeToIso('2031-02-30', '09:00'), null);
  assert.equal(fijiLocalDateTimeToIso('2031-01-10', '24:00'), null);
  assert.equal(fijiLocalDateTimeToIso('2020-12-20', '02:30'), null);
  assert.equal(fijiLocalDateTimeToIso('2021-01-17', '02:30'), null);
});
