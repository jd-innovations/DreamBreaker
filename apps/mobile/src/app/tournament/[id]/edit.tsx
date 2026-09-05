import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { fetchTournamentForEdit, updateTournamentDetails } from '@/lib/supabase/tournaments';
import { useProfile } from '@/hooks/useProfile';
import type { Tournament } from '@/lib/tournamentTypes';
import { ErrorState } from '@/components/states/ScreenState';
import AmenityPicker from '@/components/AmenityPicker';

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
  startTime: string;   // "HH:MM" 24h, '' when unset
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
    e.entryFee = 'Set up payouts in Account Settings before charging an entry fee';

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
    startTime:             (t.startTime ?? '').slice(0, 5),
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
  wrap: { marginBottom: 18 },
  label: { color: L.navy, fontSize: text.fieldLabel.size, fontWeight: '800', marginBottom: 4 },
  hint: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginBottom: 6 },
  input: {
    backgroundColor: L.bg, borderWidth: 1.5, borderColor: L.border,
    borderRadius: shape.cta, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: text.body.size, fontWeight: '500', color: L.text,
  },
  inputError: { borderColor: L.danger },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  errorText: { color: L.danger, fontSize: text.caption.size, fontWeight: '500' },

  dateInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateValue: { fontSize: text.body.size, fontWeight: '500', color: L.text },
  dateValuePlaceholder: { fontSize: text.body.size, fontWeight: '500', color: L.textSub },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

function EditTournamentScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, loading: profileLoading } = useProfile();
  const stripeOnboarded = !!profile?.stripe_connect_onboarded_at;

  // Mirrors is_approved_director(): ownership is checked IN the query below;
  // this is the second half of what DirectorOnly used to check, read from data
  // already in memory via useProfile — no extra request. A director whose
  // approval has lapsed still owns the row, so skipping this would let them
  // into the form and fail silently at the RLS UPDATE policy on save.
  const isApprovedDirector =
    (profile?.role === 'director' || profile?.is_director === true) &&
    profile?.director_status === 'approved';

  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [notApproved, setNotApproved] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [form, setForm]             = useState<FormState | null>(null);
  const [errors, setErrors]         = useState<Errors>({});
  const [saving, setSaving]         = useState(false);
  const [activeDateField, setActiveDateField] = useState<
    'date' | 'registrationOpenDate' | 'registrationCloseDate' | null
  >(null);
  const [dateDraft, setDateDraft] = useState(new Date());
  const [amenities, setAmenities] = useState<string[]>([]);

  // One request: ownership is the query's own `.eq('director_id', ...)`, not a
  // separate permission check beforehand. See fetchTournamentForEdit for why.
  //
  // `force` exists because useProfile() re-triggers a profile refresh on every
  // screen focus (its own useFocusEffect), which flips `profileLoading` and,
  // since it used to be a dependency here, recreated this callback and re-ran
  // the mount effect below — re-fetching the tournament and flashing the
  // loading spinner over an already-populated form every time the screen
  // regained focus. Skipping when the same tournament is already loaded stops
  // that; Retry passes force so it still does a real refetch on request.
  const load = useCallback(async (force = false) => {
    if (profileLoading) return;      // wait for the profile; do not fail yet
    if (!force && tournament?.id === id) return;
    if (!user?.id) {
      setLoadError('You need to be signed in to edit a tournament.');
      setLoading(false);
      return;
    }
    if (!id) {
      setLoadError('No tournament was specified.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setNotApproved(false);
    try {
      const t = await fetchTournamentForEdit(id, user.id);
      if (!t) {
        // Not found or not yours — RLS makes those indistinguishable from the
        // client, and neither is actionable differently, so one message covers
        // both. Matches web's "Tournament not found or access denied."
        setLoadError('Tournament not found, or you do not have access to edit it.');
        return;
      }
      if (t.status !== 'draft') {
        setLoadError(`This tournament is "${t.status}" and can only be edited while it is a draft.`);
        return;
      }
      if (!isApprovedDirector) {
        // Their own draft, but their director approval is not active. Not
        // folded into loadError: this is not "the check failed", it is an
        // an answer that says no — bouncing them with no explanation is the
        // confusing case a clear message avoids.
        setNotApproved(true);
        return;
      }
      setTournament(t);
      setForm(tournamentToForm(t));
      setAmenities(t.amenities ?? []);
    } catch (e) {
      console.error('[tournament edit] load failed:', e);
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, profileLoading, isApprovedDirector, tournament]);

  useEffect(() => {
    let cancelled = false;
    // `load` itself is fine running after unmount (it only touches state), but
    // this keeps the effect's own contract explicit rather than relying on
    // React swallowing a late setState with a warning.
    void (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

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

  // ── Start time ──────────────────────────────────────────────────────────────
  // Separate from the date picker: that writes ISO dates into three fields,
  // this writes one wall-clock "HH:MM".
  const [timeOpen, setTimeOpen]   = useState(false);
  const [timeDraft, setTimeDraft] = useState(new Date());

  function openTimePicker() {
    const m = /^(\d{2}):(\d{2})$/.exec(form?.startTime?.trim() ?? '');
    const d = new Date();
    d.setHours(m ? Number(m[1]) : 8, m ? Number(m[2]) : 0, 0, 0);
    setTimeDraft(d);
    setTimeOpen(true);
  }

  function confirmTime(d: Date) {
    set('startTime', `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  }

  function handleTimeChange(_: DateTimePickerEvent, d?: Date) {
    if (Platform.OS === 'android') {
      setTimeOpen(false);
      if (d) confirmTime(d);
      return;
    }
    if (d) setTimeDraft(d);
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
      amenities,
      name:                 form.name.trim(),
      venue:                form.venue.trim(),
      city:                 form.city.trim(),
      state:                form.state.trim().toUpperCase(),
      eventDate,
      startTime:            form.startTime.trim() || null,
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

  if (loadError) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ErrorState title="Can't open the editor" message={loadError}
          action={{ label: 'Retry', onPress: () => { void load(true); } }} />
      </View>
    );
  }

  if (notApproved) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ErrorState
          title="Director approval required"
          message="Your director approval is not active, so this tournament cannot be edited right now. Contact support if you think this is a mistake."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </View>
    );
  }

  if (loading || profileLoading || !form || !tournament) {
    return (
      <View style={[s.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={L.gold} />
        <Text style={{ marginTop: 12, color: L.textSub }}>Loading tournament…</Text>
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

          <View style={{ marginTop: 10 }}>
            <AmenityPicker value={amenities} onChange={setAmenities} />
          </View>

          <Text style={s.sectionTitle}>Dates</Text>
          <DateField
            label="Tournament Date *"
            value={formatDisplayDate(form.date)}
            onPress={() => openDatePicker('date')}
            error={errors.date}
          />
          <DateField
            label="Start Time"
            value={(() => {
              const m = /^(\d{2}):(\d{2})$/.exec(form.startTime.trim());
              if (!m) return '';
              const d = new Date();
              d.setHours(Number(m[1]), Number(m[2]), 0, 0);
              return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            })()}
            onPress={openTimePicker}
            hint="Optional — leave blank if the schedule varies by division"
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
      {timeOpen && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" onRequestClose={() => setTimeOpen(false)}>
          <View style={s.pickerSheetOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setTimeOpen(false)} activeOpacity={1} />
            <View style={s.pickerSheet}>
              <View style={s.pickerSheetHeader}>
                <TouchableOpacity onPress={() => setTimeOpen(false)}>
                  <Text style={s.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { confirmTime(timeDraft); setTimeOpen(false); }}>
                  <Text style={s.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={timeDraft}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      )}
      {timeOpen && Platform.OS === 'android' && (
        <DateTimePicker
          value={timeDraft}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}

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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 24 },

  sectionTitle: {
    color: L.textSub, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
    marginBottom: 14, marginTop: 4,
  },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: L.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.success, borderRadius: shape.cta, paddingVertical: 14,
  },
  saveBtnText: { color: L.bg, fontSize: text.actionLarge.size, fontWeight: '800' },
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
  pickerCancel: { color: L.textSub, fontSize: text.action.size, fontWeight: '800' },
  pickerDone: { color: L.gold, fontSize: text.action.size, fontWeight: '800' },
});

// No wrapper guard. Ownership and draft-status are enforced by the query
// itself (fetchTournamentForEdit filters on director_id; RLS is the real
// backstop either way), and director-approval is checked from useProfile with
// no extra request. See fetchTournamentForEdit for why this replaced
// DirectorOnly here specifically — the other nine tournament/[id]/* director
// routes still use it and are not changed by this commit.
export default EditTournamentScreen;
