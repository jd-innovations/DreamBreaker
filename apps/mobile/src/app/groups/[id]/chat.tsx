import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Share,
  Modal, Pressable, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import EmojiPicker from 'rn-emoji-keyboard';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { fetchGroup, fetchGroupEvents, type Group } from '@/lib/groupService';
import { setPendingGroupId } from '@/lib/pendingGroupLink';
import {
  fetchMessages, sendMessage, subscribeToConversation, markConversationRead,
  uploadMessageAttachment, type Message,
} from '@/lib/conversationService';
import {
  fetchReactions, addReaction, removeReaction, subscribeToReactions,
  type MessageReaction,
} from '@/lib/messageReactions';
import {
  pickImageFromCamera, pickImageFromLibrary, pickAnyFile,
  AttachmentPermissionError, type PickedAttachment,
} from '@/lib/attachmentPicker';
import { ReactionPills, AttachmentOptionsSheet, FileAttachmentRow } from '@/components';
import { useSupportContext } from '@/lib/support/supportContext';
import { appLinks } from '@/lib/appLinks';
import type { Tables } from '@shared/database.types';

const FALLBACK_EVENT_IMAGE = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=200&fit=crop&q=80';

function routeForEvent(ev: Tables<'play_events'>): string {
  switch (ev.event_type) {
    case 'round_robin':      return `/round-robin/${ev.id}/standings`;
    case 'mini_tournament':  return `/mini-tournament/${ev.id}/bracket`;
    default:                 return `/quick-game-created?id=${ev.id}`;
  }
}

