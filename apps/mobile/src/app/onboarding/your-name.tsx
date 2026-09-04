import React from 'react';
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
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { OnboardingCTA, OnboardingProgressBar } from '@/lib/onboarding/components';
import { useOnboarding, validators } from '@/lib/onboarding/state';

const L = colors;
const SCREEN_BG = '#F8F5EF';

export default function YourNameScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const canContinue = validators.yourName(draft);

  function continueNext() {
    update('firstName', draft.firstName.trim());
    update('lastName', draft.lastName.trim());
    router.push('/onboarding/brings-you-here');
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
        <View style={s.header}>
          <TouchableOpacity
            style={s.headerBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={L.navy} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scrollContent, { paddingBottom: 180 + insets.bottom }]}
        >
          <View style={s.formWrap}>
            <View style={s.titleBlock}>
              <Text style={s.title}>{"What's your name?"}</Text>
              <Text style={s.subtitle}>This is how other players will see you.</Text>
            </View>

            <View style={s.field}>
              <Text style={s.label}>First Name</Text>
              <TextInput
                style={s.input}
                placeholder="Enter your first name"
                placeholderTextColor="#7F8AA3"
                value={draft.firstName}
                onChangeText={v => update('firstName', v)}
                autoCapitalize="words"
                autoComplete="given-name"
                returnKeyType="next"
              />
            </View>

            <View style={s.fieldLast}>
              <Text style={s.label}>Last Name</Text>
              <TextInput
                style={s.input}
                placeholder="Enter your last name"
                placeholderTextColor="#7F8AA3"
                value={draft.lastName}
                onChangeText={v => update('lastName', v)}
                autoCapitalize="words"
                autoComplete="family-name"
                returnKeyType="done"
                onSubmitEditing={canContinue ? continueNext : undefined}
              />
            </View>
          </View>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}> 
          <OnboardingProgressBar progress={72} />
          <OnboardingCTA label="Continue" disabled={!canContinue} onPress={continueNext} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: SCREEN_BG },
  root: { flex: 1, backgroundColor: SCREEN_BG },
  header: {
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  formWrap: {
    width: '100%',
    paddingBottom: spacing.xxl,
  },
  titleBlock: { alignItems: 'center', marginBottom: spacing.xxxl },
  title: { color: L.navy, fontSize: text.pageTitle.size, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  subtitle: { color: '#7F8AA3', fontSize: text.body.size, fontWeight: '500', lineHeight: 22, textAlign: 'center', marginTop: spacing.sm },
  field: { marginBottom: spacing.xl },
  fieldLast: { marginBottom: 0 },
  label: { color: '#8190B4', fontSize: text.fieldLabel.size, fontWeight: '800', marginBottom: spacing.sm },
  input: {
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: '#E7DED0',
    borderRadius: shape.cta,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: L.navy,
    fontSize: text.body.size,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: SCREEN_BG,
    gap: spacing.md,
  },
});
