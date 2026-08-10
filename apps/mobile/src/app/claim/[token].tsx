import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useSession } from '@/hooks/useSession';
import { claimPersonalMatch, validatePersonalMatchClaim, type PersonalMatchClaimPreview } from '@/lib/supabase/personalMatchClaims';
import { colors, radius, spacing, typography } from '@/theme';

function formatDate(value: string | null) {
  if (!value) return 'Date unavailable';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusCopy(status: PersonalMatchClaimPreview['status'], reason: string | null) {
  if (status === 'expired') return { title: 'Claim expired', body: 'This match claim link has expired.' };
  if (status === 'already_claimed') return { title: 'Already claimed', body: 'This match has already been claimed.' };
  if (status === 'invalid') return { title: 'Invalid claim', body: reason === 'revoked' ? 'This claim link was revoked.' : 'This claim link is invalid.' };
  return { title: 'Match found', body: 'Review the match details before claiming it.' };
}

export default function ClaimMatchScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const { user, loading: authLoading } = useSession();
  const [preview, setPreview] = useState<PersonalMatchClaimPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const returnTo = `/claim/${token}`;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setPreview(await validatePersonalMatchClaim(token));
    } catch (error) {
      console.warn('[claim] validation failed:', error);
      setPreview({ status: 'invalid', reason: 'validation_failed', recorderName: null, facilityName: null, playedAt: null, guestName: null, sessionFormat: null, games: [], teams: [] });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const copy = useMemo(() => statusCopy(preview?.status ?? 'invalid', preview?.reason ?? null), [preview]);
  const canClaim = preview?.status === 'valid' && !!user?.id;

  async function handleClaim() {
    if (!user?.id) return;
    setClaiming(true);
    try {
      const result = await claimPersonalMatch(token);
      if (result.status === 'claimed') {
        setClaimed(true);
        await load();
        return;
      }
      Alert.alert('Could not claim match', result.reason ?? result.status);
      await load();
    } catch (error) {
      console.warn('[claim] claim failed:', error);
      Alert.alert('Could not claim match', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={20} color={colors.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Claim Match</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.centerCard}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.loadingText}>Checking claim link...</Text>
          </View>
        ) : claimed ? (
          <View style={styles.centerCard}>
            <View style={styles.successBadge}><Ionicons name="checkmark" size={34} color={colors.white} /></View>
            <Text style={styles.headline}>Match claimed</Text>
            <Text style={styles.subText}>This match is now part of your My Matches history.</Text>
            <PrimaryButton label="Go to My Stats" style={styles.primary} textStyle={styles.primaryText} onPress={() => router.replace('/(tabs)/stats')} />
          </View>
        ) : preview ? (
          <View style={styles.card}>
            <View style={[styles.statusBadge, preview.status !== 'valid' && styles.statusBadgeMuted]}>
              <Ionicons name={preview.status === 'valid' ? 'tennisball-outline' : 'alert-circle-outline'} size={30} color={preview.status === 'valid' ? colors.navy : colors.textSub} />
            </View>
            <Text style={styles.headline}>{copy.title}</Text>
            <Text style={styles.subText}>{copy.body}</Text>

            {preview.status === 'valid' || preview.status === 'already_claimed' ? (
              <View style={styles.details}>
                <Detail label="Recorded by" value={preview.recorderName ?? 'A player'} />
                <Detail label="Facility" value={preview.facilityName ?? 'Not specified'} />
                <Detail label="Date" value={formatDate(preview.playedAt)} />
                <Detail label="Guest slot" value={preview.guestName ?? 'Guest player'} />
                <Detail label="Format" value={preview.sessionFormat ?? 'Match'} />

                {preview.games.length > 0 ? (
                  <View style={styles.scoreBox}>
                    <Text style={styles.scoreTitle}>Score</Text>
                    {preview.games.map((game) => (
                      <Text key={game.gameNumber} style={styles.scoreLine}>Game {game.gameNumber}: {game.teamOneScore}-{game.teamTwoScore}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {preview.status === 'valid' && !user?.id && !authLoading ? (
              <View style={styles.authActions}>
                <PrimaryButton label="Sign In to Claim" style={styles.primary} textStyle={styles.primaryText} onPress={() => router.push({ pathname: '/sign-in', params: { returnTo } })} />
                <TouchableOpacity style={styles.secondaryLink} onPress={() => router.push({ pathname: '/sign-up', params: { returnTo } })} activeOpacity={0.75}>
                  <Text style={styles.secondaryLinkText}>Create an account</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {preview.status === 'valid' && user?.id ? (
              <PrimaryButton label={claiming ? 'Claiming...' : 'Claim Match'} style={styles.primary} textStyle={styles.primaryText} onPress={handleClaim} disabled={!canClaim || claiming} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.screenH, paddingVertical: 12 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, color: colors.navy, fontSize: 17 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.screenH, paddingTop: spacing.xl },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: spacing.lg, alignItems: 'center', gap: spacing.md },
  centerCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  statusBadge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  statusBadgeMuted: { backgroundColor: colors.page },
  successBadge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success },
  headline: { ...typography.sectionTitle, color: colors.navy, fontSize: 20, textAlign: 'center' },
  subText: { ...typography.body, color: colors.textSub, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  loadingText: { ...typography.body, color: colors.textSub, fontSize: 13 },
  details: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
  detailRow: { gap: 2 },
  detailLabel: { ...typography.metadata, color: colors.textSub, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { ...typography.cardTitle, color: colors.navy, fontSize: 14, lineHeight: 19 },
  scoreBox: { width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.sm, gap: 4 },
  scoreTitle: { ...typography.metadata, color: colors.textSub, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  scoreLine: { ...typography.body, color: colors.navy, fontSize: 13 },
  authActions: { width: '100%', gap: spacing.sm, marginTop: spacing.sm },
  primary: { width: '100%', backgroundColor: colors.gold },
  primaryText: { color: colors.navy },
  secondaryLink: { alignItems: 'center', paddingVertical: spacing.sm },
  secondaryLinkText: { ...typography.cardTitle, color: colors.navy, fontSize: 14 },
});
