import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, radius, displayText } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSupportContext } from '@/lib/support/supportContext';
import { AppIcon, PickleballIcon, StatusChip, type AppIconName } from '@/components';
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
import { getBookingSearch, setBookingFacility, setBookingSelection } from '@/lib/bookingStore';

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

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function isAssetBusyAtHour(slots: AssetAvailabilitySlot[], dateStr: string, hour: number): boolean {
  const hourStart = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
  const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
  return slots.some(slot => new Date(slot.startsAt) < hourEnd && new Date(slot.endsAt) > hourStart);
}

function computeHourlyOpenCounts(
  slotsByAsset: AssetAvailabilitySlot[][],
  dateStr: string,
): { hour: number; open: number }[] {
  return SUMMARY_HOURS.map(hour => ({
    hour,
    open: slotsByAsset.filter(slots => !isAssetBusyAtHour(slots, dateStr, hour)).length,
  }));
}

// ─── Weather row (compact) ─────────────────────────────────────────────────────
// Same event-weather edge function / EventWeatherResult shape used on the
// community event detail screen, condensed to one row for this page.

function WeatherRow({ w }: { w: EventWeatherResult | 'loading' | null }) {
  if (w == null) return null;

  if (w === 'loading') {
    return (
      <View style={[wr.row, wr.centered]}>
        <ActivityIndicator size="small" color={L.gold} />
      </View>
    );
  }

  if (!w.available) return null; // out-of-range/unavailable forecasts add no value here — omit rather than show a dead row

  return (
    <View style={wr.row}>
      <Ionicons name={w.icon as never} size={26} color={L.gold} />
      <View>
        <Text style={wr.temp}>{w.temp != null ? `${w.temp}°F` : '—'}</Text>
        <Text style={wr.condition}>{w.condition}</Text>
      </View>
      {w.wind != null && (
        <>
          <View style={wr.divider} />
          <Ionicons name="compass-outline" size={16} color={L.textMuted} />
          <Text style={wr.windText}>{w.wind} mph</Text>
        </>
      )}
    </View>
  );
}
const wr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  centered:  { justifyContent: 'center', minHeight: 36 },
  temp:      { color: L.navy, fontSize: 15, fontWeight: '800', lineHeight: 18 },
  condition: { color: L.textMuted, fontSize: 11, fontWeight: '600' },
  divider:   { width: 1, height: 24, backgroundColor: L.border, marginHorizontal: 4 },
  windText:  { color: L.textMuted, fontSize: 12, fontWeight: '600' },
});

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

// ─── Hero photo with fallback ──────────────────────────────────────────────────

function HeroPhoto({ uri, name }: { uri: string | null; name: string }) {
  if (uri) return <Image source={{ uri }} style={s.hero} resizeMode="cover" />;
  const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  return (
    <View style={[s.hero, s.heroFallback]}>
      <PickleballIcon size={44} color={L.gold} />
      <Text style={s.heroInitials}>{initials}</Text>
    </View>
  );
}

// ─── Amenity row ──────────────────────────────────────────────────────────────

