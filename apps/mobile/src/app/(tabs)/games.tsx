import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';
import { StatusChip } from '@/components';
import { useSlideMenu } from '@/components/SlideMenu';
import { getUpcomingEvents, getCompletedEvents, type GameCard } from '@/lib/gameEventHelpers';
import { getHeldSpots, type HeldSpot } from '@/lib/tournamentStore';
import { getPlayerRegStatusInfo } from '@/lib/tournamentStatus';
import { balanceDueCents } from '@/lib/tournamentFees';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { fetchUnreadPlayEventIds } from '@/lib/conversationService';
import {
  fetchUpcomingPlayEvents,
  fetchJoinedPlayEvents,
  fetchMyPastEvents,
  playEventToGameCard,
  localDateString,
  type SBGameCard,
} from '@/lib/supabase/playEvents';
import { tabBarClearance } from '@/constants/tabBar';
import { fetchPlayerRegistrations } from '@/lib/supabase/registrations';
import { fetchTournamentsByIds } from '@/lib/supabase/tournaments';
import { TournamentTrendingCard, tournamentToTrending } from '@/components/TournamentTrendingCard';
import type { Tournament } from '@/lib/tournamentTypes';
import { useTournamentBookmarks } from '@/hooks/useTournamentBookmarks';
import {
  fetchReceivedInvites,
  acceptPlayEventInvite,
  declinePlayEventInvite,
  type ReceivedPlayEventInvite,
} from '@/lib/supabase/playEventInvites';

// Theme-backed alias — brand values resolve from @/theme.
// blue is a secondary informational accent (no brand equivalent) — documented exception.
const L = {
  bg:          colors.bg,
  page:        colors.page,
  navy:        colors.navy,
  gold:        colors.gold,
  goldFill:    colors.gold,
  goldLight:   colors.goldLight,
  text:        colors.text,
  textSub:     colors.textSub,
  textMuted:   colors.textSub,
  border:      colors.border,
  borderLight: colors.border,
  green:       colors.success,
  greenBg:     colors.successBg,
  blue:        '#2563EB',
  blueBg:      '#DBEAFE',
};

type SubTab = 'Upcoming' | 'Held Spots' | 'Joined' | 'Past';

type PastRange = '30d' | '3m' | 'all';

const PAST_RANGES: { key: PastRange; label: string }[] = [
  { key: '30d', label: 'Last 30 days' },
  { key: '3m',  label: 'Last 3 months' },
  { key: 'all', label: 'All time' },
];

const PAST_EVENTS_LIMIT = 50;

type PastTypeFilter = 'all' | 'QUICK GAME' | 'ROUND ROBIN' | 'MINI TOURNAMENT' | 'CLINIC';

const PAST_TYPE_OPTIONS: { key: PastTypeFilter; label: string }[] = [
  { key: 'all',              label: 'All Types' },
  { key: 'QUICK GAME',       label: 'Quick Game' },
  { key: 'ROUND ROBIN',      label: 'Round Robin' },
  { key: 'MINI TOURNAMENT',  label: 'Mini Tournament' },
  { key: 'CLINIC',           label: 'Clinic' },
];

// Returns the earliest event_date (YYYY-MM-DD) to include for a given range, or
// undefined for 'all' (no lower bound).
function pastRangeAfterDate(range: PastRange): string | undefined {
  if (range === 'all') return undefined;
  const daysBack = range === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return localDateString(d);
}

// ─── Sub-tab Icons ────────────────────────────────────────────────────────────

function SubTabIcon({ tab, active }: { tab: SubTab; active: boolean }) {
  const c = active ? L.gold : L.textMuted;
  const badgeIcon =
    tab === 'Held Spots' ? 'add' :
    tab === 'Joined'     ? 'checkmark' :
    tab === 'Past'       ? 'checkmark-done' : null;

  return (
    <View style={{ width: 30, height: 30 }}>
      <Ionicons name="calendar-outline" size={26} color={c} />
      {badgeIcon && (
        <View style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: c, borderWidth: 2, borderColor: L.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={badgeIcon as never} size={8} color={L.bg} />
        </View>
      )}
      {tab === 'Upcoming' && (
        <View style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: c, borderWidth: 2, borderColor: L.bg,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: L.bg }} />
        </View>
      )}
    </View>
  );
}

// ─── Tournament Logo Placeholder ──────────────────────────────────────────────

function TournamentLogo({ bg, color, lines }: { bg: string; color: string; lines: string[] }) {
  return (
    <View style={[ev.logo, { backgroundColor: bg }]}>
      {lines.map((l, i) => (
        <Text key={i} style={[ev.logoText, { color, fontSize: i === 0 ? 9 : 8 }]} numberOfLines={1}>{l}</Text>
      ))}
    </View>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <View style={[ev.badge, { backgroundColor: bg }]}>
      <Text style={[ev.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={sec.row}>
      <Text style={sec.title}>{title}</Text>
    </View>
  );
}

const sec = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: L.navy, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});

// ─── Invite Card ──────────────────────────────────────────────────────────────

