import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { spacing, useTheme, useThemedStyles, type ThemeRoles } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { useSession } from '@/hooks/useSession';
import { QuickGameEntryCard } from '@/components/QuickGameEntryCard';
import { completePlayEvent, fetchPlayEventWithOrganizer, type PlayEventWithOrganizer } from '@/lib/supabase/playEvents';
import { formatParChange } from '@/lib/supabase/par';
import {
  fetchQuickGamePlayers, fetchQuickGameMatches, recordQuickGame, updateQuickGame, deleteQuickGame,
  fetchMyQuickGameParChanges, reopenQuickGame, isQuickGameFinishedError,
  type QuickGameEntry, type QuickGameMatch, type QuickGamePlayer,
} from '@/lib/supabase/quickGameScores';

// Quick Game scores. The organizer records each game; everyone else reads.
// Results land in play_matches and count toward each claimed player's My Stats.
// Finishing locks the scores and rates them for PAR; Reopen undoes that.

const FINISHED_MESSAGE = 'This Quick Game is finished. Reopen it to change its scores.';

function errorMessage(e: unknown) {
  if (isQuickGameFinishedError(e)) return FINISHED_MESSAGE;
  return e instanceof Error ? e.message : 'Please try again.';
}

type Editing = { mode: 'new' } | { mode: 'edit'; match: QuickGameMatch } | null;

function matchToEntry(m: QuickGameMatch): QuickGameEntry {
  return {
    teamA: [m.player_a_id, m.player_a2_id].filter((x): x is string => !!x),
    teamB: [m.player_b_id, m.player_b2_id].filter((x): x is string => !!x),
    scoreA: m.score_a ?? 0,
    scoreB: m.score_b ?? 0,
  };
}

