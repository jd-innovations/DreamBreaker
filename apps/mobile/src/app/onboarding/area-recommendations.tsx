import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/theme';
import { OnboardingCTA, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useOnboarding } from '@/lib/onboarding/state';
import { supabase } from '@/lib/supabase';
import { fetchFacilities, type FacilityWithPrimaryPhoto } from '@/lib/supabase/facilities';
import { fetchNearbyPlayEvents } from '@/lib/supabase/playEvents';
import { fetchTournaments } from '@/lib/supabase/tournaments';

const L = colors;
const SCREEN_BG = '#F8F5EF';
const RADIUS_MILES = 25;

type IpEstimate = {
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
};

type AreaStats = {
  players: number | null;
  courts: number | null;
  gamesThisWeek: number | null;
  tournamentsOpen: number | null;
};

const FALLBACK_AREA: IpEstimate = {
  city: 'Lakewood Ranch',
  state: 'FL',
  lat: 27.3864,
  lng: -82.4346,
};

export default function AreaRecommendationsScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const [area, setArea] = useState<IpEstimate>({
    city: draft.estimatedCity,
    state: draft.estimatedState,
    lat: draft.estimatedLat,
    lng: draft.estimatedLng,
  });
  const [stats, setStats] = useState<AreaStats>({ players: null, courts: null, gamesThisWeek: null, tournamentsOpen: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const estimated = await estimateFromIp();
      if (cancelled) return;

      setArea(estimated);
      update('estimatedCity', estimated.city);
      update('estimatedState', estimated.state);
      update('estimatedLat', estimated.lat);
      update('estimatedLng', estimated.lng);

      const nextStats = await loadAreaStats(estimated);
      if (!cancelled) {
        setStats(nextStats);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [update]);

  const areaLabel = useMemo(() => {
    if (area.city && area.state) return `${area.city}, ${area.state}`;
    if (area.city) return area.city;
    return 'your area';
  }, [area.city, area.state]);

  function next() {
    router.push('/onboarding/select-home-court');
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} activeOpacity={0.7} onPress={next}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.titleBlock}>
          <Text style={s.locationLine}>{"You're near"}</Text>
          <Text style={s.areaTitle}>{areaLabel}</Text>
          <Text style={s.subtitle}>{"We'll use this area to personalize your experience."}</Text>
        </View>

        <View style={s.statsCard}>
          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color={L.gold} />
              <Text style={s.loadingText}>Finding courts near you...</Text>
            </View>
          ) : (
            <>
              <InfoRow icon="map-marker-outline" text={areaLabel} emphasized />
              <InfoRow icon="account-group-outline" text={`${formatStat(stats.players)} players`} />
              <InfoRow icon="view-grid-outline" text={`${formatStat(stats.courts)} courts`} />
              <InfoRow icon="tennis-ball" text={`${formatStat(stats.gamesThisWeek)} games this week`} />
              <InfoRow icon="trophy-outline" text={`${formatStat(stats.tournamentsOpen)} tournaments open`} />
            </>
          )}
        </View>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingProgressBar progress={36} />
        <OnboardingCTA label="Continue" onPress={next} />
      </View>
    </View>
  );
}

async function estimateFromIp(): Promise<IpEstimate> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('ip_lookup_failed');
    const row = await response.json() as {
      city?: string;
      region_code?: string;
      region?: string;
      latitude?: number;
      longitude?: number;
    };
    return {
      city: row.city ?? FALLBACK_AREA.city,
      state: row.region_code ?? row.region ?? FALLBACK_AREA.state,
      lat: typeof row.latitude === 'number' ? row.latitude : FALLBACK_AREA.lat,
      lng: typeof row.longitude === 'number' ? row.longitude : FALLBACK_AREA.lng,
    };
  } catch {
    return FALLBACK_AREA;
  }
}

async function loadAreaStats(area: IpEstimate): Promise<AreaStats> {
  const [facilities, players, gamesThisWeek, tournamentsOpen] = await Promise.all([
    loadFacilities(area),
    loadPlayerCount(area),
    loadGamesThisWeek(area),
    loadOpenTournamentCount(area),
  ]);

  return {
    players,
    courts: facilities.reduce((sum, f) => sum + (f.court_count ?? 0), 0),
    gamesThisWeek,
    tournamentsOpen,
  };
}

