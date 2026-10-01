"use client";

// Live Queue (owner, 2026-09-30): whatever division bracket you are browsing,
// this shows the whole tournament moving: who is on each court, who is up
// next and on deck (the tournament-wide court_queue, every division taking
// turns), the last few results, and where you are in it. Reads the page's
// shared live data (LiveTournamentProvider), so it always agrees with the
// bracket. Tapping a row opens that match in the bracket.

import { useMemo, useState } from "react";
import { CaretDown, CaretUp, Megaphone, Hourglass, Trophy } from "@phosphor-icons/react";
import { courtLabel } from "@shared/tournamentCourts";
import { roundName } from "@/lib/tournament/day-of";
import type { LiveBracketMatch } from "@/lib/tournament/live-brackets";
import { useLiveTournament } from "@/components/tournament/live-tournament-context";
import { vsShort } from "@/components/tournament/team-name";
import { makeTeamShortener, type TeamPerson } from "@shared/teamNames";

const UP_NEXT_SHOWN = 5;
const RESULTS_SHOWN = 3;

interface Row { m: LiveBracketMatch; division: string }

// Full names for the hover title; the row itself uses the short form.
const vsFull = (m: LiveBracketMatch) => `${m.team1Name ?? "TBD"} vs ${m.team2Name ?? "TBD"}`;
const where = (r: Row) => `${r.division} · ${roundName(r.m.round, r.m.poolLabel)} · M${r.m.matchNumber + 1}`;

