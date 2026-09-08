import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import QRCode from 'react-native-qrcode-svg';
import { StatusChip, type StatusVariant } from '@/components';
import { fetchCheckInCode, checkInQrValue } from '@/lib/supabase/reservationCheckIn';
import { useSession } from '@/hooks/useSession';
import { useReservation } from '@/hooks/useReservation';
import { fetchFacilityById, type FacilityDetail } from '@/lib/supabase/facilities';
import { fetchCourtById } from '@/lib/supabase/courts';
import { fetchBallMachineById } from '@/lib/supabase/ballMachines';
import {
  fetchReservationPlayersWithProfiles, cancelReservationWithRefund, fetchReservationRefundQuote,
  playersNeeded, parseTstzrange,
  type ReservationPlayerWithProfile, type ReservationStatus,
} from '@/lib/supabase/reservations';
import {
  fetchReservationPayment, reservationPaymentStatusLabel, type ReservationPaymentStatus,
} from '@/lib/payments/reservationPaymentIntent';
import { getBookingReservationId, setBookingFacility, setBookingSelection } from '@/lib/bookingStore';

const PAYMENT_STATUS_VARIANT: Record<string, StatusVariant> = {
  succeeded: 'green', requires_confirmation: 'gold', processing: 'gold',
  failed: 'red', canceled: 'gray', refunded: 'gray', partially_refunded: 'gray',
};

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  white: colors.white, danger: colors.danger,
};

const STATUS_VARIANT: Record<ReservationStatus, StatusVariant> = {
  held: 'gold', confirmed: 'green', cancelled: 'red', expired: 'gray',
};
const STATUS_LABEL: Record<ReservationStatus, string> = {
  held: 'Held', confirmed: 'Confirmed', cancelled: 'Cancelled', expired: 'Expired',
};

function formatCents(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

function formatDateTime(startsAt: string, endsAt: string): { date: string; time: string } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return {
    date: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
  };
}

