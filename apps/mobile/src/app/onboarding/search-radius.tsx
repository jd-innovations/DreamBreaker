import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme';
import { OnboardingCTA, OnboardingProgressBar, onboardingSelectionHaptic } from '@/lib/onboarding/components';
import { useOnboarding } from '@/lib/onboarding/state';
import Svg, { G, Path } from 'react-native-svg';

const L = colors;
const SCREEN_BG = '#F8F5EF';
const RADIUS_OPTIONS = [5, 15, 30, 50] as const;
const AnimatedView = Animated.createAnimatedComponent(View);

type RadiusOption = typeof RADIUS_OPTIONS[number];

export default function SearchRadiusScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const radiusMiles = normalizeRadius(draft.searchRadiusMiles);
  const activeIndex = RADIUS_OPTIONS.indexOf(radiusMiles);
  const progressPct = (activeIndex / (RADIUS_OPTIONS.length - 1)) * 100;
  const knobLeft = `${progressPct}%` as `${number}%`;
  const outerRingPulse = usePulseAnimation(0);
  const midRingPulse = usePulseAnimation(280);
  const innerRingPulse = usePulseAnimation(560);
  const pulseOne = usePulseAnimation(840);
  const pulseTwo = usePulseAnimation(1120);
  function setRadius(value: RadiusOption) {
    // Only tick when the radius actually moves -- tapping the tick that's
    // already active, or stepping past either end of the range, changes
    // nothing and shouldn't buzz.
    if (value !== radiusMiles) onboardingSelectionHaptic();
    update('searchRadiusMiles', value);
  }

  function step(delta: -1 | 1) {
    const nextIndex = Math.min(RADIUS_OPTIONS.length - 1, Math.max(0, activeIndex + delta));
    setRadius(RADIUS_OPTIONS[nextIndex]);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}> 
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} activeOpacity={0.7} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={s.skipBtn} activeOpacity={0.7} onPress={() => router.push('/onboarding/enable-notifications')}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.titleBlock}>
          <Text style={s.title}>Set your search radius</Text>
          <Text style={s.subtitle}>This helps us show games and players near you.</Text>
        </View>

        <View style={s.radiusViz}>
          <BreathingRing animatedValue={outerRingPulse} style={s.ringOuter} />
          <BreathingRing animatedValue={midRingPulse} style={s.ringMid} />
          <BreathingRing animatedValue={innerRingPulse} style={s.ringInner} />
          <View style={[s.spoke, s.spokeA]} />
          <View style={[s.spoke, s.spokeB]} />
          <View style={[s.spoke, s.spokeC]} />
          <View style={s.callout}>
            <Text style={s.calloutText}>{radiusMiles} miles</Text>
            <View style={s.calloutTip} />
          </View>
          <PulseRing animatedValue={pulseOne} size={150} />
          <PulseRing animatedValue={pulseTwo} size={184} />
          <View style={s.courtCore}>
            <View style={s.coreHalo} />
            <CourtIcon />
          </View>
        </View>

        <View style={s.sliderArea}>
          <TouchableOpacity style={s.stepBtn} activeOpacity={0.75} onPress={() => step(-1)}>
            <Ionicons name="remove" size={21} color={L.navy} />
          </TouchableOpacity>

          <View style={s.sliderWrap}>
            <View style={s.sliderTrack} />
            <View style={[s.sliderFill, { width: knobLeft }]} />
            <View style={[s.sliderKnob, { left: knobLeft }]} />
            <View style={s.tickRow}>
              {RADIUS_OPTIONS.map(value => (
                <TouchableOpacity key={value} style={s.tickHit} activeOpacity={0.7} onPress={() => setRadius(value)}>
                  <View style={[s.tick, radiusMiles === value && s.tickActive]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={s.stepBtn} activeOpacity={0.75} onPress={() => step(1)}>
            <Ionicons name="add" size={21} color={L.navy} />
          </TouchableOpacity>
        </View>

        <View style={s.labelsRow}>
          {RADIUS_OPTIONS.map(value => (
            <Text key={value} style={[s.radiusLabel, radiusMiles === value && s.radiusLabelActive]}>{value} mi</Text>
          ))}
        </View>
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingProgressBar progress={54} />
        <OnboardingCTA label="Continue" onPress={() => router.push('/onboarding/enable-notifications')} />
      </View>
    </View>
  );
}

function normalizeRadius(value: number): RadiusOption {
  return RADIUS_OPTIONS.includes(value as RadiusOption) ? value as RadiusOption : 15;
}

function usePulseAnimation(delayMs: number) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(value, {
          toValue: 1,
          duration: 1700,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delayMs, value]);

  return value;
}

function BreathingRing({ animatedValue, style }: { animatedValue: Animated.Value; style: object }) {
  return (
    <AnimatedView
      pointerEvents="none"
      style={[
        s.ring,
        style,
        {
          opacity: animatedValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.22, 0.55, 0.22] }),
          transform: [{ scale: animatedValue.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.97, 1.045, 0.97] }) }],
        },
      ]}
    />
  );
}
function PulseRing({ animatedValue, size }: { animatedValue: Animated.Value; size: number }) {
  return (
    <AnimatedView
      pointerEvents="none"
      style={[
        s.pulseRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0] }),
          transform: [{ scale: animatedValue.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.12] }) }],
        },
      ]}
    />
  );
}

