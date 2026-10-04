import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Image, TextInput, ScrollView, Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import {
  browseLessons, fetchLessonMapPins, travelAreaLabel,
  type BrowseLesson, type LessonMapPin, type LessonSort,
} from '@/lib/coach/offers';
import { LoadingState, EmptyState, ErrorState } from '@/components';
import { ExploreMap } from '@/components/ExploreMap';
import type { MapPinLike, Region } from '@/components/ExploreMap.types';
import { OFFER_TYPE_OPTIONS, formatPriceCents, discountPercent, effectiveOfferPrice } from '@/lib/coach/constants';
import { useMembership } from '@/hooks/useMembership';
import { useProfile } from '@/hooks/useProfile';
import { useCurrentLocation } from '@/lib/location';
import { haptics } from '@/lib/haptics';
import { DEFAULT_LESSON_COVER } from '@/lib/coach/defaultLessonCover';

// Lesson Marketplace browse — location first (owner, 2026-10-04).
//
// The screen shows only search, a List/Map toggle and a Filters button with a
// one-line summary; distance, type and sort live in a sheet whose choices
// apply on "Apply Filters" (owner: no clutter in the open). Defaults: within
// 25 mi, all types, nearest — or Anywhere/Newest without a location.
//
// "Near me" is the phone's position, else the profile's city-level one, never
// the hard-coded fallback city. Data: browse_coach_offers and
// coach_offer_map_pins (20261004120000 / 130000) — the same search web uses;
// test coaches on internal builds only. The map pins facilities (one brand
// colour; count bubbles were rejected on the paddle map for drifting off their
// marker); travel lessons have no fixed spot, so a banner leads to them.

const L = {
  navy: colors.navy, gold: colors.gold, text: colors.text, textSub: colors.textSub,
  border: colors.border, bg: colors.bg, page: colors.page,
};

const RADII: { miles: number | null; label: string }[] = [
  { miles: 10, label: 'Within 10 mi' },
  { miles: 25, label: 'Within 25 mi' },
  { miles: 50, label: 'Within 50 mi' },
  { miles: null, label: 'Anywhere' },
];

const SORTS: { value: LessonSort; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'price_high', label: 'Price: high to low' },
  { value: 'newest', label: 'Newest' },
];

type Filters = { radius: number | null; offerType: string | null; sort: LessonSort };
const DEFAULTS: Filters = { radius: 25, offerType: null, sort: 'nearest' };

const typeLabel = (t: string) => OFFER_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

/**
 * The card's price, from this buyer's point of view.
 *
 * A member sees the member price as THE price, with the public one struck
 * through, so the benefit is visible while browsing rather than a surprise at
 * checkout. Everyone else sees what membership would save them on this
 * specific offer, which is a far better upsell than a generic pitch.
 */
