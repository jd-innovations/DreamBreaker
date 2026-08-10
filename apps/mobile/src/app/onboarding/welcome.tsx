import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { colors, spacing, radius } from '@/theme';

const L = colors;

const LIGHT_LOGO = require('../../../assets/images/pickleballapp-logo-light.png');
const SCREEN_ONE_HERO = require('../../../assets/images/onboarding-screen-1.jpg');
const HERO_SIZE = { width: 604, height: 1280 };
const COURT_PIN_BASE = { x: 273, y: 626 };
const PULSE_SIZE = 28;

// ── "Spatial Scene" tilt parallax ───────────────────────────────────────────
// Two depth layers driven by the gyroscope (expo-sensors DeviceMotion):
// the background photo (rendered oversized so it has headroom to shift
// without exposing edges) moves a little, the foreground court-pin marker
// moves more — that differential is what reads as depth, not just one flat
// image jiggling. `rotation.beta/gamma` from expo-sensors are in radians.
const BG_SCALE = 1.08;
const BG_MAX_PX = 10;
const FG_MAX_PX = 24;
const TILT_RANGE_RAD = 0.35; // ~20°, clamped — subtle, not a shaky camera
const SMOOTHING = 0.15; // exponential smoothing factor per tick
const UPDATE_INTERVAL_MS = 33; // ~30fps

function useTiltParallax() {
  const bg = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fgX = bg.x.interpolate({ inputRange: [-BG_MAX_PX, BG_MAX_PX], outputRange: [-FG_MAX_PX, FG_MAX_PX] });
  const fgY = bg.y.interpolate({ inputRange: [-BG_MAX_PX, BG_MAX_PX], outputRange: [-FG_MAX_PX, FG_MAX_PX] });

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let baseline: { beta: number; gamma: number } | null = null;
    let smoothX = 0;
    let smoothY = 0;
    let cancelled = false;

    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));

    (async () => {
      const available = await DeviceMotion.isAvailableAsync().catch(() => false);
      if (!available || cancelled) return;

      const { granted } = await DeviceMotion.getPermissionsAsync().catch(() => ({ granted: true }));
      if (!granted) {
        const req = await DeviceMotion.requestPermissionsAsync().catch(() => ({ granted: false }));
        if (!req.granted || cancelled) return;
      }

      DeviceMotion.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = DeviceMotion.addListener((m: DeviceMotionMeasurement) => {
        const { beta, gamma } = m.rotation;
        if (baseline === null) {
          baseline = { beta, gamma };
          return;
        }
        const dx = clamp(gamma - baseline.gamma, TILT_RANGE_RAD) / TILT_RANGE_RAD;
        const dy = clamp(beta - baseline.beta, TILT_RANGE_RAD) / TILT_RANGE_RAD;
        smoothX += (dx - smoothX) * SMOOTHING;
        smoothY += (dy - smoothY) * SMOOTHING;
        bg.setValue({ x: smoothX * BG_MAX_PX, y: smoothY * BG_MAX_PX });
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { bgX: bg.x, bgY: bg.y, fgX, fgY };
}

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompact = height < 760;
  const pulsePoint = getCoveredImagePoint(width, height, COURT_PIN_BASE.x, COURT_PIN_BASE.y);
  const { bgX, bgY, fgX, fgY } = useTiltParallax();

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: bgX }, { translateY: bgY }, { scale: BG_SCALE }] },
        ]}
      >
        <Image source={SCREEN_ONE_HERO} style={s.backgroundImage} resizeMode="cover" />
      </Animated.View>
      <View style={s.scrim} pointerEvents="none" />
      <CourtPinPulse x={pulsePoint.x} y={pulsePoint.y} shiftX={fgX} shiftY={fgY} />

      <View style={[s.content, { paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
        <View style={[s.brandBlock, isCompact && s.brandBlockCompact]}>
          <View style={[s.welcomeSpacer, isCompact && s.welcomeSpacerCompact]} />
          <Image source={LIGHT_LOGO} style={[s.logo, isCompact && s.logoCompact]} resizeMode="contain" />
          <Text style={[s.tagline, isCompact && s.taglineCompact]}>PLAY. ENGAGE. BELONG.</Text>
        </View>

        <View style={s.heroSpacer} />

        <View style={s.actionBlock}>
          <TouchableOpacity style={s.getStarted} activeOpacity={0.88} onPress={() => router.push('/onboarding/self-rating')}>
            <Text style={s.getStartedText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.signIn} activeOpacity={0.8} onPress={() => router.push('/sign-in')}>
            <Text style={s.signInText}>Sign In</Text>
          </TouchableOpacity>
          <View style={s.pagerSpacer} />
        </View>
      </View>
    </View>
  );
}

function getCoveredImagePoint(containerWidth: number, containerHeight: number, imageX: number, imageY: number) {
  const scale = Math.max(containerWidth / HERO_SIZE.width, containerHeight / HERO_SIZE.height);
  const renderedWidth = HERO_SIZE.width * scale;
  const renderedHeight = HERO_SIZE.height * scale;
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  return {
    x: offsetX + imageX * scale,
    y: offsetY + imageY * scale,
  };
}

function CourtPinPulse({ x, y, shiftX, shiftY }: {
  x: number; y: number;
  shiftX?: Animated.AnimatedInterpolation<number>;
  shiftY?: Animated.AnimatedInterpolation<number>;
}) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 3000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 0.22, 1],
    outputRange: [0.42, 0.3, 0],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3.75],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.courtPinPulse,
        {
          left: x - PULSE_SIZE / 2,
          top: y - PULSE_SIZE / 2,
          opacity,
          transform: [
            { translateX: shiftX ?? 0 },
            { translateY: shiftY ?? 0 },
            { scale },
          ],
        },
      ]}
    />
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.navy },
  backgroundImage: { width: '100%', height: '100%' },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 9, 23, 0.24)',
  },
  courtPinPulse: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    borderWidth: 1.2,
    borderColor: 'rgba(246, 199, 102, 0.95)',
    backgroundColor: 'transparent',
    shadowColor: L.gold,
    shadowOpacity: 0.38,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 1,
  },
  content: { flex: 1, paddingHorizontal: spacing.xxl },
  brandBlock: { alignItems: 'center', zIndex: 2, height: 282, paddingTop: 54 },
  brandBlockCompact: { height: 246, paddingTop: 42 },
  welcomeSpacer: { height: 30, marginBottom: 25 },
  welcomeSpacerCompact: { height: 27, marginBottom: 25 },
  logo: { width: '86%', maxWidth: 306, height: 61 },
  logoCompact: { width: '84%', height: 58 },
  tagline: {
    color: L.white,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 4.2,
    marginTop: 25,
  },
  taglineCompact: { fontSize: 11, marginTop: 25 },
  heroSpacer: { flex: 1 },
  actionBlock: { gap: spacing.md, paddingBottom: 2, marginTop: -12 },
  getStarted: {
    minHeight: 56,
    borderRadius: radius.button + 12,
    backgroundColor: L.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: L.gold,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  getStartedText: { color: L.navy, fontSize: 16, fontWeight: '900' },
  signIn: {
    minHeight: 56,
    borderRadius: radius.button + 12,
    borderWidth: 1.2,
    borderColor: L.gold,
    backgroundColor: L.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: { color: L.navy, fontSize: 16, fontWeight: '900' },
  pagerSpacer: { height: 12 },
});