export function LiveQueuePanel({
  currentUserId = null, variant = "sidebar", onOpenMatch,
}: {
  currentUserId?: string | null;
  /** "sidebar": the full panel. "strip": a compact bar that expands (phones). */
  variant?: "sidebar" | "strip";
  /** Called after a row is tapped, e.g. to switch the page to its Brackets tab. */
  onOpenMatch?: () => void;
}) {
  const live = useLiveTournament();
  const [expanded, setExpanded] = useState(false);

  // One line per match, so names are short ("A. Waters / A. Bright"). The panel
  // lists every division together, so a clash anywhere keeps full names.
  const short = useMemo(
    () => makeTeamShortener((live?.divisions ?? []).flatMap((d) => d.matches.flatMap((m) => [m.team1People ?? [], m.team2People ?? []]))),
    [live?.divisions],
  );
  const vs = (m: LiveBracketMatch) => vsShort(m, short);
  const oneLine = (people: TeamPerson[] | undefined, name: string | null) => (people?.length ? short(people) : name);

  const data = useMemo(() => {
    const divisions = live?.divisions ?? [];
    const ctx = live?.ctx;
    const all: Row[] = divisions.flatMap((d) => d.matches.map((m) => ({ m, division: d.name })));
    const byId = new Map(all.map((r) => [r.m.id, r]));
    const onCourt = new Map<string, Row>();
    for (const r of all) if (r.m.court && !r.m.completed) onCourt.set(r.m.court, r);
    const courts = [...(ctx?.courts ?? []), ...[...onCourt.keys()].filter((c) => !(ctx?.courts ?? []).includes(c))];
    const queue = [...(ctx?.queue ?? new Map()).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id, pos]) => ({ pos, row: byId.get(id) }))
      .filter((q): q is { pos: number; row: Row } => !!q.row);
    const results = all
      .filter((r) => r.m.completed && r.m.completedAt && r.m.team1.length && r.m.team2.length && r.m.winner)
      .sort((a, b) => (b.m.completedAt ?? "").localeCompare(a.m.completedAt ?? ""))
      .slice(0, RESULTS_SHOWN);

    let you: string | null = null;
    if (currentUserId) {
      const mine = (m: LiveBracketMatch) => m.team1.includes(currentUserId) || m.team2.includes(currentUserId);
      const playing = [...onCourt.values()].find((r) => mine(r.m));
      const waiting = queue.find((q) => mine(q.row.m));
      if (playing) you = `You're on ${courtLabel(playing.m.court!)}`;
      else if (waiting) you = waiting.pos === 1 ? "You're UP NEXT" : `You're ON DECK #${waiting.pos}`;
    }
    return { courts, onCourt, queue, results, you, autoAssign: ctx?.autoAssign ?? true };
  }, [live?.divisions, live?.ctx, currentUserId]);

  if (!live || !live.divisions) return null;

  const open = (r: Row) => {
    live.requestFocus(r.m.divisionId, r.m.id);
    onOpenMatch?.();
    setExpanded(false);
  };
  const next = data.queue[0];

  if (variant === "strip" && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-left"
        aria-expanded={false}
      >
        <LiveDot />
        <span className="font-mono text-[10px] tracking-widest text-amber-500 flex-shrink-0">LIVE</span>
        <span className="text-xs truncate flex-1 min-w-0">
          {data.you ?? (next ? `Up next: ${vs(next.row.m)}` : `${data.onCourt.size} on court`)}
        </span>
        <CaretDown size={14} className="flex-shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4" aria-live="polite">
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="font-mono text-[11px] tracking-widest text-amber-500">LIVE</span>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
          · {data.autoAssign ? "COURTS AUTO-ASSIGNING" : "COURTS ASSIGNED BY HAND"}
        </span>
        {variant === "strip" && (
          <button onClick={() => setExpanded(false)} aria-label="Collapse live queue" className="ml-auto h-7 w-7 rounded-full hover:bg-secondary flex items-center justify-center">
            <CaretUp size={14} />
          </button>
        )}
      </div>

      {data.you && (
        <div className="rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold">{data.you}</div>
      )}

      {data.courts.length > 0 && (
        <section>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">ON COURT NOW</p>
          <div className="space-y-1.5">
            {data.courts.map((c) => {
              const r = data.onCourt.get(c);
              return r ? (
                <button key={c} onClick={() => open(r)} className="w-full text-left rounded-xl border border-amber-400/50 bg-amber-400/5 px-3 py-2 hover:bg-amber-400/10 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-500 w-16 flex-shrink-0">{courtLabel(c)}</span>
                    <span className="font-mono text-[9px] tracking-wide text-muted-foreground truncate">{where(r)}</span>
                  </div>
                  <div className="text-[13px] truncate mt-0.5" title={vsFull(r.m)}>{vs(r.m)}</div>
                </button>
              ) : (
                <div key={c} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5">
                  <span className="text-xs font-semibold w-16">{courtLabel(c)}</span>
                  <span className="text-xs text-muted-foreground">Free</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">UP NEXT · ALL DIVISIONS</p>
        {data.queue.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing waiting for a court right now.</p>
        ) : (
          <div className="space-y-1.5">
            {data.queue.slice(0, UP_NEXT_SHOWN).map(({ pos, row }) => (
              <button
                key={row.m.id}
                onClick={() => open(row)}
                className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${pos === 1 ? "border-amber-400/60 bg-amber-400/10 hover:bg-amber-400/15" : "border-border hover:bg-secondary/60"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 font-mono text-[9px] tracking-widest leading-[16px] flex-shrink-0 ${
                    pos === 1 ? "bg-amber-400 text-black" : "border border-destructive/40 text-destructive"
                  }`}>
                    {pos === 1 ? <Megaphone size={10} weight="fill" /> : <Hourglass size={9} />}
                    {pos === 1 ? "UP NEXT" : `ON DECK #${pos}`}
                  </span>
                  <span className="font-mono text-[9px] tracking-wide text-muted-foreground truncate">{where(row)}</span>
                </div>
                <div className="text-[13px] truncate mt-0.5" title={vsFull(row.m)}>{vs(row.m)}</div>
              </button>
            ))}
            {data.queue.length > UP_NEXT_SHOWN && (
              <p className="text-[11px] text-muted-foreground px-1">+{data.queue.length - UP_NEXT_SHOWN} more waiting</p>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Matches from every division take turns for the next free court, whichever bracket you&apos;re viewing.
        </p>
      </section>

      {data.results.length > 0 && (
        <section>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">JUST FINISHED</p>
          <div className="space-y-1.5">
            {data.results.map((r) => {
              const w = r.m.winner === 1 ? oneLine(r.m.team1People, r.m.team1Name) : oneLine(r.m.team2People, r.m.team2Name);
              const l = r.m.winner === 1 ? oneLine(r.m.team2People, r.m.team2Name) : oneLine(r.m.team1People, r.m.team1Name);
              const ws = r.m.winner === 1 ? r.m.score1 : r.m.score2;
              const ls = r.m.winner === 1 ? r.m.score2 : r.m.score1;
              return (
                <button key={r.m.id} onClick={() => open(r)} className="w-full text-left rounded-xl px-3 py-1.5 hover:bg-secondary/60 transition-colors">
                  <div className="font-mono text-[9px] tracking-wide text-muted-foreground truncate">{where(r)}</div>
                  <div className="text-[13px] truncate flex items-center gap-1.5" title={vsFull(r.m)}>
                    <Trophy size={11} weight="fill" className="text-primary flex-shrink-0" />
                    <span className="font-semibold truncate">{w}</span>
                    <span className="text-muted-foreground">def.</span>
                    <span className="truncate">{l}</span>
                    <span className="font-mono text-xs ml-auto flex-shrink-0">{ws}–{ls}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 flex-shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping motion-reduce:animate-none" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
    </span>
  );
}
