import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { formatParChange } from '@/lib/supabase/par';
import type { EventHistoryItem } from '@/lib/stats/eventHistory';

// A Quick Game or tournament in My Matches, beside the logged-session rows in
// (tabs)/stats.tsx. Same card shape as MatchHistoryRow so the list reads as one.

// event_date is a calendar date; new Date('yyyy-mm-dd') would parse it as UTC
// midnight and show the previous day west of Greenwich.
export function formatEventDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function parLine(item: EventHistoryItem): { label: string; rated: boolean } {
  if (item.kind === 'tournament') return { label: 'Tournament results don’t affect PAR yet.', rated: false };
  const change = formatParChange(item.parChange);
  if (change) return { label: `PAR impact ${change}`, rated: true };
  if (item.finished) return { label: 'Finished - these games didn’t change your PAR.', rated: false };
  return { label: 'PAR pending - rated when the organizer finishes the game.', rated: false };
}

export function EventHistoryRow({ item }: { item: EventHistoryItem }) {
  const par = parLine(item);
  const isQuick = item.kind === 'quick_game';

  function open() {
    router.push((isQuick ? `/quick-game/${item.id}/scores` : `/tournament/${item.id}`) as never);
  }

  return (
    <TouchableOpacity style={s.row} onPress={open} activeOpacity={0.75}>
      <View style={s.top}>
        <Text style={s.date}>{formatEventDate(item.date)}</Text>
        <View style={[s.chip, isQuick ? s.chipQuick : s.chipTournament]}>
          <Text style={[s.chipText, isQuick ? s.chipTextQuick : s.chipTextTournament]}>
            {isQuick ? 'QUICK GAME' : 'TOURNAMENT'}
          </Text>
        </View>
      </View>

      <Text style={s.title} numberOfLines={1}>{item.title}</Text>

      {!!item.location && (
        <View style={s.location}>
          <Ionicons name="location-outline" size={14} color={colors.textSub} />
          <Text style={s.locationText} numberOfLines={1}>{item.location}</Text>
        </View>
      )}

      <View style={s.metaRow}>
        <Text style={s.meta}>
          {item.games} {isQuick ? 'game' : 'match'}{item.games === 1 ? '' : isQuick ? 's' : 'es'}
        </Text>
        <View style={s.dot} />
        <Text style={s.meta}>{item.record.wins}-{item.record.losses} record</Text>
      </View>

      <View style={s.parLine}>
        <Ionicons
          name={par.rated ? 'trending-up-outline' : 'time-outline'}
          size={14}
          color={par.rated ? colors.gold : colors.textMuted}
        />
        <Text style={[s.parText, par.rated && s.parTextRated]} numberOfLines={2}>{par.label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.card,
    backgroundColor: colors.bg, padding: spacing.md, gap: 6,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { color: colors.text, fontSize: text.rowTitle.size, fontWeight: '700' },
  chip: { borderRadius: shape.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  chipQuick: { backgroundColor: colors.navy },
  chipTournament: { backgroundColor: colors.goldBg },
  chipText: { fontWeight: '800', letterSpacing: text.cardLabel.letterSpacing, fontSize: text.cardLabel.size },
  chipTextQuick: { color: colors.gold },
  chipTextTournament: { color: colors.gold },
  title: { color: colors.text, fontSize: text.body.size, fontWeight: '700' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationText: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted },
  parLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 3 },
  parText: { color: colors.textMuted, fontSize: text.caption.size, fontWeight: '500', flex: 1, lineHeight: 16 },
  parTextRated: { color: colors.gold, fontWeight: '800' },
});
