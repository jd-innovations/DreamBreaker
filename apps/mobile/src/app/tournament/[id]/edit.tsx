import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, radius } from '@/theme';
import { fetchTournamentById, updateTournamentDetails } from '@/lib/supabase/tournaments';
import { useProfile } from '@/hooks/useProfile';
import type { Tournament } from '@/lib/tournamentTypes';

// ─── Theme ────────────────────────────────────────────────────────────────────

const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  text:       colors.text,
  textSub:    colors.textSub,
  border:     colors.border,
  danger:     colors.danger,
  success:    colors.success,
};

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  registrationOpenDate: string;
  registrationCloseDate: string;
  entryFee: string;
  holdFee: string;
  drawSize: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

// ─── Date parsing — same contract as create-tournament.tsx: fields always
// hold a canonical ISO date (YYYY-MM-DD) from the picker, never free text. ──

function parseFormDate(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return isNaN(d.getTime()) ? null : trimmed;
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function validate(form: FormState, stripeOnboarded: boolean): Errors {
  const e: Errors = {};
  if (!form.name.trim())   e.name  = 'Tournament name is required';
  if (!form.venue.trim())  e.venue = 'Venue / location is required';
  if (!form.city.trim())   e.city  = 'City is required';
  if (!form.state.trim())  e.state = 'State is required';

  if (!form.date.trim())                       e.date = 'Tournament date is required';
  else if (!parseFormDate(form.date))          e.date = 'Pick a tournament date';

  if (!form.registrationCloseDate.trim())      e.registrationCloseDate = 'Registration close date is required';
  else if (!parseFormDate(form.registrationCloseDate)) e.registrationCloseDate = 'Pick a registration close date';

  if (form.registrationOpenDate.trim() && !parseFormDate(form.registrationOpenDate))
    e.registrationOpenDate = 'Pick a registration open date';

  const entry = parseFloat(form.entryFee);
  const hold  = parseFloat(form.holdFee);
  const draw  = parseInt(form.drawSize, 10);

  if (!form.entryFee.trim() || isNaN(entry) || entry < 0)
    e.entryFee = 'Entry fee must be $0 or more';
  else if (entry > 0 && !stripeOnboarded)
    e.entryFee = 'Connect Stripe payouts on the DreamBreaker website before charging an entry fee';

  if (!form.holdFee.trim() || isNaN(hold) || hold < 0)
    e.holdFee = 'Deposit must be $0 or more';
  else if (!isNaN(entry) && entry > 0 && hold >= entry)
    e.holdFee = 'Deposit must be less than the entry fee';

  if (!form.drawSize.trim() || isNaN(draw) || draw <= 0)
    e.drawSize = 'Draw size must be greater than 0';

  return e;
}

// registrationOpensAt/registrationClosesAt come back from Supabase as full
// timestamptz strings (e.g. "2026-07-21T00:00:00+00:00"), not the bare
// YYYY-MM-DD the date picker/parseFormDate expect — take just the date part.
function toDateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function tournamentToForm(t: Tournament): FormState {
  return {
    name:                  t.name,
    venue:                 t.venue,
    city:                  t.city,
    state:                 t.state,
    date:                  t.eventDate,
    registrationOpenDate:  toDateOnly(t.registrationOpensAt),
    registrationCloseDate: toDateOnly(t.registrationClosesAt),
    entryFee:              (t.entryFeeCents / 100).toString(),
    holdFee:               (t.holdFeeCents / 100).toString(),
    drawSize:              t.drawSize.toString(),
  };
}

// ─── Field components ──────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, keyboardType, error, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  error?: string;
  hint?: string;
}) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      {hint && <Text style={f.hint}>{hint}</Text>}
      <TextInput
        style={[f.input, !!error && f.inputError]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? ''}
        placeholderTextColor={L.textSub}
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
        autoCapitalize={keyboardType ? 'none' : 'words'}
      />
      {error && (
        <View style={f.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color={L.danger} />
          <Text style={f.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

function DateField({
  label, value, onPress, error, hint,
}: {
  label: string;
  value: string;
  onPress: () => void;
  error?: string;
  hint?: string;
}) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      {hint && <Text style={f.hint}>{hint}</Text>}
      <TouchableOpacity
        style={[f.input, f.dateInput, !!error && f.inputError]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={16} color={L.textSub} />
        <Text style={value ? f.dateValue : f.dateValuePlaceholder}>
          {value || 'Select a date'}
        </Text>
      </TouchableOpacity>
      {error && (
        <View style={f.errorRow}>
          <Ionicons name="alert-circle-outline" size={12} color={L.danger} />
          <Text style={f.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const f = StyleSheet.create({
  wrap:      { marginBottom: 18 },
  label:     { color: L.navy, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  hint:      { color: L.textSub, fontSize: 11, marginBottom: 6 },
  input: {
    backgroundColor: L.bg, borderWidth: 1.5, borderColor: L.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: L.text,
  },
  inputError: { borderColor: L.danger },
  errorRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  errorText:  { color: L.danger, fontSize: 11, fontWeight: '600' },

  dateInput:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateValue:           { fontSize: 15, color: L.text },
  dateValuePlaceholder:{ fontSize: 15, color: L.textSub },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EditTournamentScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const stripeOnboarded = !!profile?.stripe_connect_onboarded_at;

  const [loading, setLoading]       = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [form, setForm]             = useState<FormState | null>(null);
  const [errors, setErrors]         = useState<Errors>({});
  const [saving, setSaving]         = useState(false);
  const [activeDateField, setActiveDateField] = useState<
    'date' | 'registrationOpenDate' | 'registrationCloseDate' | null
  >(null);
  const [dateDraft, setDateDraft] = useState(new Date());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await fetchTournamentById(id);
      if (cancelled) return;
      if (!t || t.status !== 'draft') {
        Alert.alert('Cannot edit', 'This tournament can no longer be edited.');
        router.back();
        return;
      }
      setTournament(t);
      setForm(tournamentToForm(t));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  function set(field: keyof FormState, value: string) {
    setForm(prev => prev ? { ...prev, [field]: value } : prev);
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  }

  function openDatePicker(field: 'date' | 'registrationOpenDate' | 'registrationCloseDate') {
    if (!form) return;
    const iso = parseFormDate(form[field]);
    setDateDraft(iso ? new Date(`${iso}T00:00:00`) : new Date());
    setActiveDateField(field);
  }

  function confirmDate(d: Date) {
    if (!activeDateField) return;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    set(activeDateField, `${y}-${m}-${day}`);
  }

  function handleDateChange(_: DateTimePickerEvent, d?: Date) {
    if (Platform.OS === 'android') {
      setActiveDateField(null);
      if (d) confirmDate(d);
      return;
    }
    if (d) setDateDraft(d);
  }

  async function save() {
    if (!form) return;
    const e = validate(form, stripeOnboarded);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      Alert.alert('Please fix errors', 'Review your entries and correct any issues before saving.');
      return;
    }

    const eventDate = parseFormDate(form.date);
    const closesAt  = parseFormDate(form.registrationCloseDate);
    if (!eventDate || !closesAt) {
      Alert.alert('Please fix errors', 'Review your entries and correct any issues before saving.');
      return;
    }

    setSaving(true);
    const result = await updateTournamentDetails(id, {
      name:                 form.name.trim(),
      venue:                form.venue.trim(),
      city:                 form.city.trim(),
      state:                form.state.trim().toUpperCase(),
      eventDate,
      registrationOpensAt:  parseFormDate(form.registrationOpenDate),
      registrationClosesAt: closesAt,
      entryFeeCents:        Math.round(parseFloat(form.entryFee) * 100),
      holdFeeCents:         Math.round(parseFloat(form.holdFee)  * 100),
      drawSize:             parseInt(form.drawSize, 10),
    });
    setSaving(false);

    if (!result.ok) {
      Alert.alert('Error', result.error || 'Failed to save changes. Please try again.');
      return;
    }
    router.back();
  }

  if (loading || !form || !tournament) {
    return (
      <View style={[s.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.gold} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Edit Tournament</Text>
          <Text style={s.headerSub}>Draft — not visible to players yet</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
        >
          <Text style={s.sectionTitle}>Basics</Text>
          <Field label="Tournament Name *" value={form.name} onChange={v => set('name', v)} error={errors.name} />
          <Field label="Venue / Location *" value={form.venue} onChange={v => set('venue', v)} error={errors.venue} />
          <Field label="City *" value={form.city} onChange={v => set('city', v)} error={errors.city} />
          <Field label="State *" value={form.state} onChange={v => set('state', v)} error={errors.state} />

          <Text style={s.sectionTitle}>Dates</Text>
          <DateField
            label="Tournament Date *"
            value={formatDisplayDate(form.date)}
            onPress={() => openDatePicker('date')}
            error={errors.date}
          />
          <DateField
            label="Registration Opens"
            value={formatDisplayDate(form.registrationOpenDate)}
            onPress={() => openDatePicker('registrationOpenDate')}
            hint="Optional — leave blank if open now"
            error={errors.registrationOpenDate}
          />
          <DateField
            label="Registration Closes *"
            value={formatDisplayDate(form.registrationCloseDate)}
            onPress={() => openDatePicker('registrationCloseDate')}
            hint="Must be on or before the tournament date"
            error={errors.registrationCloseDate}
          />

          <Text style={s.sectionTitle}>Registration</Text>
          <Field
            label="Entry Fee (per player) *" value={form.entryFee} onChange={v => set('entryFee', v)}
            keyboardType="decimal-pad" error={errors.entryFee}
            hint={stripeOnboarded
              ? 'Charged to EACH player, including both partners on a doubles team — a pair pays this twice.'
              : 'Enter $0 — connect Stripe payouts on web to charge an entry fee'}
          />
          <Field
            label="Hold / Deposit Amount *" value={form.holdFee} onChange={v => set('holdFee', v)}
            keyboardType="decimal-pad" error={errors.holdFee}
          />
          <Field
            label="Draw Size *" value={form.drawSize} onChange={v => set('drawSize', v)}
            keyboardType="numeric" error={errors.drawSize}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Bottom bar ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.btnDisabled]}
          activeOpacity={saving ? 1 : 0.85}
          onPress={saving ? undefined : save}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={L.bg} />
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Date picker ── */}
      {activeDateField && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setActiveDateField(null)}>
          <View style={s.pickerSheetOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setActiveDateField(null)} activeOpacity={1} />
            <View style={s.pickerSheet}>
              <View style={s.pickerSheetHeader}>
                <TouchableOpacity onPress={() => setActiveDateField(null)}>
                  <Text style={s.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { confirmDate(dateDraft); setActiveDateField(null); }}>
                  <Text style={s.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={dateDraft}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      )}
      {activeDateField && Platform.OS === 'android' && (
        <DateTimePicker
          value={dateDraft}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: L.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '800' },
  headerSub:   { color: L.textSub, fontSize: 12, marginTop: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 24 },

  sectionTitle: {
    color: L.textSub, fontSize: 11, fontWeight: '900', letterSpacing: 0.8,
    marginBottom: 14, marginTop: 4,
  },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: L.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.success, borderRadius: radius.button, paddingVertical: 14,
  },
  saveBtnText: { color: L.bg, fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.5 },

  pickerSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  pickerSheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  pickerSheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  pickerCancel: { color: L.textSub, fontSize: 16, fontWeight: '600' },
  pickerDone:   { color: L.gold, fontSize: 16, fontWeight: '700' },
});
