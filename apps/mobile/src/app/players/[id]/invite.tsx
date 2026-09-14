import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { AppIcon, type AppIconName } from '@/components';

// ─── Design tokens ────────────────────────────────────────────────────────────

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
};

// ─── Invite types ─────────────────────────────────────────────────────────────

type InviteType = 'community' | 'tournament' | 'team' | 'practice';

interface InviteOption {
  type:    InviteType;
  icon:    string;
  title:   string;
  desc:    string;
  /** Renders a pill instead of a chevron, and does not navigate. */
  comingSoon?: boolean;
}

const OPTIONS: InviteOption[] = [
  {
    type:  'community',
    icon:  'people-outline',
    title: 'Community Play',
    desc:  'Casual games, open play, round robins, etc.',
  },
  {
    type:  'tournament',
    icon:  'trophy-outline',
    title: 'Tournament Partner',
    desc:  'Find a partner for an upcoming tournament.',
  },
  {
    // Leagues do not exist — there is no leagues table in production — and
    // this option used to send a chat message describing one. Marked rather
    // than removed so the intent survives until team play is built.
    type:  'team',
    icon:  'shirt-outline',
    title: 'Team Event',
    desc:  'Play on a team in an upcoming event.',
    comingSoon: true,
  },
  {
    type:  'practice',
    icon:  'pickleball',
    title: 'Practice Match',
    desc:  'Schedule a practice or challenge match.',
  },
];

// ─── Invite type row ──────────────────────────────────────────────────────────

function InviteRow({
  option, onPress, last,
}: {
  option: InviteOption;
  onPress: () => void;
  last?: boolean;
}) {
  // A plain View when there is nowhere to go: a row that dims on press and
  // then does nothing reads as broken rather than unavailable.
  const Row = option.comingSoon ? View : TouchableOpacity;
  return (
    <>
      <Row
        style={s.row}
        onPress={option.comingSoon ? undefined : onPress}
        activeOpacity={option.comingSoon ? undefined : 0.7}
      >
        <View style={[s.iconCircle, option.comingSoon && s.iconCircleMuted]}>
          <AppIcon
            name={option.icon as AppIconName}
            size={option.icon === 'pickleball' ? 38 : 24}
            color={L.gold}
          />
        </View>

        <View style={s.rowText}>
          <Text style={s.rowTitle}>{option.title}</Text>
          <Text style={s.rowDesc}>{option.desc}</Text>
        </View>

        {option.comingSoon ? (
          <View style={s.comingSoonPill}>
            <Text style={s.comingSoonText}>SOON</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={L.textMuted} />
        )}
      </Row>
      {!last && <View style={s.divider} />}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InviteToPlayScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string }>();

  const targetId   = params.id   ?? 'unknown';
  const targetName = params.name ?? 'this player';

  function handleSelect(type: InviteType) {
    router.push({
      pathname: '/players/[id]/invite-details' as never,
      params: {
        id:         targetId,
        name:       targetName,
        inviteType: type,
      },
    } as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Invite to Play</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* ── Subtitle ── */}
        <Text style={s.subtitle}>What are you inviting {targetName} to?</Text>

        {/* ── Option cards ── */}
        <View style={s.card}>
          {OPTIONS.map((opt, i) => (
            <InviteRow
              key={opt.type}
              option={opt}
              onPress={() => handleSelect(opt.type)}
              last={i === OPTIONS.length - 1}
            />
          ))}
        </View>

        {/* ── Cancel ── */}
        <TouchableOpacity style={s.cancelBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, backgroundColor: L.page,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textAlign: 'center' },

  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  subtitle: {
    color:      L.navy,
    fontSize: text.pageTitle.size,
    fontWeight: '900',
    lineHeight: 34,
    marginBottom: 28,
  },

  // Card containing all rows
  card: {
    backgroundColor: L.bg,
    borderRadius: shape.card,
    borderWidth:     1,
    borderColor:     L.border,
    overflow:        'hidden',
    marginBottom:    20,
  },

  // Option row
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:   18,
    gap:            14,
  },
  iconCircle: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: L.goldBg,
    borderWidth:     1,
    borderColor:     L.goldBorder,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
  rowDesc: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18 },

  iconCircleMuted: { opacity: 0.45 },
  comingSoonPill: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: shape.pill,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  comingSoonText: {
    color: L.gold, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing,
  },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 78,
  },

  // Cancel
  cancelBtn: {
    backgroundColor: L.bg,
    borderRadius: shape.cta,
    borderWidth:     1,
    borderColor:     L.border,
    paddingVertical: 16,
    alignItems:      'center',
  },
  cancelText: { color: L.navy, fontSize: text.actionLarge.size, fontWeight: '800' },
});
