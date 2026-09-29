"use client";

// Live brackets + leaderboard by division, for the public tournament page and
// the director page (DIRECTOR_HUB_WEB_PARITY.md, W1b). Same data and leaderboard
// rules as mobile; updates live as scores come in.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Info } from "@phosphor-icons/react";
import { divisionLeaderboard, type LeaderboardEntry } from "@shared/leaderboard";
import { courtLabel } from "@shared/tournamentCourts";
import { fetchLiveBrackets, subscribeLiveBrackets, type LiveBracketMatch, type LiveDivision } from "@/lib/tournament/live-brackets";
import { roundName } from "@/lib/tournament/day-of";

const DISPLAY_ORDER: Record<string, number> = { pool: 0, r64: 1, r32: 2, r16: 3, qf: 4, sf: 5, final: 7, bronze: 8 };

type View = "bracket" | "leaderboard";

export function LiveBrackets({
  tournamentId, initialView = "bracket", currentUserId = null,
}: {
  tournamentId: string;
  initialView?: View;
  currentUserId?: string | null;
}) {
  const [divisions, setDivisions] = useState<LiveDivision[] | null>(null);
  const [error, setError] = useState(false);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);

  const load = useCallback(async () => {
    try {
      const d = await fetchLiveBrackets(tournamentId);
      setDivisions(d);
      setDivisionId((prev) => (prev && d.some((x) => x.id === prev) ? prev : d[0]?.id ?? null));
      setError(false);
    } catch {
      setError(true);
    }
  }, [tournamentId]);

  useEffect(() => {
    // Database fetch (an external system); state is set after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return subscribeLiveBrackets(tournamentId, load);
  }, [tournamentId, load]);

  const division = divisions?.find((d) => d.id === divisionId) ?? null;
  const board = useMemo(() => (division ? divisionLeaderboard(division.matches) : []), [division]);

  if (error) return <p className="text-sm text-muted-foreground">Brackets couldn’t load. Refresh to try again.</p>;
  if (!divisions) {
    return <div className="flex justify-center py-12"><div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  }
  if (divisions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <Trophy size={28} className="mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Brackets and standings appear here once the draw is made.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">
          {divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setDivisionId(d.id)}
              className={`px-3.5 h-8 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                d.id === divisionId ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-border p-0.5">
          {(["bracket", "leaderboard"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 h-7 rounded-full font-mono text-[10px] tracking-widest ${view === v ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
            >
              {v === "bracket" ? "BRACKET" : "LEADERBOARD"}
            </button>
          ))}
        </div>
      </div>

      {division && (view === "bracket"
        ? <BracketView matches={division.matches} currentUserId={currentUserId} />
        : <LeaderboardView rows={board} currentUserId={currentUserId} />)}
    </div>
  );
}

function BracketView({ matches, currentUserId }: { matches: LiveBracketMatch[]; currentUserId: string | null }) {
  const pools = new Map<string, LiveBracketMatch[]>();
  for (const m of matches) if (m.poolLabel) pools.set(m.poolLabel, [...(pools.get(m.poolLabel) ?? []), m]);
  const elim = matches.filter((m) => !m.poolLabel);
  const rounds = [...new Set(elim.map((m) => m.round))].sort((a, b) => (DISPLAY_ORDER[a] ?? 9) - (DISPLAY_ORDER[b] ?? 9));

  return (
    <div className="space-y-6">
      {pools.size > 0 && (
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">POOLS</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...pools.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, list]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-3 space-y-2">
                <p className="font-mono text-[10px] tracking-widest text-primary">POOL {label}</p>
                {list.sort((a, b) => a.matchNumber - b.matchNumber).map((m) => <MatchCard key={m.id} m={m} currentUserId={currentUserId} compact />)}
              </div>
            ))}
          </div>
        </div>
      )}
      {rounds.length > 0 && (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-4 min-w-max">
            {rounds.map((round) => (
              <div key={round} className="w-60 flex-shrink-0">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">{roundName(round, null).toUpperCase()}</p>
                <div className="space-y-2">
                  {elim.filter((m) => m.round === round).sort((a, b) => a.matchNumber - b.matchNumber)
                    .map((m) => <MatchCard key={m.id} m={m} currentUserId={currentUserId} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ m, currentUserId, compact = false }: { m: LiveBracketMatch; currentUserId: string | null; compact?: boolean }) {
  const live = !!m.court && !m.completed;
  const bye = m.completed && (m.team1.length === 0 || m.team2.length === 0);
  const side = (members: string[], name: string | null, score: number | null, won: boolean) => {
    const mine = !!currentUserId && members.includes(currentUserId);
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 ${won ? "font-semibold text-foreground" : "text-muted-foreground"} ${mine ? "bg-primary/10" : ""}`}>
        <span className="flex-1 truncate text-sm">{name ?? (m.completed ? "—" : "TBD")}</span>
        {won && <Trophy size={11} weight="fill" className="text-primary flex-shrink-0" />}
        <span className="font-mono text-sm w-5 text-right">{score ?? ""}</span>
      </div>
    );
  };
  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${live ? "border-amber-400/60" : "border-border"}`}>
      {!compact && (live || m.editedAt || bye) && (
        <div className="flex items-center gap-1.5 px-2.5 pt-1.5 font-mono text-[9px] tracking-widest">
          {live && <span className="text-amber-500">ON {m.court ? courtLabel(m.court).toUpperCase() : ""}</span>}
          {bye && <span className="text-muted-foreground">BYE</span>}
          {m.editedAt && (
            <span className="ml-auto text-muted-foreground flex items-center gap-1" title={`Score edited ${new Date(m.editedAt).toLocaleString()}`}>
              <Info size={10} /> EDITED
            </span>
          )}
        </div>
      )}
      {side(m.team1, m.team1Name, m.score1, m.winner === 1)}
      <div className="h-px bg-border" />
      {side(m.team2, m.team2Name, m.score2, m.winner === 2)}
    </div>
  );
}

function LeaderboardView({ rows, currentUserId }: { rows: LeaderboardEntry[]; currentUserId: string | null }) {
  const groups: [string, LeaderboardEntry[]][] = [
    ["STILL IN", rows.filter((r) => r.status === "in")],
    ["PLACINGS", rows.filter((r) => r.status === "placed")],
    ["OUT IN POOLS", rows.filter((r) => r.status === "pool")],
  ];
  return (
    <div className="space-y-5">
      {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
        <div key={title}>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">{title}{title === "STILL IN" ? ` · ${list.length}` : ""}</p>
          <div className="space-y-1.5">
            {list.map((r) => {
              const mine = !!currentUserId && r.members.includes(currentUserId);
              return (
                <div key={r.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${mine ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <span className={`w-12 text-center font-mono text-xs font-bold ${r.place === 1 ? "text-primary" : "text-muted-foreground"}`}>
                    {r.place === 1 ? <Trophy size={16} weight="fill" className="inline text-primary" /> : r.status === "in" ? "•" : r.status === "pool" ? "–" : r.placeLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {r.name}{mine && <span className="ml-2 font-mono text-[10px] text-primary">YOU</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.status === "in"
                        ? [r.currentRound, r.onCourt ? `on ${courtLabel(r.onCourt)}` : null].filter(Boolean).join(" · ")
                        : r.status === "pool" ? "Out in pools" : r.placeLabel === "Champion" ? "Champion" : `Placed ${r.placeLabel}`}
                    </div>
                  </div>
                  <span className="font-mono text-xs whitespace-nowrap">
                    {r.wins}-{r.losses}{r.wins + r.losses > 0 ? ` · ${r.pointDiff > 0 ? "+" : ""}${r.pointDiff}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground text-center">Record is wins-losses and point difference. Updates live.</p>
    </div>
  );
}
