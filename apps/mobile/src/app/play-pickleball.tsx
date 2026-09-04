import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing, iconCircle } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

// ─── Row config ────────────────────────────────────────────────────────────────

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  badge?: string;
  route: string;
};

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'CREATE A SESSION',
    rows: [
      { icon: 'paper-plane-outline',       label: 'Quick Game',      sub: 'Set up a game with friends.',                 route: '/create-quick-game' },
      { icon: 'refresh-circle-outline',   label: 'Round Robin',     sub: 'Generate matchups and rotate players.',       route: '/create-round-robin' },
      { icon: 'git-network-outline',      label: 'Mini Tournament', sub: 'Create a small bracket or pool play.',        route: '/create-mini-tournament' },
      { icon: 'school-outline',           label: 'Clinic',          sub: 'Create a lesson or skills session.',          route: '/create-clinic' },
    ],
  },
  {
    title: 'ORGANIZE',
    rows: [
      { icon: 'people-outline',           label: 'New Group',  sub: 'Create a group to play with.',    route: '/new-group' },
      { icon: 'reorder-four-outline',      label: 'New List',   sub: 'Create a private player list.',   route: '/new-list' },
    ],
  },
  {
    title: 'PRO',
    rows: [
      { icon: 'calendar-outline',         label: 'Weekly Game', sub: 'Automatic recurring invites.', badge: 'PRO', route: '/weekly-game' },
    ],
  },
];

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function PlayPickleballScreen() {
  const insets = useSafeAreaInsets();
  const { facilityId } = useLocalSearchParams<{ facilityId?: string }>();

  function pushCreate(base: string) {
    const route = facilityId ? `${base}?facilityId=${facilityId}` : base;
    router.push(route as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* iOS-style back header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Play Pickleball</Text>
        <Text style={s.subtitle}>Choose what you want to create.</Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionLabel}>{section.title}</Text>

            <View style={s.card}>
              {section.rows.map((row, idx) => (
                <TouchableOpacity
                  key={row.label}
                  style={[s.row, idx < section.rows.length - 1 && s.rowBorder]}
                  onPress={() => pushCreate(row.route)}
                  activeOpacity={0.7}
                >
                  {/* Icon circle */}
                  <View style={s.iconCircle}>
                    <Ionicons name={row.icon} size={22} color={colors.gold} />
                  </View>

                  {/* Text */}
                  <View style={s.rowBody}>
                    <View style={s.rowLabelRow}>
                      <Text style={s.rowLabel}>{row.label}</Text>
                      {row.badge && (
                        <View style={s.badge}>
                          <Text style={s.badgeText}>{row.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.rowSub}>{row.sub}</Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },

  header: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenH,
    backgroundColor: colors.page,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '400' },

  scroll: { paddingHorizontal: spacing.screenH, paddingTop: spacing.xl },

  title: { fontSize: text.pageTitle.size, fontWeight: '900', color: colors.navy, marginBottom: 6 },
  subtitle: { fontSize: text.body.size, fontWeight: '500', color: colors.textSub, marginBottom: spacing.xl },

  section: { marginBottom: spacing.xl },
  sectionLabel: {
    fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
    color: colors.textSub, marginBottom: spacing.sm, marginLeft: 2,
  },

  card: {
    backgroundColor: colors.bg,
    borderRadius: shape.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },

  iconCircle: {
    width: iconCircle.standard,
    height: iconCircle.standard,
    borderRadius: iconCircle.standard / 2,
    backgroundColor: colors.goldBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  rowBody: { flex: 1 },
  rowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: text.body.size, fontWeight: '500', color: colors.navy },
  rowSub: { fontSize: text.caption.size, fontWeight: '500', color: colors.textSub, marginTop: 2 },

  badge: {
    backgroundColor: colors.gold,
    borderRadius: shape.badge,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { fontSize: text.microLabel.size, fontWeight: '700', color: colors.white, letterSpacing: 0.5 },
});