export default function GameStatusScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const reservationId = getBookingReservationId();

  // Live reservation + occupancy -- refetches automatically on reservations
  // UPDATE and reservation_players INSERT/DELETE via its own realtime
  // subscription (see useReservation.ts), so player joins/leaves and
  // held->confirmed/cancelled transitions all show up here without a manual
  // refresh.
  const { reservation, occupancy, loading, error, refresh } = useReservation(reservationId);

  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [assetName, setAssetName] = useState<string | null>(null);
  const [assetSubtitle, setAssetSubtitle] = useState<string | null>(null);
  const [roster, setRoster] = useState<ReservationPlayerWithProfile[]>([]);
  const [payment, setPayment] = useState<ReservationPaymentStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Phase 5 check-in code. Fetched rather than read from the reservation
  // payload so it appears for bookings made before check-in existed.
  //
  // MUST live here, with the other hooks. An earlier revision declared this
  // state and effect further down, next to the JSX that uses them — which is
  // after `if (loading) return` and `if (error) return`. The first render bails
  // out early and skips them, the next render runs them, React sees more hooks
  // than last time, and the screen crashes on open. Rules of Hooks: no hook
  // after a conditional return, however local the state feels.
  const [checkInCode, setCheckInCode] = useState<string | null>(null);
  useEffect(() => {
    // reservation is null while loading, so this derives its own status rather
    // than depending on the `status` const computed after the early returns.
    const resStatus = occupancy?.status ?? reservation?.status;
    if (resStatus !== 'confirmed' || !reservationId) { setCheckInCode(null); return; }
    let cancelled = false;
    void fetchCheckInCode(reservationId).then(c => { if (!cancelled) setCheckInCode(c); });
    return () => { cancelled = true; };
  }, [occupancy?.status, reservation?.status, reservationId]);

  // Facility + asset details: authoritative from the reservation row itself
  // (not bookingStore) so Game Status works as a standalone destination --
  // from My Bookings, from Confirmation, or a future deep link -- without
  // depending on the in-memory wizard state having survived.
  useEffect(() => {
    if (!reservation) return;
    let cancelled = false;

    fetchFacilityById(reservation.facility_id).then(f => { if (!cancelled) setFacility(f); });

    if (reservation.asset_type === 'court') {
      fetchCourtById(reservation.asset_id).then(court => {
        if (cancelled || !court) return;
        setAssetName(court.name);
        setAssetSubtitle(court.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor');
      });
    } else {
      fetchBallMachineById(reservation.asset_id).then(machine => {
        if (cancelled || !machine) return;
        setAssetName(machine.name);
        setAssetSubtitle(machine.description);
      });
    }

    return () => { cancelled = true; };
  }, [reservation]);

  // Roster refetches whenever occupancy's player count changes -- occupancy
  // itself is kept live by useReservation()'s realtime subscription, so a
  // join/leave elsewhere flows through to the roster list here too.
  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    fetchReservationPlayersWithProfiles(reservationId).then(rows => { if (!cancelled) setRoster(rows); });
    return () => { cancelled = true; };
  }, [reservationId, occupancy?.currentPlayers]);

  // Payment status refetches whenever the reservation's own status changes
  // (e.g. held -> confirmed via finalizeReservationPayment) -- occupancy's
  // realtime subscription already re-runs on every reservations UPDATE, so
  // this rides the same trigger.
  useEffect(() => {
    if (!reservationId) return;
    let cancelled = false;
    fetchReservationPayment(reservationId).then(row => { if (!cancelled) setPayment(row); });
    return () => { cancelled = true; };
  }, [reservationId, occupancy?.status]);

  function handleDirections() {
    if (!facility) return;
    const q = encodeURIComponent(`${facility.address}, ${facility.city}, ${facility.state}`);
    Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
    );
  }

  function handleFindPlayers() {
    if (!reservation || !facility) return;
    setBookingFacility(facility.id, facility.name);
    setBookingSelection({
      assetType: reservation.asset_type as 'court' | 'ball_machine',
      assetId: reservation.asset_id,
      assetName: assetName ?? 'Reservation',
      startsAt: null, endsAt: null,
      basePriceCents: reservation.base_price_cents,
      flashDealDiscountPercent: reservation.flash_deal_discount_percent,
      finalPriceCents: reservation.final_price_cents,
    });
    router.push('/booking/players' as never);
  }

  // Phase 8. The quote is fetched BEFORE the confirmation is shown, so the
  // player is told what they get back — or that they get nothing — while they
  // can still decide. Cancelling first and explaining afterwards is how people
  // end up surprised by a charge.
  async function handleCancel() {
    if (!reservation) return;

    const quote = await fetchReservationRefundQuote(reservation.id);
    const money = (c: number) => `$${(c / 100).toFixed(2)}`;

    const body = !quote || quote.reason === 'no_settled_payment'
      ? `Cancel your reservation for ${assetName ?? 'this booking'}? This cannot be undone.`
      : quote.refundable
        ? `You will be refunded ${money(quote.refundableCents)}.\n\nThis cannot be undone.`
        : quote.reason === 'already_refunded'
          ? 'This booking has already been refunded. Cancelling will not return anything further.'
          : `This is inside the facility's ${quote.windowHours}-hour cancellation window, so it is not refundable. You will still be charged.\n\nThis cannot be undone.`;

    Alert.alert(
      'Leave This Game',
      body,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await cancelReservationWithRefund(reservation.id);
              if (!res.ok) {
                Alert.alert(
                  'Could Not Cancel',
                  res.code.includes('already_terminal')
                    ? 'This reservation is already cancelled or expired.'
                    : res.code.includes('not_authorized')
                      ? 'Only the organizer or facility staff can cancel this.'
                      : 'Something went wrong. Please try again.',
                );
                return;
              }
              await refresh();

              if (res.result.refunded) {
                Alert.alert('Cancelled', `${money(res.result.refundedCents)} is on its way back to your card.`);
              } else if (res.result.refundPending) {
                // The booking is cancelled and the amount is recorded; only the
                // Stripe call failed. Saying "no refund" here would be wrong.
                Alert.alert(
                  'Cancelled',
                  'Your refund is recorded and being processed. Contact support if it has not arrived in a few days.',
                );
              }
            } catch {
              Alert.alert('Could Not Cancel', 'Something went wrong. Please try again.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  if (error || !reservation || !reservationId) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={36} color={L.border} />
        <Text style={s.errorText}>{error ?? 'No reservation selected. Go back to My Bookings.'}</Text>
        <TouchableOpacity onPress={() => goBack()} style={s.errorBackBtn}>
          <Text style={s.errorBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isBallMachine = reservation.asset_type === 'ball_machine';
  const current = occupancy?.currentPlayers ?? 0;
  const max = occupancy?.maxPlayers ?? reservation.max_players;
  const needed = playersNeeded(current, max);
  const status = occupancy?.status ?? reservation.status;
  const isOrganizer = user?.id === reservation.organizer_id;
  const isActive = status === 'held' || status === 'confirmed';
  const showFindPlayers = isOrganizer && !isBallMachine && needed > 0 && isActive;
  // Every player leaves the same way, including whoever booked first.
  // "Organizer" is a label, not a role — they have no authority over a game
  // other people have paid to be in, and there is no cancel-the-booking action.
  const canLeave = isActive && roster.some(p => p.profileId === user?.id);
  const organizer = roster.find(p => p.isOrganizer);
  const { startsAt, endsAt } = parseTstzrange(reservation.time_range as unknown as string);
  const { date, time } = formatDateTime(startsAt, endsAt);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Game Status</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.assetName}>{assetName ?? 'Reservation'}</Text>
            <StatusChip label={STATUS_LABEL[status]} variant={STATUS_VARIANT[status]} />
          </View>
          <Text style={s.facilityName}>{facility?.name ?? '—'}</Text>
          {assetSubtitle ? <Text style={s.subtitle}>{assetSubtitle}</Text> : null}
          <View style={s.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={L.gold} />
            <Text style={s.metaText}>{date} · {time}</Text>
          </View>
        </View>

        {status === 'confirmed' && checkInCode && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Check in at the desk</Text>
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12 }}>
                <QRCode value={checkInQrValue(checkInCode)} size={150} backgroundColor="#FFFFFF" />
              </View>
              <Text style={s.checkInCode}>{checkInCode}</Text>
              <Text style={s.checkInHint}>
                Show this when you arrive, or read out the code.
              </Text>
            </View>
          </View>
        )}

        {!isBallMachine && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Occupancy</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusChip
                label={needed === 0 ? 'Game Complete' : `Need ${needed === 1 ? 'One Player' : `${needed} More Players`}`}
                variant={needed === 0 ? 'green' : 'gold'}
                icon={needed === 0 ? 'checkmark-circle' : 'people-outline'}
              />
              <Text style={s.occupancyText}>{current} / {max} Players</Text>
            </View>

            <Text style={[s.sectionTitle, { marginTop: spacing.lg }]}>Roster</Text>
            {organizer && (
              <View style={s.rosterRow}>
                {organizer.avatarUrl ? (
                  <Image source={{ uri: organizer.avatarUrl }} style={s.avatarImg} />
                ) : (
                  <View style={s.avatar}><Text style={s.avatarText}>{organizer.fullName.slice(0, 2).toUpperCase()}</Text></View>
                )}
                <Text style={s.rosterName}>{organizer.fullName}</Text>
                <StatusChip label="Organizer" variant="navy" />
              </View>
            )}
            {roster.filter(p => !p.isOrganizer).map(p => (
              <View key={p.id} style={s.rosterRow}>
                {p.avatarUrl ? (
                  <Image source={{ uri: p.avatarUrl }} style={s.avatarImg} />
                ) : (
                  <View style={s.avatar}><Text style={s.avatarText}>{p.fullName.slice(0, 2).toUpperCase()}</Text></View>
                )}
                <Text style={s.rosterName}>{p.fullName}</Text>
              </View>
            ))}
          </View>
        )}

        {isBallMachine && organizer && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Reserved By</Text>
            <View style={s.rosterRow}>
              {organizer.avatarUrl ? (
                <Image source={{ uri: organizer.avatarUrl }} style={s.avatarImg} />
              ) : (
                <View style={s.avatar}><Text style={s.avatarText}>{organizer.fullName.slice(0, 2).toUpperCase()}</Text></View>
              )}
              <Text style={s.rosterName}>{organizer.fullName}</Text>
            </View>
          </View>
        )}

        <View style={s.card}>
          <View style={s.rowBetween}>
            <Text style={s.priceLabel}>Amount</Text>
            <Text style={s.priceValue}>{formatCents(reservation.buyer_total_cents ?? reservation.final_price_cents)}</Text>
          </View>
          <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <StatusChip
              label={reservationPaymentStatusLabel(payment)}
              variant={payment ? (PAYMENT_STATUS_VARIANT[payment.status] ?? 'gray') : 'gray'}
            />
          </View>
        </View>

        {showFindPlayers && (
          <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handleFindPlayers}>
            <Ionicons name="people-outline" size={18} color={L.white} />
            <Text style={s.primaryBtnText}>Find / Invite Players</Text>
          </TouchableOpacity>
        )}

        {facility && (
          <TouchableOpacity style={s.secondaryBtn} activeOpacity={0.85} onPress={handleDirections}>
            <Ionicons name="navigate-outline" size={18} color={L.navy} />
            <Text style={s.secondaryBtnText}>Directions</Text>
          </TouchableOpacity>
        )}

        {canLeave && (
          <TouchableOpacity style={s.dangerBtn} activeOpacity={0.85} onPress={handleCancel} disabled={cancelling}>
            {cancelling ? <ActivityIndicator size="small" color={L.danger} /> : (
              <>
                <Ionicons name="exit-outline" size={18} color={L.danger} />
                <Text style={s.dangerBtnText}>Leave &amp; Free My Slots</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: L.bg, paddingHorizontal: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.screenV, backgroundColor: L.bg,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: text.sectionTitle.size, fontWeight: '900' },

  card: {
    backgroundColor: L.bg, borderRadius: shape.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, marginTop: spacing.md,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // titleSm, matching my-bookings. This took sectionTitle because it was 17/900
  // and titleSm was 16/800 at the time; both are 17 now, so the divergence was
  // in the source rather than on screen.
  assetName: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  facilityName: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 4 },
  subtitle: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { color: L.text, fontSize: text.caption.size, fontWeight: '500' },

  sectionTitle: { color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing, textTransform: 'uppercase', marginBottom: spacing.sm },
  checkInCode: { color: colors.navy, fontSize: text.statNumber.size, fontWeight: '900', letterSpacing: 6 },
  checkInHint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
  occupancyText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: L.navy, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { color: L.white, fontSize: 12, fontWeight: '800' },
  rosterName: { flex: 1, color: L.text, fontSize: text.rowTitle.size, fontWeight: '700' },

  priceLabel: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  priceValue: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: shape.cta, paddingVertical: 15, marginTop: spacing.xl,
  },
  primaryBtnText: { color: L.white, fontSize: text.actionLarge.size, fontWeight: '800' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.bg, borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    paddingVertical: 14, marginTop: spacing.sm,
  },
  secondaryBtnText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },

  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.dangerBg, borderRadius: shape.cta, paddingVertical: 14, marginTop: spacing.sm,
  },
  dangerBtnText: { color: L.danger, fontSize: text.action.size, fontWeight: '800' },

  errorText: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textAlign: 'center' },
  errorBackBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: shape.cta, backgroundColor: L.navy },
  errorBackText: { color: L.white, fontSize: text.action.size, fontWeight: '800' },
});
