import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { haptics } from '@/lib/haptics';

// Where a lesson happens (owner, 2026-10-04): at a facility, the coach travels
// to the student within a range of a home base CITY, or both. Publishing needs
// at least one — the database enforces it (trg_coach_offer_location_required),
// this only says so first. The home base is a city, never an address; the
// server places it at that city's courts.

export const TRAVEL_RADII = [5, 10, 15, 25] as const;

export type LessonTravel = { city: string; state: string; radiusMiles: number };

export type LessonLocationValue = {
  facility: FacilityPickerValue | null;
  /** null = doesn't travel. */
  travel: LessonTravel | null;
};

export function hasLessonLocation(v: LessonLocationValue): boolean {
  if (v.facility?.mode === 'facility') return true;
  return !!v.travel && v.travel.city.trim().length > 0 && v.travel.state.trim().length > 0;
}

/** Column values for createCoachOffer / updateCoachOffer. */
export function lessonLocationColumns(v: LessonLocationValue) {
  const t = v.travel && v.travel.city.trim() && v.travel.state.trim() ? v.travel : null;
  return {
    facilityId: v.facility?.mode === 'facility' ? v.facility.facilityId : null,
    travelBaseCity: t ? t.city.trim() : null,
    travelBaseState: t ? t.state.trim().toUpperCase() : null,
    travelRadiusMiles: t ? t.radiusMiles : null,
  };
}

export function LessonLocationFields({
  value, onChange, defaultCity = '', defaultState = '',
}: {
  value: LessonLocationValue;
  onChange: (v: LessonLocationValue) => void;
  /** Prefill for the travel base, e.g. the coach's profile city. */
  defaultCity?: string;
  defaultState?: string;
}) {
  const travelling = value.travel !== null;
  const setTravel = (patch: Partial<LessonTravel>) =>
    onChange({ ...value, travel: { ...(value.travel ?? { city: defaultCity, state: defaultState, radiusMiles: 10 }), ...patch } });

  return (
    <View style={s.wrap}>
      <Text style={s.label}>At a facility</Text>
      <FacilityPicker value={value.facility} onChange={(facility) => onChange({ ...value, facility })} />

      <View style={s.travelRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>I travel to students</Text>
          <Text style={s.hint}>Shown to players within your range of your home base city.</Text>
        </View>
        <Switch
          value={travelling}
          onValueChange={(on) => {
            haptics.selection();
            onChange({ ...value, travel: on ? { city: defaultCity, state: defaultState, radiusMiles: 10 } : null });
          }}
          trackColor={{ true: colors.gold, false: colors.border }}
          accessibilityLabel="I travel to students"
        />
      </View>

      {travelling && (
        <View style={s.travelBox}>
          <View style={s.cityRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={value.travel?.city ?? ''}
              onChangeText={(city) => setTravel({ city })}
              placeholder="Home base city"
              placeholderTextColor={colors.textSub}
              autoCapitalize="words"
              accessibilityLabel="Home base city"
            />
            <TextInput
              style={[s.input, s.stateInput]}
              value={value.travel?.state ?? ''}
              onChangeText={(state) => setTravel({ state: state.slice(0, 2) })}
              placeholder="ST"
              placeholderTextColor={colors.textSub}
              autoCapitalize="characters"
              maxLength={2}
              accessibilityLabel="State"
            />
          </View>
          <Text style={s.hint}>A city, never your address. Players see the city and how far you travel.</Text>
          <View style={s.radiusRow}>
            {TRAVEL_RADII.map((mi) => {
              const on = value.travel?.radiusMiles === mi;
              return (
                <TouchableOpacity
                  key={mi}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => { if (!on) { haptics.selection(); setTravel({ radiusMiles: mi }); } }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>{mi} mi</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {!hasLessonLocation(value) && (
        <Text style={s.required}>Choose a facility, a travel area, or both before publishing.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { color: colors.text, fontSize: text.caption.size, fontWeight: '700' },
  hint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
  travelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  travelBox: { gap: spacing.sm },
  cityRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.panel,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: text.body.size, backgroundColor: colors.bg,
  },
  stateInput: { width: 64, textAlign: 'center' },
  radiusRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: shape.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  chipTextOn: { color: colors.bg },
  required: { color: colors.danger, fontSize: text.caption.size, fontWeight: '600' },
});
