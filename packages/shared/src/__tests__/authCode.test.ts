import { describe, expect, it } from 'vitest';
import { codeErrorMessage, isCompleteCode, normalizeCode } from '../authCode';

describe('normalizeCode', () => {
  it('keeps digits only and caps the length', () => {
    expect(normalizeCode('482 913')).toBe('482913');
    expect(normalizeCode('48-29-13')).toBe('482913');
    expect(normalizeCode('12345678901234')).toBe('1234567890');
  });
});

describe('isCompleteCode', () => {
  it('accepts every length Supabase can send', () => {
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('1234567890')).toBe(true);
  });
});

describe('codeErrorMessage', () => {
  it('is null on success', () => {
    expect(codeErrorMessage(null)).toBeNull();
  });
  it('gives wrong and expired codes the same message', () => {
    expect(codeErrorMessage({ code: 'otp_expired' })).toBe(codeErrorMessage({ code: 'invalid_credentials' }));
  });
  it('explains rate limiting', () => {
    expect(codeErrorMessage({ status: 429 })).toMatch(/too many/i);
  });
});
