import { router } from 'expo-router';

/**
 * Safely navigate back. If there is no screen in the history stack to pop
 * (e.g. the screen was deep-linked or opened as the initial route),
 * fall back to a known destination instead of throwing the
 * "GO_BACK was not handled by any navigator" warning.
 */
export function goBack(fallback = '/(tabs)') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback as never);
  }
}
