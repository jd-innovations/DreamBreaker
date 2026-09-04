import { Stack, router } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingProvider } from '@/lib/onboarding/state';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

const L = colors;

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <View style={s.root}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        {__DEV__ && <DevExitButton />}
      </View>
    </OnboardingProvider>
  );
}

function DevExitButton() {
  return (
    <TouchableOpacity
      style={s.devExit}
      activeOpacity={0.82}
      onPress={() => router.replace('/(tabs)')}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <Ionicons name="close" size={16} color={L.navy} />
      <Text style={s.devExitText}>Exit</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  devExit: {
    position: 'absolute',
    top: 54,
    right: spacing.lg,
    zIndex: 999,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: shape.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(211,169,67,0.6)',
    paddingHorizontal: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  devExitText: {
    color: L.navy,
    fontSize: text.chipValue.size,
    fontWeight: '800',
  },
});
