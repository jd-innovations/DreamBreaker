import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import { fetchFacilities, type FacilityWithPrimaryPhoto } from '@/lib/supabase/facilities';
import {
  applyToManageFacility, fetchMyFacilityApplications, findDuplicateCandidates,
  withdrawFacilityApplication, diffProposed,
  type FacilityApplication, type ProposedFacility, type DuplicateCandidate,
} from '@/lib/supabase/facilityApplications';

// Facility Marketplace Phase 1 — "Become a Facility Manager".
//
// Search, correct, submit. The corrections are the point: someone who runs the
// venue knows its court count, hours and phone, so the edits double as the
// evidence an admin reviews alongside the ownership claim. Nothing here writes
// to `facilities` — approval does that.
//
// Per DESIGN_TOKENS.md no local palette: tokens come from the theme barrel.

type Step = 'search' | 'edit' | 'status';

// court_count, indoor and outdoor are edited together deliberately.
// check_court_subtotals requires (indoor + outdoor) <= court_count unless
// court_count is 0, so editing one alone can produce an application that only
// fails at approval time — the worst place to discover it.
type Draft = {
  name: string; address: string; city: string; state: string;
  phone: string; website: string; hours_summary: string; description: string;
  court_count: string; indoor_courts: string; outdoor_courts: string;
};

const EMPTY: Draft = {
  name: '', address: '', city: '', state: '', phone: '', website: '',
  hours_summary: '', description: '', court_count: '', indoor_courts: '', outdoor_courts: '',
};

function draftFrom(f: Partial<FacilityWithPrimaryPhoto>): Draft {
  return {
    name: f.name ?? '', address: f.address ?? '', city: f.city ?? '', state: f.state ?? '',
    phone: f.phone ?? '', website: f.website ?? '', hours_summary: f.hours_summary ?? '',
    description: f.description ?? '',
    court_count: String(f.court_count ?? ''), indoor_courts: String(f.indoor_courts ?? ''),
    outdoor_courts: String(f.outdoor_courts ?? ''),
  };
}

function toProposed(d: Draft): ProposedFacility {
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
  return {
    name: d.name.trim(), address: d.address.trim(), city: d.city.trim(),
    state: d.state.trim().toUpperCase(),
    phone: d.phone.trim() || null, website: d.website.trim() || null,
    hours_summary: d.hours_summary.trim() || null, description: d.description.trim() || null,
    court_count: num(d.court_count), indoor_courts: num(d.indoor_courts),
    outdoor_courts: num(d.outdoor_courts),
  };
}

