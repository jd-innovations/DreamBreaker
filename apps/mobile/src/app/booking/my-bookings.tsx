import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { StatusChip, type StatusVariant } from '@/components';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import {
  fetchMyReservations, parseTstzrange, playersNeeded, occupancyStatusLabel,
  type Reservation, type ReservationStatus,
} from '@/lib/supabase/reservations';
import {
  fetchReservationPayments, reservationPaymentStatusLabel, type ReservationPaymentStatus,
} from '@/lib/payments/reservationPaymentIntent';
import { setBookingFacility, setBookingSelection, setBookingReservationId } from '@/lib/bookingStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  white: colors.white,
};

type Tab = 'upcoming' | 'past' | 'cancelled';

type EnrichedReservation = Reservation & {
  facilityName: string;
  assetName: string;
  assetSubtitle: string | null;
  currentPlayers: number;
  startsAt: string;
  endsAt: string;
  payment: ReservationPaymentStatus | null;
};

const STATUS_VARIANT: Record<ReservationStatus, StatusVariant> = {
  held: 'gold', confirmed: 'green', cancelled: 'red', expired: 'gray',
};
const STATUS_LABEL: Record<ReservationStatus, string> = {
  held: 'Held', confirmed: 'Confirmed', cancelled: 'Cancelled', expired: 'Expired',
};

