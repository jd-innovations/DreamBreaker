import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
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
// Survives remounts on purpose. A guard that unmounts and remounts in a loop
// resets any state or timer it owns, which is why an 8s in-component timer
// never fired: the elapsed time and attempt count have to live outside it.
const mountProbe = new Map<string, { firstSeen: number; mounts: number }>();

export function DirectorOnly({ tournamentId, children }: Props) {
  const { canManage, denyReason, loading, profileLoading, directorLoading, refresh } =
    useTournamentDirector(tournamentId);

  // A guard that never resolves is indistinguishable from a slow one. After
  // eight seconds, say which half is stuck and offer a way out.
  const [stuck, setStuck] = useState(false);
  const [, tick] = useState(0);

  const probeKey = tournamentId ?? 'none';
  const probe = mountProbe.get(probeKey) ?? { firstSeen: Date.now(), mounts: 0 };
  if (!mountProbe.has(probeKey)) mountProbe.set(probeKey, probe);
  useEffect(() => { probe.mounts += 1; }, [probe]);
  // Re-render once a second while stuck so the elapsed counter moves.
  useEffect(() => {
    if (!loading) return;
    const i = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(i);
  }, [loading]);
  const elapsed = Math.round((Date.now() - probe.firstSeen) / 1000);
  useEffect(() => {
    if (!loading) { setStuck(false); return; }
    const t = setTimeout(() => setStuck(true), 8_000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (loading || denyReason !== 'not_director') return;
    router.replace(
      (tournamentId ? `/tournament/${tournamentId}` : '/(tabs)') as never,
    );
  }, [loading, denyReason, tournamentId]);

  if (loading) {
    // Labelled so it can be told apart from the screen's own spinner. Both are
    // a gold ActivityIndicator centred on white, which made "it just spins"
    // impossible to attribute.
    return (
      <View style={s.root}>
        {stuck ? (
          <>
            <Text style={s.text}>Permission check did not finish.</Text>
            <Text style={s.text}>
              profile: {profileLoading ? 'still loading' : 'ready'}
            </Text>
            <Text style={s.text}>
              tournament: {directorLoading ? 'still loading' : 'ready'}
            </Text>
            <TouchableOpacity onPress={() => { void refresh(); }} style={{ marginTop: 16 }}>
              <Text style={[s.text, { color: colors.gold }]}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={s.text}>Checking permissions…</Text>
            <Text style={s.text}>
              {elapsed}s · attempt {probe.mounts} · profile{' '}
              {profileLoading ? 'loading' : 'ready'} · tournament{' '}
              {directorLoading ? 'loading' : 'ready'}
            </Text>
          </>
        )}
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
