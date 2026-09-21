import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Image, Alert, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { resolvePlayerRating, formatPlayerRating } from '@/lib/playerRating';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useCurrentLocation, type Coordinates } from '@/lib/location';
import { haversineMiles } from '@/lib/useFinderCandidates';
import { getOrCreateConversation } from '@/lib/conversationService';
import { ContextMenu, useContextMenu, type MenuItem } from '@/components/ContextMenu';
import { useSupportContext } from '@/lib/support/supportContext';
import { fetchContacts, removeContact, type Contact } from '@/lib/supabase/savedPlayers';
import type { Connection } from '@/lib/connectionStore';

const L = {
  bg: colors.bg, page: colors.page, navy: colors.navy,
  gold: colors.gold, goldBg: colors.goldBg,
  text: colors.text, textSub: colors.textSub, border: colors.border,
  success: colors.success, successBg: colors.successBg,
  danger: colors.danger,
  white: colors.white,
};

// Contacts is a DIFFERENT relationship from the other two, not a filter of
// them: All/Recent slice mutual connections (partner_matches), Contacts is
// the one-sided private shortlist (partner_likes, kind='save'). They share a
// screen because that is where someone looks for "people I know", not
// because they share a data source.
type Tab = 'All' | 'Recent' | 'Contacts';
const TABS: Tab[] = ['All', 'Recent', 'Contacts'];

// Apple's minimum touch target. Not a spacing token — the scale tops out at 32
// and this is a platform floor, not a rhythm value. The four 32px circles this
// card used to carry were all under it.
const TOUCH_TARGET = 44;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4)  return `${w}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Avatar({ uri, size }: { uri?: string; size: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.46} color={L.textSub} />
    </View>
  );
}
const av = StyleSheet.create({
  circle: { backgroundColor: L.page, borderWidth: 1, borderColor: L.border, alignItems: 'center', justifyContent: 'center' },
});

/**
 * A contact row. Deliberately lighter than ConnectionCard: a contact is
 * someone you noted, not someone who agreed to anything, so the card offers
 * the profile and a way to drop them — and no Message button, because
 * messaging a non-connection is gated server-side and a button that usually
 * fails is worse than no button.
 */
function ContactCard({ contact, onRemove }: { contact: Contact; onRemove: () => void }) {
  return (
    <TouchableOpacity
      style={cc.card}
      activeOpacity={0.7}
      onPress={() => router.push(`/match/profile/${contact.player.id}` as never)}
    >
      <View style={cc.top}>
        <Avatar uri={contact.player.photoUri} size={52} />
        <View style={cc.info}>
          <Text style={cc.name} numberOfLines={2}>{contact.player.name}</Text>
          <View style={cc.duprBadge}>
            <Ionicons name="speedometer-outline" size={10} color={L.gold} />
            <Text style={cc.duprText}>
              {formatPlayerRating({ value: contact.player.dupr, source: contact.player.ratingSource })}
            </Text>
          </View>
          <Text style={cc.meta} numberOfLines={1}>{contact.player.location}</Text>
          <Text style={cc.meta}>Saved {relativeDate(contact.savedAt)}</Text>
        </View>
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${contact.player.name} from contacts`}
        >
          <Ionicons name="close" size={18} color={L.textSub} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function ConnectionCard({ conn, onMore, onMessage, messaging }: {
  conn: Connection;
  onMore: () => void;
  onMessage: () => void;
  messaging: boolean;
}) {
  return (
    // The row itself opens the profile. It was a plain View, so tapping a
    // person — the reflexive gesture on a row like this — did nothing, while a
    // 32px circle off to the right did the job the row should do.
    <TouchableOpacity
      style={cc.card}
      activeOpacity={0.7}
      onPress={() => router.push(`/match/profile/${conn.player.id}` as never)}
    >
      {/* Identity row, then actions beneath. Side by side, two labelled
          buttons plus the overflow would have left the name about 64pt — the
          reason the old treatment used four unlabelled 32px circles. */}
      <View style={cc.top}>
        <Avatar uri={conn.player.photoUri} size={52} />

        <View style={cc.info}>
          <Text style={cc.name} numberOfLines={2}>{conn.player.name}</Text>
          <View style={cc.duprBadge}>
            <Ionicons name="speedometer-outline" size={10} color={L.gold} />
            <Text style={cc.duprText}>
              {formatPlayerRating({ value: conn.player.dupr, source: conn.player.ratingSource })}
            </Text>
          </View>
          <Text style={cc.meta} numberOfLines={1}>
            {conn.player.location}
            {conn.player.distance != null ? ` · ${conn.player.distance} mi` : ''}
          </Text>
          <Text style={cc.meta}>Connected {relativeDate(conn.connectedAt)}</Text>
        </View>

        <TouchableOpacity style={cc.moreBtn} onPress={onMore} activeOpacity={0.7} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={18} color={L.textSub} />
        </TouchableOpacity>
      </View>

      <View style={cc.actions}>
        {/* Two primary actions, labelled, matching match/saved.tsx — the
            sibling screen in this module already labels its buttons, and
            unlabelled a paper-plane and a chat bubble are a guess. Everything
            else moved behind the overflow: a menu costs a tap on every action,
            which is the wrong trade for the two people actually use.

            These are also 44pt tall now. The old 32px circles were under
            Apple's minimum target size, four of them side by side. */}
        <TouchableOpacity style={cc.primaryBtn} onPress={onMessage} disabled={messaging} activeOpacity={0.8}>
          {messaging
            ? <ActivityIndicator size="small" color={L.navy} />
            : <>
                <Ionicons name="chatbubble-outline" size={15} color={L.navy} />
                <Text style={cc.primaryText}>Message</Text>
              </>}
        </TouchableOpacity>

        <TouchableOpacity
          style={cc.inviteBtn}
          activeOpacity={0.8}
          onPress={() => router.push(
            // name, so the invite flow can address them by it. Without it every
            // screen in the flow falls back to "this player".
            `/players/${conn.player.id}/invite?name=${encodeURIComponent(conn.player.name)}` as never,
          )}
        >
          <Ionicons name="paper-plane-outline" size={15} color={L.white} />
          <Text style={cc.inviteText}>Invite</Text>
        </TouchableOpacity>

      </View>
    </TouchableOpacity>
  );
}

