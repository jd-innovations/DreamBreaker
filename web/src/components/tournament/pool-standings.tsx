"use client";

// Pool standings table (DIRECTOR_HUB_WEB_PARITY.md, W3 row 23), for the public
// Brackets tab, the director LIVE BRACKETS view and the director pool panel.
// Ranking comes from division_pool_standings(); a line marks who advances.

import { useEffect, useState } from "react";
import { fetchPoolStandings, type DivisionPool } from "@/lib/tournament/pools";
import { makeTeamShortener, teamFull } from "@shared/teamNames";
import type { LiveBracketMatch } from "@/lib/tournament/live-brackets";

/** Loads the division's standings, again whenever its matches change. */
export function usePoolStandings(divisionId: string | null, matches: LiveBracketMatch[] | null) {
  const [pools, setPools] = useState<DivisionPool[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!divisionId || !matches?.some((m) => m.poolLabel)) return;
    let live = true;
    fetchPoolStandings(divisionId, matches)
      .then((p) => { if (live) { setPools(p); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [divisionId, matches]);
  return { pools, error };
}

export function PoolStandingsTable({
  pool, advancePerPool, currentUserId = null,
}: {
  pool: DivisionPool;
  advancePerPool: number;
  currentUserId?: string | null;
}) {
  // One line per team: short names, full names on hover.
  const short = makeTeamShortener(pool.standings.map((s) => s.people));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="font-mono text-[9px] tracking-widest text-muted-foreground">
            <th className="text-left font-normal py-1 pr-2 w-6">#</th>
            <th className="text-left font-normal py-1 pr-2">TEAM</th>
            <th className="text-right font-normal py-1 px-1">W-L</th>
            <th className="text-right font-normal py-1 pl-1">+/-</th>
          </tr>
        </thead>
        <tbody>
          {pool.standings.map((s) => {
            const mine = !!currentUserId && s.members.includes(currentUserId);
            const cut = s.rank === advancePerPool && pool.standings.length > advancePerPool;
            return (
              <tr key={s.teamKey} className={`${cut ? "border-b border-dashed border-primary/60" : ""} ${mine ? "bg-primary/10" : ""}`}>
                <td className={`py-1.5 pr-2 font-mono ${s.rank <= advancePerPool ? "text-primary font-bold" : "text-muted-foreground"}`}>{s.rank}</td>
                <td className="py-1.5 pr-2 truncate max-w-[10rem] sm:max-w-none" title={s.people.length ? teamFull(s.people) : s.name}>
                  {s.people.length ? short(s.people) : s.name}
                </td>
                <td className="py-1.5 px-1 text-right font-mono whitespace-nowrap">{s.wins}-{s.losses}</td>
                <td className="py-1.5 pl-1 text-right font-mono">{s.diff > 0 ? "+" : ""}{s.diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pool.standings.length > advancePerPool && (
        <p className="mt-1 font-mono text-[9px] tracking-widest text-muted-foreground">TOP {advancePerPool} ADVANCE</p>
      )}
    </div>
  );
}
