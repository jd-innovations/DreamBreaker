import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/lib/navigation';
import { useSession } from '@/hooks/useSession';
import {
  resolveReviewInvitation, submitReview, subjectPrompt, type ReviewSubject,
} from '@/lib/reviews/reviewInvitation';

// The emailed review link, opened on a phone with the app installed.
//
// A universal link, so this and web/src/app/review/[token] answer the same URL
// and the user never has to know which one they got — the invitation email
// carries one address.
//
// Per DESIGN_TOKENS.md this screen declares no local palette: colors, spacing,
// radius and typography come from the theme barrel.

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; subject: ReviewSubject }
  | { kind: 'done'; subject: ReviewSubject };

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setPhase({ kind: 'error', message: 'This review link is incomplete.' });
      return;
    }
    // The route is auth-gated by externalRouting, but a session can lapse
    // between opening the mail and arriving here.
    if (!user?.id) return;

    setPhase({ kind: 'loading' });
    const res = await resolveReviewInvitation(token);
    setPhase(res.ok ? { kind: 'ready', subject: res.subject } : { kind: 'error', message: res.message });
  }, [token, user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (phase.kind !== 'ready' || rating < 1 || !token || busy) return;
    setBusy(true);
    try {
      const res = await submitReview(token, rating, body);
      setPhase(res.ok ? { kind: 'done', subject: phase.subject } : { kind: 'error', message: res.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={s.back} onPress={() => goBack('/(tabs)')} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Leave a Review</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {phase.kind === 'loading' && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={colors.gold} />
          </View>
        )}

        {phase.kind === 'error' && (
          <View style={s.card}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.textSub} />
            <Text style={s.cardTitle}>Review link</Text>
            <Text style={s.cardBody}>{phase.message}</Text>
          </View>
        )}

        {phase.kind === 'done' && (
          <View style={s.card}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={s.cardTitle}>Thank you</Text>
            <Text style={s.cardBody}>
              Your rating for {phase.subject.subjectLabel} has been saved. It helps the next
              player know what to expect.
            </Text>
            <TouchableOpacity style={s.secondary} onPress={() => goBack('/(tabs)')} activeOpacity={0.85}>
              <Text style={s.secondaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase.kind === 'ready' && (
          <>
            <Text style={s.prompt}>
              {subjectPrompt(phase.subject.subjectType)}{' '}
              <Text style={s.promptSubject}>{phase.subject.subjectLabel}</Text>?
            </Text>

            {phase.subject.alreadyReviewed && (
              <Text style={s.note}>
                You have already rated this. Submitting again replaces your earlier review.
              </Text>
            )}

            <View style={s.stars} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRating(n)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: rating === n }}
                  accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                >
                  <Ionicons
                    name={n <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={n <= rating ? colors.gold : colors.border}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={s.input}
              value={body}
              onChangeText={setBody}
              placeholder="Anything you'd want the next player to know? (optional)"
              placeholderTextColor={colors.textSub}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              editable={!busy}
            />

            <TouchableOpacity
              style={[s.submit, rating < 1 && s.submitDisabled]}
              disabled={rating < 1 || busy}
              activeOpacity={0.85}
              onPress={submit}
            >
              {busy
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={s.submitText}>Submit Review</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.screenH, paddingBottom: spacing.md, backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.navy, ...typography.pageTitle },

  centered: { paddingVertical: spacing.xxxl, alignItems: 'center' },

  card: {
    padding: spacing.xl, backgroundColor: colors.bg, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: spacing.sm,
  },
  cardTitle: { color: colors.navy, ...typography.sectionTitle, textAlign: 'center' },
  cardBody: { color: colors.textSub, ...typography.body, textAlign: 'center', lineHeight: 21 },

  prompt: {
    color: colors.navy, fontSize: 22, fontWeight: '900', textAlign: 'center',
    lineHeight: 30, marginTop: spacing.sm,
  },
  promptSubject: { color: colors.gold },
  note: { color: colors.textSub, ...typography.metadata, textAlign: 'center' },

  stars: {
    flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md,
  },

  input: {
    minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.card,
    padding: spacing.md, color: colors.navy, fontSize: 14, lineHeight: 20,
    backgroundColor: colors.bg,
  },

  submit: {
    backgroundColor: colors.navy, borderRadius: 30, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', minHeight: 52,
  },
  submitDisabled: { opacity: 0.4 },
  secondary: {
    marginTop: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
    borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.border,
  },
  secondaryText: { color: colors.navy, fontSize: 15, fontWeight: '800' },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
