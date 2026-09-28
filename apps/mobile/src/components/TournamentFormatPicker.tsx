import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import {
  TOURNAMENT_FORMATS, MIN_POOLS, MAX_POOLS,
  type TournamentFormatKey,
} from '@/lib/tournamentFormats';

/**
 * Tournament structure picker, mirroring web's Create Tournament "Tournament
 * Structure" grid (same five options, same stored keys) plus the pool count
 * for Pool → Bracket. Used by Create and Edit Tournament.
 */
export function TournamentFormatPicker({
  value,
  onChange,
  poolCount,
  onPoolCountChange,
}: {
  value: TournamentFormatKey;
  onChange: (v: TournamentFormatKey) => void;
  poolCount: number;
  onPoolCountChange: (n: number) => void;
}) {
  return (
    <View>
      <View style={st.grid}>
        {TOURNAMENT_FORMATS.map(f => {
          const active = value === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[st.option, active && st.optionActive]}
              onPress={() => onChange(f.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <View style={st.optionHead}>
                <Text style={[st.label, active && st.labelActive]}>{f.label}</Text>
                {active && <Ionicons name="checkmark-circle" size={16} color={colors.gold} />}
              </View>
              <Text style={[st.desc, active && st.descActive]}>{f.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {value === 'pool_bracket' && (
        <View style={st.poolRow}>
          <Text style={st.poolLabel}>Number of pools</Text>
          <View style={st.stepper}>
            <TouchableOpacity
              style={[st.stepBtn, poolCount <= MIN_POOLS && { opacity: 0.4 }]}
              onPress={() => onPoolCountChange(Math.max(MIN_POOLS, poolCount - 1))}
              disabled={poolCount <= MIN_POOLS}
              accessibilityLabel="Fewer pools"
            >
              <Ionicons name="remove" size={18} color={colors.navy} />
            </TouchableOpacity>
            <Text style={st.poolValue}>{poolCount}</Text>
            <TouchableOpacity
              style={[st.stepBtn, poolCount >= MAX_POOLS && { opacity: 0.4 }]}
              onPress={() => onPoolCountChange(Math.min(MAX_POOLS, poolCount + 1))}
              disabled={poolCount >= MAX_POOLS}
              accessibilityLabel="More pools"
            >
              <Ionicons name="add" size={18} color={colors.navy} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    width: '48%', flexGrow: 1, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: shape.cta, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  optionActive: { borderColor: colors.navy, backgroundColor: colors.navy },
  optionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  label: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '800' },
  labelActive: { color: colors.white },
  desc: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 2 },
  descActive: { color: 'rgba(255,255,255,0.75)' },
  poolRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: shape.cta, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  poolLabel: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  poolValue: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '900', minWidth: 20, textAlign: 'center' },
});
