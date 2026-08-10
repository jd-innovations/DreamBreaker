import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { StatusChip } from '@/components';
import {
  fetchReservationById, fetchReservationPlayersWithProfiles,
  playersNeeded, occupancyStatusLabel,
  type Reservation,
} from '@/lib/supabase/reservations';
import { confirmReservation } from '@/lib/supabase/reservationPayment';
import { getBookingFacility, getBookingSelection, getBookingReservationId } from '@/lib/bookingStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  white: colors.white,
};

const CONFIRM_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to confirm this reservation.',
  reservation_not_found: 'This reservation no longer exists.',
  not_authorized: 'Only the organizer can confirm this reservation.',
  reservation_not_held: 'This reservation is no longer awaiting confirmation.',
  hold_expired: 'Your hold expired. Please choose a new time.',
};

function formatDateTimeRange(startsAt: string, endsAt: string): { date: string; time: string } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return { date, time };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const facility = getBookingFacility();
  const selection = getBookingSelection();
  const reservationId = getBookingReservationId();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!reservationId) { setError('No active reservation. Go back and choose a time.'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [res, roster] = await Promise.all([
        fetchReservationById(reservationId),
        fetchReservationPlayersWithProfiles(reservationId),
      ]);
      if (!res) { setError('This reservation no longer exists.'); return; }
      setReservation(res);
      setCurrentPlayers(roster.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your reservation.');
    } finally {
      setLoading(false);
    }
  }, [reservationId]);

  useEffect(() => { load(); }, [load]);

  async function handleConfirm() {
    if (!reservation || confirming) return;

    // Already confirmed (e.g. user navigated back to Review after paying) --
    // never re-call confirm_reservation, which would throw
    // reservation_not_held. Just move on to Confirmation.
    if (reservation.status === 'confirmed') {
      router.push('/booking/confirmation' as never);
      return;
    }

    setConfirming(true);
    try {
      // The payment boundary. No Stripe call exists yet -- confirmReservation()
      // wraps confirm_reservation(), which only flips held -> confirmed for the
      // SAME reservation created in Choose Time & Court. Nothing here creates a
      // new reservation row.
      await confirmReservation(reservation.id);
      router.push('/booking/confirmation' as never);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      Alert.alert('Could Not Confirm', CONFIRM_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.navy} />
      </View>
    );
  }

  if (error || !reservation) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={36} color={L.border} />
        <Text style={s.errorText}>{error ?? 'Something went wrong.'}</Text>
        <TouchableOpacity onPress={() => goBack()} style={s.errorBackBtn}>
          <Text style={s.errorBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isBallMachine = reservation.asset_type === 'ball_machine';
  const max = reservation.max_players;
  const needed = playersNeeded(currentPlayers, max);
  const hasDeal = reservation.flash_deal_discount_percent != null;
  const startsAt = selection.startsAt ?? reservation.created_at;
  const endsAt = selection.endsAt ?? reservation.created_at;
  const { date, time } = formatDateTimeRange(startsAt, endsAt);
  const alreadyConfirmed = reservation.status === 'confirmed';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Review & Pay</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
        <View style={s.card}>
          <Row icon="business-outline" label="Facility" value={facility.facilityName ?? '—'} />
          <Row
            icon={isBallMachine ? 'disc-outline' : 'pickleball' as never}
            label={isBallMachine ? 'Ball Machine' : 'Court'}
            value={selection.assetName ?? '—'}
          />
          <Row icon="calendar-outline" label="Date" value={date} />
          <Row icon="time-outline" label="Time" value={time} />
          {!isBallMachine && (
            <Row icon="people-outline" label="Game Format" value={reservation.game_format === 'doubles' ? 'Doubles' : 'Singles'} />
          )}
        </View>

        {!isBallMachine && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Players</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusChip
                label={occupancyStatusLabel(currentPlayers, max)}
                variant={needed === 0 ? 'green' : 'gold'}
                icon={needed === 0 ? 'checkmark-circle' : 'people-outline'}
              />
              <Text style={s.playersText}>{currentPlayers} of {max} players</Text>
            </View>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.sectionTitle}>Price</Text>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Base Price</Text>
            <Text style={hasDeal ? s.priceStrike : s.priceValue}>{formatCents(reservation.base_price_cents)}</Text>
          </View>
          {hasDeal && (
            <View style={s.priceRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash" size={14} color={L.gold} />
                <Text style={s.priceLabel}>Flash Deal ({reservation.flash_deal_discount_percent}% off)</Text>
              </View>
              <Text style={s.priceDiscount}>
                -{formatCents(reservation.base_price_cents - reservation.final_price_cents)}
              </Text>
            </View>
          )}
          <View style={[s.priceRow, s.priceRowFinal]}>
            <Text style={s.priceFinalLabel}>Total</Text>
            <Text style={s.priceFinalValue}>{formatCents(reservation.final_price_cents)}</Text>
          </View>
          <Text style={s.priceNote}>No taxes or service fees are applied yet.</Text>
        </View>

        <View style={s.paymentNotice}>
          <Ionicons name="construct-outline" size={16} color={L.textSub} />
          <Text style={s.paymentNoticeText}>
            Payment is not live yet. Confirming below uses a test-mode boundary that skips real charge capture.
          </Text>
        </View>

        <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handleConfirm} disabled={confirming}>
          {confirming ? (
            <ActivityIndicator size="small" color={L.white} />
          ) : (
            <Text style={s.primaryBtnText}>
              {alreadyConfirmed ? 'Continue to Confirmation' : 'Confirm Reservation (Test Mode — No Payment)'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={rw.row}>
      <Ionicons name={icon} size={16} color={L.gold} />
      <Text style={rw.label}>{label}</Text>
      <Text style={rw.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}
const rw = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  label: { color: L.textSub, fontSize: 13, fontWeight: '600', width: 100 },
  value: { flex: 1, color: L.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: L.bg, paddingHorizontal: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.screenV, backgroundColor: L.bg,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title:   { color: L.navy, fontSize: 17, fontWeight: '900' },

  card: {
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, marginTop: spacing.md,
  },
  sectionTitle: { color: L.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.sm },
  playersText: { color: L.textSub, fontSize: 12, fontWeight: '600' },

  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  priceRowFinal: { borderTopWidth: 1, borderTopColor: L.border, marginTop: 4, paddingTop: 10 },
  priceLabel: { color: L.textSub, fontSize: 13, fontWeight: '600' },
  priceValue: { color: L.text, fontSize: 14, fontWeight: '700' },
  priceStrike: { color: L.textSub, fontSize: 14, fontWeight: '600', textDecorationLine: 'line-through' },
  priceDiscount: { color: colors.success, fontSize: 14, fontWeight: '700' },
  priceFinalLabel: { color: L.navy, fontSize: 15, fontWeight: '800' },
  priceFinalValue: { color: L.navy, fontSize: 18, fontWeight: '900' },
  priceNote: { color: L.textSub, fontSize: 11, fontWeight: '500', marginTop: 8 },

  paymentNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: L.page, borderRadius: radius.card, padding: spacing.md, marginTop: spacing.md,
  },
  paymentNoticeText: { flex: 1, color: L.textSub, fontSize: 12, fontWeight: '500', lineHeight: 17 },

  primaryBtn: { backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xl },
  primaryBtnText: { color: L.white, fontSize: 15, fontWeight: '800' },

  errorText: { color: L.textSub, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  errorBackBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.button, backgroundColor: L.navy },
  errorBackText: { color: L.white, fontSize: 14, fontWeight: '700' },
});
