import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/theme';
import { tabBarClearance } from '@/constants/tabBar';
import { resolveSupportVisibility, useCurrentSupportContext } from '@/lib/support/supportContext';
import { recordRouteVisit } from '@/lib/support/supportDiagnostics';
import { trackSupportEvent } from '@/lib/support/supportAnalytics';
import { FloatingCircleButton } from '@/components/FloatingCircleButton';
import { useSupportEnabled } from './SupportProvider';
import { SupportSheet } from './SupportSheet';

// Mirrors the tab list in (tabs)/_layout.tsx -- expo-router strips the
// (tabs) group segment, so these are the pathnames the floating tab bar (and
// therefore its clearance) is actually present under.
const TAB_ROUTE_PATHNAMES = new Set([
  '/',
  '/nearby',
  '/games',
  '/finder',
  '/profile',
  '/partner',
  '/marketplace',
  '/chat',
  '/stats',
  '/tournaments',
  '/landing',
]);

/**
 * Global launcher for the context-aware support system
 * (SUPPORT_EXPERIENCE_ARCHITECTURE.md §8/§9). Mounted once by
 * SupportProvider; reads its own eligibility from the route-visibility
 * rules and the feature flag -- no screen renders or imports this directly.
 * The button itself is the shared FloatingCircleButton (same as Events ->
 * Create).
 */
export function FloatingSupportButton() {
  const enabled = useSupportEnabled();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const context = useCurrentSupportContext();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Tracked here (not in the sheet/form) so the breadcrumb trail reflects
  // every screen the user actually visited, including ones where the button
  // itself renders nothing below.
  useEffect(() => {
    recordRouteVisit(pathname);
  }, [pathname]);

  // A screen that registers context has opted in -- default it to 'visible'
  // unless it says otherwise (score-entry sets 'hidden' explicitly, bracket
  // views set 'minimized', etc). Only fall back to the static route table
  // when nothing on screen has registered anything at all, per §7/§19's
  // "absence is a decision, not an oversight" -- unregistered routes stay
  // hidden by default rather than silently defaulting to visible.
  const visibility = context ? (context.visibility ?? 'visible') : resolveSupportVisibility(pathname);
  const feature = context?.feature ?? 'unknown';
  const buttonShown = enabled && visibility !== 'hidden' && !sheetOpen;

  useEffect(() => {
    // Fires once per becoming-visible transition, not on every re-render with the same result.
    if (buttonShown) trackSupportEvent({ name: 'support_button_shown', payload: { routeName: pathname, feature } });
  }, [buttonShown, pathname, feature]);

  // The whole feature is off -- nothing to render, and sheetOpen can never
  // become true since there'd be no button to tap. Below this point,
  // `buttonShown` (which also folds in `!sheetOpen`, per §9 states 5-6)
  // controls the button only -- the sheet itself must keep rendering while
  // open regardless, or it would unmount the instant it was asked to open.
  if (!enabled) return null;

  const isTabScreen = TAB_ROUTE_PATHNAMES.has(pathname);
  // Two sources of bottom obstruction, and they do not overlap: the tab bar
  // is global and known here, while a screen's own bottom-anchored UI is only
  // known to that screen, which reports it as `bottomClearance`. A screen that
  // declares nothing sits exactly where it always has.
  const baseBottom = isTabScreen ? tabBarClearance(insets.bottom) : insets.bottom + spacing.lg;
  const bottom = baseBottom + Math.max(0, context?.bottomClearance ?? 0);

  return (
    <>
      {buttonShown ? (
        <View pointerEvents="box-none" style={[styles.positioner, { bottom, right: spacing.lg }]}>
          <FloatingCircleButton
            icon="help-circle"
            minimized={visibility === 'minimized'}
            accessibilityLabel="Get help"
            accessibilityHint={context?.entityLabel ? `Get help with ${context.entityLabel}` : 'Open support'}
            onPress={() => {
              trackSupportEvent({ name: 'support_button_tapped', payload: { routeName: pathname, feature } });
              setSheetOpen(true);
            }}
          />
        </View>
      ) : null}
      <SupportSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        context={context}
        routeName={pathname}
      />
    </>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    zIndex: 20,
  },
});
