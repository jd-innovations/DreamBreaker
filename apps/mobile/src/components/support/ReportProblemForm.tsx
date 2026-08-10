import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  createSupportTicket,
  SUPPORT_TICKET_CATEGORIES,
  type SupportTicket,
  type SupportTicketCategory,
} from '@/lib/supportTicketService';
import { uploadMessageAttachment, sendMessage } from '@/lib/conversationService';
import { AttachmentOptionsSheet } from '@/components';
import {
  pickImageFromCamera,
  pickImageFromLibrary,
  pickAnyFile,
  AttachmentPermissionError,
  type PickedAttachment,
} from '@/lib/attachmentPicker';
import { buildDiagnosticsSnapshot } from '@/lib/support/supportDiagnostics';
import { suggestSupportCategory } from '@/lib/support/categoryRouting';
import { trackSupportEvent } from '@/lib/support/supportAnalytics';
import type { SupportContext } from '@/lib/support/supportContext';

function deriveSubject(description: string, entityLabel?: string): string {
  const firstLine = description.trim().split('\n')[0].slice(0, 80);
  if (firstLine) return entityLabel ? `${entityLabel}: ${firstLine}` : firstLine;
  return entityLabel ? `Issue with ${entityLabel}` : 'Support request';
}

export function ReportProblemForm({
  context,
  initialCategory,
  onSubmitted,
  onCancel,
}: {
  context: SupportContext | null;
  /** Preset category, e.g. 'feedback' for the Send Feedback entry point. Defaults to the §14 auto-suggestion. */
  initialCategory?: SupportTicketCategory;
  onSubmitted: (ticket: SupportTicket) => void;
  onCancel: () => void;
}) {
  const { user } = useSession();
  const [category, setCategory] = useState<SupportTicketCategory>(
    initialCategory ?? suggestSupportCategory(context),
  );
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAttachment = useCallback(async (picker: () => Promise<PickedAttachment | null>, permissionTitle: string) => {
    try {
      const picked = await picker();
      if (picked) setAttachment(picked);
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? permissionTitle : 'Could not attach file';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }, []);

  const canSubmit = description.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!user?.id || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const diagnostics = buildDiagnosticsSnapshot();
      const subject = deriveSubject(description, context?.entityLabel);
      const ticket = await createSupportTicket(user.id, subject, category, description.trim(), {
        context: context ?? undefined,
        diagnostics,
        source: 'floating_button',
      });

      if (attachment) {
        const url = await uploadMessageAttachment(ticket.conversation_id, user.id, attachment.uri, {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
        });
        await sendMessage(ticket.conversation_id, user.id, '', {
          url,
          type: attachment.kind,
          name: attachment.fileName,
        });
      }

      trackSupportEvent({
        name: 'support_report_submitted',
        payload: {
          category,
          feature: context?.feature ?? 'unknown',
          hasAttachment: !!attachment,
          hasErrorCode: !!context?.errorCode,
        },
      });

      onSubmitted(ticket);
    } catch (e: unknown) {
      // Inline, not a silent failure -- description/attachment are preserved so the user can retry (§18).
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View>
      <Text style={styles.label}>What&apos;s going on?</Text>
      <TextInput
        style={styles.textarea}
        value={description}
        onChangeText={setDescription}
        placeholder="Tell us what happened…"
        placeholderTextColor={colors.textSub}
        multiline
        textAlignVertical="top"
        autoFocus
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipRow}>
        {SUPPORT_TICKET_CATEGORIES.map(({ key, label }) => {
          const active = category === key;
          return (
            <Pressable
              key={key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setCategory(key)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.attachRow} onPress={() => setAttachmentSheetVisible(true)}>
        <Ionicons name="attach-outline" size={18} color={colors.gold} />
        <Text style={styles.attachText}>
          {attachment ? (attachment.fileName ?? 'Attachment added') : 'Add a screenshot or file'}
        </Text>
        {attachment ? (
          <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSub} />
          </Pressable>
        ) : null}
      </Pressable>

      <Pressable style={styles.disclosureToggle} onPress={() => setDisclosureOpen((v) => !v)}>
        <Ionicons name={disclosureOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSub} />
        <Text style={styles.disclosureToggleText}>What we&apos;ll include</Text>
      </Pressable>
      {disclosureOpen ? (
        <View style={styles.disclosureBody}>
          <DisclosureRow label="Screen" value={context?.entityLabel ?? context?.feature ?? 'General'} />
          <DisclosureRow label="App version & platform" value="Included automatically" />
          {context?.errorCode ? <DisclosureRow label="Last error code" value={context.errorCode} /> : null}
          <Text style={styles.disclosureFootnote}>
            Never included: message content, payment details, or anything you haven&apos;t typed above.
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.actionsRow}>
        <Pressable style={styles.cancelInlineBtn} onPress={onCancel} disabled={submitting}>
          <Text style={styles.cancelInlineText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? <ActivityIndicator size="small" color={colors.gold} /> : <Text style={styles.submitText}>Submit</Text>}
        </Pressable>
      </View>

      <AttachmentOptionsSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={() => pickAttachment(pickImageFromCamera, 'Camera access needed')}
        onChooseLibrary={() => pickAttachment(pickImageFromLibrary, 'Photo library access needed')}
        onChooseFile={() => pickAttachment(() => pickAnyFile(), 'Could not open files')}
      />
    </View>
  );
}

function DisclosureRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.disclosureRow}>
      <Text style={styles.disclosureLabel}>{label}</Text>
      <Text style={styles.disclosureValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.metadata, fontWeight: '700', color: colors.navy, marginBottom: spacing.sm, marginTop: spacing.md },
  textarea: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 100,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textSub },
  chipTextActive: { color: colors.gold },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.sm,
    backgroundColor: colors.goldBg,
  },
  attachText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.navy },
  disclosureToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  disclosureToggleText: { ...typography.metadata, color: colors.textSub, fontWeight: '600' },
  disclosureBody: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.page,
    gap: 6,
  },
  disclosureRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  disclosureLabel: { ...typography.metadata, color: colors.textSub },
  disclosureValue: { ...typography.metadata, color: colors.navy, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  disclosureFootnote: { ...typography.metadata, color: colors.textSub, marginTop: spacing.sm },
  errorText: { ...typography.metadata, color: colors.danger, marginTop: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  cancelInlineBtn: { flex: 1, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' },
  cancelInlineText: { fontSize: 15, fontWeight: '700', color: colors.textSub },
  submitBtn: {
    flex: 2,
    backgroundColor: colors.navy,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.gold, fontSize: 16, fontWeight: '800' },
});
