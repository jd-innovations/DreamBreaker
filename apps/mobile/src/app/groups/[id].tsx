import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Dimensions, Animated, Easing, Alert,
  TextInput, ActivityIndicator, Share, Modal, Pressable, type AlertButton,
} from 'react-native';
import { ContextMenu, useContextMenu, type MenuItem } from '@/components/ContextMenu';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  fetchGroup, getMembership, joinGroup, leaveGroup, deleteGroup,
  fetchGroupEvents, fetchGroupFeed, createPost, createPhotoPost, createPoll, toggleLike, votePoll,
  fetchComments, addComment, updatePost, deletePost, updateComment, deleteComment,
  fetchMembers, approveJoinRequest, declineJoinRequest,
  setMemberRole, removeMember, fetchGroupPhotos, uploadGroupPhoto, deleteGroupPhoto,
  reportContent, REPORT_REASONS,
  type Group, type GroupMember, type GroupFeedItem, type GroupComment,
  type GroupPostWithMeta, type GroupPhoto, type GroupRole, type ReportReason,
} from '@/lib/groupService';
import { setPendingGroupId } from '@/lib/pendingGroupLink';
import { sendPartnerLike, hasSentPartnerLike, isPartnerMatch } from '@/lib/partnerLikes';
import { getOrCreateConversation } from '@/lib/conversationService';
import { useSupportContext } from '@/lib/support/supportContext';
import { appLinks } from '@/lib/appLinks';
import {
  acceptGroupInvite,
  fetchGroupInviteCandidates,
  fetchPendingGroupInviteForUser,
  sendGroupInvite,
  type GroupInviteCandidate,
  type ReceivedGroupInvite,
} from '@/lib/supabase/groupInvites';
import type { Tables } from '@shared/database.types';

const { width: SW } = Dimensions.get('window');
// Generous enough that the bottom-anchored name/meta/description/buttons
// stack never overflows above the banner's own height on narrow devices
// (0.42 was too tight — content alone could reach ~158pt, taller than the
// banner on a 360pt-wide phone even before adding safe-area headroom).
const BANNER_H   = SW * 0.62;
const PHOTO_SIZE = (SW - 32 - 8) / 3;

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldLight: colors.goldLight, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg,
  danger: colors.danger, dangerBg: colors.dangerBg,
};

type Tab = 'Feed' | 'Events' | 'Members' | 'Photos';
const TABS: Tab[] = ['Feed', 'Events', 'Members', 'Photos'];

const FALLBACK_BANNER = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=400&fit=crop&q=80';
const FALLBACK_EVENT_IMAGE = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=200&fit=crop&q=80';

// ─── Context menu data ────────────────────────────────────────────────────────

const GROUP_MENU_MEMBER: MenuItem[] = [
  { icon: 'share-outline',         label: 'Share Group'          },
  { icon: 'person-add-outline',    label: 'Invite Members'       },
  { icon: 'add-circle-outline',    label: 'Create Event'          },
  { icon: 'notifications-outline', label: 'Manage Notifications'  },
  { icon: 'exit-outline',          label: 'Leave Group', danger: true },
];

const GROUP_MENU_ADMIN: MenuItem[] = [
  { icon: 'share-outline',      label: 'Share Group'    },
  { icon: 'person-add-outline', label: 'Invite Members' },
  { icon: 'add-circle-outline', label: 'Create Event'   },
  { icon: 'people-outline',     label: 'Manage Members' },
  { icon: 'settings-outline',   label: 'Group Settings' },
  { icon: 'trash-outline',      label: 'Delete Group', danger: true },
];

// ─── Report sheet ─────────────────────────────────────────────────────────────

