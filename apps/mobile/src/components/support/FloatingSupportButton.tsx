import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
import { tabBarClearance } from '@/constants/tabBar';
import { resolveSupportVisibility, useCurrentSupportContext } from '@/lib/support/supportContext';
import { recordRouteVisit } from '@/lib/support/supportDiagnostics';
import { trackSupportEvent } from '@/lib/support/supportAnalytics';
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

const SIZE_FULL = 52;
const SIZE_MINIMIZED = 40;

/**
 * Global launcher for the context-aware support system
 * (SUPPORT_EXPERIENCE_ARCHITECTURE.md §8/§9). Mounted once by
 * SupportProvider; reads its own eligibility from the route-visibility
 * rules and the feature flag -- no screen renders or imports this directly.
 */
export function FloatingSupportButton() {
  const enabled = useSupportEnabled();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const context = useCurrentSupportContext();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduceMotion(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tracked here (not in the sheet/form) so the breadcrumb trail reflects
  // every screen the user actually visited, including ones where the button
  // itself renders nothing below.
  useEffect(() => {
    recordRouteVisit(pathname);
  }, [pathname]);

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

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

  function handlePressIn() {
    scale.value = reduceMotion ? 0.96 : withTiming(0.96, { duration: 90 });
  }
  function handlePressOut() {
    scale.value = reduceMotion ? 1 : withSpring(1, { damping: 14, stiffness: 220 });
  }

  const isTabScreen = TAB_ROUTE_PATHNAMES.has(pathname);
  const bottom = isTabScreen ? tabBarClearance(insets.bottom) : insets.bottom + spacing.lg;
  const size = visibility === 'minimized' ? SIZE_MINIMIZED : SIZE_FULL;
  const iconSize = visibility === 'minimized' ? 20 : 24;
  const radius = size / 2;

  return (
    <>
      {buttonShown ? (
        <View pointerEvents="box-none" style={[styles.positioner, { bottom, right: spacing.lg }]}>
          <Pressable
            onPress={() => {
              trackSupportEvent({ name: 'support_button_tapped', payload: { routeName: pathname, feature } });
              setSheetOpen(true);
            }}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Get help"
            accessibilityHint={context?.entityLabel ? `Get help with ${context.entityLabel}` : 'Open support'}
          >
            <Animated.View style={[styles.shadowLayer, { width: size, height: size, borderRadius: radius }, animatedStyle]}>
              <View style={[styles.clip, { width: size, height: size, borderRadius: radius }]}>
                <BlurView tint="light" intensity={44} style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,18,40,0.14)' }]} />
                <LinearGradient
                  colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                  start={{ x: 0.15, y: 0.05 }}
                  end={{ x: 0.8, y: 0.7 }}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  pointerEvents="none"
                  style={[styles.border, { borderRadius: radius }]}
                />
                <View style={styles.iconLayer}>
                  <Ionicons name="help-circle" size={iconSize} color={colors.navy} />
                </View>
              </View>
            </Animated.View>
          </Pressable>
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
  shadowLayer: {
    shadowColor: colors.navy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.25,
    borderColor: 'rgba(201,168,76,0.35)',
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
