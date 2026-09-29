import { describe, it, expect } from 'vitest';
import { safeReturnTo } from '../deep-link';

describe('safeReturnTo', () => {
  it('keeps the in-app paths the app itself sets', () => {
    expect(safeReturnTo('/claim/abc123')).toBe('/claim/abc123');
    expect(safeReturnTo('/conversation/42')).toBe('/conversation/42');
    expect(safeReturnTo('/tournament/t1?tab=brackets')).toBe('/tournament/t1?tab=brackets');
    expect(safeReturnTo('/')).toBe('/');
  });

  it('refuses anything expo-router would open outside the app', () => {
    for (const bad of ['https://evil.example', 'http://evil.example', '//evil.example', 'mailto:a@b.c',
      'tel:123', 'javascript:alert(1)', 'pickleballapp://x', '/\\evil.example', 'tournament/t1', '']) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });

  it('refuses non-strings (array params)', () => {
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(['/claim/a'])).toBeNull();
  });
});
