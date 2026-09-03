import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Linking, Alert, Modal, Pressable, Share, TextInput,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, displayText } from '@/theme';
// Shapes come from the shared token source. `radius` is aliased because
// @/theme exports its own with different values. See DESIGN_STANDARD.md.
import { radius as shape } from '@shared/tokens';
import { DEFAULT_FACILITY_COVER } from '@/lib/facilityCover';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { useSupportContext } from '@/lib/support/supportContext';
import { createSupportTicket } from '@/lib/supportTicketService';
import { appLinks } from '@/lib/appLinks';
import { AppIcon, StatusChip } from '@/components';
import { VenueMapCard } from '@/components/VenueMapCard';
import {
  fetchFacilityById,
  fetchFacilityPlayEvents,
  fetchFacilityTournaments,
  facilityAccessType,
  type FacilityDetail,
  type FacilityPlayEvent,
  type FacilityTournament,
} from '@/lib/supabase/facilities';
import { fetchCourts, type Court } from '@/lib/supabase/courts';
import { fetchBallMachines, type BallMachine } from '@/lib/supabase/ballMachines';
import { fetchActiveFlashDeal } from '@/lib/supabase/flashDeals';
import { fetchAssetAvailability, type AssetAvailabilitySlot, type ReservableAssetType } from '@/lib/supabase/reservations';
import { fetchEventWeather, type EventWeatherResult } from '@/lib/supabase/weather';
import { EventWeatherCard } from '@/components/EventWeatherCard';
import { getBookingSearch, setBookingSearch, setBookingFacility, setBookingSelection } from '@/lib/bookingStore';

const L = {
  bg:       colors.bg,
  page:     colors.page,
  navy:     colors.navy,
  gold:     colors.gold,
  goldBg:   colors.goldBg,
  text:     colors.text,
  textSub:  colors.textSub,
  textMuted:colors.textSub,
  border:   colors.border,
  white:    '#FFFFFF',
};

// ─── Access badge config ───────────────────────────────────────────────────────

const ACCESS_BADGE = {
  public:     { label: 'Public',     bg: '#DCFCE7', color: '#16A34A' },
  membership: { label: 'Membership', bg: '#FEF9C3', color: '#CA8A04' },
  private:    { label: 'Private',    bg: '#FEE2E2', color: '#DC2626' },
};

// ─── Event type helpers ────────────────────────────────────────────────────────

function eventTypeLabel(t: string) {
  switch (t) {
    case 'open_play':       return 'Quick Game';
    case 'round_robin':     return 'Round Robin';
    case 'mini_tournament': return 'Mini Tournament';
    case 'mixer':           return 'Mixer';
    case 'ladder':          return 'Ladder';
    case 'kings_court':     return "King's Court";
    case 'clinic':          return 'Clinic';
    default:                return 'Event';
  }
}

function eventRoute(e: FacilityPlayEvent): string {
  switch (e.event_type) {
    case 'round_robin':     return `/round-robin-created?id=${e.id}`;
    case 'mini_tournament': return `/mini-tournament-created?id=${e.id}`;
    default:                return `/quick-game-created?id=${e.id}`;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'open':        return '#16A34A';
    case 'full':        return '#CA8A04';
    case 'in_progress': return '#2563EB';
    case 'completed':   return '#6B7280';
    case 'cancelled':   return '#DC2626';
    default:            return '#6B7280';
  }
}

