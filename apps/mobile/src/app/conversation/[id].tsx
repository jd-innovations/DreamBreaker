import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import EmojiPicker from 'rn-emoji-keyboard';
import { colors } from '@/theme';
import { goBack } from '@/lib/navigation';
import {
  AppIcon, PickleballIcon, ReactionPills, AttachmentOptionsSheet, FileAttachmentRow,
  type AppIconName,
} from '@/components';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { ReportUserSheet } from '@/components/safety/ReportUserSheet';
import {
  fetchMessages,
  sendMessage as sendMessageToDb,
  markConversationRead,
  getOrCreateTournamentConversation,
  subscribeToConversation,
  uploadMessageAttachment,
  type Message as DbMessage,
} from '@/lib/conversationService';
import {
  fetchReactions, addReaction, removeReaction, subscribeToReactions,
  type MessageReaction,
} from '@/lib/messageReactions';
import {
  pickImageFromCamera, pickImageFromLibrary, pickAnyFile,
  AttachmentPermissionError, type PickedAttachment,
} from '@/lib/attachmentPicker';

const { width: SW } = Dimensions.get('window');

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:        colors.bg,
  page:      colors.page,
  navy:      colors.navy,
  gold:      colors.gold,
  goldLight: colors.goldLight,
  text:      colors.text,
  textSub:   colors.textSub,
  textMuted: colors.textSub,
  border:    colors.border,
  online:    '#34C759',
  received:  '#F0F4FA',
  green:     colors.success,
  greenBg:   colors.successBg,
};

