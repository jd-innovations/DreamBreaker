import React, { useEffect, useState } from 'react';
import {
  Modal, Pressable, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Switch,
} from 'react-native';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { CourtListEditor } from './CourtListEditor';
import { setTournamentAutoAssignCourts, setTournamentCourts } from '@/lib/supabase/tournaments';

/**
 * Sets a tournament's courts after creation: from the Command Center, and from
 * the bracket's court picker on the day. Saves through set_tournament_courts(),
 * which works while in_progress and doesn't send the tournament back for
 * approval, unlike Edit Tournament. Same slide-up idiom as ShareAppSheet.
 */
export function CourtsSheet({
  visible,
  onClose,
  tournamentId,
  courts,
  venueCourtCount,
  onSaved,
  autoAssign,
  onAutoAssignChanged,
}: {
  visible: boolean;
  onClose: () => void;
  tournamentId: string;
  courts: string[];
  venueCourtCount?: number | null;
  onSaved: (courts: string[]) => void;
  /** Current tournaments.auto_assign_courts. The switch is hidden when omitted. */
  autoAssign?: boolean;
  onAutoAssignChanged?: (enabled: boolean) => void;
}) {
  const [draft, setDraft] = useState<string[]>(courts);
  const [saving, setSaving] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);

  // Saves on its own, straight away; independent of the court list's Save.
  async function toggleAuto(enabled: boolean) {
    setTogglingAuto(true);
    const result = await setTournamentAutoAssignCourts(tournamentId, enabled);
    setTogglingAuto(false);
    if (!result.ok) {
      Alert.alert('Could not change auto-assign', result.error);
      return;
    }
    onAutoAssignChanged?.(enabled);
  }

  // Start from the saved list each time the sheet opens.
  useEffect(() => { if (visible) setDraft(courts); }, [visible, courts]);

  async function save() {
    setSaving(true);
    const result = await setTournamentCourts(tournamentId, draft);
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Could not save courts', result.error);
      return;
    }
    onSaved(result.courts);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        style={st.anchor}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={st.sheet}>
          <View style={st.grabber} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <Text style={st.title}>Tournament courts</Text>
            <Text style={st.sub}>
              The courts reserved for this event, by their number or name at the venue. Only these can be
              assigned to matches.
            </Text>
            {autoAssign !== undefined && (
              <View style={st.autoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.autoTitle}>Auto-assign courts</Text>
                  <Text style={st.autoSub}>
                    When a match finishes, its court goes to the next match that&apos;s ready: first
                    ready, first played. You can still assign or clear courts by hand.
                  </Text>
                </View>
                <Switch
                  value={autoAssign}
                  onValueChange={toggleAuto}
                  disabled={togglingAuto}
                  trackColor={{ true: colors.navy, false: colors.border }}
                  accessibilityLabel="Auto-assign courts"
                />
              </View>
            )}
            <CourtListEditor value={draft} onChange={setDraft} venueCourtCount={venueCourtCount} />
            <TouchableOpacity
              style={[st.save, saving && { opacity: 0.7 }]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={st.saveText}>Save courts</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,18,40,0.45)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: shape.card + 8, borderTopRightRadius: shape.card + 8,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, maxHeight: '85%',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, alignSelf: 'center',
    backgroundColor: colors.border, marginBottom: spacing.lg,
  },
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900', marginBottom: 4 },
  sub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18, marginBottom: spacing.lg },
  autoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.card,
    padding: spacing.md, marginBottom: spacing.lg,
  },
  autoTitle: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '800', marginBottom: 2 },
  autoSub: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 17 },
  save: {
    marginTop: spacing.xl, backgroundColor: colors.navy, borderRadius: shape.cta,
    paddingVertical: 14, alignItems: 'center',
  },
  saveText: { color: colors.white, fontSize: text.action.size, fontWeight: '800' },
});
