import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, radius } from '@/theme';
import { OnboardingCTA, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useOnboarding } from '@/lib/onboarding/state';
import { useCurrentLocation } from '@/lib/location';
import { fetchFacilities, type FacilityWithPrimaryPhoto } from '@/lib/supabase/facilities';
import { useSession } from '@/hooks/useSession';
import { updateProfile } from '@/lib/services/profile';
import { notifyProfileUpdated } from '@/lib/profileEvents';

const L = colors;
const SCREEN_BG = '#F8F5EF';
const SEARCH_RADIUS_MILES = 25;
const MAX_VISIBLE_COURTS = 3;

export default function SelectHomeCourtScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const { user } = useSession();
  const { lat, lng, loading: locLoading, isFallback } = useCurrentLocation();
  const searchRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FacilityWithPrimaryPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(draft.homeCourt?.id ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const origin = useMemo(() => {
    if (!isFallback) return { lat, lng };
    if (draft.estimatedLat != null && draft.estimatedLng != null) {
      return { lat: draft.estimatedLat, lng: draft.estimatedLng };
    }
    return { lat, lng };
  }, [draft.estimatedLat, draft.estimatedLng, isFallback, lat, lng]);

  useEffect(() => {
    if (locLoading && draft.estimatedLat == null) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchFacilities({
          lat: origin.lat,
          lng: origin.lng,
          radiusMiles: SEARCH_RADIUS_MILES,
          query: query.trim() || undefined,
          limit: MAX_VISIBLE_COURTS,
          publicOnly: true,
        });
        if (cancelled) return;
        setResults(rows);
        if (!selectedId && rows[0] && !query.trim()) {
          setSelectedId(rows[0].id);
          update('homeCourt', rows[0]);
          update('addCourtLater', false);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load courts.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draft.estimatedLat, locLoading, origin.lat, origin.lng, query, selectedId, update]);

  const selectedCourt = results.find(f => f.id === selectedId) ?? draft.homeCourt;

  function selectCourt(f: FacilityWithPrimaryPhoto) {
    setSelectedId(f.id);
    update('homeCourt', f);
    update('addCourtLater', false);
  }

  // Onboarding otherwise keeps everything in local draft state, but the home
  // court has a real column (profiles.home_court_id) that My Stats reads, so
  // the pick is synced here. Non-blocking: onboarding shouldn't stall on it,
  // and the user can change it later in Edit Profile.
  const persistHomeCourt = useCallback((facilityId: string) => {
    if (!user?.id) return;
    updateProfile(user.id, { home_court_id: facilityId })
      .then(notifyProfileUpdated)
      .catch((err) => console.warn('[onboarding] home court save failed:', err?.message ?? err));
  }, [user?.id]);

  function continueNext() {
    if (selectedCourt) {
      persistHomeCourt(selectedCourt.id);
      router.push('/onboarding/search-radius');
      return;
    }
    addCourtLater();
  }

  // Deliberately does not clear profiles.home_court_id — skipping shouldn't
  // erase a court the user already has set.
  function addCourtLater() {
    update('homeCourt', null);
    update('addCourtLater', true);
    router.push('/onboarding/search-radius');
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} activeOpacity={0.7} onPress={addCourtLater}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.titleBlock}>
          <Text style={s.title}>Which court do you play at most often?</Text>
          <Text style={s.subtitle}>Pick from real courts near your area.</Text>
        </View>

        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={22} color="#7C8494" />
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            placeholder="Search courts by name or area"
            placeholderTextColor="#7C8494"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            returnKeyType="search"
          />
        </View>

        {loading || locLoading ? (
          <View style={s.centered}><ActivityIndicator size="small" color={L.gold} /></View>
        ) : error ? (
          <View style={s.centered}><Text style={s.errorText}>{error}</Text></View>
        ) : results.length === 0 ? (
          <View style={s.centered}><Text style={s.emptyText}>No courts found nearby.</Text></View>
        ) : (
          <View style={s.list}>
            {results.slice(0, MAX_VISIBLE_COURTS).map((f, index) => (
              <CourtCard
                key={f.id}
                court={f}
                selected={selectedId === f.id}
                recommended={index === 0 && !query.trim()}
                onPress={() => selectCourt(f)}
              />
            ))}
          </View>
        )}

        <TouchableOpacity style={s.searchAnother} activeOpacity={0.75} onPress={() => searchRef.current?.focus()}>
          <View style={s.plusCircle}>
            <Ionicons name="add" size={19} color={L.white} />
          </View>
          <Text style={s.searchAnotherText}>Search another</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingProgressBar progress={45} />
        <OnboardingCTA label="Continue" disabled={!selectedCourt} onPress={continueNext} />
      </View>
    </View>
  );
}

