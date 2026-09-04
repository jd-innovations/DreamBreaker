import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { PrimaryButton, SecondaryButton } from '@/components';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { fetchDivisionsForTournament } from '@/lib/supabase/divisions';
import { balanceDueCents, effectiveEntryFeeCents } from '@/lib/tournamentFees';
import type { Tournament } from '@/lib/tournamentTypes';
import type { DivisionData } from '@/data/divisions';

const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldBg:    colors.goldBg,
  text:      colors.text,
  textSub:   colors.textSub,
  border:    colors.border,
  success:   colors.success,
  successBg: colors.successBg,
};

function fmt(cents: number) { return `$${Math.round(cents / 100)}`; }

function SummaryRow({ icon, label, value, last }: {
  icon: string; label: string; value: string; last?: boolean;
}) {
  return (
    <>
      <View style={s.summaryRow}>
        <Ionicons name={icon as never} size={16} color={L.textSub} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={s.summaryLabel}>{label}</Text>
          <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
        </View>
      </View>
      {!last && <View style={s.divider} />}
    </>
  );
}

export default function HoldSuccessScreen() {
  const insets = useSafeAreaInsets();
  const { id, divisionId } = useLocalSearchParams<{ id: string; divisionId: string }>();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [division,   setDivision]   = useState<DivisionData | null>(null);

  useEffect(() => {
    async function load() {
      const [t, divs] = await Promise.all([
        fetchTournamentById(id),
        fetchDivisionsForTournament(id),
      ]);
      setTournament(t);
      setDivision(divs.find(d => d.id === divisionId) ?? divs[0] ?? null);
    }
    load();
  }, [id, divisionId]);

  if (!tournament) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }

  const holdCents    = tournament.holdFeeCents;
  // Division override wins — see @/lib/tournamentFees. This screen also hands
  // entryAmountCents to the register screen, so a wrong value here propagates
  // into the balance quoted at checkout.
  const entryCents   = effectiveEntryFeeCents(division?.entryFeeCents, tournament.entryFeeCents);
  const balanceCents = balanceDueCents(entryCents, holdCents);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.iconCircle}>
            <Ionicons name="checkmark" size={44} color={L.gold} />
          </View>
          <Text style={s.title}>Spot Held!</Text>
          <Text style={s.subtitle}>
            You've secured your place in{'\n'}
            <Text style={s.subtitleBold}>{tournament.name}</Text>
          </Text>
          <View style={s.depositPill}>
            <Ionicons name="shield-checkmark" size={14} color={L.success} />
            <Text style={s.depositText}>{fmt(holdCents)} deposit confirmed</Text>
          </View>
        </View>

        {/* ── Summary card ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{tournament.name}</Text>
          <View style={s.divider} />
          <SummaryRow
            icon="trophy-outline"
            label="Division"
            value={division ? `${division.name} · ${division.level}` : '—'}
          />
          <View style={s.divider} />
          <SummaryRow icon="calendar-outline" label="Date"  value={tournament.date} />
          <View style={s.divider} />
          <SummaryRow
            icon="location-outline"
            label="Venue"
            value={tournament.city
              ? `${tournament.venue}, ${tournament.city} ${tournament.state}`
              : tournament.venue}
          />
          <View style={s.divider} />
          <SummaryRow
            icon="cash-outline"
            label="Balance Due at Registration"
            value={fmt(balanceCents)}
            last
          />
        </View>

        {/* ── Balance reminder ── */}
        <View style={s.reminder}>
          <Ionicons name="time-outline" size={16} color={L.gold} style={{ flexShrink: 0, marginTop: 1 }} />
          <Text style={s.reminderText}>
            Complete registration before the deadline to finalize your entry.
            Your {fmt(holdCents)} deposit will be applied toward the {fmt(entryCents)} entry fee.
          </Text>
        </View>

        {/* ── Complete Registration inline CTA ── */}
        <TouchableOpacity
          style={s.completeBtn}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: `/tournament/${tournament.id}/register` as never,
            params: {
              tournamentName:   tournament.name,
              divisionId:       division?.id ?? '',
              divisionName:     division?.name ?? '',
              divisionLevel:    division?.level ?? '',
              holdAmountCents:  String(holdCents),
              entryAmountCents: String(entryCents),
              date:             tournament.date,
              venue:            tournament.venue,
              city:             tournament.city,
              state:            tournament.state,
            },
          } as never)}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={L.gold} />
          <View style={{ flex: 1 }}>
            <Text style={s.completeBtnLabel}>Complete Registration Now</Text>
            <Text style={s.completeBtnSub}>{fmt(balanceCents)} balance due</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={L.textSub} />
        </TouchableOpacity>

        <View style={{ height: 16 }} />

        <PrimaryButton
          label="View My Tournaments"
          onPress={() => router.replace('/my-tournaments' as never)}
          style={{ marginBottom: 12 }}
        />
        <SecondaryButton
          label="Back to Tournament"
          onPress={() => router.replace(`/tournament/${tournament.id}` as never)}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 40 },

  hero: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: L.goldBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    shadowColor: L.gold, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  title: { color: L.navy, fontSize: text.pageTitle.size, fontWeight: '900', letterSpacing: 0.2, marginBottom: 10 },
  subtitle: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 24, marginBottom: 14 },
  subtitleBold: { color: L.navy, fontWeight: '800' },
  depositPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.successBg, borderRadius: shape.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  depositText: { color: L.success, fontSize: text.chipValue.size, fontWeight: '800' },

  card: {
    borderWidth: 1, borderColor: L.border, borderRadius: shape.card,
    backgroundColor: L.bg, marginBottom: 16, overflow: 'hidden',
  },
  cardTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },
  summaryRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
  },
  summaryLabel: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 2 },
  summaryValue: { color: L.navy,    fontSize: text.rowValue.size, fontWeight: '800' },

  reminder: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: L.goldBg, borderWidth: 1, borderColor: '#E8C97A',
    borderRadius: shape.card, padding: 14, marginBottom: 16,
  },
  reminderText: { color: L.text, fontSize: text.caption.size, fontWeight: '500', lineHeight: 19, flex: 1 },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderWidth: 1.5, borderColor: L.gold,
    borderRadius: shape.cta, padding: 14, marginBottom: 4,
  },
  completeBtnLabel: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  completeBtnSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },
});
