import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { createDivision } from '@/lib/supabase/divisions';
import { fetchTournamentById } from '@/lib/supabase/tournaments';
import { DirectorOnly } from '@/components/DirectorOnly';

// ─── Theme ────────────────────────────────────────────────────────────────────

const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  textMuted:  colors.textMuted,
  border:     colors.border,
  danger:     colors.danger,
  dangerBg:   colors.dangerBg,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  name:       string;
  eventType:  string;
  gender:     string;
  skillMin:   string;
  skillMax:   string;
  capacity:   string;
  entryFee:   string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EVENT_TYPES = ['Singles', 'Doubles', 'Mixed Doubles'];
const GENDERS     = ["Men's", "Women's", 'Mixed', 'Open'];

// ─── Components ───────────────────────────────────────────────────────────────

function Field({
  label, value, onChangeText, placeholder, keyboardType, error, hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  error?: string;
  hint?: string;
}) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={[f.input, !!error && f.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={L.textMuted}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
      />
      {!!hint && !error && <Text style={f.hint}>{hint}</Text>}
      {!!error && <Text style={f.error}>{error}</Text>}
    </View>
  );
}

function ChipSelector({
  label, options, selected, onSelect, error,
}: {
  label: string;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  error?: string;
}) {
  return (
    <View style={cs.wrap}>
      <Text style={cs.label}>{label}</Text>
      <View style={cs.row}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[cs.chip, selected === opt && cs.chipActive]}
            onPress={() => onSelect(opt)}
            activeOpacity={0.75}
          >
            <Text style={[cs.chipText, selected === opt && cs.chipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!error && <Text style={cs.error}>{error}</Text>}
    </View>
  );
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.name.trim()) {
    errors.name = 'Division name is required';
  }
  if (!form.eventType) {
    errors.eventType = 'Select an event type';
  }
  if (!form.gender) {
    errors.gender = 'Select a gender category';
  }

  const skillMin = parseFloat(form.skillMin);
  const skillMax = parseFloat(form.skillMax);
  if (!form.skillMin || isNaN(skillMin) || skillMin < 1 || skillMin > 7) {
    errors.skillMin = 'Enter a skill level between 1.0–7.0';
  }
  if (!form.skillMax || isNaN(skillMax) || skillMax < 1 || skillMax > 7) {
    errors.skillMax = 'Enter a skill level between 1.0–7.0';
  }
  if (!errors.skillMin && !errors.skillMax && skillMin >= skillMax) {
    errors.skillMax = 'Max must be greater than min';
  }

  const capacity = parseInt(form.capacity, 10);
  if (!form.capacity || isNaN(capacity) || capacity < 2) {
    errors.capacity = 'Capacity must be at least 2';
  }

  // Blank is legitimate and always was — the field's own hint promises "leave
  // blank to use the tournament's entry fee", which stores null and inherits.
  // Requiring > 0 contradicted that and made a free division impossible to
  // create: a $0 tournament's divisions had to be given a token fee to get past
  // this check, which then blocked manual registration.
  if (form.entryFee.trim() !== '') {
    const entryFee = parseFloat(form.entryFee);
    if (isNaN(entryFee) || entryFee < 0) {
      errors.entryFee = 'Entry fee must be $0 or more';
    }
  }

  return errors;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function CreateDivisionScreen() {
  const insets           = useSafeAreaInsets();
  const { id }           = useLocalSearchParams<{ id: string }>();
  const { user, loading: authLoading } = useSession();
  const [tournamentName, setTournamentName] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  useEffect(() => {
    fetchTournamentById(id).then(t => setTournamentName(t?.name ?? ''));
  }, [id]);

  const [form, setForm] = useState<FormState>({
    name:      '',
    eventType: '',
    gender:    '',
    skillMin:  '',
    skillMax:  '',
    capacity:  '',
    entryFee:  '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: string) {
    const updated = { ...form, [key]: value };
    setForm(updated);
    if (submitted) {
      setErrors(validate(updated));
    }
  }

  // Auto-compose name when eventType + gender both set and name is still empty
  function selectEventType(v: string) {
    const updated = { ...form, eventType: v };
    if (!updated.name.trim() && updated.gender) {
      updated.name = `${updated.gender} ${v}`;
    }
    setForm(updated);
    if (submitted) setErrors(validate(updated));
  }

  function selectGender(v: string) {
    const updated = { ...form, gender: v };
    if (!updated.name.trim() && updated.eventType) {
      updated.name = `${v} ${updated.eventType}`;
    }
    setForm(updated);
    if (submitted) setErrors(validate(updated));
  }

  async function submit() {
    setSubmitted(true);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (submitting) return;

    setSubmitting(true);
    try {
      const div = await createDivision({
        tournamentId:  id,
        name:          form.name.trim(),
        eventType:     form.eventType,
        gender:        form.gender,
        skillMin:      parseFloat(form.skillMin),
        skillMax:      parseFloat(form.skillMax),
        capacity:      parseInt(form.capacity, 10),
        // Blank -> undefined -> stored as null, meaning "inherit the
        // tournament's entry fee". An explicit 0 means this division is free
        // regardless of what the tournament charges.
        entryFeeCents: form.entryFee.trim() === ''
          ? undefined
          : Math.round(parseFloat(form.entryFee) * 100),
      });

      Alert.alert(
        'Division Created',
        `"${div.name}" has been added to ${tournamentName}.`,
        [{ text: 'Done', onPress: () => router.replace(`/tournament/${id}/command-center` as never) }],
      );
    } catch (e: unknown) {
      Alert.alert('Could not create division', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={L.navy} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Add Division</Text>
            <Text style={s.sub} numberOfLines={1}>{tournamentName}</Text>
          </View>
        </View>

        {/* ── Form ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {/* Division Info */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>DIVISION INFO</Text>

            <ChipSelector
              label="Event Type"
              options={EVENT_TYPES}
              selected={form.eventType}
              onSelect={selectEventType}
              error={errors.eventType}
            />

            <ChipSelector
              label="Gender Category"
              options={GENDERS}
              selected={form.gender}
              onSelect={selectGender}
              error={errors.gender}
            />

            <Field
              label="Division Name"
              value={form.name}
              onChangeText={v => set('name', v)}
              placeholder="e.g. Men's Doubles"
              error={errors.name}
            />
          </View>

          {/* Skill Level */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>SKILL LEVEL</Text>
            <View style={s.row2}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Min Rating"
                  value={form.skillMin}
                  onChangeText={v => set('skillMin', v)}
                  placeholder="e.g. 3.5"
                  keyboardType="decimal-pad"
                  error={errors.skillMin}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Max Rating"
                  value={form.skillMax}
                  onChangeText={v => set('skillMax', v)}
                  placeholder="e.g. 4.5"
                  keyboardType="decimal-pad"
                  error={errors.skillMax}
                />
              </View>
            </View>
          </View>

          {/* Capacity & Fees */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>CAPACITY & FEES</Text>

            <Field
              label="Capacity (teams / players)"
              value={form.capacity}
              onChangeText={v => set('capacity', v)}
              placeholder="e.g. 64"
              keyboardType="numeric"
              error={errors.capacity}
            />

            <Field
              label="Entry Fee (per player, $)"
              value={form.entryFee}
              onChangeText={v => set('entryFee', v)}
              placeholder="e.g. 120"
              keyboardType="decimal-pad"
              error={errors.entryFee}
              hint="Charged to EACH player — both partners on a doubles team pay it separately. Leave blank to use the tournament's entry fee; any value here overrides it for this division only."
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, submitting && s.submitBtnDisabled]}
            onPress={submitting ? undefined : submit}
            activeOpacity={submitting ? 1 : 0.85}
          >
            <Text style={s.submitBtnText}>{submitting ? 'Creating…' : 'Create Division'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.page, alignItems: 'center', justifyContent: 'center',
  },
  title: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  sub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },

  scroll: { padding: 16, gap: 12 },
  card: { backgroundColor: L.bg, borderRadius: shape.card, padding: 16, gap: 14 },
  sectionTitle: {
    color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800',
    letterSpacing: text.sectionLabel.letterSpacing, textTransform: 'uppercase', marginBottom: 2,
  },
  row2: { flexDirection: 'row', gap: 12 },

  submitBtn: {
    backgroundColor: L.navy, borderRadius: shape.cta,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: L.bg, fontSize: text.actionLarge.size, fontWeight: '800' },
});

const f = StyleSheet.create({
  wrap: { gap: 6 },
  label: { color: L.textSub, fontSize: text.fieldLabel.size, fontWeight: '800' },
  input: {
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 14, paddingVertical: 12,
    color: L.navy, fontSize: text.body.size, fontWeight: '500',
  },
  inputError: { borderColor: L.danger },
  hint: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 15 },
  error: { color: L.danger, fontSize: text.caption.size, fontWeight: '500' },
});

const cs = StyleSheet.create({
  wrap: { gap: 8 },
  label: { color: L.textSub, fontSize: text.fieldLabel.size, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: shape.pill,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  chipTextActive: { color: L.bg },
  error: { color: L.danger, fontSize: text.caption.size, fontWeight: '500' },
});

// Director-only route. The screen body above is mounted only after
// DirectorOnly confirms the signed-in user directs this tournament, so its
// effects and fetches never run for anyone else.
export default function CreateDivisionScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <DirectorOnly tournamentId={id}>
      <CreateDivisionScreen />
    </DirectorOnly>
  );
}
