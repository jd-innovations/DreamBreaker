import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { AMENITY_CATALOG, MAX_AMENITIES } from '@/lib/tournamentAmenities';

// Lets a director pick up to three amenity chips for the detail strip.
//
// Shared by the create wizard and the edit screen so the two cannot drift into
// offering different chips — the catalog is one list, and this is the one way
// to choose from it.

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

export default function AmenityPicker({ value, onChange }: Props) {
  const atLimit = value.length >= MAX_AMENITIES;

  const toggle = (key: string) => {
    if (value.includes(key)) {
      onChange(value.filter(k => k !== key));
      return;
    }
    // Silently ignoring the tap at the limit reads as a broken button, so the
    // full chips are visibly dimmed and the counter explains why.
    if (atLimit) return;
    onChange([...value, key]);
  };

  return (
    <View>
      <View style={s.labelRow}>
        <Text style={s.label}>
          Amenities <Text style={s.optional}>(optional)</Text>
        </Text>
        <Text style={[s.counter, atLimit && s.counterFull]}>
          {value.length} / {MAX_AMENITIES}
        </Text>
      </View>
      <Text style={s.hint}>
        Pick up to {MAX_AMENITIES} to show on your tournament page. Only choose
        what your event actually offers.
      </Text>

      <View style={s.grid}>
        {AMENITY_CATALOG.map(a => {
          const selected = value.includes(a.key);
          const dimmed = atLimit && !selected;
          return (
            <TouchableOpacity
              key={a.key}
              style={[s.chip, selected && s.chipOn, dimmed && s.chipDim]}
              activeOpacity={0.8}
              onPress={() => toggle(a.key)}
              disabled={dimmed}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: dimmed }}
              accessibilityLabel={`${a.title}, ${a.sub}`}
            >
              <Ionicons
                name={a.icon}
                size={15}
                color={selected ? colors.navy : dimmed ? colors.textSub : colors.gold}
              />
              <Text style={[s.chipText, selected && s.chipTextOn, dimmed && s.chipTextDim]}>
                {a.title}
              </Text>
              {selected && <Ionicons name="checkmark" size={14} color={colors.navy} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.navy, fontSize: text.controlLabel.size, fontWeight: '700' },
  optional: { color: colors.textSub, fontWeight: '400' },
  counter: { color: colors.textSub, fontSize: text.chipValue.size, fontWeight: '800' },
  counterFull: { color: colors.gold },
  hint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 17, marginTop: 2, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: shape.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  chipDim: { opacity: 0.45 },
  chipText: { color: colors.text, fontSize: text.controlLabel.size, fontWeight: '700' },
  chipTextOn: { color: colors.navy, fontWeight: '800' },
  chipTextDim: { color: colors.textSub },
});
