import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';
import { haptics } from '@/lib/haptics';
import { PERSON_REPORT_REASONS, reportUser, type ReportReason } from '@/lib/services/reporting';
import { blockUser } from '@/lib/services/blocking';

/**
 * Report a person, from anywhere (TODO1.1 item 4.3).
 *
 * One component shared by the profile screen and the message thread. Two
 * separate implementations would drift, and this is a flow where drift means
 * one surface quietly offering fewer reasons — or forgetting to offer the block.
 *
 * ── Report and block are offered together ───────────────────────────────────
 *
 * They answer different needs and people in the moment want both: reporting
 * asks us to act, blocking stops the contact now. Making someone find two
 * separate controls while being harassed is a poor time to be teaching product
 * structure. Blocking is opt-in rather than automatic, because a report about
 * a stranger's listing is not the same as one about someone you are in a group
 * with.
 *
 * ── Failure handling ────────────────────────────────────────────────────────
 *
 * The report is the part that must not be lost, so it goes first. If the
 * optional block then fails, the report still stands and the user is told
 * precisely that — rather than a generic failure that leaves them unsure
 * whether anything was recorded at all.
 */
export function ReportUserSheet({
  visible,
  onClose,
  reporterId,
  reportedId,
  reportedName,
  conversationId,
  onBlocked,
}: {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  reportedId: string;
  reportedName?: string | null;
  conversationId?: string | null;
  /** Called after a successful block so the caller can leave the thread. */
  onBlocked?: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [notes, setNotes] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const who = reportedName ?? 'this account';

  function reset() {
    setReason(null);
    setNotes('');
    setAlsoBlock(true);
    setSubmitting(false);
  }

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);

    try {
      await reportUser({ reporterId, reportedId, reason, conversationId, notes });
    } catch {
      setSubmitting(false);
      Alert.alert('Could not send report', 'Check your connection and try again.');
      return;
    }

    let blockFailed = false;
    if (alsoBlock) {
      try {
        await blockUser(reporterId, reportedId);
      } catch {
        blockFailed = true;
      }
    }

    haptics.success();
    setSubmitting(false);
    reset();
    onClose();

    if (blockFailed) {
      Alert.alert(
        'Report sent',
        `We've received your report. We could not block ${who} — you can do that from Account Settings.`,
      );
      return;
    }

    Alert.alert(
      'Report sent',
      alsoBlock
        ? `Thanks — our team will review this. ${who} has been blocked.`
        : 'Thanks — our team will review this.',
    );

    if (alsoBlock) onBlocked?.();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
          <View style={s.sheet}>
            <View style={s.header}>
              <Text style={s.title}>Report {who}</Text>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionLabel}>What happened?</Text>

              {PERSON_REPORT_REASONS.map((option) => {
                const selected = reason === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[s.option, selected && s.optionSelected]}
                    onPress={() => setReason(option.value)}
                    activeOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={selected ? colors.navy : colors.textMuted}
                    />
                    <View style={s.optionText}>
                      <Text style={s.optionLabel}>{option.label}</Text>
                      <Text style={s.optionHint}>{option.hint}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <Text style={s.sectionLabel}>Anything else? (optional)</Text>
              <TextInput
                style={s.notes}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add details that would help us review this"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={s.blockRow}
                onPress={() => setAlsoBlock((v) => !v)}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: alsoBlock }}
              >
                <Ionicons
                  name={alsoBlock ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={alsoBlock ? colors.navy : colors.textMuted}
                />
                <Text style={s.blockText}>
                  Also block {who} — they won&apos;t be able to message you
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.submit, (!reason || submitting) && s.submitDisabled]}
                onPress={() => { void submit(); }}
                disabled={!reason || submitting}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {submitting
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={s.submitText}>Send report</Text>}
              </TouchableOpacity>

              <Text style={s.footnote}>
                Reports are reviewed by our team. We don&apos;t tell the other person who reported them.
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.navy, flex: 1 },
  body: { padding: 20, gap: 10, paddingBottom: 36 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: colors.textMuted, textTransform: 'uppercase', marginTop: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.navy, backgroundColor: colors.page },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: colors.navy },
  optionHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  notes: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: colors.text,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  blockText: { flex: 1, fontSize: 13, color: colors.text },
  submit: {
    marginTop: 8,
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  footnote: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 17 },
});