function fmtEventDate(dateStr: string, timeStr: string | null): string {
  try {
    const d = new Date(`${dateStr}T${timeStr ?? '00:00:00'}`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      (timeStr ? ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');
  } catch { return dateStr; }
}

function fmtTournamentDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

// ─── Availability summary helpers ──────────────────────────────────────────────
// "N courts open" per hour, derived from real Phase 2 occupancy data
// (fetchAssetAvailability), never from operating_hours -- an asset only
// counts as "open" at an hour if no held/confirmed reservation overlaps it.
// Read-only: this never creates a reservation.

const SUMMARY_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatSummaryDateLabel(dateStr: string): string {
  const today = todayIsoDate();
  if (dateStr === today) return 'Today';
  if (dateStr === addDaysIso(today, 1)) return 'Tomorrow';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

// An asset at a given hour is either fully 'open' (no reservation), 'joinable'
// (reserved but currentPlayers < maxPlayers -- e.g. a single player's doubles
// game still short a partner), or 'full'. Surfacing 'joinable' separately is
// the whole point: a plain busy/open summary would hide these as unavailable,
// exactly when a solo player most wants to see them.
type AssetHourState = 'open' | 'joinable' | 'full';

function assetStateAtHour(slots: AssetAvailabilitySlot[], dateStr: string, hour: number): AssetHourState {
  const hourStart = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
  const slot = slots.find(s => new Date(s.startsAt) < hourEnd && new Date(s.endsAt) > hourStart);
  if (!slot) return 'open';
  return slot.currentPlayers < slot.maxPlayers ? 'joinable' : 'full';
}

function computeHourlyOpenCounts(
  slotsByAsset: AssetAvailabilitySlot[][],
  dateStr: string,
): { hour: number; open: number; joinable: number }[] {
  return SUMMARY_HOURS.map(hour => {
    let open = 0, joinable = 0;
    for (const slots of slotsByAsset) {
      const state = assetStateAtHour(slots, dateStr, hour);
      if (state === 'open') open++;
      else if (state === 'joinable') joinable++;
    }
    return { hour, open, joinable };
  });
}


// ─── Inventory card (court / ball machine) ─────────────────────────────────────

function InventoryCard({
  name, subtitle, priceCents, dealPercent,
}: {
  name: string;
  subtitle: string | null;
  priceCents: number | null;
  dealPercent: number | null;
}) {
  const hasDeal = dealPercent != null && priceCents != null;
  const finalPrice = hasDeal ? Math.round(priceCents! * (100 - dealPercent!) / 100) : priceCents;

  return (
    <View style={ic.card}>
      <View style={{ flex: 1 }}>
        <Text style={ic.name}>{name}</Text>
        {subtitle ? <Text style={ic.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {hasDeal && <StatusChip label="FLASH DEAL" variant="gold" icon="flash" />}
        {finalPrice != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            {hasDeal && <Text style={ic.priceStrike}>${Math.round(priceCents! / 100)}</Text>}
            <Text style={ic.price}>${Math.round(finalPrice / 100)}/hr</Text>
          </View>
        ) : (
          <Text style={ic.priceUnavailable}>Pricing unavailable</Text>
        )}
      </View>
    </View>
  );
}
const ic = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border },
  name:     { color: L.text, fontSize: 14, fontWeight: '700' },
  subtitle: { color: L.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  price:        { color: L.navy, fontSize: 14, fontWeight: '800' },
  priceStrike:  { color: L.textMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'line-through' },
  priceUnavailable: { color: L.textMuted, fontSize: 11, fontWeight: '500' },
});

// ─── Hero photo backdrop ──────────────────────────────────────────────────────

// A facility with no photo of its own shows a bundled courts image rather than
// the flat navy block with venue initials it used to get, which read as a
// missing image rather than a chosen one. The hero's existing dark overlay and
// gradient sit above it and keep the title legible.
//
// Both branches return the SAME shape deliberately. The first version nested
// the fallback image inside the initials View, which escaped the hero and
// painted the whole screen; there is no reason for the two paths to differ
// structurally when only the source changes.
function HeroPhoto({ uri, height }: { uri: string | null; height: number }) {
  return (
    <Image
      source={uri ? { uri } : DEFAULT_FACILITY_COVER}
      style={[s.heroImage, { height }]}
      resizeMode="cover"
    />
  );
}

// ─── Amenity chip (compact, horizontal) ────────────────────────────────────────

function AmenityChip({ icon, label, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean }) {
  return (
    <View style={[a.chip, !active && a.chipInactive]}>
      <Ionicons name={icon} size={15} color={active ? L.navy : L.border} />
      <Text style={[a.label, !active && a.labelInactive]}>{label}</Text>
    </View>
  );
}
const a = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  chipInactive: { opacity: 0.4 },
  label:        { color: L.text, fontSize: 12, fontWeight: '600' },
  labelInactive:{ color: L.textMuted },
});

// ─── Map bottom sheet ───────────────────────────────────────────────────────────

function MapSheet({
  visible, onClose, facility, onGetDirections,
}: {
  visible: boolean;
  onClose: () => void;
  facility: FacilityDetail;
  onGetDirections: () => void;
}) {
  const latNum = Number(facility.latitude);
  const lngNum = Number(facility.longitude);
  const lat = Number.isFinite(latNum) ? latNum : null;
  const lng = Number.isFinite(lngNum) ? lngNum : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={ms.backdrop} onPress={onClose}>
        <Pressable style={ms.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={ms.header}>
            <View style={ms.headerTitleRow}>
              <Ionicons name="location" size={16} color={L.navy} />
              <Text style={ms.headerTitle}>Map</Text>
            </View>
            <TouchableOpacity style={ms.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={18} color={L.white} />
            </TouchableOpacity>
          </View>

          <View style={ms.mapWrap}>
            {visible && lat != null && lng != null ? (
              <VenueMapCard latitude={lat} longitude={lng} name={facility.name} />
            ) : (
              <View style={ms.mapUnavailable}>
                <Ionicons name="map-outline" size={28} color={L.border} />
                <Text style={ms.mapUnavailableText}>Map preview unavailable</Text>
              </View>
            )}
          </View>

          <Text style={ms.name}>{facility.name}</Text>
          <Text style={ms.address}>
            {facility.address}, {facility.city}, {facility.state}{facility.postal_code ? ` ${facility.postal_code}` : ''}
          </Text>

          <TouchableOpacity style={ms.directionsBtn} activeOpacity={0.88} onPress={onGetDirections}>
            <Ionicons name="navigate-outline" size={18} color={L.white} />
            <Text style={ms.directionsText}>Get Directions</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg,
    borderTopLeftRadius: shape.card + 8,
    borderTopRightRadius: shape.card + 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle:    { color: L.navy, fontSize: 16, fontWeight: '800' },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center',
  },
  mapWrap: {
    height: 220, borderRadius: shape.panel, overflow: 'hidden',
    backgroundColor: L.page, marginBottom: spacing.md,
  },
  mapUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapUnavailableText: { color: L.textMuted, fontSize: 13, fontWeight: '500' },
  name:    { color: L.navy, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  address: { color: L.textMuted, fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: spacing.md },
  directionsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 14,
  },
  directionsText: { color: L.white, fontSize: 15, fontWeight: '800' },
});