const cc = StyleSheet.create({
  card: {
    gap: spacing.md,
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  info: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: L.navy, fontSize: text.body.size, lineHeight: 18, fontWeight: '500' },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  duprText: { color: L.gold, fontSize: 11, fontWeight: '700' },
  meta: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  // spacing.md for avatar-to-info, matching invites.tsx's newCardTop, which
  // is the same relationship on a comparable card.
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minHeight: TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: shape.cta,
    backgroundColor: L.page, borderWidth: 1.5, borderColor: L.border,
  },
  primaryText: { color: L.navy, fontSize: text.action.size, fontWeight: '800' },
  inviteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minHeight: TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: shape.cta,
    backgroundColor: L.gold,
  },
  inviteText: { color: L.white, fontSize: text.action.size, fontWeight: '800' },
  moreBtn: { minHeight: TOUCH_TARGET, width: spacing.xxl, alignItems: 'center', justifyContent: 'center' },
});

// Takes the viewer's id rather than calling supabase.auth.getUser().
//
// getUser() is a NETWORK round-trip to the auth server, not a read of the
// cached session — so this screen did auth → matches → profiles, three serial
// round-trips before anything rendered. useSession already holds the user in
// module state.
async function fetchMatches(userId: string, mine: Coordinates | null): Promise<Connection[]> {
  const user = { id: userId };

  const { data: matches } = await supabase
    .from('partner_matches')
    .select('id, user_a, user_b, matched_at')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('matched_at', { ascending: false });

  if (!matches || matches.length === 0) return [];

  const otherIds = matches.map(m => m.user_a === user.id ? m.user_b : m.user_a);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, dupr, self_rating, location_city, location_state, location_lat, location_lng, looking_status')
    .in('id', otherIds);

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  return matches
    .map(m => {
      const otherId = m.user_a === user.id ? m.user_b : m.user_a;
      const p = profileMap[otherId];
      if (!p) return null;
      const rating = resolvePlayerRating(p.dupr, p.self_rating);
      const location = [p.location_city, p.location_state].filter(Boolean).join(', ') || 'Unknown';
      // Was hardcoded to 0, so every card read "0 mi". null means unknown —
      // either the viewer's location is unavailable or the other player never
      // set one — and the card omits it rather than inventing a number.
      const distance = mine && p.location_lat != null && p.location_lng != null
        ? Math.round(haversineMiles(mine, { lat: p.location_lat, lng: p.location_lng }))
        : null;
      return {
        id: m.id,
        player: {
          id: p.id,
          name: p.full_name,
          dupr: rating.value,
          ratingSource: rating.source,
          location,
          distance,
          lookingFor: p.looking_status || 'Partner',
          photoUri: p.avatar_url ?? undefined,
        },
        connectedAt: m.matched_at,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null) as Connection[];
}

export default function MyConnectionsScreen() {
  const insets = useSafeAreaInsets();
  // Deep-linkable: the Partner menu's "My Contacts" entry lands on that tab
  // directly rather than dropping people on All and making them find it.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab]           = useState<Tab>(
    TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'All',
  );
  const [connections, setConns] = useState<Connection[]>([]);
  const [loading, setLoading]   = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const contactsLoadedOnce = useRef(false);

  useSupportContext({ feature: 'match' });

  const { user } = useSession();
  const location = useCurrentLocation();
  const mine = location.isFallback ? null : { lat: location.lat, lng: location.lng };

  // Spinner on the FIRST load only. This ran setLoading(true) on every focus,
  // so returning to the screen blanked a list that was already in state and
  // showed a spinner again — most of what made it feel slow was the screen
  // throwing away what it already had.
  const loadedOnce = useRef(false);

  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    let cancelled = false;
    if (!loadedOnce.current) setLoading(true);
    fetchMatches(user.id, mine).then(data => {
      if (!cancelled) { setConns(data); setLoading(false); loadedOnce.current = true; }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mine?.lat, mine?.lng]));

  // Deferred: the two default tabs are mutual connections, and most visits
  // never open this one. Loading it on mount would put a second round trip in
  // front of every arrival for a list nobody asked for yet.
  useFocusEffect(useCallback(() => {
    if (tab !== 'Contacts' || !user?.id) return;
    let cancelled = false;
    if (!contactsLoadedOnce.current) setContactsLoading(true);
    fetchContacts(user.id)
      .then(rows => { if (!cancelled) { setContacts(rows); contactsLoadedOnce.current = true; } })
      .catch(() => { /* leaves the previous list rather than blanking it */ })
      .finally(() => { if (!cancelled) setContactsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, user?.id]));

  async function handleRemoveContact(contact: Contact) {
    if (!user?.id) return;
    const previous = contacts;
    setContacts(prev => prev.filter(c => c.player.id !== contact.player.id));
    try {
      await removeContact(user.id, contact.player.id);
    } catch {
      setContacts(previous);
      Alert.alert('Could not remove', 'Please try again.');
    }
  }

  const shown = tab === 'Recent'
    ? connections.filter(c => Date.now() - new Date(c.connectedAt).getTime() < WEEK_MS)
    : connections;

  const [messagingId, setMessagingId] = useState<string | null>(null);

  // Remove lives behind the overflow now. It is destructive and rare, and it
  // used to sit as an equal-weight circle beside the two actions people
  // actually came here for. The shared ContextMenu gives the real iOS action
  // sheet, with the red destructive treatment, for free.
  const [menuFor, setMenuFor] = useState<Connection | null>(null);
  const cardMenu = useContextMenu();
  const MENU_ITEMS: MenuItem[] = [
    { icon: 'person-outline', label: 'View Profile' },
    { icon: 'person-remove-outline', label: 'Remove Connection', danger: true },
  ];

  function openMenu(conn: Connection) {
    setMenuFor(conn);
    cardMenu.present(MENU_ITEMS, (label) => handleMenuItem(conn, label));
  }

  function handleMenuItem(conn: Connection, label: string) {
    cardMenu.close(() => {
      if (label === 'View Profile') {
        router.push(`/match/profile/${conn.player.id}` as never);
      } else if (label === 'Remove Connection') {
        Alert.alert(
          'Remove Connection',
          `Remove ${conn.player.name} from your connections?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => { void handleRemove(conn); } },
          ],
        );
      }
    });
  }

  async function handleMessage(conn: Connection) {
    if (!user?.id || messagingId) return;
    setMessagingId(conn.id);
    try {
      const convId = await getOrCreateConversation(user.id, conn.player.id);
      router.push(`/conversation/${convId}` as never);
    } catch {
      Alert.alert('Could not open the conversation', 'Please try again.');
    } finally {
      setMessagingId(null);
    }
  }

  async function handleRemove(conn: Connection) {
    await supabase.from('partner_matches').delete().eq('id', conn.id);
    setConns(prev => prev.filter(c => c.id !== conn.id));
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* Safe-area inset on the HEADER, not the root, so the white header
          colour runs to the top of the screen. On the root, the status-bar
          strip takes the root's page grey and the header reads as a band
          floating below it. Pattern and rationale from wallet.tsx. */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title}>My Connections</Text>
          <Text style={s.subtitle}>
            {tab === 'Contacts'
              ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
              : `${connections.length} player${connections.length !== 1 ? 's' : ''} connected`}
          </Text>
        </View>
        {/* The directory's entry point. Until now player search existed only
            inside "new message" and "invite to event" — you could find someone
            only if you were already doing something else with them. */}
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.push('/match/directory' as never)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Find players"
        >
          <Ionicons name="search" size={19} color={L.navy} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabStrip}
        style={s.tabBar}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabChip, tab === t && s.tabChipActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {tab === 'Contacts' ? (
          contactsLoading && contacts.length === 0 ? (
            <View style={s.empty}><ActivityIndicator size="large" color={L.navy} /></View>
          ) : contacts.length > 0 ? (
            <View style={s.list}>
              {contacts.map(c => (
                <ContactCard
                  key={c.player.id}
                  contact={c}
                  onRemove={() => { void handleRemoveContact(c); }}
                />
              ))}
            </View>
          ) : (
            <View style={s.empty}>
              <Ionicons name="bookmark-outline" size={52} color={L.textSub} />
              <Text style={s.emptyTitle}>No contacts yet</Text>
              <Text style={s.emptySub}>
                Save a player from their profile to keep them here. A contact is
                private — they are not told, and it is not a connection.
              </Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => router.push('/match/directory' as never)}
                activeOpacity={0.85}
              >
                <Text style={s.emptyBtnText}>Find Players</Text>
              </TouchableOpacity>
            </View>
          )
        ) : loading ? (
          <View style={s.empty}>
            <ActivityIndicator size="large" color={L.navy} />
          </View>
        ) : shown.length > 0 ? (
          <View style={s.list}>
            {shown.map(c => (
              <ConnectionCard
                key={c.id}
                conn={c}
                onMore={() => openMenu(c)}
                onMessage={() => handleMessage(c)}
                messaging={messagingId === c.id}
              />
            ))}
          </View>
        ) : (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={52} color={L.textSub} />
            <Text style={s.emptyTitle}>
              {tab === 'Recent' ? 'No recent connections' : 'No connections yet'}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'Recent'
                ? 'No new connections in the last 7 days.'
                : 'Connect with players in the Partner Finder to see them here.'}
            </Text>
            {tab === 'All' && (
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => router.push('/match/directory' as never)}
                activeOpacity={0.85}
              >
                <Text style={s.emptyBtnText}>Find Players</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </ScrollView>

      {/* Android only. On iOS present() shows the system action sheet and this
          renders nothing — see ContextMenu.tsx. */}
      {cardMenu.visible && menuFor && (
        <ContextMenu
          items={MENU_ITEMS}
          top={insets.top + 64}
          right={16}
          opacity={cardMenu.opacity}
          scale={cardMenu.scale}
          onItemPress={(label) => handleMenuItem(menuFor, label)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.screenH, paddingVertical: 12,
    backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: L.navy, fontSize: text.modalTitle.size, fontWeight: '900' },
  subtitle: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  tabBar: { backgroundColor: L.bg, borderBottomWidth: 1, borderBottomColor: L.border, maxHeight: 50, flexGrow: 0 },
  tabStrip: { paddingHorizontal: spacing.screenH, paddingVertical: 8, gap: 8 },
  tabChip: { borderRadius: shape.pill, borderWidth: 1.5, borderColor: L.border, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: L.bg },
  tabChipActive: { backgroundColor: L.navy, borderColor: L.navy },
  tabText: { color: L.textSub, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },
  scroll: { paddingHorizontal: spacing.screenH, paddingTop: 16 },
  list: { gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },
  emptySub: { color: L.textSub, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  emptyBtn: { backgroundColor: L.gold, borderRadius: shape.cta, paddingHorizontal: 28, paddingVertical: 13, marginTop: 8 },
  emptyBtnText: { color: '#FFFFFF', fontSize: text.actionLarge.size, fontWeight: '800' },
});