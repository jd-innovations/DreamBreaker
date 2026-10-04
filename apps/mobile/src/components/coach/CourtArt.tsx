import React from 'react';
import Svg, { Line, Polygon, Circle } from 'react-native-svg';
import { colors } from '@/theme';
import { lessonTypeTint, LESSON_TYPE_TINT_FALLBACK } from '@shared/tokens';

// The drawn court behind a lesson without a photo (2026-10-04), shared by the
// Lesson Marketplace card and the lesson page so both draw the same thing.

/** The header tint for a lesson type (lessonTypeTint), navy for anything unknown. */
export function lessonTint(offerType: string): string {
  return (lessonTypeTint as Record<string, string>)[offerType] ?? LESSON_TYPE_TINT_FALLBACK;
}

export function CourtArt({ tint }: { tint: string }) {
  // A court seen at a slight angle; lines in translucent white over the tint.
  const line = { stroke: 'rgba(255,255,255,0.32)', strokeWidth: 3 };
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice">
      <Polygon points="0,0 400,0 400,150 0,150" fill={tint} />
      <Polygon points="40,18 372,0 388,152 52,170" fill="none" {...line} />
      <Line x1="206" y1="9" x2="220" y2="161" {...line} />
      <Line x1="46" y1="72" x2="380" y2="52" {...line} />
      <Line x1="49" y1="116" x2="384" y2="98" stroke="rgba(255,255,255,0.55)" strokeWidth={4} />
      <Circle cx="340" cy="34" r="16" fill={colors.gold} />
    </Svg>
  );
}
