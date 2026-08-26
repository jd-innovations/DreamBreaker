import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/theme';
import { useSession } from '@/hooks/useSession';
import {
  fetchConversations,
  ConversationSummary,
  muteConversation,
  unmuteConversation,
  hideConversation,
  archiveConversation,
  unarchiveConversation,
} from '@/lib/conversationService';
import { fetchStoryCategories, type StoryCategory, type StoryCategoryKey } from '@/lib/storyService';
import { AppIcon, type AppIconName, LoadingState, EmptyState, ErrorState } from '@/components';
import { useSlideMenu } from '@/components/SlideMenu';

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
};


// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const AVATAR_COLORS = ['#4A8C6F', '#3A6B9A', '#1A3A5C', '#B07A5A', '#2A7A4B', '#C9A84C'];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ─── Dynamic Stories bubble config ─────────────────────────────────────────────
// Visual config per category — content itself comes from storyService.
// 'marketplace'/'courts' are always-placeholder (no subsystem exists yet).

const STORY_BUBBLE_CONFIG: Record<StoryCategoryKey, { label: string; bg: string; icon: AppIconName }> = {
  'your-area':    { label: 'Your\nArea',      bg: '#0A1228', icon: 'location' },
  games:          { label: 'Games',           bg: '#2A7A4B', icon: 'pickleball' },
  tournaments:    { label: 'Tournaments',     bg: '#C9A84C', icon: 'trophy' },
  partners:       { label: 'Partners',        bg: '#B07A5A', icon: 'people' },
  marketplace:    { label: 'Marketplace',     bg: '#3A6B9A', icon: 'pricetag' },
  courts:         { label: 'Courts',          bg: '#1A3A5C', icon: 'map' },
};


// ─── Story circle ─────────────────────────────────────────────────────────────

function NewChatCircle() {
  const SIZE = 57;
  return (
    <TouchableOpacity style={st.wrap} activeOpacity={0.75}>
      <View style={[st.dashedRing, { width: SIZE + 8, height: SIZE + 8, borderRadius: (SIZE + 8) / 2 }]}>
        <View style={[st.newInner, { width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]}>
          <Ionicons name="add" size={22} color={L.gold} />
        </View>
      </View>
      <Text style={st.label} numberOfLines={2}>{'New\nChat'}</Text>
    </TouchableOpacity>
  );
}

function StoryCircle({ category }: { category: StoryCategory }) {
  const router = useRouter();
  const SIZE = 57;
  const config = STORY_BUBBLE_CONFIG[category.key];
  const isPlaceholder = category.kind === 'placeholder';
  // Gold ring only when there's real, unviewed content — placeholders and
  // fully-viewed categories get the muted ring so "premium/editorial" reads
  // as live activity, not decoration.
  const ringStyle = isPlaceholder || !category.hasUnviewed ? st.mutedRing : st.goldRing;

  function handlePress() {
    if (isPlaceholder) {
      Alert.alert('Coming Soon', `${config.label.replace('\n', ' ')} stories are on the way.`);
      return;
    }
    router.push(`/story/${category.key}` as never);
  }

  return (
    <TouchableOpacity style={st.wrap} activeOpacity={0.75} onPress={handlePress}>
      <View style={[ringStyle, { width: SIZE + 8, height: SIZE + 8, borderRadius: (SIZE + 8) / 2 }]}>
        <View style={[st.avatar, { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: config.bg, opacity: isPlaceholder ? 0.5 : 1 }]}>
          <AppIcon name={config.icon} size={22} color="#FFFFFF" />
        </View>
      </View>
      {!isPlaceholder && category.hasUnviewed && <View style={st.dot} />}
      <Text style={[st.label, isPlaceholder && { color: L.textMuted }]} numberOfLines={2}>{config.label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  wrap:      { alignItems: 'center', width: 72 },
  goldRing:  { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: L.gold },
  dashedRing:{ alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#C8D4E8', borderStyle: 'dashed' },
  mutedRing: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: L.border },
  avatar:    { alignItems: 'center', justifyContent: 'center' },
  dbText:    { color: L.gold, fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  newInner:  { alignItems: 'center', justifyContent: 'center', backgroundColor: L.page },
  dot: {
    position: 'absolute', top: 52, right: 8,
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: L.online, borderWidth: 2, borderColor: L.bg,
  },
  label: { color: L.text, fontSize: 11, fontWeight: '500', textAlign: 'center', lineHeight: 14, marginTop: 6 },
});


const cc = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: L.border,
    backgroundColor: L.bg, gap: 14,
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },
  initials:   { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: -2,
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: L.online, borderWidth: 2, borderColor: L.bg,
  },
  content: { flex: 1, gap: 5 },
  row1:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  name:    { color: L.text, fontSize: 16, fontWeight: '700' },
  time:    { color: L.textMuted, fontSize: 12, fontWeight: '400' },
  tagRow:  { alignItems: 'flex-start' },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  tagText: { fontSize: 11, fontWeight: '600' },
  row3:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preview: { color: L.textMuted, fontSize: 13, flex: 1, marginRight: 8 },
  badge: {
    minWidth: 24, height: 24, borderRadius: 12,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, flexShrink: 0,
  },
  badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  swipeAction: {
    width: 76, alignItems: 'center', justifyContent: 'center', height: '100%',
    backgroundColor: L.page, gap: 6,
  },
  swipeActionCircle: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
  },
  swipeActionCircleMute: { backgroundColor: '#E8A33D' },
  swipeActionCircleDelete: { backgroundColor: '#D64545' },
  swipeActionCircleArchive: { backgroundColor: '#A6ADBB' },
  swipeActionText: { color: L.textMuted, fontSize: 12, fontWeight: '600' },
});

