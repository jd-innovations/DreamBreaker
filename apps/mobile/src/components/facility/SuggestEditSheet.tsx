// Structured "Suggest an Edit" for a court (Phase 4, 2026-11-25).
//
// Replaces the free-text support ticket: the sheet is prefilled with what the
// directory says, the player changes what is wrong, and only the changed
// fields go to submit_facility_submission() — the same review queue the web
// uses. Field labels and limits come from @shared/facilitySubmissions.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { colors, spacing } from '@/theme';
import { radius as shape, text } from '@shared/tokens';
import { FIELD_LABELS } from '@shared/facilitySubmissions';
import { submitFacilitySubmission } from '@/lib/supabase/facilitySubmissions';
import type { Facility } from '@/lib/supabase/facilities';
import { haptics } from '@/lib/haptics';

type Tri = 'yes' | 'no' | '';
type Form = {
  court_count: string; outdoor_courts: string; indoor_courts: string;
  lighting: Tri; public_access: Tri;
  hours_summary: string; phone: string; website: string;
};

const NUM_KEYS = ['court_count', 'outdoor_courts', 'indoor_courts'] as const;
const TEXT_KEYS = ['hours_summary', 'phone', 'website'] as const;
const BOOL_KEYS = ['lighting', 'public_access'] as const;

const num = (v: number | null | undefined) => (v && v > 0 ? String(v) : '');
const tri = (v: boolean | null | undefined): Tri => (v === true ? 'yes' : v === false ? 'no' : '');

function fromFacility(f: Facility): Form {
  return {
    court_count: num(f.court_count), outdoor_courts: num(f.outdoor_courts), indoor_courts: num(f.indoor_courts),
    lighting: tri(f.lighting), public_access: tri(f.public_access),
    hours_summary: f.hours_summary ?? '', phone: f.phone ?? '', website: f.website ?? '',
  };
}

export function SuggestEditSheet({ facility, visible, onClose }: { facility: Facility; visible: boolean; onClose: () => void }) {
  const base = useMemo(() => fromFacility(facility), [facility]);
  const [form, setForm] = useState<Form>(base);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm(cur => ({ ...cur, [k]: v })); setError(null); };

  /** Only what changed, typed for the database. Clearing a field is not a change we send. */
  function changes(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of NUM_KEYS) {
      const v = form[k].trim();
      if (v !== base[k] && v !== '') out[k] = Number(v);
    }
    for (const k of TEXT_KEYS) {
      const v = form[k].trim();
      if (v !== base[k].trim() && v !== '') out[k] = v;
    }
    for (const k of BOOL_KEYS) if (form[k] !== base[k] && form[k] !== '') out[k] = form[k] === 'yes';
    return out;
  }

  const changed = Object.keys(changes()).length > 0 || note.trim().length > 0;

  async function send() {
    const proposed = changes();
    const website = proposed.website as string | undefined;
    if (website && !/^https?:\/\//i.test(website)) { setError('Website must start with http:// or https://.'); return; }
    for (const k of NUM_KEYS) {
      const n = proposed[k] as number | undefined;
      if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 100)) { setError(`${FIELD_LABELS[k]} must be a whole number up to 100.`); return; }
    }
    setBusy(true); setError(null);
    try {
      await submitFacilitySubmission({ kind: 'edit', facilityId: facility.id, proposed, note });
      haptics.success();
      onClose();
      setNote('');
      Alert.alert('Thanks, we got it', 'Our team reviews every update before it goes live. We’ll let you know when it’s approved.');
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setForm(base); setNote(''); setError(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.backdrop} onPress={close}>
          <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
            <View style={s.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 4 }}>
                <Text style={s.title}>Suggest an Edit</Text>
                <Text style={s.sub}>Fix anything that’s wrong about {facility.name}. Our team reviews it before it goes live.</Text>
              </View>

              <View style={s.row}>
                {NUM_KEYS.map(k => (
                  <View key={k} style={s.numCell}>
                    <Text style={s.label}>{k === 'court_count' ? 'Total courts' : k === 'outdoor_courts' ? 'Outdoor' : 'Indoor'}</Text>
                    <TextInput
                      style={[s.input, s.numInput]}
                      value={form[k]}
                      onChangeText={v => set(k, v.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      placeholder="?"
                      placeholderTextColor={colors.textSub}
                      accessibilityLabel={FIELD_LABELS[k]}
                    />
                  </View>
                ))}
              </View>

              {BOOL_KEYS.map(k => (
                <View key={k} style={s.toggleRow}>
                  <Text style={s.toggleLabel}>{k === 'lighting' ? 'Lights for night play' : 'Open to the public'}</Text>
                  <View style={s.chips}>
                    {(['yes', 'no'] as const).map(v => (
                      <TouchableOpacity
                        key={v}
                        style={[s.chip, form[k] === v && s.chipOn]}
                        onPress={() => set(k, form[k] === v ? '' : v)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: form[k] === v }}
                      >
                        <Text style={[s.chipText, form[k] === v && s.chipTextOn]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}

              {TEXT_KEYS.map(k => (
                <View key={k} style={{ gap: 6 }}>
                  <Text style={s.label}>{FIELD_LABELS[k]}</Text>
                  <TextInput
                    style={s.input}
                    value={form[k]}
                    onChangeText={v => set(k, v)}
                    maxLength={k === 'hours_summary' ? 300 : k === 'phone' ? 30 : 300}
                    keyboardType={k === 'phone' ? 'phone-pad' : k === 'website' ? 'url' : 'default'}
                    autoCapitalize={k === 'website' ? 'none' : 'sentences'}
                    autoCorrect={k === 'hours_summary'}
                    placeholder={k === 'hours_summary' ? 'e.g. Daily 7am–10pm' : k === 'website' ? 'https://' : ''}
                    placeholderTextColor={colors.textSub}
                  />
                </View>
              ))}

              <View style={{ gap: 6 }}>
                <Text style={s.label}>Anything else? (optional)</Text>
                <TextInput
                  style={[s.input, s.noteInput]}
                  value={note}
                  onChangeText={v => { setNote(v); setError(null); }}
                  placeholder="e.g. It closed, it moved, the courts were resurfaced…"
                  placeholderTextColor={colors.textSub}
                  multiline
                  textAlignVertical="top"
                  maxLength={1000}
                />
              </View>

              {!!error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}

              <TouchableOpacity
                style={[s.submit, (!changed || busy) && s.submitDisabled]}
                onPress={() => { void send(); }}
                disabled={!changed || busy}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={s.submitText}>Send for review</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancel} onPress={close} disabled={busy}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  sub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 19 },
  label: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  numCell: { flex: 1, gap: 6 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.cta, paddingHorizontal: 12, paddingVertical: 11,
    color: colors.navy, fontSize: text.body.size, backgroundColor: colors.page,
  },
  numInput: { textAlign: 'center', fontWeight: '800' },
  noteInput: { minHeight: 80 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  toggleLabel: { flex: 1, color: colors.navy, fontSize: text.body.size, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  chipTextOn: { color: colors.bg },
  error: { color: colors.danger, fontSize: text.caption.size, fontWeight: '600' },
  submit: { backgroundColor: colors.navy, borderRadius: shape.cta, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: colors.bg, fontSize: text.actionLarge.size, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: colors.textSub, fontSize: text.action.size, fontWeight: '800' },
});
