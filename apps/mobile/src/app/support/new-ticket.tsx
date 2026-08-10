import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import {
  createSupportTicket, SUPPORT_TICKET_CATEGORIES, type SupportTicketCategory,
} from '@/lib/supportTicketService';
import { uploadMessageAttachment, sendMessage } from '@/lib/conversationService';
import { AttachmentOptionsSheet } from '@/components';
import {
  pickImageFromCamera, pickImageFromLibrary, pickAnyFile,
  AttachmentPermissionError, type PickedAttachment,
} from '@/lib/attachmentPicker';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldBg: colors.goldBg, goldBorder: colors.goldBorder, blue: '#007AFF',
  text: colors.text, textSub: colors.textSub, textMuted: colors.textSub, border: colors.border,
};

const CATEGORIES = SUPPORT_TICKET_CATEGORIES;

const VALID_CATEGORIES = new Set(CATEGORIES.map(c => c.key));

export default function NewTicketScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { category: presetCategory } = useLocalSearchParams<{ category?: string }>();
  const initialCategory: SupportTicketCategory =
    presetCategory && VALID_CATEGORIES.has(presetCategory as SupportTicketCategory)
      ? (presetCategory as SupportTicketCategory)
      : 'other';

  const [subject, setSubject]   = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>(initialCategory);
  const [message, setMessage]   = useState('');
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pickAttachment = useCallback(async (picker: () => Promise<PickedAttachment | null>, permissionTitle: string) => {
    try {
      const picked = await picker();
      if (picked) setAttachment(picked);
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? permissionTitle : 'Could not attach file';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }, []);

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!user?.id || !canSubmit) return;
    setSubmitting(true);
    try {
      const ticket = await createSupportTicket(user.id, subject.trim(), category, message.trim());

      if (attachment) {
        const url = await uploadMessageAttachment(ticket.conversation_id, user.id, attachment.uri, {
          fileName: attachment.fileName, mimeType: attachment.mimeType,
        });
        await sendMessage(ticket.conversation_id, user.id, '', {
          url, type: attachment.kind, name: attachment.fileName,
        });
      }

      router.replace(`/support/${ticket.id}` as never);
    } catch (e: unknown) {
      Alert.alert('Could not submit ticket', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.blue} />
          <Text style={s.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Ticket</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.label}>Subject</Text>
        <TextInput
          style={s.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Briefly describe the issue"
          placeholderTextColor={L.textMuted}
          maxLength={120}
        />

        <Text style={s.label}>Category</Text>
        <View style={s.chipRow}>
          {CATEGORIES.map(({ key, label }) => {
            const active = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[s.chip, active && s.chipActive]}
                activeOpacity={0.75}
                onPress={() => setCategory(key)}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={s.label}>Message</Text>
        <TextInput
          style={s.textarea}
          value={message}
          onChangeText={setMessage}
          placeholder="Tell us what's going on…"
          placeholderTextColor={L.textMuted}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={s.attachRow}
          activeOpacity={0.7}
          onPress={() => setAttachmentSheetVisible(true)}
        >
          <Ionicons name="attach-outline" size={18} color={L.gold} />
          <Text style={s.attachText}>
            {attachment ? (attachment.fileName ?? 'Attachment added') : 'Add a screenshot or file'}
          </Text>
          {attachment && (
            <TouchableOpacity onPress={() => setAttachment(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={L.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
          activeOpacity={0.85}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting
            ? <ActivityIndicator size="small" color={L.bg} />
            : <Text style={s.submitText}>Submit Ticket</Text>
          }
        </TouchableOpacity>
      </ScrollView>

      <AttachmentOptionsSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={() => pickAttachment(pickImageFromCamera, 'Camera access needed')}
        onChooseLibrary={() => pickAttachment(pickImageFromLibrary, 'Photo library access needed')}
        onChooseFile={() => pickAttachment(() => pickAnyFile(), 'Could not open files')}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
    paddingHorizontal: 8, paddingVertical: 12,
  },
  backBtn:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minWidth: 80 },
  backText:    { color: L.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { color: L.navy, fontSize: 17, fontWeight: '700' },

  scroll: { padding: 20 },

  label: { color: L.navy, fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 18 },
  input: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: 10,
    paddingHorizontal: 14, height: 46, fontSize: 15, color: L.text, backgroundColor: L.bg,
  },
  textarea: {
    borderWidth: 1.5, borderColor: L.border, borderRadius: 10,
    padding: 14, minHeight: 120, fontSize: 15, color: L.text, backgroundColor: L.bg,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.textSub, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: L.gold },

  attachRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: L.goldBorder, borderRadius: 10, backgroundColor: L.goldBg,
  },
  attachText: { flex: 1, color: L.navy, fontSize: 14, fontWeight: '600' },

  submitBtn: {
    marginTop: 28, backgroundColor: L.navy, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: L.gold, fontSize: 16, fontWeight: '800' },
});
