import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Animated, Image, ActivityIndicator, Modal, Pressable, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius } from '@/theme';
import {
  fetchFacilities,
  facilityAccessType,
  type FacilityWithPrimaryPhoto,
} from '@/lib/supabase/facilities';
import {
  fetchNearbyPlayEvents,
  type PlayEventWithMapFacility,
  type PlayEventType,
} from '@/lib/supabase/playEvents';
import { FALLBACK_LOCATION_LABEL, useCurrentLocation, type Coordinates } from '@/lib/location';
import { eventCoverUri } from '@/lib/eventCover';
import { ExploreMap } from '@/components/ExploreMap';
import type { Region } from '@/components/ExploreMap.types';
import { PickleballIcon, AppIcon } from '@/components';
import { useSlideMenu } from '@/components/SlideMenu';
import { SKILL_RANGES, DISTANCE_STEPS } from '@/components/FindGamesFilterModal';
import { tabBarClearance } from '@/constants/tabBar';

const SHEET_H = 230;
const DEFAULT_RADIUS_MILES = 20;
const DEFAULT_REGION_DELTA = 0.22;

// Theme-backed alias
const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  goldLight: colors.goldLight,
  text:      colors.text,
  textSub:   colors.textSub,
  textMuted: colors.textSub,
  border:    colors.border,
  white:     colors.white,
  success:   colors.success,
};

type Category = 'community' | 'tournament' | 'court';
type AccessFilter = 'all' | 'public' | 'membership' | 'private';

type ExplorePin = {
  id: string;
  category: Category;
  name: string;
  photo: string;
  datetime: string;
  distance: string;
  skillLevel: string;
  skillMin?: number | null;
  skillMax?: number | null;
  distanceMi?: number;
  players: number;
  maxPlayers: number;
  courts?: number;
  latitude: number;
  longitude: number;
  detailRoute: string;
  facilityData?: FacilityWithPrimaryPhoto;
  eventType?: PlayEventType;
};

function locationToRegion(coords: Coordinates): Region {
  return {
    latitude: coords.lat,
    longitude: coords.lng,
    latitudeDelta: DEFAULT_REGION_DELTA,
    longitudeDelta: DEFAULT_REGION_DELTA,
  };
}

function distanceMiles(from: Coordinates, to: Coordinates): number {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(a));
}