export default function FacilityApplyScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FacilityWithPrimaryPhoto[]>([]);
  const [searching, setSearching] = useState(false);

  const [picked, setPicked] = useState<FacilityWithPrimaryPhoto | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [note, setNote] = useState('');
  const [dupes, setDupes] = useState<DuplicateCandidate[]>([]);
  const [busy, setBusy] = useState(false);

  const [mine, setMine] = useState<FacilityApplication[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  const loadMine = useCallback(async () => {
    if (!user?.id) { setLoadingMine(false); return; }
    try {
      const rows = await fetchMyFacilityApplications();
      setMine(rows);
      if (rows.some(r => r.status === 'pending')) setStep('status');
    } catch {
      // A failed history load must not block a new application.
    } finally {
      setLoadingMine(false);
    }
  }, [user?.id]);

  useEffect(() => { void loadMine(); }, [loadMine]);

  const search = useCallback(async () => {
    if (query.trim().length < 3) { setResults([]); return; }
    setSearching(true);
    try {
      setResults(await fetchFacilities({ query: query.trim(), limit: 20 }));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  function pick(f: FacilityWithPrimaryPhoto) {
    setPicked(f); setIsNew(false); setDraft(draftFrom(f)); setDupes([]); setStep('edit');
  }

  async function startNew() {
    setPicked(null); setIsNew(true);
    setDraft({ ...EMPTY, name: query.trim() });
    setStep('edit');
    // Best-effort duplicate warning. Uses the results already on screen for a
    // rough centre — without coordinates there is nothing to compare against,
    // and a missing warning is better than blocking the flow.
    const near = results[0];
    if (near?.latitude != null && near?.longitude != null) {
      setDupes(await findDuplicateCandidates(query.trim(), near.latitude, near.longitude));
    }
  }

  const courtsValid = useMemo(() => {
    const c = Number(draft.court_count || 0);
    const i = Number(draft.indoor_courts || 0);
    const o = Number(draft.outdoor_courts || 0);
    return c === 0 || i + o <= c;
  }, [draft]);

  const canSubmit =
    !busy && courtsValid && note.trim().length >= 10 &&
    (isNew ? draft.name.trim() && draft.address.trim() && draft.city.trim() && draft.state.trim() : !!picked);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const full = toProposed(draft);
      // For an existing facility send only what changed, so the reviewer sees
      // edits rather than a full copy of the row.
      const proposed = isNew
        ? full
        : diffProposed(picked as unknown as Record<string, unknown>, full);

      const res = await applyToManageFacility({
        facilityId: isNew ? null : picked?.id ?? null,
        proposed,
        note,
      });
      if (!res.ok) { Alert.alert('Could not submit', res.message); return; }

      Alert.alert(
        'Application submitted',
        'We will review it and let you know. Approving a manager also applies the corrections you made.',
        [{ text: 'OK', onPress: () => { void loadMine(); setStep('status'); } }],
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    const res = await withdrawFacilityApplication(id);
    if (!res.ok) { Alert.alert('Could not withdraw', res.message); return; }
    await loadMine();
    setStep('search');
  }

  const pending = mine.filter(m => m.status === 'pending');

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack('/(tabs)/profile')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Facility Manager</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {loadingMine && <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xxl }} />}

        {/* ── Pending / decided applications ─────────────────────────────── */}
        {!loadingMine && step === 'status' && (
          <>
            {pending.length > 0 ? (
              <View style={s.card}>
                <Ionicons name="time-outline" size={28} color={colors.gold} />
                <Text style={s.cardTitle}>Application pending</Text>
                <Text style={s.cardBody}>
                  We are reviewing your request. You will be notified once a decision is made.
                </Text>
                <TouchableOpacity style={s.secondary} onPress={() => withdraw(pending[0].id)} activeOpacity={0.85}>
                  <Text style={s.secondaryText}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.card}>
                <Text style={s.cardTitle}>No pending application</Text>
                <TouchableOpacity style={s.secondary} onPress={() => setStep('search')} activeOpacity={0.85}>
                  <Text style={s.secondaryText}>Apply for a facility</Text>
                </TouchableOpacity>
              </View>
            )}

            {mine.filter(m => m.status !== 'pending').map(m => (
              <View key={m.id} style={s.historyRow}>
                <Text style={s.historyStatus}>{m.status.toUpperCase()}</Text>
                {!!m.reviewNote && <Text style={s.cardBody}>{m.reviewNote}</Text>}
              </View>
            ))}
          </>
        )}

        {/* ── Search ─────────────────────────────────────────────────────── */}
        {!loadingMine && step === 'search' && (
          <>
            <Text style={s.intro}>
              Manage your facility on Pickleball App: keep its details right, and later take
              bookings and post deals. Find your facility and correct anything that is wrong —
              that is how we know you run it.
            </Text>

            <View style={s.searchRow}>
              <Ionicons name="search" size={18} color={colors.textSub} />
              <TextInput
                style={s.searchInput}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={search}
                placeholder="Search by facility name"
                placeholderTextColor={colors.textSub}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searching && <ActivityIndicator size="small" color={colors.gold} />}
            </View>

            {results.map(f => (
              <TouchableOpacity key={f.id} style={s.resultRow} onPress={() => pick(f)} activeOpacity={0.8}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.resultName} numberOfLines={1}>{f.name}</Text>
                  <Text style={s.resultSub} numberOfLines={1}>
                    {[f.address, f.city, f.state].filter(Boolean).join(', ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSub} />
              </TouchableOpacity>
            ))}

            {query.trim().length >= 3 && !searching && (
              <TouchableOpacity style={s.addNew} onPress={startNew} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={20} color={colors.gold} />
                <Text style={s.addNewText}>Not listed? Add “{query.trim()}”</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Edit + submit ──────────────────────────────────────────────── */}
        {!loadingMine && step === 'edit' && (
          <>
            <TouchableOpacity onPress={() => setStep('search')} activeOpacity={0.7} style={s.backLink}>
              <Ionicons name="chevron-back" size={16} color={colors.textSub} />
              <Text style={s.backLinkText}>Choose a different facility</Text>
            </TouchableOpacity>

            {dupes.length > 0 && (
              <View style={s.warn}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.gold} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text style={s.warnText}>
                    These are already listed nearby. Pick one instead of adding a duplicate.
                  </Text>
                  {dupes.slice(0, 3).map(d => (
                    <Text key={d.id} style={s.warnItem} numberOfLines={1}>
                      • {d.name} — {Math.round(d.distanceMeters)}m
                    </Text>
                  ))}
                </View>
              </View>
            )}

            <Text style={s.sectionLabel}>{isNew ? 'NEW FACILITY' : 'CORRECT THE DETAILS'}</Text>

            <Field label="Name"     value={draft.name}    onChange={v => setDraft({ ...draft, name: v })} />
            <Field label="Address"  value={draft.address} onChange={v => setDraft({ ...draft, address: v })} />
            <Field label="City"     value={draft.city}    onChange={v => setDraft({ ...draft, city: v })} />
            <Field label="State"    value={draft.state}   onChange={v => setDraft({ ...draft, state: v })} autoCapitalize="characters" maxLength={2} />
            <Field label="Phone"    value={draft.phone}   onChange={v => setDraft({ ...draft, phone: v })} keyboardType="phone-pad" />
            <Field label="Website"  value={draft.website} onChange={v => setDraft({ ...draft, website: v })} autoCapitalize="none" />
            <Field label="Hours"    value={draft.hours_summary} onChange={v => setDraft({ ...draft, hours_summary: v })} />

            <View style={s.courtRow}>
              <Field label="Total courts"  value={draft.court_count}    onChange={v => setDraft({ ...draft, court_count: v })} keyboardType="number-pad" flex />
              <Field label="Indoor"        value={draft.indoor_courts}  onChange={v => setDraft({ ...draft, indoor_courts: v })} keyboardType="number-pad" flex />
              <Field label="Outdoor"       value={draft.outdoor_courts} onChange={v => setDraft({ ...draft, outdoor_courts: v })} keyboardType="number-pad" flex />
            </View>
            {!courtsValid && (
              <Text style={s.error}>
                Total courts must be at least indoor + outdoor.
              </Text>
            )}

            <Text style={s.sectionLabel}>YOUR ROLE</Text>
            <TextInput
              style={s.textarea}
              value={note}
              onChangeText={setNote}
              placeholder="What is your role at this facility, and how can we reach you to confirm?"
              placeholderTextColor={colors.textSub}
              multiline
              textAlignVertical="top"
              maxLength={1000}
              editable={!busy}
            />

            <TouchableOpacity
              style={[s.submit, !canSubmit && s.submitDisabled]}
              disabled={!canSubmit}
              activeOpacity={0.85}
              onPress={submit}
            >
              {busy
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={s.submitText}>Submit Application</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  autoCapitalize?: 'none' | 'characters' | 'sentences';
  maxLength?: number; flex?: boolean;
}) {
  return (
    <View style={[{ gap: spacing.xs }, props.flex && { flex: 1, minWidth: 0 }]}>
      <Text style={s.fieldLabel}>{props.label}</Text>
      <TextInput
        style={s.input}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboardType ?? 'default'}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        maxLength={props.maxLength}
        placeholderTextColor={colors.textSub}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingBottom: spacing.md, backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.navy, ...typography.pageTitle },

  intro: { color: colors.textSub, ...typography.body, lineHeight: 21 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bg, borderRadius: radius.card, borderWidth: 1,
    borderColor: colors.border, paddingHorizontal: spacing.md, minHeight: 48,
  },
  searchInput: { flex: 1, color: colors.navy, fontSize: 15 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    backgroundColor: colors.bg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
  },
  resultName: { color: colors.navy, ...typography.cardTitle },
  resultSub:  { color: colors.textSub, ...typography.metadata },

  addNew: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
    borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.goldBorder,
    backgroundColor: colors.goldBg,
  },
  addNewText: { color: colors.navy, fontWeight: '800', flex: 1 },

  backLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  backLinkText: { color: colors.textSub, ...typography.metadata },

  warn: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.card,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  warnText: { color: colors.text, ...typography.metadata, lineHeight: 17 },
  warnItem: { color: colors.navy, ...typography.metadata, fontWeight: '700' },

  sectionLabel: {
    color: colors.navy, fontSize: 13, fontWeight: '800', letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  fieldLabel: { color: colors.textSub, ...typography.metadata, fontWeight: '700' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.navy, fontSize: 15, backgroundColor: colors.bg, minHeight: 44,
  },
  courtRow: { flexDirection: 'row', gap: spacing.sm },
  error: { color: colors.danger, ...typography.metadata },

  textarea: {
    minHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
    padding: spacing.md, color: colors.navy, fontSize: 15, lineHeight: 20, backgroundColor: colors.bg,
  },

  card: {
    padding: spacing.xl, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: spacing.sm,
  },
  cardTitle: { color: colors.navy, ...typography.sectionTitle, textAlign: 'center' },
  cardBody:  { color: colors.textSub, ...typography.body, textAlign: 'center', lineHeight: 21 },

  historyRow: {
    padding: spacing.md, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  historyStatus: { color: colors.navy, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },

  secondary: {
    marginTop: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
    borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.border,
  },
  secondaryText: { color: colors.navy, fontSize: 15, fontWeight: '800' },

  submit: {
    backgroundColor: colors.navy, borderRadius: 30, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', minHeight: 52, marginTop: spacing.sm,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
