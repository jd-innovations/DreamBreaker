"use client";

// Bracket tree for the "All" tab on wide screens (owner's chosen format,
// 2026-09-29): compact cards with the match number on the left, seed, name and
// one score column per game, the winner shaded, the court under the card, and
// connector lines joining each pair of matches to the next one. Every card is
// the same size so the tree stays aligned; live and UP NEXT / ON DECK show as a
// gold edge and a small tag. Clicking a card opens the full card (with the
// director's actions) in the parent.

import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, Info } from "@phosphor-icons/react";
import { courtLabel } from "@shared/tournamentCourts";
import type { LiveBracketMatch } from "@/lib/tournament/live-brackets";
import { roundName } from "@/lib/tournament/day-of";
import type { TeamPerson } from "@shared/teamNames";
import { TeamNameLines, maxTeamSize } from "@/components/tournament/team-name";

const ORDER: Record<string, number> = { pool: 0, r64: 1, r32: 2, r16: 3, qf: 4, sf: 5, final: 7 };

const CARD_W = 232;
// Team rows: 26px for one name; 40px when a side has two players, one full name
// per row (owner, 2026-10-01). Every card in a tree is the same height so it
// stays aligned; the connector lines are drawn from that height.
const ROW_H_ONE = 26;
const ROW_H_TWO = 40;
const COURT_H = 17;  // the court line under the two team rows
const ROW_GAP = 18;  // vertical space between first-round cards
const COL_GAP = 44;  // horizontal space for the connector lines
const HEADER = 24;
const UP_NEXT_SHOWN = 5;

export interface TreeLayout {
  rounds: string[];
  /** rounds[r] -> matches indexed by match number. */
  byRound: LiveBracketMatch[][];
  bronze: LiveBracketMatch | null;
}

/**
 * The tree needs a standard shape: each round has half the matches of the one
 * before, numbered 0..n-1 (the shared builder's layout). Anything else returns
 * null and the caller shows plain columns instead.
 */
export function treeLayout(elim: LiveBracketMatch[]): TreeLayout | null {
  const rounds = [...new Set(elim.filter((m) => m.round !== "bronze").map((m) => m.round))]
    .sort((a, b) => (ORDER[a] ?? 9) - (ORDER[b] ?? 9));
  if (rounds.length === 0) return null;
  const byRound: LiveBracketMatch[][] = [];
  let expected = 0;
  for (let r = 0; r < rounds.length; r++) {
    const list = elim.filter((m) => m.round === rounds[r]).sort((a, b) => a.matchNumber - b.matchNumber);
    if (r === 0) expected = list.length;
    if (list.length !== expected || list.some((m, i) => m.matchNumber !== i)) return null;
    byRound.push(list);
    expected = expected / 2;
  }
  if (byRound[byRound.length - 1].length !== 1) return null;
  return { rounds, byRound, bronze: elim.find((m) => m.round === "bronze") ?? null };
}

// A first-round slot empty on both sides is a permanent bye: space kept, nothing drawn.
// Only in the REAL first round: a later round's empty match is just TBD.
const isBye = (m: LiveBracketMatch) => m.team1.length === 0 && m.team2.length === 0;

/**
 * Where the tree opens: the earliest round that still has a match to play.
 * A 32-team bracket is ~1,340px wide and ~1,900px tall, wider than its box,
 * so once the round of 32 was over the later rounds sat off to the right
 * behind an easy-to-miss scrollbar and looked gone (owner, 2026-10-09).
 * Finished rounds fold away behind "Show earlier rounds". A finished
 * bracket shows whole.
 */
function openingRound(byRound: LiveBracketMatch[][]): number {
  const r = byRound.findIndex((list, i) => list.some((m) => !m.completed && !(i === 0 && isBye(m))));
  return r < 0 ? 0 : r;
}