// ─── Play event card ──────────────────────────────────────────────────────────

function PlayEventCard({ event }: { event: FacilityPlayEvent }) {
  const typeLabel   = eventTypeLabel(event.event_type ?? '');
  const statColor   = statusColor(event.status ?? '');
  const dateLabel   = fmtEventDate(event.event_date, event.start_time);
  const route       = eventRoute(event);

  return (
    <TouchableOpacity style={ec.card} activeOpacity={0.8} onPress={() => router.push(route as never)}>
      <View style={ec.left}>
        <View style={[ec.typePill, { backgroundColor: L.navy }]}>
          <Text style={ec.typeText}>{typeLabel.toUpperCase()}</Text>
        </View>
        <Text style={ec.name} numberOfLines={1}>{event.name}</Text>
        <Text style={ec.date}>{dateLabel}</Text>
      </View>
      <View style={ec.right}>
        <View style={[ec.statusDot, { backgroundColor: statColor }]} />
        <Text style={[ec.statusText, { color: statColor }]}>
          {(event.status ?? 'open').charAt(0).toUpperCase() + (event.status ?? 'open').slice(1)}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={L.border} style={{ marginTop: 2 }} />
      </View>
    </TouchableOpacity>
  );
}
const ec = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border, gap: 12 },
  left:      { flex: 1, gap: 4 },
  typePill:  { alignSelf: 'flex-start', borderRadius: shape.badge, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 2 },
  typeText:  { color: L.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  name:      { ...displayText(17, { color: L.navy }) },
  date:      { color: L.textMuted, fontSize: 11, fontWeight: '500' },
  right:     { alignItems: 'flex-end', gap: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText:{ fontSize: 11, fontWeight: '700' },
});

// ─── Tournament card ──────────────────────────────────────────────────────────