function PriceRow({ item, isMember }: { item: BrowseLesson; isMember: boolean }) {
  const price = effectiveOfferPrice(item, isMember);
  return (
    <>
      <View style={s.priceRow}>
        <Text style={s.priceStrike}>{formatPriceCents(item.regular_price_cents)}</Text>
        <Text style={s.priceNow}>{formatPriceCents(price.cents)}</Text>
        <Text style={s.pctOff}>{discountPercent(item.regular_price_cents, price.cents)}% off</Text>
      </View>
      {!price.isMemberPrice && item.premium_price_cents != null && (
        <Text style={s.memberHint}>Members pay {formatPriceCents(item.premium_price_cents)}</Text>
      )}
    </>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.chip, on && s.chipOn]}
      onPress={() => { if (!on) { haptics.selection(); onPress(); } }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterSheet({
  visible, applied, hasLocation, onApply, onClose,
}: {
  visible: boolean;
  applied: Filters;
  hasLocation: boolean;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Filters>(applied);
  // Re-seed from what is applied every time it opens; closing without Apply
  // discards the draft.
  useEffect(() => { if (visible) setDraft(applied); }, [visible, applied]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle}>Filters</Text>
          <TouchableOpacity onPress={() => { haptics.light(); setDraft(DEFAULTS); }} accessibilityRole="button">
            <Text style={s.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
          <Text style={s.sectionLabel}>DISTANCE</Text>
          {!hasLocation && (
            <Text style={s.sheetNote}>Turn on location or set your city in your profile to filter by distance.</Text>
          )}
          <View style={s.chipWrap}>
            {RADII.map((r) => (
              <Chip
                key={r.label}
                label={r.label}
                on={(hasLocation ? draft.radius : null) === r.miles}
                onPress={() => { if (hasLocation) setDraft({ ...draft, radius: r.miles }); }}
              />
            ))}
          </View>

          <Text style={s.sectionLabel}>LESSON TYPE</Text>
          <View style={s.chipWrap}>
            <Chip label="All types" on={draft.offerType === null} onPress={() => setDraft({ ...draft, offerType: null })} />
            {OFFER_TYPE_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} on={draft.offerType === o.value} onPress={() => setDraft({ ...draft, offerType: o.value })} />
            ))}
          </View>

          <Text style={s.sectionLabel}>SORT</Text>
          <View style={s.chipWrap}>
            {SORTS.filter((o) => hasLocation || o.value !== 'nearest').map((o) => (
              <Chip key={o.value} label={o.label} on={draft.sort === o.value} onPress={() => setDraft({ ...draft, sort: o.value })} />
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity
          style={s.applyBtn}
          onPress={() => { haptics.light(); onApply(draft); }}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={s.applyText}>Apply Filters</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function regionFor(center: { lat: number; lng: number }, radiusMiles: number | null): Region {
  const delta = Math.max(0.05, ((radiusMiles ?? 50) * 2.2) / 69);
  return { latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta };
}

export default function LessonMarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { isMember } = useMembership();
  const { profile } = useProfile();
  const device = useCurrentLocation();

  // Where "near me" is: the phone, else the profile's stored (2-decimal,
  // ~1 km) position, else nowhere.
  const near = useMemo(() => {
    if (!device.loading && !device.isFallback) return { lat: device.lat, lng: device.lng, source: 'device' as const };
    if (profile?.location_lat != null && profile?.location_lng != null) {
      return { lat: profile.location_lat, lng: profile.location_lng, source: 'profile' as const };
    }
    return null;
  }, [device.loading, device.isFallback, device.lat, device.lng, profile?.location_lat, profile?.location_lng]);

  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  // Narrowing that comes from the map, shown as a removable chip.
  const [atFacility, setAtFacility] = useState<{ id: string; name: string } | null>(null);
  const [travelOnly, setTravelOnly] = useState(false);

  const [offers, setOffers] = useState<BrowseLesson[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed fetch must not read as an empty catalogue (item 6.3).
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Map state.
  const [pins, setPins] = useState<LessonMapPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pannedCenter, setPannedCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [travelCount, setTravelCount] = useState(0);
  const lastPinPress = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const radius = near ? filters.radius : null;
  const sort: LessonSort = !near && filters.sort === 'nearest' ? 'newest' : filters.sort;
  const changedCount =
    (radius !== DEFAULTS.radius && near ? 1 : 0) + (filters.offerType ? 1 : 0) + (sort !== DEFAULTS.sort && near ? 1 : 0);

  const summary = [
    near ? (radius == null ? 'Anywhere' : `Within ${radius} mi`) : 'Anywhere',
    filters.offerType ? typeLabel(filters.offerType) : null,
    SORTS.find((o) => o.value === sort)?.label.replace(': low to high', ' ↑').replace(': high to low', ' ↓'),
  ].filter(Boolean).join(' · ');

  // ── List ──
  useFocusEffect(useCallback(() => {
    // Wait for the phone's answer once, so the first list isn't the profile's.
    if (device.loading && !near) return;
    let active = true;
    setLoading(true);
    setError(false);
    browseLessons({
      search, offerType: filters.offerType, near, radiusMiles: atFacility ? null : radius, sort,
      facilityId: atFacility?.id ?? null, travelOnly,
    })
      .then((data) => { if (active) setOffers(data); })
      .catch((err) => {
        console.error('[lessons] failed to load coach offers', err);
        if (active) setError(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters.offerType, near, radius, sort, atFacility, travelOnly, device.loading, reloadKey]));

  // ── Map ── centre on near, else the first pin area we can find.
  useEffect(() => {
    if (view !== 'map') return;
    const center = mapCenter ?? (near ? { lat: near.lat, lng: near.lng } : null);
    if (!center) return;
    if (!region) setRegion(regionFor(center, radius));
    let active = true;
    fetchLessonMapPins(center, radius, filters.offerType)
      .then((p) => { if (active) setPins(p); })
      .catch((err) => console.error('[lessons] map pins failed', err));
    // Travel lessons reaching you: their range decides, so any radius works here.
    if (near) {
      browseLessons({ near, radiusMiles: 1, travelOnly: true, offerType: filters.offerType, limit: 60 })
        .then((t) => { if (active) setTravelCount(t.filter((o) => o.travel_radius_miles != null).length); })
        .catch(() => { if (active) setTravelCount(0); });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mapCenter, near, radius, filters.offerType]);

  const mapPins: MapPinLike[] = pins.map((p) => ({
    id: p.facility_id, category: 'court', latitude: p.latitude, longitude: p.longitude, color: L.gold,
  }));
  const selected = pins.find((p) => p.facility_id === selectedPin) ?? null;

  const locationNote = !near
    ? 'Turn on location or set your city in your profile to see lessons near you.'
    : near.source === 'profile' ? 'Using the location on your profile.' : null;

  function seeFacility(p: LessonMapPin) {
    haptics.light();
    setAtFacility({ id: p.facility_id, name: p.facility_name });
    setTravelOnly(false);
    setSelectedPin(null);
    setView('list');
  }

  return (
    <View style={s.root}>
      {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. Pattern from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Lesson Marketplace</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.toolbar}>
        <View style={s.toolbarRow}>
          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color={L.textSub} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search coach, facility or lesson"
              placeholderTextColor={L.textSub}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search lessons"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={L.textSub} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => { haptics.selection(); setView((v) => (v === 'list' ? 'map' : 'list')); setSelectedPin(null); }}
            accessibilityRole="button"
            accessibilityLabel={view === 'list' ? 'Show map' : 'Show list'}
          >
            <Ionicons name={view === 'list' ? 'map-outline' : 'list-outline'} size={20} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => { haptics.light(); setSheetOpen(true); }}
            accessibilityRole="button"
            accessibilityLabel={changedCount > 0 ? `Filters, ${changedCount} changed` : 'Filters'}
          >
            <Ionicons name="options-outline" size={20} color={L.navy} />
            {changedCount > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{changedCount}</Text></View>
            )}
          </TouchableOpacity>
        </View>
        <Text style={s.summary} numberOfLines={1}>{summary}</Text>
        {(atFacility || travelOnly) && (
          <View style={s.activeRow}>
            <TouchableOpacity
              style={s.activeChip}
              onPress={() => { haptics.light(); setAtFacility(null); setTravelOnly(false); }}
              accessibilityRole="button"
              accessibilityLabel="Clear"
            >
              <Text style={s.activeChipText} numberOfLines={1}>
                {atFacility ? `At ${atFacility.name}` : 'Coaches who travel to you'}
              </Text>
              <Ionicons name="close" size={14} color={L.bg} />
            </TouchableOpacity>
          </View>
        )}
        {!!locationNote && <Text style={s.locationNote}>{locationNote}</Text>}
      </View>

      {view === 'map' ? (
        !near && !mapCenter ? (
          <EmptyState
            icon="map-outline"
            title="The map needs a location"
            message="Turn on location or set your city in your profile."
          />
        ) : !region ? (
          <View style={s.centerFill}><ActivityIndicator color={L.gold} /></View>
        ) : (
          <View style={{ flex: 1 }}>
            <ExploreMap
              pins={mapPins}
              selectedId={selectedPin}
              onSelectPin={(id) => {
                lastPinPress.current = Date.now();
                haptics.selection();
                setSelectedPin((prev) => (prev === id ? null : id));
              }}
              onMapPress={() => {
                if (Date.now() - lastPinPress.current < 300) return;
                setSelectedPin(null);
              }}
              region={region}
              onRegionChangeComplete={(next) => setPannedCenter({ lat: next.latitude, lng: next.longitude })}
              onLocate={() => {
                setMapCenter(null);
                setPannedCenter(null);
                if (near) setRegion(regionFor(near, radius));
              }}
              overlay={
                <>
                  {travelCount > 0 && !selected && (
                    <TouchableOpacity
                      style={s.travelBanner}
                      onPress={() => { haptics.light(); setTravelOnly(true); setAtFacility(null); setView('list'); }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                    >
                      <Ionicons name="car-outline" size={16} color={L.navy} />
                      <Text style={s.travelBannerText}>
                        {travelCount} {travelCount === 1 ? 'coach travels' : 'coaches travel'} to you
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={L.navy} />
                    </TouchableOpacity>
                  )}

                  {pannedCenter && !selected && (
                    <TouchableOpacity
                      style={[s.searchAreaBtn, { bottom: insets.bottom + 84 }]}
                      onPress={() => { haptics.light(); setMapCenter(pannedCenter); setPannedCenter(null); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="search" size={14} color={L.bg} />
                      <Text style={s.searchAreaText}>Search this area</Text>
                    </TouchableOpacity>
                  )}

                  {selected && (
                    <View style={[s.pinCard, { bottom: insets.bottom + 16 }]}>
                      <Text style={s.pinTitle} numberOfLines={1}>{selected.facility_name}</Text>
                      <Text style={s.pinSub} numberOfLines={1}>
                        {selected.offer_count} {selected.offer_count === 1 ? 'lesson' : 'lessons'}
                        {selected.min_price_cents != null ? ` · from ${formatPriceCents(selected.min_price_cents)}` : ''}
                        {selected.city ? ` · ${selected.city}` : ''}
                      </Text>
                      <TouchableOpacity style={s.pinBtn} onPress={() => seeFacility(selected)} activeOpacity={0.85} accessibilityRole="button">
                        <Text style={s.pinBtnText}>See lessons</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              }
            />
          </View>
        )
      ) : loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState
          message="We couldn't load lesson offers."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : offers.length === 0 ? (
        radius != null && !atFacility ? (
          <EmptyState
            icon="school-outline"
            title={`No lessons within ${radius} mi`}
            message="Try a wider area or another lesson type."
            action={{ label: 'Show lessons anywhere', onPress: () => setFilters({ ...filters, radius: null }) }}
          />
        ) : (
          <EmptyState
            icon="school-outline"
            title="No lesson offers match"
            message="Coaches post sessions and clinics here — check back soon."
          />
        )
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
          renderItem={({ item }) => {
            const travel = travelAreaLabel(item);
            const miles = item.distance_miles != null ? `${item.distance_miles} mi` : null;
            return (
              <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={() => router.push(`/lessons/${item.id}` as never)}>
                <View style={s.cardRow}>
                  <Image
                    source={item.photo_url ? { uri: item.photo_url } : DEFAULT_LESSON_COVER}
                    style={s.thumb}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.cardSub}>
                      {typeLabel(item.offer_type)}{item.coach_name ? ` · ${item.coach_name}` : ''}
                    </Text>
                    {!!item.facility_name && (
                      <Text style={s.cardLocation} numberOfLines={1}>
                        {miles && !travel ? `${miles} · ` : ''}{item.facility_name} · {item.city}, {item.state}
                      </Text>
                    )}
                    {!!travel && (
                      <Text style={s.cardTravel} numberOfLines={1}>
                        {miles && !item.facility_name ? `${miles} · ` : ''}{travel}
                      </Text>
                    )}
                    <PriceRow item={item} isMember={isMember} />
                  </View>
                  {item.premium_only && (
                    <View style={s.premiumBadge}><Text style={s.premiumBadgeText}>PREMIUM</Text></View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        applied={filters}
        hasLocation={!!near}
        onApply={(f) => {
          setFilters(f);
          setSheetOpen(false);
          // The map follows the new distance.
          const c = mapCenter ?? (near ? { lat: near.lat, lng: near.lng } : null);
          if (c) setRegion(regionFor(c, near ? f.radius : null));
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  toolbar: {
    backgroundColor: L.bg, paddingHorizontal: 16, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: shape.panel, backgroundColor: L.page,
  },
  searchInput: { flex: 1, color: L.text, fontSize: text.body.size, padding: 0 },
  iconBtn: {
    width: 42, height: 42, borderRadius: shape.panel, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  badge: {
    position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: L.bg, fontSize: 10, fontWeight: '800' },
  summary: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600' },
  activeRow: { flexDirection: 'row' },
  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: shape.pill, backgroundColor: L.navy,
  },
  activeChipText: { color: L.bg, fontSize: text.caption.size, fontWeight: '700', flexShrink: 1 },
  locationNote: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  // Filter sheet
  scrim: { flex: 1, backgroundColor: 'rgba(10,18,40,0.35)' },
  sheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: L.border, marginTop: 12, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  sheetTitle: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  resetText: { color: L.navy, fontSize: text.body.size, fontWeight: '700' },
  sectionLabel: {
    color: L.textSub, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing,
    marginTop: 18, marginBottom: 10,
  },
  sheetNote: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: shape.pill,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  chipOn: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.navy, fontSize: text.caption.size, fontWeight: '700' },
  chipTextOn: { color: L.bg },
  applyBtn: { marginTop: 8, backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: 16, alignItems: 'center' },
  applyText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },

  // Map overlays
  travelBanner: {
    position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: shape.pill, backgroundColor: L.bg,
    shadowColor: L.navy, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  travelBannerText: { color: L.navy, fontSize: text.caption.size, fontWeight: '800' },
  searchAreaBtn: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: shape.pill, backgroundColor: L.navy,
  },
  searchAreaText: { color: L.bg, fontSize: text.caption.size, fontWeight: '800' },
  pinCard: {
    position: 'absolute', left: 16, right: 16, backgroundColor: L.bg, borderRadius: shape.card, padding: 16, gap: 4,
    shadowColor: L.navy, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  pinTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '800' },
  pinSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600' },
  pinBtn: { marginTop: 8, backgroundColor: L.gold, borderRadius: shape.cta, paddingVertical: 12, alignItems: 'center' },
  pinBtnText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  // Cards
  card: { backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border, padding: 12 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: shape.cta },
  cardTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  cardSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  memberHint: { color: L.gold, fontSize: text.caption.size, fontWeight: '700', marginTop: 2 },
  cardLocation: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  cardTravel: { color: L.navy, fontSize: text.caption.size, fontWeight: '600', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  priceStrike: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', textDecorationLine: 'line-through' },
  priceNow: { color: L.navy, fontSize: text.rowValue.size, fontWeight: '800' },
  pctOff: { color: colors.gold, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  premiumBadge: { backgroundColor: L.navy, borderRadius: shape.badge, paddingHorizontal: 6, paddingVertical: 3 },
  premiumBadgeText: { color: L.bg, fontSize: 9, fontWeight: '800' },
});
