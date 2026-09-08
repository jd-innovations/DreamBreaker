import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Kill switch for the floating support launcher (SUPPORT_EXPERIENCE_ARCHITECTURE.md
// §22). Reuses the existing `platform_settings` key-value table -- it already
// has admin read/write RLS and a live editor in the web admin dashboard, so a
// dedicated feature_flags table would just duplicate it for one boolean.
const SUPPORT_FLOATING_BUTTON_FLAG_KEY = 'support_floating_button_enabled';

/** Reads the support-launcher kill switch once on mount. Defaults to disabled while loading or on error. */
export function useSupportFloatingButtonEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('platform_settings')
      .select('value')
      .eq('key', SUPPORT_FLOATING_BUTTON_FLAG_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setEnabled(data?.value === 'true');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