function CourtCard({ court, selected, recommended, onPress }: {
  court: FacilityWithPrimaryPhoto;
  selected: boolean;
  recommended: boolean;
  onPress: () => void;
}) {
  const distance = court.distanceMeters != null ? `${(court.distanceMeters / 1609.344).toFixed(1)} mi` : [court.city, court.state].filter(Boolean).join(', ');
  const courtCount = `${court.court_count ?? 0} courts`;
  const access = court.membership_required ? 'Members' : court.lighting ? 'Lighted' : court.indoor_courts > court.outdoor_courts ? 'Indoor' : 'Outdoor';
  const ratingLabel = court.verified ? 'Verified' : 'Community court';

  return (
    <TouchableOpacity style={[s.card, selected && s.cardSelected]} activeOpacity={0.78} onPress={onPress}>
      {selected && recommended && (
        <View style={s.homeBadge}>
          <Text style={s.homeBadgeText}>Home</Text>
        </View>
      )}
      <MaterialCommunityIcons name="map-marker-radius-outline" size={28} color={L.gold} />
      <View style={s.cardBody}>
        <Text style={s.cardTitle} numberOfLines={1}>{court.name}</Text>
        <Text style={s.cardMeta} numberOfLines={1}>{distance} / {courtCount} / {access} <Text style={s.stars}>{ratingLabel}</Text></Text>
      </View>
      <View style={[s.radio, selected && s.radioSelected]}>
        {selected && <Ionicons name="checkmark" size={16} color={L.white} />}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipText: { color: L.gold, fontSize: 14, fontWeight: '800' },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    justifyContent: 'center',
  },
  titleBlock: { alignItems: 'center', marginBottom: spacing.xl },
  title: { color: L.navy, fontSize: 30, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  subtitle: { color: '#39415A', fontSize: 18, lineHeight: 24, textAlign: 'center', marginTop: spacing.xs },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1.5, borderColor: '#D8DEEA', borderRadius: radius.md,
    paddingHorizontal: spacing.lg, minHeight: 54, marginBottom: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  searchInput: { flex: 1, fontSize: 18, color: L.navy, padding: 0 },
  centered: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  errorText: { color: '#39415A', fontSize: 13 },
  emptyText: { color: '#39415A', fontSize: 13 },
  list: { gap: spacing.md },
  card: {
    minHeight: 70,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1.5, borderColor: '#E5DED1', borderRadius: radius.card,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }, elevation: 2,
  },
  cardSelected: { borderColor: L.gold, backgroundColor: 'rgba(255,255,255,0.94)' },
  homeBadge: {
    position: 'absolute', top: -13, right: 40,
    backgroundColor: L.gold, borderRadius: 8, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  homeBadgeText: { color: L.white, fontSize: 12, fontWeight: '800' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { color: L.navy, fontSize: 14, fontWeight: '900', marginBottom: 2 },
  cardMeta: { color: '#4C5262', fontSize: 12, fontWeight: '600' },
  stars: { color: L.gold, fontWeight: '900' },
  radio: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1.6, borderColor: '#7C8494', alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: L.gold, backgroundColor: L.gold },
  searchAnother: {
    marginTop: spacing.lg,
    minHeight: 58,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#4C5262',
    borderRadius: radius.card,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  plusCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center',
  },
  searchAnotherText: { color: L.navy, fontSize: 18, fontWeight: '800' },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: SCREEN_BG, gap: spacing.md,
  },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 22,
    paddingHorizontal: spacing.xxxl, paddingVertical: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: '#E8E3D9', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, width: '45%', height: 8, borderRadius: 999, backgroundColor: L.gold },
  progressKnob: {
    position: 'absolute', left: '45%', width: 34, height: 34, marginLeft: -17,
    borderRadius: 17, backgroundColor: L.gold, borderWidth: 2, borderColor: '#F4E6BC',
    alignItems: 'center', justifyContent: 'center',
  },
  progressKnobText: { color: L.white, fontSize: 13, fontWeight: '900', letterSpacing: -1 },
});