async function loadFacilities(area: IpEstimate): Promise<FacilityWithPrimaryPhoto[]> {
  if (area.lat != null && area.lng != null) {
    return fetchFacilities({ lat: area.lat, lng: area.lng, radiusMiles: RADIUS_MILES, limit: 50, publicOnly: true });
  }
  return fetchFacilities({ city: area.city ?? undefined, state: area.state ?? undefined, limit: 50, publicOnly: true });
}

async function loadPlayerCount(area: IpEstimate): Promise<number> {
  let query = supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_discoverable', true);

  if (area.city) query = query.ilike('location_city', area.city);
  if (area.state) query = query.eq('location_state', area.state.toUpperCase());

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

async function loadGamesThisWeek(area: IpEstimate): Promise<number> {
  try {
    const rows = await fetchNearbyPlayEvents(100);
    const today = startOfDay(new Date());
    const weekOut = new Date(today);
    weekOut.setDate(today.getDate() + 7);

    return rows.filter(row => {
      const date = new Date(`${row.event_date}T00:00:00`);
      if (date < today || date > weekOut) return false;
      if (area.lat == null || area.lng == null || row.facility?.latitude == null || row.facility?.longitude == null) {
        return area.city ? row.city?.toLowerCase() === area.city.toLowerCase() : true;
      }
      return distanceMiles(area.lat, area.lng, row.facility.latitude, row.facility.longitude) <= RADIUS_MILES;
    }).length;
  } catch {
    return 0;
  }
}

async function loadOpenTournamentCount(area: IpEstimate): Promise<number> {
  try {
    const tournaments = await fetchTournaments();
    return tournaments.filter(t => {
      if (t.status !== 'open' && t.status !== 'filling_fast') return false;
      if (area.city && t.city.toLowerCase() === area.city.toLowerCase()) return true;
      if (area.state && t.state.toUpperCase() === area.state.toUpperCase()) return true;
      return false;
    }).length;
  } catch {
    return 0;
  }
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(h));
}

function formatStat(value: number | null): string {
  if (value == null) return '-';
  return value.toLocaleString();
}

function InfoRow({ icon, text, emphasized }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string; emphasized?: boolean }) {
  return (
    <View style={s.infoRow}>
      <MaterialCommunityIcons name={icon} size={26} color={L.gold} />
      <Text style={[s.infoText, emphasized && s.infoTextEmphasized]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipText: { color: L.gold, fontSize: 14, fontWeight: '800' },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    justifyContent: 'center',
  },
  titleBlock: { alignItems: 'center', marginBottom: spacing.xxxl },
  locationLine: { color: L.navy, fontSize: 30, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  areaTitle: { color: L.gold, fontSize: 22, fontWeight: '900', lineHeight: 28, textAlign: 'center', marginTop: spacing.xs },
  title: { color: L.navy, fontSize: 30, fontWeight: '900', textAlign: 'center', lineHeight: 36 },
  subtitle: { color: '#39415A', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm, maxWidth: 300 },
  statsCard: {
    borderWidth: 1.5,
    borderColor: '#E5DED1',
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  loadingRow: { minHeight: 176, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: '#39415A', fontSize: 14, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 30 },
  infoText: { flex: 1, color: L.navy, fontSize: 15, fontWeight: '700' },
  infoTextEmphasized: { fontSize: 17, fontWeight: '900' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: SCREEN_BG,
    gap: spacing.md,
  },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E8E3D9',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    width: '36%',
    height: 8,
    borderRadius: 999,
    backgroundColor: L.gold,
  },
  progressKnob: {
    position: 'absolute',
    left: '36%',
    width: 34,
    height: 34,
    marginLeft: -17,
    borderRadius: 17,
    backgroundColor: L.gold,
    borderWidth: 2,
    borderColor: '#F4E6BC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressKnobText: { color: L.white, fontSize: 13, fontWeight: '900', letterSpacing: -1 },
});