export function LiveBracketTree({
  layout, queue, currentUserId, onOpen,
}: {
  layout: TreeLayout;
  queue: Map<string, number>;
  currentUserId: string | null;
  onOpen: (m: LiveBracketMatch) => void;
}) {
  const [showEarlier, setShowEarlier] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const startAt = openingRound(layout.byRound);
  const start = showEarlier ? 0 : startAt;
  const rounds = layout.rounds.slice(start);
  const byRound = layout.byRound.slice(start);
  const { bronze } = layout;
  const isEmptySlot = (m: LiveBracketMatch, r: number) => start === 0 && r === 0 && isBye(m);
  const all = [...byRound.flat(), ...(bronze ? [bronze] : [])];

  // Arrows and fades only while there is more tree to one side.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [start, rounds.length]);
  const nudge = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * (CARD_W + COL_GAP), behavior: "smooth" });
  const rowH = maxTeamSize(all.flatMap((m) => [m.team1People, m.team2People])) > 1 ? ROW_H_TWO : ROW_H_ONE;
  const CARD_H = rowH * 2 + 1 + COURT_H;
  const UNIT = CARD_H + ROW_GAP;
  const first = byRound[0].length;
  const top = (r: number, i: number) => HEADER + (i * 2 ** r + (2 ** r - 1) / 2) * UNIT;
  const left = (r: number) => r * (CARD_W + COL_GAP);
  const finalR = rounds.length - 1;
  const bronzeTop = top(finalR, 0) + CARD_H + 44;
  const height = Math.max(HEADER + first * UNIT, bronze ? bronzeTop + CARD_H + 8 : 0);
  const width = rounds.length * (CARD_W + COL_GAP) - COL_GAP;
  const games = Math.max(1, ...byRound.flat().map((m) => Math.max(m.games1.length, m.games2.length)), bronze ? Math.max(bronze.games1.length, bronze.games2.length) : 1);

  // Connector: feeder's right edge -> midway -> down/up -> next match's left edge.
  const paths: string[] = [];
  for (let r = 1; r < byRound.length; r++) {
    byRound[r].forEach((_, i) => {
      const y2 = top(r, i) + CARD_H / 2;
      const x2 = left(r);
      const xm = x2 - COL_GAP / 2;
      for (const f of [2 * i, 2 * i + 1]) {
        const feeder = byRound[r - 1][f];
        if (!feeder || isEmptySlot(feeder, r - 1)) continue;
        const y1 = top(r - 1, f) + CARD_H / 2;
        paths.push(`M ${left(r - 1) + CARD_W} ${y1} H ${xm} V ${y2} H ${x2}`);
      }
    });
  }

  return (
    <div className="space-y-2">
      {(startAt > 0 || edges.left || edges.right) && (
        <div className="flex items-center gap-2">
          {startAt > 0 && (
            <button
              onClick={() => setShowEarlier((v) => !v)}
              className="h-8 px-3 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground"
            >
              {showEarlier ? "Hide earlier rounds" : `Show earlier rounds (${layout.rounds.slice(0, startAt).map((r) => roundName(r, null)).join(", ")})`}
            </button>
          )}
          {(edges.left || edges.right) && (
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => nudge(-1)} disabled={!edges.left} aria-label="Scroll to earlier rounds"
                className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30">
                <CaretLeft size={14} weight="bold" />
              </button>
              <button onClick={() => nudge(1)} disabled={!edges.right} aria-label="Scroll to later rounds"
                className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30">
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
          )}
        </div>
      )}
    <div className="relative">
      {edges.left && <div className="pointer-events-none absolute inset-y-0 left-0 w-10 z-10 bg-gradient-to-r from-background to-transparent" />}
      {edges.right && <div className="pointer-events-none absolute inset-y-0 right-0 w-10 z-10 bg-gradient-to-l from-background to-transparent" />}
    <div ref={scroller} className="scrollbar-thin overflow-x-auto pb-2">
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0 pointer-events-none text-border" width={width} height={height} aria-hidden>
          {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />)}
        </svg>
        {rounds.map((round, r) => (
          <p key={round} className="absolute font-mono text-[10px] tracking-widest text-muted-foreground" style={{ left: left(r), top: 0 }}>
            {roundName(round, null).toUpperCase()}
          </p>
        ))}
        {byRound.map((list, r) => list.map((m, i) => isEmptySlot(m, r) ? null : (
          <TreeCard
            key={m.id}
            m={m}
            games={games}
            opening={start === 0 && r === 0}
            queuePos={queue.get(m.id)}
            currentUserId={currentUserId}
            onOpen={onOpen}
            rowH={rowH}
            style={{ left: left(r), top: top(r, i) }}
          />
        )))}
        {bronze && (
          <>
            <p className="absolute font-mono text-[10px] tracking-widest text-muted-foreground" style={{ left: left(finalR), top: bronzeTop - 18 }}>
              3RD PLACE
            </p>
            <TreeCard
              m={bronze}
              games={games}
              opening={false}
              queuePos={queue.get(bronze.id)}
              currentUserId={currentUserId}
              onOpen={onOpen}
              rowH={rowH}
              style={{ left: left(finalR), top: bronzeTop }}
            />
          </>
        )}
      </div>
    </div>
    </div>
    </div>
  );
}

