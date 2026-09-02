import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { StatusChip, AppIcon, type AppIconName } from '@/components';
import {
  fetchReservationById, fetchReservationPlayersWithProfiles,
  playersNeeded, occupancyStatusLabel, parseTstzrange,
  type Reservation,
} from '@/lib/supabase/reservations';
import { fetchFacilityById } from '@/lib/supabase/facilities';
import { fetchCourtById } from '@/lib/supabase/courts';
import { fetchBallMachineById } from '@/lib/supabase/ballMachines';
import { confirmReservation } from '@/lib/supabase/reservationPayment';
import { reservationPaymentErrorMessage } from '@/lib/payments/reservationPaymentIntent';
import { useReservationPayment } from '@/lib/payments/useReservationPayment';
import { getBookingFacility, getBookingSelection, getBookingReservationId } from '@/lib/bookingStore';
import { isFeatureEnabled } from '@/lib/featureFlags';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  white: colors.white, success: colors.success,
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

function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  // Snapshot once at mount: these getters return a new object each call, so
  // depending on them directly would re-run load() on every render.
  const [fromWizard] = useState(() => ({
    facilityName: getBookingFacility().facilityName,
    assetName:    getBookingSelection().assetName,
  }));
  const reservationId = getBookingReservationId();
  // Stable for the lifetime of this screen visit, so retrying Pay after a
  // transient failure reuses the same PaymentIntent (create-booking-payment-intent's
  // idempotency key includes this) instead of creating a new one each tap.
  const [attemptId] = useState(() => Math.random().toString(36).slice(2));

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState(0);
  // bookingStore is plain in-memory module state — it is empty after an app
  // relaunch, and this screen is reachable in exactly that condition (kill the
  // app mid-payment, reopen). Names are recovered from the reservation row
  // itself rather than rendering "—" on the screen where money changes hands.
  const [names, setNames] = useState<{ facility: string | null; asset: string | null }>({
    facility: fromWizard.facilityName,
    asset:    fromWizard.assetName,
  });
  // Ticks once a second while a hold is live, to drive the countdown.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Last non-fatal payment problem, shown inline above the Pay button so a
  // failed attempt leaves something on screen to act on after the alert is
  // dismissed. Cleared at the start of every attempt.
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const { payForReservation, processing: paying } = useReservationPayment();

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

      // Only fetch what the wizard store could not carry over.
      if (!fromWizard.facilityName || !fromWizard.assetName) {
        const [fac, asset] = await Promise.all([
          fromWizard.facilityName ? null : fetchFacilityById(res.facility_id).catch(() => null),
          fromWizard.assetName
            ? null
            : (res.asset_type === 'ball_machine'
                ? fetchBallMachineById(res.asset_id)
                : fetchCourtById(res.asset_id)).catch(() => null),
        ]);
        setNames({
          facility: fromWizard.facilityName ?? fac?.name ?? null,
          asset:    fromWizard.assetName    ?? asset?.name ?? null,
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load your reservation.');
    } finally {
      setLoading(false);
    }
  }, [reservationId, fromWizard]);

  useEffect(() => { load(); }, [load]);

  // A hold has a server-side fuse (create_reservation defaults to 10 minutes)
  // and nothing on this screen used to show it — a user could sit on Review &
  // Pay past expiry and only discover it by tapping Pay. Tick while the hold is
  // live so the countdown below stays honest; stop once it lapses or the
  // reservation is no longer held.
  const holdExpiresAt = reservation?.status === 'held' ? reservation.hold_expires_at : null;
  useEffect(() => {
    if (!holdExpiresAt) return;
    if (new Date(holdExpiresAt).getTime() <= Date.now()) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  // Calls confirm_reservation() directly. This is the no-charge path ONLY: a
  // reservation with nothing to pay, or one create-booking-payment-intent has
  // told us needs no payment (no_payment_required). It must never be reachable
  // for a priced reservation that hasn't been paid — confirming one here
  // manufactures a booking nobody paid for. The "Continue in Test Mode" branch
  // that did exactly that was removed when PaymentSheet was wired in (3.1).
  async function handleConfirmWithoutPayment() {
    if (!reservation || confirming) return;

    if (reservation.status === 'confirmed') {
      router.push('/booking/confirmation' as never);
      return;
    }

    setConfirming(true);
    try {
      // Nothing here creates a new reservation row -- confirm_reservation()
      // only flips held -> confirmed for the SAME reservation created in
      // Choose Time & Court.
      await confirmReservation(reservation.id);
      router.push('/booking/confirmation' as never);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      Alert.alert('Could Not Confirm', CONFIRM_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  // The real payment boundary. Presents Stripe's native PaymentSheet against a
  // PaymentIntent created (or, on retry, reused) by create-booking-payment-intent
  // for this EXISTING reservation -- the amount charged is always
  // reservation.final_price_cents, server-snapshotted at Choose Time & Court
  // (already includes any Flash Deal discount), never recomputed here.
  //
  // The client never declares the reservation confirmed off its own PaymentSheet
  // result: useReservationPayment polls reservations.status for the
  // webhook-confirmed state, and anything short of that is reported as "payment
  // received, still confirming" -- never as a failure. Telling someone their
  // card payment failed seconds after it succeeded is how you get a duplicate
  // charge.
  async function handlePay() {
    if (!reservation || paying) return;
    setPaymentError(null);

    const outcome = await payForReservation(reservation.id, attemptId);

    switch (outcome.status) {
      case 'confirmed':
        router.push('/booking/confirmation' as never);
        return;

      case 'succeeded_pending_confirmation':
        // Stripe captured the money; the webhook just hasn't landed yet. The
        // confirmation screen reads the payments row directly and shows
        // "Payment Pending" until it does.
        Alert.alert(
          'Payment Received',
          "We're still confirming your booking. It'll appear in My Bookings in a moment — no need to pay again.",
          [{ text: 'OK', onPress: () => router.push('/booking/confirmation' as never) }],
        );
        return;

      case 'canceled':
        // The user dismissed PaymentSheet. Not an error and not worth an alert
        // -- the Pay button is still right there, and the hold is untouched.
        return;

      case 'failed':
        setPaymentError(outcome.message);
        Alert.alert('Payment Failed', `${outcome.message} You have not been charged.`);
        return;

      case 'error': {
        if (outcome.code === 'already_confirmed') {
          router.push('/booking/confirmation' as never);
          return;
        }
        if (outcome.code === 'no_payment_required') {
          await handleConfirmWithoutPayment();
          return;
        }
        const message = reservationPaymentErrorMessage(outcome.code);
        setPaymentError(message);
        Alert.alert('Could Not Start Payment', message);
        return;
      }
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
  // Read the slot from the reservation row, never from bookingStore. The store
  // is empty after a relaunch, and the old `?? reservation.created_at` fallback
  // rendered the row's creation timestamp as though it were the booking time —
  // wrong information, on the screen where the user decides to pay.
  const { startsAt, endsAt } = parseTstzrange(reservation.time_range as string);
  const { date, time } = formatDateTimeRange(startsAt, endsAt);
  const holdMsLeft = holdExpiresAt ? new Date(holdExpiresAt).getTime() - nowMs : null;
  const holdExpired = holdMsLeft != null && holdMsLeft <= 0;
  const alreadyConfirmed = reservation.status === 'confirmed';
  // Free reservations have no payment boundary to cross, so they stay in beta
  // scope regardless of the paid-booking flag. Server-side, whether a charge is
  // required is still decided by create-booking-payment-intent — this only
  // picks which affordance to render.
  const requiresPayment = reservation.final_price_cents > 0;
  const paidBookingEnabled = isFeatureEnabled('paidBooking');

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Review & Pay</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
        <View style={s.card}>
          <Row icon="business-outline" label="Facility" value={names.facility ?? '—'} />
          <Row
            icon={isBallMachine ? 'disc-outline' : 'pickleball'}
            label={isBallMachine ? 'Ball Machine' : 'Court'}
            value={names.asset ?? '—'}
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
          {(reservation.buyer_service_fee_cents ?? 0) > 0 && (
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Convenience Fee</Text>
              <Text style={s.priceValue}>{formatCents(reservation.buyer_service_fee_cents ?? 0)}</Text>
            </View>
          )}

          <View style={[s.priceRow, s.priceRowFinal]}>
            <Text style={s.priceFinalLabel}>Total</Text>
            {/* buyer_total_cents is what is actually charged. Showing
                final_price_cents here would quote the court price and then take
                more, which is the one number a player will check. */}
            <Text style={s.priceFinalValue}>
              {formatCents(reservation.buyer_total_cents ?? reservation.final_price_cents)}
            </Text>
          </View>
          <Text style={s.priceNote}>No taxes or service fees are applied yet.</Text>
        </View>

        {holdMsLeft != null && !holdExpired && (
          <View style={s.holdBanner}>
            <Ionicons name="time-outline" size={15} color={L.gold} />
            <Text style={s.holdBannerText}>
              Your hold on this slot expires in {formatCountdown(holdMsLeft)}.
            </Text>
          </View>
        )}

        {holdExpired ? (
          // The server refuses to start a charge against a lapsed hold
          // (create-booking-payment-intent returns hold_expired), so offering
          // Pay here would only produce an error alert. Say so up front.
          <>
            <View style={s.paymentErrorCard}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={s.paymentErrorText}>
                Your hold expired, so this slot is no longer reserved for you. You have not been
                charged. Choose a new time to book it.
              </Text>
            </View>
            <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={() => goBack()}>
              <Text style={s.primaryBtnText}>Choose a New Time</Text>
            </TouchableOpacity>
          </>
        ) : alreadyConfirmed ? (
          <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handleConfirmWithoutPayment} disabled={confirming}>
            {confirming ? <ActivityIndicator size="small" color={L.white} /> : (
              <Text style={s.primaryBtnText}>Continue to Confirmation</Text>
            )}
          </TouchableOpacity>
        ) : !requiresPayment ? (
          <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handleConfirmWithoutPayment} disabled={confirming}>
            {confirming ? <ActivityIndicator size="small" color={L.white} /> : (
              <Text style={s.primaryBtnText}>Confirm Booking</Text>
            )}
          </TouchableOpacity>
        ) : !paidBookingEnabled ? (
          // PaymentSheet is wired (execution plan 3.1), but paid booking stays
          // out of beta scope until the flow has been exercised end-to-end on a
          // device build. No CTA here rather than a real charge nobody has
          // watched go through. Flip FEATURE_VISIBILITY.paidBooking to
          // 'included' (and BETA_SCOPE.md with it) once it has.
          <View style={s.paymentNotice}>
            <Ionicons name="lock-closed-outline" size={16} color={L.textSub} />
            <Text style={s.paymentNoticeText}>
              Paid court bookings aren&apos;t available in this release yet. This court charges{' '}
              {formatCents(reservation.buyer_total_cents ?? reservation.final_price_cents)} — your hold will expire on its own, and you have not
              been charged. Free courts can still be booked.
            </Text>
          </View>
        ) : (
          <>
            {paymentError && (
              <View style={s.paymentErrorCard}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={s.paymentErrorText}>{paymentError}</Text>
              </View>
            )}
            <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={handlePay} disabled={paying}>
              {paying ? <ActivityIndicator size="small" color={L.white} /> : (
                <Text style={s.primaryBtnText}>
                  {paymentError ? 'Try Again' : `Pay ${formatCents(reservation.buyer_total_cents ?? reservation.final_price_cents)}`}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={s.paymentFootnote}>
              Payments are processed by Stripe. Your booking is confirmed once the payment clears.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// AppIcon rather than Ionicons: 'pickleball' is not an Ionicons glyph, so the
// court row rendered the missing-glyph "?" until this went through AppIcon.
// Typing icon as AppIconName also means a bad name is a type error at the call
// site instead of needing an `as never` cast to compile.
function Row({ icon, label, value }: { icon: AppIconName; label: string; value: string }) {
  return (
    <View style={rw.row}>
      <AppIcon name={icon} size={16} color={L.gold} />
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

  holdBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: L.goldBg, borderRadius: radius.card,
    paddingHorizontal: spacing.md, paddingVertical: 10, marginTop: spacing.md,
  },
  holdBannerText: { flex: 1, color: L.text, fontSize: 12, fontWeight: '600' },

  paymentErrorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.dangerBg, borderRadius: radius.card, padding: spacing.md, marginTop: spacing.md,
  },
  paymentErrorText: { flex: 1, color: L.text, fontSize: 12, fontWeight: '500', lineHeight: 17 },
  paymentFootnote: { color: L.textSub, fontSize: 11, fontWeight: '500', textAlign: 'center', marginTop: spacing.md },

  primaryBtn: { backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 16, alignItems: 'center', marginTop: spacing.xl },
  primaryBtnText: { color: L.white, fontSize: 15, fontWeight: '800' },

  errorText: { color: L.textSub, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  errorBackBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.button, backgroundColor: L.navy },
  errorBackText: { color: L.white, fontSize: 14, fontWeight: '700' },
});
