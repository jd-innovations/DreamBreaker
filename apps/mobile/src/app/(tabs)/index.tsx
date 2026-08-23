import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Dimensions, NativeScrollEvent, NativeSyntheticEvent, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme';
import { AppHeader, APP_HEADER_HEIGHT, AppIcon, GlassQuickAction, ProfileCompletionRing, FindGamesFilterModal, FIND_GAMES_DISTANCE_STEPS, FIND_GAMES_SKILL_RANGES, ShimmerOverlay, type AppIconName } from '@/components';
import { DraggableQuickActions } from '@/components/DraggableQuickActions';
import { useSession } from '@/hooks/useSession';
import { useProfile } from '@/hooks/useProfile';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useTournamentBookmarks } from '@/hooks/useTournamentBookmarks';
import { usePlayEventBookmarks } from '@/hooks/usePlayEventBookmarks';
import { useQuickActionsOrder } from '@/hooks/useQuickActionsOrder';
import { QUICK_ACTIONS } from '@/constants/quickActions';
import { getProfileCompletion } from '@/lib/profileCompletion';
import { getProfileSetupTasks, hasRegisteredPushToken } from '@/lib/profileSetup';
import { eventCoverUri } from '@/lib/eventCover';
import { claimGuestParticipants, fetchJoinedPlayEvents, fetchOpenPlayEvents, gameTypePillStyle, skillLabel, type PlayEventWithCount, type PlayEventType } from '@/lib/supabase/playEvents';
import { fetchTournaments } from '@/lib/supabase/tournaments';
import { isTournamentExpired, type Tournament } from '@/lib/tournamentTypes';

const { width: SW } = Dimensions.get('window');
const CARD_W  = SW - 56;

// Theme-backed alias — brand values resolve from @/theme.
function readAuthMetadataString(metadata: unknown, keys: string[]): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readAuthAvatarUrl(metadata: unknown): string | null {
  return readAuthMetadataString(metadata, ['avatar_url', 'picture']);
}

function readAuthFullName(metadata: unknown): string | null {
  return readAuthMetadataString(metadata, ['full_name', 'name']);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}
// Pastel background fills for the Home screen's Quick Actions row —
// keyed by QuickAction.id (constants/quickActions.ts).
const QA_PASTELS: Record<string, string> = {
  create:      '#FDE8E8',
  partner:     '#E3F1FD',
  find:        '#E6F7EC',
  lesson:      '#FDF0DB',
  learn:       '#F1E9FB',
  groups:      '#FEEBF3',
  stats:       '#E1F5F3',
  saved:       '#FFF3D6',
  marketplace: '#E9EEFB',
  wallet:      '#EAF7E0',
  'dev-onboarding': '#FDF6E7',
};

// Liquid-Glass tint colors for the Quick Actions row — keyed by
// QuickAction.id (constants/quickActions.ts). Falls back to QA_PASTELS'
// hue for any action without an explicit spec.
const QA_GLASS_TINTS: Record<string, string> = {
  create:  '#C9A84C', // Create Game — Gold
  partner: '#B8DFFF', // Partner Finder — Sky Blue
  lesson:  '#FFE3B3', // Take Lesson — Soft Peach
  find:    '#D6F4E5', // Find Games — Mint
  learn:   '#E8DDFB', // Learn to Play — Lavender
};

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
  green:     colors.success,
};

// ─── Mock data ─────────────────────────────────────────────────────────────────

const FEATURED = [
  {
    id: 'summer-slam',
    name: 'SUMMER SLAM',
    hasTrophy: true,
    dates: 'JUL 12 – 14, 2025',
    venue: 'Nathan Benderson Park',
    city: 'Sarasota, FL',
    players: 238, holdSpots: 41, pctFilled: 79,
    photo: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=500&fit=crop&q=80',
  },
  {
    id: 'florida-open',
    name: 'FLORIDA OPEN',
    hasTrophy: false,
    dates: 'AUG 8 – 10, 2025',
    venue: 'East Naples Community Park',
    city: 'Naples, FL',
    players: 127, holdSpots: 19, pctFilled: 63,
    photo: 'https://images.unsplash.com/photo-1477525218966-c4a4c7ee6e56?w=800&h=500&fit=crop&q=80',
  },
  {
    id: 'gulf-coast',
    name: 'GULF COAST CLASSIC',
    hasTrophy: false,
    dates: 'SEP 5 – 7, 2025',
    venue: 'Tiburon Golf Club',
    city: 'Naples, FL',
    players: 96, holdSpots: 12, pctFilled: 51,
    photo: 'https://images.unsplash.com/photo-1529832393073-e362750f78b3?w=800&h=500&fit=crop&q=80',
  },
];

const TRENDING = [
  {
    id: 'summer-slam',
    badge: 'FAST FILLING', badgeGold: true,
    name: 'Summer Slam', verified: true,
    players: 238, holdSpots: 41, pctFilled: 79,
    formats: "Mixed · Men's · Women's",
    dates: 'Jul 12 – 14, 2025', city: 'Sarasota, FL',
    holdFee: '$20', entryFee: '$80',
    photo: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=240&fit=crop&q=80',
    logoLines: ['SUMMER', 'SLAM'],
    primaryAction: 'hold' as const,
  },
  {
    id: 'florida-open',
    badge: 'HOLD SPOTS', badgeGold: false,
    name: 'Florida Open', verified: true,
    players: 127, holdSpots: 19, pctFilled: 63,
    formats: "Mixed · Men's · Women's",
    dates: 'Aug 8 – 10, 2025', city: 'Naples, FL',
    holdFee: '$15', entryFee: '$80',
    photo: 'https://images.unsplash.com/photo-1477525218966-c4a4c7ee6e56?w=400&h=240&fit=crop&q=80',
    logoLines: ['FLORIDA', 'OPEN'],
    primaryAction: 'view' as const,
  },
];

const FALLBACK_TOURNEY_PHOTO = 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=600&fit=crop&q=80';