function AmenityRow({ icon, label, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean }) {
  return (
    <View style={[a.row, !active && a.inactive]}>
      <Ionicons name={icon} size={18} color={active ? L.navy : L.border} />
      <Text style={[a.label, !active && a.labelInactive]}>{label}</Text>
      <Ionicons name={active ? 'checkmark-circle' : 'close-circle-outline'} size={16}
        color={active ? '#16A34A' : L.border} style={{ marginLeft: 'auto' }} />
    </View>
  );
}
const a = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: L.border },
  inactive:     { opacity: 0.45 },
  label:        { color: L.text, fontSize: 14, fontWeight: '600', flex: 1 },
  labelInactive:{ color: L.textMuted },
});

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ icon, children }: { icon: AppIconName; children: React.ReactNode }) {
  return (
    <View style={ir.row}>
      <AppIcon name={icon} size={16} color={L.gold} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
const ir = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 } });

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
  typePill:  { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 2 },
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
  statusPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
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
  const [inventoryTab,     setInventoryTab]     = useState<ReservableAssetType>('court');
  const [courts,           setCourts]           = useState<Court[]>([]);
  const [ballMachines,     setBallMachines]     = useState<BallMachine[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [dealsByAssetId,   setDealsByAssetId]   = useState<Record<string, number>>({});
  const [hourlyOpenCounts, setHourlyOpenCounts] = useState<{ hour: number; open: number }[] | null>(null);
  const [summaryLoading,   setSummaryLoading]   = useState(true);
  const [weather,          setWeather]          = useState<EventWeatherResult | 'loading' | null>(null);

  const summaryDate = getBookingSearch().date ?? todayIsoDate();

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

  function handleDirections() {
    const q = encodeURIComponent(`${facility!.address}, ${facility!.city}, ${facility!.state}`);
    Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Floating back */}
      <TouchableOpacity
        style={[s.floatingBack, { top: insets.top + 12 }]}
        onPress={() => goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color={L.white} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── HERO ── */}
        <HeroPhoto uri={facility.primaryPhotoUrl} name={facility.name} />

        <View style={s.body}>

          {/* Name + badges */}
          <View style={s.titleRow}>
            <Text style={s.name}>{facility.name}</Text>
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
          </View>

          {/* ── INFO ── */}
          <View style={s.section}>
            <InfoRow icon="location-outline">
              <Text style={s.infoText}>{facility.address}</Text>
              <Text style={s.infoSub}>{facility.city}, {facility.state}{facility.postal_code ? ` ${facility.postal_code}` : ''}</Text>
            </InfoRow>
            <InfoRow icon="pickleball">
              <Text style={s.infoText}>
                {facility.court_count} {facility.court_count === 1 ? 'Court' : 'Courts'}
                {facility.surface_type ? ` · ${facility.surface_type.charAt(0).toUpperCase() + facility.surface_type.slice(1)}` : ''}
              </Text>
              {(facility.indoor_courts > 0 || facility.outdoor_courts > 0) && (
                <Text style={s.infoSub}>
                  {[
                    facility.indoor_courts  > 0 ? `${facility.indoor_courts} indoor`   : null,
                    facility.outdoor_courts > 0 ? `${facility.outdoor_courts} outdoor` : null,
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              )}
            </InfoRow>
            {facility.phone ? (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${facility!.phone}`)}>
                <InfoRow icon="call-outline">
                  <Text style={[s.infoText, s.link]}>{facility.phone}</Text>
                </InfoRow>
              </TouchableOpacity>
            ) : null}
            {facility.website ? (
              <TouchableOpacity onPress={() => Linking.openURL(facility!.website!)}>
                <InfoRow icon="globe-outline">
                  <Text style={[s.infoText, s.link]} numberOfLines={1}>{facility.website}</Text>
                </InfoRow>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── DESCRIPTION ── */}
          {!!facility.description && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>About</Text>
              <Text style={s.description}>{facility.description}</Text>
            </View>
          )}

          {/* ── AMENITIES ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Amenities</Text>
            <AmenityRow icon="bulb-outline"  label="Lighting"  active={facility.lighting}  />
            <AmenityRow icon="man-outline"   label="Restrooms" active={facility.restrooms} />
            <AmenityRow icon="water-outline" label="Water"     active={facility.water}     />
            <AmenityRow icon="car-outline"   label="Parking"   active={facility.parking}   />
          </View>

          {/* ── WEATHER ── */}
          {weather != null && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Weather</Text>
              <WeatherRow w={weather} />
            </View>
          )}

          {/* ── COURTS / BALL MACHINES ── */}
          {(courts.length > 0 || ballMachines.length > 0 || inventoryLoading) && (
            <View style={s.section}>
              <SectionHeader title="Book a Court" loading={inventoryLoading} />

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

              {(inventoryTab === 'court' ? courts : ballMachines).map(asset => (
                <InventoryCard
                  key={asset.id}
                  name={asset.name}
                  subtitle={'indoor_outdoor' in asset ? (asset.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor') : (asset as { description: string | null }).description}
                  priceCents={asset.hourly_rate_cents}
                  dealPercent={dealsByAssetId[asset.id] ?? null}
                />
              ))}

              {!inventoryLoading && (inventoryTab === 'court' ? courts : ballMachines).length === 0 && (
                <View style={s.emptyState}>
                  <Ionicons name="pricetag-outline" size={24} color={L.border} />
                  <Text style={s.emptyText}>
                    {inventoryTab === 'court' ? 'No courts listed yet.' : 'No ball machines listed yet.'}
                  </Text>
                </View>
              )}

              {/* Today's / selected date's availability summary */}
              {(hourlyOpenCounts && hourlyOpenCounts.length > 0) || summaryLoading ? (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 18 }]}>
                    {summaryDate === todayIsoDate() ? "Today's" : ''} Availability Summary
                  </Text>
                  {summaryLoading ? (
                    <ActivityIndicator size="small" color={L.gold} style={{ marginTop: 8 }} />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      {hourlyOpenCounts!.map(({ hour, open }) => (
                        <View key={hour} style={s.hourChip}>
                          <Text style={s.hourChipTime}>{formatHourLabel(hour)}</Text>
                          <Text style={[s.hourChipCount, open === 0 && s.hourChipCountFull]}>
                            {open} {inventoryTab === 'court' ? 'open' : 'free'}
                          </Text>
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

            {facility.claim_status === 'unclaimed' && (
              <TouchableOpacity
                style={s.ctaGhost}
                activeOpacity={0.85}
                onPress={() => Alert.alert('Coming Soon', 'Facility claiming is in progress.')}
              >
                <Ionicons name="ribbon-outline" size={17} color={L.textMuted} />
                <Text style={s.ctaGhostText}>Claim This Facility</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HERO_H = 240;

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: L.bg },

  hero:         { width: '100%', height: HERO_H },
  heroFallback: { backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroInitials: { color: L.gold, fontSize: 28, fontWeight: '900', letterSpacing: 1 },

  floatingBack: {
    position: 'absolute', left: 16, zIndex: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  body:      { padding: spacing.screenH },
  titleRow:  { gap: 8, marginTop: 6, marginBottom: 4 },
  name:      { color: L.navy, fontSize: 22, fontWeight: '900', lineHeight: 28 },
  badgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DBEAFE', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  verifiedText:  { fontSize: 10, fontWeight: '800', color: '#2563EB', letterSpacing: 0.3 },

  section:      { marginTop: 20 },
  sectionTitle: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },

  infoText: { color: L.text,    fontSize: 14, fontWeight: '600' },
  infoSub:  { color: L.textMuted, fontSize: 12, fontWeight: '500', marginTop: 1 },
  link:     { color: L.navy, textDecorationLine: 'underline' },
  description: { color: L.textSub, fontSize: 14, fontWeight: '400', lineHeight: 21 },

  emptyState: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText:  { color: L.textMuted, fontSize: 13, fontWeight: '500' },

  invTabRow:  { flexDirection: 'row', gap: spacing.sm, marginBottom: 8 },
  invTab:     { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.chip, borderWidth: 1, borderColor: L.border },
  invTabActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  invTabText:   { color: L.textMuted, fontSize: 13, fontWeight: '700' },
  invTabTextActive: { color: L.navy },

  hourChip: {
    alignItems: 'center', gap: 2, borderWidth: 1, borderColor: L.border, borderRadius: radius.md,
    paddingVertical: 8, paddingHorizontal: 12, marginRight: 8,
  },
  hourChipTime:  { color: L.navy, fontSize: 12, fontWeight: '800' },
  hourChipCount: { color: '#16A34A', fontSize: 11, fontWeight: '700' },
  hourChipCountFull: { color: L.textMuted },

  ctaStack:        { marginTop: 28, gap: 10 },
  ctaPrimary:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: L.navy, borderRadius: 30, paddingVertical: 14 },
  ctaPrimaryText:  { color: L.white, fontSize: 15, fontWeight: '800' },
  ctaSecondary:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: L.gold + '22', borderWidth: 1.5, borderColor: L.gold, borderRadius: 30, paddingVertical: 13 },
  ctaSecondaryText:{ color: L.navy, fontSize: 15, fontWeight: '800' },
  ctaGhost:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: L.border, borderRadius: 30, paddingVertical: 13 },
  ctaGhostText:    { color: L.navy, fontSize: 14, fontWeight: '700' },

  errorText:    { color: L.textMuted, fontSize: 15, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
  errorBackBtn: { marginTop: 8, backgroundColor: L.navy, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  errorBackText:{ color: L.white, fontSize: 14, fontWeight: '700' },
});