function InviteCard({
  invite,
  responding,
  onAccept,
  onDecline,
}: {
  invite: ReceivedPlayEventInvite;
  responding: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const inviterName = invite.inviter?.full_name ?? 'A player';
  const eventName   = invite.play_event?.name ?? 'A game';
  const location     = invite.play_event?.venue_name ?? invite.play_event?.location ?? null;
  const dateStr = invite.play_event?.event_date
    ? new Date(`${invite.play_event.event_date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <View style={inv.card}>
      <View style={inv.headerRow}>
        <View style={inv.headerLeft}>
          <Ionicons name="person-add-outline" size={16} color={L.gold} />
          <Text style={inv.label}>INVITED TO PLAY</Text>
        </View>
        <TouchableOpacity onPress={onDecline} disabled={responding} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={18} color={L.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={inv.body}>
        {invite.inviter?.avatar_url ? (
          <Image source={{ uri: invite.inviter.avatar_url }} style={inv.avatar} />
        ) : (
          <View style={inv.avatar}>
            <Ionicons name="person" size={26} color={L.navy} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={inv.nameRow}>
            <Text style={inv.invitedBy}>{inviterName} invited you to</Text>
            <Badge label="Community Play" bg={L.greenBg} color={L.green} />
          </View>
          <Text style={inv.eventName}>{eventName}</Text>
          {(dateStr || location) && (
            <View style={inv.metaRow}>
              {dateStr && (
                <>
                  <Ionicons name="calendar-outline" size={13} color={L.textMuted} />
                  <Text style={inv.meta}>{dateStr}</Text>
                </>
              )}
              {location && (
                <>
                  <Ionicons name="location-outline" size={13} color={L.textMuted} />
                  <Text style={inv.meta}>{location}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={inv.actions}>
        <TouchableOpacity style={inv.declineBtn} activeOpacity={0.75} onPress={onDecline} disabled={responding}>
          <Text style={inv.declineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={inv.acceptBtn} activeOpacity={0.85} onPress={onAccept} disabled={responding}>
          {responding ? <ActivityIndicator size="small" color={L.bg} /> : <Text style={inv.acceptText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const inv = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#E8C97A',
    padding: 16, marginBottom: 20,
  },
  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label:      { color: L.gold, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  body:       { flexDirection: 'row', gap: 12, marginBottom: 16 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: L.borderLight, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  nameRow:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  invitedBy:  { color: L.textSub, fontSize: 13, fontWeight: '400', flex: 1 },
  eventName:  { color: L.navy, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta:       { color: L.textMuted, fontSize: 12 },
  actions:    { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: L.gold, alignItems: 'center',
  },
  declineText: { color: L.gold, fontSize: 15, fontWeight: '700' },
  acceptBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: L.gold, alignItems: 'center' },
  acceptText: { color: L.bg, fontSize: 15, fontWeight: '700' },
});

// ─── Community Play Card ──────────────────────────────────────────────────────
// Full-width card layout for Quick Game / Round Robin events (SBGameCard).

type CommunityCardProps = {
  type: string;
  typeTagBg?: string;
  typeTagColor?: string;
  title: string;
  badgeLabel: string;
  badgeBg: string;
  badgeColor: string;
  date: string;
  location: string;
  skillRange?: string;
  playerCount: number;
  maxPlayers: number;
  role?: 'Hosting' | 'Joined';
  hasUnreadChat?: boolean;
  /** True when this card is shown in a past-events context — status badges that only
   *  make sense for upcoming events (Open/Full/Live) are relabeled "Past" and the
   *  actionable "spots left" text is replaced with a plain final headcount. */
  isPast?: boolean;
  onPress?: () => void;
};

const OPEN_ENDED_BADGE_LABELS = ['Open', 'Full', 'Live'];

function CommunityCard(p: CommunityCardProps) {
  const spotsLeft = Math.max(p.maxPlayers - p.playerCount, 0);
  const showPastBadge = p.isPast && OPEN_ENDED_BADGE_LABELS.includes(p.badgeLabel);
  const badgeLabel = showPastBadge ? 'Past' : p.badgeLabel;
  const badgeBg    = showPastBadge ? L.borderLight : p.badgeBg;
  const badgeColor = showPastBadge ? L.textMuted : p.badgeColor;

  return (
    <TouchableOpacity style={cc.card} activeOpacity={0.75} onPress={p.onPress}>
      {/* Top row: type label pill + status badge */}
      <View style={cc.topRow}>
        <View style={cc.typeTag}>
          <Text style={cc.typeText}>{p.type}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {p.hasUnreadChat && (
            <View style={cc.chatDotWrap}>
              <Ionicons name="chatbubble" size={11} color={L.gold} />
              <View style={cc.chatDot} />
            </View>
          )}
          <View style={[cc.statusBadge, { backgroundColor: badgeBg }]}>
            <Text style={[cc.statusText, { color: badgeColor }]}>{badgeLabel.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Title + role badge */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text style={[cc.title, { flex: 1 }]}>{p.title}</Text>
        {p.role && (
          <View style={[cc.statusBadge, { backgroundColor: p.role === 'Hosting' ? L.goldLight : L.greenBg, marginTop: 2 }]}>
            <Text style={[cc.statusText, { color: p.role === 'Hosting' ? L.gold : L.green }]}>{p.role.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Meta rows */}
      <View style={cc.metaRow}>
        <Ionicons name="calendar-outline" size={14} color={L.gold} />
        <Text style={cc.metaText}>{p.date}</Text>
      </View>
      <View style={cc.metaRow}>
        <Ionicons name="location-outline" size={14} color={L.gold} />
        <Text style={cc.metaText}>{p.location}</Text>
      </View>
      {p.skillRange && (
        <View style={cc.metaRow}>
          <Ionicons name="speedometer-outline" size={14} color={L.gold} />
          <Text style={cc.metaText}>{p.skillRange}</Text>
        </View>
      )}

      {/* Divider + player count row */}
      <View style={cc.divider} />
      <View style={cc.bottomRow}>
        <View style={cc.countGroup}>
          <Ionicons name="people" size={15} color={L.gold} />
          <Text style={cc.countText}>{p.playerCount} / {p.maxPlayers}</Text>
        </View>
        {p.isPast ? (
          <Text style={[cc.spotsText, { color: L.textMuted }]}>
            {p.playerCount} player{p.playerCount === 1 ? '' : 's'} joined
          </Text>
        ) : spotsLeft > 0 ? (
          <Text style={cc.spotsText}>{spotsLeft} spots left →</Text>
        ) : (
          <Text style={[cc.spotsText, { color: L.textMuted }]}>Full</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const cc = StyleSheet.create({
  card: {
    backgroundColor: L.bg,
    borderRadius: 16,
    borderWidth: 1, borderColor: L.border,
    padding: 16, marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  typeTag: { alignSelf: 'flex-start' },
  typeText: {
    color: L.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
  },
  statusBadge: {
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  chatDotWrap: { position: 'relative' },
  chatDot: {
    position: 'absolute', top: -1, right: -2,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: L.gold, borderWidth: 1.5, borderColor: L.bg,
  },
  title: {
    color: L.navy, fontSize: 20, fontWeight: '900',
    lineHeight: 24, marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  metaText: { color: '#000000', fontSize: 15, fontWeight: '500', flex: 1 },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.border,
    marginTop: 6, marginBottom: 12,
  },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  countGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText:  { color: L.navy, fontSize: 15, fontWeight: '800' },
  spotsText:  { color: L.gold, fontSize: 13, fontWeight: '700' },
});

// ─── Event Row ────────────────────────────────────────────────────────────────

type EventRowProps = {
  type: string;
  logoBg: string;
  logoColor: string;
  logoLines: string[];
  imageUri?: string;
  title: string;
  badgeLabel: string;
  badgeBg: string;
  badgeColor: string;
  subtitle: string;
  date: string;
  location: string;
  capacity?: string;
  result?: { label: string; record: string; points: string };
  onPress?: () => void;
};

function EventRow(p: EventRowProps) {
  return (
    <TouchableOpacity style={ev.row} activeOpacity={0.75} onPress={p.onPress}>
      {p.imageUri ? (
        <Image source={{ uri: p.imageUri }} style={ev.logoImg} resizeMode="cover" />
      ) : (
        <TournamentLogo bg={p.logoBg} color={p.logoColor} lines={p.logoLines} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={ev.type}>{p.type}</Text>
        <View style={ev.titleRow}>
          <Text style={ev.title} numberOfLines={1}>{p.title}</Text>
          <Badge label={p.badgeLabel} bg={p.badgeBg} color={p.badgeColor} />
        </View>
        <Text style={ev.subtitle}>{p.subtitle}</Text>
        <View style={ev.metaRow}>
          <Ionicons name="calendar-outline" size={12} color={L.textMuted} />
          <Text style={ev.meta}>{p.date}</Text>
          <Ionicons name="location-outline" size={12} color={L.textMuted} />
          <Text style={ev.meta}>{p.location}</Text>
        </View>
        {p.capacity && (
          <View style={ev.capacityRow}>
            <Ionicons name="people-outline" size={13} color={L.textMuted} />
            <Text style={ev.meta}>{p.capacity}</Text>
          </View>
        )}
        {p.result && (
          <View style={ev.resultRow}>
            <View style={ev.resultCell}>
              <Text style={ev.resultLabel}>Result</Text>
              <Text style={ev.resultValue}>{p.result.label}</Text>
            </View>
            <View style={ev.resultCell}>
              <Text style={ev.resultLabel}>Record</Text>
              <Text style={ev.resultValue}>{p.result.record}</Text>
            </View>
            <View style={ev.resultCell}>
              <Text style={ev.resultLabel}>Points Earned</Text>
              <Text style={ev.resultValue}>{p.result.points}</Text>
            </View>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={L.textMuted} style={{ marginLeft: 4, alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

const ev = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 12,
    backgroundColor: L.bg, borderRadius: 14,
    borderWidth: 1, borderColor: L.border,
    padding: 14, marginBottom: 10,
    alignItems: 'flex-start',
  },
  logo: {
    width: 64, height: 64, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 4,
  },
  logoImg: {
    width: 64, height: 64, borderRadius: 12,
    flexShrink: 0,
  },
  logoText:    { fontWeight: '800', textAlign: 'center', lineHeight: 12 },
  badge:       { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  badgeText:   { fontSize: 11, fontWeight: '700' },
  type:        { color: L.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  titleRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  title:       { color: L.navy, fontSize: 18, fontWeight: '800', flex: 1 },
  subtitle:    { color: L.textSub, fontSize: 12, marginBottom: 4 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  meta:        { color: L.textMuted, fontSize: 11 },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  resultRow:   { flexDirection: 'row', gap: 20, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: L.borderLight },
  resultCell:  { gap: 2 },
  resultLabel: { color: L.textMuted, fontSize: 11 },
  resultValue: { color: L.navy, fontSize: 13, fontWeight: '800' },
});

// ─── Upcoming Content ─────────────────────────────────────────────────────────

function UpcomingContent({
  pendingInvite,
  respondingInvite,
  onAcceptInvite,
  onDeclineInvite,
  events,
  unreadEventIds,
  tournaments,
  isBookmarked,
  onToggleBookmark,
}: {
  pendingInvite: ReceivedPlayEventInvite | null;
  respondingInvite: boolean;
  onAcceptInvite: () => void;
  onDeclineInvite: () => void;
  events: (GameCard | SBGameCard)[];
  unreadEventIds: Set<string>;
  tournaments: Tournament[];
  isBookmarked: (id: string) => boolean;
  onToggleBookmark: (id: string) => void;
}) {
  const isEmpty = events.length === 0 && tournaments.length === 0;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      {pendingInvite && (
        <InviteCard
          invite={pendingInvite}
          responding={respondingInvite}
          onAccept={onAcceptInvite}
          onDecline={onDeclineInvite}
        />
      )}

      <SectionHeader title="UP NEXT" />

      {isEmpty ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
          <Ionicons name="calendar-outline" size={48} color={L.textMuted} />
          <Text style={{ color: L.text, fontSize: 17, fontWeight: '800' }}>No upcoming events</Text>
          <Text style={{ color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
            Create a Quick Game, Round Robin, or Mini Tournament to get started.
          </Text>
        </View>
      ) : (
        events.map(card =>
          card.source === 'supabase' ? (
            <CommunityCard
              key={card.id}
              type={card.type}
              typeTagBg={card.typeTagBg}
              typeTagColor={card.typeTagColor}
              title={card.title}
              badgeLabel={card.badgeLabel}
              badgeBg={card.badgeBg}
              badgeColor={card.badgeColor}
              date={card.date}
              location={card.location}
              skillRange={card.skillRange}
              playerCount={card.playerCount}
              maxPlayers={card.maxPlayers}
              hasUnreadChat={unreadEventIds.has(card.id)}
              onPress={() => router.push(card.route as never)}
            />
          ) : (
            <EventRow
              key={card.id}
              type={card.type}
              logoBg={card.logoBg}
              logoColor={card.logoColor}
              logoLines={card.logoLines}
              title={card.title}
              badgeLabel={card.badgeLabel}
              badgeBg={card.badgeBg}
              badgeColor={card.badgeColor}
              subtitle={card.subtitle}
              date={card.date}
              location={card.location}
              capacity={card.capacity}
              result={'result' in card ? card.result : undefined}
              onPress={() => router.push(card.route as never)}
            />
          )
        )
      )}

      {/* Registered tournaments, rendered with the same card the Home tab
          uses. `registered` drops the Hold/Register CTAs - the viewer is
          already in this event. */}
      {tournaments.map(t => (
        <TournamentTrendingCard
          key={t.id}
          item={tournamentToTrending(t)}
          style={{ marginBottom: 10 }}
          saved={isBookmarked(t.id)}
          onSave={() => onToggleBookmark(t.id)}
          registered
        />
      ))}
    </ScrollView>
  );
}

// ─── Joined Content ───────────────────────────────────────────────────────────

function JoinedContent({ events, unreadEventIds }: { events: SBGameCard[]; unreadEventIds: Set<string> }) {
  if (events.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
        <Ionicons name="people-outline" size={52} color={L.textMuted} />
        <Text style={{ color: L.text, fontSize: 18, fontWeight: '800' }}>You haven't joined any events yet</Text>
        <Text style={{ color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
          Browse and join a Quick Game, Round Robin, or Mini Tournament.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 4, backgroundColor: L.navy, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}
          onPress={() => router.push('/play-pickleball' as never)}
          activeOpacity={0.85}
        >
          <Text style={{ color: L.gold, fontSize: 14, fontWeight: '800' }}>Create Community Play</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <SectionHeader title="EVENTS I'VE JOINED" />
      {events.map(card => (
        <CommunityCard
          key={card.id}
          type={card.type}
          typeTagBg={card.typeTagBg}
          typeTagColor={card.typeTagColor}
          title={card.title}
          badgeLabel={card.badgeLabel}
          badgeBg={card.badgeBg}
          badgeColor={card.badgeColor}
          date={card.date}
          location={card.location}
          skillRange={card.skillRange}
          playerCount={card.playerCount}
          maxPlayers={card.maxPlayers}
          role="Joined"
          hasUnreadChat={unreadEventIds.has(card.id)}
          onPress={() => router.push(card.route as never)}
        />
      ))}
    </ScrollView>
  );
}

// ─── Past Range Filter ────────────────────────────────────────────────────────

function PastRangeFilter({ value, onChange }: { value: PastRange; onChange: (r: PastRange) => void }) {
  return (
    <View style={pf.row}>
      {PAST_RANGES.map(({ key, label }) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[pf.chip, active && pf.chipActive]}
            activeOpacity={0.75}
            onPress={() => onChange(key)}
          >
            <Text style={[pf.chipText, active && pf.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pf = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  chipActive: { backgroundColor: L.navy, borderColor: L.navy },
  chipText: { color: L.textSub, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: L.gold },
});

// ─── Past Type Filter (dropdown) ──────────────────────────────────────────────

function PastTypeFilterDropdown({ value, onChange }: { value: PastTypeFilter; onChange: (t: PastTypeFilter) => void }) {
  const [open, setOpen] = useState(false);
  const selected = PAST_TYPE_OPTIONS.find(o => o.key === value) ?? PAST_TYPE_OPTIONS[0];

  return (
    <View style={{ marginBottom: 14 }}>
      <TouchableOpacity style={tf.trigger} activeOpacity={0.75} onPress={() => setOpen(true)}>
        <Text style={tf.triggerText}>{selected.label}</Text>
        <Ionicons name="chevron-down" size={14} color={L.textSub} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={tf.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={tf.sheet}>
            {PAST_TYPE_OPTIONS.map(({ key, label }) => {
              const active = value === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={tf.option}
                  activeOpacity={0.75}
                  onPress={() => { onChange(key); setOpen(false); }}
                >
                  <Text style={[tf.optionText, active && tf.optionTextActive]}>{label}</Text>
                  {active && <Ionicons name="checkmark" size={16} color={L.gold} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const tf = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
  },
  triggerText: { color: L.navy, fontSize: 13, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: L.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8, paddingBottom: 24 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  optionText: { color: L.text, fontSize: 15, fontWeight: '600' },
  optionTextActive: { color: L.navy, fontWeight: '800' },
});

// ─── Past Content ─────────────────────────────────────────────────────────────

function PastContent({
  events,
  tournaments,
  isBookmarked,
  onToggleBookmark,
  range,
  onRangeChange,
  typeFilter,
  onTypeFilterChange,
  loading,
}: {
  events: (GameCard | SBGameCard)[];
  tournaments: Tournament[];
  isBookmarked: (id: string) => boolean;
  onToggleBookmark: (id: string) => void;
  range: PastRange;
  onRangeChange: (r: PastRange) => void;
  typeFilter: PastTypeFilter;
  onTypeFilterChange: (t: PastTypeFilter) => void;
  loading: boolean;
}) {
  const filtered = typeFilter === 'all' ? events : events.filter(c => c.type === typeFilter);
  // PastTypeFilter lists play-event types only, so a filtered view has no
  // bucket a tournament belongs to; showing them anyway would quietly ignore
  // the filter.
  const shownTournaments = typeFilter === 'all' ? tournaments : [];

  if (filtered.length === 0 && shownTournaments.length === 0) {
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <PastRangeFilter value={range} onChange={onRangeChange} />
        <PastTypeFilterDropdown value={typeFilter} onChange={onTypeFilterChange} />
        <View style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
          <Ionicons name="time-outline" size={52} color={L.textMuted} />
          <Text style={{ color: L.text, fontSize: 18, fontWeight: '800' }}>
            {loading ? 'Loading…' : 'No past events'}
          </Text>
          {!loading && (
            <Text style={{ color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
              {events.length > 0
                ? 'No events match this filter.'
                : 'Completed and cancelled events will appear here.'}
            </Text>
          )}
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <PastRangeFilter value={range} onChange={onRangeChange} />
      <PastTypeFilterDropdown value={typeFilter} onChange={onTypeFilterChange} />
      <SectionHeader title="PAST EVENTS" />
      {filtered.map(card =>
        card.source === 'supabase' ? (
          <CommunityCard
            key={card.id}
            type={card.type}
            typeTagBg={card.typeTagBg}
            typeTagColor={card.typeTagColor}
            title={card.title}
            badgeLabel={card.badgeLabel}
            badgeBg={card.badgeBg}
            badgeColor={card.badgeColor}
            date={card.date}
            location={card.location}
            skillRange={card.skillRange}
            playerCount={card.playerCount}
            maxPlayers={card.maxPlayers}
            role={card.role}
            isPast
            onPress={() => router.push(card.route as never)}
          />
        ) : (
          <EventRow
            key={card.id}
            type={card.type}
            logoBg={card.logoBg}
            logoColor={card.logoColor}
            logoLines={card.logoLines}
            title={card.title}
            badgeLabel={card.badgeLabel}
            badgeBg={card.badgeBg}
            badgeColor={card.badgeColor}
            subtitle={card.subtitle}
            date={card.date}
            location={card.location}
            capacity={card.capacity}
            result={'result' in card ? card.result : undefined}
            onPress={() => router.push(card.route as never)}
          />
        )
      )}

      {/* Past registered tournaments, same card as Upcoming and Home. */}
      {shownTournaments.map(t => (
        <TournamentTrendingCard
          key={t.id}
          item={tournamentToTrending(t)}
          style={{ marginBottom: 10 }}
          saved={isBookmarked(t.id)}
          onSave={() => onToggleBookmark(t.id)}
          registered
        />
      ))}
    </ScrollView>
  );
}

// ─── Past Content (renamed from Completed) ───────────────────────────────────

function CompletedContent({ events }: { events: (GameCard | SBGameCard)[] }) {
  if (events.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
        <Ionicons name="checkmark-circle-outline" size={52} color={L.textMuted} />
        <Text style={{ color: L.text, fontSize: 18, fontWeight: '800' }}>No completed games</Text>
        <Text style={{ color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
          Games you've finished will appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <SectionHeader title="COMPLETED" />
      {events.map(card =>
        card.source === 'supabase' ? (
          <CommunityCard
            key={card.id}
            type={card.type}
            typeTagBg={card.typeTagBg}
            typeTagColor={card.typeTagColor}
            title={card.title}
            badgeLabel={card.badgeLabel}
            badgeBg={card.badgeBg}
            badgeColor={card.badgeColor}
            date={card.date}
            location={card.location}
            skillRange={card.skillRange}
            playerCount={card.playerCount}
            maxPlayers={card.maxPlayers}
            onPress={() => router.push(card.route as never)}
          />
        ) : (
          <EventRow
            key={card.id}
            type={card.type}
            logoBg={card.logoBg}
            logoColor={card.logoColor}
            logoLines={card.logoLines}
            title={card.title}
            badgeLabel={card.badgeLabel}
            badgeBg={card.badgeBg}
            badgeColor={card.badgeColor}
            subtitle={card.subtitle}
            date={card.date}
            location={card.location}
            capacity={card.capacity}
            result={'result' in card ? card.result : undefined}
            onPress={() => router.push(card.route as never)}
          />
        )
      )}

    </ScrollView>
  );
}

// ─── Held Tournament Card (with Complete Registration CTA) ───────────────────

function HeldTournamentCard({ spot }: { spot: HeldSpot }) {
  const fmt = (cents: number) => `$${Math.round(cents / 100)}`;
  const balanceCents = balanceDueCents(spot.entryAmountCents, spot.holdAmountCents);

  return (
    <View style={hs.card}>
      <View style={hs.header}>
        <View style={hs.logoBox}>
          <Text style={hs.logoLine1} numberOfLines={1}>
            {spot.tournamentName.split(' ')[0].toUpperCase()}
          </Text>
          <Text style={hs.logoLine2}>HOLD</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={hs.label}>TOURNAMENT</Text>
          <Text style={hs.title} numberOfLines={1}>{spot.tournamentName}</Text>
          <Text style={hs.division} numberOfLines={1}>{spot.divisionName}  ·  {spot.divisionLevel}</Text>
        </View>
        <StatusChip
          label={getPlayerRegStatusInfo('held').label}
          variant={getPlayerRegStatusInfo('held').variant}
        />
      </View>

      <View style={hs.metaRow}>
        <Ionicons name="calendar-outline" size={13} color={L.textMuted} />
        <Text style={hs.meta}>{spot.date}</Text>
        <Ionicons name="location-outline" size={13} color={L.textMuted} />
        <Text style={hs.meta} numberOfLines={1}>
          {spot.city ? `${spot.venue}, ${spot.city}` : spot.venue}
        </Text>
      </View>

      <View style={hs.feesRow}>
        <View style={hs.feeCell}>
          <Text style={hs.feeCellLabel}>Deposit Paid</Text>
          <Text style={hs.feeCellValue}>{fmt(spot.holdAmountCents)}</Text>
        </View>
        <View style={hs.feeDivider} />
        <View style={hs.feeCell}>
          <Text style={hs.feeCellLabel}>Balance Due</Text>
          <Text style={hs.feeCellValue}>{fmt(balanceCents)}</Text>
        </View>
      </View>

      <View style={hs.actions}>
        <TouchableOpacity
          style={hs.viewBtn}
          activeOpacity={0.75}
          onPress={() => router.push(`/tournament/${spot.tournamentId}` as never)}
        >
          <Ionicons name="eye-outline" size={15} color={L.navy} />
          <Text style={hs.viewBtnText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={hs.registerBtn}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: `/tournament/${spot.tournamentId}/register` as never,
            params: {
              tournamentName:   spot.tournamentName,
              divisionId:       spot.divisionId,
              divisionName:     spot.divisionName,
              divisionLevel:    spot.divisionLevel,
              holdAmountCents:  String(spot.holdAmountCents),
              entryAmountCents: String(spot.entryAmountCents),
              date:             spot.date,
              venue:            spot.venue,
              city:             spot.city,
              state:            spot.state,
            },
          } as never)}
        >
          <Text style={hs.registerBtnText}>Complete Registration</Text>
          <Ionicons name="arrow-forward" size={14} color={L.bg} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  card: {
    backgroundColor: L.bg, borderRadius: 14,
    borderWidth: 1, borderColor: L.border,
    marginBottom: 12, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, paddingBottom: 10,
  },
  logoBox: {
    width: 56, height: 56, borderRadius: 12,
    backgroundColor: L.navy,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, padding: 4,
  },
  logoLine1: { color: L.goldFill, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  logoLine2: { color: L.goldFill, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  label:     { color: L.goldFill, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  title:     { color: L.navy, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  division:  { color: L.textSub, fontSize: 12 },
  heldBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.greenBg, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0,
  },
  heldBadgeText: { color: L.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap',
    paddingHorizontal: 14, paddingBottom: 12,
  },
  meta: { color: L.textMuted, fontSize: 12 },
  feesRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: L.border,
    backgroundColor: L.page,
  },
  feeCell:      { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  feeDivider:   { width: StyleSheet.hairlineWidth, backgroundColor: L.border },
  feeCellLabel: { color: L.textSub, fontSize: 10, fontWeight: '600' },
  feeCellValue: { color: L.navy,    fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, padding: 12, alignItems: 'center' },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  viewBtnText:    { color: L.navy, fontSize: 13, fontWeight: '700' },
  registerBtn:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: L.navy, borderRadius: 10, paddingVertical: 10,
  },
  registerBtnText:{ color: L.bg, fontSize: 13, fontWeight: '700' },
});

// ─── Held Spots Content ───────────────────────────────────────────────────────

function HeldSpotsContent({ spots }: { spots: HeldSpot[] }) {
  if (spots.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
        <Ionicons name="calendar-outline" size={52} color={L.textMuted} />
        <Text style={{ color: L.text, fontSize: 18, fontWeight: '800' }}>No held spots</Text>
        <Text style={{ color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
          Events where you've paid a deposit will appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
      <SectionHeader title="HELD SPOTS" />
      {spots.map(spot => (
        <HeldTournamentCard key={spot.id} spot={spot} />
      ))}
    </ScrollView>
  );
}

// ─── Empty tab placeholder ────────────────────────────────────────────────────

function EmptyTab({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
      <Ionicons name={icon as never} size={52} color={L.textMuted} />
      <Text style={{ color: L.text, fontSize: 18, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: L.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>{sub}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SUB_TABS: SubTab[] = ['Upcoming', 'Held Spots', 'Joined', 'Past'];

// Merge local GameCards with Supabase SBGameCards, deduplicating by id.
// Supabase cards take priority — local card is dropped if same id exists in SB.
// Chronological where we can be. Cards built from a Supabase row carry a raw
// YYYY-MM-DD `sortKey`; the local demo cards do not, and are left at the end
// rather than being guessed at from their display date ("Thu, Oct 15" sorts
// alphabetically, which is worse than not sorting).
function byDate(cards: (GameCard | SBGameCard)[], dir: 'asc' | 'desc' = 'asc') {
  const keyed = cards.filter(c => c.sortKey);
  const unkeyed = cards.filter(c => !c.sortKey);
  keyed.sort((a, b) =>
    dir === 'asc'
      ? (a.sortKey as string).localeCompare(b.sortKey as string)
      : (b.sortKey as string).localeCompare(a.sortKey as string));
  return [...keyed, ...unkeyed];
}

function mergeEvents(local: GameCard[], sb: SBGameCard[]): (GameCard | SBGameCard)[] {
  const sbIds = new Set(sb.map(e => e.id));
  const filteredLocal = local.filter(e => !sbIds.has(e.id));
  return [...sb, ...filteredLocal];
}

export default function GamesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { profile } = useProfile();

  const [subTab, setSubTab]         = useState<SubTab>('Upcoming');
  const [pendingInvite, setPendingInvite]     = useState<ReceivedPlayEventInvite | null>(null);
  const [respondingInvite, setRespondingInvite] = useState(false);
  const [upcoming, setUpcoming]         = useState<(GameCard | SBGameCard)[]>([]);
  // Separate from `past` so loadPastEvents keeps sole ownership of its range
  // filtering and pagination; the two are combined at render time instead.
  // Full tournament rows for the events this user is registered for, kept
  // apart from the GameCard list because they render through the Home tab's
  // tournament card rather than the play-event row.
  const [regTournaments, setRegTournaments] = useState<Tournament[]>([]);
  const { isBookmarked, toggleBookmark } = useTournamentBookmarks();
  const upcomingTournaments = regTournaments
    .filter(t => t.eventDate >= localDateString())
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const pastTournaments = regTournaments
    .filter(t => t.eventDate < localDateString())
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  const [joined,   setJoined]           = useState<SBGameCard[]>([]);
  const [past,     setPast]             = useState<(GameCard | SBGameCard)[]>([]);
  const [pastRange, setPastRange]       = useState<PastRange>('30d');
  const [pastTypeFilter, setPastTypeFilter] = useState<PastTypeFilter>('all');
  const [pastLoading, setPastLoading]   = useState(false);
  const [heldSpots, setHeldSpots]       = useState<HeldSpot[]>([]);
  const [unreadEventIds, setUnreadEventIds] = useState<Set<string>>(new Set());
  const { setTriggerVisible } = useSlideMenu();
  const pastRangeRef = useRef<PastRange>(pastRange);

  // Past: fetch hosting past and joined past separately to preserve role tags,
  // scoped to the selected time range so we don't pull a user's entire history at once.
  const loadPastEvents = useCallback((uid: string, range: PastRange, localCompleted: GameCard[]) => {
    setPastLoading(true);
    fetchMyPastEvents(uid, { afterDate: pastRangeAfterDate(range), limit: PAST_EVENTS_LIMIT })
      .then(rows => {
        const cards = rows.map(e =>
          playEventToGameCard(e, e.organizer_id === uid ? 'Hosting' : 'Joined')
        );
        setPast(mergeEvents(localCompleted, cards));
      })
      .catch(() => { /* keep local on error */ })
      .finally(() => setPastLoading(false));
  }, []);

  // Hide the floating hamburger trigger while this screen is focused. Restored on blur.
  useFocusEffect(
    useCallback(() => {
      setTriggerVisible(false);
      return () => setTriggerVisible(true);
    }, [setTriggerVisible]),
  );

  useFocusEffect(
    useCallback(() => {
      // Always load local events first (instant, no latency)
      const localUpcoming   = getUpcomingEvents();
      const localCompleted  = getCompletedEvents();
      setUpcoming(localUpcoming);
      setPast(localCompleted);
      setHeldSpots(getHeldSpots());

      // If logged in, overlay with Supabase events
      if (!user?.id) return;

      fetchUnreadPlayEventIds(user.id).then(setUnreadEventIds).catch(() => {});

      fetchReceivedInvites(user.id)
        .then(invites => setPendingInvite(invites.find(i => i.status === 'pending') ?? null))
        .catch(() => {});

      // Upcoming: hosting + joined play events, PLUS tournaments this player is
      // registered for. Tournaments were previously absent from this screen
      // entirely - they live in the `tournaments`/`registrations` tables, and
      // every query here reads `play_events` - so a registration showed up in
      // neither Upcoming nor Joined, on the tab named Events.
      Promise.all([
        fetchUpcomingPlayEvents(user.id),
        fetchJoinedPlayEvents(user.id).then(rows => rows.filter(e =>
          ['open', 'full', 'in_progress'].includes(e.status) &&
          e.event_date >= localDateString()
        )),
        // Failing soft: a registrations error must not empty the play events
        // that were loading fine before this was added.
        fetchPlayerRegistrations(user.id).catch(() => []),
      ]).then(([hosting, joinedUpcoming, registrations]) => {
        const hostCards = hosting.map(e => playEventToGameCard(e, 'Hosting'));
        const joinCards = joinedUpcoming.map(e => playEventToGameCard(e, 'Joined'));
        const hostIds = new Set(hostCards.map(c => c.id));
        const merged = [...hostCards, ...joinCards.filter(c => !hostIds.has(c.id))];

        setUpcoming(byDate(mergeEvents(localUpcoming, merged)));

        // Registrations carry only a thin projection - no draw size, fees,
        // cover image or divisions - so the ids are resolved back to full
        // tournament rows. Without that the card cannot show Players /
        // Hold Spots / % Filled or its format pill.
        const ids = Array.from(new Set(registrations.map(r => r.tournamentId).filter(Boolean)));
        fetchTournamentsByIds(ids)
          .then(rows => setRegTournaments(rows))
          .catch(() => { /* leave the play events alone */ });
      }).catch(() => { /* keep local on error */ });

      // Joined tab: all events where user is participant
      fetchJoinedPlayEvents(user.id)
        .then(rows => setJoined(rows.map(e => playEventToGameCard(e, 'Joined'))))
        .catch(() => {});

      loadPastEvents(user.id, pastRangeRef.current, localCompleted);
    }, [user?.id]),
  );

  // Refetch past events when the range filter changes (without waiting for refocus).
  const didMountPastRange = useRef(false);
  useEffect(() => {
    pastRangeRef.current = pastRange;
    if (!didMountPastRange.current) {
      didMountPastRange.current = true;
      return;
    }
    if (!user?.id) return;
    loadPastEvents(user.id, pastRange, getCompletedEvents());
  }, [pastRange, user?.id, loadPastEvents]);

  async function handleAcceptInvite() {
    if (!pendingInvite || !user?.id) return;
    setRespondingInvite(true);
    try {
      await acceptPlayEventInvite(pendingInvite, user.id, profile?.full_name ?? 'Player', user.email ?? '');
      setPendingInvite(null);
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRespondingInvite(false);
    }
  }

  async function handleDeclineInvite() {
    if (!pendingInvite) return;
    setRespondingInvite(true);
    try {
      await declinePlayEventInvite(pendingInvite.id);
      setPendingInvite(null);
    } finally {
      setRespondingInvite(false);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── SUB-TABS ── */}
      <View style={s.subTabBar}>
        {SUB_TABS.map((t) => {
          const active = subTab === t;
          return (
            <TouchableOpacity key={t} style={s.subTab} onPress={() => setSubTab(t)}>
              <SubTabIcon tab={t} active={active} />
              <Text style={[s.subTabLabel, active && s.subTabLabelActive]}>{t}</Text>
              {active && <View style={s.subTabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.divider} />

      {/* ── CONTENT ── */}
      <View style={{ flex: 1, backgroundColor: L.page }}>
        {subTab === 'Upcoming' && (
          <UpcomingContent
            pendingInvite={pendingInvite}
            respondingInvite={respondingInvite}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={handleDeclineInvite}
            events={upcoming}
            unreadEventIds={unreadEventIds}
            tournaments={upcomingTournaments}
            isBookmarked={isBookmarked}
            onToggleBookmark={toggleBookmark}
          />
        )}
        {subTab === 'Held Spots' && (
          <HeldSpotsContent spots={heldSpots} />
        )}
        {subTab === 'Joined' && (
          <JoinedContent events={joined} unreadEventIds={unreadEventIds} />
        )}
        {subTab === 'Past' && (
          <PastContent
            events={byDate(past, 'desc')}
            tournaments={pastTournaments}
            isBookmarked={isBookmarked}
            onToggleBookmark={toggleBookmark}
            range={pastRange}
            onRangeChange={setPastRange}
            typeFilter={pastTypeFilter}
            onTypeFilterChange={setPastTypeFilter}
            loading={pastLoading}
          />
        )}
      </View>

      {/* ── CREATE FAB ── */}
      <TouchableOpacity
        // tabBarClearance, not a raw inset: this is a tab screen, and the
        // floating bar sits above the inset, so insets.bottom alone left the
        // button tucked behind it.
        style={[s.fab, { bottom: tabBarClearance(insets.bottom) }]}
        activeOpacity={0.85}
        onPress={() => router.push('/play-pickleball' as never)}
      >
        <Ionicons name="add" size={28} color={L.navy} />
        <Text style={s.fabLabel}>CREATE</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  subTabBar: {
    flexDirection: 'row', backgroundColor: L.bg,
    paddingHorizontal: 4, paddingTop: 8,
  },
  subTab: {
    flex: 1, alignItems: 'center', paddingBottom: 10, gap: 4, position: 'relative',
  },
  subTabLabel:       { color: L.textMuted, fontSize: 11, fontWeight: '500' },
  subTabLabelActive: { color: L.navy, fontWeight: '700' },
  subTabUnderline: {
    position: 'absolute', bottom: 0, left: 8, right: 8,
    height: 3, borderRadius: 2, backgroundColor: L.gold,
  },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.border },

  fab: {
    position: 'absolute', right: 20,
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: L.bg,
    borderWidth: 1.5, borderColor: L.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 4,
  },
  fabLabel: { color: L.navy, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
