// Marketplace Browse — spec'd as an image-forward card grid with search,
// filters, and sort (NOT the Tinder swipe-deck this file used to be; that UX
// didn't match the spec's Browse section, so it now lives only inside Listing
// Detail's photo viewer). See MARKETPLACE_V1_SPEC.md "Browse" / "Search" /
// "Filters" / "Sorting".
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  Animated, Dimensions, Image, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Tabs, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSlideMenu } from '@/components/SlideMenu';
import { useCurrentLocation } from '@/lib/location';
import {
  fetchListings, type MarketplaceListingCard, type ListingSort,
} from '@/lib/marketplace/listingService';
import {
  MARKETPLACE_BRANDS, CONDITION_OPTIONS, conditionLabel, formatPriceCents,
  listingAgeLabel, type MarketplaceCondition,
} from '@/lib/marketplace/constants';
import { colors, useTheme, useThemeRoles, useThemedStyles, type ThemeRoles } from '@/theme';
import { radius as shape, text } from '@shared/tokens';

const { width: SW } = Dimensions.get('window');
const CARD_W = (SW - 16 * 2 - 12) / 2;
const FILTER_HEIGHT = 690;

const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

// The local `const L` palette this screen used to carry is gone — it was eight
// hardcoded values, two of which (#16A34A / #DCFCE7) were duplicates of the
// success tokens at slightly different values. Colours now come from theme
// roles; see THEMING_PLAN.md.

const PRICE_BUCKETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under $100', max: 9999 },
  { label: '$100–$175', min: 10000, max: 17500 },
  { label: '$175–$225', min: 17500, max: 22500 },
  { label: '$225+', min: 22500 },
];

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const ch = useThemedStyles(chipStyles);
  return (
    <TouchableOpacity style={[ch.chip, active && ch.chipActive]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[ch.text, active && ch.textActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const chipStyles = (t: ThemeRoles) => StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: t.primary, borderColor: t.primary },
  text: { color: t.textPrimary, fontSize: text.controlLabel.size, fontWeight: '700' },
  textActive: { color: t.onPrimary, fontWeight: '700' },
});

