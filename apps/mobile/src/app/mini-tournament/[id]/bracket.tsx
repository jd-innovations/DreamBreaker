import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { StatusChip } from '@/components/StatusChip';
import { PickleballIcon } from '@/components';
import { getMiniTournament } from '@/lib/miniTournamentStore';
import { getBracket, setBracket, completedMatchCount, autoAdvanceByes } from '@/lib/bracketStore';
import { updateTournamentStatus } from '@/lib/miniTournamentStore';
import { useSupportContext } from '@/lib/support/supportContext';
import { fetchMiniTournamentMatches, sbMatchesToBracket } from '@/lib/supabase/miniTournament';
import { fetchPlayEventById } from '@/lib/supabase/playEvents';
import type { BMatch, BPlayer, BTeam, BTeamPlayer, BParticipant, MatchStatus } from '@/lib/bracketTypes';
import { isTeam } from '@/lib/bracketTypes';

// ─── Theme ──────────────────────────────────────────────────────────────────────

const L = {
  navy:       colors.navy,
  gold:       colors.gold,
  goldBg:     colors.goldBg,
  goldLight:  colors.goldLight,
  goldBorder: colors.goldBorder,
  text:       colors.text,
  textSub:    colors.textSub,
  bg:         colors.bg,
  page:       colors.page,
  border:     colors.border,
  white:      colors.white,
  success:    colors.success,
  danger:     colors.danger,
};

// ─── Mock data ───────────────────────────────────────────────────────────────────

// Full 32-player pool. Subsets are used for 4 / 8 / 16 / 32-player brackets.
const PLAYER_POOL: Omit<BPlayer, 'seed'>[] = [
  { id: 'p1',  name: 'Sarah M.',   dupr: '4.2', city: 'Sarasota',      avatarInitials: 'SM' },
  { id: 'p2',  name: 'Jake T.',    dupr: '4.1', city: 'Tampa',         avatarInitials: 'JT' },
  { id: 'p3',  name: 'Maria L.',   dupr: '4.0', city: 'Orlando',       avatarInitials: 'ML' },
  { id: 'p4',  name: 'Chris R.',   dupr: '3.9', city: 'Naples',        avatarInitials: 'CR' },
  { id: 'p5',  name: 'Emma D.',    dupr: '3.8', city: 'Bradenton',     avatarInitials: 'ED' },
  { id: 'p6',  name: 'Tyler K.',   dupr: '3.8', city: 'Venice',        avatarInitials: 'TK' },
  { id: 'p7',  name: 'Priya S.',   dupr: '3.7', city: 'St. Pete',      avatarInitials: 'PS' },
  { id: 'p8',  name: 'Marcus B.',  dupr: '3.7', city: 'Clearwater',    avatarInitials: 'MB' },
  { id: 'p9',  name: 'Olivia H.',  dupr: '3.6', city: 'Sarasota',      avatarInitials: 'OH' },
  { id: 'p10', name: 'Devon W.',   dupr: '3.6', city: 'Fort Myers',    avatarInitials: 'DW' },
  { id: 'p11', name: 'Rachel C.',  dupr: '3.5', city: 'Lakeland',      avatarInitials: 'RC' },
  { id: 'p12', name: 'Aiden F.',   dupr: '3.5', city: 'Tampa',         avatarInitials: 'AF' },
  { id: 'p13', name: 'Zoe P.',     dupr: '3.5', city: 'Orlando',       avatarInitials: 'ZP' },
  { id: 'p14', name: 'Nathan G.',  dupr: '3.4', city: 'Bradenton',     avatarInitials: 'NG' },
  { id: 'p15', name: 'Lily X.',    dupr: '3.4', city: 'Naples',        avatarInitials: 'LX' },
  { id: 'p16', name: 'Cole J.',    dupr: '3.3', city: 'Sarasota',      avatarInitials: 'CJ' },
  { id: 'p17', name: 'Maya R.',    dupr: '3.3', city: 'St. Pete',      avatarInitials: 'MR' },
  { id: 'p18', name: 'Derek S.',   dupr: '3.2', city: 'Tampa',         avatarInitials: 'DS' },
  { id: 'p19', name: 'Ava K.',     dupr: '3.2', city: 'Clearwater',    avatarInitials: 'AK' },
  { id: 'p20', name: 'Logan T.',   dupr: '3.1', city: 'Fort Myers',    avatarInitials: 'LT' },
  { id: 'p21', name: 'Chloe M.',   dupr: '3.1', city: 'Venice',        avatarInitials: 'CM' },
  { id: 'p22', name: 'Ryan B.',    dupr: '3.0', city: 'Orlando',       avatarInitials: 'RB' },
  { id: 'p23', name: 'Nadia F.',   dupr: '3.0', city: 'Sarasota',      avatarInitials: 'NF' },
  { id: 'p24', name: 'Ethan W.',   dupr: '3.0', city: 'Bradenton',     avatarInitials: 'EW' },
  { id: 'p25', name: 'Sofia G.',   dupr: '2.9', city: 'Tampa',         avatarInitials: 'SG' },
  { id: 'p26', name: 'Liam C.',    dupr: '2.9', city: 'Lakeland',      avatarInitials: 'LC' },
  { id: 'p27', name: 'Hana P.',    dupr: '2.8', city: 'Naples',        avatarInitials: 'HP' },
  { id: 'p28', name: 'Miles O.',   dupr: '2.8', city: 'St. Pete',      avatarInitials: 'MO' },
  { id: 'p29', name: 'Isla V.',    dupr: '2.7', city: 'Clearwater',    avatarInitials: 'IV' },
  { id: 'p30', name: 'Owen H.',    dupr: '2.7', city: 'Fort Myers',    avatarInitials: 'OH' },
  { id: 'p31', name: 'Jade N.',    dupr: '2.6', city: 'Venice',        avatarInitials: 'JN' },
  { id: 'p32', name: 'Kai A.',     dupr: '2.6', city: 'Orlando',       avatarInitials: 'KA' },
];

const BYE_PLAYER: BPlayer = {
  id: 'bye', name: 'BYE', seed: 0,
  dupr: '—', city: '—', avatarInitials: '—', isBye: true,
};

// ─── Team mock data (Mixed Doubles) ─────────────────────────────────────────────

