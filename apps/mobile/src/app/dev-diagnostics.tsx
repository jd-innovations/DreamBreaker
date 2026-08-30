import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import { APP_ENV } from '@/lib/featureFlags';
import {
  CRASH_REPORTING_ENABLED,
  sendScrubProbe,
  throwUncaughtError,
  crashNative,
} from '@/lib/observability/sentry';

// Crash-reporting diagnostics (TODO1.1_EXECUTION_PLAN.md 4.1).
//
// Exists because nothing in the app could force a crash, which is the only
// reason 4.1 stayed open after Sentry was wired on both platforms: a crash
// reporter nobody has seen report anything is a configuration, not a
// capability.
//
// Gated behind `devTools` (internal-only), so it ships in development and
// internal builds and is unreachable in production — including by deep link,
// via the entry in `featureRoutes.ts`. Not linked from product navigation;
// reach it directly, same as design-lab and dev-qr-scan:
//
//   pickleballapp://dev-diagnostics
//
// The three checks are deliberately different paths, not three ways to do the
// same thing. Read each button's caption before pressing it.

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'info' | 'warn' | 'danger';
  title: string;
  caption: string;
  expect: string;
  run: () => void;
};

export default function DevDiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const [sent, setSent] = useState<string | null>(null);

  const rows: Row[] = [
    {
      icon: 'shield-checkmark-outline',
      tone: 'info',
      title: 'Send scrub probe',
      caption:
        'Captures a handled error stuffed with fake secrets — an email, a name, a phone number, coordinates, a support-ticket body, and a Supabase URL with a token in the query string.',
      expect:
        'In Sentry: every one of those shows [redacted], the breadcrumb URL has no query string, and the user is a uuid with no email or username. Anything legible is a scrubber bug.',
      run: () => {
        sendScrubProbe();
        haptics.success();
        setSent('Scrub probe sent. Open the Sentry issue and read every field.');
      },
    },
    {
      icon: 'bug-outline',
      tone: 'warn',
      title: 'Throw uncaught JS error',
      caption:
        'Throws on the next tick, so it reaches the global handler rather than a React error boundary. In a dev client this shows the red box first; that is expected.',
      expect:
        'A new Sentry issue tagged with this build’s environment. On a preview build the stack should be symbolicated — readable file names and line numbers, not hex addresses.',
      run: () => {
        haptics.warning();
        throwUncaughtError();
      },
    },
    {
      icon: 'skull-outline',
      tone: 'danger',
      title: 'Force native crash',
      caption:
        'Kills the process immediately through the native layer. This is the only check that exercises the native handler, and beforeSend never sees it.',
      expect:
        'The app dies with no dialog. The report is delivered on the NEXT launch — an empty Sentry straight afterwards is expected, so reopen the app before judging it.',
      run: () => {
        Alert.alert(
          'Force native crash?',
          'The app will close immediately. The report is only sent when you reopen it.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Crash', style: 'destructive', onPress: () => crashNative() },
          ]
        );
      },
    },
  ];

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Diagnostics</Text>
        <View style={s.back} />
      </View>

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}>
        <View style={[s.status, CRASH_REPORTING_ENABLED ? s.statusOn : s.statusOff]}>
          <Ionicons
            name={CRASH_REPORTING_ENABLED ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={CRASH_REPORTING_ENABLED ? colors.success : colors.danger}
          />
          <Text style={s.statusText}>
            {CRASH_REPORTING_ENABLED
              ? `Crash reporting is on · environment "${APP_ENV}"`
              : 'No EXPO_PUBLIC_SENTRY_DSN in this build — nothing below will send anything.'}
          </Text>
        </View>

        {rows.map((row) => (
          <View key={row.title} style={s.card}>
            <View style={s.cardHead}>
              <Ionicons
                name={row.icon}
                size={20}
                color={row.tone === 'danger' ? colors.danger : row.tone === 'warn' ? colors.gold : colors.navy}
              />
              <Text style={s.cardTitle}>{row.title}</Text>
            </View>
            <Text style={s.caption}>{row.caption}</Text>
            <Text style={s.expect}>{row.expect}</Text>
            <TouchableOpacity
              style={[s.button, row.tone === 'danger' && s.buttonDanger]}
              onPress={row.run}
              disabled={!CRASH_REPORTING_ENABLED}
              accessibilityRole="button"
            >
              <Text style={[s.buttonText, row.tone === 'danger' && s.buttonTextDanger]}>
                {row.title}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {sent ? <Text style={s.sent}>{sent}</Text> : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.navy },
  body: { padding: 16, gap: 14 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  statusOn: { backgroundColor: 'rgba(34,197,94,0.10)' },
  statusOff: { backgroundColor: 'rgba(239,68,68,0.10)' },
  statusText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.navy },
  caption: { fontSize: 13, lineHeight: 19, color: colors.textSub },
  expect: { fontSize: 13, lineHeight: 19, color: colors.textMuted, fontStyle: 'italic' },
  button: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.navy,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  buttonTextDanger: { color: '#FFFFFF' },
  sent: { fontSize: 13, color: colors.text, textAlign: 'center', paddingHorizontal: 8 },
});