function formatCents(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

function formatDateTime(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return `${date} · ${time}`;
}

async function enrich(reservations: Reservation[]): Promise<EnrichedReservation[]> {
  if (reservations.length === 0) return [];

  const facilityIds = [...new Set(reservations.map(r => r.facility_id))];
  const courtIds = [...new Set(reservations.filter(r => r.asset_type === 'court').map(r => r.asset_id))];
  const machineIds = [...new Set(reservations.filter(r => r.asset_type === 'ball_machine').map(r => r.asset_id))];
  const reservationIds = reservations.map(r => r.id);

  const [{ data: facilities }, { data: courts }, { data: machines }, { data: playerRows }, paymentsByReservation] = await Promise.all([
    facilityIds.length > 0 ? supabase.from('facilities').select('id, name').in('id', facilityIds) : Promise.resolve({ data: [] }),
    courtIds.length > 0 ? supabase.from('courts').select('id, name, indoor_outdoor').in('id', courtIds) : Promise.resolve({ data: [] }),
    machineIds.length > 0 ? supabase.from('ball_machines').select('id, name').in('id', machineIds) : Promise.resolve({ data: [] }),
    supabase.from('reservation_players').select('reservation_id').in('reservation_id', reservationIds),
    fetchReservationPayments(reservationIds),
  ]);

  const facilityById = new Map((facilities ?? []).map(f => [f.id, f.name]));
  const courtById = new Map((courts ?? []).map(c => [c.id, c]));
  const machineById = new Map((machines ?? []).map(m => [m.id, m]));
  const countByReservation = new Map<string, number>();
  for (const row of playerRows ?? []) {
    countByReservation.set(row.reservation_id, (countByReservation.get(row.reservation_id) ?? 0) + 1);
  }

  return reservations.map(r => {
    const { startsAt, endsAt } = parseTstzrange(r.time_range as unknown as string);
    const court = r.asset_type === 'court' ? courtById.get(r.asset_id) : null;
    const machine = r.asset_type === 'ball_machine' ? machineById.get(r.asset_id) : null;
    return {
      ...r,
      startsAt, endsAt,
      facilityName: facilityById.get(r.facility_id) ?? 'Facility',
      assetName: court?.name ?? machine?.name ?? 'Reservation',
      assetSubtitle: court ? (court.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor') : null,
      currentPlayers: countByReservation.get(r.id) ?? 0,
      payment: paymentsByReservation.get(r.id) ?? null,
    };
  });
}

function BookingCard({ res, onPress }: { res: EnrichedReservation; onPress: () => void }) {
  const isBallMachine = res.asset_type === 'ball_machine';
  const needed = playersNeeded(res.currentPlayers, res.max_players);

  return (
    <TouchableOpacity style={c.card} activeOpacity={0.85} onPress={onPress}>
      <View style={c.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={c.assetName} numberOfLines={1}>{res.assetName}</Text>
          <Text style={c.facilityName} numberOfLines={1}>{res.facilityName}</Text>
        </View>
        <StatusChip label={STATUS_LABEL[res.status]} variant={STATUS_VARIANT[res.status]} />
      </View>

      <View style={c.metaRow}>
        <Ionicons name="calendar-outline" size={13} color={L.textSub} />
        <Text style={c.metaText}>{formatDateTime(res.startsAt, res.endsAt)}</Text>
      </View>

      <View style={c.footerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {res.flash_deal_discount_percent != null && <StatusChip label="FLASH DEAL" variant="gold" icon="flash" />}
          {!isBallMachine && (
            <Text style={c.playersText}>{occupancyStatusLabel(res.currentPlayers, res.max_players)}{needed === 0 ? '' : ` (${res.currentPlayers}/${res.max_players})`}</Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {/* What they paid, fee included — not the court price. */}
          <Text style={c.amount}>{formatCents(res.buyer_total_cents ?? res.final_price_cents)}</Text>
          <Text style={c.paymentStatusText}>{reservationPaymentStatusLabel(res.payment)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const c = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, marginTop: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  assetName: { color: L.navy, fontSize: 15, fontWeight: '800' },
  facilityName: { color: L.textSub, fontSize: 12, fontWeight: '600', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { color: L.textSub, fontSize: 12, fontWeight: '600' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  playersText: { color: L.textSub, fontSize: 11, fontWeight: '600' },
  amount: { color: L.navy, fontSize: 15, fontWeight: '800' },
  paymentStatusText: { color: L.textSub, fontSize: 10, fontWeight: '600', marginTop: 2 },
});

export default function MyBookingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [tab, setTab] = useState<Tab>('upcoming');
  const [reservations, setReservations] = useState<EnrichedReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchMyReservations(user.id);
      setReservations(await enrich(raw));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your bookings.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleOpen(res: EnrichedReservation) {
    setBookingFacility(res.facility_id, res.facilityName);
    setBookingSelection({
      assetType: res.asset_type as 'court' | 'ball_machine',
      assetId: res.asset_id,
      assetName: res.assetName,
      startsAt: res.startsAt,
      endsAt: res.endsAt,
      basePriceCents: res.base_price_cents,
      flashDealDiscountPercent: res.flash_deal_discount_percent,
      finalPriceCents: res.final_price_cents,
    });
    setBookingReservationId(res.id);
    router.push('/booking/game-status' as never);
  }

  const now = Date.now();
  const list = reservations.filter(r => {
    if (tab === 'cancelled') return r.status === 'cancelled' || r.status === 'expired';
    if (r.status === 'cancelled' || r.status === 'expired') return false;
    const isPast = new Date(r.endsAt).getTime() < now;
    return tab === 'past' ? isPast : !isPast;
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>My Bookings</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.tabRow}>
        {(['upcoming', 'past', 'cancelled'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} activeOpacity={0.85} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t[0].toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
        {loading ? (
          <ActivityIndicator size="large" color={L.navy} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={s.emptyText}>{error}</Text>
        ) : list.length === 0 ? (
          <Text style={s.emptyText}>
            {tab === 'upcoming' ? "You don't have any upcoming bookings."
              : tab === 'past' ? 'No past bookings yet.'
              : 'No cancelled bookings.'}
          </Text>
        ) : (
          list.map(res => <BookingCard key={res.id} res={res} onPress={() => handleOpen(res)} />)
        )}
      </ScrollView>
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

  tabRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm, backgroundColor: L.bg },
  tab: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderColor: L.border, borderRadius: radius.button, paddingVertical: 10 },
  tabActive: { borderColor: L.gold, backgroundColor: L.goldBg },
  tabText: { color: L.textSub, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: L.navy },

  emptyText: { color: L.textSub, fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 40, lineHeight: 20 },
});
