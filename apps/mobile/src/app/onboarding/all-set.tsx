import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';
import { AppIcon, type AppIconName } from '@/components';
import { useOnboarding } from '@/lib/onboarding/state';
import { finalizeOnboarding } from '@/lib/onboarding/finalize';
import { haptics } from '@/lib/haptics';

const L = colors;
const PAGE_BG = '#F8F5EF';
const NEON_PICKLE = '#B9FF00';

const CHECKLIST = ['Profile created', 'Preferences saved', 'Home court set'];

const INFO_ROWS: { icon: AppIconName; label: string }[] = [
  { icon: 'people-outline', label: 'Show you compatible players you will enjoy playing with' },
  { icon: 'search-outline', label: 'Find games and partners when you are available' },
  { icon: 'link-outline', label: 'Connect you with your local pickleball community' },
  { icon: 'trophy-outline', label: 'Suggest tournaments and events you will love' },
];

type CelebrationParticle = {
  id: string;
  kind: 'ball' | 'confetti' | 'icon';
  icon?: AppIconName;
  x: number;
  y: number;
  burstX: number;
  burstY: number;
  settleX: number;
  settleY: number;
  rotate: number;
  size: number;
  color: string;
  delay: number;
};

const PARTICLES: CelebrationParticle[] = [
  { id: 'ball-1', kind: 'ball', x: -8, y: -20, burstX: -118, burstY: -68, settleX: -168, settleY: 330, rotate: 320, size: 21, color: NEON_PICKLE, delay: 0 },
  { id: 'ball-2', kind: 'ball', x: -8, y: -20, burstX: 108, burstY: -72, settleX: 150, settleY: 322, rotate: -280, size: 17, color: NEON_PICKLE, delay: 70 },
  { id: 'ball-3', kind: 'ball', x: -8, y: -20, burstX: -54, burstY: -112, settleX: -82, settleY: 360, rotate: 420, size: 15, color: NEON_PICKLE, delay: 130 },
  { id: 'ball-4', kind: 'ball', x: -8, y: -20, burstX: 42, burstY: -118, settleX: 88, settleY: 365, rotate: -390, size: 19, color: NEON_PICKLE, delay: 190 },
  { id: 'pin', kind: 'icon', icon: 'location-outline', x: -11, y: -20, burstX: -146, burstY: 12, settleX: -188, settleY: 318, rotate: -18, size: 24, color: L.gold, delay: 120 },
  { id: 'court', kind: 'icon', icon: 'grid-outline', x: -11, y: -20, burstX: 142, burstY: 8, settleX: 178, settleY: 310, rotate: 20, size: 24, color: L.gold, delay: 180 },
  { id: 'people', kind: 'icon', icon: 'people-outline', x: -11, y: -20, burstX: -92, burstY: 68, settleX: -138, settleY: 372, rotate: -16, size: 24, color: L.gold, delay: 250 },
  { id: 'calendar', kind: 'icon', icon: 'calendar-outline', x: -11, y: -20, burstX: 92, burstY: 72, settleX: 128, settleY: 380, rotate: 16, size: 23, color: L.gold, delay: 310 },
  { id: 'mini-trophy', kind: 'icon', icon: 'trophy-outline', x: -11, y: -20, burstX: 0, burstY: -150, settleX: 18, settleY: 292, rotate: 12, size: 25, color: L.gold, delay: 360 },
  { id: 'conf-1', kind: 'confetti', x: -6, y: -20, burstX: -176, burstY: -42, settleX: -214, settleY: 345, rotate: 520, size: 14, color: L.gold, delay: 0 },
  { id: 'conf-2', kind: 'confetti', x: -6, y: -20, burstX: 174, burstY: -36, settleX: 210, settleY: 336, rotate: -540, size: 12, color: '#36C768', delay: 40 },
  { id: 'conf-3', kind: 'confetti', x: -6, y: -20, burstX: -130, burstY: -116, settleX: -174, settleY: 274, rotate: -460, size: 13, color: '#F6C347', delay: 85 },
  { id: 'conf-4', kind: 'confetti', x: -6, y: -20, burstX: 126, burstY: -118, settleX: 168, settleY: 284, rotate: 470, size: 13, color: L.gold, delay: 120 },
  { id: 'conf-5', kind: 'confetti', x: -6, y: -20, burstX: -36, burstY: 100, settleX: -78, settleY: 410, rotate: 360, size: 11, color: '#36C768', delay: 165 },
  { id: 'conf-6', kind: 'confetti', x: -6, y: -20, burstX: 38, burstY: 102, settleX: 82, settleY: 416, rotate: -360, size: 11, color: '#F6C347', delay: 210 },
];

