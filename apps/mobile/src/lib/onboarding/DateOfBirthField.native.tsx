import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import type { DateOfBirthFieldProps } from './DateOfBirthField.types';

const L = colors;

const DEFAULT_DATE = new Date(new Date().getFullYear() - 25, 0, 1);

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function DateOfBirthField({ value, onChange, maxDate }: DateOfBirthFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tempDate, setTempDate] = useState(value ? new Date(value) : DEFAULT_DATE);

  return (
    <View>
      <TouchableOpacity style={s.field} activeOpacity={0.8} onPress={() => setPickerOpen(v => !v)}>
        <Ionicons name="calendar-outline" size={18} color={L.textSub} />
        <Text style={[s.fieldText, !value && s.fieldPlaceholder]}>
          {value ? fmtDate(new Date(value)) : 'MM / DD / YYYY'}
        </Text>
        <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={L.textSub} />
      </TouchableOpacity>

      {pickerOpen && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="spinner"
          maximumDate={maxDate ?? new Date()}
          textColor={L.navy}
          onChange={(_, d) => {
            if (d) {
              setTempDate(d);
              onChange(toISODate(d));
            }
          }}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    paddingHorizontal: spacing.lg, paddingVertical: 14, backgroundColor: L.bg,
  },
  fieldText: { flex: 1, fontSize: text.body.size, color: L.text, fontWeight: '500' },
  fieldPlaceholder: { color: L.textSub, fontWeight: '400' },
});