// ─── Real conversation card ───────────────────────────────────────────────────

function isMuted(c: ConversationSummary): boolean {
  return !!c.muted_until && new Date(c.muted_until).getTime() > Date.now();
}

function RealConvoCard({
  c,
  userId,
  onMuteChange,
  onHide,
  onArchiveChange,
}: {
  c: ConversationSummary;
  userId: string;
  onMuteChange: (id: string, mutedUntil: string | null) => void;
  onHide: (id: string) => void;
  onArchiveChange: (id: string, archivedAt: string | null) => void;
}) {
  const router = useRouter();
  const isGroup = c.kind === 'group';
  const displayName = isGroup ? (c.groupTitle ?? 'Group Chat') : (c.partner?.full_name ?? 'Unknown');
  const initials = getInitials(displayName);
  const bg = avatarColor(c.partner?.id ?? c.id);
  const muted = isMuted(c);
  const archived = !!c.archived_at;

  const tagIcon = isGroup ? (c.relatedTournamentId ? 'trophy' : 'pickleball') : 'people';
  const tagLabel = isGroup ? (c.relatedTournamentId ? 'Tournament Chat' : 'Community Play') : 'Direct Message';

  function handlePress() {
    if (c.relatedTournamentId) {
      router.push(`/conversation/tournament-${c.relatedTournamentId}` as never);
    } else if (c.relatedPlayEventId) {
      router.push({ pathname: '/community/[id]', params: { id: c.relatedPlayEventId, tab: 'chat' } } as never);
    } else {
      router.push(`/conversation/${c.id}` as never);
    }
  }

  async function handleToggleMute() {
    try {
      if (muted) {
        await unmuteConversation(c.id, userId);
        onMuteChange(c.id, null);
      } else {
        await muteConversation(c.id, userId);
        onMuteChange(c.id, new Date(Date.now() + 100 * 365 * 86_400_000).toISOString());
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update mute state');
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete Conversation',
      `Remove this conversation with ${displayName} from your inbox? It will still exist for the other participant.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hideConversation(c.id, userId);
              onHide(c.id);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete conversation');
            }
          },
        },
      ],
    );
  }

  async function handleToggleArchive() {
    try {
      if (archived) {
        await unarchiveConversation(c.id, userId);
        onArchiveChange(c.id, null);
      } else {
        await archiveConversation(c.id, userId);
        onArchiveChange(c.id, new Date().toISOString());
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update archive state');
    }
  }

  function renderRightActions() {
    return (
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity style={cc.swipeAction} onPress={handleToggleMute} activeOpacity={0.7}>
          <View style={[cc.swipeActionCircle, cc.swipeActionCircleMute]}>
            <Ionicons name={muted ? 'notifications' : 'notifications-off'} size={20} color="#FFFFFF" />
          </View>
          <Text style={cc.swipeActionText}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cc.swipeAction} onPress={handleDelete} activeOpacity={0.7}>
          <View style={[cc.swipeActionCircle, cc.swipeActionCircleDelete]}>
            <Ionicons name="trash" size={20} color="#FFFFFF" />
          </View>
          <Text style={cc.swipeActionText}>Delete</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cc.swipeAction} onPress={handleToggleArchive} activeOpacity={0.7}>
          <View style={[cc.swipeActionCircle, cc.swipeActionCircleArchive]}>
            <Ionicons name={archived ? 'arrow-undo' : 'archive'} size={20} color="#FFFFFF" />
          </View>
          <Text style={cc.swipeActionText}>{archived ? 'Unarchive' : 'Archive'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <TouchableOpacity
        style={cc.row}
        activeOpacity={0.7}
        onPress={handlePress}
      >
        {/* Avatar */}
        <View style={cc.avatarWrap}>
          {!isGroup && c.partner?.avatar_url ? (
            <Image
              source={{ uri: c.partner.avatar_url }}
              style={[cc.avatar, { borderRadius: 29 }]}
            />
          ) : (
            <View style={[cc.avatar, { backgroundColor: bg }]}>
              {isGroup ? (
                <Ionicons name={c.relatedTournamentId ? 'trophy' : 'people'} size={22} color="#FFFFFF" />
              ) : (
                <Text style={cc.initials}>{initials}</Text>
              )}
            </View>
          )}
          {!isGroup && <View style={cc.onlineDot} />}
        </View>

        {/* Content */}
        <View style={cc.content}>
          {/* Name + time */}
          <View style={cc.row1}>
            <View style={cc.nameRow}>
              <Text style={cc.name} numberOfLines={1}>
                {displayName}
              </Text>
              {muted && (
                <Ionicons name="notifications-off" size={13} color={L.textMuted} style={{ marginLeft: 6 }} />
              )}
            </View>
            <Text style={cc.time}>{formatTime(c.last_message_at)}</Text>
          </View>

          {/* Status tag */}
          <View style={cc.tagRow}>
            <View style={[cc.tag, { borderColor: L.gold, backgroundColor: L.goldLight }]}>
              <Ionicons name={tagIcon as never} size={11} color={L.gold} />
              <Text style={[cc.tagText, { color: L.navy }]}>{tagLabel}</Text>
            </View>
          </View>

          {/* Preview + unread badge */}
          <View style={cc.row3}>
            <Text style={cc.preview} numberOfLines={1}>
              {c.last_message_preview ?? (c.last_message_at ? '' : 'No messages yet')}
            </Text>
            {!muted && c.unread_count > 0 && (
              <View style={cc.badge}>
                <Text style={cc.badgeText}>{c.unread_count}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const FILTER_TABS = ['Primary', 'Requests', 'Archived'] as const;
type FilterTab = typeof FILTER_TABS[number];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading: authLoading } = useSession();
  const [search, setSearch]         = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const [tab, setTab]               = useState<FilterTab>('Primary');
  const [convos, setConvos]         = useState<ConversationSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [storyCategories, setStoryCategories] = useState<StoryCategory[]>([]);
  const { setTriggerVisible } = useSlideMenu();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/sign-in' as never);
  }, [user, authLoading, router]);

  // Hide the floating hamburger trigger while this screen is focused. Restored on blur.
  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversations(user.id, { mode: tab === 'Archived' ? 'archived' : 'primary' });
      setConvos(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, [user?.id, tab]);

  const loadStories = useCallback(async () => {
    if (!user?.id) return;
    try {
      const categories = await fetchStoryCategories(user.id);
      setStoryCategories(categories);
    } catch {
      // Story row is non-critical — fail silently and just show nothing rather
      // than blocking the inbox the user actually came here for.
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { load(); loadStories(); }, [load, loadStories]));

  const handleMuteChange = useCallback((id: string, mutedUntil: string | null) => {
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, muted_until: mutedUntil } : c)));
  }, []);

  const handleHide = useCallback((id: string) => {
    setConvos((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Toggling archive always removes the row from whichever list is currently
  // showing — archiving drops it from Primary, unarchiving drops it from
  // Archived — since either action moves it out of the tab you're looking at.
  const handleArchiveChange = useCallback((id: string, _archivedAt: string | null) => {
    setConvos((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const visible = convos.filter(c =>
    !search ||
    (c.partner?.full_name ?? c.groupTitle ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={s.header}>
        <Text style={s.title}>Chats</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn} onPress={() => searchInputRef.current?.focus()}>
            <Ionicons name="search" size={24} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/new-message' as never)}>
            <Ionicons name="create-outline" size={24} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SEARCH ── */}
      <View style={s.searchWrap}>
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color={L.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={s.searchInput}
            placeholder="Search messages or players..."
            placeholderTextColor={L.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity>
            <Ionicons name="options-outline" size={20} color={L.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── STORIES ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.storiesRow}
        style={s.storiesStrip}
      >
        {storyCategories.map(category => <StoryCircle key={category.key} category={category} />)}
        <NewChatCircle />
      </ScrollView>

      {/* Separator */}
      <View style={s.separator} />

      {/* ── FILTER TABS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={s.filterStrip}
      >
        {FILTER_TABS.map(f => {
          const active = tab === f;
          return (
            <TouchableOpacity
              key={f}
              style={[s.filterTab, active && s.filterTabActive]}
              onPress={() => setTab(f)}
            >
              <Text style={[s.filterLabel, active && s.filterLabelActive]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Separator */}
      <View style={s.separator} />

      {/* ── LIST ── */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={c => c.id}
          renderItem={({ item }) => (
            <RealConvoCard
              c={item}
              userId={user?.id ?? ''}
              onMuteChange={handleMuteChange}
              onHide={handleHide}
              onArchiveChange={handleArchiveChange}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={s.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            search ? (
              <EmptyState
                icon="search-outline"
                title="No results"
                message={`Nothing matches "${search}".`}
              />
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title="No conversations yet"
                message="Message a player from their profile to start one."
              />
            )
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 16, paddingRight: 16, paddingVertical: 12, backgroundColor: L.bg,
  },
  title:       { flex: 1, color: L.navy, fontSize: 26, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  composeBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: L.gold, alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchWrap: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: L.bg },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0F4FA', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  searchInput: { flex: 1, color: L.text, fontSize: 15, padding: 0 },

  // Stories — flexShrink:0 stops the column from compressing this strip (which clipped the
  // labels); flexGrow:0 makes it hug its content height. No magic pixel height needed.
  storiesStrip: { backgroundColor: L.bg, flexGrow: 0, flexShrink: 0 },
  storiesRow:   { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 },

  // Separator
  separator: { height: 1, backgroundColor: L.border },

  // List — owns the remaining space below the fixed strips and scrolls internally.
  list: { flex: 1 },

  // Filter tabs — same flex guard so the strip can't be compressed by the column.
  filterStrip: { backgroundColor: L.bg, flexGrow: 0, flexShrink: 0 },
  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 24, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  filterTabActive:      { backgroundColor: L.navy, borderColor: L.navy },
  filterLabel:          { color: L.textSub, fontSize: 14, fontWeight: '600' },
  filterLabelActive:    { color: '#FFFFFF' },
  reqBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: L.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  reqBadgeActive:     { backgroundColor: 'rgba(255,255,255,0.2)' },
  reqBadgeText:       { color: L.navy, fontSize: 11, fontWeight: '800' },
  reqBadgeTextActive: { color: '#FFFFFF' },

  // Empty
  empty:     { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: L.textMuted, fontSize: 15, fontWeight: '500' },
});