function ReportSheet({
  visible, onClose, onSubmit,
}: {
  visible: boolean; onClose: () => void; onSubmit: (reason: ReportReason, notes: string) => void;
}) {
  const [reason, setReason] = useState<ReportReason>('spam_or_inappropriate');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(reason, notes);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={rs.backdrop} onPress={onClose}>
        <Pressable style={rs.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={rs.grabber} />
          <View style={rs.headerRow}>
            <Text style={rs.title}>Report Content</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={L.navy} />
            </TouchableOpacity>
          </View>

          <Text style={rs.sectionLabel}>REASON</Text>
          {REPORT_REASONS.map((r, i) => (
            <TouchableOpacity
              key={r.value}
              style={[rs.reasonRow, i > 0 && rs.reasonRowBorder]}
              onPress={() => setReason(r.value)}
              activeOpacity={0.8}
            >
              <Text style={rs.reasonLabel}>{r.label}</Text>
              <View style={[rs.radio, reason === r.value && rs.radioActive]}>
                {reason === r.value && <View style={rs.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}

          <TextInput
            style={rs.notesInput}
            placeholder="Additional details (optional)"
            placeholderTextColor={L.textSub}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity style={rs.submitBtn} onPress={handleSubmit} activeOpacity={0.85} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={rs.submitText}>Submit Report</Text>}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rs = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,18,40,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: L.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: L.border, alignSelf: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { color: L.navy, fontSize: 17, fontWeight: '900' },
  sectionLabel: { color: L.textSub, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  reasonRowBorder: { borderTopWidth: 1, borderTopColor: L.border },
  reasonLabel: { color: L.text, fontSize: 14 },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: L.danger },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: L.danger },
  notesInput: {
    borderWidth: 1, borderColor: L.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: L.text, fontSize: 14,
    minHeight: 60, marginTop: 12, marginBottom: 16,
  },
  submitBtn: { backgroundColor: L.danger, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

// ─── Feed tab ─────────────────────────────────────────────────────────────────

function CommentRow({
  comment, groupId, userId, onChanged, onReply, isReply = false,
}: {
  comment: GroupComment; groupId: string; userId: string; onChanged: () => void;
  onReply?: (comment: GroupComment) => void; isReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [body, setBody] = useState(comment.body);
  const [editedAt, setEditedAt] = useState(comment.edited_at);
  const [reportVisible, setReportVisible] = useState(false);
  const isMine = comment.author_id === userId;

  function handleMenu() {
    if (isMine) {
      Alert.alert('Comment', undefined, [
        { text: 'Edit', onPress: () => setEditing(true) },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Comment', undefined, [
        { text: 'Report', style: 'destructive', onPress: () => setReportVisible(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function handleReportSubmit(reason: ReportReason, notes: string) {
    try {
      await reportContent({
        reporterId: userId, groupId, targetType: 'group_comment',
        targetId: comment.id, reportedUserId: comment.author_id, reason, notes,
      });
      setReportVisible(false);
      Alert.alert('Reported', 'Thanks — an admin will review this comment.');
    } catch (err: unknown) {
      Alert.alert('Could not submit report', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function handleDelete() {
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteComment(comment.id); onChanged(); } },
    ]);
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      await updateComment(comment.id, trimmed);
      setBody(trimmed);
      setEditedAt(new Date().toISOString());
      setEditing(false);
    } catch {
      Alert.alert('Could not save changes');
    }
  }

  if (editing) {
    return (
      <View style={fp.editWrap}>
        <TextInput style={fp.editInput} value={draft} onChangeText={setDraft} multiline autoFocus />
        <View style={fp.editActions}>
          <TouchableOpacity onPress={() => { setEditing(false); setDraft(body); }}>
            <Text style={ft.pollComposerCancel}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave}>
            <Text style={ft.pollComposerSubmit}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[fp.commentCol, isReply && fp.commentColReply]}>
      <View style={fp.commentRow}>
        <View style={fp.commentBubble}>
          <Text style={fp.commentAuthor}>{comment.author?.full_name ?? 'Player'}</Text>
          <Text style={fp.commentBody}>{body}{editedAt ? <Text style={fp.commentEdited}> (edited)</Text> : null}</Text>
        </View>
        <TouchableOpacity onPress={handleMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={14} color={L.textSub} />
        </TouchableOpacity>
      </View>
      {!isReply && onReply && (
        <TouchableOpacity onPress={() => onReply(comment)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Text style={fp.commentReplyLink}>Reply</Text>
        </TouchableOpacity>
      )}
      <ReportSheet visible={reportVisible} onClose={() => setReportVisible(false)} onSubmit={handleReportSubmit} />
    </View>
  );
}

function FeedPostCard({
  item, groupId, userId, onChanged,
}: {
  item: GroupPostWithMeta; groupId: string; userId: string; onChanged: () => void;
}) {
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(item.likedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<GroupComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTo, setReplyTo] = useState<GroupComment | null>(null);
  const [votedOption, setVotedOption] = useState<string | null>(
    item.pollOptions.find(o => o.votedByMe)?.id ?? null,
  );
  const [pollOptions, setPollOptions] = useState(item.pollOptions);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(item.body ?? '');
  const [body, setBody] = useState(item.body);
  const [editedAt, setEditedAt] = useState(item.edited_at);
  const [reportVisible, setReportVisible] = useState(false);
  const isMine = item.author.id === userId;

  function handleMenu() {
    const buttons: any[] = [{ text: 'Share', onPress: handleShare }];
    if (isMine && item.kind === 'post') buttons.push({ text: 'Edit', onPress: () => setEditing(true) });
    if (isMine) buttons.push({ text: 'Delete', style: 'destructive', onPress: handleDelete });
    if (!isMine) buttons.push({ text: 'Report', style: 'destructive', onPress: () => setReportVisible(true) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(item.kind === 'poll' ? 'Poll' : 'Post', undefined, buttons);
  }

  function handleShare() {
    Share.share({ message: item.body || 'Check out this post on Pickleball App.' });
  }

  async function handleReportSubmit(reason: ReportReason, notes: string) {
    try {
      await reportContent({
        reporterId: userId, groupId, targetType: 'group_post',
        targetId: item.id, reportedUserId: item.author.id, reason, notes,
      });
      setReportVisible(false);
      Alert.alert('Reported', 'Thanks — an admin will review this post.');
    } catch (err: unknown) {
      Alert.alert('Could not submit report', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function handleDelete() {
    Alert.alert('Delete this post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deletePost(item.id); onChanged(); } },
    ]);
  }

  async function handleSaveEdit() {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    try {
      await updatePost(item.id, trimmed);
      setBody(trimmed);
      setEditedAt(new Date().toISOString());
      setEditing(false);
    } catch {
      Alert.alert('Could not save changes');
    }
  }

  async function handleLike() {
    if (liking) return;
    setLiking(true);
    const next = !liked;
    setLiked(next);
    setLikeCount(c => c + (next ? 1 : -1));
    try {
      await toggleLike(item.id, userId, liked);
    } catch {
      setLiked(liked);
      setLikeCount(item.likeCount);
    } finally {
      setLiking(false);
    }
  }

  async function toggleCommentsOpen() {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      try { setComments(await fetchComments(item.id)); } catch { /* ignore */ }
    }
  }

  async function handleSendComment() {
    const body = commentDraft.trim();
    if (!body) return;
    setCommentDraft('');
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);
    try {
      await addComment(item.id, userId, body, parentId);
      setComments(await fetchComments(item.id));
      onChanged();
    } catch {
      Alert.alert('Could not post comment');
    }
  }

  async function handleVote(optionId: string) {
    const prev = votedOption;
    setVotedOption(optionId);
    setPollOptions(opts => opts.map(o => ({
      ...o,
      voteCount: o.id === optionId ? o.voteCount + 1 : (o.id === prev ? Math.max(0, o.voteCount - 1) : o.voteCount),
    })));
    try {
      await votePoll(item.id, optionId, userId);
    } catch {
      Alert.alert('Could not vote');
    }
  }

  const totalVotes = pollOptions.reduce((a, o) => a + o.voteCount, 0);

  return (
    <View style={fp.card}>
      <View style={fp.header}>
        <View style={fp.avatarFallback}>
          {item.author.avatar_url ? (
            <Image source={{ uri: item.author.avatar_url }} style={fp.avatar} />
          ) : (
            <Ionicons name="person-outline" size={18} color={L.textSub} />
          )}
        </View>
        <View style={fp.authorInfo}>
          <Text style={fp.author}>{item.author.full_name}</Text>
          <Text style={fp.meta}>
            {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {editedAt ? ' - Edited' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={handleMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={L.textSub} />
        </TouchableOpacity>
      </View>

      {item.kind === 'post' && editing && (
        <View style={fp.editWrap}>
          <TextInput
            style={fp.editInput}
            value={editDraft}
            onChangeText={setEditDraft}
            multiline
            autoFocus
          />
          <View style={fp.editActions}>
            <TouchableOpacity onPress={() => { setEditing(false); setEditDraft(body ?? ''); }}>
              <Text style={ft.pollComposerCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSaveEdit}>
              <Text style={ft.pollComposerSubmit}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {item.kind === 'post' && !editing && !!body && (
        <Text style={fp.content}>{body}</Text>
      )}

      {item.kind === 'post' && !!item.image_url && (
        <Image source={{ uri: item.image_url }} style={fp.postImage} resizeMode="cover" />
      )}

      {item.kind === 'poll' && (
        <View style={fp.pollCard}>
          <Text style={fp.pollQuestion}>{item.body}</Text>
          <View style={fp.pollOptions}>
            {pollOptions.map(opt => {
              const pct = totalVotes > 0 ? opt.voteCount / totalVotes : 0;
              const isVoted = votedOption === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[fp.pollOption, isVoted && fp.pollOptionVoted]}
                  onPress={() => handleVote(opt.id)}
                  activeOpacity={0.8}
                >
                  <View style={[fp.pollFill, { width: `${Math.round(pct * 100)}%` as any }]} />
                  <Text style={[fp.pollLabel, isVoted && fp.pollLabelVoted]}>{opt.label}</Text>
                  <Text style={fp.pollPct}>{Math.round(pct * 100)}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={fp.pollMeta}>{totalVotes} votes</Text>
        </View>
      )}

      <View style={fp.footer}>
        <TouchableOpacity style={fp.footerBtn} onPress={handleLike} disabled={liking}>
          <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={liked ? L.gold : L.textSub} />
          <Text style={[fp.footerText, liked && { color: L.gold }]}>{likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={fp.footerBtn} onPress={toggleCommentsOpen}>
          <Ionicons name="chatbubble-outline" size={16} color={L.textSub} />
          <Text style={fp.footerText}>{item.commentCount} Comments</Text>
        </TouchableOpacity>
      </View>

      {showComments && (
        <View style={fp.commentsWrap}>
          {comments.filter(c => !c.parent_comment_id).map(c => (
            <React.Fragment key={c.id}>
              <CommentRow
                comment={c}
                groupId={groupId}
                userId={userId}
                onChanged={async () => setComments(await fetchComments(item.id))}
                onReply={setReplyTo}
              />
              {comments.filter(r => r.parent_comment_id === c.id).map(r => (
                <CommentRow
                  key={r.id}
                  comment={r}
                  groupId={groupId}
                  userId={userId}
                  onChanged={async () => setComments(await fetchComments(item.id))}
                  isReply
                />
              ))}
            </React.Fragment>
          ))}
          {replyTo && (
            <View style={fp.replyingToRow}>
              <Text style={fp.replyingToText}>Replying to {replyTo.author?.full_name ?? 'Player'}</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close" size={14} color={L.textSub} />
              </TouchableOpacity>
            </View>
          )}
          <View style={fp.commentInputRow}>
            <TextInput
              style={fp.commentInput}
              placeholder={replyTo ? `Reply to ${replyTo.author?.full_name ?? 'Player'}...` : 'Write a comment...'}
              placeholderTextColor={L.textSub}
              value={commentDraft}
              onChangeText={setCommentDraft}
              onSubmitEditing={handleSendComment}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={handleSendComment}>
              <Ionicons name="send" size={18} color={L.gold} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ReportSheet visible={reportVisible} onClose={() => setReportVisible(false)} onSubmit={handleReportSubmit} />
    </View>
  );
}

function FeedEventCard({ event }: { event: Tables<'play_events'> }) {
  const route =
    event.event_type === 'round_robin'     ? `/round-robin-created?id=${event.id}` :
    event.event_type === 'mini_tournament' ? `/mini-tournament-created?id=${event.id}` :
                                              `/quick-game-created?id=${event.id}`;
  return (
    <TouchableOpacity style={fp.card} activeOpacity={0.9} onPress={() => router.push(route as never)}>
      <View style={fp.header}>
        <View style={fp.avatarFallback}><Ionicons name="calendar-outline" size={18} color={L.gold} /></View>
        <View style={fp.authorInfo}>
          <Text style={fp.author}>New event created</Text>
          <Text style={fp.meta}>{new Date(event.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
        </View>
      </View>
      <View style={fp.eventCard}>
        <Image source={{ uri: event.cover_url ?? FALLBACK_EVENT_IMAGE }} style={fp.eventImage} resizeMode="cover" />
        <View style={fp.eventBody}>
          <Text style={fp.eventTitle}>{event.name}</Text>
          <View style={fp.eventRow}>
            <Ionicons name="calendar-outline" size={13} color={L.textSub} />
            <Text style={fp.eventMeta}>{event.event_date}</Text>
          </View>
          <View style={fp.eventRow}>
            <Ionicons name="location-outline" size={13} color={L.textSub} />
            <Text style={fp.eventMeta}>{event.venue_name ?? event.location}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PollComposer({ onSubmit, onCancel }: { onSubmit: (q: string, opts: string[]) => void; onCancel: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  return (
    <View style={ft.pollComposer}>
      <TextInput
        style={ft.pollComposerInput}
        placeholder="Ask a question..."
        placeholderTextColor={L.textSub}
        value={question}
        onChangeText={setQuestion}
      />
      {options.map((opt, i) => (
        <TextInput
          key={i}
          style={ft.pollComposerInput}
          placeholder={`Option ${i + 1}`}
          placeholderTextColor={L.textSub}
          value={opt}
          onChangeText={(t) => setOptions(prev => prev.map((o, idx) => idx === i ? t : o))}
        />
      ))}
      {options.length < 4 && (
        <TouchableOpacity onPress={() => setOptions(prev => [...prev, ''])}>
          <Text style={ft.pollComposerAdd}>+ Add option</Text>
        </TouchableOpacity>
      )}
      <View style={ft.pollComposerActions}>
        <TouchableOpacity onPress={onCancel}><Text style={ft.pollComposerCancel}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const valid = options.filter(o => o.trim());
            if (!question.trim() || valid.length < 2) {
              Alert.alert('Poll needs a question and at least 2 options.');
              return;
            }
            onSubmit(question.trim(), valid);
          }}
        >
          <Text style={ft.pollComposerSubmit}>Post Poll</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PhotoComposer({
  uri, onSubmit, onCancel, posting,
}: {
  uri: string; onSubmit: (caption: string) => void; onCancel: () => void; posting: boolean;
}) {
  const [caption, setCaption] = useState('');

  return (
    <View style={ft.pollComposer}>
      <Image source={{ uri }} style={ft.photoComposerPreview} resizeMode="cover" />
      <TextInput
        style={ft.pollComposerInput}
        placeholder="Say something about this photo... (optional)"
        placeholderTextColor={L.textSub}
        value={caption}
        onChangeText={setCaption}
        multiline
      />
      <View style={ft.pollComposerActions}>
        <TouchableOpacity onPress={onCancel} disabled={posting}>
          <Text style={ft.pollComposerCancel}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onSubmit(caption)} disabled={posting}>
          {posting ? <ActivityIndicator size="small" color={L.gold} /> : <Text style={ft.pollComposerSubmit}>Post Photo</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FeedTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [items, setItems] = useState<GroupFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [postingPhoto, setPostingPhoto] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await fetchGroupFeed(groupId, userId)); }
    finally { setLoading(false); }
  }, [groupId, userId]);

  useEffect(() => { load(); }, [load]);

  async function handlePost() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await createPost(groupId, userId, body);
      setDraft('');
      await load();
    } catch {
      Alert.alert('Could not post');
    } finally {
      setPosting(false);
    }
  }

  async function handleAddPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8,
    });
    if (result.canceled) return;
    setPendingPhotoUri(result.assets[0].uri);
  }

  async function handlePhotoSubmit(caption: string) {
    if (!pendingPhotoUri) return;
    setPostingPhoto(true);
    try {
      await createPhotoPost(groupId, userId, pendingPhotoUri, caption);
      setPendingPhotoUri(null);
      await load();
    } catch {
      Alert.alert('Could not upload photo');
    } finally {
      setPostingPhoto(false);
    }
  }

  async function handlePollSubmit(question: string, options: string[]) {
    try {
      await createPoll(groupId, userId, question, options);
      setShowPollComposer(false);
      await load();
    } catch {
      Alert.alert('Could not create poll');
    }
  }

  if (loading) {
    return <View style={ft.loading}><ActivityIndicator color={L.gold} /></View>;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ft.scroll}>
      <View style={ft.compose}>
        <TextInput
          style={ft.composeInput}
          placeholder="What's on your mind?"
          placeholderTextColor={L.textSub}
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <View style={ft.composeActions}>
          <TouchableOpacity style={ft.composeAction} onPress={handleAddPhoto}>
            <Ionicons name="image-outline" size={18} color={L.textSub} />
            <Text style={ft.composeActionText}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ft.composeAction} onPress={() => setShowPollComposer(v => !v)}>
            <Ionicons name="bar-chart-outline" size={18} color={L.textSub} />
            <Text style={ft.composeActionText}>Poll</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ft.composeAction, !draft.trim() && ft.composeActionDisabled]}
            onPress={handlePost}
            disabled={!draft.trim() || posting}
          >
            {posting ? <ActivityIndicator size="small" color={L.gold} /> : (
              <>
                <Ionicons name="send-outline" size={18} color={draft.trim() ? L.gold : L.textSub} />
                <Text style={[ft.composeActionText, draft.trim() && { color: L.gold }]}>Post</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {showPollComposer && (
        <PollComposer onSubmit={handlePollSubmit} onCancel={() => setShowPollComposer(false)} />
      )}

      {pendingPhotoUri && (
        <PhotoComposer
          uri={pendingPhotoUri}
          onSubmit={handlePhotoSubmit}
          onCancel={() => setPendingPhotoUri(null)}
          posting={postingPhoto}
        />
      )}

      {items.length === 0 && (
        <View style={et.empty}>
          <Ionicons name="chatbubbles-outline" size={32} color={L.border} />
          <Text style={et.emptyTitle}>No posts yet</Text>
          <Text style={et.emptySub}>Be the first to post to this group.</Text>
        </View>
      )}

      {items.map(item => item.kind === 'post'
        ? <FeedPostCard key={`p-${item.post.id}`} item={item.post} groupId={groupId} userId={userId} onChanged={load} />
        : <FeedEventCard key={`e-${item.event.id}`} event={item.event} />,
      )}
    </ScrollView>
  );
}

const ft = StyleSheet.create({
  loading: { paddingTop: 60, alignItems: 'center' },
  scroll: { paddingVertical: 12, gap: 12, paddingBottom: 100 },
  compose: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, padding: 14, gap: 10,
  },
  composeInput: { color: L.text, fontSize: 15, minHeight: 40, paddingHorizontal: 4 },
  composeActions: { flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: L.border, paddingTop: 10 },
  composeAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  composeActionDisabled: { opacity: 0.6 },
  composeActionText: { color: L.textSub, fontSize: 13, fontWeight: '600' },
  pollComposer: {
    backgroundColor: L.bg, borderRadius: 16, borderWidth: 1, borderColor: L.border,
    padding: 14, gap: 8,
  },
  photoComposerPreview: { width: '100%', height: 200, borderRadius: 12 },
  pollComposerInput: {
    borderWidth: 1, borderColor: L.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: L.text, fontSize: 14,
  },
  pollComposerAdd: { color: L.gold, fontSize: 13, fontWeight: '700' },
  pollComposerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 4 },
  pollComposerCancel: { color: L.textSub, fontSize: 14, fontWeight: '600' },
  pollComposerSubmit: { color: L.gold, fontSize: 14, fontWeight: '800' },
});

const fp = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, padding: 14, gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  authorInfo: { flex: 1 },
  author: { color: L.navy, fontSize: 14, fontWeight: '800' },
  meta: { color: L.textSub, fontSize: 12 },
  content: { color: L.text, fontSize: 14, lineHeight: 21 },
  postImage: { width: '100%', height: 220, borderRadius: 12 },
  editWrap: { gap: 8 },
  editInput: {
    borderWidth: 1, borderColor: L.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: L.text, fontSize: 14, minHeight: 60,
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },

  eventCard: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: L.border },
  eventImage: { width: '100%', height: 120 },
  eventBody: { padding: 12, gap: 5 },
  eventTitle: { color: L.navy, fontSize: 15, fontWeight: '800' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventMeta: { color: L.textSub, fontSize: 12 },

  pollCard: { gap: 10 },
  pollQuestion: { color: L.navy, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  pollOptions: { gap: 6 },
  pollOption: {
    position: 'relative', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    height: 40, borderRadius: 10,
    borderWidth: 1.5, borderColor: L.border,
    paddingHorizontal: 12, overflow: 'hidden',
    backgroundColor: L.bg,
  },
  pollOptionVoted: { borderColor: L.gold },
  pollFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: L.goldLight, borderRadius: 10,
  },
  pollLabel: { color: L.navy, fontSize: 13, fontWeight: '600', zIndex: 1 },
  pollLabelVoted: { color: L.gold },
  pollPct: { color: L.textSub, fontSize: 12, fontWeight: '600', zIndex: 1 },
  pollMeta: { color: L.textSub, fontSize: 11 },

  footer: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: L.border, paddingTop: 10 },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerText: { color: L.textSub, fontSize: 13, fontWeight: '600' },

  commentsWrap: { gap: 8, borderTopWidth: 1, borderTopColor: L.border, paddingTop: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  commentBubble: { flex: 1, flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  commentAuthor: { color: L.navy, fontSize: 13, fontWeight: '700' },
  commentBody: { color: L.text, fontSize: 13, flexShrink: 1 },
  commentEdited: { color: L.textSub, fontSize: 11, fontStyle: 'italic' },
  commentCol: { gap: 2 },
  commentColReply: { marginLeft: 28 },
  commentReplyLink: { color: L.textSub, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  replyingToRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: L.page, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
  },
  replyingToText: { color: L.textSub, fontSize: 12, fontWeight: '600' },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: {
    flex: 1, borderWidth: 1, borderColor: L.border, borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 8, color: L.text, fontSize: 13,
  },
});

// ─── Events tab ───────────────────────────────────────────────────────────────

function routeForEvent(ev: Tables<'play_events'>): string {
  switch (ev.event_type) {
    case 'round_robin':      return `/round-robin/${ev.id}/standings`;
    case 'mini_tournament':  return `/mini-tournament/${ev.id}/bracket`;
    default:                 return `/quick-game-created?id=${ev.id}`;
  }
}

function EventsTab({ groupId }: { groupId: string }) {
  const [events, setEvents] = useState<Tables<'play_events'>[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchGroupEvents(groupId).then(rows => { if (!cancelled) setEvents(rows); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId]));

  function handleCreateEvent() {
    setPendingGroupId(groupId);
    router.push('/play-pickleball' as never);
  }

  if (loading) return <View style={ft.loading}><ActivityIndicator color={L.gold} /></View>;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: 12, gap: 12, paddingBottom: 100 }}
    >
      <TouchableOpacity style={et.createBtn} onPress={handleCreateEvent} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={20} color={L.gold} />
        <Text style={et.createBtnText}>Create Event for This Group</Text>
      </TouchableOpacity>

      {events.length === 0 && (
        <View style={et.empty}>
          <Ionicons name="calendar-outline" size={32} color={L.border} />
          <Text style={et.emptyTitle}>No events yet</Text>
          <Text style={et.emptySub}>Create the first event for this group.</Text>
        </View>
      )}

      {events.map(ev => {
        const dest = routeForEvent(ev);
        const isTournament = ev.event_type === 'mini_tournament';
        return (
          <TouchableOpacity
            key={ev.id}
            style={et.card}
            activeOpacity={0.92}
            onPress={() => router.push(dest as never)}
          >
            <Image source={{ uri: ev.cover_url ?? FALLBACK_EVENT_IMAGE }} style={et.image} resizeMode="cover" />
            <View style={et.body}>
              <View style={et.tagRow}>
                <View style={[et.tag, isTournament && et.tagTournament]}>
                  <Text style={[et.tagText, isTournament && et.tagTextTournament]}>
                    {ev.event_type === 'round_robin' ? 'Round Robin' : ev.event_type === 'mini_tournament' ? 'Tournament' : 'Open Play'}
                  </Text>
                </View>
              </View>
              <Text style={et.title}>{ev.name}</Text>
              <View style={et.row}>
                <Ionicons name="calendar-outline" size={13} color={L.textSub} />
                <Text style={et.meta}>
                  {new Date(`${ev.event_date}T${ev.start_time ?? '00:00:00'}`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={et.row}>
                <Ionicons name="location-outline" size={13} color={L.textSub} />
                <Text style={et.meta}>{ev.venue_name ?? ev.location}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const et = StyleSheet.create({
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16, backgroundColor: L.goldLight,
  },
  createBtnText: { color: L.gold, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border, overflow: 'hidden',
  },
  image: { width: '100%', height: 130 },
  body: { padding: 14, gap: 6 },
  tagRow: { flexDirection: 'row' },
  tag: { backgroundColor: L.goldLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagTournament: { backgroundColor: colors.navy + '18' },
  tagText: { color: L.gold, fontSize: 11, fontWeight: '700' },
  tagTextTournament: { color: L.navy },
  title: { color: L.navy, fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: L.textSub, fontSize: 13 },
  empty: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    padding: 28, alignItems: 'center', gap: 8,
  },
  emptyTitle: { color: L.navy, fontSize: 15, fontWeight: '800' },
  emptySub: { color: L.textSub, fontSize: 13, textAlign: 'center' },
});

// ─── Members tab ──────────────────────────────────────────────────────────────

type ConnectionStatus = 'unknown' | 'none' | 'pending' | 'connected';

function MemberRow({
  member, groupId, isAdmin, myUserId, onChanged,
}: {
  member: GroupMember; groupId: string; isAdmin: boolean; myUserId: string; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');

  const refreshConnectionStatus = useCallback(async () => {
    if (member.userId === myUserId) return;
    try {
      const matched = await isPartnerMatch(myUserId, member.userId);
      if (matched) {
        setConnectionStatus('connected');
        return;
      }
      const already = await hasSentPartnerLike(myUserId, member.userId);
      setConnectionStatus(already ? 'pending' : 'none');
    } catch {
      setConnectionStatus('none');
    }
  }, [member.userId, myUserId]);

  useEffect(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  async function handleConnect() {
    if (busy || connectionStatus === 'pending' || connectionStatus === 'connected') return;
    setBusy(true);
    try {
      const matched = await isPartnerMatch(myUserId, member.userId);
      if (matched) {
        setConnectionStatus('connected');
        Alert.alert('Already Connected', `You are already connected with ${member.name}.`);
        return;
      }
      const already = await hasSentPartnerLike(myUserId, member.userId);
      if (already) {
        setConnectionStatus('pending');
        Alert.alert('Request Pending', `Your connection request to ${member.name} is pending.`);
        return;
      }
      const { matched: newMatch } = await sendPartnerLike(myUserId, member.userId);
      setConnectionStatus(newMatch ? 'connected' : 'pending');
      Alert.alert(newMatch ? "It's a Match!" : 'Request Sent', newMatch
        ? `You and ${member.name} liked each other.`
        : `Connection request sent to ${member.name}.`);
    } catch {
      Alert.alert('Could not send request');
    } finally {
      setBusy(false);
    }
  }

  async function handleMessage() {
    try {
      const cid = await getOrCreateConversation(myUserId, member.userId);
      router.push(`/conversation/${cid}` as never);
    } catch {
      Alert.alert('Could not open conversation');
    }
  }

  const connectIcon = connectionStatus === 'connected'
    ? 'checkmark-circle-outline'
    : connectionStatus === 'pending'
      ? 'time-outline'
      : 'person-add-outline';
  const connectColor = connectionStatus === 'connected'
    ? L.success
    : connectionStatus === 'pending'
      ? L.gold
      : L.navy;

  function handleManage() {
    const buttons: AlertButton[] = [];
    if (member.role === 'member') {
      buttons.push({ text: 'Make Admin', onPress: () => setMemberRole(groupId, member.userId, 'admin').then(onChanged) });
    } else if (member.role === 'admin') {
      buttons.push({ text: 'Remove Admin', onPress: () => setMemberRole(groupId, member.userId, 'member').then(onChanged) });
    }
    buttons.push({ text: 'Remove from Group', style: 'destructive', onPress: () => removeMember(groupId, member.userId).then(onChanged) });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(member.name, undefined, buttons);
  }

  return (
    <View style={mt.card}>
      {member.avatarUrl ? (
        <Image source={{ uri: member.avatarUrl }} style={mt.avatar} />
      ) : (
        <View style={[mt.avatar, mt.avatarFallback]}><Ionicons name="person-outline" size={20} color={L.textSub} /></View>
      )}
      <View style={mt.info}>
        <View style={mt.nameRow}>
          <Text style={mt.name}>{member.name}</Text>
          {member.role !== 'member' && (
            <View style={mt.adminBadge}><Text style={mt.adminText}>{member.role === 'owner' ? 'Owner' : 'Admin'}</Text></View>
          )}
        </View>
        <Text style={mt.meta}>
          {member.dupr != null ? `DUPR ${member.dupr}` : member.selfRating ? `Self ${member.selfRating}` : 'Unrated'}
          {member.locationCity ? ` - ${member.locationCity}` : ''}
        </Text>
      </View>
      <View style={mt.actions}>
        {member.userId !== myUserId && (
          <>
            <TouchableOpacity
              style={[mt.actionBtn, connectionStatus === 'connected' && mt.connectedActionBtn]}
              onPress={handleConnect}
              disabled={busy || connectionStatus === 'pending' || connectionStatus === 'connected'}
              accessibilityLabel={connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'pending' ? 'Connection request pending' : `Connect with ${member.name}`}
            >
              <Ionicons name={connectIcon} size={18} color={connectColor} />
            </TouchableOpacity>
            <TouchableOpacity style={mt.actionBtn} onPress={handleMessage}>
              <Ionicons name="chatbubble-outline" size={18} color={L.navy} />
            </TouchableOpacity>
          </>
        )}
        {isAdmin && member.userId !== myUserId && member.role !== 'owner' && (
          <TouchableOpacity style={mt.actionBtn} onPress={handleManage}>
            <Ionicons name="ellipsis-horizontal" size={18} color={L.navy} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MembersTab({ groupId, myUserId, isAdmin }: { groupId: string; myUserId: string; isAdmin: boolean }) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Admins' | 'Members'>('All');

  const load = useCallback(async () => {
    try {
      setMembers(await fetchMembers(groupId));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={ft.loading}><ActivityIndicator color={L.gold} /></View>;

  const active = members.filter(m => m.status === 'active');
  const pending = members.filter(m => m.status === 'pending');
  const filters: ('All' | 'Admins' | 'Members')[] = ['All', 'Admins', 'Members'];
  const shown = filter === 'Admins'
    ? active.filter(m => m.role === 'admin' || m.role === 'owner')
    : filter === 'Members'
    ? active.filter(m => m.role === 'member')
    : active;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, gap: 12, paddingBottom: 100 }}>
      {isAdmin && pending.length > 0 && (
        <View style={mt.pendingSection}>
          <Text style={mt.pendingTitle}>Join Requests ({pending.length})</Text>
          {pending.map(m => (
            <View key={m.userId} style={mt.pendingRow}>
              <Text style={mt.pendingName}>{m.name}</Text>
              <View style={mt.pendingActions}>
                <TouchableOpacity
                  style={mt.pendingApprove}
                  onPress={() => approveJoinRequest(groupId, m.userId).then(load)}
                >
                  <Text style={mt.pendingApproveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={mt.pendingDecline}
                  onPress={() => declineJoinRequest(groupId, m.userId).then(load)}
                >
                  <Text style={mt.pendingDeclineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={mt.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            style={[mt.filterChip, filter === f && mt.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[mt.filterText, filter === f && mt.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {shown.map(m => (
        <MemberRow key={m.userId} member={m} groupId={groupId} isAdmin={isAdmin} myUserId={myUserId} onChanged={load} />
      ))}
    </ScrollView>
  );
}

const mt = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    borderRadius: 20, borderWidth: 1.5, borderColor: L.border,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  filterText: { color: L.textSub, fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: 14,
    borderWidth: 1, borderColor: L.border, padding: 12,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  name: { color: L.navy, fontSize: 14, fontWeight: '800' },
  adminBadge: { backgroundColor: L.goldLight, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  adminText: { color: L.gold, fontSize: 10, fontWeight: '700' },
  meta: { color: L.textSub, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  connectedActionBtn: { backgroundColor: L.successBg, borderColor: L.success },
  pendingSection: {
    backgroundColor: L.goldLight, borderRadius: 14, padding: 12, gap: 8,
  },
  pendingTitle: { color: L.navy, fontSize: 13, fontWeight: '800' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pendingName: { color: L.text, fontSize: 13, flex: 1 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  pendingApprove: { backgroundColor: L.gold, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  pendingApproveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  pendingDecline: { borderWidth: 1, borderColor: L.border, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  pendingDeclineText: { color: L.textSub, fontSize: 12, fontWeight: '700' },
});

// ─── Photos tab ───────────────────────────────────────────────────────────────

function PhotosTab({ groupId, userId }: { groupId: string; userId: string }) {
  const [photos, setPhotos] = useState<GroupPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try { setPhotos(await fetchGroupPhotos(groupId)); } finally { setLoading(false); }
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled) return;
    setUploading(true);
    try {
      await uploadGroupPhoto(groupId, userId, result.assets[0].uri);
      await load();
    } catch {
      Alert.alert('Could not upload photo');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <View style={ft.loading}><ActivityIndicator color={L.gold} /></View>;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 12, paddingBottom: 100 }}>
      <TouchableOpacity style={et.createBtn} onPress={handleUpload} activeOpacity={0.85} disabled={uploading}>
        {uploading ? <ActivityIndicator size="small" color={L.gold} /> : (
          <>
            <Ionicons name="camera-outline" size={20} color={L.gold} />
            <Text style={et.createBtnText}>Add Photo</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 12 }} />
      {photos.length === 0 ? (
        <View style={et.empty}>
          <Ionicons name="images-outline" size={32} color={L.border} />
          <Text style={et.emptyTitle}>No photos yet</Text>
          <Text style={et.emptySub}>Add the first photo to this group.</Text>
        </View>
      ) : (
        <View style={ph.grid}>
          {photos.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={ph.cell}
              activeOpacity={0.85}
              onLongPress={() => {
                if (p.uploaded_by !== userId) return;
                Alert.alert('Delete this photo?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGroupPhoto(p.id); await load(); } },
                ]);
              }}
            >
              <Image source={{ uri: p.url }} style={ph.photo} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const ph = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: 8, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GroupDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id;
  const { user } = useSession();
  const myUserId = user?.id ?? '';

  const [tab, setTab] = useState<Tab>('Feed');
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<{ role: GroupRole; status: 'active' | 'pending' } | null>(null);
  const [pendingInvite, setPendingInvite] = useState<ReceivedGroupInvite | null>(null);
  const [joining, setJoining] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteCandidates, setInviteCandidates] = useState<GroupInviteCandidate[]>([]);
  const [loadingInviteCandidates, setLoadingInviteCandidates] = useState(false);
  const [sendingInviteIds, setSendingInviteIds] = useState<Set<string>>(new Set());
  const [sentInviteIds, setSentInviteIds] = useState<Set<string>>(new Set());
  const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useSupportContext({ feature: 'group', entityType: 'group', entityId: groupId, entityLabel: group?.name });

  const load = useCallback(async () => {
    if (!groupId || !myUserId) return;
    try {
      const [g, m, invite] = await Promise.all([
        fetchGroup(groupId),
        getMembership(groupId, myUserId),
        fetchPendingGroupInviteForUser(groupId, myUserId),
      ]);
      setGroup(g);
      setMembership(m);
      setPendingInvite(invite);
    } finally {
      setLoading(false);
    }
  }, [groupId, myUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const joined = membership?.status === 'active';
  const pending = membership?.status === 'pending';
  const currentUserRole: GroupRole = membership?.role ?? 'member';
  const isAdmin = currentUserRole === 'owner' || currentUserRole === 'admin';
  const groupMenuItems = isAdmin ? GROUP_MENU_ADMIN : GROUP_MENU_MEMBER;
  const canInviteMembers = joined && (isAdmin || Boolean(group?.allow_invites));

  async function handleJoinToggle() {
    if (!groupId || !myUserId || joining) return;
    if (joined) {
      Alert.alert('Leave Group?', 'You will no longer be a member of this group.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => { setJoining(true); await leaveGroup(groupId, myUserId); await load(); setJoining(false); },
        },
      ]);
      return;
    }
    setJoining(true);
    try {
      if (pendingInvite) {
        await acceptGroupInvite(pendingInvite);
        await load();
        Alert.alert('Joined Group', `You joined ${group?.name ?? 'the group'}.`);
        return;
      }
      const status = await joinGroup(groupId, myUserId);
      await load();
      if (status === 'pending') Alert.alert('Request Sent', 'Your request to join is pending admin approval.');
    } catch (err: unknown) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setJoining(false);
    }
  }

  function handleShare() {
    if (!groupId || !group) return;
    Share.share({ message: `Join "${group.name}" on Pickleball App: ${appLinks.group(groupId)}` });
  }

  async function openInviteMembers() {
    if (!groupId || !myUserId) return;
    if (!joined) {
      Alert.alert('Join Required', 'Join this group before inviting other players.');
      return;
    }
    if (!canInviteMembers) {
      Alert.alert('Invites Disabled', 'Only group admins can invite members right now.');
      return;
    }
    setInviteModalVisible(true);
    setLoadingInviteCandidates(true);
    setInviteFeedback(null);
    try {
      setInviteCandidates(await fetchGroupInviteCandidates(groupId, myUserId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      setInviteFeedback({ type: 'error', message });
      Alert.alert('Could not load players', message);
    } finally {
      setLoadingInviteCandidates(false);
    }
  }

  async function handleSendGroupInvite(candidate: GroupInviteCandidate) {
    if (!groupId || !myUserId || sendingInviteIds.has(candidate.id) || sentInviteIds.has(candidate.id)) return;
    setSendingInviteIds(prev => new Set(prev).add(candidate.id));
    setInviteFeedback(null);
    try {
      await sendGroupInvite(groupId, myUserId, candidate.id);
      setSentInviteIds(prev => new Set(prev).add(candidate.id));
      setInviteFeedback({ type: 'success', message: `${candidate.full_name} has been invited.` });
      Alert.alert('Invite Sent', `${candidate.full_name} has been invited to ${group?.name ?? 'this group'}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      setInviteFeedback({ type: 'error', message: `Could not send invite: ${message}` });
      Alert.alert('Could not send invite', message);
    } finally {
      setSendingInviteIds(prev => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  }

  const groupMenu = useContextMenu();
  const headerDotRef = useRef<View>(null);
  const [groupMenuTop, setGroupMenuTop] = useState(0);

  const openGroupMenu = () => {
    // Only meaningful on Android, where the popover needs a Y coordinate. On
    // iOS present() shows the system sheet and this is unused.
    headerDotRef.current?.measure((_x, _y, _w, h, _pageX, pageY) => { setGroupMenuTop(pageY + h + 6); });
    groupMenu.present(groupMenuItems, handleGroupMenuItem);
  };

  function handleGroupMenuItem(label: string) {
    groupMenu.close(() => {
      if (!groupId) return;
      switch (label) {
        case 'Create Event':
          setPendingGroupId(groupId);
          router.push('/play-pickleball' as never);
          break;
        case 'Share Group':
          handleShare();
          break;
        case 'Invite Members':
          void openInviteMembers();
          break;
        case 'Leave Group':
          handleJoinToggle();
          break;
        case 'Delete Group':
          Alert.alert('Delete Group?', 'This cannot be undone. All events, posts, and photos will remain but the group will be removed.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete', style: 'destructive',
              onPress: async () => { await deleteGroup(groupId); router.replace('/(tabs)/partner' as never); },
            },
          ]);
          break;
        case 'Group Settings':
          router.push(`/groups/${groupId}/edit` as never);
          break;
        case 'Manage Members':
          setTab('Members');
          break;
        default:
          Alert.alert(label, 'Coming soon — this feature is on the way.', [{ text: 'Got It' }]);
      }
    });
  }

  if (!groupId || loading || !group) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={L.gold} />
      </View>
    );
  }

  return (
    <View style={[s.root]}>
      <StatusBar style="light" />

      {/* ── Floating back + actions ── */}
      <View style={[s.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={s.topCircle} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={s.topRight}>
          <View ref={headerDotRef} collapsable={false}>
            <TouchableOpacity style={s.topCircle} onPress={openGroupMenu} activeOpacity={0.8}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Banner ── */}
      {/* Extra insets.top height keeps the bottom-anchored title/meta/description
          block clear of the status bar / dynamic island instead of colliding with it. */}
      <View style={[s.banner, { height: BANNER_H + insets.top }]}>
        <Image source={{ uri: group.image_url ?? FALLBACK_BANNER }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(10,18,40,0.72)']} style={StyleSheet.absoluteFill} />
        <View style={[s.bannerContent, { paddingBottom: 20 }]}>
          <Text style={s.groupName}>{group.name}</Text>
          <View style={s.metaRow}>
            <Ionicons
              name={group.privacy === 'public' ? 'globe-outline' : 'lock-closed-outline'}
              size={12}
              color="rgba(255,255,255,0.8)"
            />
            <Text style={s.metaText}>
              {group.privacy === 'public' ? 'Public Group' : group.privacy === 'private' ? 'Private Group' : 'Secret Group'}
            </Text>
            <Text style={s.metaDot}>·</Text>
            <Text style={s.metaText}>{group.memberCount.toLocaleString()} Members</Text>
            <Text style={s.metaDot}>·</Text>
            <Text style={s.metaText}>{group.skill || 'All Levels'}</Text>
          </View>
          {!!group.description && <Text style={s.desc} numberOfLines={2}>{group.description}</Text>}

          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.joinBtn, (joined || pending || pendingInvite) && s.joinedBtn]}
              onPress={handleJoinToggle}
              activeOpacity={0.85}
              disabled={joining}
            >
              {joining ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <Text style={[s.joinBtnText, (joined || pending || pendingInvite) && s.joinedBtnText]}>
                  {pending ? 'Requested' : pendingInvite ? 'Accept Invite' : joined ? 'Joined' : 'Join Group'}
                </Text>
              )}
            </TouchableOpacity>
            {joined && (
              <TouchableOpacity
                style={s.chatBtn}
                onPress={() => router.push(`/groups/${groupId}/chat` as never)}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubble-outline" size={18} color={L.gold} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={s.tabItem} onPress={() => setTab(t)} activeOpacity={0.7}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
            {tab === t && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab content ── */}
      <View style={s.content}>
        <View style={s.tabContentPad}>
          {!joined && !pending && tab !== 'Feed' && tab !== 'Members' ? (
            <View style={et.empty}>
              <Ionicons name="lock-closed-outline" size={32} color={L.border} />
              <Text style={et.emptyTitle}>Join to see more</Text>
              <Text style={et.emptySub}>Join this group to view events and photos.</Text>
            </View>
          ) : (
            <>
              {tab === 'Feed' && (joined ? <FeedTab groupId={groupId} userId={myUserId} /> : (
                <View style={et.empty}>
                  <Ionicons name="lock-closed-outline" size={32} color={L.border} />
                  <Text style={et.emptyTitle}>Join to see the feed</Text>
                </View>
              ))}
              {tab === 'Events' && <EventsTab groupId={groupId} />}
              {tab === 'Members' && <MembersTab groupId={groupId} myUserId={myUserId} isAdmin={isAdmin} />}
              {tab === 'Photos' && <PhotosTab groupId={groupId} userId={myUserId} />}
            </>
          )}
        </View>
      </View>


      <Modal
        visible={inviteModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={[im.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
          <View style={im.header}>
            <View>
              <Text style={im.title}>Invite Members</Text>
              <Text style={im.subtitle}>Send a direct invite to connected players.</Text>
              {!!inviteFeedback && (
                <Text style={[im.feedback, inviteFeedback.type === 'error' ? im.feedbackError : im.feedbackSuccess]}>
                  {inviteFeedback.message}
                </Text>
              )}
            </View>
            <TouchableOpacity style={im.closeBtn} onPress={() => setInviteModalVisible(false)} activeOpacity={0.8}>
              <Ionicons name="close" size={22} color={L.navy} />
            </TouchableOpacity>
          </View>

          {loadingInviteCandidates ? (
            <View style={im.empty}>
              <ActivityIndicator color={L.gold} />
              <Text style={im.emptyText}>Loading players...</Text>
            </View>
          ) : inviteCandidates.length === 0 ? (
            <View style={im.empty}>
              <Ionicons name="people-outline" size={42} color={L.textSub} />
              <Text style={im.emptyTitle}>No one to invite yet</Text>
              <Text style={im.emptyText}>Connect with players first, then invite them into this group.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={im.list}>
              {inviteCandidates.map(candidate => {
                const sending = sendingInviteIds.has(candidate.id);
                const sent = sentInviteIds.has(candidate.id);
                return (
                  <View key={candidate.id} style={im.row}>
                    {candidate.avatar_url ? (
                      <Image source={{ uri: candidate.avatar_url }} style={im.avatar} />
                    ) : (
                      <View style={[im.avatar, im.avatarFallback]}>
                        <Ionicons name="person-outline" size={19} color={L.textSub} />
                      </View>
                    )}
                    <View style={im.info}>
                      <Text style={im.name}>{candidate.full_name}</Text>
                      <Text style={im.meta}>
                        {candidate.dupr != null ? `DUPR ${candidate.dupr}` : candidate.self_rating ? `Self ${candidate.self_rating}` : 'Unrated'}
                        {candidate.location_city ? ` - ${candidate.location_city}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[im.inviteBtn, sent && im.invitedBtn]}
                      onPress={() => handleSendGroupInvite(candidate)}
                      disabled={sending || sent}
                      activeOpacity={0.85}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={[im.inviteText, sent && im.invitedText]}>{sent ? 'Invited' : 'Invite'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
      {/* ── Shared backdrop dismiss ── */}
      {groupMenu.visible && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 40 }]}
          activeOpacity={1}
          onPress={() => groupMenu.close()}
        />
      )}

      {groupMenu.visible && (
        <ContextMenu
          items={groupMenuItems}
          top={groupMenuTop}
          right={16}
          opacity={groupMenu.opacity}
          scale={groupMenu.scale}
          caretRight={10}
          onItemPress={handleGroupMenuItem}
        />
      )}
    </View>
  );
}

const im = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 16,
  },
  title: { color: L.navy, fontSize: 22, fontWeight: '900' },
  subtitle: { color: L.textSub, fontSize: 13, marginTop: 3 },
  feedback: { fontSize: 12, fontWeight: '800', marginTop: 8 },
  feedbackSuccess: { color: L.success },
  feedbackError: { color: L.danger },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: L.bg, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  list: { gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg, borderRadius: 14,
    borderWidth: 1, borderColor: L.border,
    padding: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: L.page, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  name: { color: L.navy, fontSize: 14, fontWeight: '800' },
  meta: { color: L.textSub, fontSize: 12, marginTop: 3 },
  inviteBtn: {
    minWidth: 74, height: 36, borderRadius: 18,
    backgroundColor: L.gold,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 14,
  },
  invitedBtn: { backgroundColor: 'rgba(36, 176, 96, 0.13)', borderWidth: 1, borderColor: L.success },
  inviteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  invitedText: { color: L.success },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  emptyTitle: { color: L.navy, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: L.textSub, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
// ─── Shared context menu styles ───────────────────────────────────────────────


// ─── Root layout styles ───────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center', justifyContent: 'center',
  },
  topRight: { flexDirection: 'row', gap: 8 },

  banner: { width: '100%', overflow: 'hidden' },
  bannerContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, gap: 6,
  },
  groupName: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  metaDot: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  desc: { color: 'rgba(255,255,255,0.80)', fontSize: 13, lineHeight: 18 },

  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },

  joinBtn: {
    backgroundColor: L.gold, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 9, minWidth: 90, alignItems: 'center',
  },
  joinedBtn: { backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  joinBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  joinedBtnText: { color: '#FFFFFF' },
  chatBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.20)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },

  tabBar: { flexDirection: 'row', backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
  tabText: { color: L.textSub, fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: L.gold, fontWeight: '800' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 8, right: 8,
    height: 2.5, borderRadius: 2, backgroundColor: L.gold,
  },

  content: { flex: 1 },
  tabContentPad: { flex: 1, paddingHorizontal: 16 },
});