function tp(id: string, name: string, dupr: number, gender: 'M' | 'F'): BTeamPlayer {
  const parts = name.split(' ');
  return { id, name, dupr, gender, avatarInitials: (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase() };
}

const TEAM_POOL: Omit<BTeam, 'seed'>[] = [
  { type: 'team', id: 't1',  name: 'Sarah M. / Jake T.',    avgDupr: 4.15, players: [tp('tp1a','Sarah M.',4.2,'F'), tp('tp1b','Jake T.',4.1,'M')] },
  { type: 'team', id: 't2',  name: 'Maria L. / Chris R.',   avgDupr: 3.95, players: [tp('tp2a','Maria L.',4.0,'F'), tp('tp2b','Chris R.',3.9,'M')] },
  { type: 'team', id: 't3',  name: 'Emma D. / Tyler K.',    avgDupr: 3.80, players: [tp('tp3a','Emma D.',3.8,'F'),  tp('tp3b','Tyler K.',3.8,'M')] },
  { type: 'team', id: 't4',  name: 'Priya S. / Marcus B.',  avgDupr: 3.70, players: [tp('tp4a','Priya S.',3.7,'F'), tp('tp4b','Marcus B.',3.7,'M')] },
  { type: 'team', id: 't5',  name: 'Olivia H. / Devon W.',  avgDupr: 3.60, players: [tp('tp5a','Olivia H.',3.6,'F'),tp('tp5b','Devon W.',3.6,'M')] },
  { type: 'team', id: 't6',  name: 'Rachel C. / Aiden F.',  avgDupr: 3.50, players: [tp('tp6a','Rachel C.',3.5,'F'),tp('tp6b','Aiden F.',3.5,'M')] },
  { type: 'team', id: 't7',  name: 'Zoe P. / Nathan G.',    avgDupr: 3.45, players: [tp('tp7a','Zoe P.',3.5,'F'),   tp('tp7b','Nathan G.',3.4,'M')] },
  { type: 'team', id: 't8',  name: 'Lily X. / Cole J.',     avgDupr: 3.35, players: [tp('tp8a','Lily X.',3.4,'F'),  tp('tp8b','Cole J.',3.3,'M')] },
  { type: 'team', id: 't9',  name: 'Maya R. / Derek S.',    avgDupr: 3.25, players: [tp('tp9a','Maya R.',3.3,'F'),  tp('tp9b','Derek S.',3.2,'M')] },
  { type: 'team', id: 't10', name: 'Ava K. / Logan T.',     avgDupr: 3.15, players: [tp('tp10a','Ava K.',3.2,'F'),  tp('tp10b','Logan T.',3.1,'M')] },
  { type: 'team', id: 't11', name: 'Chloe M. / Ryan B.',    avgDupr: 3.05, players: [tp('tp11a','Chloe M.',3.1,'F'),tp('tp11b','Ryan B.',3.0,'M')] },
  { type: 'team', id: 't12', name: 'Nadia F. / Ethan W.',   avgDupr: 3.00, players: [tp('tp12a','Nadia F.',3.0,'F'),tp('tp12b','Ethan W.',3.0,'M')] },
  { type: 'team', id: 't13', name: 'Sofia G. / Liam C.',    avgDupr: 2.95, players: [tp('tp13a','Sofia G.',2.9,'F'),tp('tp13b','Liam C.',2.9,'M')] },
  { type: 'team', id: 't14', name: 'Hana P. / Miles O.',    avgDupr: 2.85, players: [tp('tp14a','Hana P.',2.8,'F'), tp('tp14b','Miles O.',2.8,'M')] },
  { type: 'team', id: 't15', name: 'Isla V. / Owen H.',     avgDupr: 2.75, players: [tp('tp15a','Isla V.',2.7,'F'), tp('tp15b','Owen H.',2.7,'M')] },
  { type: 'team', id: 't16', name: 'Jade N. / Kai A.',      avgDupr: 2.65, players: [tp('tp16a','Jade N.',2.6,'F'), tp('tp16b','Kai A.',2.6,'M')] },
];

const BYE_TEAM: BTeam = {
  type: 'team', id: 'bye-team', seed: 0,
  name: 'BYE', avgDupr: 0,
  players: [tp('bye-p1','BYE',0,'M'), tp('bye-p2','BYE',0,'M')],
  isBye: true,
};

// Builds a seeded BPlayer list of size `bracketSize` from the pool,
// padding with BYE entries if playerCount < bracketSize.
function buildSeededPlayers(playerCount: number): BPlayer[] {
  const bracketSize = nextPowerOfTwo(playerCount);
  const players: BPlayer[] = PLAYER_POOL.slice(0, playerCount).map((p, i) => ({
    ...p, seed: i + 1,
  }));
  while (players.length < bracketSize) {
    players.push({ ...BYE_PLAYER, id: `bye-${players.length}`, seed: players.length + 1 });
  }
  return players;
}

function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Recursively builds the bracket position order for any power-of-2 size.
// e.g. n=16 → [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
function bracketPositions(n: number): number[] {
  if (n === 2) return [1, 2];
  const prev = bracketPositions(n / 2);
  return prev.flatMap(seed => [seed, n + 1 - seed]);
}

const COURTS  = ['Court 1', 'Court 2', 'Court 3', 'Court 4'];
const ROUND_TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM'];

function buildBracket(playerCount = 16): BMatch[][] {
  const players = buildSeededPlayers(playerCount);
  const bracketSize = players.length;
  const numRounds = Math.log2(bracketSize);
  const positions = bracketPositions(bracketSize);

  const rounds: BMatch[][] = [];

  // Round 1 — pair up bracketPositions
  const r1: BMatch[] = [];
  for (let i = 0; i < positions.length; i += 2) {
    const p1 = players[positions[i] - 1];
    const p2 = players[positions[i + 1] - 1];
    r1.push({
      id:       `r1-${i / 2}`,
      roundIdx: 0,
      matchIdx: i / 2,
      player1:  p1.isBye ? null : p1,
      player2:  p2.isBye ? null : p2,
      court:    COURTS[(i / 2) % 4],
      time:     ROUND_TIMES[0],
      status:   'pending',
    });
  }
  rounds.push(r1);

  // Subsequent rounds — TBD slots
  for (let r = 1; r < numRounds; r++) {
    const matchCount = bracketSize / Math.pow(2, r + 1);
    rounds.push(
      Array.from({ length: matchCount }, (_, i) => ({
        id:       `r${r + 1}-${i}`,
        roundIdx: r,
        matchIdx: i,
        player1:  null,
        player2:  null,
        court:    COURTS[i % 4],
        time:     ROUND_TIMES[Math.min(r, ROUND_TIMES.length - 1)],
        status:   'pending' as MatchStatus,
      })),
    );
  }

  return rounds;
}

function buildTeamBracket(teamCount = 8): BMatch[][] {
  const bracketSize = nextPowerOfTwo(teamCount);
  const teams: BTeam[] = TEAM_POOL.slice(0, teamCount).map((t, i) => ({ ...t, seed: i + 1 }));
  while (teams.length < bracketSize) {
    teams.push({ ...BYE_TEAM, id: `bye-team-${teams.length}`, seed: teams.length + 1 });
  }
  const positions = bracketPositions(bracketSize);
  const rounds: BMatch[][] = [];

  const r1: BMatch[] = [];
  for (let i = 0; i < positions.length; i += 2) {
    const t1 = teams[positions[i] - 1];
    const t2 = teams[positions[i + 1] - 1];
    r1.push({
      id: `r1-${i / 2}`, roundIdx: 0, matchIdx: i / 2,
      player1: t1.isBye ? null : t1,
      player2: t2.isBye ? null : t2,
      court: COURTS[(i / 2) % 4],
      time: ROUND_TIMES[0],
      status: 'pending',
    });
  }
  rounds.push(r1);

  const numRounds = Math.log2(bracketSize);
  for (let r = 1; r < numRounds; r++) {
    const matchCount = bracketSize / Math.pow(2, r + 1);
    rounds.push(
      Array.from({ length: matchCount }, (_, i) => ({
        id: `r${r + 1}-${i}`, roundIdx: r, matchIdx: i,
        player1: null, player2: null,
        court: COURTS[i % 4],
        time: ROUND_TIMES[Math.min(r, ROUND_TIMES.length - 1)],
        status: 'pending' as MatchStatus,
      })),
    );
  }
  return rounds;
}

// ─── Constants ───────────────────────────────────────────────────────────────────

function getRoundLabel(idx: number, totalRounds: number): string {
  // Offset from end so Final is always the last round label
  const fromEnd = totalRounds - 1 - idx;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round ${idx + 1}`;
}
function getRoundShort(idx: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - idx;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'SF';
  if (fromEnd === 2) return 'QF';
  return `R${idx + 1}`;
}

type RoundState = 'completed' | 'active' | 'locked';

function getRoundState(bracket: BMatch[][], roundIdx: number): RoundState {
  const round = bracket[roundIdx];
  if (!round || round.length === 0) return 'locked';
  const allDone = round.every(m => m.status === 'completed');
  if (allDone) return 'completed';
  // Active = first round that isn't completed (all prior rounds must be complete)
  const prevAllDone = bracket.slice(0, roundIdx).every(r =>
    r.every(m => m.status === 'completed'),
  );
  return prevAllDone ? 'active' : 'locked';
}

// Index of the first non-completed round (-1 if all done)
function getActiveRoundIdx(bracket: BMatch[][]): number {
  return bracket.findIndex(r => !r.every(m => m.status === 'completed'));
}
const MATCH_W      = 152;
const COL_GAP      = 20;
const COL_W        = MATCH_W + COL_GAP;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENU_ITEMS = [
  { id: 'results',  label: 'View Results',            icon: 'trophy-outline' },
  { id: 'share',    label: 'Share Bracket',           icon: 'share-outline' },
  { id: 'export',   label: 'Export Bracket',          icon: 'download-outline' },
  { id: 'settings', label: 'Tournament Settings',     icon: 'settings-outline' },
  { id: 'back',     label: 'Return to Command Center', icon: 'arrow-back-outline' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────────

function PlayerRow({
  player, isWinner, isLoser, isTop, sourceName,
}: {
  player: BPlayer | null;
  isWinner: boolean;
  isLoser: boolean;
  isTop: boolean;
  sourceName?: string;
}) {
  const isTBD = player === null;
  return (
    <View style={[pr.row, !isTop && pr.borderTop, isWinner && pr.rowWinner, isLoser && pr.rowLoser]}>
      {/* Avatar / seed circle */}
      <View style={[pr.avatar, isTBD && pr.avatarTbd, isWinner && pr.avatarWinner]}>
        <Text style={[pr.avatarText, isWinner && pr.avatarTextWinner]}>
          {isTBD ? '→' : player!.avatarInitials}
        </Text>
      </View>

      {/* Name + meta */}
      <View style={pr.body}>
        <Text style={[pr.name, isTBD && pr.nameTbd, isWinner && pr.nameWinner]} numberOfLines={1}>
          {isTBD ? (sourceName ?? 'TBD') : player!.name}
        </Text>
        {isTBD && sourceName && (
          <Text style={pr.metaTbd} numberOfLines={1}>Winner advances</Text>
        )}
        {!isTBD && !player!.isBye && (
          <Text style={pr.meta} numberOfLines={1}>
            {player!.dupr} DUPR · {player!.city}
          </Text>
        )}
      </View>

      {/* Seed badge */}
      {!isTBD && !player!.isBye && (
        <View style={[pr.seedWrap, isWinner && pr.seedWrapWinner]}>
          <Text style={[pr.seed, isWinner && pr.seedWinner]}>{player!.seed}</Text>
        </View>
      )}

      {isWinner && <Ionicons name="checkmark-circle" size={13} color={L.gold} />}
    </View>
  );
}

const pr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 8, paddingVertical: 7, minHeight: 40,
  },
  borderTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border },
  rowWinner: { backgroundColor: L.goldLight },
  rowLoser: { opacity: 0.45 },

  avatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: L.page,
    borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarTbd: { backgroundColor: L.page, borderColor: L.border, borderStyle: 'dashed' },
  avatarWinner: { backgroundColor: L.goldBg, borderColor: L.goldBorder },
  avatarText: { fontSize: 8, fontWeight: '800', color: L.textSub },
  avatarTextWinner: { color: L.gold },

  body: { flex: 1, minWidth: 0 },
  name: { fontSize: text.caption.size, fontWeight: '500', color: L.navy },
  nameTbd: { color: L.textSub, fontStyle: 'italic', fontWeight: '400', fontSize: 11 },
  nameWinner: { fontWeight: '800' },
  meta: { fontSize: 9, color: L.textSub, marginTop: 1 },
  metaTbd: { fontSize: 9, color: L.goldBorder, marginTop: 1, fontStyle: 'italic' },

  seedWrap: {
    width: 15, height: 15, borderRadius: 7.5,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  seedWrapWinner: { backgroundColor: L.goldBg, borderColor: L.goldBorder },
  seed: { fontSize: 7, fontWeight: '800', color: L.textSub },
  seedWinner: { color: L.gold },
});

// ─── TeamRow ──────────────────────────────────────────────────────────────────────

function TeamAvatars({ team, isWinner }: { team: BTeam; isWinner: boolean }) {
  return (
    <View style={tr.wrap}>
      <View style={[tr.bubble, isWinner && tr.bubbleWinner]}>
        <Text style={[tr.bubbleText, isWinner && tr.bubbleTextWinner]}>{team.players[0].avatarInitials}</Text>
      </View>
      <View style={[tr.bubble, tr.bubble2, isWinner && tr.bubbleWinner]}>
        <Text style={[tr.bubbleText, isWinner && tr.bubbleTextWinner]}>{team.players[1].avatarInitials}</Text>
      </View>
    </View>
  );
}

function TeamRow({
  team, isWinner, isLoser, isTop, sourceName,
}: {
  team: BTeam | null;
  isWinner: boolean;
  isLoser: boolean;
  isTop: boolean;
  sourceName?: string;
}) {
  const isTBD = team === null;
  return (
    <View style={[pr.row, !isTop && pr.borderTop, isWinner && pr.rowWinner, isLoser && pr.rowLoser]}>
      {isTBD ? (
        <View style={[pr.avatar, pr.avatarTbd]}>
          <Text style={pr.avatarText}>→</Text>
        </View>
      ) : (
        <TeamAvatars team={team!} isWinner={isWinner} />
      )}

      <View style={pr.body}>
        <Text style={[pr.name, isTBD && pr.nameTbd, isWinner && pr.nameWinner]} numberOfLines={1}>
          {isTBD ? (sourceName ?? 'TBD') : team!.name}
        </Text>
        {isTBD && sourceName && <Text style={pr.metaTbd}>Winner advances</Text>}
        {!isTBD && <Text style={pr.meta}>Avg {team!.avgDupr.toFixed(1)} DUPR</Text>}
      </View>

      {!isTBD && !team!.isBye && (
        <View style={[pr.seedWrap, isWinner && pr.seedWrapWinner]}>
          <Text style={[pr.seed, isWinner && pr.seedWinner]}>{team!.seed}</Text>
        </View>
      )}

      {isWinner && <Ionicons name="checkmark-circle" size={13} color={L.gold} />}
    </View>
  );
}

const tr = StyleSheet.create({
  wrap: { width: 34, height: 28, position: 'relative', flexShrink: 0 },
  bubble: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: L.page, borderWidth: 1, borderColor: L.border,
    alignItems: 'center', justifyContent: 'center',
    position: 'absolute', top: 0, left: 0,
  },
  bubble2: { top: 8, left: 12 },
  bubbleWinner: { backgroundColor: L.goldBg, borderColor: L.goldBorder },
  bubbleText: { fontSize: 6, fontWeight: '800', color: L.textSub },
  bubbleTextWinner: { color: L.gold },
});

function MatchCard({
  match, matchIdx, totalRounds, tournamentId, isTeamBracket,
}: {
  match: BMatch;
  matchIdx: number;
  totalRounds: number;
  tournamentId: string;
  isTeamBracket: boolean;
}) {
  const winnerId  = match.winnerId;
  const roundIdx  = match.roundIdx;
  const isR1      = roundIdx === 0;
  const completed = match.status === 'completed';

  // Progression source labels for future-round TBD slots
  const prevShort = !isR1 ? getRoundShort(roundIdx - 1, totalRounds) : '';
  const p1FeedIdx = matchIdx * 2 + 1;
  const p2FeedIdx = matchIdx * 2 + 2;
  const p1Source  = !isR1 && match.player1 === null ? `${prevShort} · M${p1FeedIdx}` : undefined;
  const p2Source  = !isR1 && match.player2 === null ? `${prevShort} · M${p2FeedIdx}` : undefined;

  const hasPlayers = match.player1 !== null && match.player2 !== null;
  const chipLabel: string = completed ? 'Completed' : hasPlayers ? 'Scheduled' : 'Pending';
  const chipVariant = (completed ? 'green' : hasPlayers ? 'gold' : 'gray') as 'green' | 'gold' | 'gray';
  const canEnter = hasPlayers && !completed
    && !match.player1!.isBye && !match.player2!.isBye;

  function handleCtaPress() {
    if (!canEnter) return;
    router.push(`/mini-tournament/${tournamentId}/score-entry?matchId=${match.id}` as never);
  }

  const p1IsWinner = completed && winnerId === match.player1?.id;
  const p1IsLoser  = completed && !!winnerId && winnerId !== match.player1?.id && match.player1 !== null;
  const p2IsWinner = completed && winnerId === match.player2?.id;
  const p2IsLoser  = completed && !!winnerId && winnerId !== match.player2?.id && match.player2 !== null;

  return (
    <View style={[mc.card, completed && mc.cardCompleted]}>
      <View style={mc.chipRow}>
        <StatusChip label={chipLabel} variant={chipVariant} />
      </View>

      {isTeamBracket ? (
        <>
          <TeamRow
            team={match.player1 as BTeam | null}
            isWinner={p1IsWinner} isLoser={p1IsLoser}
            isTop sourceName={p1Source}
          />
          <TeamRow
            team={match.player2 as BTeam | null}
            isWinner={p2IsWinner} isLoser={p2IsLoser}
            isTop={false} sourceName={p2Source}
          />
        </>
      ) : (
        <>
          <PlayerRow
            player={match.player1 as BPlayer | null}
            isWinner={p1IsWinner} isLoser={p1IsLoser}
            isTop sourceName={p1Source}
          />
          <PlayerRow
            player={match.player2 as BPlayer | null}
            isWinner={p2IsWinner} isLoser={p2IsLoser}
            isTop={false} sourceName={p2Source}
          />
        </>
      )}

      {/* Score display when completed */}
      {completed && match.score1 !== undefined && match.score2 !== undefined && (
        <View style={mc.scoreDisplay}>
          <Text style={mc.scoreDisplayText}>{match.score1} – {match.score2}</Text>
        </View>
      )}

      {(match.court || match.time) && !completed && (
        <View style={mc.meta}>
          {match.court && (
            <View style={mc.metaChip}>
              <PickleballIcon size={9} color={L.textSub} />
              <Text style={mc.metaText}>{match.court}</Text>
            </View>
          )}
          {match.time && (
            <View style={mc.metaChip}>
              <Ionicons name="time-outline" size={9} color={L.textSub} />
              <Text style={mc.metaText}>{match.time}</Text>
            </View>
          )}
        </View>
      )}

      {/* CTA row */}
      {!completed && (
        <TouchableOpacity
          style={[mc.scoreCta, !canEnter && mc.scoreCtaDisabled]}
          onPress={handleCtaPress}
          activeOpacity={canEnter ? 0.8 : 1}
        >
          <Text style={[mc.scoreCtaText, !canEnter && mc.scoreCtaTextDisabled]}>
            {canEnter ? 'Enter Scores' : 'Awaiting Previous Round'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const mc = StyleSheet.create({
  card: {
    width: MATCH_W,
    backgroundColor: L.bg,
    borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardCompleted: { borderColor: colors.success + '55' },
  chipRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 7, paddingTop: 5, paddingBottom: 1,
  },
  scoreDisplay: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    paddingVertical: 5, alignItems: 'center',
    backgroundColor: L.page,
  },
  scoreDisplayText: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy, letterSpacing: 0.5 },
  meta: {
    flexDirection: 'row', gap: 6, flexWrap: 'wrap',
    paddingHorizontal: 10, paddingBottom: 6, paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 9, color: L.textSub, fontWeight: '500' },
  scoreCta: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: L.border,
    paddingVertical: 7, alignItems: 'center',
    backgroundColor: L.page,
  },
  scoreCtaDisabled: { backgroundColor: L.page },
  scoreCtaText: { fontSize: 11, fontWeight: '700', color: L.gold },
  scoreCtaTextDisabled: { color: L.textSub, fontWeight: '500' },
});

// ─── Round list view (used when a specific round tab is active) ───────────────────

function RoundListView({
  matches, roundLabel, roundState, totalRounds, tournamentId, isTeamBracket,
}: {
  matches: BMatch[];
  roundLabel: string;
  roundState: RoundState;
  totalRounds: number;
  tournamentId: string;
  isTeamBracket: boolean;
}) {
  const stateLabel =
    roundState === 'completed' ? '✓ Complete' :
    roundState === 'active'    ? 'In Progress' :
    'Locked';
  const stateColor =
    roundState === 'completed' ? colors.success :
    roundState === 'active'    ? L.gold :
    L.textSub;
  return (
    <View style={rl.wrap}>
      <View style={rl.titleRow}>
        <Text style={rl.roundTitle}>{roundLabel}</Text>
        <Text style={[rl.stateLabel, { color: stateColor }]}>{stateLabel}</Text>
      </View>
      <Text style={rl.matchCount}>{matches.length} match{matches.length !== 1 ? 'es' : ''}</Text>
      {matches.map((m, i) => (
        <View key={m.id} style={rl.row}>
          <Text style={rl.matchNum}>Match {i + 1}</Text>
          <View style={rl.cardWrap}>
            <MatchCard match={m} matchIdx={i} totalRounds={totalRounds} tournamentId={tournamentId} isTeamBracket={isTeamBracket} />
          </View>
        </View>
      ))}
    </View>
  );
}

const rl = StyleSheet.create({
  wrap: { paddingTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  roundTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy },
  stateLabel: { fontSize: text.chipValue.size, fontWeight: '800' },
  matchCount: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginBottom: 16 },
  row: { marginBottom: 14 },
  matchNum: { fontSize: 11, fontWeight: '700', color: L.textSub, marginBottom: 6, letterSpacing: 0.3 },
  cardWrap: { alignSelf: 'flex-start' },
});

// ─── Horizontal bracket (All rounds) ────────────────────────────────────────────

function RoundStateTag({ state }: { state: RoundState }) {
  if (state === 'completed') {
    return (
      <View style={ba.stateTagCompleted}>
        <Ionicons name="checkmark" size={9} color={colors.success} />
        <Text style={ba.stateTagCompletedText}>Complete</Text>
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={ba.stateTagActive}>
        <Text style={ba.stateTagActiveText}>In Progress</Text>
      </View>
    );
  }
  return (
    <View style={ba.stateTagLocked}>
      <Ionicons name="lock-closed" size={8} color={L.textSub} />
      <Text style={ba.stateTagLockedText}>Locked</Text>
    </View>
  );
}

function BracketAllView({
  rounds, roundLabels, roundStates, tournamentId, bottomPad, isTeamBracket,
}: {
  rounds: BMatch[][];
  roundLabels: string[];
  roundStates: RoundState[];
  tournamentId: string;
  bottomPad: number;
  isTeamBracket: boolean;
}) {
  const totalRounds = rounds.length;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[ba.scroll, { paddingBottom: bottomPad }]}>
      {rounds.map((matches, rIdx) => (
        <View key={rIdx} style={ba.column}>
          <View style={ba.roundHeader}>
            <Text style={ba.roundLabel}>{roundLabels[rIdx]}</Text>
            <RoundStateTag state={roundStates[rIdx]} />
          </View>
          <View style={ba.matchesCol}>
            {matches.map((m, mIdx) => (
              <MatchCard key={m.id} match={m} matchIdx={mIdx} totalRounds={totalRounds} tournamentId={tournamentId} isTeamBracket={isTeamBracket} />
            ))}
          </View>
          {/* Connector line to next round */}
          {rIdx < rounds.length - 1 && (
            <View style={ba.connector} />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const ba = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.screenH,
  },
  column: {
    width: COL_W,
    marginRight: 4,
    position: 'relative',
  },
  roundHeader: {
    marginBottom: 10,
    paddingRight: COL_GAP,
  },
  roundLabel: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy, letterSpacing: 0.3 },
  roundSub: { fontSize: 11, color: L.textSub, marginTop: 1 },

  // Round state tags in column headers
  stateTagCompleted: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3,
    marginTop: 2,
  },
  stateTagCompletedText: { fontSize: 10, fontWeight: '700' as const, color: colors.success },
  stateTagActive: { marginTop: 2 },
  stateTagActiveText: { fontSize: 10, fontWeight: '700' as const, color: L.gold },
  stateTagLocked: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3,
    marginTop: 2,
  },
  stateTagLockedText: { fontSize: 10, color: L.textSub },
  matchesCol: {
    gap: 10,
    paddingRight: COL_GAP,
  },
  connector: {
    position: 'absolute',
    right: 0,
    top: 48,
    bottom: 0,
    width: COL_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Screen ──────────────────────────────────────────────────────────────────────

export default function BracketScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const tournamentId = id ?? 'unknown';
  const isSupabase   = UUID_RE.test(tournamentId);

  // ── Supabase metadata state ──
  const [sbTitle,    setSbTitle]    = useState<string | null>(null);
  const [sbLocation, setSbLocation] = useState<string | null>(null);
  const [sbDate,     setSbDate]     = useState<string | null>(null);
  const [sbMax,      setSbMax]      = useState<number>(16);
  const [sbCurrent,  setSbCurrent]  = useState<number>(0);
  const [loadingBracket, setLoadingBracket] = useState(isSupabase);

  // ── Local metadata (non-UUID path) ──
  const tournament = getMiniTournament();
  const title          = isSupabase ? (sbTitle    ?? 'Mini Tournament')      : (tournament?.title          ?? 'Mini Tournament');
  const tournamentType = 'Single Elimination'; // play_events doesn't store format
  const singlesOrDoubles = 'Singles';           // play_events doesn't store format

  useSupportContext({
    feature: 'tournament_bracket',
    entityType: 'mini_tournament',
    entityId: tournamentId,
    entityLabel: title,
    visibility: 'minimized',
  });
  const locationName   = isSupabase ? (sbLocation ?? '—')                    : (tournament?.locationName   ?? 'Lakewood Ranch Courts');
  const date           = isSupabase
    ? (sbDate ? new Date(sbDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—')
    : (tournament?.date ? new Date(tournament.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Jul 12');
  const maxPlayers     = isSupabase ? sbMax    : (tournament?.maxPlayers     ?? 16);
  const currentPlayers = isSupabase ? sbCurrent : (tournament?.currentPlayers ?? 16);

  const isTeamBracket = singlesOrDoubles !== 'Singles';
  const teamCount     = Math.floor(maxPlayers / 2);

  const [activeFilter, setActiveFilter] = useState(0);

  // ── Bracket state ──
  const [sbRounds,      setSbRounds]      = useState<BMatch[][]>([]);
  const [localBracket,  setLocalBracket]  = useState<BMatch[][]>(() => {
    if (isSupabase) return [];
    const stored = getBracket(tournamentId);
    if (stored) return stored;
    const raw   = isTeamBracket ? buildTeamBracket(teamCount) : buildBracket(maxPlayers);
    const fresh = autoAdvanceByes(raw);
    setBracket(tournamentId, fresh);
    return fresh;
  });

  const bracket: BMatch[][] = isSupabase ? sbRounds : localBracket;

  // ── Supabase fetch on mount ──
  useEffect(() => {
    if (!isSupabase) return;
    setLoadingBracket(true);
    Promise.all([
      fetchMiniTournamentMatches(tournamentId),
      fetchPlayEventById(tournamentId),
    ])
      .then(([rows, ev]) => {
        setSbRounds(sbMatchesToBracket(rows));
        const participantIds = new Set<string>();
        for (const m of rows) {
          if (m.player_a_id) participantIds.add(m.player_a_id);
          if (m.player_b_id) participantIds.add(m.player_b_id);
        }
        setSbCurrent(participantIds.size);
        if (ev) {
          setSbTitle(ev.name);
          setSbLocation(ev.venue_name ?? ev.location);
          setSbDate(ev.event_date);
          setSbMax(ev.max_players);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBracket(false));
  }, [tournamentId, isSupabase]);

  // Refresh from store/Supabase on focus; detect round completion to trigger toast.
  useFocusEffect(
    useCallback(() => {
      if (isSupabase) {
        Promise.all([
          fetchMiniTournamentMatches(tournamentId),
          fetchPlayEventById(tournamentId),
        ])
          .then(([rows, ev]) => {
            const rounds = sbMatchesToBracket(rows);
            const newActiveIdx = getActiveRoundIdx(rounds);
            const oldActiveIdx = prevActiveRoundRef.current;
            if (oldActiveIdx !== -2 && newActiveIdx !== oldActiveIdx) {
              const completedIdx   = oldActiveIdx >= 0 ? oldActiveIdx : 0;
              const completedLabel = getRoundLabel(completedIdx, rounds.length);
              const nextLabel      = newActiveIdx >= 0 && newActiveIdx < rounds.length
                ? getRoundLabel(newActiveIdx, rounds.length)
                : null;
              setCompletionToast({ completedLabel, nextLabel });
            }
            prevActiveRoundRef.current = newActiveIdx;
            setSbRounds(rounds);
            if (ev) {
              setSbTitle(ev.name);
              setSbLocation(ev.venue_name ?? ev.location);
              setSbDate(ev.event_date);
              setSbMax(ev.max_players);
            }
          })
          .catch(() => {});
        return;
      }

      const stored = getBracket(tournamentId);
      if (!stored) return;
      const newActiveIdx = getActiveRoundIdx(stored);
      const oldActiveIdx = prevActiveRoundRef.current;

      if (oldActiveIdx !== -2 && newActiveIdx !== oldActiveIdx) {
        const completedIdx   = oldActiveIdx === -2 ? 0 : oldActiveIdx;
        const completedLabel = getRoundLabel(completedIdx, stored.length);
        const nextLabel      = newActiveIdx >= 0 && newActiveIdx < stored.length
          ? getRoundLabel(newActiveIdx, stored.length)
          : null;
        setCompletionToast({ completedLabel, nextLabel });
      }

      prevActiveRoundRef.current = newActiveIdx;
      setLocalBracket(stored);

      const finalMatch = stored[stored.length - 1]?.[0];
      if (finalMatch?.status === 'completed' && finalMatch.winnerId) {
        updateTournamentStatus('completed');
      }
    }, [tournamentId, isSupabase]),
  );

  const totalRounds  = bracket.length;
  const roundLabels  = bracket.map((_, i) => getRoundLabel(i, totalRounds));
  const roundShorts  = bracket.map((_, i) => getRoundShort(i, totalRounds));
  const roundStates  = bracket.map((_, i) => getRoundState(bracket, i));
  const filterTabs   = ['All', ...roundShorts];

  // Generous bottom clearance: safe area + tab bar + browser chrome + breathing room.
  const BRACKET_BOTTOM_PAD = insets.bottom + 120;

  // Round completion toast
  const [completionToast, setCompletionToast] = useState<{
    completedLabel: string;
    nextLabel: string | null;
  } | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const prevActiveRoundRef = useRef<number>(-2); // -2 = uninitialized

  useEffect(() => {
    if (completionToast) {
      Animated.timing(toastAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      const t = setTimeout(() => {
        Animated.timing(toastAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true })
          .start(() => setCompletionToast(null));
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [completionToast]);

  // ── Context menu ──
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const menuOpacity     = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const menuScale       = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const backdropOpacity = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  function openMenu() {
    setMenuOpen(true);
    Animated.timing(menuAnim, {
      toValue: 1, duration: 160,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }

  function closeMenu(cb?: () => void) {
    Animated.timing(menuAnim, {
      toValue: 0, duration: 120,
      easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => { setMenuOpen(false); cb?.(); });
  }

  function handleMenuAction(menuId: string) {
    if (menuId === 'results') { closeMenu(() => router.push(`/mini-tournament/${tournamentId}/results` as never)); return; }
    if (menuId === 'share')   { closeMenu(handleShare); return; }
    if (menuId === 'back')    { closeMenu(() => router.back()); return; }
    if (menuId === 'cancel')  { closeMenu(handleCancel); return; }
    closeMenu();
  }

  async function handleShare() {
    try {
      await Share.share({ message: `Check out the bracket for "${title}" on Pickleball App!`, title });
    } catch { /* dismissed */ }
  }

  function handleCancel() {
    Alert.alert(
      'Cancel Mini Tournament?',
      'This action cannot be undone. Players will be notified.',
      [
        { text: 'Keep Tournament', style: 'cancel' },
        { text: 'Cancel Mini Tournament', style: 'destructive', onPress: () => { updateTournamentStatus('cancelled'); router.back(); } },
      ],
    );
  }

  // Which round (0-based) is active when filter is not "All"
  const filterRoundIdx = activeFilter - 1; // -1 when All

  if (loadingBracket) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSub }}>Loading bracket…</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={22} color={L.navy} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.headerSub}>Bracket</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.headerBtn} onPress={handleShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={22} color={L.navy} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerBtn} onPress={openMenu} activeOpacity={0.7}>
            <Ionicons name="ellipsis-horizontal" size={22} color={L.navy} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── TOURNAMENT SUMMARY CARD ── */}
      <View style={[s.summaryCard, { marginHorizontal: spacing.screenH }]}>
        <View style={s.summaryLeft}>
          <Text style={s.summaryTitle} numberOfLines={1}>{title}</Text>
          <View style={s.summaryMeta}>
            {isTeamBracket && (
              <>
                <Text style={s.summaryMetaText}>{singlesOrDoubles}</Text>
                <Text style={s.summaryDot}>·</Text>
              </>
            )}
            <Ionicons name="location-outline" size={12} color={L.textSub} />
            <Text style={s.summaryMetaText} numberOfLines={1}>{locationName}</Text>
            <Text style={s.summaryDot}>·</Text>
            <Ionicons name="calendar-outline" size={12} color={L.textSub} />
            <Text style={s.summaryMetaText}>{date}</Text>
          </View>
        </View>
        <View style={s.summaryRight}>
          <StatusChip label={tournamentType === 'Single Elimination' ? 'Elim.' : tournamentType} variant="navy" />
          <Text style={s.summaryPlayers}>
            {currentPlayers}/{maxPlayers} players{isTeamBracket ? ` · ${teamCount} teams` : ''}
          </Text>
        </View>
      </View>

      {/* ── BRACKET OVERVIEW PILLS ── */}
      <View style={s.overviewRow}>
        {isTeamBracket ? (
          <>
            <View style={s.overviewPill}>
              <Ionicons name="people-outline" size={14} color={L.gold} />
              <Text style={s.overviewVal}>{currentPlayers}</Text>
              <Text style={s.overviewLabel}>Players</Text>
            </View>
            <View style={s.overviewPill}>
              <Ionicons name="git-network-outline" size={14} color={L.gold} />
              <Text style={s.overviewVal}>{teamCount}</Text>
              <Text style={s.overviewLabel}>Teams</Text>
            </View>
            <View style={s.overviewPill}>
              <Ionicons name="layers-outline" size={14} color={L.gold} />
              <Text style={s.overviewVal}>{totalRounds}</Text>
              <Text style={s.overviewLabel}>Rounds</Text>
            </View>
          </>
        ) : (
          <>
            <View style={s.overviewPill}>
              <Ionicons name="people-outline" size={14} color={L.gold} />
              <Text style={s.overviewVal}>{currentPlayers}</Text>
              <Text style={s.overviewLabel}>Players</Text>
            </View>
            <View style={s.overviewPill}>
              <Ionicons name="git-network-outline" size={14} color={L.gold} />
              <Text style={s.overviewVal}>{currentPlayers}-Player</Text>
              <Text style={s.overviewLabel}>Bracket</Text>
            </View>
            <View style={s.overviewPill}>
              <Ionicons name="layers-outline" size={14} color={L.gold} />
              <Text style={s.overviewVal}>{totalRounds}</Text>
              <Text style={s.overviewLabel}>Rounds</Text>
            </View>
          </>
        )}
      </View>

      {/* ── ROUND FILTER TABS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterScroll}
        style={s.filterRow}
      >
        {filterTabs.map((tab, i) => {
          const isSelected = activeFilter === i;
          const rState: RoundState | null = i === 0 ? null : roundStates[i - 1];
          const isDone   = rState === 'completed';
          const isLocked = rState === 'locked';

          const pillStyle = isSelected
            ? [s.filterTab, s.filterTabActive]
            : isDone
              ? [s.filterTab, s.filterTabDone]
              : isLocked
                ? [s.filterTab, s.filterTabLocked]
                : [s.filterTab];

          const textStyle = isSelected
            ? [s.filterTabText, s.filterTabTextActive]
            : isDone
              ? [s.filterTabText, s.filterTabTextDone]
              : isLocked
                ? [s.filterTabText, s.filterTabTextLocked]
                : [s.filterTabText];

          return (
            <TouchableOpacity
              key={tab}
              style={pillStyle}
              onPress={() => setActiveFilter(i)}
              activeOpacity={0.75}
            >
              {isDone && !isSelected && (
                <Ionicons name="checkmark" size={12} color={colors.success} style={{ marginRight: 3 }} />
              )}
              <Text style={textStyle}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── STATUS BAR + CHAMPION BANNER ── */}
      {(() => {
        const done       = isSupabase
          ? bracket.flat().filter(m => m.status === 'completed').length
          : completedMatchCount(tournamentId);
        const finalMatch = bracket[totalRounds - 1]?.[0];
        const champion   = finalMatch?.status === 'completed' && finalMatch.winnerId
          ? (finalMatch.player1?.id === finalMatch.winnerId ? finalMatch.player1 : finalMatch.player2)
          : null;

        // Find last completed round and next active round for dynamic status text
        const lastCompletedIdx = (() => {
          let last = -1;
          for (let i = 0; i < totalRounds; i++) {
            if (roundStates[i] === 'completed') last = i;
          }
          return last;
        })();
        const activeRoundIdx = roundStates.indexOf('active');

        const barText = champion
          ? `Tournament Complete · ${champion.name} is Champion`
          : lastCompletedIdx >= 0 && activeRoundIdx >= 0
            ? `${getRoundLabel(lastCompletedIdx, totalRounds)} Complete · ${getRoundLabel(activeRoundIdx, totalRounds)} Ready`
            : done > 0
              ? `Tournament In Progress · ${done} Match${done !== 1 ? 'es' : ''} Complete`
              : `Tournament Ready · ${currentPlayers} Players · ${bracket[0]?.length ?? 0} R1 Matches Scheduled`;

        const barIsSuccess = champion !== null;
        return (
          <>
            <View style={[s.statusBar, barIsSuccess && s.statusBarChampion]}>
              <View style={[s.statusDot, barIsSuccess && s.statusDotGold]} />
              <Text style={s.statusText}>{barText}</Text>
            </View>

            {/* Champion banner — shown only when Final is complete */}
            {champion && (
              <View style={[s.championCard, { marginHorizontal: spacing.screenH }]}>
                <View style={s.championIconWrap}>
                  <Ionicons name="trophy" size={22} color={L.gold} />
                </View>
                <View style={s.championBody}>
                  <Text style={s.championLabel}>Champion</Text>
                  <Text style={s.championName}>{champion.name}</Text>
                  {finalMatch?.score1 !== undefined && finalMatch.score2 !== undefined && (
                    <Text style={s.championScore}>
                      Final: {finalMatch.score1} – {finalMatch.score2}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={s.viewResultsBtn}
                  onPress={() => router.push(`/mini-tournament/${tournamentId}/results` as never)}
                  activeOpacity={0.8}
                >
                  <Text style={s.viewResultsText}>Results</Text>
                  <Ionicons name="chevron-forward" size={13} color={L.gold} />
                </TouchableOpacity>
              </View>
            )}
          </>
        );
      })()}

      {/* ── ROUND COMPLETION TOAST ── */}
      {completionToast && (
        <Animated.View
          style={[s.toast, {
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          }]}
          pointerEvents="none"
        >
          <View style={s.toastIcon}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          </View>
          <View style={s.toastBody}>
            <Text style={s.toastTitle}>{completionToast.completedLabel} Complete</Text>
            {completionToast.nextLabel
              ? <Text style={s.toastSub}>{completionToast.nextLabel} Ready</Text>
              : <Text style={s.toastSub}>Tournament Complete</Text>
            }
          </View>
        </Animated.View>
      )}

      {/* ── BRACKET CONTENT ── */}
      {activeFilter === 0 ? (
        // All rounds — horizontal scrollable bracket
        <ScrollView
          style={s.bracketScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: BRACKET_BOTTOM_PAD, paddingTop: 12 }}
        >
          <BracketAllView
            rounds={bracket}
            roundLabels={roundLabels}
            roundStates={roundStates}
            tournamentId={tournamentId}
            bottomPad={BRACKET_BOTTOM_PAD}
            isTeamBracket={isTeamBracket}
          />
        </ScrollView>
      ) : (
        // Single round — vertical list
        <ScrollView
          style={s.bracketScroll}
          contentContainerStyle={[s.roundScroll, { paddingBottom: BRACKET_BOTTOM_PAD }]}
          showsVerticalScrollIndicator={false}
        >
          <RoundListView
            matches={bracket[filterRoundIdx] ?? []}
            roundLabel={roundLabels[filterRoundIdx] ?? ''}
            roundState={roundStates[filterRoundIdx] ?? 'locked'}
            totalRounds={totalRounds}
            tournamentId={tournamentId}
            isTeamBracket={isTeamBracket}
          />
        </ScrollView>
      )}

      {/* ── CONTEXT MENU ── */}
      {menuOpen && (
        <>
          <Animated.View
            style={[mm.backdrop, { opacity: backdropOpacity }]}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={[StyleSheet.absoluteFillObject, { zIndex: 30 }]}
            activeOpacity={1}
            onPress={() => closeMenu()}
          />
          <Animated.View
            style={[mm.popover, {
              top: insets.top + 52,
              right: 16,
              opacity: menuOpacity,
              transform: [{ scale: menuScale }],
            }]}
          >
            <View style={mm.caret} />
            {MENU_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[mm.row, i === 0 && mm.rowFirst]}
                onPress={() => handleMenuAction(item.id)}
                activeOpacity={0.7}
              >
                <View style={mm.iconWrap}>
                  <Ionicons name={item.icon as never} size={17} color={L.navy} />
                </View>
                <Text style={mm.rowLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={mm.divider} />
            <TouchableOpacity
              style={mm.row}
              onPress={() => handleMenuAction('cancel')}
              activeOpacity={0.7}
            >
              <View style={mm.iconWrap}>
                <Ionicons name="trash-outline" size={17} color={L.danger} />
              </View>
              <Text style={[mm.rowLabel, mm.rowLabelDanger]}>Cancel Tournament</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.page },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, height: 52, gap: 4,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: text.actionLarge.size, fontWeight: '800', color: L.navy },
  headerSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 2, flexShrink: 0 },

  // Summary card
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: L.bg,
    borderRadius: shape.panel,
    borderWidth: 1, borderColor: L.border,
    paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 6,
  },
  summaryLeft: { flex: 1 },
  summaryTitle: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy },
  summaryMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  summaryMetaText: { fontSize: 11, color: L.textSub },
  summaryDot: { color: L.border, fontSize: 11 },
  summaryRight: { alignItems: 'flex-end', gap: 3 },
  summaryPlayers: { fontSize: 10, color: L.textSub, fontWeight: '500' },

  // Overview pills
  overviewRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.screenH,
    marginBottom: 8,
    gap: 6,
  },
  overviewPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: L.bg,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: L.border,
    paddingVertical: 6, paddingHorizontal: 8,
  },
  overviewVal: { fontSize: text.chipValue.size, fontWeight: '800', color: L.navy },
  overviewLabel: { fontSize: 10, color: L.textSub },

  // Status bar
  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: spacing.screenH, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: L.goldLight,
    borderRadius: shape.cta,
    borderWidth: 1, borderColor: L.goldBorder,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: L.gold, flexShrink: 0 },
  statusDotGold: { backgroundColor: L.gold },
  statusText: { fontSize: text.caption.size, fontWeight: '500', color: L.navy, flex: 1 },
  statusBarChampion: { backgroundColor: L.goldBg, borderColor: L.goldBorder },

  // Round completion toast
  toast: {
    position: 'absolute',
    top: 0,
    left: spacing.screenH,
    right: spacing.screenH,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: L.bg,
    borderRadius: shape.panel,
    borderWidth: 1.5,
    borderColor: colors.success + '66',
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: colors.success,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  toastIcon: { flexShrink: 0 },
  toastBody: { flex: 1 },
  toastTitle: { fontSize: text.fieldLabel.size, fontWeight: '800', color: L.navy },
  toastSub: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 1 },

  // Champion banner
  championCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: L.goldBg,
    borderRadius: shape.panel,
    borderWidth: 2, borderColor: L.goldBorder,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 8,
    shadowColor: L.gold, shadowOpacity: 0.18,
    shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  championIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: L.goldLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  championBody: { flex: 1 },
  championLabel: { fontSize: text.cardLabel.size, fontWeight: '800', color: L.gold, letterSpacing: text.cardLabel.letterSpacing, textTransform: 'uppercase' },
  championName: { fontSize: text.titleSm.size, fontWeight: '800', color: L.navy, marginTop: 1 },
  championScore: { fontSize: text.caption.size, fontWeight: '500', color: L.textSub, marginTop: 2 },
  viewResultsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: shape.cta,
    borderWidth: 1.5, borderColor: L.goldBorder,
    backgroundColor: L.goldLight,
    flexShrink: 0,
  },
  viewResultsText: { fontSize: text.chipValue.size, fontWeight: '800', color: L.gold },

  // Filter tabs
  filterRow: { height: 50, flexShrink: 0, flexGrow: 0, marginBottom: 2 },
  filterScroll: { paddingHorizontal: spacing.screenH, gap: 8, paddingBottom: 6 },
  filterTab: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: shape.pill,
    borderWidth: 1.5, borderColor: L.border,
    backgroundColor: L.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabActive: { backgroundColor: L.navy, borderColor: L.navy },
  filterTabDone: {
    backgroundColor: colors.success + '14',
    borderColor: colors.success + '55',
  },
  filterTabLocked: { backgroundColor: L.page, borderColor: L.border },
  filterTabText: { fontSize: text.controlLabel.size, fontWeight: '700', color: L.textSub, lineHeight: 18 },
  filterTabTextActive: { color: L.white },
  filterTabTextDone: { color: colors.success },
  filterTabTextLocked: { color: L.textSub, opacity: 0.6 },

  // Bracket content scroll — flex: 1 so it fills remaining space instead of
  // expanding to BRACKET_H and overflowing the parent, which causes clipping.
  bracketScroll: { flex: 1 },

  // Round list scroll
  roundScroll: { paddingHorizontal: spacing.screenH, paddingTop: 16 },
});

// ─── Context menu styles ─────────────────────────────────────────────────────────

const mm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1228',
    zIndex: 30,
  },
  popover: {
    position: 'absolute',
    width: 252,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 5,
    zIndex: 31,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  caret: {
    position: 'absolute', top: -7, right: 13,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 8, marginHorizontal: 5,
    borderRadius: 11, height: 50,
  },
  rowFirst: { marginTop: 4 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: '#F3F6FC',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowLabel: { color: L.navy, fontSize: text.rowTitle.size, fontWeight: '700' },
  rowLabelDanger: { color: L.danger },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: L.border,
    marginHorizontal: 10, marginVertical: 3,
  },
});
