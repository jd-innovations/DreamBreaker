"use client";

// One live data source per tournament page (2026-09-30): the bracket view and
// the Live Queue panel read the same matches, courts and queue, so they always
// agree and the page keeps a single realtime channel. Components fall back to
// loading on their own when no provider is above them.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  fetchBracketContext, fetchLiveBrackets, subscribeLiveBrackets,
  type BracketContext, type LiveBracketMatch, type LiveDivision,
} from "@/lib/tournament/live-brackets";

export interface LiveFocus {
  divisionId: string;
  matchId: string;
  /** Changes on every request, so asking for the same match twice still fires. */
  nonce: number;
}

export interface LiveTournamentState {
  divisions: LiveDivision[] | null;
  ctx: BracketContext;
  error: boolean;
  reload: () => Promise<void>;
  /** A match the queue panel asked the bracket to show. */
  focus: LiveFocus | null;
  requestFocus: (divisionId: string, matchId: string) => void;
}

const EMPTY_CTX: BracketContext = { courts: [], autoAssign: true, queue: new Map() };

/** Loads and live-updates a tournament's brackets, courts and queue. A null id does nothing. */
export function useLiveTournamentData(tournamentId: string | null): LiveTournamentState {
  const [divisions, setDivisions] = useState<LiveDivision[] | null>(null);
  const [ctx, setCtx] = useState<BracketContext>(EMPTY_CTX);
  const [error, setError] = useState(false);
  const [focus, setFocus] = useState<LiveFocus | null>(null);

  const reload = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const [d, c] = await Promise.all([fetchLiveBrackets(tournamentId), fetchBracketContext(tournamentId)]);
      setDivisions(d);
      setCtx(c);
      setError(false);
    } catch {
      setError(true);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    // Database fetch (an external system); state is set after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    return subscribeLiveBrackets(tournamentId, reload);
  }, [tournamentId, reload]);

  const requestFocus = useCallback((divisionId: string, matchId: string) => {
    setFocus({ divisionId, matchId, nonce: Date.now() });
  }, []);

  return { divisions, ctx, error, reload, focus, requestFocus };
}

const LiveTournamentContext = createContext<LiveTournamentState | null>(null);

export function LiveTournamentProvider({ value, children }: { value: LiveTournamentState; children: React.ReactNode }) {
  return <LiveTournamentContext.Provider value={value}>{children}</LiveTournamentContext.Provider>;
}

export function useLiveTournament(): LiveTournamentState | null {
  return useContext(LiveTournamentContext);
}

/**
 * Event day: a division is live, or a match is on a court or in the queue.
 * Before the event and after it ends this is false and pages look as before.
 */
export function isLiveMode(state: Pick<LiveTournamentState, "divisions" | "ctx">): boolean {
  const divisions = state.divisions ?? [];
  return state.ctx.queue.size > 0
    || divisions.some((d) => d.playStatus === "live")
    || divisions.some((d) => d.matches.some((m: LiveBracketMatch) => !!m.court && !m.completed));
}
