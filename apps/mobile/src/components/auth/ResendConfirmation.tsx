import React, { useEffect, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import {
  RESEND_COOLDOWN_SECONDS, RESEND_SENT_MESSAGE, looksLikeEmail, resendErrorMessage,
} from '@shared/authResend';
import { resendConfirmation } from '@/lib/auth';

// "Send a new confirmation link" (owner, 2026-10-02). Rules — neutral wording,
// one-minute cooldown — live in @shared/authResend so web says the same thing.

/** Seconds left on the resend cooldown; start() begins a new one. */
export function useResendCooldown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: () => setLeft(RESEND_COOLDOWN_SECONDS) };
}

/**
 * For places that already know the email and only have an Alert to work with
 * (sign in, "Check your email" after signup). Sends, then reports in an Alert.
 */
export async function resendWithAlert(email: string, then?: () => void) {
  const err = resendErrorMessage(await resendConfirmation(email));
  Alert.alert(err ? 'Not sent' : 'Link sent', err ?? RESEND_SENT_MESSAGE, [{ text: 'OK', onPress: then }]);
}

/** Email field + button, for the "This link didn't work" screen. */
export function ResendConfirmation({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cooldown = useResendCooldown();

  async function send() {
    if (!looksLikeEmail(email)) {
      setMessage({ ok: false, text: 'Enter the email you signed up with.' });
      return;
    }
    setBusy(true);
    const err = resendErrorMessage(await resendConfirmation(email));
    setBusy(false);
    setMessage(err ? { ok: false, text: err } : { ok: true, text: RESEND_SENT_MESSAGE });
    if (!err) cooldown.start();
  }

  const disabled = busy || cooldown.left > 0;
  return (
    <View style={s.wrap}>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={t => { setEmail(t); setMessage(null); }}
        placeholder="Email you signed up with"
        placeholderTextColor={colors.textSub}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        returnKeyType="send"
        onSubmitEditing={() => { if (!disabled) void send(); }}
        accessibilityLabel="Email you signed up with"
      />
      <TouchableOpacity
        style={[s.btn, disabled && s.btnDisabled]}
        activeOpacity={0.85}
        onPress={send}
        disabled={disabled}
        accessibilityRole="button"
      >
        <Text style={s.btnText}>
          {busy ? 'Sending…' : cooldown.left > 0 ? `Sent · resend in ${cooldown.left}s` : 'Send a new confirmation link'}
        </Text>
      </TouchableOpacity>
      {!!message && (
        <Text style={[s.message, !message.ok && s.messageError]} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.panel,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: text.body.size, backgroundColor: colors.bg,
  },
  btn: {
    borderRadius: shape.cta, borderWidth: 1, borderColor: colors.navy,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.navy, fontSize: text.action.size, fontWeight: '800' },
  message: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', textAlign: 'center' },
  messageError: { color: colors.danger },
});
