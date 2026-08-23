import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme';
import { useTournamentDirector } from '@/hooks/useTournamentDirector';

type Props = {
  tournamentId: string | null | undefined;
  children: React.ReactNode;
};

/**
 * Route guard for director-only tournament screens.
 *
 * Wraps a screen's real component so that `children` is never mounted for a
 * user who does not direct this tournament — the guard resolves ownership
 * first, so the screen's own effects, fetches and stores never run for an
 * unauthorized viewer. That is the reason this is a wrapper rather than an
 * early `return` inside each screen: an early return still lets every hook
 * above it fire.
 *
 * A non-director is sent back to the public tournament page rather than shown
 * an error, because the only way to land here is a stale link or a hand-typed
 * URL; `replace` keeps the blocked route out of the back stack.
 *
 * This is UI-level only. RLS remains the real enforcement server-side.
 */
export function DirectorOnly({ tournamentId, children }: Props) {
  const { isDirector, loading } = useTournamentDirector(tournamentId);

  useEffect(() => {
    if (loading || isDirector) return;
    router.replace(
      (tournamentId ? `/tournament/${tournamentId}` : '/(tabs)') as never,
    );
  }, [loading, isDirector, tournamentId]);

  if (loading) {
    return (
      <View style={s.root}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!isDirector) {
    return (
      <View style={s.root}>
        <Text style={s.text}>Only this tournament's director can manage it.</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
  },
  text: {
    color: colors.textSub,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
