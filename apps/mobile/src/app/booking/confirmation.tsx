import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { fetchFacilityById, type FacilityDetail } from '@/lib/supabase/facilities';
import {
  fetchReservationById, fetchReservationPlayersWithProfiles, playersNeeded,
  type Reservation,
} from '@/lib/supabase/reservations';
import { getBookingFacility, getBookingSelection, getBookingReservationId } from '@/lib/bookingStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, text: colors.text, textSub: colors.textSub, border: colors.border,
  white: colors.white, success: colors.success,
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

export default function ConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const facilityCtx = getBookingFacility();
  const selection = getBookingSelection();
  const reservationId = getBookingReservationId();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState(0);
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!reservationId) { setError('No confirmed reservation to show. Go back and choose a time.'); setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        const [res, roster, fac] = await Promise.all([
          fetchReservationById(reservationId),
          fetchReservationPlayersWithProfiles(reservationId),
          facilityCtx.facilityId ? fetchFacilityById(facilityCtx.facilityId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (!res) { setError('This reservation no longer exists.'); return; }
        setReservation(res);
        setCurrentPlayers(roster.length);
        setFacility(fac);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your reservation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [reservationId, facilityCtx.facilityId]);

  function handleDirections() {
    if (!facility) return;
    const q = encodeURIComponent(`${facility.address}, ${facility.city}, ${facility.state}`);
    Linking.openURL(`https://maps.apple.com/?q=${q}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
    );
  }

  function handleViewGameStatus() {
    router.push('/booking/game-status' as never);
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
  const isOrganizer = user?.id === reservation.organizer_id;
  const showFindPlayers = isOrganizer && !isBallMachine && needed > 0;

  const playerStatus = needed === 0
    ? `${currentPlayers} of ${max} · Game Complete`
    : `${currentPlayers} of ${max} · Looking for ${needed}`;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.replace('/(tabs)' as never)} activeOpacity={0.7}>
          <Ionicons name="close" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.title}>Confirmation</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.screenH, paddingBottom: insets.bottom + 32 }}>
        <View style={s.successBanner}>
          <Ionicons name="checkmark-circle" size={40} color={L.success} />
          <Text style={s.successTitle}>Booking Confirmed</Text>
        </View>

        <View style={s.card}>
          <Row icon="business-outline" label="Facility" value={facilityCtx.facilityName ?? '—'} />
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
          {!isBallMachine && <Row icon="person-add-outline" label="Players" value={playerStatus} />}
        </View>

        <View style={s.card}>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Amount</Text>
            <Text style={s.priceValue}>{formatCents(reservation.final_price_cents)}</Text>
          </View>
          {hasDeal && (
            <Text style={s.dealSavedText}>
              <Ionicons name="flash" size={12} color={L.gold} /> You saved {formatCents(reservation.base_price_cents - reservation.final_price_cents)} ({reservation.flash_deal_discount_percent}% off with Flash Deal)
            </Text>
          )}
        </View>

        {showFindPlayers && (
          <TouchableOpacity style={s.primaryBtn} activeOpacity={0.88} onPress={() => router.push('/booking/players' as never)}>
            <Ionicons name="people-outline" size={18} color={L.white} />
            <Text style={s.primaryBtnText}>Find / Invite Players</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.secondaryBtn} activeOpacity={0.85} onPress={handleViewGameStatus}>
          <Ionicons name="stats-chart-outline" size={18} color={L.navy} />
          <Text style={s.secondaryBtnText}>View Game Status</Text>
        </TouchableOpacity>

        {facility && (
          <TouchableOpacity style={s.secondaryBtn} activeOpacity={0.85} onPress={handleDirections}>
            <Ionicons name="navigate-outline" size={18} color={L.navy} />
            <Text style={s.secondaryBtnText}>Directions</Text>
          </TouchableOpacity>
        )}
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

  successBanner: { alignItems: 'center', gap: 8, paddingVertical: spacing.xl },
  successTitle: { color: L.navy, fontSize: 20, fontWeight: '900' },

  card: {
    backgroundColor: L.bg, borderRadius: radius.card, borderWidth: 1, borderColor: L.border,
    padding: spacing.lg, marginTop: spacing.md,
  },

  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { color: L.navy, fontSize: 15, fontWeight: '800' },
  priceValue: { color: L.navy, fontSize: 18, fontWeight: '900' },
  dealSavedText: { color: L.textSub, fontSize: 12, fontWeight: '600', marginTop: 8 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.navy, borderRadius: radius.button, paddingVertical: 15, marginTop: spacing.xl,
  },
  primaryBtnText: { color: L.white, fontSize: 15, fontWeight: '800' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: L.bg, borderWidth: 1.5, borderColor: L.border, borderRadius: radius.button,
    paddingVertical: 14, marginTop: spacing.sm,
  },
  secondaryBtnText: { color: L.navy, fontSize: 14, fontWeight: '700' },

  errorText: { color: L.textSub, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  errorBackBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.button, backgroundColor: L.navy },
  errorBackText: { color: L.white, fontSize: 14, fontWeight: '700' },
});
