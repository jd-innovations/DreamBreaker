/**
 * Pickleball App Design System v1 — shared loading / empty / error states.
 *
 * TODO 1.1 item 6.3. Before this, every screen hand-rolled its own: 38 files
 * with an ad-hoc empty state and 102 using a bare `ActivityIndicator`, each
 * with its own copy of the same layout constants.
 *
 * The shape is taken from `(tabs)/chat.tsx`, which already had the most
 * complete version of the pattern — spinner while loading, icon + message +
 * **Retry** on failure, icon + message when genuinely empty.
 *
 * ── Empty and Error are not interchangeable ──────────────────────────────────
 *
 * `EmptyState` means "this succeeded and there is nothing here."
 * `ErrorState` means "this did not succeed and we do not know what is here."
 *
 * Collapsing the two hides real bugs behind a plausible sentence. That is not
 * hypothetical on this project: `/conversation/<id>` reported "This
 * conversation isn't available" — an empty state — for what turned out to be a
 * defect that made 25 of 33 conversations unreachable (5.3 case 20). It read as
 * normal for weeks. An error state with a Retry would have looked wrong
 * immediately.
 *
 * So: only render EmptyState when the fetch actually resolved.
 *
 * ── Shared vocabulary with web ───────────────────────────────────────────────
 *
 * Counterpart: `web/src/components/shared/route-error.tsx`. The two files are
 * written against different renderers and deliberately share no code, but they
 * share prop names so the same idea is not called two things (alignment plan,
 * task C3):
 *
 *   title       headline
 *   message     the supporting line
 *   onRetry     the retry callback
 *   retryLabel  button text
 *
 * Web has no EmptyState/LoadingState yet — its empty states are still inline
 * per page. When they are extracted they should adopt this contract. If you
 * change a prop name here, change it there in the same commit; there is no
 * shared package to enforce it yet (that is task B1).
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ICON_SIZE = 44;

// `paddingTop: 60` matches the spacing the screens already used, so adopting
// these components does not visibly shift any existing layout.
const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xxl, gap: spacing.md },
  inline: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xxl, gap: spacing.sm },
  title: { color: colors.textMuted, fontSize: text.body.size, fontWeight: '500', textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', opacity: 0.85 },
  action: { marginTop: spacing.sm },
  actionText: { color: colors.gold, fontWeight: '800', fontSize: text.actionLarge.size },
});

export type ScreenStateAction = {
  label: string;
  onPress: () => void;
};

// ─── Loading ─────────────────────────────────────────────────────────────────

export function LoadingState({
  /** Optional line under the spinner. Leave unset for short waits. */
  label,
  inline = false,
  style,
}: {
  label?: string;
  inline?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[inline ? s.inline : s.wrap, style]} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.gold} />
      {label ? <Text style={s.title}>{label}</Text> : null}
    </View>
  );
}

// ─── Empty ───────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  message,
  action,
  inline = false,
  style,
}: {
  icon: IoniconName;
  /** What is absent, in the user's terms — "No conversations yet". */
  title: string;
  /** Optional second line: how to change it. */
  message?: string;
  /** Only offer an action the user can actually take from here. */
  action?: ScreenStateAction;
  inline?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[inline ? s.inline : s.wrap, style]}>
      <Ionicons name={icon} size={ICON_SIZE} color={colors.textMuted} />
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={s.action} activeOpacity={0.7}>
          <Text style={s.actionText}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Error ───────────────────────────────────────────────────────────────────

export function ErrorState({
  title = 'Something went wrong',
  /** The failure in plain words. Never a raw exception string. */
  message,
  onRetry,
  retryLabel = 'Retry',
  inline = false,
  style,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  inline?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[inline ? s.inline : s.wrap, style]}>
      <Ionicons name="alert-circle-outline" size={ICON_SIZE} color={colors.textMuted} />
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={s.action} activeOpacity={0.7}>
          <Text style={s.actionText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
