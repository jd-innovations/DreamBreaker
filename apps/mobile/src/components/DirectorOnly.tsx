import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { text } from '@shared/tokens';
import { useTournamentDirector } from '@/hooks/useTournamentDirector';

type Props = {
  tournamentId: string | null | undefined;
  children: React.ReactNode;
};

/**
 * Route guard for director-only tournament screens.
 *
 * Wraps a screen's real component so that `children` is never mounted for a
 * user who may not manage this tournament — the guard resolves permission
 * first, so the screen's own effects, fetches and stores never run for an
 * unauthorized viewer. That is the reason this is a wrapper rather than an
 * early `return` inside each screen: an early return still lets every hook
 * above it fire.
 *
 * The guard checks `canManage`, not just ownership, because the RLS policies
 * behind these screens require director_id = auth.uid() AND
 * is_approved_director(). Admitting on ownership alone would mount the command
 * center for a director whose approval lapsed and then fail every write at the
 * database. The two denials are handled differently on purpose:
 *
 *   not_director — someone else's tournament. Redirected to the public page,
 *     because the only way to land here is a stale link or a typed URL, and
 *     there is nothing for them to act on. `replace` keeps the blocked route
 *     out of the back stack.
 *
 *   not_approved — their own tournament, but their director approval is not
 *     active. Not redirected: bouncing them off their own tournament with no
 *     explanation is the confusing case this guard exists to prevent. They get
 *     told why instead.
 *
 * This is UI-level only. RLS remains the real enforcement.
 */
export function DirectorOnly({ tournamentId, children }: Props) {
  const { canManage, denyReason, loading } = useTournamentDirector(tournamentId);

  useEffect(() => {
    if (loading || denyReason !== 'not_director') return;
    router.replace(
      (tournamentId ? `/tournament/${tournamentId}` : '/(tabs)') as never,
    );
  }, [loading, denyReason, tournamentId]);

  if (loading) {
    return (
      <View style={s.root}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!canManage) {
    return (
      <View style={s.root}>
        <Text style={s.text}>
          {denyReason === 'not_approved'
            ? 'Your director approval is not active, so this tournament cannot be managed right now. Contact support if you think this is a mistake.'
            : "Only this tournament's director can manage it."}
        </Text>
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
    fontSize: text.rowTitle.size,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
});
