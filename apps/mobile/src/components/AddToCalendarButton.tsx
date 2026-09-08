import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { addToCalendar } from '@/lib/calendarEvents';
import type { CalendarEventInput, AddToCalendarResult } from '@/lib/calendarEvents';
import { SecondaryButton } from './SecondaryButton';

type LocalState = 'idle' | 'working' | 'added';

export type AddToCalendarButtonProps = {
  event: CalendarEventInput;
  /** 'button' (default) = SecondaryButton-style, for confirmation/detail cards.
   *  'icon' = circular icon-only, for hero action rows (e.g. alongside Share). */
  variant?: 'button' | 'icon';
  style?: ViewStyle;
  /** Icon tint for the 'icon' variant only (e.g. white over a dark hero photo). */
  iconColor?: string;
  onResult?: (result: AddToCalendarResult) => void;
};

/**
 * Reusable "Add to Calendar" CTA. Owns its own press/loading/result state and
 * haptics -- callers only supply a normalized CalendarEventInput built from
 * their own domain data. See apps/mobile/src/lib/calendarEvents.ts for the
 * platform dispatch this wraps.
 */
export function AddToCalendarButton({
  event, variant = 'button', style, iconColor, onResult,
}: AddToCalendarButtonProps) {
  const [state, setState] = useState<LocalState>('idle');

  // expo-calendar has no web implementation -- hide the CTA outright rather
  // than showing a button that can only ever no-op (Phase 6 Step 19).
  if (Platform.OS === 'web') return null;

  async function handlePress() {
    if (state === 'working') return;
    setState('working');
    const result = await addToCalendar(event);
    onResult?.(result);

    if (result.outcome === 'saved') {
      haptics.success();
      setState('added');
      return;
    }
    if (result.outcome === 'error') {
      haptics.error();
      setState('idle');
      return;
    }
    // 'canceled' (user backed out of the native editor -- not an error) or
    // 'unknown' (Android can't report whether the event was actually saved).
    // Neither is a confirmed success, so no success haptic and no "Added"
    // state gets shown for either.
    setState('idle');
  }

  const label = state === 'added' ? 'Added to Calendar'
    : state === 'working' ? 'Opening Calendar…'
      : 'Add to Calendar';
  const icon = state === 'added' ? 'checkmark-circle' : 'calendar-outline';

  if (variant === 'icon') {
    return (
      <TouchableOpacity
        style={[s.iconBtn, style]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={state === 'working'}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={20} color={iconColor ?? colors.navy} />
      </TouchableOpacity>
    );
  }

  return (
    <SecondaryButton
      label={label}
      icon={icon}
      onPress={handlePress}
      disabled={state === 'working'}
      style={style}
    />
  );
}

const s = StyleSheet.create({
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});

export default AddToCalendarButton;
