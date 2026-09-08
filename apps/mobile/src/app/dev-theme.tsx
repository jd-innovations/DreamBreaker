import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import {
  useTheme, useThemedStyles, THEME_MIGRATION_COMPLETE,
  spacing, radius, typography,
  type ThemeRoles, type ThemeSetting,
} from '@/theme';

/**
 * Dev-only theme switcher. Reached from Account Settings > Dev Tools, gated by
 * the `devTools` feature flag (see lib/featureRoutes.ts).
 *
 * This exists because Phase 3 screens cannot be verified without a way to flip
 * themes on a device. The permanent user-facing Appearance setting ships at the
 * END of Phase 3, when THEME_MIGRATION_COMPLETE flips — until then `dark` is
 * deliberately reachable only from here, because it is still wrong on most
 * screens. See THEMING_PLAN.md.
 *
 * It is also the first consumer of `useThemedStyles`, so it doubles as the
 * proof that the API works before any product screen depends on it.
 */

const OPTIONS: { value: ThemeSetting; label: string; icon: keyof typeof Ionicons.glyphMap; sub: string }[] = [
  { value: 'light',  label: 'Light',  icon: 'sunny-outline',    sub: 'Always light.' },
  { value: 'dark',   label: 'Dark',   icon: 'moon-outline',     sub: 'Always dark. Most screens are not migrated yet.' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline', sub: 'Follow the device setting.' },
];

export default function DevThemeScreen() {
  const insets = useSafeAreaInsets();
  const { roles, scheme, setting, setSetting, statusBarStyle } = useTheme();
  const s = useThemedStyles(styles);

  const choose = (next: ThemeSetting) => {
    if (next !== setting) haptics.light();
    setSetting(next);
  };

  const clamped = !THEME_MIGRATION_COMPLETE && setting === 'system';

  return (
    <View style={s.root}>
      <StatusBar style={statusBarStyle} />

      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => goBack()}
          style={s.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={roles.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Theme</Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.sectionLabel}>APPEARANCE</Text>
        <View style={s.card}>
          {OPTIONS.map((opt, i) => {
            const active = setting === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s.row, i > 0 && s.rowDivided]}
                activeOpacity={0.75}
                onPress={() => choose(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={opt.label}
              >
                <Ionicons name={opt.icon} size={20} color={active ? roles.accent : roles.textSecondary} />
                <View style={s.rowText}>
                  <Text style={[s.rowTitle, active && s.rowTitleActive]}>{opt.label}</Text>
                  <Text style={s.rowSub}>{opt.sub}</Text>
                </View>
                {active ? <Ionicons name="checkmark" size={20} color={roles.accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.sectionLabel}>RESOLVED</Text>
        <View style={s.card}>
          <View style={s.statRow}>
            <Text style={s.statKey}>Setting</Text>
            <Text style={s.statValue}>{setting}</Text>
          </View>
          <View style={[s.statRow, s.rowDivided]}>
            <Text style={s.statKey}>In effect</Text>
            <Text style={s.statValue}>{scheme}</Text>
          </View>
          <View style={[s.statRow, s.rowDivided]}>
            <Text style={s.statKey}>Migration complete</Text>
            <Text style={s.statValue}>{String(THEME_MIGRATION_COMPLETE)}</Text>
          </View>
        </View>

        {clamped ? (
          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={16} color={roles.warning} />
            <Text style={s.noticeText}>
              System is clamped to light until the screen migration finishes, so a device
              set to dark cannot pull the app into a half-migrated state. Pick Dark
              explicitly to check a migrated screen.
            </Text>
          </View>
        ) : null}

        <Text style={s.sectionLabel}>ROLES IN THIS THEME</Text>
        <View style={s.card}>
          {(Object.entries(roles) as [keyof ThemeRoles, string][]).map(([name, value], i) => (
            <View key={name} style={[s.swatchRow, i > 0 && s.rowDivided]}>
              <View style={[s.swatch, { backgroundColor: value }]} />
              <Text style={s.swatchName}>{name}</Text>
              <Text style={s.swatchValue} numberOfLines={1}>{value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// Module scope, not inline — an inline factory is a new identity every render
// and rebuilds the sheet each time. See useThemedStyles.
const styles = (t: ThemeRoles) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.md,
  },
  back: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.surface,
    borderWidth: 1, borderColor: t.border,
  },
  title: { ...typography.pageTitle, color: t.textPrimary },

  content: { paddingHorizontal: spacing.screenH },

  sectionLabel: {
    fontSize: 13, fontWeight: '800', letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: t.textSecondary,
    marginTop: spacing.xl, marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: t.surface,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: t.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: t.borderSubtle },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: t.textPrimary },
  rowTitleActive: { fontWeight: '800' },
  rowSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },

  statRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  statKey: { fontSize: 14, color: t.textSecondary },
  statValue: { fontSize: 14, fontWeight: '700', color: t.textPrimary },

  notice: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: t.warningBg,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: t.accentBorder,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: t.textPrimary },

  swatchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  swatch: {
    width: 28, height: 28, borderRadius: radius.sm,
    borderWidth: 1, borderColor: t.border,
  },
  swatchName: { flex: 1, fontSize: 13, fontWeight: '600', color: t.textPrimary },
  swatchValue: { fontSize: 11, color: t.textMuted, maxWidth: 140, textAlign: 'right' },
});
