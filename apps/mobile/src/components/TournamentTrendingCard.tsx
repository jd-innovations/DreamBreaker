import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '@/theme';
import { skillLabel } from '@/lib/supabase/playEvents';
import { formatEventDay, formatStartTime, humanizeFormat } from '@/lib/tournamentDisplay';
import type { Tournament } from '@/lib/tournamentTypes';
import { FillBar } from './FillBar';

// The large tournament card from the Home tab, shared so the Events tab can
// show a registered tournament the same way Home shows an open one.
//
// It lived inline in (tabs)/index.tsx as `TrendingCard`, typed against
// `typeof TRENDING[0]` - the demo array. Extracting it needed a real type, so
// TrendingTournament is now named and tournamentToTrending returns it.
//
// Named TournamentTrendingCard because a different, smaller TournamentCard
// already exists locally on the facility screen.

const FALLBACK_TOURNEY_PHOTO =
  'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&h=600&fit=crop&q=80';

export type TrendingTournament = {
  id: string;
  badge: string;
  badgeGold: boolean;
  name: string;
  verified: boolean;
  players: number;
  holdSpots: number;
  pctFilled: number;
  formats: string;
  dates: string;
  time: string | null;
  venue: string;
  city: string;
  skill: string | null;
  holdFee: string;
  entryFee: string;
  photo: string;
  logoLines: string[];
  primaryAction: 'hold' | 'view';
};

export function tournamentToTrending(t: Tournament): TrendingTournament {
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
    // Divisions first: tournaments.formats is not maintained by division
    // creation, so a mixed-doubles tournament can carry formats = [] and used
    // to fall through to a hardcoded "Doubles" — announcing the wrong event.
    // Falls back to the column only when divisions were not loaded, and to ''
    // when neither knows, so the pill is hidden rather than guessing.
    formats: Array.from(new Set(
      (t.divisionFormats.length > 0 ? t.divisionFormats : t.formats).map(humanizeFormat),
    )).join(' · '),
    dates: formatEventDay(t.eventDate),
    time: formatStartTime(t.startTime),
    venue: t.venue,
    city: `${t.city}, ${t.state}`,
    // Divisions first, same reasoning as formats above. Null (row hidden) when
    // neither source declares a range, instead of rendering "0 – 0".
    skill: (() => {
      const lo = t.divisionSkillMin ?? (t.skillMin > 0 ? t.skillMin : null);
      const hi = t.divisionSkillMax ?? (t.skillMax > 0 ? t.skillMax : null);
      return lo != null || hi != null ? skillLabel(lo ?? hi!, hi ?? lo!) : null;
    })(),
    // "Free" rather than "$0": a zero hold fee means holding costs nothing,
    // and "Hold My Spot · $0" reads like a broken price.
    holdFee: t.holdFeeCents > 0 ? `$${Math.round(t.holdFeeCents / 100)}` : 'Free',
    entryFee: `$${Math.round(t.entryFeeCents / 100)}`,
    photo: t.coverImgUrl ?? FALLBACK_TOURNEY_PHOTO,
    logoLines: [words.slice(0, mid).join(' '), words.slice(mid).join(' ')],
    primaryAction: t.status === 'filling_fast' ? 'hold' as const : 'view' as const,
  };
}

