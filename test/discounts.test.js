import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBookingPaymentMinor } from '../src/booking-dates.js';
import { calculateRentalDiscount, discountCodeStatus, fijiLocalDateTimeToUtc, normalizeCustomerEmail, normalizeDiscountCode } from '../src/discounts.js';

const rule = { id: 'long_rental', active: 1, threshold_days: 7, percentage: 10, max_discount_fjd_minor: 10000 };

test('automatic discount starts at seven Fiji billable days and caps at FJ$100', () => {
  const sixDays = calculateRentalDiscount({ dailyRateFjd: 300, days: 6, automaticRule: rule });
  assert.equal(sixDays.discountType, null);
  assert.equal(sixDays.finalTotalMinor, 180000);
  const sevenDays = calculateRentalDiscount({ dailyRateFjd: 300, days: 7, automaticRule: rule });
  assert.equal(sevenDays.discountAmountMinor, 10000);
  assert.equal(sevenDays.finalTotalMinor, 200000);
});

test('percentage discounts round to the nearest cent and never exceed subtotal', () => {
  const result = calculateRentalDiscount({ dailyRateFjd: 1, days: 1,
    automaticRule: rule, code: { id: 'code-id', discount_percent: 50 } });
  assert.equal(result.discountAmountMinor, 50);
  assert.equal(result.finalTotalMinor, 50);
  const free = calculateRentalDiscount({ dailyRateFjd: 120, days: 1,
    automaticRule: rule, code: { id: 'free-id', discount_percent: 100 } });
  assert.equal(free.discountAmountMinor, 12000);
  assert.equal(free.finalTotalMinor, 0);
  assert.deepEqual(calculateBookingPaymentMinor(0, 'deposit', 25), {
    paymentOption: 'deposit', depositPercentSnapshot: 25, rentalTotalFjd: 0,
    rentalTotalFjdMinor: 0, amountDueFjdMinor: 0, balanceDueFjdMinor: 0
  });
});

test('a code is rejected on qualifying long rentals and invalid configuration fails closed', () => {
  assert.throws(() => calculateRentalDiscount({ dailyRateFjd: 100, days: 7,
    automaticRule: rule, code: { id: 'x', discount_percent: 10 } }), /automatic long-rental discount/);
  assert.throws(() => calculateRentalDiscount({ dailyRateFjd: -1, days: 1, automaticRule: rule }), RangeError);
  assert.throws(() => calculateRentalDiscount({ dailyRateFjd: 1, days: 1, automaticRule: rule,
    code: { id: 'x', discount_percent: 101 } }), RangeError);
});

test('discount codes and customer emails are normalized consistently', () => {
  assert.equal(normalizeDiscountCode('  fiji_10 '), 'FIJI_10');
  assert.equal(normalizeDiscountCode('!bad'), null);
  assert.equal(normalizeCustomerEmail('  Guest@Example.test '), 'guest@example.test');
});

test('Fiji-local schedule conversion accepts valid unique times and rejects malformed input', () => {
  assert.equal(fijiLocalDateTimeToUtc('2027-06-01T12:30'), '2027-06-01T00:30:00.000Z');
  assert.equal(fijiLocalDateTimeToUtc('2027-02-30T12:30'), undefined);
  assert.equal(fijiLocalDateTimeToUtc('2027-06-01T12:30Z'), undefined);
  assert.equal(fijiLocalDateTimeToUtc('2010-10-24T02:30'), undefined);
  assert.equal(fijiLocalDateTimeToUtc('2011-03-06T02:30'), undefined);
});

test('code start is inclusive and expiry is exclusive at the configured UTC instant', () => {
  const code = { active: 1, starts_at: '2030-01-01T00:00:00.000Z', expires_at: '2030-02-01T00:00:00.000Z' };
  assert.equal(discountCodeStatus(code, '2029-12-31T23:59:59.999Z'), 'not_started');
  assert.equal(discountCodeStatus(code, '2030-01-01T00:00:00.000Z'), 'valid');
  assert.equal(discountCodeStatus(code, '2030-01-31T23:59:59.999Z'), 'valid');
  assert.equal(discountCodeStatus(code, '2030-02-01T00:00:00.000Z'), 'expired');
});

test('vehicle-specific automatic tiers apply only the highest qualifying tier', () => {
  const vehicleRule = {
    ...rule,
    vehicleOverride: true,
    vehicleOverrideActive: 1,
    tiers: [
      { id: 'tier-3', threshold_days: 3, percentage: 5, max_discount_fjd_minor: 100000, active: 1 },
      { id: 'tier-7', threshold_days: 7, percentage: 10, max_discount_fjd_minor: 100000, active: 1 },
      { id: 'tier-14', threshold_days: 14, percentage: 15, max_discount_fjd_minor: 100000, active: 1 }
    ]
  };
  assert.equal(calculateRentalDiscount({ dailyRateFjd: 100, days: 6, automaticRule: vehicleRule }).discountPercent, 5);
  assert.equal(calculateRentalDiscount({ dailyRateFjd: 100, days: 7, automaticRule: vehicleRule }).discountPercent, 10);
  const fourteen = calculateRentalDiscount({ dailyRateFjd: 100, days: 14, automaticRule: vehicleRule });
  assert.equal(fourteen.discountPercent, 15);
  assert.equal(fourteen.discountAmountMinor, 21000);
  assert.equal(fourteen.discountReference, 'vehicle-tier:14');
});

test('vehicle override replaces global automatic rules and allows codes when no tier qualifies', () => {
  const override = { ...rule, vehicleOverride: true, vehicleOverrideActive: 1,
    tiers: [{ id: 'tier-7', threshold_days: 7, percentage: 10, max_discount_fjd_minor: 10000, active: 1 }] };
  const shortRental = calculateRentalDiscount({ dailyRateFjd: 100, days: 3, automaticRule: override,
    code: { id: 'code-id', discount_percent: 20 } });
  assert.equal(shortRental.discountType, 'code');
  assert.equal(shortRental.discountAmountMinor, 6000);
  const disabledOverride = { ...override, vehicleOverrideActive: 0 };
  assert.equal(calculateRentalDiscount({ dailyRateFjd: 100, days: 7, automaticRule: disabledOverride }).discountType, null);
});
