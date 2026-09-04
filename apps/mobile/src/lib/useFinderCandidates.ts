import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { playStyleSummary } from '@shared/play-profile';
import { computeMatch } from './computeMatch';
import { useCurrentLocation, type Coordinates } from './location';
import { useLocationSettings } from '@/hooks/useLocationSettings';

export type FinderCandidate = {
  id: string;
  name: string;
  dupr: number;
  location: string;
  // Miles from the viewer to this candidate, or null when either side has no
  // known coordinates (or location permission was denied).
  distance: number | null;
  lookingFor: string;
  skillRange: string;
  tags1: { icon: string; label: string }[];
  bio: string;
  photos: string[];
  compatibility: number;
  // Source of the `dupr` number above: a verified DUPR, the player's own
  // self-rating, or no rating at all. Drives the card's rating label.
  ratingType: 'dupr' | 'self' | 'none';
};

type ProfileRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  bio: string | null;
  location_city: string | null;
  location_state: string | null;
  location_lat: number | null;
  location_lng: number | null;
  dupr: number | null;
  self_rating: string | null;
  skill_level: string | null;
  hand: string | null;
  // text[] since the 2026-08-27 migration, NOT text. This type said `string`
  // until 2026-08-31 and that is precisely what hid the crash below from the
  // compiler.
  play_style: string[] | null;
  availability: string | null;
  looking_status: string;
  date_of_birth: string | null;
};

type Mine = { dupr: number | null; availability: string | null };

// Turns raw enum-ish DB values into display text: "actively_looking" →
// "Actively Looking", "right" → "Right". Replaces underscores with spaces and
// title-cases each word. Leaves digits/hyphens intact so skill ranges like
// "4.0-4.5" survive unchanged.
/**
 * Turns a snake_case enum value into a label.
 *
 * Guards its input type. It used to declare `string` and call .replace()
 * immediately, so passing an array crashed the app during render — see the
 * play_style note above. A formatter has no business being the thing that
 * takes the process down, so anything that is not a string returns '' now.
 */