const CELEBRATION_PARTICLES: CelebrationParticle[] = PARTICLES.flatMap((particle, index) => {
  const variants = [
    { suffix: 'a', spread: 0, fall: 0, delay: 0, scale: 1 },
    { suffix: 'b', spread: particle.id.length % 2 === 0 ? -34 : 34, fall: 42, delay: 520, scale: 0.92 },
    { suffix: 'c', spread: particle.id.length % 3 === 0 ? 56 : -56, fall: 84, delay: 1040, scale: 0.82 },
  ];

  return variants.map(variant => ({
    ...particle,
    id: `${particle.id}-${variant.suffix}`,
    burstX: particle.burstX + variant.spread,
    settleX: particle.settleX + variant.spread * 1.35,
    settleY: particle.settleY + variant.fall,
    rotate: particle.rotate + variant.spread * 2,
    size: Math.max(8, Math.round(particle.size * variant.scale)),
    color: particle.kind === 'icon' ? L.gold : particle.color,
    delay: particle.delay + variant.delay + index * 8,
  }));
});
export default function AllSetScreen() {
  const insets = useSafeAreaInsets();
  const trophyPop = useRef(new Animated.Value(0)).current;
  const shade = useRef(new Animated.Value(0)).current;
  const particleValues = useRef(CELEBRATION_PARTICLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const timers = [
      setTimeout(() => { haptics.success(); }, 70),
      setTimeout(() => { haptics.light(); }, 260),
      setTimeout(() => { haptics.medium(); }, 560),
      setTimeout(() => { haptics.selection(); }, 1020),
    ];

    const shadeAnimation = Animated.sequence([
      Animated.timing(shade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(7400),
      Animated.timing(shade, {
        toValue: 0,
        duration: 900,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const trophyAnimation = Animated.spring(trophyPop, {
      toValue: 1,
      friction: 5,
      tension: 92,
      useNativeDriver: true,
    });

    const particleAnimations = CELEBRATION_PARTICLES.map((particle, index) => Animated.sequence([
      Animated.delay(particle.delay),
      Animated.timing(particleValues[index], {
        toValue: 1,
        duration: 9000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]));

    shadeAnimation.start();
    trophyAnimation.start();
    Animated.stagger(18, particleAnimations).start();

    return () => {
      timers.forEach(clearTimeout);
      trophyPop.stopAnimation();
      shade.stopAnimation();
      particleValues.forEach(value => value.stopAnimation());
    };
  }, [particleValues, shade, trophyPop]);

  const particles = useMemo(() => CELEBRATION_PARTICLES, []);
  const shadeOpacity = shade.interpolate({ inputRange: [0, 1], outputRange: [0, 0.58] });
  const trophyScale = trophyPop.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.82, 1.1, 1] });
  const trophyOpacity = trophyPop.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] });

  return (
    <View style={[s.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}> 
      <Animated.View pointerEvents="none" style={[s.celebrationShade, { opacity: shadeOpacity }]} />
      <CelebrationLayer particles={particles} values={particleValues} />

      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.trophyWrap}>
          <View style={[s.spark, s.sparkA]} />
          <View style={[s.spark, s.sparkB]} />
          <View style={[s.spark, s.sparkC]} />
          <View style={[s.spark, s.sparkD]} />
          <Animated.View style={[s.trophyCircle, { opacity: trophyOpacity, transform: [{ scale: trophyScale }] }]}> 
            <Ionicons name="trophy-outline" size={82} color={L.navy} />
          </Animated.View>
        </View>

        <View style={s.titleBlock}>
          <Text style={s.title}>{`You're all set!`}</Text>
          <Text style={s.subtitle}>We have saved your preferences and personalized your experience.</Text>
        </View>

        <View style={s.checklist}>
          {CHECKLIST.map(item => (
            <View key={item} style={s.checkRow}>
              <View style={s.checkDot}>
                <Ionicons name="checkmark" size={14} color={L.white} />
              </View>
              <Text style={s.checkText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>We use this information to:</Text>
          {INFO_ROWS.map(row => (
            <View key={row.label} style={s.infoRow}>
              <AppIcon name={row.icon} size={22} color={L.navy} />
              <Text style={s.infoText}>{row.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <FinalCTA />
    </View>
  );
}

function FinalCTA() {
  const { draft } = useOnboarding();
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (submitting) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1050, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1050, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, submitting]);

  function pressIn() {
    if (submitting) return;
    Animated.spring(scale, { toValue: 0.97, friction: 7, tension: 190, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 165, useNativeDriver: true }).start();
  }

  async function handlePress() {
    if (submitting) return;
    setSubmitting(true);
    const result = await finalizeOnboarding(draft);
    setSubmitting(false);

    if (!result.ok) {
      haptics.error();
      Alert.alert('Could not finish setup', result.error);
      return;
    }

    haptics.success();

    if (result.needsEmailConfirmation) {
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Open it, then come back and sign in to finish.',
        [{ text: 'Go to Sign In', onPress: () => router.replace('/sign-in') }],
      );
      return;
    }

    router.push('/onboarding/welcome-to-court');
  }

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.58] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.055] });

  return (
    <Animated.View style={[s.ctaWrap, { transform: [{ scale }] }]}>
      <Animated.View pointerEvents="none" style={[s.ctaGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
      <TouchableOpacity style={[s.cta, submitting && s.ctaDisabled]} activeOpacity={0.92} onPress={handlePress} onPressIn={pressIn} onPressOut={pressOut} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={L.navy} />
        ) : (
          <>
            <Text style={s.ctaText}>{`Let's Go!`}</Text>
            <Ionicons name="arrow-forward" size={21} color={L.navy} />
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function CelebrationLayer({ particles, values }: { particles: CelebrationParticle[]; values: Animated.Value[] }) {
  return (
    <View style={s.celebrationLayer} pointerEvents="none">
      {particles.map((particle, index) => {
        const progress = values[index];
        const translateX = progress.interpolate({ inputRange: [0, 0.14, 1], outputRange: [particle.x, particle.burstX, particle.settleX] });
        const translateY = progress.interpolate({ inputRange: [0, 0.14, 1], outputRange: [particle.y, particle.burstY, particle.settleY] });
        const scale = progress.interpolate({ inputRange: [0, 0.1, 0.22, 1], outputRange: [0.35, 1.1, 1, 0.82] });
        const opacity = progress.interpolate({ inputRange: [0, 0.04, 0.82, 1], outputRange: [0, 1, 1, 0] });
        const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${particle.rotate}deg`] });

        return (
          <Animated.View
            key={particle.id}
            style={[
              s.particle,
              {
                opacity,
                transform: [{ translateX }, { translateY }, { rotate }, { scale }],
              },
            ]}
          >
            <CelebrationPiece particle={particle} />
          </Animated.View>
        );
      })}
    </View>
  );
}

function CelebrationPiece({ particle }: { particle: CelebrationParticle }) {
  if (particle.kind === 'ball') return <PickleballBall size={particle.size} color={particle.color} />;
  if (particle.kind === 'icon' && particle.icon) {
    return (
      <View style={[s.iconParticle, { width: particle.size + 16, height: particle.size + 16, borderRadius: (particle.size + 16) / 2 }]}> 
        <AppIcon name={particle.icon} size={particle.size} color={particle.color} />
      </View>
    );
  }
  return <View style={[s.confettiPiece, { width: particle.size, backgroundColor: particle.color }]} />;
}

function PickleballBall({ size, color }: { size: number; color: string }) {
  const dotSize = Math.max(2, Math.round(size * 0.16));

  return (
    <View style={[s.ball, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}> 
      <View style={[s.ballDot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, left: size * 0.32, top: size * 0.28 }]} />
      <View style={[s.ballDot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, right: size * 0.28, top: size * 0.42 }]} />
      <View style={[s.ballDot, { width: dotSize, height: dotSize, borderRadius: dotSize / 2, left: size * 0.42, bottom: size * 0.25 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
    paddingHorizontal: spacing.lg,
  },
  celebrationShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#031225',
    zIndex: 4,
  },
  celebrationLayer: {
    position: 'absolute',
    top: 92,
    left: '50%',
    width: 1,
    height: 1,
    zIndex: 6,
    overflow: 'visible',
  },
  particle: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  confettiPiece: {
    height: 4,
    borderRadius: 2,
  },
  iconParticle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(211,169,67,0.32)',
  },
  ball: {
    borderWidth: 1,
    borderColor: '#6CCB00',
    shadowColor: NEON_PICKLE,
    shadowOpacity: 0.8,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  ballDot: {
    position: 'absolute',
    backgroundColor: 'rgba(1, 28, 46, 0.28)',
  },
  header: {
    height: 40,
    justifyContent: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xl,
  },
  trophyWrap: {
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  trophyCircle: {
    width: 114,
    height: 114,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    width: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: L.gold,
  },
  sparkA: { left: 96, top: 26, transform: [{ rotate: '24deg' }] },
  sparkB: { right: 92, top: 31, transform: [{ rotate: '-22deg' }] },
  sparkC: { left: 70, top: 70, transform: [{ rotate: '-38deg' }] },
  sparkD: { right: 71, top: 75, transform: [{ rotate: '38deg' }] },
  titleBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: L.navy,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: '#39415A',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 310,
  },
  checklist: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: L.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: L.navy,
    fontSize: 14,
    fontWeight: '800',
  },
  infoCard: {
    borderWidth: 1.5,
    borderColor: L.gold,
    borderRadius: radius.card,
    backgroundColor: '#FFF9E8',
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  infoTitle: {
    color: L.navy,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoText: {
    flex: 1,
    color: L.navy,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  ctaWrap: {
    position: 'relative',
  },
  ctaGlow: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 4,
    bottom: -7,
    borderRadius: radius.button,
    backgroundColor: L.gold,
    shadowColor: L.gold,
    shadowOpacity: 0.68,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  cta: {
    minHeight: 54,
    borderRadius: radius.button,
    backgroundColor: L.gold,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    shadowColor: L.gold,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  ctaText: {
    color: L.navy,
    fontSize: 16,
    fontWeight: '900',
  },
  ctaDisabled: {
    opacity: 0.78,
  },
});
