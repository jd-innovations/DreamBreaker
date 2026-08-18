import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing, radius, typography } from '@/theme';
import { AppIcon, type AppIconName } from '@/components';
import { haptics } from '@/lib/haptics';

const L = colors;

function fireOnboardingSelection() {
  haptics.selection();
}

// The primary onboarding CTA gets a slightly weightier tap than the selection
// tick used for options/back/skip -- haptics.light() is the centralized
// equivalent of the ImpactFeedbackStyle.Light this used before the Phase 3
// haptics migration.
function fireOnboardingImpact() {
  haptics.light();
}

/**
 * The onboarding selection tick, for screens that build their own option rows
 * instead of using OptionRow/OptionChip (gender.tsx's radio cards,
 * self-rating.tsx's chips, select-home-court.tsx's court cards). Use this
 * rather than calling `haptics` directly so every onboarding selection feels
 * identical.
 *
 * `alreadySelected` encodes the same rule the shared components follow: tapping
 * the option that's already chosen changes nothing, so it stays silent -- only
 * a move to a *different* option buzzes.
 */
export function selectWithHaptic(alreadySelected: boolean, apply: () => void) {
  if (!alreadySelected) fireOnboardingSelection();
  apply();
}

/**
 * The same tick, for controls where "already selected" doesn't apply because
 * every interaction changes the value (search-radius.tsx's +/- stepper).
 */
export function onboardingSelectionHaptic() {
  fireOnboardingSelection();
}

// Total numbered steps shown as progress dots — screens 2 (Create Account)
// through 12 (What Brings You Here). Screens 1, 13, 14 render their own layout.
export const ONBOARDING_STEP_COUNT = 11;

// ─── Screen shell: back chevron + progress dots + scrollable body + footer ───

export function OnboardingScreen({
  step,
  onBack,
  children,
  footer,
  scroll = true,
}: {
  step?: number; // 1-indexed within ONBOARDING_STEP_COUNT; omit to hide the dots
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  const bodyProps = scroll
    ? { contentContainerStyle: [s.scrollContent, { paddingBottom: insets.bottom + 24 }], showsVerticalScrollIndicator: false }
    : { style: [s.scrollContent, { flex: 1, paddingBottom: insets.bottom + 24 }] };

  function handleBack() {
    fireOnboardingSelection();
    (onBack ?? (() => router.back()))();
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        {step != null && (
          <View style={s.dots}>
            {Array.from({ length: ONBOARDING_STEP_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[s.dot, i < step ? s.dotDone : i === step - 1 ? s.dotActive : s.dotUpcoming]}
              />
            ))}
          </View>
        )}
      </View>

      <Body {...bodyProps}>{children}</Body>

      {footer && <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>}
    </View>
  );
}

// ─── Primary CTA — gold, matches existing join/continue buttons app-wide ─────

export function OnboardingCTA({
  label, onPress, disabled, icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const glow = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (disabled) {
      glow.stopAnimation();
      glow.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, glow]);

  function pressIn() {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.975, friction: 7, tension: 180, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }).start();
  }

  function handlePress() {
    if (disabled) return;
    fireOnboardingImpact();
    onPress();
  }

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.04] });

  return (
    <Animated.View style={[s.ctaWrap, { transform: [{ scale }] }]}>
      {!disabled && <Animated.View pointerEvents="none" style={[s.ctaGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />}
      <TouchableOpacity
        style={[s.cta, disabled && s.ctaDisabled]}
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        activeOpacity={0.92}
      >
        {icon && <Ionicons name={icon} size={18} color={L.navy} />}
        <Text style={s.ctaText}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
export function OnboardingSkipLink({ label, onPress }: { label: string; onPress: () => void }) {
  function handlePress() {
    fireOnboardingSelection();
    onPress();
  }

  return (
    <TouchableOpacity style={s.skipLink} onPress={handlePress} activeOpacity={0.7}>
      <Text style={s.skipText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Single-select row (radio-style — Self Rating, Gender) ───────────────────

export function OptionRow({
  label, sub, icon, selected, onPress,
}: {
  label: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  function handlePress() {
    // Single-select: re-tapping the row that's already chosen changes nothing,
    // so it shouldn't buzz. Only a move to a *different* option is feedback
    // worth giving.
    if (!selected) fireOnboardingSelection();
    onPress();
  }

  return (
    <TouchableOpacity
      style={[s.row, selected && s.rowSelected]}
      onPress={handlePress}
      activeOpacity={0.75}
    >
      {icon && (
        <View style={[s.rowIconWrap, selected && s.rowIconWrapSelected]}>
          <Ionicons name={icon} size={18} color={selected ? L.navy : L.textSub} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, selected && s.rowLabelSelected]}>{label}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {selected && <Ionicons name="checkmark-circle" size={22} color={L.gold} />}
    </TouchableOpacity>
  );
}

// ─── Multi-select chip (Playing Style, Availability, Brings You Here) ────────

export function OptionChip({
  label, icon, selected, onPress, disabled,
}: {
  label: string;
  icon?: AppIconName;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  function handlePress() {
    if (disabled && !selected) return;
    // Multi-select: both directions genuinely change the selection (adding a
    // tag and removing one), so both buzz -- unlike the single-select row above.
    fireOnboardingSelection();
    onPress();
  }

  return (
    <TouchableOpacity
      style={[s.chip, selected && s.chipSelected, disabled && !selected && s.chipDisabled]}
      onPress={handlePress}
      activeOpacity={0.75}
      disabled={disabled && !selected}
    >
      {icon && <AppIcon name={icon} size={16} color={selected ? L.navy : L.textSub} />}
      <Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text>
      {selected && <Ionicons name="checkmark" size={14} color={L.navy} />}
    </TouchableOpacity>
  );
}

export function ScreenTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginBottom: spacing.xxl }}>
      <Text style={s.title}>{title}</Text>
      {sub && <Text style={s.sub}>{sub}</Text>}
    </View>
  );
}


export function OnboardingProgressBar({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(100, progress));
  const animatedProgress = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: clamped,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, clamped]);

  const pct = animatedProgress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  return (
    <View style={s.progressCard}>
      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, { width: pct }]} />
        <Animated.View style={[s.progressMarker, { left: pct }]}> 
          <Ionicons name="arrow-forward" size={24} color={L.gold} />
        </Animated.View>
      </View>
    </View>
  );
}