// ─── Listing card ───────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: MarketplaceListingCard }) {
  const t = useThemeRoles();
  const card = useThemedStyles(cardStyles);
  return (
    <TouchableOpacity
      style={card.root}
      activeOpacity={0.85}
      onPress={() => router.push(`/marketplace/${listing.id}` as never)}
    >
      <View style={card.imageWrap}>
        {listing.primaryPhotoUrl ? (
          <Image source={{ uri: listing.primaryPhotoUrl }} style={card.image} resizeMode="cover" />
        ) : (
          <View style={[card.image, card.imagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={t.textMuted} />
          </View>
        )}
        <View style={card.conditionBadge}>
          <Text style={card.conditionText}>{conditionLabel(listing.condition)}</Text>
        </View>
      </View>
      <View style={card.body}>
        <Text style={card.brandLine} numberOfLines={1}>{listing.brand}</Text>
        <Text style={card.modelLine} numberOfLines={1}>{listing.model}</Text>
        <View style={card.priceRow}>
          <Text style={card.price}>{formatPriceCents(listing.asking_price_cents)}</Text>
          <Text style={card.age}>{listingAgeLabel(listing.created_at)}</Text>
        </View>
        {(listing.location_city || listing.location_state) && (
          <View style={card.locRow}>
            <Ionicons name="location-outline" size={11} color={t.textMuted} />
            <Text style={card.loc} numberOfLines={1}>
              {[listing.location_city, listing.location_state].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
const cardStyles = (t: ThemeRoles) => StyleSheet.create({
  root: { width: CARD_W, marginBottom: 16, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.border, overflow: 'hidden' },
  imageWrap: { width: '100%', aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceElevated },
  // Sits ON the listing photo, so it must stay dark in both themes — hence the
  // scrimMediaStrong role and a fixed white, not textInverse (which flips).
  conditionBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: t.scrimMediaStrong, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  conditionText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  body: { padding: 10 },
  title: { color: t.textPrimary, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 4 },
  brandLine: { color: t.textPrimary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  modelLine: { color: t.textPrimary, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Was #16A34A, a near-duplicate of the success token.
  price: { color: t.success, fontSize: text.rowValue.size, fontWeight: '800' },
  age: { color: t.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  loc: { color: t.textMuted, fontSize: text.caption.size, fontWeight: '500', flexShrink: 1 },
});

// ─── Filter Sheet ─────────────────────────────────────────────────────────────

function FilterSheet({
  filterY, onClose, brand, setBrand, condition, setCondition, priceLabel, setPriceLabel, sort, setSort,
  radiusMiles, setRadiusMiles,
}: {
  filterY: Animated.Value; onClose: () => void;
  brand: string | null; setBrand: (b: string | null) => void;
  condition: MarketplaceCondition | null; setCondition: (c: MarketplaceCondition | null) => void;
  priceLabel: string | null; setPriceLabel: (p: string | null) => void;
  sort: ListingSort; setSort: (s: ListingSort) => void;
  radiusMiles: number | null; setRadiusMiles: (r: number | null) => void;
}) {
  const t = useThemeRoles();
  const fs = useThemedStyles(filterSheetStyles);
  return (
    <Animated.View style={[fs.sheet, { transform: [{ translateY: filterY }] }]}>
      <View style={fs.handleRow}><View style={fs.handle} /></View>
      <View style={fs.header}>
        <Text style={fs.title}>Filters</Text>
        <TouchableOpacity onPress={onClose} style={fs.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={t.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={fs.scroll}>
        <Text style={fs.sectionLabel}>SORT</Text>
        <View style={fs.chipRow}>
          <Chip label="Newest" active={sort === 'newest'} onPress={() => setSort('newest')} />
          <Chip label="Price: Low → High" active={sort === 'price_asc'} onPress={() => setSort('price_asc')} />
          <Chip label="Price: High → Low" active={sort === 'price_desc'} onPress={() => setSort('price_desc')} />
        </View>

        <Text style={fs.sectionLabel}>BRAND</Text>
        <View style={fs.chipRow}>
          {MARKETPLACE_BRANDS.map((b) => (
            <Chip key={b} label={b} active={brand === b} onPress={() => setBrand(brand === b ? null : b)} />
          ))}
        </View>

        <Text style={fs.sectionLabel}>CONDITION</Text>
        <View style={fs.chipRow}>
          {CONDITION_OPTIONS.map((c) => (
            <Chip key={c.value} label={c.label} active={condition === c.value}
              onPress={() => setCondition(condition === c.value ? null : c.value)} />
          ))}
        </View>

        <Text style={fs.sectionLabel}>PRICE</Text>
        <View style={fs.chipRow}>
          {PRICE_BUCKETS.map((p) => (
            <Chip key={p.label} label={p.label} active={priceLabel === p.label}
              onPress={() => setPriceLabel(priceLabel === p.label ? null : p.label)} />
          ))}
        </View>

        <Text style={fs.sectionLabel}>DISTANCE</Text>
        <View style={fs.chipRow}>
          {RADIUS_OPTIONS.map((r) => (
            <Chip key={r} label={`Within ${r} mi`} active={radiusMiles === r}
              onPress={() => setRadiusMiles(radiusMiles === r ? null : r)} />
          ))}
        </View>

        <TouchableOpacity style={fs.applyBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={fs.applyText}>Apply Filters</Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}
const filterSheetStyles = (t: ThemeRoles) => StyleSheet.create({
  // shadowColor stays a fixed dark value: a shadow that brightened with the
  // theme would glow rather than cast.
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: FILTER_HEIGHT, paddingBottom: 50, backgroundColor: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: colors.navy, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20, zIndex: 30 },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: t.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: t.textPrimary, fontSize: text.modalTitle.size, fontWeight: '900' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  sectionLabel: { color: t.textMuted, fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, marginTop: 20, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  applyBtn: { marginTop: 24, backgroundColor: t.primary, borderRadius: shape.cta, paddingVertical: 16, alignItems: 'center' },
  applyText: { color: t.onPrimary, fontSize: text.actionLarge.size, fontWeight: '800' },
});

function Scrim({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const t = useThemeRoles();
  if (!visible) return null;
  return (
    <TouchableOpacity style={StyleSheet.absoluteFill as never} activeOpacity={1} onPress={onPress}>
      <View style={{ flex: 1, backgroundColor: t.overlay }} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { roles: t, statusBarStyle } = useTheme();
  const s = useThemedStyles(screenStyles);
  const { setTriggerVisible } = useSlideMenu();

  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  const [rawListings, setRawListings] = useState<MarketplaceListingCard[]>([]);
  // `loading` covers the first load only. Later queries set `refetching` and
  // leave the current grid on screen.
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  // Every keystroke used to reach `load` directly — one full round trip per
  // character typed. Debounce before the query sees it.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { lat: myLat, lng: myLng } = useCurrentLocation();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterY = useRef(new Animated.Value(FILTER_HEIGHT)).current;

  const openFilter = () => {
    setFilterOpen(true);
    Animated.spring(filterY, { toValue: 0, bounciness: 3, speed: 14, useNativeDriver: true }).start();
  };
  const closeFilter = () => {
    Animated.timing(filterY, { toValue: FILTER_HEIGHT, duration: 260, useNativeDriver: true })
      .start(() => setFilterOpen(false));
  };

  const [brand, setBrand] = useState<string | null>(null);
  const [condition, setCondition] = useState<MarketplaceCondition | null>(null);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);
  const [sort, setSort] = useState<ListingSort>('newest');
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);

  const priceBucket = PRICE_BUCKETS.find((p) => p.label === priceLabel);

  // Results now stay on screen while a new query is in flight, so a slow
  // earlier request must not overwrite a faster later one.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setRefetching(true);
    try {
      const rows = await fetchListings({
        query: debouncedSearch || undefined,
        brand: brand ?? undefined,
        condition: condition ?? undefined,
        minPriceCents: priceBucket?.min,
        maxPriceCents: priceBucket?.max,
        sort,
      });
      if (seq !== requestSeq.current) return; // superseded
      setRawListings(rows);
    } catch (err) {
      console.error('[Marketplace] fetchListings failed:', err);
    } finally {
      // A superseded request leaves the flags to the request that replaced it.
      if (seq === requestSeq.current) {
        setLoading(false);
        setRefetching(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, brand, condition, priceBucket?.min, priceBucket?.max, sort]);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); void load(); }, [load]);

  // Distance filtering happens client-side (no server-side geo query for
  // listings yet, unlike facilities' search_facilities_nearby RPC) — listings
  // missing coordinates are excluded once a radius is picked, since distance
  // to them can't be measured.
  const listings = radiusMiles == null || myLat == null || myLng == null
    ? rawListings
    : rawListings.filter((l) =>
        l.location_lat != null && l.location_lng != null &&
        haversineMiles(myLat, myLng, l.location_lat, l.location_lng) <= radiusMiles,
      );

  const activeFilterCount = [brand, condition, priceLabel, radiusMiles].filter((v) => v != null).length;

  return (
    <>
      {/* This screen set no StatusBar, so it inherited whichever tab sibling
          was still mounted — Home hardcodes style="dark", which left a dark
          clock on a near-black page in dark mode. Rule 4: system chrome
          follows the theme. The other 174 hardcoded calls are Phase 3. */}
      <StatusBar style={statusBarStyle} />
      <Tabs.Screen options={{ tabBarStyle: filterOpen ? { display: 'none' } : undefined }} />
      <View style={s.root}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <Text style={s.headerTitle}>Marketplace</Text>
          <TouchableOpacity
            style={s.sellBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/marketplace/create' as never)}
          >
            <Ionicons name="add" size={16} color={t.onPrimary} />
            <Text style={s.sellBtnText}>Sell</Text>
          </TouchableOpacity>
        </View>

        <View style={s.searchRow}>
          <View style={s.searchBox}>
            {refetching && !loading ? (
              <ActivityIndicator size="small" color={t.textMuted} style={s.searchSpinner} />
            ) : (
              <Ionicons name="search" size={16} color={t.textMuted} />
            )}
            <TextInput
              style={s.searchInput}
              placeholder="Search brand or model"
              placeholderTextColor={t.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={s.filterBtn} onPress={openFilter} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={18} color={t.textPrimary} />
            {activeFilterCount > 0 && (
              <View style={s.filterBadge}><Text style={s.filterBadgeText}>{activeFilterCount}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.centerFill}><ActivityIndicator color={t.primary} /></View>
        ) : listings.length === 0 ? (
          <View style={s.centerFill}>
            <Ionicons name="pricetag-outline" size={32} color={t.textMuted} />
            <Text style={s.emptyText}>No listings match yet.</Text>
          </View>
        ) : (
          <FlatList
            data={listings}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
            renderItem={({ item }) => <ListingCard listing={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />}
          />
        )}

        <Scrim visible={filterOpen} onPress={closeFilter} />
        {filterOpen && (
          <FilterSheet
            filterY={filterY}
            onClose={closeFilter}
            brand={brand} setBrand={setBrand}
            condition={condition} setCondition={setCondition}
            priceLabel={priceLabel} setPriceLabel={setPriceLabel}
            sort={sort} setSort={setSort}
            radiusMiles={radiusMiles} setRadiusMiles={setRadiusMiles}
          />
        )}
      </View>
    </>
  );
}

const screenStyles = (t: ThemeRoles) => StyleSheet.create({
  // Was #F7F9FC, which was neither the page token nor any other token.
  root: { flex: 1, backgroundColor: t.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { color: t.textPrimary, fontSize: text.pageTitle.size, fontWeight: '900' },
  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  sellBtnText: { color: t.onPrimary, fontSize: text.action.size, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: shape.cta, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: text.body.size, color: t.textPrimary },
  // Matches the search icon's footprint so swapping the two doesn't shift the input.
  searchSpinner: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  filterBtn: { width: 42, height: 42, borderRadius: shape.cta, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { color: t.onAccent, fontSize: 10, fontWeight: '800' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: t.textMuted, fontSize: text.caption.size, fontWeight: '500' },
});
