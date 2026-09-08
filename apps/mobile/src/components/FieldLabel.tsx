/**
 * The label above a form field.
 *
 * This existed five times before this file — defined inline, identically, in
 * create-clinic, create-quick-game, create-round-robin, create-mini-tournament
 * and community/[id]/edit. Each copy was a `<Text style={{ fontSize: 12, ... }}>`
 * inside the screen's JSX rather than in its stylesheet, which put all five
 * beyond the reach of the style migrator: they were five of the app's 24
 * declared rule-12 exemptions, and they would have stayed off the standard
 * however many screens were migrated around them.
 *
 * The copies were 12/700 with letterSpacing 0.3. This takes `fieldLabel`
 * (13/800), the role named for exactly this job — decided 2026-09-04 — so the
 * labels are one point larger and bolder than they were. The letterSpacing is
 * kept because the role does not carry one and all five copies had it.
 *
 * Margin: four copies used a bare 6 and one used `spacing.xs` (4). Six is not
 * on the 4pt scale, so this takes `spacing.xs`. Labels in the create forms sit
 * 2px closer to their field as a result.
 */

import { StyleSheet, Text } from 'react-native';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';

const s = StyleSheet.create({
  label: {
    fontSize: text.fieldLabel.size,
    fontWeight: '800',
    color: colors.textSub,
    letterSpacing: 0.3,
    marginBottom: spacing.xs,
  },
});

export function FieldLabel({ children }: { children: string }) {
  return <Text style={s.label}>{children}</Text>;
}
