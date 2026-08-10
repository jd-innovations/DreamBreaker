import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, radius } from '@/theme';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { createDraftTournament } from '@/lib/supabase/tournaments';
import { FacilityPicker, type FacilityPickerValue } from '@/components/FacilityPicker';
import { useSupportContext } from '@/lib/support/supportContext';

// ─── Theme ────────────────────────────────────────────────────────────────────

const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  border:     colors.border,
  danger:     colors.danger,
  dangerBg:   colors.dangerBg,
  success:    colors.success,
};

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepKey = 'basics' | 'dates' | 'registration' | 'review';

const STEPS: { key: StepKey; title: string; icon: string }[] = [
  { key: 'basics',       title: 'Basics',       icon: 'create-outline'       },
  { key: 'dates',        title: 'Dates',         icon: 'calendar-outline'     },
  { key: 'registration', title: 'Registration',  icon: 'card-outline'         },
  { key: 'review',       title: 'Review',        icon: 'checkmark-circle-outline' },
];

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

const EMPTY: FormState = {
  name:                 '',
  venue:                '',
  city:                 '',
  state:                '',
  date:                 '',
  registrationOpenDate: '',
  registrationCloseDate:'',
  entryFee:             '',
  holdFee:              '',
  drawSize:             '',
};

// ─── Field component ──────────────────────────────────────────────────────────

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

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ currentIdx }: { currentIdx: number }) {
  return (
    <View style={sb.row}>
      {STEPS.map((step, i) => {
        const done    = i < currentIdx;
        const active  = i === currentIdx;
        return (
          <React.Fragment key={step.key}>
            <View style={[sb.dot, done && sb.dotDone, active && sb.dotActive]}>
              {done
                ? <Ionicons name="checkmark" size={12} color={L.bg} />
                : <Text style={[sb.dotNum, active && sb.dotNumActive]}>{i + 1}</Text>
              }
            </View>
            {i < STEPS.length - 1 && (
              <View style={[sb.line, done && sb.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const sb = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: L.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dotActive: { backgroundColor: L.navy, borderColor: L.navy },
  dotDone:   { backgroundColor: L.success, borderColor: L.success },
  dotNum:    { color: L.textSub, fontSize: 11, fontWeight: '800' },
  dotNumActive: { color: L.bg },
  line:      { flex: 1, height: 2, backgroundColor: L.border },
  lineDone:  { backgroundColor: L.success },
});

// ─── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rv.row}>
      <Text style={rv.label}>{label}</Text>
      <Text style={rv.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const rv = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
  },
  label: { flex: 1, color: L.textSub, fontSize: 13, fontWeight: '600' },
  value: { flex: 2, color: L.navy,    fontSize: 13, fontWeight: '700', textAlign: 'right' },
});

// ─── Date parsing ─────────────────────────────────────────────────────────────
// Form fields store the canonical ISO date (YYYY-MM-DD) the picker produces —
// never a locale-formatted string. Re-parsing a human string like "Sep 16,
// 2026" via `new Date(string)` is implementation-defined per spec and not
// reliably supported by Hermes on-device (it can format a Date into that
// string fine, but can't necessarily parse it back), which is why free-text
// entry broke validation. Bare ISO dates are spec-guaranteed parseable
// everywhere, so this only ever has to validate/pass through that form.

function parseFormDate(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return isNaN(d.getTime()) ? null : trimmed;
}

// Formats a stored ISO date for display, e.g. "2026-09-16" → "Sep 16, 2026".
function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Validation ───────────────────────────────────────────────────────────────

type Errors = Partial<Record<keyof FormState, string>>;

function validateStep(step: StepKey, form: FormState, stripeOnboarded: boolean): Errors {
  const e: Errors = {};

  if (step === 'basics') {
    if (!form.name.trim())   e.name  = 'Tournament name is required';
    if (!form.venue.trim())  e.venue = 'Venue / location is required';
    if (!form.city.trim())   e.city  = 'City is required';
    if (!form.state.trim())  e.state = 'State is required';
  }

  if (step === 'dates') {
    if (!form.date.trim())                       e.date = 'Tournament date is required';
    else if (!parseFormDate(form.date))           e.date = 'Pick a tournament date';

    if (!form.registrationCloseDate.trim())       e.registrationCloseDate = 'Registration close date is required';
    else if (!parseFormDate(form.registrationCloseDate)) e.registrationCloseDate = 'Pick a registration close date';

    if (form.registrationOpenDate.trim() && !parseFormDate(form.registrationOpenDate))
      e.registrationOpenDate = 'Pick a registration open date';
  }

  if (step === 'registration') {
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
  }

  return e;
}

function validateAll(form: FormState, stripeOnboarded: boolean): Errors {
  return {
    ...validateStep('basics', form, stripeOnboarded),
    ...validateStep('dates', form, stripeOnboarded),
    ...validateStep('registration', form, stripeOnboarded),
  };
}

function fmt(dollarStr: string): string {
  const n = parseFloat(dollarStr);
  return isNaN(n) ? dollarStr : `$${n.toFixed(2)}`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreateTournamentScreen() {
  const insets       = useSafeAreaInsets();
  const { user, loading: authLoading } = useSession();
  const { profile } = useProfile();
  const stripeOnboarded = !!profile?.stripe_connect_onboarded_at;

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading]);

  const [stepIdx, setStepIdx]   = useState(0);
  const [form, setForm]         = useState<FormState>(EMPTY);
  const [errors, setErrors]     = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [facilityId,   setFacilityId]   = useState<string | null>(null);

  // Multi-step form with its own sticky bottom action bar -- minimized per §7's create-* rule.
  useSupportContext({ feature: 'event_creation', visibility: 'minimized', metadata: { is_director: true } });
  const [pickerValue,  setPickerValue]  = useState<FacilityPickerValue | null>(null);
  const [activeDateField, setActiveDateField] = useState<
    'date' | 'registrationOpenDate' | 'registrationCloseDate' | null
  >(null);
  const [dateDraft, setDateDraft] = useState(new Date());

  function openDatePicker(field: 'date' | 'registrationOpenDate' | 'registrationCloseDate') {
    const iso = parseFormDate(form[field]);
    setDateDraft(iso ? new Date(`${iso}T00:00:00`) : new Date());
    setActiveDateField(field);
  }

  function confirmDate(d: Date) {
    if (!activeDateField) return;
    // Build ISO from local date components, not toISOString() (UTC-based
    // and can shift the date by a day depending on the device's timezone).
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

  function handlePickerChange(v: FacilityPickerValue) {
    setPickerValue(v);
    if (v.mode === 'facility') {
      setFacilityId(v.facilityId);
      set('venue', v.name);
      set('city',  v.city);
      set('state', v.state);
    } else {
      setFacilityId(null);
    }
  }

  const currentStep = STEPS[stepIdx];

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  }

  function tryNext() {
    const e = validateStep(currentStep.key, form, stripeOnboarded);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setStepIdx(i => i + 1);
  }

  function goBack() {
    if (stepIdx === 0) { router.back(); return; }
    setStepIdx(i => i - 1);
  }

  async function submit() {
    const e = validateAll(form, stripeOnboarded);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      Alert.alert('Please fix errors', 'Review your entries and correct any issues before submitting.');
      return;
    }
    if (!user?.id) return;

    const eventDate = parseFormDate(form.date);
    const closesAt  = parseFormDate(form.registrationCloseDate);
    if (!eventDate || !closesAt) {
      Alert.alert('Please fix errors', 'Review your entries and correct any issues before submitting.');
      return;
    }

    setSubmitting(true);
    const t = await createDraftTournament({
      directorId:           user.id,
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
      facilityId,
    });

    if (!t) {
      setSubmitting(false);
      Alert.alert('Error', 'Failed to create tournament. Please try again.');
      return;
    }
    router.replace(`/tournament/${t.id}/command-center` as never);
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={goBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={L.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Create Tournament</Text>
          <Text style={s.headerSub}>{currentStep.title}</Text>
        </View>
      </View>

      {/* ── Step progress ── */}
      <StepBar currentIdx={stepIdx} />

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

          {/* ── STEP 1: Basics ── */}
          {currentStep.key === 'basics' && (
            <View style={s.stepBody}>
              <View style={s.stepHero}>
                <Ionicons name="create-outline" size={28} color={L.gold} />
                <Text style={s.stepHeroTitle}>Tournament Basics</Text>
                <Text style={s.stepHeroSub}>Give your tournament a name and location.</Text>
              </View>
              <Field
                label="Tournament Name *"
                value={form.name}
                onChange={v => set('name', v)}
                placeholder="e.g. Suncoast Summer Slam"
                error={errors.name}
              />
              {/* Facility picker — optional; auto-fills venue/city/state */}
              <View style={{ marginBottom: 6 }}>
                <Text style={f.label}>Facility Directory <Text style={{ color: L.textSub, fontWeight: '400' }}>(optional)</Text></Text>
                <FacilityPicker value={pickerValue} onChange={handlePickerChange} />
              </View>

              <Field
                label="Venue / Location *"
                value={form.venue}
                onChange={v => set('venue', v)}
                placeholder="e.g. Lakewood Ranch Sports Complex"
                error={errors.venue}
              />
              <Field
                label="City *"
                value={form.city}
                onChange={v => set('city', v)}
                placeholder="e.g. Bradenton"
                error={errors.city}
              />
              <Field
                label="State *"
                value={form.state}
                onChange={v => set('state', v)}
                placeholder="e.g. FL"
                error={errors.state}
              />
            </View>
          )}

          {/* ── STEP 2: Dates ── */}
          {currentStep.key === 'dates' && (
            <View style={s.stepBody}>
              <View style={s.stepHero}>
                <Ionicons name="calendar-outline" size={28} color={L.gold} />
                <Text style={s.stepHeroTitle}>Tournament Dates</Text>
                <Text style={s.stepHeroSub}>Set when the tournament runs and when registration is open.</Text>
              </View>
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
            </View>
          )}

          {/* ── STEP 3: Registration ── */}
          {currentStep.key === 'registration' && (
            <View style={s.stepBody}>
              <View style={s.stepHero}>
                <Ionicons name="card-outline" size={28} color={L.gold} />
                <Text style={s.stepHeroTitle}>Registration Settings</Text>
                <Text style={s.stepHeroSub}>Set your fees and draw size. Enter dollar amounts.</Text>
              </View>
              <Field
                label="Entry Fee *"
                value={form.entryFee}
                onChange={v => set('entryFee', v)}
                placeholder="e.g. 75.00"
                keyboardType="decimal-pad"
                hint={stripeOnboarded ? 'Full entry fee in dollars (e.g. 75.00)' : 'Enter $0 — connect Stripe payouts on web to charge an entry fee'}
                error={errors.entryFee}
              />
              <Field
                label="Hold / Deposit Amount *"
                value={form.holdFee}
                onChange={v => set('holdFee', v)}
                placeholder="e.g. 10.00"
                keyboardType="decimal-pad"
                hint="Deposit to hold a spot — must be less than entry fee"
                error={errors.holdFee}
              />
              <Field
                label="Draw Size *"
                value={form.drawSize}
                onChange={v => set('drawSize', v)}
                placeholder="e.g. 32"
                keyboardType="numeric"
                hint="Maximum number of registered players"
                error={errors.drawSize}
              />
            </View>
          )}

          {/* ── STEP 4: Review ── */}
          {currentStep.key === 'review' && (
            <View style={s.stepBody}>
              <View style={s.stepHero}>
                <Ionicons name="checkmark-circle-outline" size={28} color={L.gold} />
                <Text style={s.stepHeroTitle}>Review & Create</Text>
                <Text style={s.stepHeroSub}>Confirm your tournament details before creating it.</Text>
              </View>

              <View style={s.reviewCard}>
                <Text style={s.reviewSection}>TOURNAMENT DETAILS</Text>
                <ReviewRow label="Name"     value={form.name}  />
                <ReviewRow label="Venue"    value={form.venue} />
                <ReviewRow label="Location" value={`${form.city}, ${form.state.toUpperCase()}`} />

                <Text style={[s.reviewSection, { marginTop: 20 }]}>DATES</Text>
                <ReviewRow label="Tournament Date"       value={formatDisplayDate(form.date)} />
                <ReviewRow label="Registration Opens"    value={formatDisplayDate(form.registrationOpenDate) || '—'} />
                <ReviewRow label="Registration Closes"   value={formatDisplayDate(form.registrationCloseDate)} />

                <Text style={[s.reviewSection, { marginTop: 20 }]}>REGISTRATION</Text>
                <ReviewRow label="Entry Fee"    value={fmt(form.entryFee)} />
                <ReviewRow label="Hold Deposit" value={fmt(form.holdFee)}  />
                <ReviewRow label="Draw Size"    value={`${form.drawSize} players`} />
              </View>

              <View style={s.reviewNote}>
                <Ionicons name="information-circle-outline" size={16} color={L.textSub} />
                <Text style={s.reviewNoteText}>
                  After creating, you can add divisions in the Command Center. The tournament starts as a{' '}
                  <Text style={{ fontWeight: '700', color: L.navy }}>Draft</Text> — submit it for approval when
                  you&rsquo;re ready to go live.
                </Text>
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Bottom nav ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {stepIdx > 0 && (
          <TouchableOpacity style={s.backBtnBottom} activeOpacity={0.8} onPress={goBack}>
            <Ionicons name="chevron-back" size={16} color={L.navy} />
            <Text style={s.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {currentStep.key !== 'review' ? (
          <TouchableOpacity style={s.nextBtn} activeOpacity={0.85} onPress={tryNext}>
            <Text style={s.nextBtnText}>Continue</Text>
            <Ionicons name="chevron-forward" size={16} color={L.bg} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.nextBtn, s.createBtn, submitting && s.btnDisabled]}
            activeOpacity={submitting ? 1 : 0.85}
            onPress={submitting ? undefined : submit}
          >
            <Ionicons name="add-circle-outline" size={16} color={L.bg} />
            <Text style={s.nextBtnText}>{submitting ? 'Creating…' : 'Create Tournament'}</Text>
          </TouchableOpacity>
        )}
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
                minimumDate={new Date()}
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
          minimumDate={new Date()}
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

  stepBody: {},

  stepHero: { alignItems: 'center', marginBottom: 28, gap: 8 },
  stepHeroTitle: { color: L.navy, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  stepHeroSub:   { color: L.textSub, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  reviewCard: {
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    borderRadius: radius.card, padding: 16, marginBottom: 16,
  },
  reviewSection: {
    color: L.textSub, fontSize: 10, fontWeight: '900', letterSpacing: 0.8,
    marginBottom: 4,
  },
  reviewNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: L.goldLight, borderWidth: 1, borderColor: L.goldBorder,
    borderRadius: 12, padding: 12,
  },
  reviewNoteText: { flex: 1, color: L.text, fontSize: 12, lineHeight: 18 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: L.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  backBtnBottom: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: L.border, borderRadius: radius.button,
  },
  backBtnText: { color: L.navy, fontSize: 14, fontWeight: '700' },

  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: radius.button,
    paddingHorizontal: 22, paddingVertical: 13,
  },
  nextBtnText: { color: L.bg, fontSize: 15, fontWeight: '800' },
  createBtn:   { backgroundColor: L.success },
  btnDisabled: { opacity: 0.5 },

  // Date picker sheet (iOS)
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
