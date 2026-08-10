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
    type:  'team',
    icon:  'shirt-outline',
    title: 'Team Event',
    desc:  'Invite to play on a team in a league or event.',
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
  return (
    <>
      <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
        <View style={s.iconCircle}>
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

        <Ionicons name="chevron-forward" size={18} color={L.textMuted} />
      </TouchableOpacity>
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
  backBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  scroll: { paddingHorizontal: 20, paddingTop: 8 },

  subtitle: {
    color:      L.navy,
    fontSize:   28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 28,
  },

  // Card containing all rows
  card: {
    backgroundColor: L.bg,
    borderRadius:    16,
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
  rowText:  { flex: 1, gap: 3 },
  rowTitle: { color: L.navy, fontSize: 16, fontWeight: '700' },
  rowDesc:  { color: L.textSub, fontSize: 13, fontWeight: '400', lineHeight: 18 },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 78,
  },

  // Cancel
  cancelBtn: {
    backgroundColor: L.bg,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     L.border,
    paddingVertical: 16,
    alignItems:      'center',
  },
  cancelText: { color: L.navy, fontSize: 16, fontWeight: '600' },
});