export default function QuickGameScoresScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const s = useThemedStyles(styles);
  const { roles: t, statusBarStyle } = useTheme();
  const { user } = useSession();

  const [event, setEvent] = useState<PlayEventWithOrganizer | null>(null);
  const [players, setPlayers] = useState<QuickGamePlayer[]>([]);
  const [matches, setMatches] = useState<QuickGameMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [myPar, setMyPar] = useState<Map<string, number>>(new Map());

  const isOrganizer = !!user && !!event && user.id === event.organizer_id;
  const finished = event?.status === 'completed';
  const cancelled = event?.status === 'cancelled';
  const canEdit = isOrganizer && !finished && !cancelled;
  const rosterIds = useMemo(() => players.map(p => p.id), [players]);
  const nameById = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const [ev, roster, games, par] = await Promise.all([
        fetchPlayEventWithOrganizer(id),
        fetchQuickGamePlayers(id, !!user),
        fetchQuickGameMatches(id),
        user ? fetchMyQuickGameParChanges(id, user.id) : Promise.resolve(new Map<string, number>()),
      ]);
      setEvent(ev);
      setPlayers(roster);
      setMatches(games);
      setMyPar(par);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Could not load scores.');
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSave(entry: QuickGameEntry) {
    if (!id || !editing) return;
    setSaving(true);
    try {
      if (editing.mode === 'new') await recordQuickGame(id, entry, rosterIds);
      else await updateQuickGame(editing.match.id, entry, rosterIds);
      setEditing(null);
      await load();
    } catch (e: unknown) {
      Alert.alert('Could not save game', errorMessage(e));
      if (isQuickGameFinishedError(e)) { setEditing(null); await load(); }
    } finally {
      setSaving(false);
    }
  }

  function handleFinish() {
    if (!id) return;
    Alert.alert(
      'Finish and rate?',
      'Scores will be locked, and every registered player’s PAR will update from these games.',
      [
        { text: 'Not Yet', style: 'cancel' },
        {
          text: 'Finish & Rate',
          onPress: async () => {
            setSaving(true);
            try {
              await completePlayEvent(id);
              await load();
            } catch (e: unknown) {
              Alert.alert('Could not finish', errorMessage(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  function handleReopen() {
    if (!id) return;
    Alert.alert(
      'Reopen this Quick Game?',
      'Its PAR changes are removed until you finish it again, and the scores can be edited.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: async () => {
            setSaving(true);
            try {
              await reopenQuickGame(id);
              await load();
            } catch (e: unknown) {
              Alert.alert('Could not reopen', errorMessage(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  function handleDelete(match: QuickGameMatch) {
    Alert.alert('Delete this game?', 'It will be removed from every player’s stats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deleteQuickGame(match.id);
            setEditing(null);
            await load();
          } catch (e: unknown) {
            Alert.alert('Could not delete game', errorMessage(e));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  function teamNames(ids: (string | null)[]) {
    return ids.filter((x): x is string => !!x).map(x => nameById.get(x) ?? 'Removed player').join(' & ');
  }

  function renderGame(m: QuickGameMatch, index: number) {
    if (editing?.mode === 'edit' && editing.match.id === m.id) {
      return (
        <QuickGameEntryCard
          key={m.id}
          title={`Edit Game ${index + 1}`}
          players={players}
          initial={matchToEntry(m)}
          saving={saving}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={() => handleDelete(m)}
        />
      );
    }
    const aWon = m.winner === 1;
    const bWon = m.winner === 2;
    const change = formatParChange(myPar.get(m.id));
    return (
      <TouchableOpacity
        key={m.id}
        style={s.game}
        activeOpacity={canEdit ? 0.7 : 1}
        disabled={!canEdit || !!editing}
        onPress={() => setEditing({ mode: 'edit', match: m })}
      >
        <View style={s.gameHeader}>
          <Text style={s.gameLabel}>GAME {index + 1}</Text>
          {!!change && (
            <Text style={[s.gamePar, (myPar.get(m.id) ?? 0) < 0 && s.gameParDown]}>Your PAR {change}</Text>
          )}
          {canEdit && <Ionicons name="create-outline" size={15} color={t.textMuted} />}
        </View>
        <View style={s.side}>
          <Text style={[s.sideName, aWon && s.sideWinner]} numberOfLines={1}>{teamNames([m.player_a_id, m.player_a2_id])}</Text>
          {aWon && <Ionicons name="trophy" size={13} color={t.accent} />}
          <Text style={[s.sideScore, aWon && s.sideWinner]}>{m.score_a ?? '–'}</Text>
        </View>
        <View style={s.side}>
          <Text style={[s.sideName, bWon && s.sideWinner]} numberOfLines={1}>{teamNames([m.player_b_id, m.player_b2_id])}</Text>
          {bWon && <Ionicons name="trophy" size={13} color={t.accent} />}
          <Text style={[s.sideScore, bWon && s.sideWinner]}>{m.score_b ?? '–'}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const notQuickGame = !!event && event.event_type !== 'open_play';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style={statusBarStyle} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={t.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Scores</Text>
          {!!event?.name && <Text style={s.headerSub} numberOfLines={1}>{event.name}</Text>}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={t.accent} /></View>
      ) : loadError ? (
        <View style={s.center}>
          <Text style={s.emptyText}>{loadError}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={s.retryBtn}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : notQuickGame ? (
        <View style={s.center}><Text style={s.emptyText}>Scores here are for Quick Games only.</Text></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[s.content, { paddingBottom: insets.bottom + spacing.xxl }]}
            keyboardShouldPersistTaps="handled"
          >
            {finished && (
              <View style={s.finishedBanner}>
                <Ionicons name="lock-closed-outline" size={16} color={t.success} />
                <Text style={s.finishedText}>Finished. Scores are locked and count toward PAR.</Text>
              </View>
            )}

            {canEdit && editing?.mode === 'new' && (
              <QuickGameEntryCard
                title={`Game ${matches.length + 1}`}
                players={players}
                saving={saving}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            )}

            {canEdit && !editing && (
              players.length >= 2 ? (
                <TouchableOpacity style={s.recordBtn} onPress={() => setEditing({ mode: 'new' })} disabled={saving}>
                  <Ionicons name="add-circle-outline" size={18} color={t.onPrimary} />
                  <Text style={s.recordText}>Record a Game</Text>
                </TouchableOpacity>
              ) : (
                <Text style={s.note}>At least two players need to be on the roster before you can record a game.</Text>
              )
            )}

            {matches.length === 0 ? (
              <Text style={s.emptyText}>
                {canEdit
                  ? 'No games recorded yet. Record each game as it finishes; results count toward every player’s My Stats.'
                  : 'No scores were recorded for this game.'}
              </Text>
            ) : (
              [...matches].reverse().map(m => renderGame(m, matches.indexOf(m)))
            )}

            {canEdit && !editing && matches.length > 0 && (
              <TouchableOpacity style={s.finishBtn} onPress={handleFinish} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={t.textPrimary} />
                  : (
                    <>
                      <Ionicons name="flag-outline" size={18} color={t.textPrimary} />
                      <Text style={s.finishText}>Finish & Rate</Text>
                    </>
                  )}
              </TouchableOpacity>
            )}

            {isOrganizer && finished && (
              <TouchableOpacity style={s.finishBtn} onPress={handleReopen} disabled={saving}>
                {saving
                  ? <ActivityIndicator color={t.textPrimary} />
                  : (
                    <>
                      <Ionicons name="lock-open-outline" size={18} color={t.textPrimary} />
                      <Text style={s.finishText}>Reopen to Edit</Text>
                    </>
                  )}
              </TouchableOpacity>
            )}

            <Text style={s.footnote}>
              {finished
                ? 'Games with at least one registered player count toward PAR. Guests are rated from their self-rating.'
                : canEdit
                  ? 'Only you, the organizer, can record or edit scores. Games are rated for PAR when you finish, or automatically a day after the game ends.'
                  : 'Scores are recorded by the organizer and count toward PAR once the game is finished.'}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = (t: ThemeRoles) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.screenH, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: t.borderSubtle,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  headerText: { flex: 1 },
  headerTitle: { color: t.textPrimary, fontSize: text.rowTitle.size, fontWeight: '800' },
  headerSub: { color: t.textSecondary, fontSize: text.caption.size },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.lg },

  recordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: 48, borderRadius: shape.cta, backgroundColor: t.primary, marginBottom: spacing.lg,
  },
  recordText: { color: t.onPrimary, fontSize: text.action.size, fontWeight: '800' },
  note: { color: t.textSecondary, fontSize: text.caption.size, marginBottom: spacing.lg, textAlign: 'center' },
  finishedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: t.successBorder, backgroundColor: t.successBg, borderRadius: shape.cta,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.lg,
  },
  finishedText: { flex: 1, color: t.textPrimary, fontSize: text.caption.size, fontWeight: '700' },
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    height: 48, borderRadius: shape.cta, borderWidth: 1.5, borderColor: t.border, marginTop: spacing.md,
  },
  finishText: { color: t.textPrimary, fontSize: text.action.size, fontWeight: '800' },
  gamePar: { flex: 1, textAlign: 'right', marginRight: spacing.xs, color: t.success, fontSize: text.caption.size, fontWeight: '800' },
  gameParDown: { color: t.danger },

  game: {
    borderWidth: 1, borderColor: t.border, borderRadius: shape.card, backgroundColor: t.surface,
    padding: spacing.md, marginBottom: spacing.sm, gap: 6,
  },
  gameHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gameLabel: { color: t.textMuted, fontSize: text.caption.size, fontWeight: '800', letterSpacing: 0.8 },
  side: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sideName: { flex: 1, color: t.textSecondary, fontSize: text.body.size, fontWeight: '600' },
  sideScore: { color: t.textSecondary, fontSize: 18, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  sideWinner: { color: t.textPrimary, fontWeight: '800' },

  emptyText: { color: t.textSecondary, fontSize: text.body.size, textAlign: 'center', marginVertical: spacing.lg },
  retryBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: shape.cta, borderWidth: 1, borderColor: t.border },
  retryText: { color: t.textPrimary, fontSize: text.action.size, fontWeight: '700' },
  footnote: { color: t.textMuted, fontSize: text.caption.size, textAlign: 'center', marginTop: spacing.lg },
});
