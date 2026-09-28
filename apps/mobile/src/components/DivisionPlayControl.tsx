import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { setDivisionPlayStatus, type DivisionPlayStatus } from '@/lib/supabase/divisions';

export type DivisionPlayState = DivisionPlayStatus | 'complete';

export const PLAY_STATE_LABEL: Record<DivisionPlayState, string> = {
  not_started: 'Not started',
  live:        'Live',
  paused:      'Paused',
  complete:    'Complete',
};

const TONE: Record<DivisionPlayState, { bg: string; fg: string; border: string }> = {
  not_started: { bg: colors.page,       fg: colors.textSub, border: colors.border },
  live:        { bg: colors.successBg,  fg: colors.success, border: colors.success },
  paused:      { bg: colors.goldBg,     fg: colors.gold,    border: colors.goldBorder },
  complete:    { bg: colors.navy,       fg: colors.white,   border: colors.navy },
};

/** "Complete" isn't stored: it's the stored status overridden by a finished bracket. */
export function playState(status: DivisionPlayStatus | undefined, bracketComplete: boolean): DivisionPlayState {
  if (bracketComplete) return 'complete';
  return status ?? 'not_started';
}

export function DivisionPlayChip({ state }: { state: DivisionPlayState }) {
  const t = TONE[state];
  return (
    <View style={[st.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      {state === 'live' && <View style={[st.dot, { backgroundColor: t.fg }]} />}
      <Text style={[st.chipText, { color: t.fg }]}>{PLAY_STATE_LABEL[state].toUpperCase()}</Text>
    </View>
  );
}

/**
 * Start / Pause / Resume for one division (20260928180000). Only live
 * divisions get courts. Going live fills free courts at once; pausing never
 * takes anyone off a court.
 */
export function DivisionPlayControl({
  divisionId,
  state,
  onChanged,
  compact = false,
}: {
  divisionId: string;
  state: DivisionPlayState;
  onChanged: (status: DivisionPlayStatus) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (state === 'complete') return null;

  const next: DivisionPlayStatus = state === 'live' ? 'paused' : 'live';
  const label = state === 'live' ? 'Pause' : state === 'paused' ? 'Resume' : 'Start';
  const icon = state === 'live' ? 'pause' : 'play';

  async function apply() {
    setBusy(true);
    const result = await setDivisionPlayStatus(divisionId, next);
    setBusy(false);
    if (!result.ok) {
      Alert.alert('Status not changed', result.error);
      return;
    }
    onChanged(next);
  }

  function press() {
    if (next === 'paused') {
      Alert.alert(
        'Pause this division?',
        'Matches already on court keep playing. The division gets no new courts until you resume it.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Pause', onPress: () => { void apply(); } }],
      );
    } else {
      void apply();
    }
  }

  return (
    <TouchableOpacity
      style={[st.btn, state === 'live' ? st.btnPause : st.btnStart, compact && st.btnCompact]}
      onPress={press}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${label} division`}
    >
      {busy
        ? <ActivityIndicator size="small" color={state === 'live' ? colors.navy : colors.white} />
        : (
          <>
            <Ionicons name={icon} size={compact ? 12 : 14} color={state === 'live' ? colors.navy : colors.white} />
            <Text style={[st.btnText, state === 'live' && { color: colors.navy }]}>{label}</Text>
          </>
        )}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: shape.pill, borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: shape.cta, minWidth: 84,
  },
  btnCompact: { paddingHorizontal: 10, paddingVertical: 6, minWidth: 0 },
  btnStart: { backgroundColor: colors.success },
  btnPause: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.white, fontSize: text.action.size, fontWeight: '800' },
});
