import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors, radius } from '@/theme';
import { PrimaryButton, SecondaryButton } from '@/components';

// ─── Confetti dot positions (static, decorative) ──────────────────────────────

const DOTS: { top: number; left?: number; right?: number; size: number; color: string; opacity: number }[] = [
  { top:  10, left:  28, size: 8,  color: colors.gold,  opacity: 0.55 },
  { top:  22, right: 32, size: 6,  color: '#D4C5A0',    opacity: 0.50 },
  { top:  54, left:   8, size: 5,  color: '#C8D8F0',    opacity: 0.60 },
  { top:  64, right: 10, size: 7,  color: colors.gold,  opacity: 0.40 },
  { top: 100, left:  40, size: 5,  color: '#D4C5A0',    opacity: 0.45 },
  { top: 108, right: 44, size: 4,  color: '#C8D8F0',    opacity: 0.55 },
  { top:  -4, left:  80, size: 4,  color: colors.gold,  opacity: 0.30 },
  { top:  -8, right: 72, size: 5,  color: '#D4C5A0',    opacity: 0.35 },
];

function SummaryRow({ icon, text, last }: { icon: string; text: string; last?: boolean }) {
  return (
    <>
      <View style={s.summaryRow}>
        <Ionicons name={icon as never} size={16} color={colors.textSub} style={{ marginTop: 1 }} />
        <Text style={s.summaryText}>{text}</Text>
      </View>
      {!last && <View style={s.divider} />}
    </>
  );
}

const INVITE_LABELS: Record<string, string> = {
  community:  'Community Play',
  tournament: 'Tournament Partner',
  team:       'Team Event',
  practice:   'Practice Match',
};

export default function InviteSentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string; name?: string; inviteType: string;
    // Community Play path (real play_event_invites row already sent)
    eventName?: string;
    // Shared / message-based path
    date?: string; time?: string; location?: string; skillRange?: string; convId?: string;
  }>();

  const targetId    = params.id;
  const targetName  = params.name ?? 'this player';
  const inviteType  = params.inviteType ?? 'community';
  const isCommunity = inviteType === 'community';
  const typeLabel   = INVITE_LABELS[inviteType] ?? inviteType;

  const cardTitle = isCommunity ? (params.eventName || typeLabel) : typeLabel;

  function goToMessages() {
    if (params.convId) {
      router.push(`/conversation/${params.convId}` as never);
    } else {
      router.push('/invites' as never);
    }
  }
  function inviteSomeoneElse() {
    router.replace({
      pathname: '/players/[id]/invite' as never,
      params: { id: targetId, name: targetName },
    } as never);
  }
  function done() {
    router.replace({
      pathname: '/players/[id]' as never,
      params: { id: targetId },
    } as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header with close affordance (returns to profile) ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={done} activeOpacity={0.7}>
          <Ionicons name="close" size={24} color={colors.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Success hero ── */}
        <View style={s.hero}>
          <View style={s.dotsWrap} pointerEvents="none">
            {DOTS.map((d, i) => (
              <View
                key={i}
                style={[s.dot, {
                  top: d.top, left: d.left, right: d.right,
                  width: d.size, height: d.size, borderRadius: d.size / 2,
                  backgroundColor: d.color, opacity: d.opacity,
                }]}
              />
            ))}
          </View>

          <View style={s.iconCircle}>
            <Ionicons name="paper-plane" size={36} color={colors.white} />
          </View>

          <Text style={s.title}>Invite Sent!</Text>
          <Text style={s.subtitle}>
            Your invite has been sent to{'\n'}
            <Text style={s.subtitleBold}>{targetName}</Text>
          </Text>
        </View>

        {/* ── Invite summary card ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>{cardTitle}</Text>
          <View style={s.divider} />
          {isCommunity ? (
            <>
              {!!params.date && <SummaryRow icon="calendar-outline" text={params.date} />}
              <SummaryRow icon="location-outline" text={params.location || 'Location TBD'} last />
            </>
          ) : (
            <>
              <SummaryRow icon="calendar-outline"  text={params.date ?? '—'} />
              <SummaryRow icon="time-outline"      text={params.time ?? '—'} />
              <SummaryRow icon="location-outline"  text={params.location ?? '—'} />
              <SummaryRow icon="person-outline"    text={`Skill Range: ${params.skillRange ?? '—'}`} last />
            </>
          )}
        </View>

        {/* ── CTAs ── */}
        <PrimaryButton
          label={params.convId ? 'View in Messages' : 'View Invite'}
          onPress={goToMessages}
          style={{ marginBottom: 12 }}
        />
        <SecondaryButton label="Invite Someone Else" onPress={inviteSomeoneElse} style={{ marginBottom: 12 }} />
        <TouchableOpacity style={s.btnDone} onPress={done} activeOpacity={0.7}>
          <Text style={s.btnDoneText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: 24, paddingTop: 8, alignItems: 'stretch' },

  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 36 },
  dotsWrap: { position: 'absolute', top: 16, left: 0, right: 0, height: 140 },
  dot: { position: 'absolute' },

  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
    shadowColor: colors.gold, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30, shadowRadius: 16, elevation: 8,
  },

  title: { color: colors.navy, fontSize: 30, fontWeight: '900', letterSpacing: 0.2, marginBottom: 10 },
  subtitle: { color: colors.textSub, fontSize: 16, fontWeight: '400', textAlign: 'center', lineHeight: 24 },
  subtitleBold: { color: colors.navy, fontWeight: '800' },

  card: {
    backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 24,
  },
  cardTitle: { color: colors.navy, fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  summaryText: { color: colors.textSub, fontSize: 15, fontWeight: '400', flex: 1, lineHeight: 20 },

  btnDone: { paddingVertical: 12, alignItems: 'center' },
  btnDoneText: { color: colors.navy, fontSize: 16, fontWeight: '500' },
});
