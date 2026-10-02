import { describe, expect, it } from 'vitest';
import { looksLikeEmail, resendErrorMessage } from '../authResend';

describe('resendErrorMessage', () => {
  it('is null on success', () => {
    expect(resendErrorMessage(null)).toBeNull();
  });
  it('explains the rate limit instead of showing a server error', () => {
    expect(resendErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/wait a minute/i);
    expect(resendErrorMessage({ status: 429 })).toMatch(/wait a minute/i);
  });
  it('asks for a valid email on a validation error', () => {
    expect(resendErrorMessage({ code: 'validation_failed' })).toMatch(/valid email/i);
  });
  it('never says whether the account exists', () => {
    expect(resendErrorMessage({ code: 'user_not_found' })).not.toMatch(/account|exist|found/i);
  });
});

describe('looksLikeEmail', () => {
  it('accepts plus addresses and rejects junk', () => {
    expect(looksLikeEmail('dhjesus122+tyler@gmail.com')).toBe(true);
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    expect(looksLikeEmail('tyler')).toBe(false);
    expect(looksLikeEmail('a@b')).toBe(false);
  });
});
