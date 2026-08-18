import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { PrimaryButton, SecondaryButton } from '@/components';
import { useSession } from '@/hooks/useSession';
import { requireAuth } from '@/lib/authGuard';
import { getRegistrationAvailability } from '@/lib/registrationGate';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { createHold, isPlayerHeld } from '@/lib/supabase/registrations';
import { useTournamentEntryPayment } from '@/lib/payments/useTournamentEntryPayment';
import { balanceDueCents, effectiveEntryFeeCents } from '@/lib/tournamentFees';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  goldLight: colors.goldLight,
  goldBorder:colors.goldBorder,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
};

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={r.infoRow}>
      <Ionicons name={icon as never} size={16} color={L.textSub} style={{ flexShrink: 0 }} />
      <View style={{ flex: 1 }}>
        <Text style={r.infoLabel}>{label}</Text>
        <Text style={r.infoValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

export default function HoldConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { id, divisionId } = useLocalSearchParams<{ id: string; divisionId: string }>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [division, setDivision]     = useState<DivisionData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const [t, divs] = await Promise.all([
        fetchTournamentById(id),
        fetchDivisionsForTournament(id),
      ]);
      if (!active) return;
      setTournament(t);
      setDivision(divs.find(d => d.id === divisionId) ?? divs[0] ?? null);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [id, divisionId]);

  const holdCents    = tournament?.holdFeeCents ?? 0;
  // The division's own fee wins, exactly as the server resolves it — quoting
  // the tournament base fee here understated the balance on any division with
  // an override.
  const entryCents   = effectiveEntryFeeCents(division?.entryFeeCents, tournament?.entryFeeCents);
  const balanceCents = balanceDueCents(entryCents, holdCents);
  const { payTournamentHold } = useTournamentEntryPayment();

  function handleConfirm() {
    if (!tournament || !division) {
      Alert.alert('Error', 'Tournament or division not found.');
      return;
    }
    const regAvailability = getRegistrationAvailability(tournament);
    if (!regAvailability.available) {
      Alert.alert('Registration Unavailable', regAvailability.label);
      router.back();
      return;
    }
    requireAuth(user?.id, async () => {
      const alreadyHeld = await isPlayerHeld(tournament.id, division.id, user!.id);
      if (alreadyHeld) {
        Alert.alert('Already Held', `You already have a hold on ${division.name}.`);
        return;
      }

      setSaving(true);
      const needsPartner = /doubles|mixed/i.test(division.name);
      let held = false;
      if (holdCents > 0) {
        const result = await payTournamentHold({
          tournamentId: tournament.id,
          divisionId:   division.id,
          playerId:     user!.id,
          needsPartner,
        });
        if (!result.ok) {
          setSaving(false);
          if (result.reason === 'canceled') return;
          if (result.reason === 'pending_confirmation') {
            // Charged, but the webhook hadn't landed yet. Never call this a
            // failure, and send them somewhere they can watch it appear
            // rather than leaving them on a button that would charge again.
            Alert.alert(
              'Payment Received',
              "We're still confirming your hold. Check My Tournaments in a moment — no need to pay again.",
              [{ text: 'OK', onPress: () => router.replace('/my-tournaments' as never) }],
            );
            return;
          }
          Alert.alert('Payment Failed', 'We could not complete your deposit. Please try again.');
          return;
        }
        held = true;
      } else {
        held = await createHold({
          tournamentId:     tournament.id,
          divisionId:       division.id,
          playerId:         user!.id,
          holdFeePaidCents: 0,
          needsPartner,
        }).then(Boolean);
      }
      setSaving(false);

      if (!held) {
        Alert.alert('Error', 'Failed to hold your spot. Please try again.');
        return;
      }

      router.replace({
        pathname: `/tournament/${tournament.id}/hold-success` as never,
        params:   { divisionId: division.id },
      } as never);
    });
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={[r.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={r.header}>
        <TouchableOpacity style={r.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <Text style={r.headerTitle}>Hold My Spot</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[r.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Hero ── */}
        <View style={r.hero}>
          <View style={r.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={36} color={L.gold} />
          </View>
          <Text style={r.heroTitle}>Confirm Your Hold</Text>
          <Text style={r.heroSub}>
            Secure your spot with a deposit. The balance is due before registration closes.
          </Text>
        </View>

        {/* ── Tournament card ── */}
        <View style={r.card}>
          <Text style={r.cardTitle}>{tournament?.name ?? '—'}</Text>
          <View style={r.divider} />
          <InfoRow
            icon="trophy-outline"
            label="Division"
            value={division ? `${division.name} · ${division.level}` : '—'}
          />
          <View style={r.divider} />
          <InfoRow icon="calendar-outline" label="Date"  value={tournament?.date ?? '—'} />
          <View style={r.divider} />
          <InfoRow
            icon="location-outline"
            label="Venue"
            value={tournament?.city
              ? `${tournament.venue}, ${tournament.city} ${tournament.state}`
              : tournament?.venue ?? '—'}
          />
        </View>

        {/* ── Fees ── */}
        <View style={r.feesCard}>
          <View style={r.feeRow}>
            <Text style={r.feeLabel}>Deposit (Hold My Spot)</Text>
            <Text style={r.feeValue}>{fmt(holdCents)}</Text>
          </View>
          <View style={r.feeRow}>
            <Text style={r.feeLabel}>Entry Fee</Text>
            <Text style={r.feeValue}>{fmt(entryCents)}</Text>
          </View>
          <View style={[r.feeRow, r.balanceRow]}>
            <Text style={r.balanceLabel}>Balance Due at Registration</Text>
            <Text style={r.balanceValue}>{fmt(balanceCents)}</Text>
          </View>
        </View>

        {/* ── Non-refundable warning ── */}
        <View style={r.warningCard}>
          <Ionicons name="information-circle-outline" size={18} color={L.gold} style={{ flexShrink: 0, marginTop: 1 }} />
          <Text style={r.warningText}>
            Deposits are non-refundable. Your spot is held until the registration deadline.
            Full registration is still required before the deadline.
          </Text>
        </View>

        <PrimaryButton
          label={saving ? 'Processing...' : holdCents > 0 ? `Pay ${fmt(holdCents)} Deposit` : 'Confirm Hold'}
          onPress={handleConfirm}
          style={{ marginBottom: 12 }}
        />
        <SecondaryButton
          label="Cancel"
          onPress={() => router.back()}
        />
      </ScrollView>
    </View>
  );
}

const r = StyleSheet.create({
  root:   { flex: 1, backgroundColor: L.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  scroll:      { paddingHorizontal: 20, paddingTop: 24 },

  hero:       { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: { color: L.navy, fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  heroSub:   { color: L.textSub, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  card: {
    borderWidth: 1, borderColor: L.border, borderRadius: radius.card,
    backgroundColor: L.bg, marginBottom: 16, overflow: 'hidden',
  },
  cardTitle: {
    color: L.navy, fontSize: 16, fontWeight: '800',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  infoLabel: { color: L.textSub, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  infoValue: { color: L.navy,    fontSize: 14, fontWeight: '700' },

  feesCard: {
    borderWidth: 1, borderColor: L.border, borderRadius: radius.card,
    backgroundColor: L.bg, marginBottom: 16, overflow: 'hidden', paddingVertical: 4,
  },
  feeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
  },
  balanceRow: {
    borderTopWidth: 1, borderTopColor: L.border, backgroundColor: L.goldLight,
  },
  feeLabel:    { color: L.textSub, fontSize: 14, fontWeight: '500' },
  feeValue:    { color: L.navy,    fontSize: 14, fontWeight: '700' },
  balanceLabel:{ color: L.navy,    fontSize: 14, fontWeight: '700' },
  balanceValue:{ color: L.navy,    fontSize: 16, fontWeight: '900' },

  warningCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: radius.card, padding: 14, marginBottom: 24,
  },
  warningText: { color: L.text, fontSize: 13, lineHeight: 19, flex: 1 },
});
