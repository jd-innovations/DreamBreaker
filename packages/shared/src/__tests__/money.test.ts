import { describe, it, expect } from 'vitest';
import { formatCents, dollarsFromCents } from '../money';

describe('formatCents', () => {
  it('renders exact cents by default', () => {
    expect(formatCents(2499)).toBe('$24.99');
    expect(formatCents(2500)).toBe('$25.00');
    expect(formatCents(1)).toBe('$0.01');
    expect(formatCents(0)).toBe('$0.00');
  });

  // The regression this module exists to prevent. Three of the twelve
  // formatters it replaces rendered 2499 as "$25".
  it('never rounds real cents away, even when asked to be compact', () => {
    expect(formatCents(2499, { omitZeroCents: true })).toBe('$24.99');
    expect(formatCents(24999, { omitZeroCents: true })).toBe('$249.99');
    expect(formatCents(1, { omitZeroCents: true })).toBe('$0.01');
  });

  it('drops .00 only when the cents really are zero', () => {
    expect(formatCents(2500, { omitZeroCents: true })).toBe('$25');
    expect(formatCents(0, { omitZeroCents: true })).toBe('$0');
  });

  it('groups thousands', () => {
    expect(formatCents(123456789)).toBe('$1,234,567.89');
    expect(formatCents(100000, { omitZeroCents: true })).toBe('$1,000');
  });

  // Refunds and adjustments. No previous formatter handled these at all.
  it('handles negatives', () => {
    expect(formatCents(-2499)).toBe('-$24.99');
    expect(formatCents(-2500, { omitZeroCents: true })).toBe('-$25');
  });

  it('treats null, undefined and NaN as the fallback', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
    expect(formatCents(Number.NaN)).toBe('—');
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCents(null, { fallback: 'Pricing unavailable' })).toBe('Pricing unavailable');
  });

  it('respects the currency instead of hard-coding a dollar sign', () => {
    expect(formatCents(2499, { currency: 'EUR' })).toBe('€24.99');
    expect(formatCents(2499, { currency: 'gbp' })).toBe('£24.99');
    // Zero-decimal currency: Intl knows JPY has no minor unit.
    expect(formatCents(2499, { currency: 'JPY' })).toContain('24.99');
  });

  it('treats a missing or blank currency as USD', () => {
    expect(formatCents(2499, { currency: null })).toBe('$24.99');
    expect(formatCents(2499, { currency: '' })).toBe('$24.99');
    expect(formatCents(2499, { currency: '  ' })).toBe('$24.99');
  });

  it('degrades rather than throwing on a bad currency code', () => {
    const out = formatCents(2499, { currency: 'NOTACODE' });
    expect(out).toContain('24.99');
    // The code stays visible so the number is never mislabelled as dollars.
    expect(out).toContain('NOTACODE');
  });
});

describe('dollarsFromCents', () => {
  it('truncates so it can never read higher than the real price', () => {
    expect(dollarsFromCents(2499)).toBe(24);
    expect(dollarsFromCents(2500)).toBe(25);
    expect(dollarsFromCents(99)).toBe(0);
  });
});
