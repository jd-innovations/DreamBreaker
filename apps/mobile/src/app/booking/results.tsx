import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { PickleballIcon } from '@/components';
import {
  fetchFacilities,
  type FacilityWithPrimaryPhoto,
} from '@/lib/supabase/facilities';
import { fetchCourts } from '@/lib/supabase/courts';
import { fetchBallMachines } from '@/lib/supabase/ballMachines';
import { fetchFlashDealsForFacility } from '@/lib/supabase/flashDeals';
import { getBookingSearch, setBookingFacility } from '@/lib/bookingStore';
import { isFeatureEnabled } from '@/lib/featureFlags';

const bookingFiltersEnabled = isFeatureEnabled('bookingFilters');

const L = {
  bg:      colors.bg,
  page:    colors.page,
  navy:    colors.navy,
  gold:    colors.gold,
  goldBg:  colors.goldBg,
  goldBorder: colors.goldBorder,
  text:    colors.text,
  textSub: colors.textSub,
  border:  colors.border,
  white:   colors.white,
};

const SEARCH_RADIUS_MILES = 25;
const RESULTS_LIMIT = 20;

type ResultFacility = FacilityWithPrimaryPhoto & {
  courtsCount:        number;
  ballMachinesCount:  number;
  startingPriceCents: number | null;
  hasFlashDeal:       boolean;
};

