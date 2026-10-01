"use client";

// Live brackets + leaderboard by division, for the public tournament page and
// the director page (DIRECTOR_HUB_WEB_PARITY.md, W1b), laid out like mobile's
// division bracket (director) and player bracket screens, adapted for a wide
// screen: champion banner, summary strip, courts strip, round tabs ("All" keeps
// every round side by side), a Pools | Bracket switch for pool divisions, and
// match cards with match number, status, seeds, UP NEXT / ON DECK, court and
// "YOU". With `director`, cards also get Assign court, Enter score and Edit
// score, and a division with semifinals but no 3rd-place match gets Add
// 3rd-place match. The database checks every action. Updates live.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trophy, PencilSimple, Medal, CheckFat, MapPin, Megaphone, Hourglass, Clock, X } from "@phosphor-icons/react";
import { divisionLeaderboard, type LeaderboardEntry } from "@shared/leaderboard";
import { courtLabel } from "@shared/tournamentCourts";
import {
  addThirdPlaceMatch, type LiveBracketMatch, type LiveDivision,
} from "@/lib/tournament/live-brackets";
import { useLiveTournament, useLiveTournamentData } from "@/components/tournament/live-tournament-context";
import { assignCourt, recordScore, roundName, setDivisionPlayStatus } from "@/lib/tournament/day-of";
import { EditScoreDialog, ScoreEditInfo } from "@/components/tournament/score-edit";
import { ScoreEntryDialog } from "@/components/tournament/score-entry-dialog";
import { TeamNameLines, vsShort } from "@/components/tournament/team-name";
import { makeTeamShortener, teamFull, type TeamPerson } from "@shared/teamNames";
import { PoolStandingsTable, usePoolStandings } from "@/components/tournament/pool-standings";
import { LiveBracketTree, treeLayout } from "@/components/tournament/live-bracket-tree";

const DISPLAY_ORDER: Record<string, number> = { pool: 0, r64: 1, r32: 2, r16: 3, qf: 4, sf: 5, final: 7, bronze: 8 };
const UP_NEXT_SHOWN = 5;

type View = "bracket" | "leaderboard";
type Stage = "pools" | "bracket";


