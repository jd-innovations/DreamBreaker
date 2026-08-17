import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { C } from '@/constants/Colors';
import { SupportProvider } from '@/components/support/SupportProvider';
import { useSession } from '@/hooks/useSession';
import { useExternalLinks } from '@/hooks/useExternalLinks';
import { useFeatureRouteGuard } from '@/hooks/useFeatureRouteGuard';
import '../global.css';

// StripeProvider intentionally NOT mounted in the root layout. Confirmed
// (Booking Engine Phase 3A, 2026-08-11) that importing @stripe/stripe-react-native
// anywhere under src/app/ breaks BOTH targets available in this dev
// environment, not just Expo Go:
//   - web: "Importing react-native internals is not supported on web" —
//     @stripe/stripe-react-native/lib/module/helpers.js imports
//     react-native/Libraries/Components/TextInput/TextInputState, which
//     transitively pulls in ReactFabric (native-only). This breaks the
//     Metro web bundle outright (confirmed: home route 500s).
//   - Expo Go (native): "Unable to resolve module @stripe/stripe-react-native"
//     (the original, previously-documented failure).
// See BOOKING_ENGINE_PHASE3_REPORT.md for the full writeup and what's needed
// to unblock this (a custom Expo dev client build, run on a real device or
// simulator — neither is available in this environment). The mobile-side
// payment code (useReservationPayment.ts, stripeConfig.ts) is written and
// ready; only mounting StripeProvider here + the review.tsx wiring are
// blocked pending that build. Do not re-attempt mounting this in a shared
// session without a way to verify + immediately revert — it takes down the
// dev server for everyone.

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const { loading, isAuthenticated } = useSession();
  useExternalLinks({ authLoading: loading, isAuthenticated });
  useFeatureRouteGuard();

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
        <Stack.Screen
          name="tournament/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="conversation/[id]"
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
    </GestureHandlerRootView>
  );
}