// Takes the raw ISO event date (YYYY-MM-DD), not the already-human-formatted
// display string — re-parsing a formatted string like "Jul 31, 2026" via
// `new Date(string)` is implementation-defined per spec and unreliable on
// Hermes, which is what was producing "Invalid Date" on these cards.
function formatDateRange(isoDateStr: string): string {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  if (!y || !m || !d) return isoDateStr;
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase();
}

function tournamentToFeatured(t: Tournament): typeof FEATURED[0] {
  const pctFilled = t.drawSize > 0 ? Math.round((t.spotsFilled / t.drawSize) * 100) : 0;
  return {
    id: t.id,
    name: t.name.toUpperCase(),
    hasTrophy: (t.prizePoolCents ?? 0) > 0,
    dates: formatDateRange(t.eventDate),
    venue: t.venue,
    city: `${t.city}, ${t.state}`,
    players: t.spotsFilled,
    holdSpots: Math.max(0, t.drawSize - t.spotsFilled),
    pctFilled,
    photo: t.coverImgUrl ?? FALLBACK_TOURNEY_PHOTO,
  };
}

function humanizeFormat(f: string) {
  // Capitalize only the first letter of each word (split on whitespace) —
  // \b\w treats the apostrophe in "men's" as a word boundary and wrongly
  // capitalizes the "s", producing "Men'S".
  return f.replace(/_/g, ' ').replace(/(^|\s)\S/g, c => c.toUpperCase());
}

function tournamentToTrending(t: Tournament): typeof TRENDING[0] {
  const pctFilled = t.drawSize > 0 ? Math.round((t.spotsFilled / t.drawSize) * 100) : 0;
  const words = t.name.toUpperCase().split(' ');
  const mid = Math.ceil(words.length / 2);
  return {
    id: t.id,
    badge: t.status === 'filling_fast' ? 'FAST FILLING' : 'HOLD SPOTS',
    badgeGold: t.status === 'filling_fast',
    name: t.name,
    verified: true,
    players: t.spotsFilled,
    holdSpots: Math.max(0, t.drawSize - t.spotsFilled),
    pctFilled,
    formats: Array.from(new Set(t.formats.map(humanizeFormat))).join(' · ') || 'Doubles',
    dates: formatDateRange(t.eventDate),
    city: `${t.city}, ${t.state}`,
    holdFee: `$${Math.round(t.holdFeeCents / 100)}`,
    entryFee: `$${Math.round(t.entryFeeCents / 100)}`,
    photo: t.coverImgUrl ?? FALLBACK_TOURNEY_PHOTO,
    logoLines: [words.slice(0, mid).join(' '), words.slice(mid).join(' ')],
    primaryAction: t.status === 'filling_fast' ? 'hold' as const : 'view' as const,
  };
}

type CommunityCardData = {
  id: string;
  name: string;
  badge: string;
  badgeGold: boolean;
  datetime: string;
  venue: string;
  players: number;
  spots: number;
  pctFilled: number;
  city: string;
  photo: string;
  primaryAction: 'join' | 'view';
  distance: string;
  eventType: PlayEventType;
  eventDate: string;
  skillMin: number | null;
  skillMax: number | null;
  viewerStatus?: 'joined' | 'hosting';
};
const COMMUNITY: CommunityCardData[] = [
  {
    id: '1', name: 'Wednesday Round Robin', badge: 'OPEN', badgeGold: true,
    datetime: 'Wed, May 21 • 6:00 PM', venue: 'Lakewood Ranch Courts',
    players: 12, spots: 4, pctFilled: 75, city: 'Bradenton, FL',
    photo: 'https://images.unsplash.com/photo-1543941948-60b9490a4414?w=400&h=240&fit=crop&q=80',
    primaryAction: 'join' as const, distance: '2.3 mi',
    eventType: 'round_robin' as PlayEventType, eventDate: todayPlus(0),
    skillMin: 3.5 as number | null, skillMax: 4.5 as number | null,
  },
  {
    id: '2', name: 'Friday Morning Play', badge: 'SPOTS LEFT', badgeGold: false,
    datetime: 'Fri, May 23 • 8:30 AM', venue: 'Nathan Benderson Park',
    players: 8, spots: 8, pctFilled: 50, city: 'Sarasota, FL',
    photo: 'https://images.unsplash.com/photo-1529832393073-e362750f78b3?w=400&h=240&fit=crop&q=80',
    primaryAction: 'join' as const, distance: '8.1 mi',
    eventType: 'open_play' as PlayEventType, eventDate: todayPlus(1),
    skillMin: null as number | null, skillMax: null as number | null,
  },
  {
    id: '3', name: 'Sunday Social Play', badge: 'OPEN', badgeGold: true,
    datetime: 'Sun, May 25 • 9:00 AM', venue: 'Premier Sports Campus',
    players: 16, spots: 2, pctFilled: 89, city: 'Sarasota, FL',
    photo: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=240&fit=crop&q=80',
    primaryAction: 'view' as const, distance: '12.4 mi',
    eventType: 'mixer' as PlayEventType, eventDate: todayPlus(4),
    skillMin: 3.0, skillMax: 3.5,
  },
  {
    id: '4', name: 'Thursday Evening Play', badge: 'SPOTS LEFT', badgeGold: false,
    datetime: 'Thu, May 22 • 7:00 PM', venue: 'Waterside Sports Ctr',
    players: 20, spots: 12, pctFilled: 63, city: 'Lakewood Ranch, FL',
    photo: 'https://images.unsplash.com/photo-1477525218966-c4a4c7ee6e56?w=400&h=240&fit=crop&q=80',
    primaryAction: 'join' as const, distance: '5.7 mi',
    eventType: 'open_play' as PlayEventType, eventDate: todayPlus(2),
    skillMin: 4.0, skillMax: null as number | null,
  },
];


