import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { OnboardingCTA } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';
import { MIN_PASSWORD_LENGTH, PASSWORD_PLACEHOLDER, isPasswordLongEnough } from '@/lib/authPolicy';
import { probeExistingAccount, resendConfirmation, signUp } from '@/lib/auth';
import { draftToProfileFields } from '@/lib/onboarding/finalize';

const L = colors;
const PAGE_BG = '#F8F5EF';

/**
 * GoTrue's weak_password carries `reasons` ('length' | 'characters' | 'pwned');
 * say each in plain words instead of the raw server message.
 */
function signUpErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string; reasons?: string[] } | null;
  if (err?.code === 'weak_password') {
    const reasons = err.reasons ?? [];
    if (reasons.includes('pwned')) return 'This password has appeared in a data breach. Please choose a different one.';
    if (reasons.includes('characters')) return 'Please make your password stronger: mix letters, numbers and a symbol.';
    return `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (err?.code === 'over_email_send_rate_limit') return 'Too many attempts. Please wait a minute and try again.';
  if (err?.code === 'email_address_invalid') return 'That email address does not look right. Please check it.';
  return err?.message || 'Please check your connection and try again.';
}

export default function EmailAccountScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const canContinue = validators.emailAccount(draft) && !busy;
  const passwordOk = isPasswordLongEnough(draft.emailPassword);

  // The account is created HERE, not at the end of onboarding (2026-11-24).
  // It used to be created by all-set's "Let's Go!", after a screen that
  // already said "Profile created": a new user left on that screen and had no
  // account at all. Now the account exists from this step, the code is
  // verified on the next screen, and the remaining answers are saved to a
  // signed-in account by finalizeOnboarding()'s session path.
  async function next() {
    if (!canContinue) return;
    const email = draft.profileEmail.trim().toLowerCase();
    update('profileEmail', email);
    setBusy(true);
    try {
      // Never sign up blindly: a repeat signUp() for an unconfirmed account
      // REPLACES its password (see finalizeOnboarding / probeExistingAccount).
      const existing = await probeExistingAccount(email, draft.emailPassword);
      if (existing === 'signed_in') {
        router.push('/onboarding/your-name');
        return;
      }
      if (existing === 'unconfirmed') {
        await resendConfirmation(email);
        router.push({ pathname: '/onboarding/verify-email', params: { email } } as never);
        return;
      }
      // The answers so far (rating, gender, area, court, radius) ride into the
      // account's metadata, so they are kept even if the user stops here.
      await signUp(email, draft.emailPassword, '', draftToProfileFields({ ...draft, profileEmail: email }));
      router.push({ pathname: '/onboarding/verify-email', params: { email } } as never);
    } catch (e: unknown) {
      Alert.alert('Could not create your account', signUpErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={L.navy} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.titleBlock}>
            <Text style={s.title}>Create with email</Text>
            <Text style={s.subtitle}>Add your email and password. We will email you a code to confirm it.</Text>
          </View>

          <View style={s.formCard}>
            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <View style={s.inputShell}>
                <Ionicons name="mail-outline" size={20} color={L.gold} />
                <TextInput
                  style={s.input}
                  value={draft.profileEmail}
                  onChangeText={value => update('profileEmail', value)}
                  placeholder="you@email.com"
                  placeholderTextColor={L.textSub}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={s.fieldLast}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputShell}>
                <Ionicons name="lock-closed-outline" size={20} color={L.gold} />
                <TextInput
                  style={s.input}
                  value={draft.emailPassword}
                  onChangeText={value => update('emailPassword', value)}
                  placeholder={PASSWORD_PLACEHOLDER}
                  placeholderTextColor={L.textSub}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={canContinue ? () => { void next(); } : undefined}
                />
                <TouchableOpacity style={s.eyeBtn} activeOpacity={0.7} onPress={() => setShowPassword(value => !value)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={L.textSub} />
                </TouchableOpacity>
              </View>
              {/* Say the rule as they type, so a greyed-out Continue is never a
                  mystery (a new user's suggestion, 2026-11-24). */}
              <View style={s.ruleRow} accessibilityLiveRegion="polite">
                <Ionicons
                  name={passwordOk ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={passwordOk ? L.success : L.textSub}
                />
                <Text style={[s.ruleText, passwordOk && { color: L.success }]}>
                  At least {MIN_PASSWORD_LENGTH} characters
                </Text>
              </View>
            </View>
          </View>

          <Text style={s.note}>Your email will be attached to your player profile.</Text>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}> 
          <OnboardingCTA label={busy ? 'Creating account…' : 'Continue'} disabled={!canContinue} onPress={() => { void next(); }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 24,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: L.navy,
    fontSize: text.pageTitle.size,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: L.navy,
    fontSize: text.body.size, fontWeight: '500',
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 292,
  },
  formCard: {
    borderWidth: 1,
    borderColor: '#E7DED0',
    borderRadius: shape.card,
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  field: {
    marginBottom: spacing.lg,
  },
  fieldLast: {
    marginBottom: 0,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 2 },
  ruleText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '600' },
  label: {
    color: L.navy,
    fontSize: text.fieldLabel.size,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  inputShell: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#E7DED0',
    borderRadius: shape.cta,
    backgroundColor: L.white,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    color: L.navy,
    fontSize: text.body.size,
    fontWeight: '500',
    paddingVertical: 12,
  },
  eyeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    color: L.textSub,
    fontSize: text.caption.size, fontWeight: '500',
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: PAGE_BG,
  },
});
