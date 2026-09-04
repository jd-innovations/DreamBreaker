import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppIcon, type AppIconName } from '@/components/AppIcon';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import type { ParConfidenceBand } from '@/lib/supabase/par';

// Exported so sibling elements (e.g. the profile avatar) can be sized to match.
export const PAR_GAUGE_SIZE = 116;
const SIZE = PAR_GAUGE_SIZE;
const STROKE = 9;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// PAR v1 scale per docs/PAR_RATING_SPEC.md: 1.0 (min) to 6.0 (max).
const PAR_MIN = 1.0;
const PAR_MAX = 6.0;

const PAR_TOOLTIP =
  'PAR (Performance Adjusted Rating) is your 1.0–6.0 skill score, calculated from your logged game results. It sharpens as you log more games.';

// Confidence band → directional chart glyph shown under the score.
const CONFIDENCE_TREND: Record<ParConfidenceBand, { icon: AppIconName; color: string }> = {
  low:    { icon: 'trending-down', color: colors.danger },
  medium: { icon: 'trending-up',   color: colors.gold },
  high:   { icon: 'trending-up',   color: colors.success },
};

export function ParGauge({
  score,
  stageLabel,
  confidenceLabel,
  confidenceBand,
}: {
  score: number | null;
  stageLabel: string;
  confidenceLabel?: string;
  confidenceBand?: ParConfidenceBand | null;
}) {
  const [tipVisible, setTipVisible] = useState(false);
  const pct = typeof score === 'number' ? Math.min(1, Math.max(0, (score - PAR_MIN) / (PAR_MAX - PAR_MIN))) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const trend = confidenceBand ? CONFIDENCE_TREND[confidenceBand] : null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.infoBtn}
        onPress={() => setTipVisible((v) => !v)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="What is PAR?"
      >
        <AppIcon name="information-circle-outline" size={18} color={colors.playerCredentialMuted} />
      </TouchableOpacity>

      {tipVisible ? (
        <>
          {/* Tap-away layer so the bubble dismisses on any outside press. */}
          <Pressable style={styles.tipBackdrop} onPress={() => setTipVisible(false)} />
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>{PAR_TOOLTIP}</Text>
          </View>
        </>
      ) : null}

      <View style={[styles.ringBox, { width: SIZE, height: SIZE }]}>
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.goldBg}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={colors.gold}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation="-90"
            originX={SIZE / 2}
            originY={SIZE / 2}
          />
        </Svg>
        <View style={styles.centerText}>
          <Text style={styles.yourPar}>Your PAR</Text>
          <Text style={styles.score}>{typeof score === 'number' ? score.toFixed(2) : 'Pending'}</Text>
          {trend ? (
            <AppIcon name={trend.icon} size={16} color={trend.color} style={styles.trendIcon} />
          ) : (
            <Text style={styles.estimated}>{confidenceLabel ?? 'PAR'}</Text>
          )}
        </View>
      </View>
      <Text style={styles.stageLabel} numberOfLines={1}>{stageLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 20,
  },
  tipBackdrop: {
    position: 'absolute',
    top: -400,
    bottom: -400,
    left: -400,
    right: -400,
    zIndex: 15,
  },
  tooltip: {
    position: 'absolute',
    top: 24,
    right: 0,
    width: 200,
    backgroundColor: colors.playerDarkBg,
    borderRadius: shape.panel,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    zIndex: 25,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 10,
  },
  tooltipText: {
    color: colors.white,
    fontSize: text.caption.size,
    lineHeight: 16,
    fontWeight: '500',
  },
  ringBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    alignItems: 'center',
  },
  yourPar: {
    color: colors.playerCredentialMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  score: {
    color: colors.playerCredentialText,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  trendIcon: {
    marginTop: 1,
  },
  estimated: {
    color: colors.playerCredentialMuted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stageLabel: {
    color: colors.playerCredentialText,
    fontSize: text.rowTitle.size, fontWeight: '700',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
