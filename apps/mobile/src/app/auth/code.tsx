// Enter the emailed code — the typed alternative to tapping the link
// (owner, 2026-10-04). An ADDITION: every link screen still works as before.
//
// Reached from "Check your email" after signup, the "This link didn't work"
// screen, and the forgot-password confirmation. Params:
//   purpose  'signup' (default) | 'recovery'
//   email    prefilled when the caller knows it
//
// Rules live in @shared/authCode (lengths, identical wording for wrong and
// expired codes) and @shared/authResend (cooldown, neutral resend wording).
// On success it hands off exactly as a link would: signup to "/" so
// resolveAuthGate() routes, recovery to /auth/reset with the session already
// established.

import React, { useRef, useState } from 'react';
import {
  Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import {
  CODE_MAX_LENGTH, codeErrorMessage, isCompleteCode, normalizeCode, type CodePurpose,
} from '@shared/authCode';
import { RESEND_SENT_MESSAGE, looksLikeEmail, resendErrorMessage } from '@shared/authResend';
import { requestPasswordReset, resendConfirmation, verifyEmailCode } from '@/lib/auth';
import { useResendCooldown } from '@/components/auth/ResendConfirmation';
import { haptics } from '@/lib/haptics';

export default function EnterCodeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ purpose?: string; email?: string }>();
  const purpose: CodePurpose = params.purpose === 'recovery' ? 'recovery' : 'signup';
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cooldown = useResendCooldown();
  const codeRef = useRef<TextInput>(null);

  const canVerify = looksLikeEmail(email) && isCompleteCode(code) && !busy;

  async function verify() {
    if (!canVerify) return;
    setBusy(true);
    setMessage(null);
    try {
      await verifyEmailCode(email, code, purpose);
      haptics.success();
      if (purpose === 'recovery') {
        router.replace({ pathname: '/auth/reset', params: { verified: '1' } } as never);
      } else {
        router.replace('/');
      }
    } catch (err: any) {
      haptics.error();
      setMessage({ ok: false, text: codeErrorMessage({ code: err?.code, status: err?.status }) ?? '' });
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!looksLikeEmail(email)) {
      setMessage({ ok: false, text: 'Enter your email first.' });
      return;
    }
    let err: string | null;
    if (purpose === 'recovery') {
      // Same neutral wording either way: it must not reveal whether the
      // address has an account.
      try { await requestPasswordReset(email.trim().toLowerCase()); err = null; }
      catch (e: any) { err = resendErrorMessage({ code: e?.code, status: e?.status }); }
    } else {
      err = resendErrorMessage(await resendConfirmation(email));
    }
    setMessage(err ? { ok: false, text: err } : { ok: true, text: RESEND_SENT_MESSAGE });
    if (!err) cooldown.start();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={s.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.navy} />
        </TouchableOpacity>

        <Text style={s.heading}>Enter your code</Text>
        <Text style={s.sub}>
          {purpose === 'recovery'
            ? 'Type the code from your password reset email. It works on any device.'
            : 'Type the code from your confirmation email. It works on any device.'}
        </Text>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={t => { setEmail(t); setMessage(null); }}
          placeholder="you@email.com"
          placeholderTextColor={colors.textSub}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => codeRef.current?.focus()}
          accessibilityLabel="Email"
        />

        <Text style={s.label}>Code</Text>
        <TextInput
          ref={codeRef}
          style={[s.input, s.codeInput]}
          value={code}
          onChangeText={t => { setCode(normalizeCode(t)); setMessage(null); }}
          placeholder="123456"
          placeholderTextColor={colors.textSub}
          keyboardType="number-pad"
          // iOS offers the code from Mail above the keyboard.
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_MAX_LENGTH + 4}
          returnKeyType="done"
          onSubmitEditing={verify}
          accessibilityLabel="Code from the email"
          autoFocus={!!email}
        />

        <TouchableOpacity
          style={[s.btn, !canVerify && s.btnDisabled]}
          onPress={verify}
          disabled={!canVerify}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.navy} /> : <Text style={s.btnText}>Verify</Text>}
        </TouchableOpacity>

        {!!message && (
          <Text style={[s.message, !message.ok && s.messageError]} accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        )}

        <TouchableOpacity
          style={s.linkBtn}
          onPress={resend}
          disabled={cooldown.left > 0}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={[s.linkText, cooldown.left > 0 && { opacity: 0.5 }]}>
            {cooldown.left > 0 ? `New code sent · resend in ${cooldown.left}s` : 'Send a new code'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.sm },
  back: { alignSelf: 'flex-start', marginBottom: spacing.md },
  heading: { color: colors.text, fontSize: text.titleSm.size, fontWeight: '800' },
  sub: { color: colors.textSub, fontSize: text.body.size, fontWeight: '500', lineHeight: 20, marginBottom: spacing.md },
  label: { color: colors.text, fontSize: text.caption.size, fontWeight: '700', marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.panel,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: text.body.size, backgroundColor: colors.bg,
  },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  btn: {
    marginTop: spacing.lg, borderRadius: shape.cta, backgroundColor: colors.gold,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.navy, fontSize: text.action.size, fontWeight: '800' },
  message: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: spacing.sm },
  messageError: { color: colors.danger },
  linkBtn: { alignSelf: 'center', paddingVertical: spacing.md },
  linkText: { color: colors.navy, fontSize: text.body.size, fontWeight: '700' },
});