function TournamentCard({ tournament }: { tournament: FacilityTournament }) {
  const dateLabel  = fmtTournamentDate(tournament.event_date);
  const statColor  = statusColor(tournament.status ?? '');
  const statusLabel = (tournament.status ?? 'draft').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <TouchableOpacity
      style={tc.card}
      activeOpacity={0.8}
      onPress={() => router.push(`/tournament/${tournament.id}` as never)}
    >
      <View style={tc.left}>
        <Text style={tc.name} numberOfLines={1}>{tournament.name}</Text>
        <Text style={tc.date}>{dateLabel}</Text>
        {tournament.city ? <Text style={tc.loc}>{tournament.city}, {tournament.state}</Text> : null}
      </View>
      <View style={tc.right}>
        <View style={[tc.statusPill, { backgroundColor: statColor + '22' }]}>
          <Text style={[tc.statusText, { color: statColor }]}>{statusLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={L.border} />
      </View>
    </TouchableOpacity>
  );
}
const tc = StyleSheet.create({
  card:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border, gap: 12 },
  left:       { flex: 1, gap: 3 },
  name:       { ...displayText(17, { color: L.navy }) },
  date:       { color: L.textMuted, fontSize: 11, fontWeight: '500' },
  loc:        { color: L.textMuted, fontSize: 11, fontWeight: '400' },
  right:      { alignItems: 'flex-end', gap: 6 },
  statusPill: { borderRadius: shape.pill, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, loading }: { title: string; loading?: boolean }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {loading && <ActivityIndicator size="small" color={L.gold} style={{ marginLeft: 8 }} />}
    </View>
  );
}
const sh = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FacilityDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const insets   = useSafeAreaInsets();

  const [facility,       setFacility]       = useState<FacilityDetail | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [playEvents,     setPlayEvents]     = useState<FacilityPlayEvent[]>([]);
  const [tournaments,    setTournaments]    = useState<FacilityTournament[]>([]);
  const [eventsLoading,  setEventsLoading]  = useState(false);
  const [tournsLoading,  setTournsLoading]  = useState(false);

  // ── Booking inventory / availability (read-only this phase) ──
  // Honours what the search screen was asked for. Arriving here after picking
  // "Ball Machine" and landing on Courts makes the choice look ignored, and the
  // date beside this already reads from the same place. null means "no
  // preference", which keeps the old default.
  const [inventoryTab,     setInventoryTab]     = useState<ReservableAssetType>(
    (getBookingSearch().assetTypeFilter as ReservableAssetType | null) ?? 'court',
  );
  const [courts,           setCourts]           = useState<Court[]>([]);
  const [ballMachines,     setBallMachines]     = useState<BallMachine[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [dealsByAssetId,   setDealsByAssetId]   = useState<Record<string, number>>({});
  const [hourlyOpenCounts, setHourlyOpenCounts] = useState<{ hour: number; open: number; joinable: number }[] | null>(null);
  const [summaryLoading,   setSummaryLoading]   = useState(true);
  const [weather,          setWeather]          = useState<EventWeatherResult | 'loading' | null>(null);
  const [mapSheetOpen,     setMapSheetOpen]     = useState(false);
  const [summaryDate,      setSummaryDate]      = useState(getBookingSearch().date ?? todayIsoDate());
  const [dealsOnly,        setDealsOnly]        = useState(false);
  const [priceSortAsc,     setPriceSortAsc]     = useState(false);

  function changeSummaryDate(next: string) {
    setSummaryDate(next);
    setBookingSearch({ date: next });
  }

  const { user } = useSession();
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  useSupportContext({
    feature: 'facility',
    entityType: 'facility',
    entityId: id,
    entityLabel: facility?.name,
  });

  useFocusEffect(
    useCallback(() => {
      if (!id) return;

      // Facility (blocks render)
      setLoading(true);
      fetchFacilityById(id)
        .then(f => { if (!f) setError('Facility not found.'); else { setFacility(f); setError(null); } })
        .catch(() => setError('Failed to load facility.'))
        .finally(() => setLoading(false));

      // Play events (non-blocking)
      setEventsLoading(true);
      fetchFacilityPlayEvents(id)
        .then(setPlayEvents)
        .catch(() => setPlayEvents([]))
        .finally(() => setEventsLoading(false));

      // Tournaments (non-blocking)
      setTournsLoading(true);
      fetchFacilityTournaments(id)
        .then(setTournaments)
        .catch(() => setTournaments([]))
        .finally(() => setTournsLoading(false));

      // Court / ball machine inventory (non-blocking)
      setInventoryLoading(true);
      Promise.all([fetchCourts(id), fetchBallMachines(id)])
        .then(([courtRows, machineRows]) => {
          setCourts(courtRows);
          setBallMachines(machineRows);
        })
        .catch(() => { setCourts([]); setBallMachines([]); })
        .finally(() => setInventoryLoading(false));
    }, [id]),
  );

  // Active Flash Deal per asset, for the inventory list badges/pricing —
  // re-runs whenever the inventory or selected tab's asset list changes.
  useEffect(() => {
    const assets = inventoryTab === 'court' ? courts : ballMachines;
    if (assets.length === 0) return;
    let cancelled = false;

    Promise.all(
      assets.map(async a => {
        const deal = await fetchActiveFlashDeal(inventoryTab, a.id).catch(() => null);
        return [a.id, deal?.discountPercent ?? null] as const;
      }),
    ).then(pairs => {
      if (cancelled) return;
      const withDeals = pairs.filter((p): p is readonly [string, number] => p[1] != null);
      setDealsByAssetId(prev => ({ ...prev, ...Object.fromEntries(withDeals) }));
    });

    return () => { cancelled = true; };
  }, [inventoryTab, courts, ballMachines]);

  // Today's (or the search date's) hourly availability summary for the
  // selected tab — read-only occupancy, no reservation writes.
  useEffect(() => {
    const assets = inventoryTab === 'court' ? courts : ballMachines;
    if (inventoryLoading) return;
    if (assets.length === 0) { setHourlyOpenCounts([]); setSummaryLoading(false); return; }

    let cancelled = false;
    setSummaryLoading(true);
    Promise.all(assets.map(a => fetchAssetAvailability(inventoryTab, a.id, summaryDate).catch(() => [])))
      .then(slotsByAsset => {
        if (cancelled) return;
        setHourlyOpenCounts(computeHourlyOpenCounts(slotsByAsset, summaryDate));
      })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });

    return () => { cancelled = true; };
  }, [inventoryTab, courts, ballMachines, inventoryLoading, summaryDate]);

  // Weather for the summary date, once the facility's coordinates are known.
  useEffect(() => {
    if (!facility) return;
    const lat = facility.latitude != null ? Number(facility.latitude) : null;
    const lng = facility.longitude != null ? Number(facility.longitude) : null;
    if (lat == null || lng == null) { setWeather(null); return; }

    let cancelled = false;
    setWeather('loading');
    fetchEventWeather(lat, lng, summaryDate)
      .then(res => { if (!cancelled) setWeather(res); })
      .catch(() => { if (!cancelled) setWeather({ available: false, reason: 'upstream_error' }); });

    return () => { cancelled = true; };
  }, [facility, summaryDate]);

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  if (error || !facility) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={40} color={L.border} />
        <Text style={s.errorText}>{error ?? 'Facility not found.'}</Text>
        <TouchableOpacity onPress={() => goBack()} style={s.errorBackBtn}>
          <Text style={s.errorBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const access = facilityAccessType(facility);
  const badge  = ACCESS_BADGE[access];

  const courtsSummary = [
    `${facility.court_count} ${facility.court_count === 1 ? 'Court' : 'Courts'}`,
    facility.surface_type ? facility.surface_type.charAt(0).toUpperCase() + facility.surface_type.slice(1) : null,
    facility.indoor_courts > 0 && facility.outdoor_courts > 0
      ? `${facility.indoor_courts} indoor, ${facility.outdoor_courts} outdoor`
      : facility.indoor_courts > 0 ? 'Indoor' : facility.outdoor_courts > 0 ? 'Outdoor' : null,
  ].filter(Boolean).join('  ·  ');

  const rawAssets: (Court | BallMachine)[] = inventoryTab === 'court' ? courts : ballMachines;
  const visibleAssets = rawAssets
    .filter(a => !dealsOnly || dealsByAssetId[a.id] != null)
    .slice()
    .sort((a, b) => {
      if (!priceSortAsc) return 0;
      const pa = a.hourly_rate_cents ?? Number.POSITIVE_INFINITY;
      const pb = b.hourly_rate_cents ?? Number.POSITIVE_INFINITY;
      return pa - pb;
    });

  function handleDirections() {
    const q = encodeURIComponent(`${facility!.address}, ${facility!.city}, ${facility!.state}`);
    Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
    );
  }

  // "Suggest an Edit" -> a real support ticket, rather than a Coming Soon alert.
  //
  // Facility data is largely imported and thin (most rows have no court count
  // or description), and the people who know the truth are the players who go
  // there. This is the smallest honest version of that: a free-text report
  // that lands in the existing support queue, where it already gets a status,
  // an assignee, a resolution and a thread the submitter can be answered on.
  //
  // Deliberately NOT the full crowdsourced model - no structured per-field
  // proposals, no corroboration, no auto-apply. Those need a suggestions
  // schema and dedupe that do not exist yet. The ticket's `context` carries
  // the facility id, so those can be built later without losing what is
  // collected in the meantime.
  async function submitFacilityEdit() {
    if (!user?.id || !facility || !editText.trim()) return;
    setEditSubmitting(true);
    try {
      await createSupportTicket(
        user.id,
        `Facility update: ${facility.name}`,
        // No 'facility' category exists in the support_ticket_category enum,
        // so these land under feedback. Adding a dedicated key is an enum
        // migration and would let the admin queue filter them out of real
        // support - worth doing if the volume justifies it.
        'feedback',
        editText.trim(),
        {
          context: {
            routeName: `/facility/${id}`,
            feature: 'facility',
            entityType: 'facility',
            entityId: String(id),
            entityLabel: facility.name,
            action: 'suggest_edit',
          },
          source: 'help_screen',
        },
      );
      setEditOpen(false);
      setEditText('');
      Alert.alert(
        'Thanks — we got it',
        'Your update was sent to our team. You can follow it in Support, and we may reply there if we need more detail.',
      );
    } catch {
      Alert.alert('Could not send', 'Something went wrong sending your update. Please try again.');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleShare() {
    try {
      await Share.share({
        message: `Check out ${facility!.name} on Pickleball App: ${appLinks.facility(facility!.id)}`,
      });
    } catch {
      // user cancelled or share unavailable — nothing to do
    }
  }

  return (
    // No paddingTop: the hero runs to the top of the screen and under the
    // status bar, as the tournament and community heroes do. Padding here left
    // a band of page background above the photo, which read as a rendering
    // gap rather than a design.
    <View style={s.root}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── HERO ── */}
        <View style={[s.hero, { height: HERO_H + insets.top }]}>
          <HeroPhoto uri={facility.primaryPhotoUrl} height={HERO_H + insets.top} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.75)']}
            style={StyleSheet.absoluteFill}
          />

          <View style={[s.topControls, { marginTop: insets.top + 8 }]}>
            <TouchableOpacity style={s.circleBtn} onPress={() => goBack()} activeOpacity={0.85}>
              <Ionicons name="chevron-back" size={20} color={L.white} />
            </TouchableOpacity>
            <TouchableOpacity style={s.circleBtn} onPress={handleShare} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={20} color={L.white} />
            </TouchableOpacity>
          </View>

          <View style={s.heroContent}>
            <View style={s.badgeRow}>
              <View style={[s.badge, { backgroundColor: badge.bg }]}>
                <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
              {facility.verified && (
                <View style={s.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#2563EB" />
                  <Text style={s.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <Text style={s.heroTitle}>{facility.name}</Text>
            <TouchableOpacity style={s.heroMetaRow} onPress={() => setMapSheetOpen(true)} activeOpacity={0.75}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
              <Text style={s.heroMetaText}>{facility.city}, {facility.state}</Text>
              <View style={s.mapPill}>
                <Ionicons name="map-outline" size={12} color={L.navy} />
                <Text style={s.mapPillText}>Map</Text>
              </View>
            </TouchableOpacity>
            {!!courtsSummary && <Text style={s.heroFacts}>{courtsSummary}</Text>}
          </View>
        </View>

        <View style={s.body}>

          {/* ── WEATHER ── */}
          {weather != null && (
            <View style={s.weatherStrip}>
              <EventWeatherCard w={weather} locationLabel={`${facility.city}, ${facility.state}`} />
            </View>
          )}

          {/* ── COURTS / BALL MACHINES ── */}
          {(courts.length > 0 || ballMachines.length > 0 || inventoryLoading) && (
            <View style={s.section}>
              <SectionHeader
                title={inventoryTab === 'ball_machine' ? 'Book a Ball Machine' : 'Book a Court'}
                loading={inventoryLoading}
              />

              {/* Date navigation */}
              <View style={s.dateNavRow}>
                <TouchableOpacity
                  style={[s.dateNavBtn, summaryDate <= todayIsoDate() && s.dateNavBtnDisabled]}
                  activeOpacity={0.75}
                  disabled={summaryDate <= todayIsoDate()}
                  onPress={() => changeSummaryDate(addDaysIso(summaryDate, -1))}
                >
                  <Ionicons name="chevron-back" size={18} color={summaryDate <= todayIsoDate() ? L.border : L.navy} />
                </TouchableOpacity>
                <View style={s.dateNavLabel}>
                  <Ionicons name="calendar-outline" size={14} color={L.navy} />
                  <Text style={s.dateNavText}>{formatSummaryDateLabel(summaryDate)}</Text>
                </View>
                <TouchableOpacity style={s.dateNavBtn} activeOpacity={0.75} onPress={() => changeSummaryDate(addDaysIso(summaryDate, 1))}>
                  <Ionicons name="chevron-forward" size={18} color={L.navy} />
                </TouchableOpacity>
              </View>

              {/* Filters */}
              <View style={s.filterRow}>
                <TouchableOpacity
                  style={[s.filterChip, dealsOnly && s.filterChipActive]}
                  activeOpacity={0.75}
                  onPress={() => setDealsOnly(v => !v)}
                >
                  <Ionicons name="flash" size={13} color={dealsOnly ? L.navy : L.textMuted} />
                  <Text style={[s.filterChipText, dealsOnly && s.filterChipTextActive]}>Flash Deals</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.filterChip, priceSortAsc && s.filterChipActive]}
                  activeOpacity={0.75}
                  onPress={() => setPriceSortAsc(v => !v)}
                >
                  <Ionicons name="swap-vertical" size={13} color={priceSortAsc ? L.navy : L.textMuted} />
                  <Text style={[s.filterChipText, priceSortAsc && s.filterChipTextActive]}>Price: Low to High</Text>
                </TouchableOpacity>
              </View>

              {ballMachines.length > 0 && (
                <View style={s.invTabRow}>
                  <TouchableOpacity
                    style={[s.invTab, inventoryTab === 'court' && s.invTabActive]}
                    activeOpacity={0.85}
                    onPress={() => setInventoryTab('court')}
                  >
                    <Text style={[s.invTabText, inventoryTab === 'court' && s.invTabTextActive]}>Courts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.invTab, inventoryTab === 'ball_machine' && s.invTabActive]}
                    activeOpacity={0.85}
                    onPress={() => setInventoryTab('ball_machine')}
                  >
                    <Text style={[s.invTabText, inventoryTab === 'ball_machine' && s.invTabTextActive]}>Ball Machines</Text>
                  </TouchableOpacity>
                </View>
              )}

              {visibleAssets.map(asset => (
                <InventoryCard
                  key={asset.id}
                  name={asset.name}
                  subtitle={'indoor_outdoor' in asset ? (asset.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor') : (asset as { description: string | null }).description}
                  priceCents={asset.hourly_rate_cents}
                  dealPercent={dealsByAssetId[asset.id] ?? null}
                />
              ))}

              {!inventoryLoading && visibleAssets.length === 0 && (
                <View style={s.emptyState}>
                  <Ionicons name="pricetag-outline" size={24} color={L.border} />
                  <Text style={s.emptyText}>
                    {rawAssets.length > 0
                      ? 'No courts match these filters.'
                      : inventoryTab === 'court' ? 'No courts listed yet.' : 'No ball machines listed yet.'}
                  </Text>
                </View>
              )}

              {/* Today's / selected date's availability summary */}
              {(hourlyOpenCounts && hourlyOpenCounts.length > 0) || summaryLoading ? (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 18 }]}>
                    {formatSummaryDateLabel(summaryDate)} Availability
                  </Text>
                  {summaryLoading ? (
                    <ActivityIndicator size="small" color={L.gold} style={{ marginTop: 8 }} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      {hourlyOpenCounts!.map(({ hour, open, joinable }) => (
                        <View key={hour} style={[s.hourChip, open === 0 && joinable > 0 && s.hourChipJoinable]}>
                          <Text style={s.hourChipTime}>{formatHourLabel(hour)}</Text>
                          {open > 0 ? (
                            <Text style={s.hourChipCount}>{open} {inventoryTab === 'court' ? 'open' : 'free'}</Text>
                          ) : joinable > 0 ? (
                            <Text style={s.hourChipJoinableText}>{joinable} joinable</Text>
                          ) : (
                            <Text style={[s.hourChipCount, s.hourChipCountFull]}>Full</Text>
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </>
              ) : null}

              {facility.bookable_by_public && (
                <TouchableOpacity
                  style={[s.ctaSecondary, { marginTop: 16 }]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setBookingFacility(facility.id, facility.name);
                    setBookingSelection({ assetType: inventoryTab });
                    router.push('/booking/choose-time' as never);
                  }}
                >
                  <Ionicons name="time-outline" size={18} color={L.navy} />
                  <Text style={s.ctaSecondaryText}>Choose Time</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── DETAILS (compact) ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Details</Text>

            <TouchableOpacity style={s.detailRow} onPress={() => setMapSheetOpen(true)} activeOpacity={0.75}>
              <AppIcon name="location-outline" size={16} color={L.gold} />
              <View style={{ flex: 1 }}>
                <Text style={s.infoText}>{facility.address}</Text>
                <Text style={s.infoSub}>{facility.city}, {facility.state}{facility.postal_code ? ` ${facility.postal_code}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={L.border} />
            </TouchableOpacity>

            {(facility.phone || facility.website) && (
              <View style={s.contactRow}>
                {facility.phone && (
                  <TouchableOpacity style={s.contactChip} onPress={() => Linking.openURL(`tel:${facility!.phone}`)} activeOpacity={0.75}>
                    <Ionicons name="call-outline" size={14} color={L.navy} />
                    <Text style={s.contactChipText}>Call</Text>
                  </TouchableOpacity>
                )}
                {facility.website && (
                  <TouchableOpacity style={s.contactChip} onPress={() => Linking.openURL(facility!.website!)} activeOpacity={0.75}>
                    <Ionicons name="globe-outline" size={14} color={L.navy} />
                    <Text style={s.contactChipText}>Website</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={s.amenityWrap}>
              <AmenityChip icon="bulb-outline"  label="Lighting"  active={facility.lighting}  />
              <AmenityChip icon="man-outline"   label="Restrooms" active={facility.restrooms} />
              <AmenityChip icon="water-outline" label="Water"     active={facility.water}     />
              <AmenityChip icon="car-outline"   label="Parking"   active={facility.parking}   />
            </View>

            {!!facility.description && (
              <Text style={s.description}>{facility.description}</Text>
            )}
          </View>

          {/* ── COMMUNITY PLAY ── */}
          <View style={s.section}>
            <SectionHeader title="Community Play" loading={eventsLoading} />
            {playEvents.length > 0
              ? playEvents.map(e => <PlayEventCard key={e.id} event={e} />)
              : !eventsLoading && (
                  <View style={s.emptyState}>
                    <Ionicons name="people-outline" size={28} color={L.border} />
                    <Text style={s.emptyText}>No community events here yet.</Text>
                  </View>
                )}
            <TouchableOpacity
              style={[s.ctaGhost, { marginTop: 14 }]}
              activeOpacity={0.85}
              onPress={() => router.push(`/play-pickleball?facilityId=${facility.id}` as never)}
            >
              <Ionicons name="add-circle-outline" size={17} color={L.navy} />
              <Text style={s.ctaGhostText}>Create Event Here</Text>
            </TouchableOpacity>
          </View>

          {/* ── TOURNAMENTS ── */}
          <View style={s.section}>
            <SectionHeader title="Tournaments" loading={tournsLoading} />
            {tournaments.length > 0
              ? tournaments.map(t => <TournamentCard key={t.id} tournament={t} />)
              : !tournsLoading && (
                  <View style={s.emptyState}>
                    <Ionicons name="trophy-outline" size={28} color={L.border} />
                    <Text style={s.emptyText}>No tournaments scheduled here yet.</Text>
                  </View>
                )}
            <TouchableOpacity
              style={[s.ctaGhost, { marginTop: 14 }]}
              activeOpacity={0.85}
              onPress={() => Alert.alert('Coming Soon', 'Tournament hosting from facility pages is in progress.')}
            >
              <Ionicons name="trophy-outline" size={17} color={L.navy} />
              <Text style={s.ctaGhostText}>Host Tournament Here</Text>
            </TouchableOpacity>
          </View>

          {/* ── CTAS ── */}
          <View style={s.ctaStack}>
            <TouchableOpacity style={s.ctaPrimary} activeOpacity={0.85} onPress={handleDirections}>
              <Ionicons name="navigate-outline" size={18} color={L.white} />
              <Text style={s.ctaPrimaryText}>Directions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.ctaGhost}
              activeOpacity={0.85}
              onPress={() => {
                if (!user?.id) {
                  Alert.alert('Sign in required', 'Please sign in to suggest an update to this facility.');
                  return;
                }
                setEditOpen(true);
              }}
            >
              <Ionicons name="create-outline" size={17} color={L.navy} />
              <Text style={s.ctaGhostText}>Suggest an Edit</Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>

      {/* ── SUGGEST AN EDIT ── */}
      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <Pressable style={es.backdrop} onPress={() => setEditOpen(false)}>
          <Pressable style={es.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={es.handle} />
            <Text style={es.title}>Suggest an Edit</Text>
            <Text style={es.sub}>
              Know something we have wrong about {facility.name}? Court count, hours, amenities,
              phone — tell us what should change and we will review it.
            </Text>

            <TextInput
              style={es.input}
              value={editText}
              onChangeText={setEditText}
              placeholder="e.g. There are 8 courts, not 0. 4 are covered."
              placeholderTextColor={L.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={1000}
              editable={!editSubmitting}
            />

            {/* The support system's disclosure rule: say what rides along with
                the message before it is sent, not after. */}
            <Text style={es.disclosure}>
              We include this facility's name and ID so we know what you are referring to.
            </Text>

            <TouchableOpacity
              style={[es.submit, (!editText.trim() || editSubmitting) && es.submitDisabled]}
              activeOpacity={0.85}
              disabled={!editText.trim() || editSubmitting}
              onPress={submitFacilityEdit}
            >
              {editSubmitting
                ? <ActivityIndicator size="small" color={L.white} />
                : <Text style={es.submitText}>Send</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={es.cancel} onPress={() => setEditOpen(false)} disabled={editSubmitting}>
              <Text style={es.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <MapSheet
        visible={mapSheetOpen}
        onClose={() => setMapSheetOpen(false)}
        facility={facility}
        onGetDirections={() => { setMapSheetOpen(false); handleDirections(); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HERO_H = 300;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: L.bg },

  // Height is applied at the call site as HERO_H + the top inset, so the photo
  // fills the status-bar area too and HERO_H stays the height of what is
  // actually readable below it.
  hero:         { width: '100%', position: 'relative', overflow: 'hidden' },
  // Explicit height rather than StyleSheet.absoluteFill. absoluteFill was
  // resolving against something taller than the hero, so `cover` fitted the
  // photo to that larger box and the hero showed only its top strip - all
  // ceiling, no courts. Pinning the height to HERO_H makes the box the image
  // is fitted to the same box the user sees. The asset is 4:3 and the hero is
  // ~1.3:1, so cover now crops almost nothing.
  heroImage:    { position: 'absolute', top: 0, left: 0, width: '100%' },

  topControls: {
    position: 'absolute', left: spacing.screenH, right: spacing.screenH,
    flexDirection: 'row', justifyContent: 'space-between', zIndex: 10,
  },
  circleBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroContent: { position: 'absolute', bottom: 0, left: spacing.screenH, right: spacing.screenH, paddingBottom: spacing.lg },
  heroTitle:   { color: L.white, fontSize: 26, fontWeight: '800', lineHeight: 30, marginBottom: 6 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  heroMetaText:{ color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '500' },
  heroFacts:   { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' },
  mapPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4,
    backgroundColor: L.white, borderRadius: shape.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  mapPillText: { color: L.navy, fontSize: 11, fontWeight: '800' },

  body:      { padding: spacing.screenH },
  badgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  badge:     { borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DBEAFE', borderRadius: shape.pill, paddingHorizontal: 9, paddingVertical: 4 },
  verifiedText:  { fontSize: 10, fontWeight: '800', color: '#2563EB', letterSpacing: 0.3 },

  weatherStrip: { marginTop: 4, marginBottom: 18 },

  section:      { marginTop: 20 },
  sectionTitle: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },

  infoText: { color: L.text,    fontSize: 14, fontWeight: '600' },
  infoSub:  { color: L.textMuted, fontSize: 12, fontWeight: '500', marginTop: 1 },
  description: { color: L.textSub, fontSize: 14, fontWeight: '400', lineHeight: 21, marginTop: 14 },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  contactRow:  { flexDirection: 'row', gap: 8, marginTop: 10 },
  contactChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.pill,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  contactChipText: { color: L.navy, fontSize: 12, fontWeight: '700' },

  amenityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },

  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText:  { color: L.textMuted, fontSize: 13, fontWeight: '500' },

  dateNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dateNavBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dateNavBtnDisabled: { opacity: 0.4 },
  dateNavLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateNavText:  { color: L.navy, fontSize: 15, fontWeight: '800' },

  filterRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: L.border, borderRadius: shape.pill,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  filterChipActive:     { borderColor: L.gold, backgroundColor: L.goldBg },
  filterChipText:       { color: L.textMuted, fontSize: 12, fontWeight: '700' },
  filterChipTextActive: { color: L.navy },

  invTabRow:  { flexDirection: 'row', gap: spacing.sm, marginBottom: 8 },
  invTab:     { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: shape.pill, borderWidth: 1, borderColor: L.border },
  invTabActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  invTabText:   { color: L.textMuted, fontSize: 13, fontWeight: '700' },
  invTabTextActive: { color: L.navy },

  hourChip: {
    alignItems: 'center', gap: 2, borderWidth: 1, borderColor: L.border, borderRadius: shape.panel,
    paddingVertical: 8, paddingHorizontal: 12, marginRight: 8,
  },
  hourChipJoinable: { borderColor: L.gold, backgroundColor: L.goldBg },
  hourChipTime:  { color: L.navy, fontSize: 12, fontWeight: '800' },
  hourChipCount: { color: '#16A34A', fontSize: 11, fontWeight: '700' },
  hourChipCountFull: { color: L.textMuted },
  hourChipJoinableText: { color: L.navy, fontSize: 11, fontWeight: '800' },

  ctaStack:        { marginTop: 28, gap: 10 },
  ctaPrimary:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 14 },
  ctaPrimaryText:  { color: L.white, fontSize: 15, fontWeight: '800' },
  ctaSecondary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: L.gold + '22', borderWidth: 1.5, borderColor: L.gold, borderRadius: shape.cta, paddingVertical: 13 },
  ctaSecondaryText:{ color: L.navy, fontSize: 15, fontWeight: '800' },
  ctaGhost:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: L.border, borderRadius: shape.cta, paddingVertical: 13 },
  ctaGhostText:    { color: L.navy, fontSize: 14, fontWeight: '700' },

  errorText:    { color: L.textMuted, fontSize: 15, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
  errorBackBtn: { marginTop: 8, backgroundColor: L.navy, borderRadius: shape.cta, paddingHorizontal: 24, paddingVertical: 12 },
  errorBackText:{ color: L.white, fontSize: 14, fontWeight: '700' },
});

const es = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 10,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: L.border, marginBottom: 6 },
  title: { color: L.navy, fontSize: 18, fontWeight: '900' },
  sub: { color: L.textSub, fontSize: 13, lineHeight: 19 },
  input: {
    minHeight: 110, borderWidth: 1, borderColor: L.border, borderRadius: shape.cta,
    padding: 12, color: L.navy, fontSize: 14, lineHeight: 20, backgroundColor: L.page,
  },
  disclosure: { color: L.textMuted, fontSize: 11, lineHeight: 16 },
  submit: {
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: L.white, fontSize: 15, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: L.textSub, fontSize: 14, fontWeight: '700' },
});
