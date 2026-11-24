// Confirm the email inside onboarding (2026-11-24).
//
// email-account.tsx now creates the account as soon as the user gives an email
// and password; this step redeems the emailed 6-digit code so the user is
// signed in for the rest of onboarding, and finalizeOnboarding() can save every
// answer with a real session. It lives under /onboarding (not /auth/code) so the
// OnboardingProvider draft stays mounted.
//
// Before this, the account was only created by all-set's "Let's Go!", and a
// user who left on that screen (which already said "Profile created") had no
// account at all.
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import { CODE_MAX_LENGTH, codeErrorMessage, isCompleteCode, normalizeCode } from '@shared/authCode';
import { RESEND_SENT_MESSAGE, resendErrorMessage } from '@shared/authResend';
import { resendConfirmation, verifyEmailCode } from '@/lib/auth';
import { useResendCooldown } from '@/components/auth/ResendConfirmation';
import { useOnboarding } from '@/lib/onboarding/state';
import { haptics } from '@/lib/haptics';

const PAGE_BG = '#F8F5EF';

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const { draft } = useOnboarding();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (typeof params.email === 'string' && params.email) || draft.profileEmail.trim().toLowerCase();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cooldown = useResendCooldown();
  const codeRef = useRef<TextInput>(null);
  const canVerify = isCompleteCode(code) && !busy;

  async function verify() {
    if (!canVerify) return;
    setBusy(true);
    setMessage(null);
    try {
      await verifyEmailCode(email, code, 'signup');
      haptics.success();
      // Signed in now; carry on with onboarding (the draft is still here).
      router.replace('/onboarding/your-name');
    } catch (err: any) {
      haptics.error();
      setMessage({ ok: false, text: codeErrorMessage({ code: err?.code, status: err?.status }) ?? 'That code did not work. Try again.' });
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const err = resendErrorMessage(await resendConfirmation(email));
    setMessage(err ? { ok: false, text: err } : { ok: true, text: RESEND_SENT_MESSAGE });
    if (!err) cooldown.start();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: PAGE_BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={s.back}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.navy} />
        </TouchableOpacity>

        <Text style={s.heading}>Check your email</Text>
        <Text style={s.sub}>
          We sent a 6-digit code to <Text style={s.email}>{email}</Text>. Enter it to confirm your account and keep going.
        </Text>

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
          onSubmitEditing={() => { void verify(); }}
          accessibilityLabel="Code from the email"
          autoFocus
        />

        <TouchableOpacity
          style={[s.btn, !canVerify && s.btnDisabled]}
          onPress={() => { void verify(); }}
          disabled={!canVerify}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={colors.navy} /> : <Text style={s.btnText}>Confirm and continue</Text>}
        </TouchableOpacity>

        {!!message && (
          <Text style={[s.message, !message.ok && s.messageError]} accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        )}

        <TouchableOpacity style={s.linkBtn} onPress={() => { void resend(); }} disabled={cooldown.left > 0} activeOpacity={0.7} accessibilityRole="button">
          <Text style={[s.linkText, cooldown.left > 0 && { opacity: 0.5 }]}>
            {cooldown.left > 0 ? `New code sent · resend in ${cooldown.left}s` : 'Send a new code'}
          </Text>
        </TouchableOpacity>

        <Text style={s.hint}>
          Can&apos;t find it? Check spam or promotions. Wrong email? Go back and change it. Already have an account with this email? Go back and use Sign in.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.sm },
  back: { alignSelf: 'flex-start', marginBottom: spacing.md },
  heading: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  sub: { color: colors.textSub, fontSize: text.body.size, fontWeight: '500', lineHeight: 21, marginBottom: spacing.md },
  email: { color: colors.navy, fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.panel,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: text.body.size, backgroundColor: colors.bg,
  },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  btn: { marginTop: spacing.lg, borderRadius: shape.cta, backgroundColor: colors.gold, paddingVertical: spacing.md, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.navy, fontSize: text.action.size, fontWeight: '800' },
  message: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', marginTop: spacing.sm },
  messageError: { color: colors.danger },
  linkBtn: { alignSelf: 'center', paddingVertical: spacing.md },
  linkText: { color: colors.navy, fontSize: text.body.size, fontWeight: '700' },
  hint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center', lineHeight: 18, marginTop: spacing.sm },
});