function CurrentEventsSheet({
  visible, groupId, onClose,
}: {
  visible: boolean; groupId: string; onClose: () => void;
}) {
  const [events, setEvents] = useState<Tables<'play_events'>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    fetchGroupEvents(groupId)
      .then(rows => { if (!cancelled) setEvents(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, groupId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={es.backdrop} onPress={onClose}>
        <Pressable style={es.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={es.grabber} />
          <View style={es.headerRow}>
            <Text style={es.title}>Current Events</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.navy} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={es.loading}><ActivityIndicator color={colors.gold} /></View>
          ) : events.length === 0 ? (
            <View style={es.empty}>
              <Ionicons name="calendar-outline" size={28} color={colors.border} />
              <Text style={es.emptyTitle}>No events yet</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={es.list} showsVerticalScrollIndicator={false}>
              {events.map(ev => (
                <TouchableOpacity
                  key={ev.id}
                  style={es.card}
                  activeOpacity={0.85}
                  onPress={() => { onClose(); router.push(routeForEvent(ev) as never); }}
                >
                  <Image source={{ uri: ev.cover_url ?? FALLBACK_EVENT_IMAGE }} style={es.cardImage} resizeMode="cover" />
                  <View style={es.cardBody}>
                    <Text style={es.cardTitle} numberOfLines={1}>{ev.name}</Text>
                    <Text style={es.cardMeta}>
                      {new Date(`${ev.event_date}T${ev.start_time ?? '00:00:00'}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={es.cardMeta} numberOfLines={1}>{ev.venue_name ?? ev.location}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const es = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, maxHeight: '75%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: colors.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  emptyTitle: { color: colors.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  list: { gap: 10, paddingBottom: 12 },
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: colors.page, borderRadius: shape.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', padding: 8,
  },
  cardImage: { width: 64, height: 64, borderRadius: shape.cta },
  cardBody: { flex: 1, justifyContent: 'center', gap: 3 },
  cardTitle: { color: colors.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  cardMeta: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500' },
});

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
};

function TextMessage({
  msg, isMe, reactions, currentUserId, onLongPress, onToggleReaction,
}: {
  msg: Message; isMe: boolean; reactions: MessageReaction[]; currentUserId: string | undefined;
  onLongPress: () => void; onToggleReaction: (emoji: string) => void;
}) {
  return (
    <View style={[tm.row, isMe && tm.rowMe]}>
      <View style={[tm.col, isMe && tm.colMe]}>
        <Pressable
          onLongPress={onLongPress}
          style={
            msg.attachment_type === 'image' ? tm.bubblePhoto
            : msg.attachment_type === 'file' ? [tm.bubble, isMe && tm.bubbleMe]
            : [tm.bubble, isMe && tm.bubbleMe]
          }
        >
          {msg.attachment_type === 'image' ? (
            <Image source={{ uri: msg.attachment_url! }} style={tm.photo} />
          ) : msg.attachment_type === 'file' ? (
            <FileAttachmentRow url={msg.attachment_url!} name={msg.attachment_name} onDark={isMe} />
          ) : (
            <Text style={[tm.text, isMe && tm.textMe]}>{msg.body}</Text>
          )}
        </Pressable>
        <ReactionPills
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
          align={isMe ? 'flex-end' : 'flex-start'}
        />
        <Text style={[tm.time, isMe && tm.timeMe]}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const tm = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 3 },
  rowMe: { flexDirection: 'row-reverse' },
  col: { maxWidth: '78%', gap: 3 },
  colMe: { alignItems: 'flex-end' },
  bubble: {
    backgroundColor: L.bg, borderRadius: shape.cta, borderTopLeftRadius: 4,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  bubbleMe: { backgroundColor: L.navy, borderColor: L.navy, borderTopLeftRadius: 14, borderTopRightRadius: 4 },
  bubblePhoto: { borderRadius: shape.cta, overflow: 'hidden' },
  photo: { width: 220, height: 220, backgroundColor: L.page },
  text: { color: L.text, fontSize: text.body.size, fontWeight: '500', lineHeight: 20 },
  textMe: { color: '#FFFFFF' },
  time: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', marginLeft: 4 },
  timeMe: { marginLeft: 0, marginRight: 4 },
});

export default function GroupChat() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const scrollRef = useRef<ScrollView>(null);

  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [eventsSheetVisible, setEventsSheetVisible] = useState(false);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);

  // Chat composer -- explicit user ask (§7): never float a support control over the input bar.
  useSupportContext({ feature: 'messaging', entityType: 'group', entityId: id, visibility: 'hidden' });
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { messageIdsRef.current = new Set(messages.map(m => m.id)); }, [messages]);

  useEffect(() => {
    if (!id || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const g = await fetchGroup(id);
        if (cancelled || !g?.conversation_id) return;
        setGroup(g);
        const msgs = await fetchMessages(g.conversation_id);
        if (cancelled) return;
        setMessages(msgs);
        fetchReactions(msgs.map(m => m.id)).then(rows => { if (!cancelled) setReactions(rows); });
        await markConversationRead(g.conversation_id, user.id);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, user?.id]);

  useEffect(() => {
    if (!group?.conversation_id || !user?.id) return;
    const conversationId = group.conversation_id;
    const unsubscribe = subscribeToConversation(conversationId, (msg) => {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== user.id) markConversationRead(conversationId, user.id);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return unsubscribe;
  }, [group?.conversation_id, user?.id]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, [messages.length]);

  useEffect(() => {
    const unsubscribe = subscribeToReactions(
      (row) => {
        if (!messageIdsRef.current.has(row.message_id)) return;
        setReactions(prev => (
          prev.some(r => r.message_id === row.message_id && r.user_id === row.user_id && r.emoji === row.emoji)
            ? prev
            : [...prev, row]
        ));
      },
      (row) => {
        if (!messageIdsRef.current.has(row.message_id)) return;
        setReactions(prev => prev.filter(r => !(r.message_id === row.message_id && r.user_id === row.user_id && r.emoji === row.emoji)));
      },
    );
    return unsubscribe;
  }, []);

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (!user?.id) return;
    const mine = reactions.some(r => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (mine) {
      setReactions(prev => prev.filter(r => !(r.message_id === messageId && r.user_id === user.id && r.emoji === emoji)));
      await removeReaction(messageId, user.id, emoji);
    } else {
      setReactions(prev => [...prev, { message_id: messageId, user_id: user.id, emoji }]);
      await addReaction(messageId, user.id, emoji);
    }
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body || !group?.conversation_id || !user?.id || sending) return;
    setDraft('');
    setSending(true);
    try {
      const msg = await sendMessage(group.conversation_id, user.id, body);
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(picked: PickedAttachment | null) {
    if (!picked || !group?.conversation_id || !user?.id) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadMessageAttachment(group.conversation_id, user.id, picked.uri, {
        fileName: picked.fileName, mimeType: picked.mimeType,
      });
      const msg = await sendMessage(group.conversation_id, user.id, '', {
        url, type: picked.kind, name: picked.fileName,
      });
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    } catch (e: unknown) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleTakePhoto() {
    try {
      await sendAttachment(await pickImageFromCamera());
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? 'Camera access needed' : 'Could not open camera';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function handleChooseLibrary() {
    try {
      await sendAttachment(await pickImageFromLibrary());
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? 'Photo library access needed' : 'Could not open photo library';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function handleChooseFile() {
    await sendAttachment(await pickAnyFile());
  }

  function handleCreateEvent() {
    if (!id) return;
    setPendingGroupId(id);
    router.push('/play-pickleball' as never);
  }

  function handleShare() {
    if (!id || !group) return;
    Share.share({ message: `Join "${group.name}" on Pickleball App: ${appLinks.group(id)}` });
  }

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={L.gold} />
      </View>
    );
  }

  return (
    <>
    <KeyboardAvoidingView
      style={[s.root]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="dark" />

      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{group?.name ?? 'Group Chat'}</Text>
          <Text style={s.headerSub}>{(group?.memberCount ?? 0).toLocaleString()} Members</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={s.messageList}
        contentContainerStyle={s.messageContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={32} color={L.border} />
            <Text style={s.emptyTitle}>No messages yet</Text>
            <Text style={s.emptySub}>Say hello to the group.</Text>
          </View>
        )}
        {messages.map((msg) => (
          <TextMessage
            key={msg.id}
            msg={msg}
            isMe={msg.sender_id === user?.id}
            reactions={reactions.filter(r => r.message_id === msg.id)}
            currentUserId={user?.id}
            onLongPress={() => setReactingTo(msg.id)}
            onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
          />
        ))}
      </ScrollView>

      <EmojiPicker
        open={reactingTo !== null}
        onClose={() => setReactingTo(null)}
        onEmojiSelected={(e) => {
          const messageId = reactingTo;
          setReactingTo(null);
          if (messageId) handleToggleReaction(messageId, e.emoji);
        }}
      />

      <View style={[s.composer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={s.quickActions}>
          <TouchableOpacity style={s.quickAction} onPress={() => setEventsSheetVisible(true)} activeOpacity={0.8}>
            <View style={s.quickActionCircle}><Ionicons name="albums-outline" size={20} color={L.gold} /></View>
            <Text style={s.quickActionLabel}>Current{'\n'}Events</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={handleCreateEvent} activeOpacity={0.8}>
            <View style={s.quickActionCircle}><Ionicons name="calendar-outline" size={20} color={L.gold} /></View>
            <Text style={s.quickActionLabel}>Create{'\n'}Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={handleShare} activeOpacity={0.8}>
            <View style={s.quickActionCircle}><Ionicons name="share-outline" size={20} color={L.gold} /></View>
            <Text style={s.quickActionLabel}>Share{'\n'}Group</Text>
          </TouchableOpacity>
        </View>

        <View style={s.inputRow}>
          <TouchableOpacity style={s.cameraBtn} onPress={() => setAttachmentSheetVisible(true)} disabled={uploadingPhoto}>
            {uploadingPhoto
              ? <ActivityIndicator size="small" color={L.textSub} />
              : <Ionicons name="camera-outline" size={22} color={L.textSub} />
            }
          </TouchableOpacity>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder={`Message ${group?.name ?? 'group'}...`}
              placeholderTextColor={L.textSub}
              value={draft}
              onChangeText={setDraft}
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
          </View>
          <TouchableOpacity
            style={[s.sendBtn, !draft.trim() && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
          >
            <Ionicons name="send" size={18} color={draft.trim() ? '#FFFFFF' : L.textSub} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
    {id && (
      <CurrentEventsSheet
        visible={eventsSheetVisible}
        groupId={id}
        onClose={() => setEventsSheetVisible(false)}
      />
    )}
    <AttachmentOptionsSheet
      visible={attachmentSheetVisible}
      onClose={() => setAttachmentSheetVisible(false)}
      onTakePhoto={handleTakePhoto}
      onChooseLibrary={handleChooseLibrary}
      onChooseFile={handleChooseFile}
    />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: L.bg, paddingHorizontal: 8,
    paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: L.border,
    gap: 4,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  headerSub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  messageList: { flex: 1 },
  messageContent: { padding: 12, gap: 2, paddingBottom: 20 },

  empty: { alignItems: 'center', gap: 8, paddingTop: 60 },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  emptySub: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },

  composer: { backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border, paddingTop: 8 },
  quickActions: { flexDirection: 'row', paddingHorizontal: 12, gap: 16, paddingBottom: 10 },
  quickAction: { alignItems: 'center', gap: 5 },
  quickActionCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: L.goldLight,
    alignItems: 'center', justifyContent: 'center',
  },
  quickActionLabel: { color: L.textSub, fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 13 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },
  cameraBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: L.page, borderRadius: shape.pill,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 8, gap: 6,
  },
  input: { flex: 1, color: L.text, fontSize: text.body.size, fontWeight: '500', maxHeight: 80, padding: 0 },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: L.border },
});