function formatPrice(cents: number | null): string {
  if (cents == null) return 'Pricing unavailable';
  return `From $${Math.round(cents / 100)}/hr`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Result card ────────────────────────────────────────────────────────────

function ResultCard({ facility, onPress }: { facility: ResultFacility; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.88} onPress={onPress}>
      {facility.hasFlashDeal && (
        <View style={s.dealBar}>
          <Ionicons name="flash" size={13} color={L.gold} />
          <Text style={s.dealBarText}>FLASH DEAL</Text>
        </View>
      )}

      {facility.primaryPhotoUrl ? (
        <Image source={{ uri: facility.primaryPhotoUrl }} style={s.cardPhoto} resizeMode="cover" />
      ) : (
        <View style={[s.cardPhoto, s.cardPhotoFallback]}>
          <PickleballIcon size={32} color={L.gold} />
        </View>
      )}

      <View style={s.cardBody}>
        <Text style={s.cardName} numberOfLines={1}>{facility.name}</Text>

        <View style={s.cardMetaRow}>
          {facility.google_rating != null && (
            <>
              <Ionicons name="star" size={12} color={L.gold} />
              <Text style={s.cardMetaText}>
                {facility.google_rating.toFixed(1)}
                {facility.google_rating_count ? ` (${facility.google_rating_count})` : ''}
              </Text>
              <Text style={s.cardDot}>·</Text>
            </>
          )}
          {facility.distanceMeters != null && (
            <>
              <Text style={s.cardMetaText}>{(facility.distanceMeters / 1609.344).toFixed(1)} mi</Text>
              <Text style={s.cardDot}>·</Text>
            </>
          )}
          <Text style={s.cardMetaText} numberOfLines={1}>{facility.city}, {facility.state}</Text>
        </View>

        <Text style={s.cardInventory}>
          {facility.courtsCount} {facility.courtsCount === 1 ? 'Court' : 'Courts'}
          {facility.ballMachinesCount > 0 ? `  ·  ${facility.ballMachinesCount} Ball Machine${facility.ballMachinesCount === 1 ? '' : 's'}` : ''}
        </Text>

        <Text style={s.cardPrice}>{formatPrice(facility.startingPriceCents)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function BookingResultsScreen() {
  const insets = useSafeAreaInsets();
  const search = getBookingSearch();

  const [results, setResults] = useState<ResultFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const base = await fetchFacilities({
          lat:         search.locationLat ?? undefined,
          lng:         search.locationLng ?? undefined,
          radiusMiles: search.locationLat != null ? SEARCH_RADIUS_MILES : undefined,
          query:        search.locationQuery ?? undefined,
          bookableOnly: true,
          limit:        RESULTS_LIMIT,
        });
        if (cancelled) return;

        const enriched = await Promise.all(
          base.map(async (f): Promise<ResultFacility> => {
            const [courts, ballMachines, deals] = await Promise.all([
              fetchCourts(f.id).catch(() => []),
              fetchBallMachines(f.id).catch(() => []),
              fetchFlashDealsForFacility(f.id).catch(() => []),
            ]);

            const priceSource = search.assetTypeFilter === 'ball_machine' ? ballMachines : courts;
            const rates = priceSource.map(a => a.hourly_rate_cents).filter((c): c is number => c != null);

            return {
              ...f,
              courtsCount:        courts.length,
              ballMachinesCount:  ballMachines.length,
              startingPriceCents: rates.length > 0 ? Math.min(...rates) : null,
              hasFlashDeal:       deals.length > 0,
            };
          }),
        );

        if (!cancelled) setResults(enriched);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load results.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
    // Re-runs only when the underlying search context changes, matching
    // bookingStore's role as the single source of truth for this screen.
  }, [search.locationLat, search.locationLng, search.locationQuery, search.assetTypeFilter]);

  function handleSelectFacility(facility: ResultFacility) {
    setBookingFacility(facility.id, facility.name);
    router.push(`/facility/${facility.id}` as never);
  }

  const contextParts = [
    search.locationQuery || (search.locationLat != null ? 'Near you' : null),
    formatDate(search.date),
    search.assetTypeFilter === 'ball_machine'
      ? 'Ball Machine'
      : `${search.gameFormat === 'doubles' ? 'Doubles' : 'Singles'} (${search.playersInGroup} ${search.playersInGroup === 1 ? 'player' : 'players'})`,
  ].filter(Boolean);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Results</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.contextBar}>
        <Text style={s.contextText} numberOfLines={1}>{contextParts.join('  ·  ')}</Text>
      </View>

      {/* Filter/Sort are unbuilt (`bookingFilters` is deferred in
          BETA_SCOPE.md) — rendering them only to answer with a "Coming Soon"
          alert is a dead-end CTA, so the row is hidden until they work. */}
      {bookingFiltersEnabled && (
        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} activeOpacity={0.85}>
            <Ionicons name="options-outline" size={16} color={L.navy} />
            <Text style={s.actionBtnText}>Filters</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} activeOpacity={0.85}>
            <Ionicons name="swap-vertical-outline" size={16} color={L.navy} />
            <Text style={s.actionBtnText}>Sort</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={L.navy} />
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={36} color={L.border} />
          <Text style={s.emptyText}>{error}</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="search-outline" size={36} color={L.border} />
          <Text style={s.emptyText}>No facilities found for this search.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          {results.map(f => (
            <ResultCard key={f.id} facility={f} onPress={() => handleSelectFacility(f)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.screenV, backgroundColor: L.bg,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: 17, fontWeight: '900' },

  contextBar: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.sm, backgroundColor: L.bg },
  contextText: { color: L.textSub, fontSize: 12, fontWeight: '600' },

  actionRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm, backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: L.border, borderRadius: radius.chip,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  actionBtnText: { color: L.navy, fontSize: 13, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyText: { color: L.textSub, fontSize: 14, fontWeight: '500', textAlign: 'center' },

  card: {
    backgroundColor: L.bg, borderRadius: radius.card, overflow: 'hidden',
    marginHorizontal: spacing.screenH, marginTop: spacing.lg,
    borderWidth: 1, borderColor: L.border,
  },
  dealBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.goldBg, borderBottomWidth: 1, borderBottomColor: L.goldBorder,
    paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  dealBarText: { color: L.navy, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  cardPhoto:         { width: '100%', height: 140 },
  cardPhotoFallback: { backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center' },

  cardBody: { padding: spacing.lg, gap: 4 },
  cardName: { color: L.navy, fontSize: 16, fontWeight: '800' },

  cardMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  cardMetaText: { color: L.textSub, fontSize: 12, fontWeight: '600' },
  cardDot:      { color: L.border, fontSize: 12 },

  cardInventory: { color: L.textSub, fontSize: 12, fontWeight: '600', marginTop: 2 },
  cardPrice:     { color: L.navy, fontSize: 13, fontWeight: '800', marginTop: 4 },
});
