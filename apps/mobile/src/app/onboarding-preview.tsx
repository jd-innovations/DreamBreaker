import { Redirect } from 'expo-router';

// TEMPORARY dev-only entry point for QA'ing the onboarding flow before it's
// wired to real signup. Delete this file once onboarding is triggered from
// the real account-creation flow instead.
export default function OnboardingPreviewEntry() {
  return <Redirect href="/onboarding/welcome" />;
}