function formatEventDateTime(e: PlayEventWithMapFacility): string {
  const shortDate = e.event_date
    ? new Date(e.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const timeStr = e.start_time
    ? new Date(`1970-01-01T${e.start_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  return [shortDate, timeStr].filter(Boolean).join(' • ');
}

function playEventToPin(e: PlayEventWithMapFacility, origin: Coordinates): ExplorePin | null {
  if (!e.facility) return null;
  const skillStr = e.skill_min != null && e.skill_max != null
    ? `${e.skill_min} – ${e.skill_max}`
    : e.skill_min != null ? `${e.skill_min}+` : 'All Levels';
  const eventCoords = { lat: Number(e.facility.latitude), lng: Number(e.facility.longitude) };
  const distMi = distanceMiles(origin, eventCoords);
  return {
    id: e.id,
    category: 'community',
    name: e.name,
    photo: eventCoverUri(e.cover_url),
    datetime: formatEventDateTime(e),
    distance: `${distMi.toFixed(1)} mi away`,
    distanceMi: distMi,
    skillLevel: skillStr,
    skillMin: e.skill_min ?? null,
    skillMax: e.skill_max ?? null,
    players: e._participantCount,
    maxPlayers: e.max_players,
    latitude: eventCoords.lat,
    longitude: eventCoords.lng,
    detailRoute: `/community/${e.id}`,
    eventType: e.event_type,
  };
}

function facilityToPin(f: FacilityWithPrimaryPhoto): ExplorePin {
  const access = facilityAccessType(f);
  const distLabel = f.distanceMeters != null
    ? `${(f.distanceMeters / 1609.344).toFixed(1)} mi away`
    : `${f.city}, ${f.state}`;
  const accessLabel = access === 'public' ? 'Public' : access === 'membership' ? 'Membership' : 'Private';
  return {
    id:          f.id,
    category:    'court',
    name:        f.name,
    photo:       f.primaryPhotoUrl ?? '',
    datetime:    accessLabel,
    distance:    distLabel,
    skillLevel:  `${f.court_count} Court${f.court_count !== 1 ? 's' : ''}`,
    players:     0,
    maxPlayers:  0,
    courts:      f.court_count,
    latitude:    Number(f.latitude),
    longitude:   Number(f.longitude),
    detailRoute: `/facility/${f.id}`,
    facilityData: f,
  };
}

const PINS: ExplorePin[] = [
  {
    id: 't1', category: 'tournament',
    name: 'Summer Slam',
    photo: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=300&fit=crop&q=80',
    datetime: 'Jul 12 – 14, 2025', distance: '8.2 miles away',
    skillLevel: '3.5 – 5.0', players: 238, maxPlayers: 300,
    latitude: 27.37268, longitude: -82.46929, detailRoute: '/tournament/summer-slam',
  },
  {
    id: 't2', category: 'tournament',
    name: 'Bradenton Open',
    photo: 'https://images.unsplash.com/photo-1529832393073-e362750f78b3?w=400&h=300&fit=crop&q=80',
    datetime: 'Aug 3 – 4, 2025', distance: '11.5 miles away',
    skillLevel: '3.0 – 4.5', players: 96, maxPlayers: 128,
    latitude: 27.47978, longitude: -82.58812, detailRoute: '/tournament/summer-slam',
  },
];

const TABS: { key: Category; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'community',  label: 'Community Play', icon: 'people-outline'  },
  { key: 'court',      label: 'Courts',         icon: 'apps-outline'    },
  { key: 'tournament', label: 'Tournaments',    icon: 'trophy-outline'  },
];

const RADIUS_OPTIONS = [5, 10, 20, 50] as const;

function PinPhoto({
  uri, name, style,
}: {
  uri: string;
  name: string;
  style: object;
}) {
  if (uri) {
    return <Image source={{ uri }} style={style} resizeMode="cover" />;
  }
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[style, ph.wrap]}>
      <PickleballIcon size={22} color={L.gold} style={{ marginBottom: 4 }} />
      <Text style={ph.initials}>{initials}</Text>
    </View>
  );
}

const ph = StyleSheet.create({
  wrap:     { backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center' },
  initials: { color: L.gold, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
});


// ─── Facility bottom sheet ──────────────────────────────────────────────────────

const ACCESS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  public:     { label: 'PUBLIC',     bg: '#DCFCE7', color: '#16A34A' },
  membership: { label: 'MEMBERSHIP', bg: '#FEF9C3', color: '#CA8A04' },
  private:    { label: 'PRIVATE',    bg: '#FEE2E2', color: '#DC2626' },
};

function FacilityBottomSheet({
  facility, onDismiss, sheetY,
}: {
  facility: FacilityWithPrimaryPhoto;
  onDismiss: () => void;
  sheetY: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const access = facilityAccessType(facility);
  const badge  = ACCESS_BADGE[access];
  const dist   = facility.distanceMeters != null
    ? `${(facility.distanceMeters / 1609.344).toFixed(1)} mi`
    : null;

  const amenities: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean }[] = [
    { icon: 'bulb-outline',    label: 'Lights',    active: facility.lighting  },
    { icon: 'man-outline',     label: 'Restrooms', active: facility.restrooms },
    { icon: 'water-outline',   label: 'Water',     active: facility.water     },
    { icon: 'car-outline',     label: 'Parking',   active: facility.parking   },
  ];

  return (
    <Animated.View
      style={[bs.wrap, { paddingBottom: tabBarClearance(insets.bottom), transform: [{ translateY: sheetY }] }]}
    >
      <View style={bs.handleWrap}><View style={bs.handle} /></View>
      <View style={[bs.card, { flexDirection: 'column' }]}>
        <View style={{ padding: 14, gap: 8 }}>
          {/* Top row */}
          <View style={bs.topRow}>
            <View style={[fbs.badge, { backgroundColor: badge.bg }]}>
              <Text style={[fbs.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
            <View style={bs.iconGroup}>
              {facility.verified && (
                <View style={fbs.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#2563EB" />
                  <Text style={fbs.verifiedText}>VERIFIED</Text>
                </View>
              )}
              <TouchableOpacity style={bs.closeBtn} onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={15} color={L.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Name */}
          <Text style={bs.title} numberOfLines={2}>{facility.name}</Text>

          {/* Location + distance */}
          <View style={bs.metaRow}>
            <View style={bs.metaItem}>
              <Ionicons name="location-outline" size={12} color={L.textMuted} />
              <Text style={bs.metaText}>{facility.city}, {facility.state}</Text>
            </View>
            {dist && (
              <>
                <View style={bs.metaDot} />
                <Text style={bs.metaText}>{dist} away</Text>
              </>
            )}
          </View>

          {/* Court count */}
          <View style={bs.metaRow}>
            <View style={bs.metaItem}>
              <PickleballIcon size={12} color={L.textMuted} />
              <Text style={bs.metaText}>
                {facility.court_count} courts
                {facility.indoor_courts > 0 && ` (${facility.indoor_courts} indoor)`}
                {facility.outdoor_courts > 0 && ` (${facility.outdoor_courts} outdoor)`}
              </Text>
            </View>
            {facility.surface_type && (
              <>
                <View style={bs.metaDot} />
                <Text style={bs.metaText}>{facility.surface_type}</Text>
              </>
            )}
          </View>

          {/* Amenities */}
          <View style={fbs.amenitiesRow}>
            {amenities.map(a => (
              <View key={a.label} style={[fbs.amenityChip, !a.active && fbs.amenityInactive]}>
                <Ionicons name={a.icon} size={13} color={a.active ? L.navy : L.border} />
                <Text style={[fbs.amenityLabel, !a.active && { color: L.border }]}>{a.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={bs.cta}
            activeOpacity={0.85}
            onPress={() => { onDismiss(); router.push(`/facility/${facility.id}` as never); }}
          >
            <Text style={bs.ctaText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const fbs = StyleSheet.create({
  badge: { flexDirection: 'row', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DBEAFE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { fontSize: 9, fontWeight: '800', color: '#2563EB', letterSpacing: 0.4 },
  amenitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  amenityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: L.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  amenityInactive: { opacity: 0.35 },
  amenityLabel: { fontSize: 10, fontWeight: '600', color: L.navy },
});


// ─── Bottom sheet ───────────────────────────────────────────────────────────────

function BottomSheet({
  pin, onDismiss, sheetY,
}: {
  pin: ExplorePin;
  onDismiss: () => void;
  sheetY: Animated.Value;
}) {
  const catLabel =
    pin.category === 'community'  ? 'COMMUNITY PLAY' :
    pin.category === 'tournament' ? 'TOURNAMENT'      : 'COURT';
  const catIcon: keyof typeof Ionicons.glyphMap =
    pin.category === 'community'  ? 'people-outline'  :
    pin.category === 'tournament' ? 'trophy-outline'   : 'apps-outline';
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      style={[bs.wrap, { paddingBottom: tabBarClearance(insets.bottom), transform: [{ translateY: sheetY }] }]}
    >
      {/* Drag handle */}
      <View style={bs.handleWrap}>
        <View style={bs.handle} />
      </View>

      {/* Card */}
      <View style={bs.card}>
        {/* Photo */}
        <PinPhoto uri={pin.photo} name={pin.name} style={bs.photo} />

        {/* Content */}
        <View style={bs.content}>
          {/* Category + bookmark */}
          <View style={bs.topRow}>
            <View style={bs.catRow}>
              <Ionicons name={catIcon} size={13} color={L.gold} />
              <Text style={bs.catLabel}>{catLabel}</Text>
            </View>
            <View style={bs.iconGroup}>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="bookmark-outline" size={20} color={L.textSub} />
              </TouchableOpacity>
              <TouchableOpacity style={bs.closeBtn} onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={15} color={L.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Title */}
          <Text style={bs.title} numberOfLines={2}>{pin.name}</Text>

          {/* Date + distance */}
          <View style={bs.metaRow}>
            <View style={bs.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={L.textMuted} />
              <Text style={bs.metaText}>{pin.datetime}</Text>
            </View>
            <View style={bs.metaDot} />
            <View style={bs.metaItem}>
              <Ionicons name="location-outline" size={12} color={L.textMuted} />
              <Text style={bs.metaText}>{pin.distance}</Text>
            </View>
          </View>

          {/* Skill + players/courts */}
          <View style={bs.detailRow}>
            <View style={bs.skillPill}>
              <Text style={bs.skillText}>{pin.skillLevel}</Text>
            </View>
            <View style={bs.playersRow}>
              <AppIcon
                name={pin.category === 'court' ? 'pickleball' : 'people-outline'}
                size={12} color={L.textSub}
              />
              <Text style={bs.playersText}>
                {pin.category === 'court'
                  ? `${pin.courts} Courts`
                  : `${pin.players} / ${pin.maxPlayers} Players`}
              </Text>
            </View>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={bs.cta}
            activeOpacity={0.85}
            onPress={() => router.push(pin.detailRoute as never)}
          >
            <Text style={bs.ctaText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const bs = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    // paddingBottom is applied inline from tabBarClearance(insets.bottom).
  },
  handleWrap: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: L.border },
  iconGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: L.white,
    borderRadius: radius.card,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 8,
    borderWidth: 1, borderColor: L.border,
  },
  photo: { width: 110, height: 140 },
  content: { flex: 1, padding: 12, gap: 6 },

  topRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  catLabel: { color: L.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  title:    { color: L.navy, fontSize: 15, fontWeight: '900', lineHeight: 20, marginTop: 2 },

  metaRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: L.textMuted, fontSize: 11, fontWeight: '500' },
  metaDot:  { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.border },

  detailRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  skillPill: {
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  skillText:   { color: L.gold, fontSize: 11, fontWeight: '700' },
  playersRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playersText: { color: L.textSub, fontSize: 11, fontWeight: '600' },

  cta: {
    backgroundColor: L.navy, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 4,
  },
  ctaText: { color: L.white, fontSize: 13, fontWeight: '800' },
});

// ─── List card ──────────────────────────────────────────────────────────────────

function ListCard({ pin }: { pin: ExplorePin }) {
  const catLabel =
    pin.category === 'community'  ? 'COMMUNITY PLAY' :
    pin.category === 'tournament' ? 'TOURNAMENT'      : 'COURT';
  const catIcon: keyof typeof Ionicons.glyphMap =
    pin.category === 'community'  ? 'people-outline'  :
    pin.category === 'tournament' ? 'trophy-outline'   : 'apps-outline';

  return (
    <TouchableOpacity
      style={lc.card}
      activeOpacity={0.85}
      onPress={() => router.push(pin.detailRoute as never)}
    >
      <PinPhoto uri={pin.photo} name={pin.name} style={lc.photo} />
      <View style={lc.content}>
        <View style={lc.catRow}>
          <Ionicons name={catIcon} size={12} color={L.gold} />
          <Text style={lc.catLabel}>{catLabel}</Text>
          <TouchableOpacity style={{ marginLeft: 'auto' }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="bookmark-outline" size={17} color={L.textSub} />
          </TouchableOpacity>
        </View>
        <Text style={lc.title} numberOfLines={1}>{pin.name}</Text>
        <View style={lc.metaRow}>
          <View style={lc.metaItem}>
            <Ionicons name="calendar-outline" size={11} color={L.textMuted} />
            <Text style={lc.metaText}>{pin.datetime}</Text>
          </View>
          <View style={lc.metaItem}>
            <Ionicons name="location-outline" size={11} color={L.textMuted} />
            <Text style={lc.metaText}>{pin.distance}</Text>
          </View>
        </View>
        <View style={lc.bottomRow}>
          <View style={lc.skillPill}>
            <Text style={lc.skillText}>{pin.skillLevel}</Text>
          </View>
          {pin.category === 'court' ? (
            <Text style={lc.sub}>{pin.courts} courts</Text>
          ) : (
            <Text style={lc.sub}>{pin.players} / {pin.maxPlayers} players</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const lc = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: L.white,
    borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    overflow: 'hidden', marginBottom: 12,
  },
  photo:   { width: 100, height: 120 },
  content: { flex: 1, padding: 12, gap: 5 },
  catRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  catLabel:{ color: L.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  title:   { color: L.navy, fontSize: 15, fontWeight: '800' },
  metaRow: { gap: 4 },
  metaItem:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:{ color: L.textMuted, fontSize: 11, fontWeight: '500' },
  bottomRow:{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  skillPill:{
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  skillText:{ color: L.gold, fontSize: 10, fontWeight: '700' },
  sub:      { color: L.textSub, fontSize: 11, fontWeight: '600' },
});

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const location = useCurrentLocation();
  const { setTriggerVisible } = useSlideMenu();

  // Hide the floating hamburger trigger while this screen is focused — the
  // header here has its own dedicated actions (Filters/Map), no menu access
  // needed. Restored on blur.
  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  const [category,      setCategory]      = useState<Category>('community');
  const [view,          setView]          = useState<'map' | 'list'>('map');
  const [search,        setSearch]        = useState('');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [accessFilter,  setAccessFilter]  = useState<AccessFilter>('all');
  const [facilities,    setFacilities]    = useState<FacilityWithPrimaryPhoto[]>([]);
  const [facLoading,    setFacLoading]    = useState(false);
  const [liveCommunity, setLiveCommunity] = useState<ExplorePin[] | null>(null);
  const [region,        setRegion]        = useState<Region>(() => locationToRegion(location));
  const refreshLocation = location.refresh;

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [radiusMiles,        setRadiusMiles]         = useState<number>(DEFAULT_RADIUS_MILES);
  const [selectedSkillLabels, setSelectedSkillLabels] = useState<string[]>([]);
  const [hideFullGames,      setHideFullGames]        = useState(false);
  // Same {0:5, 1:25, 2:50, 3:Any} mapping as the Find Games Customize sheet
  // (index.tsx), so "5 mi / 25 mi / 50 mi / Any distance" means the same
  // thing everywhere in the app.
  const [distanceIdx,        setDistanceIdx]          = useState(DISTANCE_STEPS.length - 1);

  function toggleSkillLabel(label: string) {
    setSelectedSkillLabels(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  }

  const hasActiveFilters = category === 'court'
    ? accessFilter !== 'all' || radiusMiles !== DEFAULT_RADIUS_MILES
    : category === 'community'
      ? selectedSkillLabels.length > 0 || hideFullGames || distanceIdx < DISTANCE_STEPS.length - 1
      : false;

  const sheetY = useRef(new Animated.Value(SHEET_H + 60)).current;
  const origin = React.useMemo<Coordinates>(() => ({ lat: location.lat, lng: location.lng }), [location.lat, location.lng]);

  // Zillow-style "search this area": panning the map never refetches by
  // itself (courts are GPS + radiusMiles anchored, see fetchFacilities
  // below) — searchCenter overrides that anchor once the user explicitly
  // asks to search where they've panned to. null means "use GPS origin".
  const [searchCenter, setSearchCenter] = useState<Coordinates | null>(null);
  const [pannedCenter, setPannedCenter] = useState<Coordinates | null>(null);
  const effectiveOrigin = searchCenter ?? origin;
  const showSearchAreaBtn =
    category === 'court' && pannedCenter != null && distanceMiles(pannedCenter, effectiveOrigin) > 2;

  function handleMapRegionChangeComplete(nextRegion: Region) {
    setPannedCenter({ lat: nextRegion.latitude, lng: nextRegion.longitude });
  }

  function handleSearchThisArea() {
    if (!pannedCenter) return;
    setSearchCenter(pannedCenter);
    setPannedCenter(null);
  }

  // Re-center only when we mean to: on the first real GPS fix, and when the
  // locate button is pressed. Recentering on every coords change moved the
  // camera two or three times per visit (fallback → last-known → live fix) and
  // again on any GPS jitter, which read as the map scrolling by itself.
  const followRef = useRef(true);

  useEffect(() => {
    if (!followRef.current || location.isFallback) return;
    followRef.current = false;
    setRegion(locationToRegion(origin));
  }, [origin, location.isFallback]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshLocation();
    }, [refreshLocation]),
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setFacLoading(true);
      fetchFacilities({ lat: effectiveOrigin.lat, lng: effectiveOrigin.lng, radiusMiles, limit: 50 })
        .then(data => { if (active) setFacilities(data); })
        .catch(err => console.warn('[Nearby] fetchFacilities error:', err))
        .finally(() => { if (active) setFacLoading(false); });
      fetchNearbyPlayEvents(20)
        .then(data => {
          if (!active) return;
          const pins = data.map(e => playEventToPin(e, effectiveOrigin)).filter((pin): pin is ExplorePin => pin != null);
          setLiveCommunity(pins.length > 0 ? pins : null);
        })
        .catch(() => { if (active) setLiveCommunity(null); });
      return () => { active = false; };
    }, [effectiveOrigin, radiusMiles]),
  );

  const courtPins: ExplorePin[] = React.useMemo(() => {
    let facs = facilities;
    if (accessFilter !== 'all') {
      facs = facs.filter(f => facilityAccessType(f) === accessFilter);
    }
    return facs.map(facilityToPin);
  }, [facilities, accessFilter]);

  const communityPinsRaw = category === 'community'
    ? (liveCommunity ?? [])
    : PINS.filter(p => p.category === category);

  // Skill/hide-full/distance only apply to Community Play, where we have real
  // skill_min/skill_max, live participant counts, and computed distance to
  // filter against. Distance mapping matches the Find Games Customize sheet
  // exactly (index.tsx) for consistency.
  const maxDistanceMi = { 0: 5, 1: 25, 2: 50 }[distanceIdx] as number | undefined;
  const communityPins = category === 'community'
    ? communityPinsRaw.filter(p => {
        if (hideFullGames && p.maxPlayers > 0 && p.players >= p.maxPlayers) return false;
        if (maxDistanceMi != null && p.distanceMi != null && p.distanceMi > maxDistanceMi) return false;
        if (selectedSkillLabels.length > 0) {
          if (p.skillMin == null && p.skillMax == null) return true; // no range set — always show
          const ranges = SKILL_RANGES.filter(r => selectedSkillLabels.includes(r.label));
          const overlaps = ranges.some(r => {
            const pMax = p.skillMax ?? p.skillMin ?? Infinity;
            const pMin = p.skillMin ?? -Infinity;
            const rMax = r.max ?? Infinity;
            return pMin <= rMax && pMax >= r.min;
          });
          if (!overlaps) return false;
        }
        return true;
      })
    : communityPinsRaw;
  const eventPins = communityPins;
  const pins = category === 'court' ? courtPins : eventPins;

  const filteredPins = search.trim()
    ? pins.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : pins;

  const selectedPin = filteredPins.find(p => p.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedPin) {
      Animated.spring(sheetY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 11,
      }).start();
    } else {
      Animated.timing(sheetY, {
        toValue: SHEET_H + 60,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [selectedPin, sheetY]);

  function handleSelectPin(id: string) {
    setSelectedId(prev => (prev === id ? null : id));
  }

  function handleDismissSheet() {
    setSelectedId(null);
  }

  function handleCategoryChange(cat: Category) {
    setCategory(cat);
    setSelectedId(null);
    setAccessFilter('all');
  }

  function handleLocate() {
    // Center on what we already know for instant feedback, then let the effect
    // above land on the fresh fix once it arrives.
    followRef.current = true;
    setSearchCenter(null);
    setPannedCenter(null);
    setRegion(locationToRegion(origin));
    void refreshLocation();
  }

  const locationLabel = location.isFallback
    ? `Using ${FALLBACK_LOCATION_LABEL}`
    : 'Using your location';

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.headerLeft}>
          <Text style={s.title}>Explore</Text>
        </View>

        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.headerBtn}
            activeOpacity={0.75}
            onPress={() => setFilterModalVisible(true)}
          >
            <Ionicons name="options-outline" size={20} color={L.gold} />
            {hasActiveFilters && <View style={s.headerBtnDot} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.headerBtn}
            activeOpacity={0.75}
            onPress={() => {
              setView(v => v === 'map' ? 'list' : 'map');
              setSelectedId(null);
            }}
          >
            <Ionicons
              name={view === 'map' ? 'map-outline' : 'list-outline'}
              size={20}
              color={L.gold}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={18} color={L.gold} />
          <TextInput
            style={s.searchInput}
            placeholder="Search courts, games, or players"
            placeholderTextColor={L.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={L.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={s.locationStatus}>
          <Ionicons name={location.isFallback ? 'location-outline' : 'navigate-circle-outline'} size={13} color={L.textMuted} />
          <Text style={s.locationStatusText}>{locationLabel}</Text>
          {location.loading && <ActivityIndicator size="small" color={L.gold} />}
        </View>
      </View>

      <View style={s.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabsRow}
        >
          {TABS.map(tab => {
            const active = category === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, active && s.tabActive]}
                onPress={() => handleCategoryChange(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={active ? L.white : L.gold}
                />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {category === 'court' && (
        <View style={s.accessFilterWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.accessFilterRow}>
            {(['all', 'public', 'membership', 'private'] as AccessFilter[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[s.accessChip, accessFilter === f && s.accessChipActive]}
                onPress={() => { setAccessFilter(f); setSelectedId(null); }}
                activeOpacity={0.8}
              >
                <Text style={[s.accessChipLabel, accessFilter === f && s.accessChipLabelActive]}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={s.content}>
        {view === 'map' && (
          <>
            <ExploreMap
              pins={filteredPins}
              selectedId={selectedId}
              onSelectPin={handleSelectPin}
              region={region}
              onRegionChangeComplete={handleMapRegionChangeComplete}
              onLocate={handleLocate}
            />
            {showSearchAreaBtn && (
              <TouchableOpacity
                style={[s.searchAreaBtn, { top: insets.top + 96 }]}
                activeOpacity={0.85}
                onPress={handleSearchThisArea}
              >
                <Ionicons name="search" size={14} color={L.white} />
                <Text style={s.searchAreaBtnText}>Search this area</Text>
              </TouchableOpacity>
            )}
            {selectedPin?.facilityData ? (
              <FacilityBottomSheet
                facility={selectedPin.facilityData}
                onDismiss={handleDismissSheet}
                sheetY={sheetY}
              />
            ) : selectedPin ? (
              <BottomSheet
                pin={selectedPin}
                onDismiss={handleDismissSheet}
                sheetY={sheetY}
              />
            ) : null}

            {category === 'court' && facLoading && (
              <View style={[s.loadingOverlay, { bottom: tabBarClearance(insets.bottom) + 72 }]}>
                <ActivityIndicator size="small" color={L.navy} />
              </View>
            )}
          </>
        )}

        {view === 'list' && (
          <ScrollView
            contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 120 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.listCount}>
              {filteredPins.length}{' '}
              {category === 'community' ? 'EVENTS' : category === 'tournament' ? 'TOURNAMENTS' : 'COURTS'} NEARBY
            </Text>
            {facLoading && category === 'court' ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={L.navy} />
            ) : filteredPins.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="search-outline" size={36} color={L.border} />
                <Text style={s.emptyText}>No results found</Text>
              </View>
            ) : filteredPins.map(pin => (
              <ListCard key={pin.id} pin={pin} />
            ))}
          </ScrollView>
        )}
      </View>

      <ExploreFilterModal
        visible={filterModalVisible}
        category={category}
        onClose={() => setFilterModalVisible(false)}
        accessFilter={accessFilter}
        onChangeAccessFilter={(f) => { setAccessFilter(f); setSelectedId(null); }}
        radiusMiles={radiusMiles}
        onChangeRadiusMiles={setRadiusMiles}
        selectedSkillLabels={selectedSkillLabels}
        onToggleSkillLabel={toggleSkillLabel}
        hideFullGames={hideFullGames}
        onChangeHideFullGames={setHideFullGames}
        distanceIdx={distanceIdx}
        onChangeDistanceIdx={setDistanceIdx}
      />
    </View>
  );
}

// ─── Filter modal ─────────────────────────────────────────────────────────────

function ExploreFilterModal({
  visible, category, onClose,
  accessFilter, onChangeAccessFilter,
  radiusMiles, onChangeRadiusMiles,
  selectedSkillLabels, onToggleSkillLabel,
  hideFullGames, onChangeHideFullGames,
  distanceIdx, onChangeDistanceIdx,
}: {
  visible: boolean;
  category: Category;
  onClose: () => void;
  accessFilter: AccessFilter;
  onChangeAccessFilter: (f: AccessFilter) => void;
  radiusMiles: number;
  onChangeRadiusMiles: (miles: number) => void;
  selectedSkillLabels: string[];
  onToggleSkillLabel: (label: string) => void;
  hideFullGames: boolean;
  onChangeHideFullGames: (value: boolean) => void;
  distanceIdx: number;
  onChangeDistanceIdx: (idx: number) => void;
}) {
  const title =
    category === 'community' ? 'Filter Community Play' :
    category === 'court'     ? 'Filter Courts'         : 'Filter Tournaments';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={fm.backdrop} onPress={onClose}>
        <Pressable style={fm.sheet} onPress={() => {}}>
          <View style={fm.grabber} />

          <View style={fm.headerRow}>
            <Text style={fm.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={L.navy} />
            </TouchableOpacity>
          </View>

          {category === 'community' && (
            <>
              <Text style={fm.sectionLabel}>MAX DISTANCE</Text>
              <View style={fm.chipRow}>
                {DISTANCE_STEPS.map((label, idx) => {
                  const active = idx === distanceIdx;
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[fm.chip, active && fm.chipActive]}
                      onPress={() => onChangeDistanceIdx(idx)}
                      activeOpacity={0.8}
                    >
                      <Text style={[fm.chipText, active && fm.chipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={fm.hint}>Same distance ranges used in Find Games.</Text>

              <Text style={fm.sectionLabel}>SKILL LEVEL</Text>
              <View style={fm.chipRow}>
                {SKILL_RANGES.map(range => {
                  const active = selectedSkillLabels.includes(range.label);
                  return (
                    <TouchableOpacity
                      key={range.label}
                      style={[fm.chip, active && fm.chipActive]}
                      onPress={() => onToggleSkillLabel(range.label)}
                      activeOpacity={0.8}
                    >
                      {active && <Ionicons name="checkmark" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />}
                      <Text style={[fm.chipText, active && fm.chipTextActive]}>{range.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={fm.hint}>Leave blank to see all skill levels. Games with no skill range set always show.</Text>

              <View style={fm.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={fm.toggleLabel}>Hide Full Games</Text>
                  <Text style={fm.toggleSub}>Only show games with open spots</Text>
                </View>
                <Switch
                  value={hideFullGames}
                  onValueChange={onChangeHideFullGames}
                  trackColor={{ false: L.border, true: L.gold }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </>
          )}

          {category === 'court' && (
            <>
              <Text style={fm.sectionLabel}>ACCESS TYPE</Text>
              <View style={fm.chipRow}>
                {(['all', 'public', 'membership', 'private'] as AccessFilter[]).map(f => {
                  const active = accessFilter === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[fm.chip, active && fm.chipActive]}
                      onPress={() => onChangeAccessFilter(f)}
                      activeOpacity={0.8}
                    >
                      <Text style={[fm.chipText, active && fm.chipTextActive]}>
                        {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={fm.sectionLabel}>MAX DISTANCE</Text>
              <View style={fm.chipRow}>
                {RADIUS_OPTIONS.map(miles => {
                  const active = radiusMiles === miles;
                  return (
                    <TouchableOpacity
                      key={miles}
                      style={[fm.chip, active && fm.chipActive]}
                      onPress={() => onChangeRadiusMiles(miles)}
                      activeOpacity={0.8}
                    >
                      <Text style={[fm.chipText, active && fm.chipTextActive]}>{miles} mi</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {category === 'tournament' && (
            <Text style={fm.hint}>Tournament filters are coming soon.</Text>
          )}

          <TouchableOpacity style={fm.applyBtn} onPress={onClose} activeOpacity={0.88}>
            <Text style={fm.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const fm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32,
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: L.border, alignSelf: 'center', marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: { color: L.navy, fontSize: 17, fontWeight: '900' },
  sectionLabel: {
    color: L.navy, fontSize: 12, fontWeight: '800',
    letterSpacing: 0.5, marginBottom: 10, marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 9, backgroundColor: L.page,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.textSub, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  hint: { color: L.textSub, fontSize: 11, marginBottom: 20 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, marginBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  toggleLabel: { color: L.navy, fontSize: 14, fontWeight: '700' },
  toggleSub: { color: L.textSub, fontSize: 12, marginTop: 2 },
  applyBtn: {
    backgroundColor: L.gold, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
  },
  applyBtnText: { color: L.navy, fontSize: 15, fontWeight: '800' },
});
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingBottom: 14,
    backgroundColor: L.bg,
  },
  headerLeft:    { flex: 1 },
  title:         { color: L.navy, fontSize: 28, fontWeight: '900', lineHeight: 32 },
  titleStar:     { fontSize: 22 },
  headerActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  headerBtn: {
    alignItems: 'center', justifyContent: 'center',
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
    position: 'relative',
  },
  headerBtnDot: {
    position: 'absolute', top: 6, right: 7,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: L.gold, borderWidth: 1.5, borderColor: L.bg,
  },

  // Search
  searchWrap: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: 12,
    backgroundColor: L.bg,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: L.bg,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: 14, paddingHorizontal: 14, height: 48,
  },
  searchInput: { flex: 1, color: L.text, fontSize: 14, fontWeight: '400' },
  locationStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 4 },
  locationStatusText: { color: L.textMuted, fontSize: 11, fontWeight: '600' },

  // Category tabs
  tabsWrap: {
    backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
    paddingBottom: 12,
  },
  tabsRow: { paddingHorizontal: spacing.screenH, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 24, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  tabActive:      { backgroundColor: L.navy, borderColor: L.navy },
  tabLabel:       { color: L.navy, fontSize: 13, fontWeight: '700' },
  tabLabelActive: { color: L.white },

  // Content area
  content: { flex: 1, position: 'relative' },

  // "Search this area" pill (Zillow-style pan-to-search)
  searchAreaBtn: {
    position: 'absolute', alignSelf: 'center', zIndex: 5,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 5,
  },
  searchAreaBtnText: { color: L.white, fontSize: 13, fontWeight: '700' },

  // List
  listContent: { padding: spacing.screenH },
  listCount: {
    color: L.textMuted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.2, marginBottom: 14,
  },

  // Empty state
  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 60, gap: 12,
  },
  emptyText: { color: L.textMuted, fontSize: 15, fontWeight: '500' },

  // Access filter (courts tab)
  accessFilterWrap: {
    backgroundColor: L.bg,
    borderBottomWidth: 1, borderBottomColor: L.border,
    paddingBottom: 10,
  },
  accessFilterRow: { paddingHorizontal: spacing.screenH, gap: 8 },
  accessChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  accessChipActive: { backgroundColor: L.gold, borderColor: L.gold },
  accessChipLabel: { color: L.navy, fontSize: 12, fontWeight: '700' },
  accessChipLabelActive: { color: L.white },

  // Loading overlay on map
  loadingOverlay: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: L.white, borderRadius: 20, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
});




