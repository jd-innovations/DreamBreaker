import { describe, expect, it } from 'vitest';
import { listingTip, type ListingInsight } from '../listingTip';

const base: ListingInsight = {
  kind: 'generic', saves: 0, conversations: 0, comp_count: 0,
  comp_low_cents: null, comp_high_cents: null, comp_median_cents: null,
  asking_cents: 14000, suggested_cents: 12500,
};

describe('listingTip', () => {
  it('points conversations at messages', () => {
    const t = listingTip({ ...base, kind: 'conversations', conversations: 3 }, 'Franklin', 'FS Tempo 16');
    expect(t.action).toBe('messages');
    expect(t.text).toMatch(/3 conversations/);
  });
  it('tells savers will be notified, singular and plural', () => {
    expect(listingTip({ ...base, kind: 'saved', saves: 1 }, 'a', 'b').text).toMatch(/notify them/);
    expect(listingTip({ ...base, kind: 'saved', saves: 4 }, 'a', 'b').text).toMatch(/notify all 4/);
  });
  it('shows the comparable range only when priced above it', () => {
    const over = listingTip({ ...base, kind: 'priced', comp_count: 5, comp_low_cents: 9500, comp_high_cents: 12000 }, 'Franklin', 'FS Tempo 16');
    expect(over.text).toMatch(/list for \$95–\$120 \(yours is \$140\)/);
    expect(over.action).toBe('price');
    const inLine = listingTip({ ...base, kind: 'priced', asking_cents: 11000, comp_count: 5, comp_low_cents: 9500, comp_high_cents: 12000 }, 'Franklin', 'FS Tempo 16');
    expect(inLine.action).toBe('edit');
    expect(inLine.text).toMatch(/in line/);
  });
  it('falls back without comparables', () => {
    expect(listingTip(base, 'a', 'b').action).toBe('price');
  });
});
