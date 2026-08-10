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
import { useSlideMenu } from '@/components/SlideMenu';
import { useCurrentLocation } from '@/lib/location';
import {
  fetchListings, type MarketplaceListingCard, type ListingSort,
} from '@/lib/marketplace/listingService';
import {
  MARKETPLACE_BRANDS, CONDITION_OPTIONS, conditionLabel, formatPriceCents,
  listingAgeLabel, type MarketplaceCondition,
} from '@/lib/marketplace/constants';

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

const L = {
  bg: '#FFFFFF', navy: '#0A1228', gold: '#C9A84C', text: '#0A1228',
  textMuted: '#9AAABF', border: '#E0E8F5', green: '#16A34A', greenBg: '#DCFCE7',
};

const PRICE_BUCKETS: { label: string; min?: number; max?: number }[] = [
  { label: 'Under $100', max: 9999 },
  { label: '$100–$175', min: 10000, max: 17500 },
  { label: '$175–$225', min: 17500, max: 22500 },
  { label: '$225+', min: 22500 },
];

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[ch.chip, active && ch.chipActive]} onPress={onPress} activeOpacity={0.75}>
      <Text style={[ch.text, active && ch.textActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const ch = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: L.border, backgroundColor: L.bg, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  text: { color: L.text, fontSize: 13, fontWeight: '500' },
  textActive: { color: '#FFFFFF', fontWeight: '700' },
});

// ─── Listing card ───────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: MarketplaceListingCard }) {
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
            <Ionicons name="image-outline" size={28} color={L.textMuted} />
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
            <Ionicons name="location-outline" size={11} color={L.textMuted} />
            <Text style={card.loc} numberOfLines={1}>
              {[listing.location_city, listing.location_state].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
const card = StyleSheet.create({
  root: { width: CARD_W, marginBottom: 16, backgroundColor: L.bg, borderRadius: 16, borderWidth: 1, borderColor: L.border, overflow: 'hidden' },
  imageWrap: { width: '100%', aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FB' },
  conditionBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(10,18,40,0.72)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  conditionText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  body: { padding: 10 },
  title: { color: L.text, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  brandLine: { color: L.text, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  modelLine: { color: L.text, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { color: L.green, fontSize: 15, fontWeight: '800' },
  age: { color: L.textMuted, fontSize: 11 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  loc: { color: L.textMuted, fontSize: 11, flexShrink: 1 },
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
  return (
    <Animated.View style={[fs.sheet, { transform: [{ translateY: filterY }] }]}>
      <View style={fs.handleRow}><View style={fs.handle} /></View>
      <View style={fs.header}>
        <Text style={fs.title}>Filters</Text>
        <TouchableOpacity onPress={onClose} style={fs.closeBtn}>
          <Ionicons name="close" size={22} color={L.navy} />
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
const fs = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: FILTER_HEIGHT, paddingBottom: 50, backgroundColor: L.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20, zIndex: 30 },
  handleRow: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: L.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: L.navy, fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  sectionLabel: { color: L.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 20, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  applyBtn: { marginTop: 24, backgroundColor: L.navy, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  applyText: { color: L.bg, fontSize: 16, fontWeight: '800' },
});

function Scrim({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  if (!visible) return null;
  return (
    <TouchableOpacity style={StyleSheet.absoluteFill as never} activeOpacity={1} onPress={onPress}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const { setTriggerVisible } = useSlideMenu();

  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  const [rawListings, setRawListings] = useState<MarketplaceListingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const { lat: myLat, lng: myLng } = useCurrentLocation();

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

  const load = useCallback(async () => {
    try {
      const rows = await fetchListings({
        query: search || undefined,
        brand: brand ?? undefined,
        condition: condition ?? undefined,
        minPriceCents: priceBucket?.min,
        maxPriceCents: priceBucket?.max,
        sort,
      });
      setRawListings(rows);
    } catch (err) {
      console.error('[Marketplace] fetchListings failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, brand, condition, priceBucket?.min, priceBucket?.max, sort]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

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
      <Tabs.Screen options={{ tabBarStyle: filterOpen ? { display: 'none' } : undefined }} />
      <View style={s.root}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <Text style={s.headerTitle}>Marketplace</Text>
          <TouchableOpacity
            style={s.sellBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/marketplace/create' as never)}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={s.sellBtnText}>Sell</Text>
          </TouchableOpacity>
        </View>

        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Ionicons name="search" size={16} color={L.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search brand or model"
              placeholderTextColor={L.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={s.filterBtn} onPress={openFilter} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={18} color={L.navy} />
            {activeFilterCount > 0 && (
              <View style={s.filterBadge}><Text style={s.filterBadgeText}>{activeFilterCount}</Text></View>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.centerFill}><ActivityIndicator color={L.navy} /></View>
        ) : listings.length === 0 ? (
          <View style={s.centerFill}>
            <Ionicons name="pricetag-outline" size={32} color={L.textMuted} />
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={L.navy} />}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9FC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerTitle: { color: L.navy, fontSize: 24, fontWeight: '900' },
  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: L.navy, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  sellBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: L.bg, borderRadius: 14, borderWidth: 1, borderColor: L.border, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14, color: L.text },
  filterBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: L.bg, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  filterBadgeText: { color: L.navy, fontSize: 10, fontWeight: '800' },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: L.textMuted, fontSize: 14 },
});
