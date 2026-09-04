import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import {
  fetchReceivedInvites, acceptPlayEventInvite, declinePlayEventInvite,
  fetchSentInvites, cancelPlayEventInvite,
  type ReceivedPlayEventInvite, type SentPlayEventInvite,
} from '@/lib/supabase/playEventInvites';
import {
  acceptGroupInvite,
  cancelGroupInvite,
  declineGroupInvite,
  fetchReceivedGroupInvites,
  fetchSentGroupInvites,
  type ReceivedGroupInviteDetails,
  type SentGroupInviteDetails,
} from '@/lib/supabase/groupInvites';
import {
  fetchNotifications, markNotificationRead, type AppNotification,
} from '@/lib/supabase/notifications';

// ─── Design tokens ────────────────────────────────────────────────────────────

// Theme-backed alias — brand values resolve from @/theme.
const L = {
  bg:         colors.bg,
  page:       colors.page,
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldBorder: colors.goldBorder,
  textSub:    colors.textSub,
  textMuted:  colors.textSub,
  border:     colors.border,
  div:        colors.border,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey    = 'received' | 'sent' | 'activity';
type InvStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

// Flattened display shape for both received-history and sent rows, built from
// real `play_event_invites` rows (see mapReceivedToInvite/mapSentToInvite below).
interface Invite {
  id:        string;
  name:      string;
  avatar?:   string;
  type:      string;
  date:      string;
  status:    InvStatus;
}

function mapReceivedToInvite(inv: ReceivedPlayEventInvite): Invite {
  return {
    id:     inv.id,
    name:   inv.inviter?.full_name ?? 'A player',
    avatar: inv.inviter?.avatar_url ?? undefined,
    type:   inv.play_event?.name ?? 'A game',
    date:   inv.play_event?.event_date ?? '',
    status: inv.status === 'cancelled' ? 'cancelled' : (inv.status as InvStatus),
  };
}

function mapSentToInvite(inv: SentPlayEventInvite): Invite {
  return {
    id:     inv.id,
    name:   inv.invitee?.full_name ?? 'A player',
    avatar: inv.invitee?.avatar_url ?? undefined,
    type:   inv.play_event?.name ?? 'A game',
    date:   inv.play_event?.event_date ?? '',
    status: inv.status as InvStatus,
  };
}

function mapReceivedGroupToInvite(inv: ReceivedGroupInviteDetails): Invite {
  return {
    id:     inv.id,
    name:   inv.inviter?.full_name ?? 'A player',
    avatar: inv.inviter?.avatar_url ?? undefined,
    type:   inv.group?.name ?? 'A group',
    date:   inv.created_at.slice(0, 10),
    status: inv.status as InvStatus,
  };
}

function mapSentGroupToInvite(inv: SentGroupInviteDetails): Invite {
  return {
    id:     inv.id,
    name:   inv.invitee?.full_name ?? 'A player',
    avatar: inv.invitee?.avatar_url ?? undefined,
    type:   inv.group?.name ?? 'A group',
    date:   inv.created_at.slice(0, 10),
    status: inv.status as InvStatus,
  };
}

// ─── Status chip ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<InvStatus, { bg: string; color: string; label: string }> = {
  pending:   { bg: '#F0EDE4',               color: L.textSub,   label: 'Pending'   },
  accepted:  { bg: L.goldBg,                color: L.gold,      label: 'Accepted'  },
  declined:  { bg: '#F0F0F3',               color: L.textMuted, label: 'Declined'  },
  cancelled: { bg: '#F0F0F3',               color: L.textMuted, label: 'Cancelled' },
};

function StatusChip({ status }: { status: InvStatus }) {
  const { bg, color, label } = STATUS_STYLE[status];
  return (
    <View style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ uri, size = 44 }: { uri?: string; size?: number }) {
  return uri ? (
    <Image
      source={{ uri }}
      style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5, borderColor: L.border, flexShrink: 0,
      }}
    />
  ) : (
    <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.5} color={L.textMuted} />
    </View>
  );
}

// ─── Compact history / sent row ───────────────────────────────────────────────