function humanize(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  return value.replace(/_+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// Great-circle distance in miles between two lat/lng points.
function haversineMiles(from: Coordinates, to: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

// Parses a radius label like "25 mi" → 25. Non-numeric options ("Statewide",
// "Unlimited") mean "no distance cap" → Infinity.
function parseRadiusMiles(label: string): number {
  const n = parseFloat(label);
  return Number.isFinite(n) ? n : Infinity;
}

function mapProfile(row: ProfileRow, mine: Mine, distance: number | null): FinderCandidate {
  // Prefer a verified DUPR; fall back to the player's self-rating. Track which
  // one we used so the card doesn't mislabel a self-rating as a DUPR.
  const selfNum = row.self_rating ? parseFloat(row.self_rating) : NaN;
  const ratingType: 'dupr' | 'self' | 'none' =
    row.dupr != null ? 'dupr' : Number.isFinite(selfNum) ? 'self' : 'none';
  const duprNum = row.dupr != null ? row.dupr : Number.isFinite(selfNum) ? selfNum : 0;

  const location =
    [row.location_city, row.location_state].filter(Boolean).join(', ') ||
    'Location unknown';

  const photos = row.avatar_url ? [row.avatar_url] : [];

  const tags1: { icon: string; label: string }[] = [];
  if (row.hand) tags1.push({ icon: 'hand-left-outline', label: humanize(row.hand) });
  // playStyleSummary, not humanize. play_style is a text[] of CHECK-constrained
  // keys, and every other screen already formats it this way — this file was
  // missed when 7177bee swept the rest, and calling .replace() on an array is
  // what produced "TypeError: undefined is not a function" during render.
  const styleSummary = playStyleSummary(row.play_style);
  if (styleSummary) tags1.push({ icon: 'heart-outline', label: styleSummary });
  if (row.availability) tags1.push({ icon: 'calendar-outline', label: humanize(row.availability) });

  const { pct } = computeMatch({ dupr: duprNum || null, availability: row.availability }, mine);

  return {
    id: row.id,
    name: row.full_name,
    dupr: duprNum,
    location,
    distance,
    lookingFor: humanize(row.looking_status) || 'Partner',
    skillRange: row.skill_level || '',
    tags1,
    bio: row.bio || '',
    photos,
    compatibility: pct,
    ratingType,
  };
}

// Parses a skill-range label like '4.0–4.5' or '5.0+' (as saved by
// match/preferences.tsx) into an inclusive [min, max] bound.
function parseSkillRange(label: string): [number, number] {
  if (label.endsWith('+')) {
    return [parseFloat(label), Infinity];
  }
  const [lo, hi] = label.split(/[–-]/).map(parseFloat);
  return [lo, Number.isFinite(hi) ? hi : Infinity];
}

export type UseFinderCandidatesOptions = {
  /**
   * Overrides the viewer coordinates used for distance/radius filtering.
   * When omitted, falls back to the current device GPS position (existing
   * behavior, unchanged for every pre-existing call site). Pass this to
   * search "near a facility" instead of "near me" -- see
   * useFacilityFinderCandidates.ts.
   */
  origin?: Coordinates;
};

export function useFinderCandidates(opts?: UseFinderCandidatesOptions) {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [mine, setMine] = useState<Mine>({ dupr: null, availability: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const location = useCurrentLocation();
  const { settings } = useLocationSettings();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [{ data, error: err }, { data: myPrefs }, { data: myProfile }] = await Promise.all([
        supabase
          .from('profiles')
          .select(
            'id, full_name, avatar_url, bio, location_city, location_state, location_lat, location_lng, dupr, self_rating, skill_level, hand, play_style, availability, looking_status, date_of_birth'
          )
          .eq('is_discoverable', true)
          .neq('id', user?.id ?? '')
          .order('updated_at', { ascending: false })
          .limit(50),
        user?.id
          ? supabase.from('partner_preferences').select('skill_ranges').eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user?.id
          ? supabase.from('profiles').select('dupr, self_rating, availability').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const mineNext: Mine = {
        dupr: myProfile?.dupr ?? (myProfile?.self_rating ? parseFloat(myProfile.self_rating) : null),
        availability: myProfile?.availability ?? null,
      };

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      let candidateRows = (data ?? []) as ProfileRow[];

      // Only candidates who are still actively looking (defaults to true when
      // a candidate has never set preferences, per the partner_preferences
      // schema default).
      if (candidateRows.length > 0) {
        const { data: candidatePrefs } = await supabase
          .from('partner_preferences')
          .select('user_id, actively_looking')
          .in('user_id', candidateRows.map((r) => r.id));
        const notLooking = new Set(
          (candidatePrefs ?? []).filter((p) => !p.actively_looking).map((p) => p.user_id)
        );
        candidateRows = candidateRows.filter((r) => !notLooking.has(r.id));
      }

      // Skill-range filter from the caller's own saved preferences. Other
      // preference dimensions (game_types, days/times, gender) are not applied
      // here — profiles has no comparable field to filter on yet. Distance is
      // applied reactively below (it depends on live GPS + the saved radius).
      const skillRanges = myPrefs?.skill_ranges as string[] | undefined;
      if (skillRanges && skillRanges.length > 0) {
        const bounds = skillRanges.map(parseSkillRange);
        candidateRows = candidateRows.filter((r) => {
          const dupr = r.dupr ?? (r.self_rating ? parseFloat(r.self_rating) : null);
          if (dupr == null) return true; // don't hide candidates with no rating yet
          return bounds.some(([lo, hi]) => dupr >= lo && dupr <= hi);
        });
      }

      setRows(candidateRows);
      setMine(mineNext);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Viewer coordinates — an explicit origin (e.g. a facility's location)
  // wins; otherwise only trusted when we have a real GPS fix (not the
  // fallback location), so we never hide people based on a guessed position.
  const myCoords: Coordinates | null =
    opts?.origin ?? (!location.isFallback && !location.loading ? { lat: location.lat, lng: location.lng } : null);
  const radiusMiles = parseRadiusMiles(settings.partnerRadius);

  const candidates = useMemo(() => {
    return rows
      .map((row) => {
        const hasCoords = row.location_lat != null && row.location_lng != null;
        const distance =
          myCoords && hasCoords
            ? Math.round(haversineMiles(myCoords, { lat: row.location_lat!, lng: row.location_lng! }))
            : null;
        return { row, distance };
      })
      // Apply the radius cap only when we can actually measure the distance and
      // the radius is finite. Candidates with unknown coordinates are kept
      // rather than silently hidden on missing data.
      .filter(({ distance }) => distance == null || !Number.isFinite(radiusMiles) || distance <= radiusMiles)
      .map(({ row, distance }) => mapProfile(row, mine, distance));
  }, [rows, mine, myCoords?.lat, myCoords?.lng, radiusMiles]);

  return { candidates, loading, error };
}
