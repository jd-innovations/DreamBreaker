import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { courtLabel, courtCountLabel, defaultCourts, mergeCourts } from '@/lib/tournamentCourts';

/**
 * Edits a tournament's court list by real court name: "7-12", "7, 9, 14",
 * "Stadium". Used by Create Tournament, Edit Tournament and the bracket's
 * court picker (day-of changes). Saving is the host's job.
 */
export function CourtListEditor({
  value,
  onChange,
  venueCourtCount,
}: {
  value: string[];
  onChange: (courts: string[]) => void;
  /** The linked facility's court count, offered as a 1..N starting point when > 0. */
  venueCourtCount?: number | null;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    if (!draft.trim()) return;
    onChange(mergeCourts(value, draft));
    setDraft('');
  }

  const suggestion = value.length === 0 ? defaultCourts(venueCourtCount) : [];

  return (
    <View>
      <View style={st.inputRow}>
        <TextInput
          style={st.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. 7-12, 14, Stadium"
          placeholderTextColor={colors.textSub}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={add}
          accessibilityLabel="Add courts"
        />
        <TouchableOpacity
          style={[st.addBtn, !draft.trim() && { opacity: 0.5 }]}
          onPress={add}
          disabled={!draft.trim()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add courts"
        >
          <Text style={st.addText}>Add</Text>
        </TouchableOpacity>
      </View>
      <Text style={st.hint}>Use a range (7-12), a list (7, 9, 14) or names (Stadium).</Text>

      {suggestion.length > 0 && (
        <TouchableOpacity style={st.suggest} onPress={() => onChange(suggestion)} activeOpacity={0.8}>
          <Ionicons name="flash-outline" size={14} color={colors.navy} />
          <Text style={st.suggestText}>
            Use the venue&apos;s {suggestion.length} courts (1-{suggestion.length})
          </Text>
        </TouchableOpacity>
      )}

      {value.length > 0 && (
        <>
          <Text style={st.count}>{courtCountLabel(value)}</Text>
          <View style={st.chips}>
            {value.map(c => (
              <TouchableOpacity
                key={c}
                style={st.chip}
                onPress={() => onChange(value.filter(x => x !== c))}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${courtLabel(c)}`}
              >
                <Text style={st.chipText}>{courtLabel(c)}</Text>
                <Ionicons name="close" size={13} color={colors.textSub} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1, color: colors.text, fontSize: text.body.size,
    borderWidth: 1, borderColor: colors.border, borderRadius: shape.cta,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.bg,
  },
  addBtn: {
    backgroundColor: colors.navy, borderRadius: shape.cta,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  addText: { color: colors.white, fontSize: text.action.size, fontWeight: '800' },
  hint: { color: colors.textSub, fontSize: text.caption.size, fontWeight: '500', marginTop: 6 },
  suggest: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: spacing.sm, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: shape.pill, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg,
  },
  suggestText: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
  count: {
    color: colors.navy, fontSize: text.cardLabel.size, fontWeight: '800',
    letterSpacing: text.cardLabel.letterSpacing, marginTop: spacing.md, textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: shape.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg,
  },
  chipText: { color: colors.navy, fontSize: text.caption.size, fontWeight: '700' },
});
