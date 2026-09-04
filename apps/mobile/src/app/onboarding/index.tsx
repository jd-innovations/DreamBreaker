import { Redirect } from 'expo-router';

// /onboarding → always starts at screen 1 (Welcome).
export default function OnboardingIndex() {
  return <Redirect href="/onboarding/welcome" />;
}