function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function playEventToCard(e: PlayEventWithCount, viewerStatus?: CommunityCardData['viewerStatus']): CommunityCardData {
  const count = e._participantCount;
  const max   = e.max_players ?? 0;
  const spots = Math.max(0, max - count);
  const badge = e.status === 'open' ? 'OPEN' : 'FULL';

  let datetime = e.event_date;
  try {
    const dt = new Date(`${e.event_date}T12:00:00`);
    const short = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (e.start_time) {
      const [h, m] = (e.start_time as string).split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      datetime = `${short} • ${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
    } else {
      datetime = short;
    }
  } catch { /* keep raw date */ }

  return {
    id:            e.id,
    name:          e.name,
    badge,
    badgeGold:     e.status === 'open',
    datetime,
    venue:         e.venue_name ?? e.location ?? '',
    players:       count,
    spots,
    pctFilled:     max > 0 ? Math.round((count / max) * 100) : 0,
    city:          [e.city, e.state].filter(Boolean).join(', '),
    photo:         eventCoverUri(e.cover_url),
    primaryAction: e.status === 'open' ? 'join' : 'view',
    distance:      '',
    eventType:     (e.event_type as PlayEventType) ?? 'open_play',
    eventDate:     e.event_date,
    skillMin:      e.skill_min,
    skillMax:      e.skill_max,
    viewerStatus,
  };
}

const DATE_PILLS = [
  { id: 'all',      label: 'All Upcoming' },
  { id: 'today',    label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week',     label: 'This Week' },
  { id: 'weekend',  label: 'This Weekend' },
  { id: 'next7',    label: 'Next 7 Days' },
];

const TYPE_PILLS: { id: 'all' | PlayEventType; label: string }[] = [
  { id: 'all',             label: 'All' },
  { id: 'open_play',       label: 'Open Play' },
  { id: 'round_robin',     label: 'Round Robin' },
  { id: 'mini_tournament', label: 'Mini Tournament' },
  { id: 'mixer',           label: 'Mixer' },
  { id: 'ladder',          label: 'Ladder' },
  { id: 'kings_court',     label: "King's Court" },
];

// ─── Featured carousel card ───────────────────────────────────────────────────

function FeaturedCard({ item }: { item: typeof FEATURED[0] }) {
  return (
    <TouchableOpacity
      style={[fc.card, { width: CARD_W }]}
      activeOpacity={0.92}
      onPress={() => router.push(`/tournament/${item.id}` as never)}
    >
      <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.72)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={fc.featuredBadge}>
        <Text style={fc.featuredText}>FEATURED</Text>
      </View>
      <View style={fc.content}>
        <View style={fc.titleRow}>
          <Text style={fc.name} numberOfLines={2} ellipsizeMode="tail">{item.name}</Text>
          {item.hasTrophy && <Ionicons name="trophy" size={22} color={L.gold} style={{ marginLeft: 6, marginTop: 4 }} />}
        </View>
        <View style={fc.metaRow}>
          <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={fc.metaText}>{item.dates}</Text>
        </View>
        <View style={fc.metaRow}>
          <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={fc.metaText}>{item.venue}</Text>
        </View>
        <View style={[fc.metaRow, { marginBottom: 14 }]}>
          <Ionicons name="navigate-circle-outline" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={fc.metaText}>{item.city}</Text>
        </View>
        <View style={fc.statsRow}>
          <View style={fc.stat}>
            <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={fc.statNum}>{item.players}</Text>
            <Text style={fc.statLabel}>Players</Text>
          </View>
          <View style={fc.stat}>
            <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={fc.statNum}>{item.holdSpots}</Text>
            <Text style={fc.statLabel}>Hold Spots</Text>
          </View>
          <View style={fc.stat}>
            <Ionicons name="sync-circle-outline" size={13} color={L.gold} />
            <Text style={[fc.statNum, { color: L.gold }]}>{item.pctFilled}%</Text>
            <Text style={fc.statLabel}>Filled</Text>
          </View>
        </View>
        <TouchableOpacity
          style={fc.viewBtn}
          activeOpacity={0.85}
          onPress={() => router.push(`/tournament/${item.id}` as never)}
        >
          <Text style={fc.viewBtnText}>View Tournament</Text>
          <Ionicons name="arrow-forward" size={14} color={L.navy} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const fc = StyleSheet.create({
  card: { height: 336, borderRadius: 20, overflow: 'hidden', marginRight: 12 },
  featuredBadge: {
    position: 'absolute', top: 14, left: 14, zIndex: 2,
    backgroundColor: L.gold, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  featuredText: { color: L.navy, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  content:      {
    position: 'absolute', top: 58, bottom: 0, left: 0, right: 0, padding: 16,
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  titleRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  name:         { color: '#FFFFFF', fontSize: 26, fontWeight: '800', letterSpacing: 0.5, flexShrink: 1 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  metaText:     { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '500' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  stat:      { flex: 1, alignItems: 'center', gap: 2 },
  statNum:   { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 9, fontWeight: '500' },
  viewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    marginTop: 8,
  },
  viewBtnText: { color: L.navy, fontSize: 13, fontWeight: '800' },
});

// ─── Trending tournament card (full-width horizontal) ────────────────────────

function TrendingCard({ item, onSave, saved }: {
  item: typeof TRENDING[0]; onSave: () => void; saved: boolean;
}) {
  return (
    <TouchableOpacity
      style={tc.card}
      activeOpacity={0.88}
      onPress={() => router.push(`/tournament/${item.id}` as never)}
    >
      {/* Photo column */}
      <View style={tc.photoWrap}>
        <Image source={{ uri: item.photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <LinearGradient colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.50)']} style={StyleSheet.absoluteFill} />
      </View>

      {/* Info column */}
      <View style={tc.info}>
        <View style={tc.nameRow}>
          <Text style={tc.name}>{item.name}</Text>
          <TouchableOpacity onPress={onSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={18} color={saved ? '#FF6B6B' : L.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={tc.verifiedRow}>
          <Ionicons name="checkmark-circle" size={12} color="#3B82F6" />
          <Text style={tc.verifiedText}>Verified Director</Text>
        </View>

        <View style={tc.statsRow}>
          <View style={tc.statItem}>
            <Text style={tc.statNum}>{item.players}</Text>
            <Text style={tc.statLabel}>Players</Text>
          </View>
          <View style={tc.statDivider} />
          <View style={tc.statItem}>
            <Text style={tc.statNum}>{item.holdSpots}</Text>
            <Text style={tc.statLabel}>Hold Spots</Text>
          </View>
          <View style={tc.statDivider} />
          <View style={tc.statItem}>
            <Text style={[tc.statNum, { color: L.gold }]}>{item.pctFilled}%</Text>
            <Text style={tc.statLabel}>Filled</Text>
          </View>
        </View>

        <Text style={tc.formats} numberOfLines={1}>{item.formats}</Text>
        <View style={tc.metaRow}>
          <Ionicons name="calendar-outline" size={11} color={L.textMuted} />
          <Text style={tc.metaText}>{item.dates}</Text>
        </View>
        <View style={[tc.metaRow, { marginBottom: 10 }]}>
          <Ionicons name="location-outline" size={11} color={L.textMuted} />
          <Text style={tc.metaText}>{item.city}</Text>
        </View>

        <View style={tc.btns}>
          <View style={tc.btnRow}>
            <TouchableOpacity
              style={tc.holdBtn}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: `/tournament/${item.id}/select-division` as never,
                params: { intent: 'hold' },
              } as never)}
            >
              <Text style={tc.holdBtnLabel}>Hold {item.holdFee}</Text>
            </TouchableOpacity>
            {item.primaryAction === 'hold' && (
              <TouchableOpacity
                style={tc.registerBtn}
                activeOpacity={0.85}
                onPress={() => router.push({
                  pathname: `/tournament/${item.id}/select-division` as never,
                  params: { intent: 'register' },
                } as never)}
              >
                <Text style={tc.registerLabel}>Register {item.entryFee}</Text>
              </TouchableOpacity>
            )}
          </View>
          {item.primaryAction !== 'hold' && (
            <TouchableOpacity
              style={tc.viewTournBtn}
              activeOpacity={0.85}
              onPress={() => router.push(`/tournament/${item.id}` as never)}
            >
              <Text style={tc.viewTournText}>View Tournament</Text>
              <Ionicons name="arrow-forward" size={12} color={L.navy} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const tc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: L.border, backgroundColor: L.bg,
    marginHorizontal: 16, marginBottom: 12,
  },
  photoWrap: { width: 120, position: 'relative' },
  badge: {
    position: 'absolute', top: 10, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  badgeGold:  { backgroundColor: L.gold },
  badgeGreen: { backgroundColor: colors.success },
  badgeText:  { color: L.navy, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  miniLogo: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(10,18,40,0.85)',
    borderRadius: 6, padding: 5, alignItems: 'center',
  },
  miniLogoText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, lineHeight: 10 },

  info:        { flex: 1, padding: 12, gap: 4 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  name:        { color: L.navy, fontSize: 20, fontWeight: '800', flex: 1, marginRight: 8 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  verifiedText:{ color: '#3B82F6', fontSize: 11, fontWeight: '600' },

  statsRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  statItem:    { flex: 1, alignItems: 'center' },
  statNum:     { color: L.navy, fontSize: 15, fontWeight: '800' },
  statLabel:   { color: L.textMuted, fontSize: 11 },
  statDivider: { width: 1, height: 20, backgroundColor: L.border, marginHorizontal: 8 },

  formats:  { color: L.textSub, fontSize: 13, fontWeight: '600', marginBottom: 3 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  metaText: { color: '#000000', fontSize: 11, flex: 1 },

  btns:   { gap: 6 },
  btnRow: { flexDirection: 'row', gap: 6 },
  holdBtn: {
    flex: 1, alignItems: 'center',
    borderWidth: 1.5, borderColor: L.gold, borderRadius: 10,
    paddingVertical: 7,
  },
  holdBtnLabel: { color: L.gold, fontSize: 13, fontWeight: '800' },
  registerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: L.gold, borderRadius: 10, paddingVertical: 7,
  },
  registerLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  viewTournBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1.5, borderColor: L.border, borderRadius: 10,
    paddingVertical: 7,
  },
  viewTournText: { color: L.navy, fontSize: 13, fontWeight: '700' },
});

// ─── Community play list row ──────────────────────────────────────────────────

function CommunityCard({ item, saved, onSave }: { item: CommunityCardData; saved: boolean; onSave: () => void }) {
  const badgeBg    = item.badgeGold ? colors.goldBg    : colors.successBg;
  const badgeColor = item.badgeGold ? colors.gold      : colors.success;
  const totalMax   = item.players + item.spots;
  const gameType   = gameTypePillStyle(item.eventType);

  return (
    <TouchableOpacity
      style={cl.card}
      activeOpacity={0.82}
      onPress={() => router.push(`/community/${item.id}` as never)}
    >
      {/* Top row: type pill | distance chip + status badge */}
      <View style={cl.topRow}>
        <View style={cl.typeTag}>
          <Text style={cl.typeText}>COMMUNITY PLAY</Text>
        </View>
        <View style={cl.topRight}>
          <View style={cl.distChip}>
            <Ionicons name="navigate-outline" size={11} color={L.textSub} />
            <Text style={cl.distText}>{item.distance}</Text>
          </View>
          <View style={[cl.statusBadge, { backgroundColor: badgeBg }]}>
            <Text style={[cl.statusText, { color: badgeColor }]}>{item.badge}</Text>
          </View>
          <TouchableOpacity onPress={onSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={16} color={saved ? '#FF6B6B' : L.textSub} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Title */}
      <Text style={cl.name}>{item.name}</Text>

      {/* Meta rows */}
      <View style={cl.meta}>
        <Ionicons name="calendar-outline" size={14} color={L.gold} />
        <Text style={cl.metaText}>{item.datetime}</Text>
      </View>
      <View style={cl.meta}>
        <Ionicons name="location-outline" size={14} color={L.gold} />
        <Text style={cl.metaText}>{item.venue}</Text>
      </View>
      <View style={cl.meta}>
        <Ionicons name="speedometer-outline" size={14} color={L.gold} />
        <Text style={cl.metaText}>{skillLabel(item.skillMin, item.skillMax)}</Text>
      </View>

      {/* Divider + bottom row */}
      <View style={cl.divider} />
      <View style={cl.bottomRow}>
        <View style={cl.bottomLeft}>
          <View style={cl.countGroup}>
            <Ionicons name="people" size={15} color={L.gold} />
            <Text style={cl.countText}>{item.players} / {totalMax}</Text>
          </View>
          <View style={[cl.gameTypePill, { backgroundColor: gameType.bg }]}>
            <Text style={[cl.gameTypePillText, { color: gameType.color }]}>{gameType.label}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[cl.joinBtn, item.viewerStatus && cl.joinedBtn]}
          activeOpacity={0.85}
          onPress={() => router.push(`/community/${item.id}` as never)}
        >
          <Text style={[cl.joinText, item.viewerStatus && cl.joinedText]}>
            {item.viewerStatus === 'hosting' ? 'Hosting' : item.viewerStatus === 'joined' ? 'Joined' : 'Join'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const cl = StyleSheet.create({
  card: {
    backgroundColor: L.bg,
    borderRadius: 16, borderWidth: 1, borderColor: L.border,
    padding: 16, marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  typeTag: {
    alignSelf: 'flex-start',
  },
  typeText: { color: L.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  distText: { color: L.textSub, fontSize: 11, fontWeight: '600' },
  statusBadge: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  name: {
    color: L.navy, fontSize: 22, fontWeight: '800', lineHeight: 26,
    textTransform: 'uppercase', marginBottom: 12,
  },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  metaText: { color: '#000000', fontSize: 15, fontWeight: '500', flex: 1 },
  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: L.border,
    marginTop: 6, marginBottom: 12,
  },
  bottomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  bottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  countGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText:  { color: L.navy, fontSize: 15, fontWeight: '800' },
  gameTypePill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  gameTypePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  joinBtn: {
    backgroundColor: L.navy, borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 9,
  },
  joinText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  joinedBtn: { backgroundColor: colors.successBg, borderWidth: 1.5, borderColor: colors.success },
  joinedText: { color: colors.success },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { profile } = useProfile();
  const completion = getProfileCompletion(profile);
  const displayName = profile?.full_name ?? readAuthFullName(user?.user_metadata) ?? user?.email?.split('@')[0] ?? 'Player';
  const displayAvatarUrl = profile?.avatar_url ?? readAuthAvatarUrl(user?.user_metadata) ?? null;
  const { unreadMessages, unreadNotifications } = useUnreadCounts();
  const { isBookmarked, toggleBookmark } = useTournamentBookmarks();
  const { isBookmarked: isPlayEventBookmarked, toggleBookmark: togglePlayEventBookmark } = usePlayEventBookmarks();
  const quickActionDefaults = __DEV__
    ? [...QUICK_ACTIONS, { id: 'dev-onboarding', label: 'DEV\nOnboarding', icon: 'sparkles-outline' as AppIconName, active: false, route: '/onboarding' }]
    : QUICK_ACTIONS;
  const { items: quickActions, reorder: reorderQuickActions } = useQuickActionsOrder(quickActionDefaults);
  const [activeCard, setActiveCard]             = useState(0);
  const [activeDateFilter, setActiveDateFilter] = useState('all');
  const [activeTypeFilter, setActiveTypeFilter] = useState<'all' | PlayEventType>('all');
  const [setupExpanded, setSetupExpanded]       = useState(false);
  const [hasPushToken, setHasPushToken]         = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [maxDistanceIdx, setMaxDistanceIdx]         = useState(FIND_GAMES_DISTANCE_STEPS.length - 1);
  const [selectedSkillLabels, setSelectedSkillLabels] = useState<string[]>([]);
  const [hideFullGames, setHideFullGames]             = useState(false);
  const distanceFilterActive = maxDistanceIdx < FIND_GAMES_DISTANCE_STEPS.length - 1;
  const anyCustomizeFilterActive = distanceFilterActive || selectedSkillLabels.length > 0 || hideFullGames;
  const setupTasks = getProfileSetupTasks({
    isSignedIn: !!user?.id,
    profile,
    authAvatarUrl: readAuthAvatarUrl(user?.user_metadata),
    hasPushToken,
  });
  const pendingCount = setupTasks.filter(t => !t.done).length;

  const toggleSkillLabel = (label: string) => {
    setSelectedSkillLabels(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label],
    );
  };

  const [communityCards,   setCommunityCards]   = useState<CommunityCardData[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError,   setCommunityError]   = useState(false);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);

  useEffect(() => {
    fetchTournaments()
      // Past events keep a visible status in the DB, and the list arrives
      // oldest-first — so without this they'd permanently own the home slots.
      .then(rows => setTournaments(rows.filter(t => !isTournamentExpired(t))))
      .catch(() => setTournaments([]));
  }, []);

  const featuredTournaments = tournaments.filter(t => t.featured);
  const featuredPool = featuredTournaments.length > 0 ? featuredTournaments : tournaments;
  const featuredData = tournaments.length > 0 ? featuredPool.slice(0, 3).map(tournamentToFeatured) : FEATURED;
  const trendingData = tournaments.length > 0 ? tournaments.slice(0, 2).map(tournamentToTrending) : TRENDING;

  // Max-distance filter from the Customize sheet — items with no distance
  // (live events without a computed distance yet) always pass through.
  const maxDistanceMi = { 0: 5, 1: 25, 2: 50 }[maxDistanceIdx] as number | undefined;
  const filterByDistance = (items: CommunityCardData[]) => {
    if (maxDistanceMi == null) return items;
    return items.filter(item => {
      const mi = parseFloat(item.distance);
      return Number.isNaN(mi) || mi <= maxDistanceMi;
    });
  };

  // Type pill — direct equality against play_event_type.
  const filterByType = (items: CommunityCardData[]) => {
    if (activeTypeFilter === 'all') return items;
    return items.filter(item => item.eventType === activeTypeFilter);
  };

  // Date pill — bucket by event_date relative to today (local time).
  const filterByDate = (items: CommunityCardData[]) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    return items.filter(item => {
      if (!item.eventDate) return true;
      const eventDay = new Date(`${item.eventDate}T00:00:00`);
      const diffDays = Math.round((eventDay.getTime() - startOfToday.getTime()) / dayMs);
      if (diffDays < 0) return false;

      switch (activeDateFilter) {
        case 'today':    return diffDays === 0;
        case 'tomorrow': return diffDays === 1;
        case 'week':     return diffDays <= (7 - startOfToday.getDay());
        case 'weekend': {
          const dow = eventDay.getDay(); // 0 = Sun, 6 = Sat
          return diffDays <= (7 - startOfToday.getDay()) && (dow === 0 || dow === 6);
        }
        case 'next7':    return diffDays <= 7;
        case 'all':      return true;
        default:         return true;
      }
    });
  };

  // Skill Level — an event with no skill range set is treated as "All Levels"
  // and always passes; otherwise it must overlap at least one selected range.
  const filterBySkill = (items: CommunityCardData[]) => {
    if (selectedSkillLabels.length === 0) return items;
    const ranges = FIND_GAMES_SKILL_RANGES.filter(r => selectedSkillLabels.includes(r.label));
    return items.filter(item => {
      if (item.skillMin == null && item.skillMax == null) return true;
      const evMin = item.skillMin ?? -Infinity;
      const evMax = item.skillMax ?? Infinity;
      return ranges.some(r => evMin <= (r.max ?? Infinity) && evMax >= r.min);
    });
  };

  // Hide Full Games — items without a computed spots count always pass.
  const filterByFullness = (items: CommunityCardData[]) => {
    if (!hideFullGames) return items;
    return items.filter(item => item.spots > 0);
  };

  const applyFindGamesFilters = (items: CommunityCardData[]) =>
    filterByFullness(filterBySkill(filterByDate(filterByType(filterByDistance(items)))));

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!user?.id) {
        setHasPushToken(false);
        return () => { cancelled = true; };
      }

      hasRegisteredPushToken(user.id)
        .then(value => { if (!cancelled) setHasPushToken(value); })
        .catch(() => { if (!cancelled) setHasPushToken(false); });

      return () => { cancelled = true; };
    }, [user?.id]),
  );
  // Refetch on focus (not just mount) — otherwise leaving/joining an event on
  // another screen leaves this list showing stale "Joined" status and counts.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setCommunityLoading(true);
        setCommunityError(false);
        try {
          if (user?.id && user.email) {
            await claimGuestParticipants(user.id, user.email);
          }
          const [events, joinedEvents] = await Promise.all([
            fetchOpenPlayEvents(10),
            user?.id ? fetchJoinedPlayEvents(user.id) : Promise.resolve([]),
          ]);
          if (cancelled) return;
          const joinedIds = new Set(joinedEvents.map(e => e.id));
          setCommunityCards(events.map(e => playEventToCard(
            e,
            user?.id && e.organizer_id === user.id ? 'hosting' : joinedIds.has(e.id) ? 'joined' : undefined,
          )));
        } catch {
          if (!cancelled) setCommunityError(true);
        } finally {
          if (!cancelled) setCommunityLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [user?.id, user?.email]),
  );


  const handleCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 12));
    setActiveCard(idx);
  };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── HEADER (shared) ── */}
      <AppHeader hideProfile />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + APP_HEADER_HEIGHT, paddingBottom: insets.bottom + 120 },
        ]}
      >
        {/* ── PROFILE SETUP CARD (collapsible) ── */}
        <TouchableOpacity
          style={sg.banner}
          activeOpacity={0.92}
          onPress={() => setSetupExpanded(v => !v)}
        >
          {/* Top: greeting + avatar */}
          <View style={sg.greetRow}>
            <View style={sg.greetLeft}>
              <Text style={sg.greetLabel}>{getGreeting()}</Text>
              <Text style={sg.greetName}>{displayName.split(' ')[0]}</Text>
              {(profile?.dupr != null || profile?.self_rating || profile?.skill_level) && (
                <Text style={sg.greetRating}>
                  {profile.dupr != null
                    ? `DUPR ${Number(profile.dupr).toFixed(2)}`
                    : profile.self_rating
                      ? `Self Rated ${profile.self_rating}`
                      : profile.skill_level}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => router.push('/account-settings' as never)} activeOpacity={0.85}>
              <ProfileCompletionRing percent={completion} size={96} strokeWidth={3} style={sg.avatarRing}>
                {displayAvatarUrl ? (
                  <Image source={{ uri: displayAvatarUrl }} style={sg.avatarImg} />
                ) : (
                  <View style={sg.avatarPlaceholder}>
                    <Ionicons name="person" size={32} color="rgba(255,255,255,0.5)" />
                  </View>
                )}
              </ProfileCompletionRing>
            </TouchableOpacity>
          </View>

          {/* Bottom: profile setup strip */}
          <View style={sg.setupStrip}>
            <View style={sg.setupLeft}>
              <Text style={sg.setupLabel}>PROFILE SETUP</Text>
              <Text style={sg.setupTask}>{pendingCount} task{pendingCount === 1 ? '' : 's'} remaining</Text>
            </View>
            <View style={sg.setupRight}>
              {setupTasks.map(t => (
                <View key={t.id} style={[sg.dot, t.done ? sg.dotGold : sg.dotGray]} />
              ))}
              <Ionicons
                name={setupExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="rgba(255,255,255,0.5)"
                style={{ marginLeft: 4 }}
              />
            </View>
          </View>

          {/* Gold sweep across the card on arrival. Last child so it layers over
              the greeting and setup strip; the banner's own overflow: hidden and
              borderRadius clip it to the card. */}
          <ShimmerOverlay />
        </TouchableOpacity>

        {/* Expanded checklist (sits below banner) */}
        {setupExpanded && (
          <View style={sg.checklist}>
            {setupTasks.map((task, idx) => (
              <TouchableOpacity
                key={task.id}
                style={[sg.taskRow, idx < setupTasks.length - 1 && sg.taskRowBorder]}
                activeOpacity={task.route ? 0.74 : 1}
                disabled={!task.route}
                onPress={() => { if (task.route) router.push(task.route as never); }}
              >
                {task.done ? (
                  <View style={sg.doneCircle}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={sg.pendingCircle}>
                    <AppIcon name={task.icon as AppIconName} size={20} color={L.gold} />
                  </View>
                )}
                <View style={sg.taskContent}>
                  <Text style={[sg.taskLabel, task.done && sg.taskLabelDone]}>{task.label}</Text>
                  {task.desc && <Text style={sg.taskDesc}>{task.desc}</Text>}
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={sg.hideRow}
              onPress={() => setSetupExpanded(false)}
              activeOpacity={0.7}
            >
              <Text style={sg.hideText}>Hide this checklist</Text>
              <Ionicons name="eye-off-outline" size={16} color={L.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── QUICK ACTIONS ── */}
        <Text style={s.sectionLabelSmall}>QUICK ACTIONS</Text>
        <DraggableQuickActions
          items={quickActions}
          pitch={76}
          onReorder={reorderQuickActions}
          onPressItem={(qa) => qa.route && router.push(qa.route as never)}
          contentContainerStyle={s.quickRow}
          style={{ marginBottom: 20 }}
          renderItem={(qa) => (
            <GlassQuickAction
              icon={qa.icon as AppIconName}
              label={qa.label}
              tintColor={QA_GLASS_TINTS[qa.id] ?? QA_PASTELS[qa.id] ?? L.gold}
              size={54}
              style={{ width: 68 }}
            />
          )}
        />

        {/* ── STATS ── */}
        <View style={s.statsRow}>
          {/* Invitations */}
          <TouchableOpacity
            style={s.statCell}
            activeOpacity={0.75}
            onPress={() => router.push('/invites' as never)}
          >
            <View style={s.statCellLeft}>
              <Text style={s.statCellNum}>{unreadNotifications}</Text>
              <Text style={s.statCellLabel}>Invitations</Text>
            </View>
            <View style={s.statIconWrap}>
              <View style={s.statIconCircle}>
                <Ionicons name="mail-outline" size={34} color={L.navy} />
              </View>
              {unreadNotifications > 0 && (
                <View style={s.notifBubble}>
                  <Text style={s.notifText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <View style={s.statDivider} />

          {/* Messages */}
          <TouchableOpacity
            style={s.statCell}
            activeOpacity={0.75}
            onPress={() => router.push('/(tabs)/chat' as never)}
          >
            <View style={s.statCellLeft}>
              <Text style={s.statCellNum}>{unreadMessages}</Text>
              <Text style={s.statCellLabel}>Messages</Text>
            </View>
            <View style={s.statIconWrap}>
              <View style={s.statIconCircle}>
                <Ionicons name="chatbubble-outline" size={34} color={L.navy} />
              </View>
              {unreadMessages > 0 && (
                <View style={s.notifBubble}>
                  <Text style={s.notifText}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* ── FIND GAMES FILTERS ── */}
        <View style={[s.sectionHeader, { marginTop: 28 }]}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/nearby' as never)}>
            <Text style={s.sectionTitle}>Find Games</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.viewAllBtn} onPress={() => setFilterModalVisible(true)}>
            <Text style={s.viewAllText}>Customize</Text>
            <View>
              <Ionicons name="filter-outline" size={14} color={L.gold} />
              {anyCustomizeFilterActive && <View style={s.filterActiveDot} />}
            </View>
          </TouchableOpacity>
        </View>

        {/* Date pills */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          style={{ marginBottom: 10 }}
        >
          {DATE_PILLS.map(p => {
            const active = activeDateFilter === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.filterPill, active && s.filterPillActive]}
                onPress={() => setActiveDateFilter(p.id)}
                activeOpacity={0.75}
              >
                <Text style={[s.filterLabel, active && s.filterLabelActive]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Type pills */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          style={{ marginBottom: 24 }}
        >
          {TYPE_PILLS.map(p => {
            const active = activeTypeFilter === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.filterPill, active && s.filterPillActive]}
                onPress={() => setActiveTypeFilter(p.id)}
                activeOpacity={0.75}
              >
                <Text style={[s.filterLabel, active && s.filterLabelActive]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── COMMUNITY PLAY ── */}
        <View style={s.communityList}>
          {communityLoading ? (
            <ActivityIndicator size="small" color={colors.gold} style={{ marginVertical: 24 }} />
          ) : (() => {
            const filtered = applyFindGamesFilters(
              communityError || communityCards.length === 0 ? COMMUNITY : communityCards,
            );
            return filtered.length === 0 ? (
              <Text style={s.communityEmptyText}>No games match these filters yet.</Text>
            ) : (
              filtered.map(item => (
                <CommunityCard
                  key={item.id}
                  item={item}
                  saved={isPlayEventBookmarked(item.id)}
                  onSave={() => togglePlayEventBookmark(item.id)}
                />
              ))
            );
          })()}
        </View>

        {/* ── FEATURED CAROUSEL ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.carouselRow}
          snapToInterval={CARD_W + 12}
          decelerationRate="fast"
          onScroll={handleCarouselScroll}
          scrollEventThrottle={16}
          style={{ marginBottom: 12, marginTop: 8 }}
        >
          {featuredData.map(item => <FeaturedCard key={item.id} item={item} />)}
        </ScrollView>

        {/* Pagination dots */}
        <View style={s.dotsRow}>
          {featuredData.map((_, i) => (
            <View key={i} style={[s.dot, i === activeCard && s.dotActive]} />
          ))}
        </View>

        {/* ── TRENDING TOURNAMENTS ── */}
        <View style={[s.sectionHeader, { marginTop: 8 }]}>
          <View style={s.sectionTitleRow}>
            <Text style={s.sectionTitleEmoji}>🔥</Text>
            <Text style={s.sectionTitle}>Trending Tournaments</Text>
          </View>
          <TouchableOpacity style={s.viewAllBtn} onPress={() => router.push('/(tabs)/tournaments' as never)}>
            <Text style={s.viewAllText}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={L.gold} />
          </TouchableOpacity>
        </View>

        {trendingData.map(item => (
          <TrendingCard
            key={item.id}
            item={item}
            saved={isBookmarked(item.id)}
            onSave={() => toggleBookmark(item.id)}
          />
        ))}
      </ScrollView>

      <FindGamesFilterModal
        visible={filterModalVisible}
        distanceIdx={maxDistanceIdx}
        onChangeDistanceIdx={setMaxDistanceIdx}
        selectedSkillLabels={selectedSkillLabels}
        onToggleSkillLabel={toggleSkillLabel}
        hideFullGames={hideFullGames}
        onChangeHideFullGames={setHideFullGames}
        onClose={() => setFilterModalVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: L.border,
    backgroundColor: L.bg,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerLogo: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
  },
  headerLogoText: { color: L.navy, fontSize: 13, fontWeight: '900', letterSpacing: 1, lineHeight: 15 },
  headerLogoPb:   { color: L.gold, fontSize: 13, fontWeight: '900', letterSpacing: 1, lineHeight: 15 },

  // Scroll
  scroll: { paddingTop: 0 },

  // Quick Actions
  sectionLabelSmall: {
    color: L.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    marginHorizontal: 16, marginTop: 24, marginBottom: 14,
  },
  quickRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16, marginBottom: 4,
    borderWidth: 1, borderColor: L.border, borderRadius: 16,
    backgroundColor: L.bg,
    elevation: 4,
    shadowColor: '#0A1228',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  statCell: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, paddingHorizontal: 16,
  },
  statCellLeft:  { flex: 1 },
  statCellNum:   { color: L.navy, fontSize: 26, fontWeight: '900' },
  statCellLabel: { color: L.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  statIconWrap:  { position: 'relative', flexShrink: 0 },
  statIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
  },
  notifBubble: {
    position: 'absolute', top: -5, right: -6,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: L.bg,
  },
  notifText:     { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  statDivider:   { width: 1, backgroundColor: L.border },

  // Carousel
  carouselRow: { paddingHorizontal: 16, gap: 12 },

  // Dots
  dotsRow:   { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 18 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: L.border },
  dotActive: { width: 20, height: 6, borderRadius: 3, backgroundColor: L.gold },

  // Filter pills
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 24, borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
  },
  filterPillActive:  { backgroundColor: L.navy, borderColor: L.navy },
  filterLabel:       { color: L.textSub, fontSize: 13, fontWeight: '600' },
  filterLabelActive: { color: '#FFFFFF' },

  // Section header
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 14,
  },
  sectionTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitleEmoji: { fontSize: 18 },
  sectionTitle:      { color: L.navy, fontSize: 17, fontWeight: '900' },
  viewAllBtn:        { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText:       { color: L.gold, fontSize: 13, fontWeight: '700' },
  filterActiveDot: {
    position: 'absolute', top: -2, right: -2,
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success,
  },

  // Community list
  communityList: {
    marginHorizontal: 16,
  },
  communityEmptyText: {
    color: L.textMuted, fontSize: 13, textAlign: 'center',
    paddingVertical: 24,
  },

});

// ─── Setup card styles ────────────────────────────────────────────────────────

const sg = StyleSheet.create({
  // ── Collapsed banner (original navy design) ──
  banner: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    backgroundColor: L.navy, borderRadius: 20,
    overflow: 'hidden',
  },
  greetRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingLeft: 20, paddingTop: 18, paddingRight: 0,
  },
  greetLeft:  { flex: 1, paddingBottom: 14 },
  greetLabel: { color: L.gold, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' },
  greetName:  { color: '#FFFFFF', fontSize: 34, fontWeight: '900', lineHeight: 36, textTransform: 'uppercase' },
  greetRating: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginTop: 4, textTransform: 'uppercase' },
  avatarRing: {
    alignSelf: 'flex-end',
    marginRight: 16, marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  setupStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  setupLeft:  { flex: 1 },
  setupLabel: { color: L.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  setupTask:  { color: '#FFFFFF', fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
  setupRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:        { width: 12, height: 12, borderRadius: 6 },
  dotGold:    { backgroundColor: L.gold },
  dotGray:    { backgroundColor: 'rgba(255,255,255,0.25)' },

  // ── Expanded checklist ──
  checklist: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
    borderWidth: 1, borderTopWidth: 0, borderColor: L.border,
    overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  taskRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F4FA' },
  doneCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: L.green,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  pendingCircle: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: '#CBD5E1', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    backgroundColor: '#FAFCFF',
  },
  taskContent:   { flex: 1 },
  taskLabel:     { color: L.navy, fontSize: 15, fontWeight: '700' },
  taskLabelDone: { color: L.textSub },
  taskDesc:      { color: L.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  hideRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F0F4FA',
  },
  hideText: { color: L.textSub, fontSize: 14, fontWeight: '700' },
});



