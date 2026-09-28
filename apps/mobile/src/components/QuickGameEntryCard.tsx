import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useTheme, useThemedStyles, type ThemeRoles } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { validateQuickGameEntry, MAX_GAME_SCORE, type QuickGameEntry } from '@/lib/quickGameScoring';
import type { QuickGamePlayer } from '@/lib/supabase/quickGameScores';

// Pick two teams from the roster and enter a score. Used by the organizer on
// quick-game/[id]/scores for both a new game and an edit.

type Props = {
  title: string;
  players: QuickGamePlayer[];
  initial?: QuickGameEntry | null;
  saving: boolean;
  onSave: (entry: QuickGameEntry) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

function parseScore(value: string): number {
  return value.trim() === '' ? NaN : Number(value);
}

export function QuickGameEntryCard({ title, players, initial, saving, onSave, onCancel, onDelete }: Props) {
  const s = useThemedStyles(styles);
  const { roles: t } = useTheme();

  const [teamSize, setTeamSize] = useState<1 | 2>(
    initial ? (initial.teamA.length === 1 ? 1 : 2) : (players.length >= 4 ? 2 : 1),
  );
  const [teamA, setTeamA] = useState<string[]>(initial?.teamA ?? []);
  const [teamB, setTeamB] = useState<string[]>(initial?.teamB ?? []);
  const [scoreA, setScoreA] = useState(initial ? String(initial.scoreA) : '');
  const [scoreB, setScoreB] = useState(initial ? String(initial.scoreB) : '');

  const rosterIds = useMemo(() => players.map(p => p.id), [players]);
  const entry: QuickGameEntry = { teamA, teamB, scoreA: parseScore(scoreA), scoreB: parseScore(scoreB) };
  const complete = teamA.length === teamSize && teamB.length === teamSize && scoreA !== '' && scoreB !== '';
  const error = complete ? validateQuickGameEntry(entry, rosterIds) : null;
  const canSave = complete && !error && !saving;

  function changeSize(size: 1 | 2) {
    setTeamSize(size);
    setTeamA(a => a.slice(0, size));
    setTeamB(b => b.slice(0, size));
  }

  function toggle(team: 'A' | 'B', id: string) {
    const set = team === 'A' ? setTeamA : setTeamB;
    set(current => {
      if (current.includes(id)) return current.filter(x => x !== id);
      // A full team swaps out its earliest pick rather than ignoring the tap.
      const next = [...current, id];
      return next.length > teamSize ? next.slice(next.length - teamSize) : next;
    });
  }

  function renderTeam(team: 'A' | 'B') {
    const mine = team === 'A' ? teamA : teamB;
    const other = team === 'A' ? teamB : teamA;
    const score = team === 'A' ? scoreA : scoreB;
    const setScore = team === 'A' ? setScoreA : setScoreB;
    return (
      <View style={s.team}>
        <View style={s.teamHeader}>
          <Text style={s.teamLabel}>TEAM {team}</Text>
          <Text style={s.teamCount}>{mine.length}/{teamSize}</Text>
          <TextInput
            style={s.scoreInput}
            value={score}
            onChangeText={v => setScore(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            maxLength={String(MAX_GAME_SCORE).length}
            placeholder="0"
            placeholderTextColor={t.textMuted}
            accessibilityLabel={`Team ${team} score`}
          />
        </View>
        <View style={s.chips}>
          {players.map(p => {
            const selected = mine.includes(p.id);
            const taken = other.includes(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[s.chip, selected && s.chipSelected, taken && s.chipTaken]}
                disabled={taken}
                onPress={() => toggle(team, p.id)}
                accessibilityState={{ selected, disabled: taken }}
              >
                {selected && <Ionicons name="checkmark" size={13} color={t.accent} />}
                <Text style={[s.chipText, selected && s.chipTextSelected]} numberOfLines={1}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.title}>{title}</Text>
        <View style={s.sizeToggle}>
          {([1, 2] as const).map(size => (
            <TouchableOpacity
              key={size}
              style={[s.sizeBtn, teamSize === size && s.sizeBtnActive]}
              onPress={() => changeSize(size)}
              disabled={size === 2 && players.length < 4}
            >
              <Text style={[s.sizeText, teamSize === size && s.sizeTextActive, size === 2 && players.length < 4 && s.sizeTextDisabled]}>
                {size === 1 ? 'Singles' : 'Doubles'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {renderTeam('A')}
      {renderTeam('B')}

      {error && <Text style={s.error}>{error}</Text>}

      <View style={s.actions}>
        {onDelete && (
          <TouchableOpacity style={s.deleteBtn} onPress={onDelete} disabled={saving} accessibilityLabel="Delete game">
            <Ionicons name="trash-outline" size={18} color={t.danger} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.cancelBtn} onPress={onCancel} disabled={saving}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.saveBtn, !canSave && s.saveBtnDisabled]} onPress={() => onSave(entry)} disabled={!canSave}>
          {saving
            ? <ActivityIndicator color={t.onPrimary} />
            : <Text style={s.saveText}>Save Game</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = (t: ThemeRoles) => StyleSheet.create({
  card: {
    borderWidth: 1.5, borderColor: t.accentBorder, borderRadius: shape.card,
    backgroundColor: t.surface, padding: spacing.md, marginBottom: spacing.lg, gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: t.textPrimary, fontSize: text.rowTitle.size, fontWeight: '800' },
  sizeToggle: { flexDirection: 'row', borderWidth: 1, borderColor: t.border, borderRadius: shape.pill, overflow: 'hidden' },
  sizeBtn: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  sizeBtnActive: { backgroundColor: t.primary },
  sizeText: { color: t.textSecondary, fontSize: text.caption.size, fontWeight: '700' },
  sizeTextActive: { color: t.onPrimary },
  sizeTextDisabled: { color: t.textMuted },

  team: { gap: spacing.sm },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  teamLabel: { color: t.textPrimary, fontSize: text.caption.size, fontWeight: '800', letterSpacing: 0.8 },
  teamCount: { flex: 1, color: t.textMuted, fontSize: text.caption.size },
  scoreInput: {
    width: 64, height: 44, borderWidth: 1.5, borderColor: t.border, borderRadius: shape.cta,
    textAlign: 'center', color: t.textPrimary, fontSize: 20, fontWeight: '800', backgroundColor: t.background,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '48%',
    borderWidth: 1, borderColor: t.border, borderRadius: shape.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: t.background,
  },
  chipSelected: { borderColor: t.accent, backgroundColor: t.accentBg },
  chipTaken: { opacity: 0.35 },
  chipText: { color: t.textSecondary, fontSize: text.caption.size, fontWeight: '600', flexShrink: 1 },
  chipTextSelected: { color: t.textPrimary, fontWeight: '800' },

  error: { color: t.danger, fontSize: text.caption.size, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deleteBtn: {
    width: 44, height: 44, borderRadius: shape.cta, borderWidth: 1, borderColor: t.dangerBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: shape.cta, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { color: t.textSecondary, fontSize: text.action.size, fontWeight: '700' },
  saveBtn: { flex: 2, height: 44, borderRadius: shape.cta, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { color: t.onPrimary, fontSize: text.action.size, fontWeight: '800' },
});