function TreeCard({
  m, games, opening, queuePos, currentUserId, onOpen, rowH, style,
}: {
  m: LiveBracketMatch;
  games: number;
  opening: boolean;
  queuePos: number | undefined;
  currentUserId: string | null;
  onOpen: (m: LiveBracketMatch) => void;
  rowH: number;
  style: React.CSSProperties;
}) {
  const live = !!m.court && !m.completed;
  const upNext = !live && !m.completed && queuePos !== undefined && queuePos <= UP_NEXT_SHOWN ? queuePos : undefined;

  const row = (members: string[], name: string | null, people: TeamPerson[] | undefined, seed: number | null, scores: number[], won: boolean) => {
    const mine = !!currentUserId && members.includes(currentUserId);
    const empty = members.length === 0;
    return (
      <div className={`flex items-center ${won ? "bg-primary/10 font-semibold text-foreground" : "text-muted-foreground"}`} style={{ height: rowH }}>
        <span className="w-6 text-center font-mono text-[10px] flex-shrink-0">{seed ?? ""}</span>
        <span className={`flex-1 min-w-0 text-[13px] leading-4 ${mine ? "text-primary" : ""}`}>
          {empty
            ? <span className="block truncate">{m.completed || opening ? <i>Bye</i> : "TBD"}</span>
            : <TeamNameLines people={people} fallback={name} />}
        </span>
        {Array.from({ length: games }, (_, g) => (
          <span key={g} className={`w-6 text-center font-mono text-[12px] border-l border-border h-full flex items-center justify-center ${won && scores[g] != null ? "text-foreground" : ""}`}>
            {scores[g] ?? ""}
          </span>
        ))}
      </div>
    );
  };

  return (
    <button
      onClick={() => onOpen(m)}
      className={`absolute flex rounded-lg border bg-card text-left overflow-visible hover:border-primary/60 transition-colors ${
        live || upNext === 1 ? "border-amber-400/70" : "border-border"
      }`}
      style={{ ...style, width: CARD_W, height: rowH * 2 + 1 + COURT_H }}
      aria-label={`Match ${m.matchNumber + 1}: ${m.team1Name ?? "TBD"} vs ${m.team2Name ?? "TBD"}`}
    >
      <span className="w-7 flex-shrink-0 border-r border-border flex flex-col items-center justify-center gap-1 font-mono text-[10px] text-muted-foreground">
        {m.matchNumber + 1}
        {m.editedAt && <Info size={10} className="text-primary" aria-label="Score edited" />}
      </span>
      <span className="flex-1 min-w-0 flex flex-col">
        {row(m.team1, m.team1Name, m.team1People, m.seed1, m.games1, m.winner === 1)}
        <span className="h-px bg-border" />
        {row(m.team2, m.team2Name, m.team2People, m.seed2, m.games2, m.winner === 2)}
        <span className={`h-[17px] px-1.5 border-t border-border font-mono text-[9px] tracking-widest leading-[16px] truncate ${live ? "text-amber-500" : "text-primary/80"}`}>
          {m.court ? (live ? `● ON ${courtLabel(m.court).toUpperCase()}` : courtLabel(m.court).toUpperCase()) : ""}
        </span>
      </span>
      {upNext !== undefined && (
        <span className={`absolute -top-2 right-2 px-1.5 rounded font-mono text-[8px] tracking-widest leading-[14px] ${
          upNext === 1 ? "bg-amber-400 text-black" : "bg-card border border-destructive/40 text-destructive"
        }`}>
          {upNext === 1 ? "UP NEXT" : `ON DECK #${upNext}`}
        </span>
      )}
    </button>
  );
}