export function OnboardingEntrance({
  children,
  delay = 0,
  distance = 18,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(distance)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}> 
      {children}
    </Animated.View>
  );
}

export function OnboardingPressableCard({
  children,
  selected,
  disabled,
  style,
  selectedStyle,
  disabledStyle,
  onPress,
}: {
  children: React.ReactNode;
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  selectedStyle?: StyleProp<ViewStyle>;
  disabledStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!selected) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.025, duration: 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [scale, selected]);

  function pressIn() {
    if (disabled) return;
    Animated.timing(scale, { toValue: 0.985, duration: 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }).start();
  }

  function handlePress() {
    if (disabled) return;
    // `selected` is optional here: undefined means this card isn't part of a
    // selection group (a plain pressable), so it still buzzes. When it *is* a
    // selection and already chosen, re-tapping is a no-op -- stay silent.
    if (!selected) fireOnboardingSelection();
    onPress();
  }

  return (
    <TouchableOpacity activeOpacity={1} onPress={handlePress} disabled={disabled} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, selected && selectedStyle, disabled && disabledStyle, { transform: [{ scale }] }]}> 
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  dotDone: { backgroundColor: L.gold },
  dotActive: { backgroundColor: L.gold },
  dotUpcoming: { backgroundColor: L.border },

  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  title: { ...typography.pageTitle, fontSize: 24, color: L.navy, marginBottom: spacing.xs },
  sub: { ...typography.body, color: L.textSub, lineHeight: 21 },

  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: L.border, backgroundColor: L.bg, gap: spacing.sm,
  },

  ctaWrap: {
    position: 'relative',
  },
  ctaGlow: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 4,
    bottom: -6,
    borderRadius: radius.button,
    backgroundColor: L.gold,
    shadowColor: L.gold,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: L.gold, borderRadius: radius.button, paddingVertical: 15,
    shadowColor: L.gold, shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  ctaDisabled: { backgroundColor: L.border },
  ctaText: { color: L.navy, fontSize: 16, fontWeight: '800' },

  skipLink: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: L.gold, fontSize: 14, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.card,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: L.bg,
  },
  rowSelected: { borderColor: L.gold, backgroundColor: L.goldLight },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: radius.sm, backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconWrapSelected: { backgroundColor: L.goldBg },
  rowLabel: { fontSize: 15, fontWeight: '700', color: L.navy },
  rowLabelSelected: { color: L.navy },
  rowSub: { fontSize: 12, color: L.textSub, marginTop: 2 },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: L.border, borderRadius: radius.chip,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: L.bg,
  },
  chipSelected: { borderColor: L.gold, backgroundColor: L.goldLight },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontSize: 13, fontWeight: '700', color: L.textSub },
  chipTextSelected: { color: L.navy },
  progressCard: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E8E3D9',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 999,
    backgroundColor: L.gold,
  },
  progressMarker: {
    position: 'absolute',
    width: 46,
    height: 46,
    marginLeft: -23,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderWidth: 2,
    borderColor: '#F4E6BC',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
