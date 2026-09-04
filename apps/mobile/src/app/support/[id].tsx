import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { AttachmentOptionsSheet, FileAttachmentRow } from '@/components';
import { useSession } from '@/hooks/useSession';
import {
  fetchMessages, sendMessage as sendMessageToDb, markConversationRead,
  subscribeToConversation, uploadMessageAttachment, type Message as DbMessage,
} from '@/lib/conversationService';
import {
  fetchTicket, type SupportTicket, type SupportTicketStatus,
} from '@/lib/supportTicketService';
import {
  pickImageFromCamera, pickImageFromLibrary, pickAnyFile,
  AttachmentPermissionError, type PickedAttachment,
} from '@/lib/attachmentPicker';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy, gold: colors.gold,
  goldLight: colors.goldLight, text: colors.text, textSub: colors.textSub,
  textMuted: colors.textSub, border: colors.border, received: '#F0F4FA',
};

const STATUS_STYLE: Record<SupportTicketStatus, { label: string; bg: string; color: string }> = {
  open:        { label: 'Open',        bg: colors.successBg, color: colors.success },
  in_progress: { label: 'In Progress', bg: '#DBEAFE',         color: '#2563EB' },
  resolved:    { label: 'Resolved',    bg: '#F3F4F6',         color: '#6B7280' },
  closed:      { label: 'Closed',      bg: '#F3F4F6',         color: '#6B7280' },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user } = useSession();

  const [ticket, setTicket]     = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);

  const closed = ticket ? (ticket.status === 'resolved' || ticket.status === 'closed') : false;

  const load = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const t = await fetchTicket(id);
      setTicket(t);
      const msgs = await fetchMessages(t.conversation_id);
      setMessages(msgs);
      await markConversationRead(t.conversation_id, user.id);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ticket || !user?.id) return;
    const unsubscribe = subscribeToConversation(ticket.conversation_id, (msg) => {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== user.id) markConversationRead(ticket.conversation_id, user.id);
    });
    return unsubscribe;
  }, [ticket, user?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!ticket || !user?.id || !draft.trim() || sending) return;
    setSending(true);
    try {
      const sent = await sendMessageToDb(ticket.conversation_id, user.id, draft);
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
      setDraft('');
    } catch (e: unknown) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [ticket, user?.id, draft, sending]);

  const sendAttachment = useCallback(async (picked: PickedAttachment | null) => {
    if (!picked || !ticket || !user?.id) return;
    setUploading(true);
    try {
      const url = await uploadMessageAttachment(ticket.conversation_id, user.id, picked.uri, {
        fileName: picked.fileName, mimeType: picked.mimeType,
      });
      const sent = await sendMessageToDb(ticket.conversation_id, user.id, '', {
        url, type: picked.kind, name: picked.fileName,
      });
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (e: unknown) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  }, [ticket, user?.id]);

  const st = ticket ? STATUS_STYLE[ticket.status] : null;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.hdrTitle} numberOfLines={1}>{ticket?.subject ?? 'Ticket'}</Text>
          {st && (
            <View style={[s.badge, { backgroundColor: st.bg, alignSelf: 'flex-start' }]}>
              <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 26 }} />
      </View>
      <View style={s.headerBorder} />

      <ScrollView
        ref={scrollRef}
        style={s.messageList}
        contentContainerStyle={[s.messageContent, { paddingBottom: 16, flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={L.gold} />
          </View>
        ) : loadError ? (
          <View style={s.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={L.textMuted} />
            <Text style={s.stateText}>{loadError}</Text>
            <TouchableOpacity onPress={load} style={{ marginTop: 8 }}>
              <Text style={{ color: L.gold, fontWeight: '600' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : messages.length === 0 ? (
          <View style={s.centered}>
            <Ionicons name="chatbubble-outline" size={36} color={L.textMuted} />
            <Text style={s.stateText}>No messages yet</Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <View key={msg.id} style={isMine ? s.sentRow : s.receivedRow}>
                <View style={isMine ? s.sentBubble : s.receivedBubble}>
                  {msg.attachment_type === 'image' ? (
                    <Image source={{ uri: msg.attachment_url! }} style={s.msgPhoto} />
                  ) : msg.attachment_type === 'file' ? (
                    <FileAttachmentRow url={msg.attachment_url!} name={msg.attachment_name} onDark={isMine} />
                  ) : (
                    <Text style={isMine ? s.sentText : s.receivedText}>{msg.body}</Text>
                  )}
                </View>
                <Text style={[s.msgTime, isMine && { textAlign: 'right' }]}>{fmtTime(msg.created_at)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {closed ? (
        <View style={[s.closedBanner, { paddingBottom: insets.bottom + 12 }]}>
          <Ionicons name="checkmark-done-circle-outline" size={16} color={L.textMuted} />
          <Text style={s.closedText}>This ticket is {ticket?.status}. Open a new ticket if you need more help.</Text>
        </View>
      ) : (
        <View style={[s.inputArea, { paddingBottom: insets.bottom + 6 }]}>
          <View style={s.inputRow}>
            <TouchableOpacity style={s.inputIcon} onPress={() => setAttachmentSheetVisible(true)} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color={L.textMuted} />
                : <Ionicons name="attach-outline" size={22} color={L.textMuted} />
              }
            </TouchableOpacity>
            <View style={s.inputBox}>
              <TextInput
                style={s.inputText}
                placeholder="Reply…"
                placeholderTextColor={L.textMuted}
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!sending}
              />
            </View>
            <TouchableOpacity
              style={[s.inputIcon, s.sendBtn, draft.trim().length > 0 && s.sendBtnActive]}
              onPress={handleSend}
              disabled={!draft.trim() || sending}
              activeOpacity={0.75}
            >
              {sending
                ? <ActivityIndicator size="small" color={L.navy} />
                : <Ionicons name="send" size={18} color={draft.trim() ? L.navy : L.textMuted} />
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      <AttachmentOptionsSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={async () => {
          try { await sendAttachment(await pickImageFromCamera()); }
          catch (e: unknown) {
            const title = e instanceof AttachmentPermissionError ? 'Camera access needed' : 'Could not open camera';
            Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
          }
        }}
        onChooseLibrary={async () => {
          try { await sendAttachment(await pickImageFromLibrary()); }
          catch (e: unknown) {
            const title = e instanceof AttachmentPermissionError ? 'Photo library access needed' : 'Could not open photo library';
            Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
          }
        }}
        onChooseFile={async () => { await sendAttachment(await pickAnyFile()); }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  backBtn: { width: 26 },
  headerInfo: { flex: 1, gap: 4 },
  hdrTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerBorder: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },

  badge: { borderRadius: shape.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  messageList: { flex: 1 },
  messageContent: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 60 },
  stateText: { color: L.textMuted, fontSize: text.body.size, fontWeight: '500' },

  sentRow: { alignItems: 'flex-end', marginBottom: 14 },
  receivedRow: { alignItems: 'flex-start', marginBottom: 14 },
  sentBubble: {
    backgroundColor: L.navy, borderRadius: shape.card, borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '82%',
  },
  receivedBubble: {
    backgroundColor: L.received, borderRadius: shape.card, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '82%',
  },
  sentText: { color: L.bg, fontSize: text.body.size, fontWeight: '500', lineHeight: 20 },
  receivedText: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 20 },
  msgPhoto: { width: 200, height: 200, borderRadius: shape.cta },
  msgTime: { color: L.textMuted, fontSize: 11, marginTop: 4 },

  closedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  closedText: { flex: 1, color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },

  inputArea: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border, paddingHorizontal: 10, paddingTop: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  inputIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  inputBox: {
    flex: 1, backgroundColor: L.page, borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8, maxHeight: 100,
  },
  inputText: { color: L.text, fontSize: text.body.size, fontWeight: '500' },
  sendBtn: { backgroundColor: L.page, borderRadius: 18, borderWidth: 1, borderColor: L.border },
  sendBtnActive: { backgroundColor: L.gold, borderColor: L.gold },
});
