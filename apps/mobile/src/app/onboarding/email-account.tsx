import React, { useState } from 'react';
import {
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
import { colors, radius, spacing } from '@/theme';
import { OnboardingCTA } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';
import { PASSWORD_PLACEHOLDER } from '@/lib/authPolicy';

const L = colors;
const PAGE_BG = '#F8F5EF';

export default function EmailAccountScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const [showPassword, setShowPassword] = useState(false);
  const canContinue = validators.emailAccount(draft);

  function next() {
    update('profileEmail', draft.profileEmail.trim().toLowerCase());
    router.push('/onboarding/your-name');
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
        <View style={s.header}>
          <TouchableOpacity
            style={s.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => router.back()}
          >
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
            <Text style={s.subtitle}>Add your email and password. We will use your next answers to finish your profile.</Text>
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
                  onSubmitEditing={canContinue ? next : undefined}
                />
                <TouchableOpacity style={s.eyeBtn} activeOpacity={0.7} onPress={() => setShowPassword(value => !value)}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={L.textSub} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={s.note}>Your email will be attached to your player profile.</Text>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}> 
          <OnboardingCTA label="Continue" disabled={!canContinue} onPress={next} />
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
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: L.navy,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 292,
  },
  formCard: {
    borderWidth: 1,
    borderColor: '#E7DED0',
    borderRadius: radius.card,
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
  label: {
    color: L.navy,
    fontSize: 13,
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
    borderRadius: radius.button,
    backgroundColor: L.white,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    color: L.navy,
    fontSize: 15,
    fontWeight: '700',
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
    fontSize: 13,
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