export function TournamentTrendingCard({ item, onSave, saved, registered }: {
  item: TrendingTournament; onSave: () => void; saved: boolean; registered?: boolean;
}) {
  return (
    <TouchableOpacity
      style={tc.card}
      activeOpacity={0.88}
      onPress={() => router.push(`/tournament/${item.id}` as never)}
    >
      <View style={tc.info}>
        {/* Top row: type label left, verified badge right — the cl.topRow
            pattern. Pairing them here frees the row the badge used to own,
            which this card needs now that it carries four meta lines. */}
        <View style={tc.topRow}>
          <Text style={tc.typeText}>TOURNAMENT</Text>
          {item.verified && (
            <View style={tc.verifiedRow}>
              <Ionicons name="checkmark-circle" size={12} color="#3B82F6" />
              <Text style={tc.verifiedText}>Verified Director</Text>
            </View>
          )}
        </View>

        <View style={tc.nameRow}>
          <Text style={tc.name}>{item.name}</Text>
          <TouchableOpacity onPress={onSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={18} color={saved ? '#FF6B6B' : colors.textSub} />
          </TouchableOpacity>
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
            <Text style={[tc.statNum, { color: colors.gold }]}>{item.pctFilled}%</Text>
            <Text style={tc.statLabel}>Filled</Text>
          </View>
        </View>

        {/* Format pill, shaped like cl.gameTypePill on the community cards.
            Hidden when neither the divisions nor the column say anything. */}
        {!!item.formats && (
          <View style={tc.formatPill}>
            <Text style={tc.formatPillText} numberOfLines={1}>{item.formats}</Text>
          </View>
        )}

        {/* Meta rows mirror CommunityCard: gold icon at 14, 15pt label. */}
        <View style={tc.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.gold} />
          <Text style={tc.metaText}>{item.dates}</Text>
        </View>
        {/* Omitted entirely when the director set no start time, rather than
            showing a placeholder or a fabricated default. */}
        {!!item.time && (
          <View style={tc.metaRow}>
            <Ionicons name="time-outline" size={14} color={colors.gold} />
            <Text style={tc.metaText}>{item.time}</Text>
          </View>
        )}
        {!!item.venue && (
          <View style={tc.metaRow}>
            <Ionicons name="business-outline" size={14} color={colors.gold} />
            <Text style={tc.metaText} numberOfLines={1}>{item.venue}</Text>
          </View>
        )}
        <View style={tc.metaRow}>
          <Ionicons name="location-outline" size={14} color={colors.gold} />
          <Text style={tc.metaText}>{item.city}</Text>
        </View>
        {!!item.skill && (
          <View style={tc.metaRow}>
            <Ionicons name="speedometer-outline" size={14} color={colors.gold} />
            <Text style={tc.metaText}>{item.skill}</Text>
          </View>
        )}

        {/* Fill bar, no label: Players / Hold Spots / % Filled sit in the stats
            block directly above, so a trailing "N left" would restate two of
            them. The bar is here for the colour, not the number. */}
        {/* capacity is players + holdSpots: the mapper derives holdSpots as
            drawSize - spotsFilled, so the two sum back to the draw size, which
            the trending item does not carry directly. */}
        <FillBar filled={item.players} capacity={item.players + item.holdSpots} style={tc.fillBar} />

        <View style={tc.btns}>
          {/* `registered` suppresses both entry CTAs. In the original this
              button was unconditional and only Register/View alternated, so a
              tournament the viewer had already entered still offered to hold
              them a spot. */}
          {!registered && (
          <View style={tc.btnRow}>
            <TouchableOpacity
              style={tc.holdBtn}
              activeOpacity={0.85}
              onPress={() => router.push({
                pathname: `/tournament/${item.id}/select-division` as never,
                params: { intent: 'hold' },
              } as never)}
            >
              <Ionicons name="hand-left-outline" size={15} color={colors.gold} />
              <Text style={tc.holdBtnLabel} numberOfLines={1}>Hold My Spot · {item.holdFee}</Text>
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
          )}
          {(registered || item.primaryAction !== 'hold') && (
            <TouchableOpacity
              style={tc.viewTournBtn}
              activeOpacity={0.85}
              onPress={() => router.push(`/tournament/${item.id}` as never)}
            >
              <Text style={tc.viewTournText}>View Tournament</Text>
              <Ionicons name="arrow-forward" size={12} color={colors.navy} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const tc = StyleSheet.create({
  // Column card matching CommunityCard (cl.card): same radius, border and
  // background, no photo. The hero image and its gradient were dropped so the
  // tournament listing reads as the community event listing does.
  card: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
    marginHorizontal: 16, marginBottom: 12,
  },
  // Mirrors cl.typeText -- plain gold label, deliberately not a pill, because
  // COMMUNITY PLAY is not one either.
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  typeText: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  badge: {
    position: 'absolute', top: 10, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  badgeGold:  { backgroundColor: colors.gold },
  badgeGreen: { backgroundColor: colors.success },
  badgeText:  { color: colors.navy, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  miniLogo: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(10,18,40,0.85)',
    borderRadius: 6, padding: 5, alignItems: 'center',
  },
  miniLogoText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, lineHeight: 10 },

  info:        { padding: 16, gap: 4 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  // Matches cl.name: uppercase, 22/26. flex + marginRight stay because this
  // title shares its row with the save heart, which cl.name does not.
  name: {
    color: colors.navy, fontSize: 22, fontWeight: '800', lineHeight: 26,
    textTransform: 'uppercase', flex: 1, marginRight: 8,
  },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  verifiedText:{ color: '#3B82F6', fontSize: 11, fontWeight: '600' },

  // Tinted block so the three figures read as one unit. The border alone was
  // not enough separation: the card is colors.bg, so an unfilled block was white on
  // white with only a hairline holding it. colors.page is the same tint the
  // community card's chips use against the same background.
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.page,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 10,
    marginBottom: 10,
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statNum:     { color: colors.navy, fontSize: 15, fontWeight: '800' },
  statLabel:   { color: colors.textSub, fontSize: 11 },
  statDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 8 },

  fillBar: { marginTop: 4, marginBottom: 10 },
  formatPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.goldBg, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
    marginBottom: 8,
  },
  formatPillText: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  // Mirrors cl.meta / cl.metaText.
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  metaText: { color: '#000000', fontSize: 15, fontWeight: '500', flex: 1 },

  btns:   { gap: 6 },
  btnRow: { flexDirection: 'row', gap: 6 },
  holdBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.gold, borderRadius: 10,
    paddingVertical: 7,
  },
  holdBtnLabel: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  registerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 7,
  },
  registerLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  viewTournBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
    paddingVertical: 7,
  },
  viewTournText: { color: colors.navy, fontSize: 13, fontWeight: '700' },
});