function ChatKeyboardAvoidingView({
  children,
  style,
}: {
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={style}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// ─── Event group chat data ────────────────────────────────────────────────────

type Member = {
  id: string; name: string; initials: string; bg: string;
  role: 'Organizer' | 'Member'; rating: string; isMe?: boolean;
};

type EventChat = {
  eventId: string; name: string; venue: string; datetime: string;
  memberCount: number; members: Member[];
  messages: GroupMessage[];
};

type GroupMessage =
  | { id: string; type: 'system';    text: string; time: string }
  | { id: string; type: 'date_sep';  label: string }
  | { id: string; type: 'received';  authorId: string; authorInitials: string; authorBg: string; authorName: string; text: string; time: string; showAuthor: boolean }
  | { id: string; type: 'sent';      text: string; time: string; read: boolean };

const EVENT_CHATS: Record<string, EventChat> = {
  'event-1': {
    eventId: '1',
    name: 'Wednesday Round Robin',
    venue: 'Lakewood Ranch Courts',
    datetime: 'Wed, May 21 · 6:00 PM',
    memberCount: 13,
    members: [
      { id: 'ar', name: 'Anna Rodriguez', initials: 'AR', bg: '#4A8C6F', role: 'Organizer', rating: '4.1 DUPR' },
      { id: 'jd', name: 'Jake Davis',     initials: 'JD', bg: '#0A1228', role: 'Member',    rating: '3.8 DUPR' },
      { id: 'sm', name: 'Sarah M.',       initials: 'SM', bg: '#4A8C6F', role: 'Member',    rating: '4.0 DUPR' },
      { id: 'jr', name: 'John R.',        initials: 'JR', bg: '#3A6B9A', role: 'Member',    rating: '3.5 DUPR' },
      { id: 'mk', name: 'Mike K.',        initials: 'MK', bg: '#7A4F3A', role: 'Member',    rating: '4.2 DUPR' },
      { id: 'lp', name: 'Laura P.',       initials: 'LP', bg: '#2D5A3D', role: 'Member',    rating: '3.9 DUPR' },
      { id: 'tc', name: 'Tom C.',         initials: 'TC', bg: '#5A3A7A', role: 'Member',    rating: '3.7 DUPR' },
      { id: 'me', name: 'You',            initials: 'ME', bg: '#C9A84C', role: 'Member',    rating: '3.8 DUPR', isMe: true },
    ],
    messages: [
      { id: 'd1',  type: 'date_sep', label: 'Yesterday' },
      { id: 'sys1',type: 'system',   text: 'Anna Rodriguez created the group chat', time: '2:30 PM' },
      { id: 'm1',  type: 'received', authorId: 'ar', authorInitials: 'AR', authorBg: '#4A8C6F', authorName: 'Anna', text: "Welcome everyone to the Wednesday Round Robin chat! 🎾 See you all Wednesday at 6pm.", time: '2:32 PM', showAuthor: true },
      { id: 'm2',  type: 'received', authorId: 'jd', authorInitials: 'JD', authorBg: '#0A1228', authorName: 'Jake', text: "Can't wait! Will there be warm-up time before the matches start?", time: '3:10 PM', showAuthor: true },
      { id: 'm3',  type: 'received', authorId: 'ar', authorInitials: 'AR', authorBg: '#4A8C6F', authorName: 'Anna', text: "Yes! Courts open at 5:45 so 15 min warm-up before we start rotating.", time: '3:14 PM', showAuthor: true },
      { id: 'm4',  type: 'received', authorId: 'sm', authorInitials: 'SM', authorBg: '#4A8C6F', authorName: 'Sarah', text: "Awesome, thank you! Do we need to bring our own balls?", time: '4:20 PM', showAuthor: true },
      { id: 'm5',  type: 'received', authorId: 'ar', authorInitials: 'AR', authorBg: '#4A8C6F', authorName: 'Anna', text: "I'll have 4 cans ready. Bring one extra just in case 🎾", time: '4:25 PM', showAuthor: true },
      { id: 'd2',  type: 'date_sep', label: 'Today' },
      { id: 'm6',  type: 'received', authorId: 'mk', authorInitials: 'MK', authorBg: '#7A4F3A', authorName: 'Mike', text: "Good morning everyone! Ready for tonight 💪", time: '9:02 AM', showAuthor: true },
      { id: 'm7',  type: 'received', authorId: 'jr', authorInitials: 'JR', authorBg: '#3A6B9A', authorName: 'John', text: "Same! Anyone carpooling from Bradenton?", time: '9:18 AM', showAuthor: true },
      { id: 'sys2',type: 'system',   text: 'You joined the group', time: '11:30 AM' },
      { id: 'm8',  type: 'sent',     text: "Hey everyone! Just joined — looking forward to tonight! 🎾", time: '11:31 AM', read: true },
    ],
  },
};

// ─── Attendees slide card ─────────────────────────────────────────────────────

function AttendeesCard({ members, total }: { members: Member[]; total: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={ac.wrap}>
      {/* Collapsed row — always visible */}
      <TouchableOpacity
        style={ac.header}
        activeOpacity={0.75}
        onPress={() => setExpanded(v => !v)}
      >
        {/* Overlapping avatars */}
        <View style={ac.avatarRow}>
          {members.slice(0, 5).map((m, i) => (
            <View key={m.id} style={[ac.avatar, { backgroundColor: m.bg, marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i }]}>
              {m.isMe ? (
                <Ionicons name="person" size={14} color="#FFF" />
              ) : (
                <Text style={ac.avatarText}>{m.initials}</Text>
              )}
            </View>
          ))}
          {total > 5 && (
            <View style={[ac.avatar, ac.moreAvatar, { marginLeft: -10 }]}>
              <Text style={ac.moreText}>+{total - 5}</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={ac.countText}>{total} attending</Text>
        </View>

        <View style={[ac.chevronWrap, expanded && { transform: [{ rotate: '180deg' }] }]}>
          <Ionicons name="chevron-down" size={16} color={L.textSub} />
        </View>
      </TouchableOpacity>

      {/* Expanded member list */}
      {expanded && (
        <View style={ac.memberList}>
          <View style={ac.listDivider} />
          {members.map((m, i) => (
            <View key={m.id} style={[ac.memberRow, i < members.length - 1 && ac.memberRowBorder]}>
              <View style={[ac.memberAvatar, { backgroundColor: m.bg }]}>
                {m.isMe ? (
                  <Ionicons name="person" size={16} color="#FFF" />
                ) : (
                  <Text style={ac.memberInitials}>{m.initials}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ac.memberName}>{m.isMe ? 'You' : m.name}</Text>
                <Text style={ac.memberRating}>{m.rating}</Text>
              </View>
              {m.role === 'Organizer' && (
                <View style={ac.organizerBadge}>
                  <Ionicons name="shield-checkmark" size={11} color={L.gold} />
                  <Text style={ac.organizerText}>Organizer</Text>
                </View>
              )}
              {m.isMe && (
                <View style={[ac.organizerBadge, { backgroundColor: L.greenBg, borderColor: L.green }]}>
                  <Text style={[ac.organizerText, { color: L.green }]}>You</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const ac = StyleSheet.create({
  wrap: { backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: L.bg,
  },
  avatarText:   { color: '#FFF', fontSize: 11, fontWeight: '800' },
  moreAvatar:   { backgroundColor: L.border },
  moreText:     { color: L.textSub, fontSize: 10, fontWeight: '800' },
  countText:    { color: L.navy, fontSize: 13, fontWeight: '700' },
  chevronWrap:  { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  memberList:   { paddingBottom: 4 },
  listDivider:  { height: 1, backgroundColor: L.border, marginHorizontal: 16 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: L.border },
  memberAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  memberInitials: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  memberName:     { color: L.navy, fontSize: 14, fontWeight: '700' },
  memberRating:   { color: L.textMuted, fontSize: 12, marginTop: 1 },
  organizerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: L.goldLight, borderRadius: 20, borderWidth: 1, borderColor: '#E8D9B0',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  organizerText: { color: L.navy, fontSize: 11, fontWeight: '700' },
});

// ─── Event Group Chat screen ──────────────────────────────────────────────────

function EventGroupChat({ chatData }: { chatData: EventChat }) {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState('');

  const GROUP_QUICK_ACTIONS = [
    { id: 'event',    icon: 'pickleball', label: 'View Event'   },
    { id: 'schedule', icon: 'calendar-outline',   label: 'Schedule'     },
    { id: 'carpool',  icon: 'car-outline',        label: 'Carpool'      },
    { id: 'photo',    icon: 'camera-outline',     label: 'Share Photo'  },
  ];

  return (
    <ChatKeyboardAvoidingView style={[eg.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={eg.header}>
        <TouchableOpacity style={eg.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>

        <View style={eg.iconCircle}>
          <PickleballIcon size={22} color={L.navy} />
        </View>

        <View style={eg.headerInfo}>
          <Text style={eg.hdrName} numberOfLines={1}>{chatData.name}</Text>
          <View style={eg.hdrMeta}>
            <Ionicons name="location-outline" size={11} color={L.textMuted} />
            <Text style={eg.hdrMetaText} numberOfLines={1}>{chatData.venue}</Text>
            <View style={eg.hdrDot} />
            <Text style={eg.hdrMetaText}>{chatData.datetime}</Text>
          </View>
        </View>

        <View style={eg.hdrActions}>
          <TouchableOpacity style={eg.hdrActionCircle} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={18} color={L.textSub} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={eg.headerBorder} />

      {/* Attendees slide card */}
      <AttendeesCard members={chatData.members} total={chatData.memberCount} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={eg.messageList}
        contentContainerStyle={[eg.messageContent, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {chatData.messages.map((msg) => {
          if (msg.type === 'date_sep') {
            return (
              <View key={msg.id} style={eg.dateSep}>
                <Text style={eg.dateSepText}>{msg.label}</Text>
              </View>
            );
          }

          if (msg.type === 'system') {
            return (
              <View key={msg.id} style={eg.systemRow}>
                <Text style={eg.systemText}>{msg.text} · {msg.time}</Text>
              </View>
            );
          }

          if (msg.type === 'received') {
            return (
              <View key={msg.id} style={eg.receivedRow}>
                <View style={[eg.msgAvatar, { backgroundColor: msg.authorBg }]}>
                  <Text style={eg.msgAvatarText}>{msg.authorInitials}</Text>
                </View>
                <View style={eg.receivedGroup}>
                  {msg.showAuthor && (
                    <Text style={eg.authorName}>{msg.authorName}</Text>
                  )}
                  <View style={eg.receivedBubble}>
                    <Text style={eg.receivedText}>{msg.text}</Text>
                  </View>
                  <Text style={eg.msgTime}>{msg.time}</Text>
                </View>
              </View>
            );
          }

          if (msg.type === 'sent') {
            return (
              <View key={msg.id} style={eg.sentRow}>
                <View style={eg.sentGroup}>
                  <View style={eg.sentBubble}>
                    <Text style={eg.sentText}>{msg.text}</Text>
                  </View>
                  <View style={eg.sentMeta}>
                    <Text style={eg.msgTime}>{msg.time}</Text>
                    {msg.read && (
                      <Ionicons name="checkmark-done" size={15} color={L.navy} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                </View>
              </View>
            );
          }

          return null;
        })}
      </ScrollView>

      {/* Input bar */}
      <View style={[eg.inputArea, { paddingBottom: insets.bottom + 6 }]}>
        <View style={eg.inputRow}>
          <TouchableOpacity style={eg.inputIcon}>
            <Ionicons name="camera-outline" size={24} color={L.textMuted} />
          </TouchableOpacity>
          <View style={eg.inputBox}>
            <TextInput
              style={eg.inputText}
              placeholder="Message the group..."
              placeholderTextColor={L.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>
          <TouchableOpacity style={eg.inputIcon}>
            <Ionicons name="happy-outline" size={24} color={L.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[eg.inputIcon, eg.sendBtn, message.length > 0 && eg.sendBtnActive]}>
            <Ionicons name="send" size={18} color={message.length > 0 ? L.navy : L.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={eg.quickRow}>
          {GROUP_QUICK_ACTIONS.map((a) => (
            <TouchableOpacity key={a.id} style={eg.quickPill} activeOpacity={0.75}>
              <AppIcon name={a.icon as AppIconName} size={14} color={L.textSub} />
              <Text style={eg.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </ChatKeyboardAvoidingView>
  );
}

const eg = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    backgroundColor: L.bg,
  },
  backBtn:    { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerInfo:   { flex: 1, gap: 2 },
  hdrName:      { color: L.navy, fontSize: 16, fontWeight: '800' },
  hdrMeta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hdrMetaText:  { color: L.textMuted, fontSize: 11, fontWeight: '500' },
  hdrDot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.textMuted },
  hdrActions:   { flexDirection: 'row', gap: 6, flexShrink: 0 },
  hdrActionCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerBorder: { height: 1, backgroundColor: L.border },

  messageList:    { flex: 1, backgroundColor: L.bg },
  messageContent: { paddingTop: 16, paddingHorizontal: 16 },

  dateSep:     { alignItems: 'center', marginBottom: 16 },
  dateSepText: { color: L.textMuted, fontSize: 12, fontWeight: '500' },

  systemRow: { alignItems: 'center', marginBottom: 14 },
  systemText: {
    color: L.textMuted, fontSize: 11, fontWeight: '500',
    backgroundColor: L.page, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },

  receivedRow: { flexDirection: 'row', marginBottom: 10, gap: 8, alignItems: 'flex-end' },
  msgAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  msgAvatarText:  { color: '#FFF', fontSize: 11, fontWeight: '800' },
  receivedGroup:  { flex: 1, maxWidth: SW * 0.70, gap: 3 },
  authorName:     { color: L.textSub, fontSize: 11, fontWeight: '700', marginBottom: 1 },
  receivedBubble: {
    backgroundColor: L.received, borderRadius: 18, borderTopLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
  },
  receivedBubblePhoto: {
    borderRadius: 18, borderTopLeftRadius: 4, overflow: 'hidden', alignSelf: 'flex-start',
  },
  receivedText:   { color: L.text, fontSize: 15, lineHeight: 21 },

  sentRow:    { alignItems: 'flex-end', marginBottom: 10 },
  sentGroup:  { maxWidth: SW * 0.70, gap: 3 },
  sentBubble: {
    backgroundColor: L.navy, borderRadius: 18, borderTopRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-end',
  },
  sentBubblePhoto: {
    borderRadius: 18, borderTopRightRadius: 4, overflow: 'hidden', alignSelf: 'flex-end',
  },
  msgPhoto:   { width: SW * 0.55, height: SW * 0.55, backgroundColor: L.page },
  sentText:   { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  sentMeta:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  msgTime:    { color: L.textMuted, fontSize: 11, fontWeight: '400', marginTop: 2 },

  inputArea: {
    backgroundColor: L.bg,
    borderTopWidth: 1, borderTopColor: L.border,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, gap: 6, marginBottom: 10,
  },
  inputIcon:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  inputBox: {
    flex: 1, backgroundColor: L.page,
    borderRadius: 22, borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, maxHeight: 120,
  },
  inputText:      { color: L.text, fontSize: 15, padding: 0, lineHeight: 20 },
  sendBtn:        { backgroundColor: L.page, borderRadius: 18, borderWidth: 1, borderColor: L.border },
  sendBtnActive:  { backgroundColor: L.gold, borderColor: L.gold },
  quickRow:       { paddingHorizontal: 12, gap: 8, paddingBottom: 4 },
  quickPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: L.bg,
  },
  quickLabel: { color: L.textSub, fontSize: 13, fontWeight: '600' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8, backgroundColor: L.bg },
  backBtn:    { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar:     { width: 52, height: 52, borderRadius: 26 },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: L.online, borderWidth: 2, borderColor: L.bg,
  },
  headerInfo:   { flex: 1, gap: 2 },
  nameRow:      { flexDirection: 'row', alignItems: 'center' },
  hdrName:      { color: L.navy, fontSize: 17, fontWeight: '800' },
  hdrMeta:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hdrMetaText:  { color: L.textSub, fontSize: 12, fontWeight: '600' },
  hdrDot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: L.textMuted },
  onlinePip:    { width: 8, height: 8, borderRadius: 4, backgroundColor: L.online },
  hdrOnline:    { color: L.textSub, fontSize: 12, fontWeight: '500' },
  partnerScorePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldLight, borderRadius: 20, borderWidth: 1, borderColor: '#E8D9B0',
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  partnerScoreBar:  { width: 3, height: 12, borderRadius: 1.5, backgroundColor: L.gold },
  partnerScoreText: { color: L.textSub, fontSize: 11, fontWeight: '600' },
  partnerScoreNum:  { color: L.navy,    fontSize: 11, fontWeight: '900' },
  hdrActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  hdrAction:  { alignItems: 'center', gap: 4 },
  hdrActionCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  hdrActionLabel:   { color: L.textMuted, fontSize: 10, fontWeight: '500' },
  headerBorder:     { height: 1, backgroundColor: L.border },
  messageList:      { flex: 1, backgroundColor: L.bg },
  messageContent:   { paddingTop: 16, paddingHorizontal: 16 },
  dateSep:          { alignItems: 'center', marginBottom: 16 },
  dateSepText:      { color: L.textMuted, fontSize: 12, fontWeight: '500' },
  receivedRow:      { flexDirection: 'row', marginBottom: 12, gap: 8 },
  receivedAvatarSlot:{ width: 34, flexShrink: 0, justifyContent: 'flex-end' },
  msgAvatar:        { width: 34, height: 34, borderRadius: 17 },
  receivedGroup:    { flex: 1, maxWidth: SW * 0.72, gap: 4 },
  receivedBubble: {
    backgroundColor: L.received, borderRadius: 18, borderTopLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
  },
  receivedBubblePhoto: {
    borderRadius: 18, borderTopLeftRadius: 4, overflow: 'hidden', alignSelf: 'flex-start',
  },
  receivedText:     { color: L.text, fontSize: 15, lineHeight: 21 },
  sentRow:          { alignItems: 'flex-end', marginBottom: 12 },
  sentGroup:        { maxWidth: SW * 0.72, gap: 4 },
  sentBubble: {
    backgroundColor: L.navy, borderRadius: 18, borderTopRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-end',
  },
  sentBubblePhoto: {
    borderRadius: 18, borderTopRightRadius: 4, overflow: 'hidden', alignSelf: 'flex-end',
  },
  msgPhoto:         { width: SW * 0.55, height: SW * 0.55, backgroundColor: L.page },
  sentText:         { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  sentMeta:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  msgTime:          { color: L.textMuted, fontSize: 11, fontWeight: '400', marginTop: 2 },
  tournamentWrap:   { marginBottom: 12, gap: 4 },
  inputArea: {
    backgroundColor: L.bg, borderTopWidth: 1, borderTopColor: L.border, paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 12, gap: 6, marginBottom: 10,
  },
  inputIcon:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  inputBox: {
    flex: 1, backgroundColor: L.page,
    borderRadius: 22, borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 9, minHeight: 40, maxHeight: 120,
  },
  inputText:  { color: L.text, fontSize: 15, padding: 0, lineHeight: 20 },
  quickRow:   { paddingHorizontal: 12, gap: 8, paddingBottom: 4 },
  quickPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: L.bg,
  },
  quickLabel: { color: L.textSub, fontSize: 13, fontWeight: '600' },
});

// ─── Generic DM (director / organizer) ───────────────────────────────────────

type GenericDmConfig = {
  name: string;
  initials: string;
  bg: string;
  role: string;
  context: string;
  messages: Array<
    | { id: string; type: 'sent';     text: string; time: string; read: boolean }
    | { id: string; type: 'received'; text: string; time: string }
    | { id: string; type: 'date_sep'; label: string }
  >;
  quickActions: { id: string; icon: AppIconName; label: string }[];
  inputPlaceholder: string;
};

const GENERIC_DMS: Record<string, GenericDmConfig> = {
  'dm-director': {
    name: 'Mike Johnson',
    initials: 'MJ',
    bg: '#2D3A5A',
    role: 'Tournament Director',
    context: 'Summer Slam 2025',
    messages: [
      { id: 'd1', type: 'date_sep', label: 'Today' },
      { id: 'm1', type: 'sent',     text: "Hi Mike! I have a question about the Summer Slam registration.", time: '9:14 AM', read: true },
      { id: 'm2', type: 'received', text: "Hey! Of course — happy to help. What's on your mind?",         time: '9:16 AM' },
      { id: 'm3', type: 'sent',     text: "Can partners register separately and get placed on the same team?", time: '9:17 AM', read: true },
      { id: 'm4', type: 'received', text: "Yes — as long as both register for the same division and list each other as partners during checkout, the system will match you automatically.", time: '9:19 AM' },
      { id: 'm5', type: 'received', text: "Let me know if anything else comes up! Looking forward to seeing you on the courts 🎾", time: '9:19 AM' },
    ],
    quickActions: [
      { id: 'tournament', icon: 'trophy-outline',    label: 'Summer Slam'    },
      { id: 'schedule',   icon: 'calendar-outline',  label: 'Schedule'       },
      { id: 'register',   icon: 'person-add-outline',label: 'Registration'   },
      { id: 'rules',      icon: 'document-outline',  label: 'Rules & Format' },
    ],
    inputPlaceholder: 'Message Mike…',
  },
  'dm-organizer': {
    name: 'Anna Rodriguez',
    initials: 'AR',
    bg: '#4A8C6F',
    role: 'Event Organizer',
    context: 'Wednesday Round Robin',
    messages: [
      { id: 'd1', type: 'date_sep', label: 'Today' },
      { id: 'm1', type: 'sent',     text: "Hi Anna! Quick question about Wednesday's round robin.", time: '11:02 AM', read: true },
      { id: 'm2', type: 'received', text: "Hi! Sure, what's up?",                                  time: '11:04 AM' },
      { id: 'm3', type: 'sent',     text: "Is there a warm-up period before the first rotation?",   time: '11:05 AM', read: true },
      { id: 'm4', type: 'received', text: "Yes — courts open at 5:45 so we have about 15 minutes to warm up before the first round at 6:00.", time: '11:06 AM' },
      { id: 'm5', type: 'received', text: "See you Wednesday! 🎾",                                  time: '11:06 AM' },
    ],
    quickActions: [
      { id: 'event',    icon: 'pickleball',  label: 'View Event'  },
      { id: 'schedule', icon: 'calendar-outline',    label: 'Schedule'    },
      { id: 'location', icon: 'location-outline',    label: 'Directions'  },
      { id: 'players',  icon: 'people-outline',      label: 'Players'     },
    ],
    inputPlaceholder: 'Message Anna…',
  },
};

function GenericDMConversation({ config }: { config: GenericDmConfig }) {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState('');

  return (
    <ChatKeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>

        {/* Initials avatar */}
        <View style={[gd.avatar, { backgroundColor: config.bg }]}>
          <Text style={gd.avatarText}>{config.initials}</Text>
        </View>

        <View style={s.headerInfo}>
          <Text style={s.hdrName}>{config.name}</Text>
          <View style={s.hdrMeta}>
            <Ionicons name="shield-checkmark-outline" size={12} color={L.gold} />
            <Text style={s.hdrMetaText}>{config.role}</Text>
          </View>
          <View style={gd.contextPill}>
            <PickleballIcon size={11} color={L.gold} />
            <Text style={gd.contextText}>{config.context}</Text>
          </View>
        </View>

        <View style={s.hdrActions}>
          <TouchableOpacity style={s.hdrAction} activeOpacity={0.7}>
            <View style={s.hdrActionCircle}>
              <Ionicons name="ellipsis-horizontal" size={18} color={L.textSub} />
            </View>
            <Text style={s.hdrActionLabel}>More</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={s.headerBorder} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={s.messageList}
        contentContainerStyle={[s.messageContent, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {config.messages.map((msg) => {
          if (msg.type === 'date_sep') {
            return (
              <View key={msg.id} style={s.dateSep}>
                <Text style={s.dateSepText}>{msg.label}</Text>
              </View>
            );
          }
          if (msg.type === 'received') {
            return (
              <View key={msg.id} style={s.receivedRow}>
                <View style={s.receivedAvatarSlot}>
                  <View style={[gd.msgAvatar, { backgroundColor: config.bg }]}>
                    <Text style={gd.msgAvatarText}>{config.initials}</Text>
                  </View>
                </View>
                <View style={s.receivedGroup}>
                  <View style={s.receivedBubble}>
                    <Text style={s.receivedText}>{msg.text}</Text>
                  </View>
                  <Text style={s.msgTime}>{msg.time}</Text>
                </View>
              </View>
            );
          }
          if (msg.type === 'sent') {
            return (
              <View key={msg.id} style={s.sentRow}>
                <View style={s.sentGroup}>
                  <View style={s.sentBubble}>
                    <Text style={s.sentText}>{msg.text}</Text>
                  </View>
                  <View style={s.sentMeta}>
                    <Text style={s.msgTime}>{msg.time}</Text>
                    {msg.read && <Ionicons name="checkmark-done" size={15} color={L.navy} style={{ marginLeft: 4 }} />}
                  </View>
                </View>
              </View>
            );
          }
          return null;
        })}
      </ScrollView>

      {/* Input bar */}
      <View style={[s.inputArea, { paddingBottom: insets.bottom + 6 }]}>
        <View style={s.inputRow}>
          <TouchableOpacity style={s.inputIcon}>
            <Ionicons name="camera-outline" size={24} color={L.textMuted} />
          </TouchableOpacity>
          <View style={s.inputBox}>
            <TextInput
              style={s.inputText}
              placeholder={config.inputPlaceholder}
              placeholderTextColor={L.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
            />
          </View>
          <TouchableOpacity style={s.inputIcon}>
            <Ionicons name="happy-outline" size={24} color={L.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.inputIcon}>
            <Ionicons name="mic-outline" size={24} color={L.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>
          {config.quickActions.map((a) => (
            <TouchableOpacity key={a.id} style={s.quickPill} activeOpacity={0.75}>
              <AppIcon name={a.icon} size={14} color={L.textSub} />
              <Text style={s.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </ChatKeyboardAvoidingView>
  );
}

const gd = StyleSheet.create({
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  contextPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.goldLight, borderRadius: 20, borderWidth: 1, borderColor: '#E8D9B0',
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  contextText:  { color: L.textSub, fontSize: 11, fontWeight: '600' },
  msgAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  msgAvatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
});

// ─── Real partner DM (Supabase-backed conversation UUID) ─────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function RealDMScreen({ conversationId }: { conversationId: string }) {
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user }  = useSession();

  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [partner, setPartner]   = useState<{ id: string; name: string; photoUri?: string; dupr?: number } | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [msgError, setMsgError] = useState<string | null>(null);
  // True when the conversation row can't be found — either it genuinely
  // doesn't exist, or RLS is filtering it out because this user isn't a
  // participant. Both cases render the same generic not-found state
  // deliberately, so an unauthorized user can't distinguish "doesn't exist"
  // from "you don't have access" (that distinction would itself leak
  // conversation existence, which RLS is designed to hide).
  const [notFound, setNotFound] = useState(false);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { messageIdsRef.current = new Set(messages.map(m => m.id)); }, [messages]);

  // Load partner info once
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('participant_a, participant_b')
        .eq('id', conversationId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !conv) {
        setNotFound(true);
        return;
      }

      const partnerId = conv.participant_a === user.id ? conv.participant_b : conv.participant_a;
      if (!partnerId) {
        setNotFound(true);
        return;
      }

      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, dupr, self_rating')
        .eq('id', partnerId)
        .single();

      if (!cancelled && p) {
        setPartner({
          id: partnerId,
          name: p.full_name,
          photoUri: p.avatar_url ?? undefined,
          dupr: p.dupr ?? (p.self_rating ? parseFloat(p.self_rating) : undefined),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, user?.id]);

  // Load messages + mark read
  const loadMessages = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setMsgError(null);
    try {
      const data = await fetchMessages(conversationId);
      setMessages(data);
      fetchReactions(data.map(m => m.id)).then(setReactions);
      await markConversationRead(conversationId, user.id);
    } catch (e: unknown) {
      setMsgError(e instanceof Error ? e.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId, user?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

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

  // Live-append messages sent by the other participant. Own sends are
  // appended optimistically in handleSend, so dedupe by id here.
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToConversation(conversationId, (msg) => {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== user.id) markConversationRead(conversationId, user.id);
    });
    return unsubscribe;
  }, [conversationId, user?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!user?.id || !draft.trim() || sending) return;
    setSending(true);
    try {
      const sent = await sendMessageToDb(conversationId, user.id, draft);
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
      setDraft('');
    } catch (e: unknown) {
      // Surface the failure; draft is preserved so the user can retry.
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  }, [conversationId, user?.id, draft, sending]);

  const sendAttachment = useCallback(async (picked: PickedAttachment | null) => {
    if (!picked || !user?.id) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadMessageAttachment(conversationId, user.id, picked.uri, {
        fileName: picked.fileName, mimeType: picked.mimeType,
      });
      const sent = await sendMessageToDb(conversationId, user.id, '', {
        url, type: picked.kind, name: picked.fileName,
      });
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (e: unknown) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [conversationId, user?.id]);

  const handleTakePhoto = useCallback(async () => {
    try {
      await sendAttachment(await pickImageFromCamera());
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? 'Camera access needed' : 'Could not open camera';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }, [sendAttachment]);

  const handleChooseLibrary = useCallback(async () => {
    try {
      await sendAttachment(await pickImageFromLibrary());
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? 'Photo library access needed' : 'Could not open photo library';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }, [sendAttachment]);

  const handleChooseFile = useCallback(async () => {
    await sendAttachment(await pickAnyFile());
  }, [sendAttachment]);

  const name = partner?.name ?? '…';
  const [reportOpen, setReportOpen] = useState(false);

  if (notFound) {
    return <ConversationUnavailable insetsTop={insets.top} />;
  }

  return (
    <ChatKeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>

        <View style={s.avatarWrap}>
          {partner?.photoUri
            ? <Image source={{ uri: partner.photoUri }} style={s.avatar} />
            : <View style={[s.avatar, { backgroundColor: L.page, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: L.border }]}>
                <Ionicons name="person" size={24} color={L.textSub} />
              </View>
          }
        </View>

        <View style={s.headerInfo}>
          <View style={s.nameRow}>
            <Text style={s.hdrName}>{name}</Text>
          </View>
          {partner?.dupr != null && (
            <View style={s.hdrMeta}>
              <Ionicons name="star" size={13} color={L.gold} />
              <Text style={s.hdrMetaText}>{partner.dupr.toFixed(1)} DUPR</Text>
            </View>
          )}
        </View>

        <View style={s.hdrActions}>
          <TouchableOpacity
            style={s.hdrAction}
            activeOpacity={0.7}
            onPress={() => partner && router.push(`/match/profile/${partner.id}` as never)}
          >
            <View style={s.hdrActionCircle}>
              <Ionicons name="person-outline" size={18} color={L.textSub} />
            </View>
            <Text style={s.hdrActionLabel}>Profile</Text>
          </TouchableOpacity>

          {/* 4.3. Reporting has to be reachable from the thread itself: being
              harassed in a DM and having to navigate elsewhere to report it is
              the moment a safety flow fails. Blocking already worked from
              Marketplace only, and reports did not exist for people at all. */}
          <TouchableOpacity
            style={s.hdrAction}
            activeOpacity={0.7}
            onPress={() => setReportOpen(true)}
            disabled={!partner}
            accessibilityRole="button"
            accessibilityLabel="Report this person"
          >
            <View style={s.hdrActionCircle}>
              <Ionicons name="flag-outline" size={18} color={L.textSub} />
            </View>
            <Text style={s.hdrActionLabel}>Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      {partner && user?.id ? (
        <ReportUserSheet
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          reporterId={user.id}
          reportedId={partner.id}
          reportedName={partner.name}
          conversationId={conversationId}
          // Blocking hides this conversation (20260831040000), so staying here
          // would leave the user looking at a thread that no longer loads.
          onBlocked={() => goBack()}
        />
      ) : null}

      <View style={s.headerBorder} />

      <ScrollView
        ref={scrollRef}
        style={s.messageList}
        contentContainerStyle={[s.messageContent, { paddingBottom: 16, flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={rd.centered}>
            <ActivityIndicator size="large" color={L.gold} />
          </View>
        ) : msgError ? (
          <View style={rd.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={L.textMuted} />
            <Text style={rd.stateText}>{msgError}</Text>
            <TouchableOpacity onPress={loadMessages} style={{ marginTop: 8 }}>
              <Text style={{ color: L.gold, fontWeight: '600' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : messages.length === 0 ? (
          <View style={rd.centered}>
            <Ionicons name="chatbubble-outline" size={36} color={L.textMuted} />
            <Text style={rd.stateText}>Start the conversation</Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isSent = msg.sender_id === user?.id;
            const msgReactions = reactions.filter(r => r.message_id === msg.id);
            if (isSent) {
              return (
                <View key={msg.id} style={s.sentRow}>
                  <View style={s.sentGroup}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onLongPress={() => setReactingTo(msg.id)}
                      style={msg.attachment_type === 'image' ? s.sentBubblePhoto : s.sentBubble}
                    >
                      {msg.attachment_type === 'image' ? (
                        <Image source={{ uri: msg.attachment_url! }} style={s.msgPhoto} />
                      ) : msg.attachment_type === 'file' ? (
                        <FileAttachmentRow url={msg.attachment_url!} name={msg.attachment_name} onDark />
                      ) : (
                        <Text style={s.sentText}>{msg.body}</Text>
                      )}
                    </TouchableOpacity>
                    <ReactionPills
                      reactions={msgReactions}
                      currentUserId={user?.id}
                      onToggle={(emoji) => handleToggleReaction(msg.id, emoji)}
                      align="flex-end"
                    />
                    <View style={s.sentMeta}>
                      <Text style={s.msgTime}>{fmtTime(msg.created_at)}</Text>
                      {msg.read_at && (
                        <Ionicons name="checkmark-done" size={15} color={L.navy} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </View>
                </View>
              );
            }
            return (
              <View key={msg.id} style={s.receivedRow}>
                <View style={s.receivedAvatarSlot}>
                  {partner?.photoUri
                    ? <Image source={{ uri: partner.photoUri }} style={s.msgAvatar} />
                    : <View style={[s.msgAvatar, { backgroundColor: L.page, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={16} color={L.textSub} />
                      </View>
                  }
                </View>
                <View style={s.receivedGroup}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onLongPress={() => setReactingTo(msg.id)}
                    style={msg.attachment_type === 'image' ? s.receivedBubblePhoto : s.receivedBubble}
                  >
                    {msg.attachment_type === 'image' ? (
                      <Image source={{ uri: msg.attachment_url! }} style={s.msgPhoto} />
                    ) : msg.attachment_type === 'file' ? (
                      <FileAttachmentRow url={msg.attachment_url!} name={msg.attachment_name} />
                    ) : (
                      <Text style={s.receivedText}>{msg.body}</Text>
                    )}
                  </TouchableOpacity>
                  <ReactionPills
                    reactions={msgReactions}
                    currentUserId={user?.id}
                    onToggle={(emoji) => handleToggleReaction(msg.id, emoji)}
                    align="flex-start"
                  />
                  <Text style={s.msgTime}>{fmtTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[s.inputArea, { paddingBottom: insets.bottom + 6 }]}>
        <View style={s.inputRow}>
          <TouchableOpacity style={s.inputIcon} onPress={() => setAttachmentSheetVisible(true)} disabled={uploadingPhoto}>
            {uploadingPhoto
              ? <ActivityIndicator size="small" color={L.textMuted} />
              : <Ionicons name="camera-outline" size={24} color={L.textMuted} />
            }
          </TouchableOpacity>
          <View style={s.inputBox}>
            <TextInput
              style={s.inputText}
              placeholder={`Message ${name}…`}
              placeholderTextColor={L.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              editable={!sending}
            />
          </View>
          <TouchableOpacity style={s.inputIcon}>
            <Ionicons name="happy-outline" size={24} color={L.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.inputIcon, rd.sendBtn, draft.trim().length > 0 && rd.sendBtnActive]}
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

      <EmojiPicker
        open={reactingTo !== null}
        onClose={() => setReactingTo(null)}
        onEmojiSelected={(e) => {
          const messageId = reactingTo;
          setReactingTo(null);
          if (messageId) handleToggleReaction(messageId, e.emoji);
        }}
      />

      <AttachmentOptionsSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={handleTakePhoto}
        onChooseLibrary={handleChooseLibrary}
        onChooseFile={handleChooseFile}
      />
    </ChatKeyboardAvoidingView>
  );
}

const rd = StyleSheet.create({
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { color: L.textMuted, fontSize: 14, fontWeight: '500' },
  sendBtn:   { backgroundColor: L.page, borderRadius: 18, borderWidth: 1, borderColor: L.border },
  sendBtnActive: { backgroundColor: L.gold, borderColor: L.gold },
});

// ─── Real tournament group chat (Supabase-backed contextual conversation) ────

function groupInitials(name: string): string {
  return name.split(' ').map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2) || '··';
}

const GROUP_AVATAR_COLORS = ['#4A8C6F', '#3A6B9A', '#7A4F3A', '#2D5A3D', '#5A3A7A', '#0A1228'];
function groupColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GROUP_AVATAR_COLORS[hash % GROUP_AVATAR_COLORS.length];
}

// Works for any Supabase-backed group conversation. Everything below the
// `convId` lookup is already generic -- only resolving that id and the header
// title were tournament-specific -- so `group` and `support` conversations
// render here too rather than needing a second implementation.
function RealGroupChat({
  tournamentId,
  conversationId,
  initialTitle,
}: {
  tournamentId?: string;
  conversationId?: string;
  initialTitle?: string;
}) {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { user }  = useSession();

  const [convId, setConvId]     = useState<string | null>(null);
  const [title, setTitle]       = useState(initialTitle ?? 'Tournament Chat');
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [senders, setSenders]   = useState<Record<string, string>>({});
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { messageIdsRef.current = new Set(messages.map(m => m.id)); }, [messages]);

  // Tournament name for the header. Skipped when the screen was opened from a
  // conversation id, which supplies its own title.
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('name')
        .eq('id', tournamentId)
        .maybeSingle();
      if (!cancelled && data?.name) setTitle(data.name);
    })();
    return () => { cancelled = true; };
  }, [tournamentId]);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const cid = conversationId
        ?? await getOrCreateTournamentConversation(tournamentId!, user.id);
      setConvId(cid);
      const data = await fetchMessages(cid);
      setMessages(data);
      fetchReactions(data.map(m => m.id)).then(setReactions);

      // Resolve sender display names for received (group) messages in one query.
      const ids = [...new Set(data.map(m => m.sender_id))].filter(sid => sid !== user.id);
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        const map: Record<string, string> = {};
        for (const p of profs ?? []) map[p.id] = p.full_name ?? 'Player';
        setSenders(map);
      }

      await markConversationRead(cid, user.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, user?.id]);

  useEffect(() => { load(); }, [load]);

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

  // Live-append messages from other tournament participants. Resolve the
  // sender's display name lazily if we haven't seen them yet.
  useEffect(() => {
    if (!user?.id || !convId) return;
    const unsubscribe = subscribeToConversation(convId, (msg) => {
      setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== user.id) {
        markConversationRead(convId, user.id);
        setSenders(prev => {
          if (prev[msg.sender_id]) return prev;
          supabase.from('profiles').select('id, full_name').eq('id', msg.sender_id).maybeSingle()
            .then(({ data }) => {
              if (data?.full_name) setSenders(p => ({ ...p, [data.id]: data.full_name }));
            });
          return prev;
        });
      }
    });
    return unsubscribe;
  }, [convId, user?.id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    if (!user?.id || !convId || !draft.trim() || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    try {
      const sent = await sendMessageToDb(convId, user.id, body);
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
    } catch {
      setDraft(body); // restore so the user keeps their text
    } finally {
      setSending(false);
    }
  }, [convId, user?.id, draft, sending]);

  const sendAttachment = useCallback(async (picked: PickedAttachment | null) => {
    if (!picked || !user?.id || !convId) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadMessageAttachment(convId, user.id, picked.uri, {
        fileName: picked.fileName, mimeType: picked.mimeType,
      });
      const sent = await sendMessageToDb(convId, user.id, '', {
        url, type: picked.kind, name: picked.fileName,
      });
      setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (e: unknown) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [convId, user?.id]);

  const handleTakePhoto = useCallback(async () => {
    try {
      await sendAttachment(await pickImageFromCamera());
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? 'Camera access needed' : 'Could not open camera';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }, [sendAttachment]);

  const handleChooseLibrary = useCallback(async () => {
    try {
      await sendAttachment(await pickImageFromLibrary());
    } catch (e: unknown) {
      const title = e instanceof AttachmentPermissionError ? 'Photo library access needed' : 'Could not open photo library';
      Alert.alert(title, e instanceof Error ? e.message : 'Please try again.');
    }
  }, [sendAttachment]);

  const handleChooseFile = useCallback(async () => {
    await sendAttachment(await pickAnyFile());
  }, [sendAttachment]);

  return (
    <ChatKeyboardAvoidingView style={[eg.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={eg.header}>
        <TouchableOpacity style={eg.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>
        <View style={eg.iconCircle}>
          <Ionicons name="trophy" size={20} color={L.navy} />
        </View>
        <View style={eg.headerInfo}>
          <Text style={eg.hdrName} numberOfLines={1}>{title}</Text>
          <View style={eg.hdrMeta}>
            <Ionicons name="people-outline" size={11} color={L.textMuted} />
            <Text style={eg.hdrMetaText}>Tournament group chat</Text>
          </View>
        </View>
      </View>
      <View style={eg.headerBorder} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={eg.messageList}
        contentContainerStyle={[eg.messageContent, { paddingBottom: 16, flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={rd.centered}>
            <ActivityIndicator size="large" color={L.gold} />
          </View>
        ) : error ? (
          <View style={rd.centered}>
            <Ionicons name="alert-circle-outline" size={36} color={L.textMuted} />
            <Text style={rd.stateText}>{error}</Text>
            <TouchableOpacity onPress={load} style={{ marginTop: 8 }}>
              <Text style={{ color: L.gold, fontWeight: '600' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !user ? (
          <View style={rd.centered}>
            <Ionicons name="lock-closed-outline" size={36} color={L.textMuted} />
            <Text style={rd.stateText}>Sign in to view tournament chat</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={rd.centered}>
            <Ionicons name="chatbubble-outline" size={36} color={L.textMuted} />
            <Text style={rd.stateText}>No messages yet. Start the conversation.</Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isSent = msg.sender_id === user.id;
            const msgReactions = reactions.filter(r => r.message_id === msg.id);
            if (isSent) {
              return (
                <View key={msg.id} style={eg.sentRow}>
                  <View style={eg.sentGroup}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onLongPress={() => setReactingTo(msg.id)}
                      style={msg.attachment_type === 'image' ? eg.sentBubblePhoto : eg.sentBubble}
                    >
                      {msg.attachment_type === 'image' ? (
                        <Image source={{ uri: msg.attachment_url! }} style={eg.msgPhoto} />
                      ) : msg.attachment_type === 'file' ? (
                        <FileAttachmentRow url={msg.attachment_url!} name={msg.attachment_name} onDark />
                      ) : (
                        <Text style={eg.sentText}>{msg.body}</Text>
                      )}
                    </TouchableOpacity>
                    <ReactionPills
                      reactions={msgReactions}
                      currentUserId={user?.id}
                      onToggle={(emoji) => handleToggleReaction(msg.id, emoji)}
                      align="flex-end"
                    />
                    <View style={eg.sentMeta}>
                      <Text style={eg.msgTime}>{fmtTime(msg.created_at)}</Text>
                      {msg.read_at && (
                        <Ionicons name="checkmark-done" size={15} color={L.navy} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </View>
                </View>
              );
            }
            const authorName = senders[msg.sender_id] ?? 'Player';
            return (
              <View key={msg.id} style={eg.receivedRow}>
                <View style={[eg.msgAvatar, { backgroundColor: groupColor(msg.sender_id) }]}>
                  <Text style={eg.msgAvatarText}>{groupInitials(authorName)}</Text>
                </View>
                <View style={eg.receivedGroup}>
                  <Text style={eg.authorName}>{authorName}</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onLongPress={() => setReactingTo(msg.id)}
                    style={msg.attachment_type === 'image' ? eg.receivedBubblePhoto : eg.receivedBubble}
                  >
                    {msg.attachment_type === 'image' ? (
                      <Image source={{ uri: msg.attachment_url! }} style={eg.msgPhoto} />
                    ) : msg.attachment_type === 'file' ? (
                      <FileAttachmentRow url={msg.attachment_url!} name={msg.attachment_name} />
                    ) : (
                      <Text style={eg.receivedText}>{msg.body}</Text>
                    )}
                  </TouchableOpacity>
                  <ReactionPills
                    reactions={msgReactions}
                    currentUserId={user?.id}
                    onToggle={(emoji) => handleToggleReaction(msg.id, emoji)}
                    align="flex-start"
                  />
                  <Text style={eg.msgTime}>{fmtTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[eg.inputArea, { paddingBottom: insets.bottom + 6 }]}>
        <View style={eg.inputRow}>
          <TouchableOpacity style={eg.inputIcon} onPress={() => setAttachmentSheetVisible(true)} disabled={uploadingPhoto}>
            {uploadingPhoto
              ? <ActivityIndicator size="small" color={L.textMuted} />
              : <Ionicons name="camera-outline" size={24} color={L.textMuted} />
            }
          </TouchableOpacity>
          <View style={eg.inputBox}>
            <TextInput
              style={eg.inputText}
              placeholder="Message the group..."
              placeholderTextColor={L.textMuted}
              value={draft}
              onChangeText={setDraft}
              editable={!sending}
              multiline
            />
          </View>
          <TouchableOpacity
            style={[eg.inputIcon, eg.sendBtn, draft.trim().length > 0 && eg.sendBtnActive]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            activeOpacity={0.75}
          >
            {sending
              ? <ActivityIndicator size="small" color={L.navy} />
              : <Ionicons name="send" size={18} color={draft.trim() ? L.navy : L.textMuted} />}
          </TouchableOpacity>
        </View>
      </View>

      <EmojiPicker
        open={reactingTo !== null}
        onClose={() => setReactingTo(null)}
        onEmojiSelected={(e) => {
          const messageId = reactingTo;
          setReactingTo(null);
          if (messageId) handleToggleReaction(messageId, e.emoji);
        }}
      />

      <AttachmentOptionsSheet
        visible={attachmentSheetVisible}
        onClose={() => setAttachmentSheetVisible(false)}
        onTakePhoto={handleTakePhoto}
        onChooseLibrary={handleChooseLibrary}
        onChooseFile={handleChooseFile}
      />
    </ChatKeyboardAvoidingView>
  );
}

// ─── Not-found / no-access state for conversation deep links ─────────────────
// Shown for malformed conversation ids and, from RealDMScreen, for a
// syntactically valid id that doesn't resolve to an accessible conversation.
// Renders no conversation data — real or fabricated.

function ConversationUnavailable({ insetsTop = 0 }: { insetsTop?: number }) {
  return (
    <View style={[rd.centered, { flex: 1, backgroundColor: L.bg, paddingTop: insetsTop }]}>
      <StatusBar style="dark" />
      <Ionicons name="alert-circle-outline" size={36} color={L.textMuted} />
      <Text style={rd.stateText}>This conversation isn&apos;t available.</Text>
      <TouchableOpacity onPress={() => goBack()} style={{ marginTop: 8 }}>
        <Text style={{ color: L.gold, fontWeight: '600' }}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}


// ─── Resolver for a bare /conversation/<uuid> ────────────────────────────────
//
// A bare UUID used to go straight to RealDMScreen, which assumes a 1-to-1 chat
// and reads participant_a/participant_b. Every other conversation type leaves
// both columns null, so the screen computed a null partner and rendered
// "This conversation isn't available" -- for conversations the user is a member
// of. At the time of writing that was 25 of 33 rows in production: 15
// play_event, 6 group, 3 support, 1 tournament. Only the 8 `direct` ones worked
// (item 5.3 case 20).
//
// The dispatch mirrors what the Chat tab already does when it has the related
// ids to hand ((tabs)/chat.tsx), so a deep link and an in-app tap land on the
// same screen instead of diverging.
function ConversationResolver({ conversationId }: { conversationId: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'unavailable' }
    | { kind: 'direct' }
    | { kind: 'tournament'; tournamentId: string }
    | { kind: 'group'; title: string }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('participant_a, participant_b, conversation_type, related_play_event_id, related_tournament_id, title')
        .eq('id', conversationId)
        .maybeSingle();

      if (cancelled) return;

      // RLS already hides conversations the user cannot see, so a null row here
      // means "no such conversation, or not yours" -- both are unavailable.
      if (error || !conv) { setState({ kind: 'unavailable' }); return; }

      // A play event has a purpose-built chat surface at /community/[id]. Send
      // the user there rather than rendering a second, lesser copy of it.
      if (conv.related_play_event_id) {
        router.replace({
          pathname: '/community/[id]',
          params: { id: conv.related_play_event_id, tab: 'chat' },
        } as never);
        return;
      }

      if (conv.related_tournament_id) {
        setState({ kind: 'tournament', tournamentId: conv.related_tournament_id });
        return;
      }

      if (conv.participant_a && conv.participant_b) { setState({ kind: 'direct' }); return; }

      setState({
        kind: 'group',
        title: conv.title ?? (conv.conversation_type === 'support' ? 'Support' : 'Group Chat'),
      });
    })();

    return () => { cancelled = true; };
  }, [conversationId, user?.id]);

  if (state.kind === 'loading') {
    return (
      <View style={[rd.centered, { flex: 1, backgroundColor: L.bg, paddingTop: insets.top + 80 }]}>
        <ActivityIndicator color={L.navy} />
      </View>
    );
  }
  if (state.kind === 'unavailable') return <ConversationUnavailable insetsTop={insets.top} />;
  if (state.kind === 'direct')      return <RealDMScreen conversationId={conversationId} />;
  if (state.kind === 'tournament')  return <RealGroupChat tournamentId={state.tournamentId} />;
  return <RealGroupChat conversationId={conversationId} initialTitle={state.title} />;
}

// ─── Root router ──────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId  = id as string;

  // Real contextual tournament group chat: /conversation/tournament-<tournamentUuid>.
  // Falls back to the mock event group chat when no real tournament UUID is supplied.
  if (chatId?.startsWith('tournament-')) {
    const tournamentId = chatId.slice('tournament-'.length);
    if (UUID_RE.test(tournamentId)) {
      return <RealGroupChat tournamentId={tournamentId} />;
    }
    const fallback = EVENT_CHATS['event-1'];
    if (fallback) return <EventGroupChat chatData={fallback} />;
  }

  if (chatId?.startsWith('event-')) {
    const chatData = EVENT_CHATS[chatId];
    if (chatData) return <EventGroupChat chatData={chatData} />;
  }

  if (chatId?.startsWith('dm-')) {
    const config = GENERIC_DMS[chatId];
    if (config) return <GenericDMConversation config={config} />;
  }

  if (UUID_RE.test(chatId ?? '')) {
    // Which screen depends on the conversation's shape, which needs a query.
    return <ConversationResolver conversationId={chatId} />;
  }

  return <ConversationUnavailable />;
}
