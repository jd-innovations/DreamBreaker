import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { C } from '@/constants/Colors';
import { SupportProvider } from '@/components/support/SupportProvider';
import { useSession } from '@/hooks/useSession';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useExternalLinks } from '@/hooks/useExternalLinks';
import { useFeatureRouteGuard } from '@/hooks/useFeatureRouteGuard';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/payments/stripeConfig';
import { initSentry, setSentryUser, withCrashReporting } from '@/lib/observability/sentry';
import '../global.css';

// StripeProvider requires a custom Expo dev client build — @stripe/stripe-react-native
// is a native module unavailable in Expo Go and unsupported on the web target
// (see BOOKING_ENGINE_PHASE3_REPORT.md for the prior failure modes). Only
// mount this app via `eas build --profile development` / a dev client, not
// `expo start` alone for Expo Go or web.

SplashScreen.preventAutoHideAsync().catch(() => {});

// At module scope, before any component renders: an error thrown during the
// first render is exactly the kind worth catching, and initialising inside a
// component would miss it.
initSentry();

function RootLayout() {
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const { user, loading, isAuthenticated } = useSession();
  usePushNotifications(user?.id ?? null);
  useExternalLinks({ authLoading: loading, isAuthenticated });
  useFeatureRouteGuard();

  // Attributes crashes to a user id only -- never a name or email. Clearing on
  // sign-out matters on a shared device, where the next person's crashes would
  // otherwise be filed under the previous account.
  useEffect(() => { setSentryUser(user?.id ?? null); }, [user?.id]);

  useEffect(() => {
    // Fast Refresh can re-run this effect after the native splash screen has
    // already been hidden once, which throws "No native splash screen
    // registered for given view controller" — harmless, so swallow it.
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <SupportProvider>
      <Stack
        screenOptions={{
          // Every screen renders its own in-app header, so the native stack
          // header is hidden by default. Previously each screen had to opt out
          // individually; any route missing from the list below (e.g.
          // my-tournaments, director, apply-director) fell through to the
          // default native header, producing a duplicate route-name title bar.
          headerShown: false,
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.gold,
          headerTitleStyle: { color: C.text, fontWeight: '700' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding-preview" options={{ headerShown: false }} />
        <Stack.Screen name="design-lab" options={{ headerShown: false }} />
        <Stack.Screen name="dev-qr-scan" options={{ headerShown: false }} />
        <Stack.Screen name="dev-diagnostics" options={{ headerShown: false }} />
        <Stack.Screen
          name="tournament/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="conversation/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="tournament/[id]/check-in-qr"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="tournament/[id]/check-in-scan"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="new-message"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="community/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="community/[id]/invite-players"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="community/[id]/edit"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="facility/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/offers/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/offers/create"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/offers/[id]/edit"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="lessons/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="lessons/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/results"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/choose-time"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/players"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/review"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/confirmation"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/my-bookings"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/game-status"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="invites"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="invite-detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="invite-accepted"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="claim/[token]" options={{ headerShown: false }} />
        <Stack.Screen
          name="players/[id]/invite"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="account-settings"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        {/* Full-screen (not sheet) so iOS does NOT auto-shift the form up
            to avoid the keyboard — sheet modals do that and it can't be
            disabled via ScrollView props. */}
        <Stack.Screen
          name="edit-profile"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="story/[category]"
          options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }}
        />
        <Stack.Screen name="play-pickleball" options={{ headerShown: false }} />
        <Stack.Screen name="create-quick-game" options={{ headerShown: false }} />
        <Stack.Screen name="quick-game-created" options={{ headerShown: false }} />
        <Stack.Screen name="quick-game/[id]/roster" options={{ headerShown: false }} />
        <Stack.Screen name="create-round-robin" options={{ headerShown: false }} />
        <Stack.Screen name="create-mini-tournament" options={{ headerShown: false }} />
        <Stack.Screen name="round-robin-created" options={{ headerShown: false }} />
        <Stack.Screen name="round-robin/[id]/schedule" options={{ headerShown: false }} />
        <Stack.Screen name="round-robin/[id]/score-entry" options={{ headerShown: false }} />
        <Stack.Screen name="round-robin/[id]/standings" options={{ headerShown: false }} />
        <Stack.Screen name="round-robin/[id]/roster" options={{ headerShown: false }} />
        <Stack.Screen name="round-robin/[id]/results" options={{ headerShown: false }} />
        <Stack.Screen name="mini-tournament-created" options={{ headerShown: false }} />
        <Stack.Screen name="mini-tournament/[id]/bracket" options={{ headerShown: false }} />
        <Stack.Screen name="mini-tournament/[id]/score-entry" options={{ headerShown: false }} />
        <Stack.Screen name="mini-tournament/[id]/results" options={{ headerShown: false }} />
        <Stack.Screen name="groups/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="groups/create" options={{ headerShown: false }} />
        <Stack.Screen name="groups/[id]/chat" options={{ headerShown: false }} />
        <Stack.Screen name="groups/[id]/edit" options={{ headerShown: false }} />
        <Stack.Screen name="rating-settings" options={{ headerShown: false }} />
        <Stack.Screen name="location-settings" options={{ headerShown: false }} />
        <Stack.Screen name="communication-settings" options={{ headerShown: false }} />
        <Stack.Screen name="notifications-settings" options={{ headerShown: false }} />
        <Stack.Screen name="permissions-settings" options={{ headerShown: false }} />
        <Stack.Screen name="payments-settings" options={{ headerShown: false }} />
        <Stack.Screen name="membership-settings" options={{ headerShown: false }} />
        <Stack.Screen name="help-support" options={{ headerShown: false }} />
        <Stack.Screen name="match/saved"        options={{ headerShown: false }} />
        <Stack.Screen name="match/connections"  options={{ headerShown: false }} />
        <Stack.Screen name="match/requests"     options={{ headerShown: false }} />
        <Stack.Screen name="match/preferences"  options={{ headerShown: false }} />
        <Stack.Screen name="match/profile/[id]" options={{ headerShown: false }} />
      </Stack>
      </SupportProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap adds the error boundary and native crash handlers around the
// whole tree. It must wrap the ROOT export -- expo-router renders this default
// export directly, so anything not inside it is outside the boundary.
export default withCrashReporting(RootLayout);
