import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { getPref, setPref } from '@/lib/localPrefs';
import { supabase } from '@/lib/supabase';

// Location & discovery preferences. Source of truth is the Supabase
// `location_settings` table (per-user, owner-only RLS), with a SecureStore
// cache for instant paint and offline resilience. Auto-saved on every change
// so the screen's "changes are saved automatically" promise holds.
export type LocationSettings = {
  tournamentRadius: string;
  communityRadius: string;
  partnerRadius: string;
  marketplaceRadius: string;
  willingToShip: boolean;
  localEvents: boolean;
  regionalEvents: boolean;
  majorEvents: boolean;
  nationalEvents: boolean;
  showCity: boolean;
  showExactLocation: boolean;
  allowDistanceMatch: boolean;
};

export const DEFAULT_LOCATION_SETTINGS: LocationSettings = {
  tournamentRadius: '50 mi',
  communityRadius: '25 mi',
  partnerRadius: '50 mi',
  marketplaceRadius: '50 mi',
  willingToShip: true,
  localEvents: true,
  regionalEvents: true,
  majorEvents: true,
  nationalEvents: false,
  showCity: true,
  showExactLocation: false,
  allowDistanceMatch: true,
};

type LocationSettingsRow = {
  user_id: string;
  tournament_radius: string;
  community_radius: string;
  partner_radius: string;
  marketplace_radius: string;
  willing_to_ship: boolean;
  local_events: boolean;
  regional_events: boolean;
  major_events: boolean;
  national_events: boolean;
  show_city: boolean;
  show_exact_location: boolean;
  allow_distance_matching: boolean;
};

function fromRow(r: LocationSettingsRow): LocationSettings {
  return {
    tournamentRadius: r.tournament_radius,
    communityRadius: r.community_radius,
    partnerRadius: r.partner_radius,
    marketplaceRadius: r.marketplace_radius,
    willingToShip: r.willing_to_ship,
    localEvents: r.local_events,
    regionalEvents: r.regional_events,
    majorEvents: r.major_events,
    nationalEvents: r.national_events,
    showCity: r.show_city,
    showExactLocation: r.show_exact_location,
    allowDistanceMatch: r.allow_distance_matching,
  };
}

function toRow(userId: string, s: LocationSettings): LocationSettingsRow {
  return {
    user_id: userId,
    tournament_radius: s.tournamentRadius,
    community_radius: s.communityRadius,
    partner_radius: s.partnerRadius,
    marketplace_radius: s.marketplaceRadius,
    willing_to_ship: s.willingToShip,
    local_events: s.localEvents,
    regional_events: s.regionalEvents,
    major_events: s.majorEvents,
    national_events: s.nationalEvents,
    show_city: s.showCity,
    show_exact_location: s.showExactLocation,
    allow_distance_matching: s.allowDistanceMatch,
  };
}

export function useLocationSettings() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const storageKey = `location_settings_${userId ?? 'guest'}`;
  const [settings, setSettings] = useState<LocationSettings>(DEFAULT_LOCATION_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  // Gate saves until the initial load resolves so an early toggle can't be
  // clobbered by (or clobber) the loaded value.
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    setLoaded(false);

    (async () => {
      // 1. Instant paint from the local cache.
      const cached = await getPref(storageKey);
      if (!cancelled && cached) {
        try {
          setSettings({ ...DEFAULT_LOCATION_SETTINGS, ...JSON.parse(cached) });
        } catch {
          // Corrupt/old value — keep defaults.
        }
      }

      // 2. Source of truth: Supabase (when signed in). Degrades gracefully to
      // the cache/defaults if the row is absent, offline, or the table is
      // missing (migration not yet pushed).
      if (userId) {
        try {
          const { data, error } = await supabase
            .from('location_settings')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
          if (!cancelled && !error && data) {
            const next = fromRow(data);
            setSettings(next);
            setPref(storageKey, JSON.stringify(next)).catch(() => {});
          }
        } catch {
          // Network/table error — the cached/default state already stands.
        }
      }

      if (!cancelled) {
        loadedRef.current = true;
        setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [storageKey, userId]);

  const update = useCallback(
    (patch: Partial<LocationSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (loadedRef.current) {
          // Write-through: local cache (always) + Supabase (when signed in).
          setPref(storageKey, JSON.stringify(next)).catch(() => {});
          if (userId) {
            supabase
              .from('location_settings')
              .upsert(toRow(userId, next))
              .then((res) => {
                if (res.error) console.warn('[location_settings] save failed:', res.error);
              });
          }
        }
        return next;
      });
    },
    [storageKey, userId],
  );

  return { settings, update, loaded };
}