function InviteRow({
  invite, last, onCancel, cancelling,
}: {
  invite: Invite; last?: boolean; onCancel?: () => void; cancelling?: boolean;
}) {
  return (
    <>
      <View style={s.row}>
        <Avatar uri={invite.avatar} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={s.rowName}>{invite.name}</Text>
          <Text style={s.rowType}>{invite.type}</Text>
        </View>
        <View style={s.rowRight}>
          {!!invite.date && <Text style={s.rowDate}>{invite.date}</Text>}
          {onCancel ? (
            <TouchableOpacity onPress={onCancel} disabled={cancelling} hitSlop={8}>
              {cancelling ? (
                <ActivityIndicator size="small" color={L.textMuted} />
              ) : (
                <Text style={s.cancelLink}>Cancel</Text>
              )}
            </TouchableOpacity>
          ) : (
            <StatusChip status={invite.status} />
          )}
        </View>
      </View>
      {!last && <View style={s.divider} />}
    </>
  );
}

// ─── Real game-invite card (play_event_invites) ────────────────────────────────

function GameInviteCard({
  invite, onAccept, onDecline, busy,
}: {
  invite: ReceivedPlayEventInvite;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <View style={s.newCard}>
      <View style={s.newCardTop}>
        <Avatar uri={invite.inviter?.avatar_url ?? undefined} size={46} />
        <View style={{ flex: 1 }}>
          <View style={s.newCardNameRow}>
            <Text style={s.newCardName}>{invite.inviter?.full_name ?? 'A player'}</Text>
          </View>
          <Text style={s.newCardType}>Community Play</Text>
        </View>
      </View>

      <View style={s.newCardDetails}>
        <View style={s.detailRow}>
          <Ionicons name="tennisball-outline" size={14} color={L.textSub} />
          <Text style={[s.detailText, s.detailTextFlex]}>{invite.play_event?.name ?? 'A game'}</Text>
        </View>
        {!!invite.play_event?.event_date && (
          <View style={s.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={L.textSub} />
            <Text style={[s.detailText, s.detailTextFlex]}>{invite.play_event.event_date}</Text>
          </View>
        )}
        {!!(invite.play_event?.venue_name ?? invite.play_event?.location) && (
          <View style={s.detailRow}>
            <Ionicons name="location-outline" size={14} color={L.textSub} />
            <Text style={[s.detailText, s.detailTextFlex]}>{invite.play_event?.venue_name ?? invite.play_event?.location}</Text>
          </View>
        )}
      </View>

      <View style={s.gameInviteActions}>
        <TouchableOpacity
          style={s.declineBtn}
          activeOpacity={0.8}
          disabled={busy}
          onPress={onDecline}
        >
          <Text style={s.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.acceptBtn}
          activeOpacity={0.85}
          disabled={busy}
          onPress={onAccept}
        >
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.acceptBtnText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function GroupInviteCard({
  invite, onAccept, onDecline, busy,
}: {
  invite: ReceivedGroupInviteDetails;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <View style={s.newCard}>
      <View style={s.newCardTop}>
        <Avatar uri={invite.inviter?.avatar_url ?? undefined} size={46} />
        <View style={{ flex: 1 }}>
          <View style={s.newCardNameRow}>
            <Text style={s.newCardName}>{invite.inviter?.full_name ?? 'A player'}</Text>
          </View>
          <Text style={s.newCardType}>Group Invite</Text>
        </View>
      </View>

      <View style={s.newCardDetails}>
        <View style={s.detailRow}>
          <Ionicons name="people-outline" size={14} color={L.textSub} />
          <Text style={[s.detailText, s.detailTextFlex]}>{invite.group?.name ?? 'A group'}</Text>
        </View>
        {!!invite.group?.privacy && (
          <View style={s.detailRow}>
            <Ionicons name={invite.group.privacy === 'public' ? 'globe-outline' : 'lock-closed-outline'} size={14} color={L.textSub} />
            <Text style={[s.detailText, s.detailTextFlex]}>{invite.group.privacy === 'public' ? 'Public group' : 'Private group'}</Text>
          </View>
        )}
      </View>

      <View style={s.gameInviteActions}>
        <TouchableOpacity
          style={s.declineBtn}
          activeOpacity={0.8}
          disabled={busy}
          onPress={onDecline}
        >
          <Text style={s.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.acceptBtn}
          activeOpacity={0.85}
          disabled={busy}
          onPress={onAccept}
        >
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.acceptBtnText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Activity row (generic notifications feed) ─────────────────────────────────

const NOTIFICATION_ICON: Record<string, string> = {
  wallet_item_added:     'wallet-outline',
  wallet_item_available: 'checkmark-circle-outline',
  match_recorded:        'tennisball-outline',
  match_claimed:         'checkmark-done-circle-outline',
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function NotificationRow({ notification, last, onPress }: { notification: AppNotification; last?: boolean; onPress: () => void }) {
  const isUnread = !notification.readAt;
  return (
    <>
      <TouchableOpacity style={s.notifRow} activeOpacity={0.7} onPress={onPress}>
        <View style={[s.notifIcon, isUnread && s.notifIconUnread]}>
          <Ionicons
            name={(NOTIFICATION_ICON[notification.type] ?? 'notifications-outline') as never}
            size={18}
            color={isUnread ? L.gold : L.textMuted}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.notifTitle, isUnread && s.notifTitleUnread]}>{notification.title}</Text>
          {!!notification.body && <Text style={s.notifBody} numberOfLines={2}>{notification.body}</Text>}
          <Text style={s.notifTime}>{timeAgo(notification.createdAt)}</Text>
        </View>
        {isUnread && <View style={s.notifDot} />}
      </TouchableOpacity>
      {!last && <View style={s.divider} />}
    </>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon as never} size={40} color={L.textMuted} />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptySub}>{sub}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InvitesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { profile } = useProfile();
  const [tab, setTab]             = useState<TabKey>('received');
  const [gameInvites, setGameInvites] = useState<ReceivedPlayEventInvite[]>([]);
  const [receivedHistory, setReceivedHistory] = useState<ReceivedPlayEventInvite[]>([]);
  const [groupInvites, setGroupInvites] = useState<ReceivedGroupInviteDetails[]>([]);
  const [groupInviteHistory, setGroupInviteHistory] = useState<ReceivedGroupInviteDetails[]>([]);
  const [sentInvites, setSentInvites] = useState<SentPlayEventInvite[]>([]);
  const [sentGroupInvites, setSentGroupInvites] = useState<SentGroupInviteDetails[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshNotifications = useCallback(() => {
    if (!user?.id) { setNotifications([]); return; }
    fetchNotifications(user.id).then(setNotifications);
  }, [user?.id]);

  const refreshReceivedInvites = useCallback(() => {
    if (!user?.id) { setGameInvites([]); setReceivedHistory([]); return; }
    fetchReceivedInvites(user.id).then(invites => {
      setGameInvites(invites.filter(i => i.status === 'pending'));
      setReceivedHistory(invites.filter(i => i.status !== 'pending'));
    });
  }, [user?.id]);

  const refreshReceivedGroupInvites = useCallback(() => {
    if (!user?.id) { setGroupInvites([]); setGroupInviteHistory([]); return; }
    fetchReceivedGroupInvites(user.id)
      .then(invites => {
        setGroupInvites(invites.filter(i => i.status === 'pending'));
        setGroupInviteHistory(invites.filter(i => i.status !== 'pending'));
      })
      .catch(() => {
        setGroupInvites([]);
        setGroupInviteHistory([]);
      });
  }, [user?.id]);

  const refreshSentInvites = useCallback(() => {
    if (!user?.id) { setSentInvites([]); return; }
    fetchSentInvites(user.id).then(setSentInvites);
  }, [user?.id]);

  const refreshSentGroupInvites = useCallback(() => {
    if (!user?.id) { setSentGroupInvites([]); return; }
    fetchSentGroupInvites(user.id)
      .then(setSentGroupInvites)
      .catch(() => setSentGroupInvites([]));
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    refreshReceivedInvites();
    refreshReceivedGroupInvites();
    refreshSentInvites();
    refreshSentGroupInvites();
    refreshNotifications();
  }, [refreshReceivedInvites, refreshReceivedGroupInvites, refreshSentInvites, refreshSentGroupInvites, refreshNotifications]));

  async function handleOpenNotification(notification: AppNotification) {
    if (!notification.readAt) {
      setNotifications(prev => prev.map(n => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)));
      markNotificationRead(notification.id);
    }
    if (notification.link) router.push(notification.link as never);
  }

  async function handleAcceptGameInvite(invite: ReceivedPlayEventInvite) {
    if (!user?.id) return;
    setRespondingId(invite.id);
    try {
      await acceptPlayEventInvite(invite, user.id, profile?.full_name ?? 'Player', user.email ?? '');
      setGameInvites(prev => prev.filter(i => i.id !== invite.id));
      refreshReceivedInvites();
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRespondingId(null);
    }
  }

  async function handleDeclineGameInvite(invite: ReceivedPlayEventInvite) {
    setRespondingId(invite.id);
    try {
      await declinePlayEventInvite(invite.id);
      setGameInvites(prev => prev.filter(i => i.id !== invite.id));
      refreshReceivedInvites();
    } finally {
      setRespondingId(null);
    }
  }

  async function handleAcceptGroupInvite(invite: ReceivedGroupInviteDetails) {
    setRespondingId(invite.id);
    try {
      await acceptGroupInvite(invite);
      setGroupInvites(prev => prev.filter(i => i.id !== invite.id));
      refreshReceivedGroupInvites();
      if (invite.group_id) router.push(`/groups/${invite.group_id}` as never);
    } catch (err) {
      Alert.alert('Could not join group', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRespondingId(null);
    }
  }

  async function handleDeclineGroupInvite(invite: ReceivedGroupInviteDetails) {
    setRespondingId(invite.id);
    try {
      await declineGroupInvite(invite.id);
      setGroupInvites(prev => prev.filter(i => i.id !== invite.id));
      refreshReceivedGroupInvites();
    } finally {
      setRespondingId(null);
    }
  }

  async function handleCancelSentInvite(inviteId: string) {
    setCancellingId(inviteId);
    try {
      await cancelPlayEventInvite(inviteId);
      refreshSentInvites();
    } finally {
      setCancellingId(null);
    }
  }

  async function handleCancelSentGroupInvite(inviteId: string) {
    setCancellingId(inviteId);
    try {
      await cancelGroupInvite(inviteId);
      refreshSentGroupInvites();
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={L.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Activity</Text>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={20} color={L.navy} />
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {(['received', 'sent', 'activity'] as TabKey[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={s.tabItem}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
              {t === 'received' ? 'Received' : t === 'sent' ? 'Sent' : 'Activity'}
            </Text>
            {tab === t && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.tabDivider} />

      {/* ── Content ── */}
      {tab === 'received' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {gameInvites.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Game Invites</Text>
              {gameInvites.map((inv) => (
                <GameInviteCard
                  key={inv.id}
                  invite={inv}
                  busy={respondingId === inv.id}
                  onAccept={() => handleAcceptGameInvite(inv)}
                  onDecline={() => handleDeclineGameInvite(inv)}
                />
              ))}
            </>
          )}

          {groupInvites.length > 0 && (
            <>
              <Text style={[s.sectionLabel, gameInvites.length > 0 && { marginTop: 24 }]}>Group Invites</Text>
              {groupInvites.map((inv) => (
                <GroupInviteCard
                  key={inv.id}
                  invite={inv}
                  busy={respondingId === inv.id}
                  onAccept={() => handleAcceptGroupInvite(inv)}
                  onDecline={() => handleDeclineGroupInvite(inv)}
                />
              ))}
            </>
          )}

          {receivedHistory.length > 0 && (
            <>
              <Text style={[s.sectionLabel, (gameInvites.length > 0 || groupInvites.length > 0) && { marginTop: 24 }]}>Older</Text>
              <View style={s.card}>
                {receivedHistory.map((inv, i) => (
                  <InviteRow
                    key={inv.id}
                    invite={mapReceivedToInvite(inv)}
                    last={i === receivedHistory.length - 1}
                  />
                ))}
              </View>
            </>
          )}

          {groupInviteHistory.length > 0 && (
            <>
              <Text style={[s.sectionLabel, (gameInvites.length > 0 || groupInvites.length > 0 || receivedHistory.length > 0) && { marginTop: 24 }]}>Older Group Invites</Text>
              <View style={s.card}>
                {groupInviteHistory.map((inv, i) => (
                  <InviteRow
                    key={inv.id}
                    invite={mapReceivedGroupToInvite(inv)}
                    last={i === groupInviteHistory.length - 1}
                  />
                ))}
              </View>
            </>
          )}

          {gameInvites.length === 0 && groupInvites.length === 0 && receivedHistory.length === 0 && groupInviteHistory.length === 0 && (
            <EmptyState
              icon="mail-outline"
              title="No invitations yet."
              sub="Game and group invitations from other players will appear here."
            />
          )}
        </ScrollView>
      ) : tab === 'sent' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {sentInvites.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Game Invites</Text>
              <View style={s.card}>
                {sentInvites.map((inv, i) => (
                  <InviteRow
                    key={inv.id}
                    invite={mapSentToInvite(inv)}
                    last={i === sentInvites.length - 1}
                    onCancel={inv.status === 'pending' ? () => handleCancelSentInvite(inv.id) : undefined}
                    cancelling={cancellingId === inv.id}
                  />
                ))}
              </View>
            </>
          )}

          {sentGroupInvites.length > 0 && (
            <>
              <Text style={[s.sectionLabel, sentInvites.length > 0 && { marginTop: 24 }]}>Group Invites</Text>
              <View style={s.card}>
                {sentGroupInvites.map((inv, i) => (
                  <InviteRow
                    key={inv.id}
                    invite={mapSentGroupToInvite(inv)}
                    last={i === sentGroupInvites.length - 1}
                    onCancel={inv.status === 'pending' ? () => handleCancelSentGroupInvite(inv.id) : undefined}
                    cancelling={cancellingId === inv.id}
                  />
                ))}
              </View>
            </>
          )}

          {sentInvites.length === 0 && sentGroupInvites.length === 0 && (
            <EmptyState
              icon="paper-plane-outline"
              title="No invitations sent."
              sub="Invitations you send will appear here."
            />
          )}
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        >
          {notifications.length > 0 ? (
            <View style={s.card}>
              {notifications.map((n, i) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  last={i === notifications.length - 1}
                  onPress={() => handleOpenNotification(n)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="notifications-outline"
              title="No activity yet."
              sub="Updates about your wallet, tournaments, and account will appear here."
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, backgroundColor: L.bg,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: L.bg,
    paddingHorizontal: 20,
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative',
  },
  tabLabel: { color: L.textMuted, fontSize: text.controlLabel.size, fontWeight: '700' },
  tabLabelActive: { color: L.gold },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 24, right: 24,
    height: 2.5, backgroundColor: L.gold, borderRadius: 2,
  },
  tabDivider: { height: StyleSheet.hairlineWidth, backgroundColor: L.div },

  // Scroll
  scroll: { padding: 16 },

  // Section label
  sectionLabel: {
    color: L.navy, fontSize: text.sectionLabel.size, fontWeight: '800', letterSpacing: text.sectionLabel.letterSpacing,
    marginBottom: 10,
  },

  // New invite card
  newCard: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    padding: 14, marginBottom: 8,
  },
  newCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  newCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  newCardName: { color: L.navy, fontSize: text.body.size, fontWeight: '500', flex: 1 },
  newCardType: { color: L.gold, fontSize: text.caption.size, fontWeight: '500' },

  newCardDetails: { gap: 6, paddingLeft: 58 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  detailTextFlex: { flex: 1, flexShrink: 1 },

  // Compact card group
  card: {
    backgroundColor: L.bg, borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  rowName: { color: L.navy, fontSize: text.body.size, fontWeight: '500', marginBottom: 2 },
  rowType: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500' },
  rowRight: { alignItems: 'flex-end', gap: 5 },
  rowDate: { color: L.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  cancelLink: { color: L.gold, fontSize: text.link.size, fontWeight: '700' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.div, marginLeft: 68 },

  // Status chip
  chip: { borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: text.cardLabel.size, fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing },

  // Avatar fallback
  avatarFallback: {
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Empty state
  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, paddingHorizontal: 32, gap: 12,
  },
  emptyTitle: { color: L.navy, fontSize: text.titleSm.size, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: L.textMuted, fontSize: text.body.size, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

  // Game invite actions (real play_event_invites)
  gameInviteActions: { flexDirection: 'row', gap: 8, paddingLeft: 58 },
  declineBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: shape.cta,
    borderWidth: 1.5, borderColor: L.border,
  },
  declineBtnText: { color: L.textSub, fontSize: text.action.size, fontWeight: '800' },
  acceptBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: shape.cta,
    backgroundColor: L.navy,
  },
  acceptBtnText: { color: '#FFFFFF', fontSize: text.action.size, fontWeight: '800' },

  // Activity / notifications feed
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  notifIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: L.page,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  notifIconUnread: { backgroundColor: L.goldBg },
  notifTitle: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700', marginBottom: 2 },
  notifTitleUnread: { fontWeight: '800' },
  notifBody: { color: L.textSub, fontSize: text.caption.size, fontWeight: '500', lineHeight: 18, marginBottom: 4 },
  notifTime: { color: L.textMuted, fontSize: 11 },
  notifDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: L.gold, marginTop: 4 },
});
