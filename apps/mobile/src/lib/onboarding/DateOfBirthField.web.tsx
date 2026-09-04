import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import type { DateOfBirthFieldProps } from './DateOfBirthField.types';

// @react-native-community/datetimepicker has no web implementation (no
// .web.* files at all) — the native spinner silently does nothing on web.
// This is a plain three-field MM/DD/YYYY entry as the web equivalent.
const L = colors;

function pad2(n: string): string {
  return n.padStart(2, '0');
}

export function DateOfBirthField({ value, onChange, maxDate }: DateOfBirthFieldProps) {
  const parsed = value ? value.split('-') : null; // [yyyy, mm, dd]
  const [month, setMonth] = useState(parsed ? parsed[1] : '');
  const [day, setDay]     = useState(parsed ? parsed[2] : '');
  const [year, setYear]   = useState(parsed ? parsed[0] : '');
  const [error, setError] = useState<string | null>(null);

  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  function commit(m: string, d: string, y: string) {
    if (m.length !== 2 || d.length !== 2 || y.length !== 4) return;
    const mNum = Number(m), dNum = Number(d), yNum = Number(y);
    const candidate = new Date(yNum, mNum - 1, dNum);
    const valid =
      mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31 &&
      candidate.getMonth() === mNum - 1 && // catches e.g. Feb 31 rolling over
      candidate <= (maxDate ?? new Date());

    if (!valid) {
      setError('Enter a valid date.');
      return;
    }
    setError(null);
    onChange(`${y}-${pad2(m)}-${pad2(d)}`);
  }

  return (
    <View>
      <View style={s.row}>
        <View style={[s.field, s.fieldSmall]}>
          <TextInput
            style={s.input}
            placeholder="MM"
            placeholderTextColor={L.textSub}
            value={month}
            onChangeText={v => {
              const digits = v.replace(/\D/g, '').slice(0, 2);
              setMonth(digits);
              if (digits.length === 2) dayRef.current?.focus();
              commit(digits, day, year);
            }}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <Text style={s.sep}>/</Text>
        <View style={[s.field, s.fieldSmall]}>
          <TextInput
            ref={dayRef}
            style={s.input}
            placeholder="DD"
            placeholderTextColor={L.textSub}
            value={day}
            onChangeText={v => {
              const digits = v.replace(/\D/g, '').slice(0, 2);
              setDay(digits);
              if (digits.length === 2) yearRef.current?.focus();
              commit(month, digits, year);
            }}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
        <Text style={s.sep}>/</Text>
        <View style={[s.field, s.fieldLarge]}>
          <TextInput
            ref={yearRef}
            style={s.input}
            placeholder="YYYY"
            placeholderTextColor={L.textSub}
            value={year}
            onChangeText={v => {
              const digits = v.replace(/\D/g, '').slice(0, 4);
              setYear(digits);
              commit(month, day, digits);
            }}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
      </View>
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: shape.cta,
    paddingHorizontal: spacing.md, paddingVertical: 14, backgroundColor: L.bg,
  },
  fieldSmall: { width: 64 },
  fieldLarge: { flex: 1 },
  input: { fontSize: text.body.size, color: L.text, fontWeight: '500', padding: 0, textAlign: 'center' },
  sep: { fontSize: 18, color: L.textSub, fontWeight: '600' },
  error: { fontSize: text.caption.size, fontWeight: '500', color: L.danger, marginTop: spacing.sm },
});
