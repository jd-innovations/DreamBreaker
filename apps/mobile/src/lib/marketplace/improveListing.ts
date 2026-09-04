import { supabase } from '@/lib/supabase';
import type { MarketplaceCondition } from './constants';

export type ImproveListingResult =
  | { available: true; description: string; warnings: string[] }
  | { available: false; reason: 'upstream_error' | 'not_configured' };

// ✨ Improve Listing — keeps the LLM key server-side (event-weather is the
// existing precedent for this invoke pattern). Never blocks publish: any
// failure just means the button had no effect, the seller's draft is untouched.
export async function improveListing(params: {
  brand: string;
  model: string;
  condition: MarketplaceCondition;
  description: string;
}): Promise<ImproveListingResult> {
  const { data, error } = await supabase.functions.invoke('marketplace-improve-listing', {
    body: params,
  });
  if (error || !data) return { available: false, reason: 'upstream_error' };
  return data as ImproveListingResult;
}