function CourtIcon() {
  return (
    <View style={s.courtIconWrap}>
      <Svg width={70} height={64} viewBox="0 0 493 448">
        <G transform="translate(0,448) scale(0.1,-0.1)" fill={L.gold} stroke="none">
          <Path d="M2935 3760 c-33 -4 -97 -8 -142 -9 -45 -1 -153 -11 -240 -22 -167 -23 -313 -27 -713 -20 -124 2 -264 0 -311 -4 -79 -7 -88 -6 -107 13 -13 13 -28 19 -41 15 -40 -10 -57 -48 -75 -160 -10 -59 -32 -151 -49 -203 -33 -104 -66 -226 -97 -365 -11 -49 -27 -117 -35 -150 -8 -33 -33 -139 -55 -235 -22 -96 -53 -222 -70 -279 -16 -57 -30 -109 -30 -115 0 -6 -24 -87 -54 -181 -98 -307 -155 -498 -180 -607 -14 -59 -37 -135 -51 -168 -14 -34 -30 -91 -35 -128 -6 -37 -13 -82 -16 -100 -18 -96 88 -165 195 -127 52 18 172 20 416 5 94 -5 294 -15 445 -20 350 -14 574 -27 651 -39 39 -7 100 -7 168 -1 415 36 863 39 1115 9 177 -22 180 -22 235 -3 131 43 181 79 181 128 0 68 -115 532 -166 671 -46 123 -79 245 -109 395 -10 47 -33 128 -52 180 -19 52 -46 127 -59 165 -14 39 -40 135 -59 215 -33 146 -91 366 -101 381 -22 36 -107 310 -119 383 -18 114 -56 261 -78 303 -23 44 -37 50 -157 63 -58 6 -114 13 -125 14 -11 2 -47 0 -80 -4z m109 -96 c10 -4 16 -18 16 -38 0 -18 15 -95 34 -172 19 -76 46 -202 61 -279 14 -77 35 -172 45 -211 10 -40 21 -91 25 -115 l7 -44 -229 1 c-125 1 -282 5 -348 8 -66 4 -149 9 -185 11 l-65 3 -7 69 c-3 37 -6 201 -6 363 0 162 -3 307 -7 322 -8 32 -17 29 160 52 66 9 158 16 205 17 47 1 110 4 140 9 73 10 135 11 154 4z m164 -27 c14 -16 82 -290 82 -328 0 -30 14 -75 89 -287 56 -161 85 -263 131 -465 17 -76 47 -180 66 -230 55 -145 81 -233 108 -362 14 -66 59 -223 100 -350 71 -219 95 -310 130 -490 9 -44 19 -89 22 -101 4 -17 -2 -24 -38 -38 -78 -33 -89 -36 -118 -36 -23 0 -27 4 -23 19 3 11 -2 50 -11 88 -8 37 -19 122 -25 189 -10 126 -26 202 -66 319 -39 113 -83 284 -95 369 -19 126 -79 364 -165 651 -18 61 -45 160 -60 220 -15 61 -35 144 -45 185 -11 41 -30 136 -44 210 -13 75 -38 189 -54 255 -17 66 -33 137 -36 158 -6 34 -5 37 17 37 14 0 29 -6 35 -13z m-1035 -28 l117 -1 1 -91 c1 -51 3 -228 4 -394 l2 -303 -291 0 c-160 0 -362 -5 -449 -11 -87 -6 -160 -10 -162 -7 -9 9 18 152 46 239 16 52 36 132 45 179 8 47 27 119 40 160 14 41 38 112 52 157 l27 82 225 -5 c124 -2 278 -5 343 -5z m-696 -5 c25 -7 23 -14 -25 -135 -17 -42 -38 -115 -46 -162 -8 -47 -33 -149 -55 -227 -27 -92 -44 -178 -51 -250 -10 -106 -92 -543 -130 -690 -10 -41 -33 -165 -50 -275 -16 -110 -40 -249 -52 -310 -11 -60 -29 -159 -38 -220 -10 -60 -28 -154 -41 -207 l-24 -98 -49 0 c-27 0 -73 -7 -102 -16 -62 -20 -89 -14 -80 19 3 12 11 53 16 90 6 37 21 93 34 125 13 31 32 91 41 132 27 116 173 612 205 695 22 57 133 496 189 750 41 181 110 449 135 520 14 39 33 114 42 168 19 104 21 107 81 91z m1233 -893 c85 -5 238 -6 340 -4 144 3 189 1 201 -9 9 -7 23 -38 32 -68 9 -30 27 -91 40 -135 14 -44 28 -99 32 -122 l7 -43 -374 -1 c-205 0 -402 -2 -438 -4 -36 -2 -329 -6 -652 -9 -487 -5 -588 -4 -588 7 0 8 11 70 25 138 14 68 30 149 36 180 l11 56 86 8 c48 4 282 9 521 11 239 2 436 6 438 8 2 2 32 1 66 -1 34 -2 132 -8 217 -12z m717 -603 c18 -73 37 -169 43 -213 11 -79 29 -147 95 -360 46 -149 54 -187 65 -324 5 -65 16 -147 24 -182 9 -35 14 -64 13 -65 -1 -1 -56 5 -122 13 -94 12 -184 14 -420 9 -165 -3 -356 -10 -425 -15 -69 -5 -164 -12 -211 -15 l-87 -5 -8 177 c-4 104 -3 301 4 477 11 281 5 527 -14 593 -3 12 -5 23 -3 24 2 1 204 4 449 7 245 3 472 7 505 9 l61 3 31 -133z m-1143 96 c18 -47 27 -247 21 -469 -8 -300 -8 -609 -1 -698 l5 -68 -152 6 c-84 3 -183 10 -222 15 -38 5 -191 12 -340 15 -409 10 -525 18 -525 39 0 6 11 56 25 111 14 55 25 112 25 127 0 16 15 108 34 205 19 98 49 268 66 378 17 110 39 232 49 270 l17 70 160 5 c87 3 310 6 495 8 314 3 337 2 343 -14z" />
        </G>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  skipText: { color: L.gold, fontSize: 14, fontWeight: '800' },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { alignItems: 'center', marginBottom: spacing.lg },
  title: { color: L.navy, fontSize: 30, fontWeight: '900', lineHeight: 36, textAlign: 'center' },
  subtitle: { color: '#39415A', fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: spacing.xs, maxWidth: 260 },
  radiusViz: {
    width: 260,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: 0,
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(212,196,166,0.45)', borderRadius: 999 },
  pulseRing: { position: 'absolute', borderWidth: 1.4, borderColor: L.gold },
  ringOuter: { width: 220, height: 220 },
  ringMid: { width: 172, height: 172 },
  ringInner: { width: 126, height: 126 },
  spoke: { position: 'absolute', width: 1, height: 110, backgroundColor: 'rgba(212,196,166,0.16)' },
  spokeA: { transform: [{ rotate: '90deg' }] },
  spokeB: { transform: [{ rotate: '210deg' }] },
  spokeC: { transform: [{ rotate: '330deg' }] },
  callout: {
    position: 'absolute', top: 6,
    backgroundColor: L.white,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  calloutText: { color: L.navy, fontSize: 15, fontWeight: '900' },
  calloutTip: {
    position: 'absolute', bottom: -8, alignSelf: 'center',
    width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: L.white,
  },
  courtCore: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_BG,
    zIndex: 2,
  },
  coreHalo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(211,169,67,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(211,169,67,0.22)',
  },
  courtIconWrap: { alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  sliderArea: { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 8, marginTop: -42, zIndex: 3 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.2, borderColor: '#D8DEEA',
  },
  sliderWrap: { flex: 1, height: 34, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 999, backgroundColor: '#D6D1C7' },
  sliderFill: { position: 'absolute', left: 0, height: 4, borderRadius: 999, backgroundColor: L.gold },
  sliderKnob: {
    position: 'absolute', width: 16, height: 16, marginLeft: -8,
    borderRadius: 8, backgroundColor: L.gold,
  },
  tickRow: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tickHit: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  tickActive: { backgroundColor: L.gold },
  labelsRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 3, marginTop: 2 },
  radiusLabel: { color: L.navy, fontSize: 12, fontWeight: '700' },
  radiusLabelActive: { color: L.gold, fontWeight: '900' },
  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: SCREEN_BG, gap: spacing.md,
  },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 22,
    paddingHorizontal: spacing.xxxl, paddingVertical: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 5,
  },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: '#E8E3D9', justifyContent: 'center' },
  progressFill: { position: 'absolute', left: 0, width: '54%', height: 8, borderRadius: 999, backgroundColor: L.gold },
  progressKnob: {
    position: 'absolute', left: '54%', width: 34, height: 34, marginLeft: -17,
    borderRadius: 17, backgroundColor: L.gold, borderWidth: 2, borderColor: '#F4E6BC',
    alignItems: 'center', justifyContent: 'center',
  },
  progressKnobText: { color: L.white, fontSize: 13, fontWeight: '900', letterSpacing: -1 },
});