export function LiveBrackets({
  tournamentId, initialView = "bracket", currentUserId = null, director = false,
}: {
  tournamentId: string;
  initialView?: View;
  currentUserId?: string | null;
  director?: boolean;
}) {
  // Shared page data when a LiveTournamentProvider is above; otherwise our own.
  const shared = useLiveTournament();
  const own = useLiveTournamentData(shared ? null : tournamentId);
  const live = shared ?? own;
  const { divisions, ctx, error } = live;
  const load = live.reload;
  const [pickedDivisionId, setDivisionId] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [stage, setStage] = useState<Stage | null>(null);
  const [roundTab, setRoundTab] = useState<string>("all");
  const [editing, setEditing] = useState<LiveBracketMatch | null>(null);
  const [scoring, setScoring] = useState<LiveBracketMatch | null>(null);
  const [courtFor, setCourtFor] = useState<LiveBracketMatch | null>(null);
  // The tree's compact card opens the full card here (by id, so it stays live).
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const divisionId = pickedDivisionId && divisions?.some((d) => d.id === pickedDivisionId)
    ? pickedDivisionId
    : divisions?.[0]?.id ?? null;

  // The Live Queue panel asked to show a match: switch to its division and
  // open its card (pools or bracket as needed).
  const focusNonce = live.focus?.nonce;
  useEffect(() => {
    const f = live.focus;
    if (!f) return;
    const m = divisions?.find((d) => d.id === f.divisionId)?.matches.find((x) => x.id === f.matchId);
    // Responding to an explicit request from the queue panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDivisionId(f.divisionId);
    setView("bracket");
    setRoundTab("all");
    setStage(m?.poolLabel ? "pools" : "bracket");
    setOpenId(f.matchId);
    // Only a new request should move the view, not every live refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const division = divisions?.find((d) => d.id === divisionId) ?? null;
  const board = useMemo(() => (division ? divisionLeaderboard(division.matches) : []), [division]);

  // Every unfinished match holding a court, across all divisions.
  const onCourt = useMemo(() => {
    const map = new Map<string, { m: LiveBracketMatch; division: string }>();
    for (const d of divisions ?? []) for (const m of d.matches) if (m.court && !m.completed) map.set(m.court, { m, division: d.name });
    return map;
  }, [divisions]);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) { toast.error(result.error); await load(); return false; }
    toast.success(success);
    await load();
    return true;
  }

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

  const poolMatches = division?.matches.filter((m) => m.poolLabel) ?? [];
  const elim = division?.matches.filter((m) => !m.poolLabel) ?? [];
  const hasPools = poolMatches.length > 0;
  const hasBracket = elim.length > 0;
  const shownStage: Stage = hasPools && (!hasBracket || stage === "pools") ? "pools" : "bracket";

  const canAddThirdPlace = director && !!division
    && elim.filter((m) => m.round === "sf").length === 2
    && !elim.some((m) => m.round === "bronze");

  // Opening an action from the full card closes it, so dialogs don't stack.
  const cardProps = {
    currentUserId,
    director,
    queue: ctx.queue,
    onEdit: (m: LiveBracketMatch) => { setOpenId(null); setEditing(m); },
    onScore: (m: LiveBracketMatch) => { setOpenId(null); setScoring(m); },
    onCourt: (m: LiveBracketMatch) => { setOpenId(null); setCourtFor(m); },
  };
  const opened = openId ? division?.matches.find((m) => m.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 scrollbar-thin overflow-x-auto pb-1 flex-1 min-w-0">
          {divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => { setDivisionId(d.id); setStage(null); setRoundTab("all"); }}
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

      {division && view === "leaderboard" && <LeaderboardView rows={board} currentUserId={currentUserId} />}

      {division && view === "bracket" && (
        <>
          {hasPools && (
            <div className="flex rounded-full border border-border p-0.5 w-fit">
              {(["pools", "bracket"] as const).map((v) => {
                const disabled = v === "bracket" && !hasBracket;
                const scored = poolMatches.filter((m) => m.completed).length;
                return (
                  <button
                    key={v}
                    disabled={disabled}
                    onClick={() => setStage(v)}
                    className={`px-3.5 h-8 rounded-full font-mono text-[10px] tracking-widest disabled:opacity-40 ${shownStage === v ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                  >
                    {v === "pools" ? `POOLS · ${scored}/${poolMatches.length}` : hasBracket ? "BRACKET" : "BRACKET (AFTER POOLS)"}
                  </button>
                );
              })}
            </div>
          )}

          {shownStage === "bracket" && hasBracket && <ChampionBanner elim={elim} currentUserId={currentUserId} />}
          {shownStage === "bracket" && hasBracket && <SummaryStrip elim={elim} />}

          {ctx.courts.length > 0 && (
            <CourtsStrip courts={ctx.courts} onCourt={onCourt} autoAssign={ctx.autoAssign} />
          )}

          {canAddThirdPlace && shownStage === "bracket" && (
            <ThirdPlaceBanner
              busy={busy}
              onAdd={() => {
                if (!window.confirm(`Add a 3rd-place match to ${division.name}?`)) return;
                run(() => addThirdPlaceMatch(tournamentId, division.id), "3rd-place match added.");
              }}
            />
          )}

          {shownStage === "pools"
            ? <PoolsView division={division} {...cardProps} />
            : <BracketView elim={elim} roundTab={roundTab} setRoundTab={setRoundTab} onOpen={(m) => setOpenId(m.id)} {...cardProps} />}
        </>
      )}

      {opened && division && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
                {division.name.toUpperCase()} · {roundName(opened.round, opened.poolLabel).toUpperCase()}
              </p>
              <button onClick={() => setOpenId(null)} aria-label="Close" className="h-8 w-8 rounded-full border border-border bg-card flex items-center justify-center hover:bg-secondary">
                <X size={14} weight="bold" />
              </button>
            </div>
            <MatchCard m={opened} opening={false} {...cardProps} />
          </div>
        </div>
      )}

      {editing && (
        <EditScoreDialog
          match={{
            id: editing.id, team1: editing.team1Name, team2: editing.team2Name,
            team1People: editing.team1People, team2People: editing.team2People,
            score1: editing.score1, score2: editing.score2,
          }}
          poolRebuildHint={!!editing.poolLabel && hasBracket}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); toast.success("Score corrected."); await load(); }}
        />
      )}

      {scoring && (
        <ScoreEntryDialog
          team1={scoring.team1Name}
          team2={scoring.team2Name}
          team1People={scoring.team1People}
          team2People={scoring.team2People}
          busy={busy}
          onClose={() => setScoring(null)}
          onSave={async (a, b) => {
            const ok = await run(() => recordScore(scoring.id, a, b), "Score saved.");
            if (ok) setScoring(null);
          }}
        />
      )}

      {courtFor && division && (
        <CourtPickerDialog
          match={courtFor}
          division={division}
          courts={ctx.courts}
          onCourt={onCourt}
          busy={busy}
          onClose={() => setCourtFor(null)}
          onAssign={async (court, start) => {
            const ok = await run(
              () => assignCourt(courtFor.id, court),
              court ? `Assigned to ${courtLabel(court)}.` : "Court cleared.",
            );
            if (!ok) return;
            setCourtFor(null);
            // Assign first: going live fills free courts at once, and could hand
            // the chosen court to a different match if it went first.
            if (court && start) await run(() => setDivisionPlayStatus(division.id, "live"), `${division.name}: live.`);
          }}
        />
      )}
    </div>
  );
}

// ─── Banners and strips ──────────────────────────────────────────────────────

function ChampionBanner({ elim, currentUserId }: { elim: LiveBracketMatch[]; currentUserId: string | null }) {
  const final = elim.find((m) => m.round === "final");
  const bronze = elim.find((m) => m.round === "bronze");
  if (!final?.completed || !final.winner || (bronze && !bronze.completed)) return null;
  const champ = final.winner === 1 ? final.team1Name : final.team2Name;
  const runner = final.winner === 1 ? final.team2Name : final.team1Name;
  const champMembers = final.winner === 1 ? final.team1 : final.team2;
  const runnerMembers = final.winner === 1 ? final.team2 : final.team1;
  const third = bronze?.winner ? (bronze.winner === 1 ? bronze.team1Name : bronze.team2Name) : null;
  const champPeople = final.winner === 1 ? final.team1People : final.team2People;
  const runnerPeople = final.winner === 1 ? final.team2People : final.team1People;
  const thirdPeople = bronze?.winner ? (bronze.winner === 1 ? bronze.team1People : bronze.team2People) : undefined;
  // The runner-up line is one line, so it uses the short form.
  const short = makeTeamShortener([champPeople, runnerPeople, thirdPeople].filter((t): t is TeamPerson[] => !!t?.length));
  const oneLine = (people: TeamPerson[] | undefined, name: string | null) => (people?.length ? short(people) : name);
  const you = (members: string[]) => !!currentUserId && members.includes(currentUserId);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
      <Trophy size={22} weight="fill" className="text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] tracking-widest text-primary">CHAMPION</p>
        <div className="font-semibold">
          <TeamNameLines people={champPeople} fallback={champ} />
          {you(champMembers) && <YouBadge />}
        </div>
        <p
          className="text-xs text-muted-foreground truncate"
          title={[runnerPeople?.length ? teamFull(runnerPeople) : runner, thirdPeople?.length ? teamFull(thirdPeople) : third].filter(Boolean).join(" · ")}
        >
          Runner-up: {oneLine(runnerPeople, runner)}{you(runnerMembers) && <YouBadge />}{third ? ` · 3rd: ${oneLine(thirdPeople, third)}` : ""}
        </p>
      </div>
    </div>
  );
}

function SummaryStrip({ elim }: { elim: LiveBracketMatch[] }) {
  const first = elim.filter((m) => m.round !== "bronze").sort((a, b) => (DISPLAY_ORDER[a.round] ?? 9) - (DISPLAY_ORDER[b.round] ?? 9))[0]?.round;
  const opening = elim.filter((m) => m.round === first);
  const teams = new Set(opening.flatMap((m) => [m.team1, m.team2]).filter((t) => t.length).map((t) => t.join("|"))).size;
  const real = elim.filter((m) => !(m.round === first && m.team1.length === 0 && m.team2.length === 0));
  const played = real.filter((m) => m.completed && m.team1.length && m.team2.length).length;
  const remaining = real.filter((m) => !m.completed).length;
  const final = elim.find((m) => m.round === "final");
  const bronze = elim.find((m) => m.round === "bronze");
  const status = final?.completed && (!bronze || bronze.completed) ? "COMPLETED" : elim.some((m) => m.winner && m.team1.length && m.team2.length) ? "IN PROGRESS" : "READY";
  const cells: [string, number, string][] = [
    ["TEAMS", teams, ""],
    ["BRACKET", opening.length * 2, ""],
    ["PLAYED", played, "text-green-500"],
    ["REMAINING", remaining, remaining > 0 ? "text-primary" : "text-green-500"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3">
      {cells.map(([label, n, cls]) => (
        <div key={label} className="text-center">
          <div className={`font-display text-xl leading-none ${cls}`}>{n}</div>
          <div className="font-mono text-[9px] tracking-widest text-muted-foreground mt-1">{label}</div>
        </div>
      ))}
      <span className={`ml-auto px-2.5 py-1 rounded-full border font-mono text-[9px] tracking-widest ${status === "COMPLETED" ? "border-green-500/40 bg-green-500/10 text-green-500" : "border-primary/40 bg-primary/10 text-primary"}`}>
        {status}
      </span>
    </div>
  );
}

function CourtsStrip({
  courts, onCourt, autoAssign,
}: {
  courts: string[];
  onCourt: Map<string, { m: LiveBracketMatch; division: string }>;
  autoAssign: boolean;
}) {
  const all = [...courts, ...[...onCourt.keys()].filter((c) => !courts.includes(c))];
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">COURTS</p>
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">AUTO-ASSIGN {autoAssign ? "ON" : "OFF"}</p>
      </div>
      <div className="flex gap-2 scrollbar-thin overflow-x-auto pb-1">
        {all.map((c) => {
          const on = onCourt.get(c);
          return (
            <div key={c} className={`flex-shrink-0 rounded-xl border px-3 py-1.5 min-w-[7rem] ${on ? "border-amber-400/60 bg-amber-400/10" : "border-border bg-card"}`}>
              <div className={`text-xs font-semibold ${on ? "text-amber-500" : ""}`}>{courtLabel(c)}</div>
              <div className="text-[10px] text-muted-foreground truncate max-w-[10rem]">
                {on ? `${on.division} · ${roundName(on.m.round, on.m.poolLabel)} · M${on.m.matchNumber + 1}` : "Free"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThirdPlaceBanner({ busy, onAdd }: { busy: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5">
      <Medal size={16} className="text-muted-foreground flex-shrink-0" />
      <p className="flex-1 min-w-[12rem] text-xs text-muted-foreground">
        No 3rd-place match. The two semifinal losers can play for 3rd; semifinals already played send their loser straight away. No scores change.
      </p>
      <button
        disabled={busy}
        onClick={onAdd}
        className="h-8 px-3 rounded-full border border-border hover:bg-secondary font-mono text-[10px] tracking-widest disabled:opacity-40"
      >
        ADD 3RD-PLACE MATCH
      </button>
    </div>
  );
}

// ─── Bracket and pools ───────────────────────────────────────────────────────

type CardActions = {
  currentUserId: string | null;
  director: boolean;
  queue: Map<string, number>;
  onEdit: (m: LiveBracketMatch) => void;
  onScore: (m: LiveBracketMatch) => void;
  onCourt: (m: LiveBracketMatch) => void;
};

function BracketView({
  elim, roundTab, setRoundTab, onOpen, ...actions
}: { elim: LiveBracketMatch[]; roundTab: string; setRoundTab: (r: string) => void; onOpen: (m: LiveBracketMatch) => void } & CardActions) {
  const layout = treeLayout(elim);
  const rounds = [...new Set(elim.map((m) => m.round))].sort((a, b) => (DISPLAY_ORDER[a] ?? 9) - (DISPLAY_ORDER[b] ?? 9));
  const first = rounds.find((r) => r !== "bronze");
  // A first-round slot empty on both sides is a permanent bye: never shown (as on mobile).
  const visible = (round: string) => elim
    .filter((m) => m.round === round && !(round === first && m.team1.length === 0 && m.team2.length === 0))
    .sort((a, b) => a.matchNumber - b.matchNumber);
  const active = rounds.includes(roundTab) ? roundTab : "all";

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 scrollbar-thin overflow-x-auto pb-1">
        {["all", ...rounds].map((r) => (
          <button
            key={r}
            onClick={() => setRoundTab(r)}
            className={`px-3 h-8 rounded-full border text-xs whitespace-nowrap ${active === r ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {r === "all" ? "All" : roundName(r, null)}
          </button>
        ))}
      </div>
      {active === "all" && layout && (
        // Wide screens: the bracket tree with connector lines. Phones keep columns.
        <div className="hidden md:block">
          <LiveBracketTree layout={layout} queue={actions.queue} currentUserId={actions.currentUserId} onOpen={onOpen} />
        </div>
      )}
      {active === "all" ? (
        <div className={`scrollbar-thin overflow-x-auto pb-2 -mx-1 px-1 ${layout ? "md:hidden" : ""}`}>
          <div className="flex gap-4 min-w-max">
            {rounds.map((round) => (
              <div key={round} className="w-64 flex-shrink-0">
                <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">{roundName(round, null).toUpperCase()}</p>
                <div className="space-y-2">
                  {visible(round).map((m) => <MatchCard key={m.id} m={m} opening={round === first} {...actions} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible(active).map((m) => <MatchCard key={m.id} m={m} opening={active === first} {...actions} />)}
        </div>
      )}
    </div>
  );
}

function PoolsView({ division, ...actions }: { division: LiveDivision } & CardActions) {
  const { pools: standings } = usePoolStandings(division.id, division.matches);
  const pools = new Map<string, LiveBracketMatch[]>();
  for (const m of division.matches) if (m.poolLabel) pools.set(m.poolLabel, [...(pools.get(m.poolLabel) ?? []), m]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[...pools.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, list]) => {
        const pool = standings?.find((p) => p.label === label);
        return (
          <div key={label} className="rounded-2xl border border-border bg-card p-3 space-y-3">
            <p className="font-mono text-[10px] tracking-widest text-primary">POOL {label}</p>
            {pool && pool.standings.length > 0 && (
              <PoolStandingsTable pool={pool} advancePerPool={division.advancePerPool} currentUserId={actions.currentUserId} />
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {[...list].sort((a, b) => a.matchNumber - b.matchNumber).map((m) => <MatchCard key={m.id} m={m} opening={false} {...actions} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YouBadge() {
  return <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-mono text-[8px] tracking-widest align-middle">YOU</span>;
}

function MatchCard({
  m, opening, currentUserId, director, queue, onEdit, onScore, onCourt,
}: { m: LiveBracketMatch; opening: boolean } & CardActions) {
  const both = m.team1.length > 0 && m.team2.length > 0;
  const bye = m.completed && !both;
  const live = !!m.court && !m.completed;
  const awaiting = !m.completed && !both;
  const pos = !live && !m.completed ? queue.get(m.id) : undefined;
  const upNext = pos !== undefined && pos <= UP_NEXT_SHOWN ? pos : undefined;
  const status = m.completed ? (bye ? "BYE" : "COMPLETED") : live ? "LIVE" : both ? "SCHEDULED" : "PENDING";
  const statusCls = status === "COMPLETED" ? "border-green-500/40 text-green-500"
    : status === "LIVE" ? "border-amber-400/60 bg-amber-400/10 text-amber-500"
    : status === "SCHEDULED" ? "border-primary/40 text-primary"
    : "border-border text-muted-foreground";
  const editable = director && m.completed && both && m.score1 != null && m.score2 != null;

  const side = (members: string[], name: string | null, people: TeamPerson[] | undefined, seed: number | null, score: number | null, won: boolean) => {
    const mine = !!currentUserId && members.includes(currentUserId);
    const empty = members.length === 0;
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 ${won ? "font-semibold text-foreground" : "text-muted-foreground"} ${mine ? "bg-primary/10" : ""}`}>
        <span className="w-5 text-center font-mono text-[10px] text-muted-foreground flex-shrink-0">{seed ?? ""}</span>
        <span className="flex-1 min-w-0 text-sm">
          {empty
            ? <span className="block truncate">{m.completed || opening ? <span className="italic">Bye</span> : "TBD"}</span>
            : <TeamNameLines people={people} fallback={name} />}
          {mine && <YouBadge />}
        </span>
        {won && <Trophy size={11} weight="fill" className="text-primary flex-shrink-0" />}
        <span className="font-mono text-sm w-5 text-right">{score ?? ""}</span>
      </div>
    );
  };

  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${live ? "border-amber-400/60" : upNext === 1 ? "border-amber-400/60" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 pt-2 font-mono text-[9px] tracking-widest">
        <span className="text-muted-foreground">MATCH {m.matchNumber + 1}</span>
        <span className="flex-1" />
        {m.editedAt && (
          <ScoreEditInfo matchId={m.id} editedAt={m.editedAt} prev={m.prevScore} now={{ s1: m.score1, s2: m.score2 }} director={director} />
        )}
        <span className={`px-1.5 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
      </div>

      {upNext !== undefined && (
        <div className={`mx-2.5 mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9px] tracking-widest ${
          upNext === 1 ? "bg-amber-400 text-black animate-pulse motion-reduce:animate-none" : "bg-destructive/10 text-destructive"
        }`}>
          {upNext === 1 ? <Megaphone size={11} weight="fill" /> : <Hourglass size={10} />}
          {upNext === 1 ? "UP NEXT" : `ON DECK #${upNext}`}
        </div>
      )}

      {m.court && (
        <div className={`mx-2.5 mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[9px] tracking-widest ${live ? "bg-amber-400 text-black" : "border border-border text-muted-foreground"}`}>
          <MapPin size={10} weight="fill" />
          {live ? `ON ${courtLabel(m.court).toUpperCase()}` : courtLabel(m.court)}
        </div>
      )}

      <div className="mt-1.5">
        {side(m.team1, m.team1Name, m.team1People, m.seed1, m.score1, m.winner === 1)}
        <div className="h-px bg-border" />
        {side(m.team2, m.team2Name, m.team2People, m.seed2, m.score2, m.winner === 2)}
      </div>

      {awaiting && !opening && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t border-border text-[11px] text-muted-foreground">
          <Clock size={11} /> Awaiting previous round
        </div>
      )}

      {director && !m.completed && both && (
        <div className="flex gap-1.5 p-2 border-t border-border">
          <button onClick={() => onCourt(m)} className="flex-1 h-8 rounded-full border border-border hover:bg-secondary font-mono text-[10px] tracking-widest flex items-center justify-center gap-1">
            <MapPin size={11} /> {m.court ? courtLabel(m.court).toUpperCase() : "ASSIGN COURT"}
          </button>
          <button onClick={() => onScore(m)} className="flex-1 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-[10px] tracking-widest flex items-center justify-center gap-1">
            <CheckFat size={11} weight="fill" /> ENTER SCORE
          </button>
        </div>
      )}

      {editable && (
        <div className="p-2 border-t border-border">
          <button onClick={() => onEdit(m)} className="w-full h-8 rounded-full border border-border hover:bg-secondary font-mono text-[10px] tracking-widest flex items-center justify-center gap-1">
            <PencilSimple size={11} weight="bold" /> EDIT SCORE
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Court picker (director) ─────────────────────────────────────────────────

function CourtPickerDialog({
  match, division, courts, onCourt, busy, onClose, onAssign,
}: {
  match: LiveBracketMatch;
  division: LiveDivision;
  courts: string[];
  onCourt: Map<string, { m: LiveBracketMatch; division: string }>;
  busy: boolean;
  onClose: () => void;
  onAssign: (court: string | null, startDivision: boolean) => void;
}) {
  const notLive = division.playStatus !== "live";
  const [start, setStart] = useState(true);
  const all = [...courts, ...[...onCourt.keys()].filter((c) => !courts.includes(c))];
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-2xl tracking-wide">ASSIGN COURT</h3>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
            <X size={14} weight="bold" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3 truncate" title={`${match.team1Name ?? "TBD"} vs ${match.team2Name ?? "TBD"}`}>
          {vsShort(match)}
        </p>
        {notLive && (
          <label className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 mb-3 text-xs">
            <input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} className="mt-0.5" />
            <span>
              {division.name} is {division.playStatus === "paused" ? "paused" : "not started"}, so it won’t get courts on its own.
              {" "}{division.playStatus === "paused" ? "Resume" : "Start"} it when assigning.
            </span>
          </label>
        )}
        {all.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courts yet. Add them in Day Of → Edit courts.</p>
        ) : (
          <div className="space-y-1.5">
            {all.map((c) => {
              const holder = onCourt.get(c);
              const mine = holder?.m.id === match.id;
              const inUse = !!holder && !mine;
              return (
                <button
                  key={c}
                  disabled={busy || inUse || mine}
                  onClick={() => onAssign(c, notLive && start)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:cursor-default ${
                    mine ? "border-primary bg-primary/10" : inUse ? "border-border opacity-60" : "border-border hover:border-primary/60 hover:bg-secondary"
                  }`}
                >
                  <span className="text-sm font-semibold w-20 flex-shrink-0">{courtLabel(c)}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {mine ? "This match" : inUse ? `In use · ${holder!.division} · ${roundName(holder!.m.round, holder!.m.poolLabel)} · M${holder!.m.matchNumber + 1}` : "Available"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {match.court && (
          <button
            disabled={busy}
            onClick={() => onAssign(null, false)}
            className="mt-3 w-full h-10 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10 text-xs font-display tracking-wider disabled:opacity-40"
          >
            CLEAR COURT
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

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

