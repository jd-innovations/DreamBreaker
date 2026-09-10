// Where a signup-confirmation link lands ON THE PHONE.
//
// Deliberately at /auth/confirm, mirroring the WEB route of the same path. That
// is not cosmetic: iOS opens the app for a universal link only when the path is
// listed in the domain's apple-app-site-association file, and the app must have
// a route at that exact path or the user lands on a blank screen with
// force-quit as the only way out (see that file's own history). One path, two
// implementations -- web/src/app/auth/confirm for anyone without the app
// installed, this for anyone with it.
//
// signUp() used to point emailRedirectTo at the WEB /auth/confirm route, so
// confirming a mobile signup opened Safari: the session ended up in the phone's
// browser rather than the app, and the user had to switch back and sign in by
// hand. Before that it pointed nowhere at all and the token was never redeemed,
// so the account could not be confirmed on mobile in the first place
// (f541d0e / 20260909235500).
//
// Structure deliberately mirrors auth/reset.tsx, the app's other
// email-link screen: Linking.useLinkingURL() for the incoming url, an
// `attempted` ref so a re-render cannot redeem the same single-use token twice,
// and three explicit states rather than a spinner that can hang forever.
//
// On success it routes to "/" rather than to the app or onboarding directly --
// resolveAuthGate() owns that decision, and duplicating it here is how the two
// drift apart.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { completeEmailConfirmation, describeAuthLink } from '@/lib/auth';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';

type Status = 'verifying' | 'confirmed' | 'invalid';

export default function ConfirmEmailScreen() {
  const url = Linking.useLinkingURL();
  const [status, setStatus] = useState<Status>('verifying');
  // What the link actually carried, shown on failure. A generic "didn't work"
  // gives the same answer for an expired token, a shape this app cannot redeem,
  // and a GoTrue rejection -- three different problems. Names only, never
  // values: an implicit link carries a live access token.
  const [detail, setDetail] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!url || attempted.current) return;
    attempted.current = true;
    (async () => {
      try {
        const session = await completeEmailConfirmation(url);
        if (!session) setDetail(`Link carried: ${describeAuthLink(url)}`);
        setStatus(session ? 'confirmed' : 'invalid');
      } catch (err) {
        setDetail(err instanceof Error ? err.message : describeAuthLink(url));
        setStatus('invalid');
      }
    })();
  }, [url]);

  if (status === 'verifying') {
    return (
      <View style={s.center}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={s.body}>Confirming your email…</Text>
      </View>
    );
  }

  if (status === 'confirmed') {
    return (
      <View style={s.center}>
        <StatusBar style="dark" />
        <Ionicons name="checkmark-circle" size={56} color={colors.success} />
        <Text style={s.title}>Email confirmed</Text>
        <Text style={s.body}>You&apos;re all set. Let&apos;s get you playing.</Text>
        <TouchableOpacity style={s.cta} activeOpacity={0.85} onPress={() => router.replace('/')}>
          <Text style={s.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.center}>
      <StatusBar style="dark" />
      <Ionicons name="alert-circle-outline" size={56} color={colors.textSub} />
      <Text style={s.title}>This link didn&apos;t work</Text>
      <Text style={s.body}>
        It may have already been used or expired. Try signing in — if your email is confirmed,
        you&apos;re good to go.
      </Text>
      <TouchableOpacity style={s.cta} activeOpacity={0.85} onPress={() => router.replace('/sign-in')}>
        <Text style={s.ctaText}>Go to Sign In</Text>
      </TouchableOpacity>
      {!!detail && <Text style={s.detail}>{detail}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg, paddingHorizontal: spacing.xl, gap: spacing.md,
  },
  title: {
    color: colors.text, fontSize: text.titleSm.size, fontWeight: '800', textAlign: 'center',
  },
  body: {
    color: colors.textSub, fontSize: text.body.size, fontWeight: '500',
    lineHeight: 20, textAlign: 'center',
  },
  cta: {
    marginTop: spacing.md, borderRadius: shape.cta,
    backgroundColor: colors.gold, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    minWidth: 200, alignItems: 'center',
  },
  ctaText: { color: colors.navy, fontSize: text.action.size, fontWeight: '800' },
  detail: {
    color: colors.textSub, fontSize: text.caption.size, fontWeight: '500',
    textAlign: 'center', marginTop: spacing.md, opacity: 0.8,
  },
});
