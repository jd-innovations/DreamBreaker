"use client";

// Director Day Of tab on live data (DIRECTOR_HUB_WEB_PARITY.md, W1). Same
// courts, queue, scores and division status as mobile's Command Center and
// bracket screens, updated live from either device. The desk layout stays:
// a courts board you can drag matches onto, with a court picker on each queue
// row for touch screens where drag and drop doesn't work.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckFat, DotsSixVertical, PencilSimple, SoccerBall, X } from "@phosphor-icons/react";
import { DivisionPlayButton, DivisionPlayChip, PLAY_STATUS_LABEL, confirmPlayChange, divisionPlayState } from "@/components/director/division-play-control";
import { courtLabel, parseCourts } from "@shared/tournamentCourts";
import {
  assignCourt, fetchDayOf, recordScore, roundName, saveCourts, setAutoAssignCourts, setDivisionPlayStatus, subscribeDayOf,
  type DayOfState, type DivisionPlayStatus, type LiveMatch,
} from "@/lib/tournament/day-of";
import { EditScoreDialog, ScoreEditInfo } from "@/components/tournament/score-edit";
import { ScoreEntryDialog } from "@/components/tournament/score-entry-dialog";
import { TeamNameLines } from "@/components/tournament/team-name";
import { makeTeamShortener, teamFull, type TeamPerson } from "@shared/teamNames";


function isReady(m: LiveMatch) {
  return !m.completedAt && !!m.team1 && !!m.team2 && !m.team1.startsWith("TBD") && !m.team2.startsWith("TBD");
}

export function DayOfBoard({ tournamentId, onGoToBracket }: { tournamentId: string; onGoToBracket: () => void }) {
  const [state, setState] = useState<DayOfState | null>(null);
  // One-line rows (queue, completed) use short names ("A. Waters / A. Bright");
  // the board lists every division together, so a clash anywhere keeps full names.
  const short = useMemo(
    () => makeTeamShortener((state?.matches ?? []).flatMap((m) => [m.team1People, m.team2People])),
    [state?.matches],
  );
  const oneLine = useCallback(
    (people: TeamPerson[], name: string | null) => (people.length ? short(people) : name ?? "TBD"),
    [short],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragMatchId, setDragMatchId] = useState<string | null>(null);
  const [dragOverCourt, setDragOverCourt] = useState<string | null>(null);
  const [scoring, setScoring] = useState<LiveMatch | null>(null);
  const [correcting, setCorrecting] = useState<LiveMatch | null>(null);
  const [editingCourts, setEditingCourts] = useState(false);
  const [courtsDraft, setCourtsDraft] = useState("");
  // Hand-assigning in a division that isn't live: offer to start it first.
  const [pendingAssign, setPendingAssign] = useState<{ matchId: string; court: string; divisionId: string; name: string; paused: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await fetchDayOf(tournamentId));
      setLoadError(null);
    } catch {
      setLoadError("Could not load the day’s matches.");
    }
  }, [tournamentId]);

  useEffect(() => {
    // Fetching from the database (an external system) and then subscribing to
    // its changes; load() sets state only after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return subscribeDayOf(tournamentId, load);
  }, [tournamentId, load]);

  const derived = useMemo(() => {
    if (!state) return null;
    const divisionName = new Map(state.divisions.map((d) => [d.id, d.name]));
    const onCourt = new Map<string, LiveMatch>();
    for (const m of state.matches) if (m.court && !m.completedAt) onCourt.set(m.court, m);
    // Courts in use that aren't in the list (renamed mid-event) still show.
    const courts = [...state.courts, ...[...onCourt.keys()].filter((c) => !state.courts.includes(c))];
    const queued = state.matches
      .filter((m) => state.queue.has(m.id) && !m.court)
      .sort((a, b) => state.queue.get(a.id)! - state.queue.get(b.id)!);
    const waiting = state.matches.filter((m) => isReady(m) && !m.court && !state.queue.has(m.id));
    const completed = state.matches
      .filter((m) => m.completedAt && m.team1 && m.team2 && m.winner)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    const finished = new Set(
      state.matches.filter((m) => m.round === "final" && !m.poolLabel && m.winner).map((m) => m.divisionId),
    );
    const onCourtByDivision = new Map<string, number>();
    for (const m of onCourt.values()) {
      if (m.divisionId) onCourtByDivision.set(m.divisionId, (onCourtByDivision.get(m.divisionId) ?? 0) + 1);
    }
    return { divisionName, onCourt, courts, queued, waiting, completed, finished, onCourtByDivision };
  }, [state]);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
        <button onClick={load} className="h-10 px-6 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm">TRY AGAIN</button>
      </div>
    );
  }
  if (!state || !derived) {
    return <div className="flex justify-center py-16"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  }

  const { divisionName, onCourt, courts, queued, waiting, completed, finished, onCourtByDivision } = derived;
  const freeCourts = courts.filter((c) => !onCourt.has(c));
  const hasMatches = state.matches.some((m) => m.team1 || m.team2);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) { toast.error(result.error); await load(); return false; }
    if (success) toast.success(success);
    await load();
    return true;
  }

  function assign(matchId: string, court: string) {
    const match = state?.matches.find((m) => m.id === matchId);
    const division = state?.divisions.find((d) => d.id === match?.divisionId);
    if (division && division.playStatus !== "live") {
      setPendingAssign({ matchId, court, divisionId: division.id, name: division.name, paused: division.playStatus === "paused" });
      return;
    }
    return run(() => assignCourt(matchId, court), `Assigned to ${courtLabel(court)}.`);
  }

  // Assign first: going live fills free courts at once, and could hand the
  // chosen court to a different match if it went first.
  async function confirmAssign(start: boolean) {
    const p = pendingAssign;
    if (!p) return;
    setPendingAssign(null);
    const assigned = await run(() => assignCourt(p.matchId, p.court), `Assigned to ${courtLabel(p.court)}.`);
    if (assigned && start) await run(() => setDivisionPlayStatus(p.divisionId, "live"), `${p.name}: live.`);
  }

  function changeStatus(divisionId: string, name: string, status: DivisionPlayStatus) {
    if (!confirmPlayChange(name, status)) return;
    run(() => setDivisionPlayStatus(divisionId, status), `${name}: ${PLAY_STATUS_LABEL[status].toLowerCase()}.`);
  }

  async function saveCourtList() {
    const parsed = parseCourts(courtsDraft);
    setBusy(true);
    const result = await saveCourts(tournamentId, parsed);
    setBusy(false);
    if (!result.ok) { toast.error(result.error); return; }
    setEditingCourts(false);
    toast.success(`${result.courts.length} court${result.courts.length === 1 ? "" : "s"} saved.`);
    await load();
  }

  function matchLine(m: LiveMatch) {
    const div = m.divisionId ? divisionName.get(m.divisionId) : null;
    return [div, roundName(m.round, m.poolLabel)].filter(Boolean).join(" · ");
  }

  return (
    <div className="space-y-6">
      {/* Courts list */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
            COURTS · {onCourt.size} IN PLAY
          </span>
          <span className="flex-1" />
          <button
            role="switch"
            aria-checked={state.autoAssign}
            disabled={busy}
            title={state.autoAssign
              ? "Free courts fill on their own from the queue. Turn off to assign every court by hand."
              : "Courts are assigned by hand. Turn on to fill free courts from the queue."}
            onClick={() => {
              const next = !state.autoAssign;
              setState((s) => (s ? { ...s, autoAssign: next } : s));
              run(() => setAutoAssignCourts(tournamentId, next), `Auto-assign ${next ? "on" : "off"}.`);
            }}
            className="flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-full border border-border hover:bg-secondary font-mono text-[10px] tracking-widest disabled:opacity-50"
          >
            AUTO-ASSIGN
            <span className={`relative h-5 w-9 rounded-full transition-colors ${state.autoAssign ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all ${state.autoAssign ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
          {!editingCourts && (
            <button
              onClick={() => { setCourtsDraft(state.courts.join(", ")); setEditingCourts(true); }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-border hover:bg-secondary font-mono text-[10px] tracking-widest"
            >
              <PencilSimple size={11} weight="bold" /> EDIT COURTS
            </button>
          )}
        </div>
        {editingCourts ? (
          <div className="space-y-2">
            <input
              value={courtsDraft}
              onChange={(e) => setCourtsDraft(e.target.value)}
              placeholder="7-12, 14, Stadium"
              className="w-full h-11 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Ranges, lists and names. {parseCourts(courtsDraft).length} court{parseCourts(courtsDraft).length === 1 ? "" : "s"}: {parseCourts(courtsDraft).map(courtLabel).join(", ") || "none"}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setEditingCourts(false)} className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-xs font-display tracking-wider">CANCEL</button>
              <button onClick={saveCourtList} disabled={busy} className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider disabled:opacity-50">SAVE COURTS</button>
            </div>
          </div>
        ) : courts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courts yet. Add the court numbers or names you have for the day.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {courts.map((c) => (
              <span key={c} className="px-2.5 py-1 rounded-full border border-border text-xs font-mono">{courtLabel(c)}</span>
            ))}
          </div>
        )}
      </div>

      {/* Divisions in play */}
      {state.divisions.length > 0 && (
        <div>
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">DIVISIONS · ONLY LIVE DIVISIONS GET COURTS</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {state.divisions.map((d) => {
              const st = divisionPlayState(d.playStatus, finished.has(d.id));
              return (
                <div key={d.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
                  <span className="text-sm font-semibold flex-1 truncate">{d.name}</span>
                  <DivisionPlayChip state={st} onCourt={onCourtByDivision.get(d.id) ?? 0} />
                  {st !== "complete" && (
                    <DivisionPlayButton playStatus={d.playStatus} busy={busy} onChange={(next) => changeStatus(d.id, d.name, next)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasMatches ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <SoccerBall size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="font-display text-xl tracking-wide mb-1">NO MATCHES YET</p>
          <p className="text-sm text-muted-foreground">Build the brackets in the Bracket tab, then return here on tournament day.</p>
          <button onClick={onGoToBracket} className="mt-4 h-10 px-6 rounded-full border border-border hover:bg-secondary font-display tracking-wider text-sm transition-colors">
            GO TO BRACKET
          </button>
        </div>
      ) : (
        <>
          {/* Courts board */}
          {courts.length > 0 && (
            <div>
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">COURTS · DRAG A MATCH FROM THE QUEUE TO ASSIGN</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {courts.map((court) => {
                  const m = onCourt.get(court);
                  const over = dragOverCourt === court && !m;
                  return (
                    <div
                      key={court}
                      onDragOver={(e) => { if (!m) { e.preventDefault(); setDragOverCourt(court); } }}
                      onDragLeave={() => setDragOverCourt(null)}
                      onDrop={() => { setDragOverCourt(null); if (dragMatchId && !m) assign(dragMatchId, court); setDragMatchId(null); }}
                      className={`rounded-2xl border-2 p-3 min-h-[128px] flex flex-col transition-all ${
                        over ? "border-primary bg-primary/5 scale-[1.02]" : m ? "border-primary/40 bg-card" : "border-dashed border-border bg-card/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{courtLabel(court).toUpperCase()}</span>
                        {m && (
                          <button
                            title="Take this match off the court"
                            onClick={() => run(() => assignCourt(m.id, null), `${courtLabel(court)} cleared.`)}
                            className="h-5 w-5 rounded-full hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
                          >
                            <X size={10} weight="bold" />
                          </button>
                        )}
                      </div>
                      {m ? (
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] font-mono text-muted-foreground mb-1.5 truncate">{matchLine(m)}</div>
                            <TeamNameLines people={m.team1People} fallback={m.team1} className="text-sm font-semibold" />
                            <div className="font-mono text-[10px] text-muted-foreground text-center">VS</div>
                            <TeamNameLines people={m.team2People} fallback={m.team2} className="text-sm font-semibold" />
                          </div>
                          <button
                            onClick={() => setScoring(m)}
                            className="mt-3 w-full h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-mono text-[10px] tracking-widest flex items-center justify-center gap-1.5"
                          >
                            <CheckFat size={11} weight="fill" /> SCORE
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground/40">
                          <span className="text-xs font-mono">OPEN</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Queue */}
          <QueueList
            title={`MATCH QUEUE · ${queued.length}`}
            empty="Nothing waiting. Start a division to add its ready matches to the queue."
            matches={queued}
            label={(m) => {
              const pos = state.queue.get(m.id)!;
              return pos === 1 ? "UP NEXT" : pos <= 5 ? `ON DECK #${pos}` : `#${pos}`;
            }}
            highlight={(m) => state.queue.get(m.id) === 1}
            line={matchLine}
            team={oneLine}
            freeCourts={freeCourts}
            busy={busy}
            onDragStart={setDragMatchId}
            onAssign={assign}
          />

          {waiting.length > 0 && (
            <QueueList
              title={`READY · DIVISION NOT LIVE · ${waiting.length}`}
              empty=""
              matches={waiting}
              label={() => "WAITING"}
              highlight={() => false}
              line={matchLine}
              team={oneLine}
              freeCourts={freeCourts}
              busy={busy}
              onDragStart={setDragMatchId}
              onAssign={assign}
            />
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-2">COMPLETED · {completed.length}</p>
              <div className="space-y-1.5">
                {completed.slice(0, 12).map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <CheckFat size={10} weight="fill" className="text-primary flex-shrink-0" />
                    <span className="truncate flex-1 min-w-0" title={`${m.team1 ?? "TBD"} vs ${m.team2 ?? "TBD"}`}>
                      <span className={m.winner === 1 ? "font-semibold" : "text-muted-foreground"}>{oneLine(m.team1People, m.team1)}</span>
                      <span className="font-mono text-xs mx-1.5">{m.score1}–{m.score2}</span>
                      <span className={m.winner === 2 ? "font-semibold" : "text-muted-foreground"}>{oneLine(m.team2People, m.team2)}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground hidden sm:inline">{matchLine(m)}</span>
                    <span className="flex items-center gap-2 font-mono text-[9px] tracking-widest">
                      {m.score1 != null && m.score2 != null && (
                        <button onClick={() => setCorrecting(m)} className="flex items-center gap-1 text-primary hover:underline">
                          <PencilSimple size={10} weight="bold" /> EDIT
                        </button>
                      )}
                    </span>
                    {m.editedAt && (
                      <span className="flex flex-wrap items-center gap-x-2 font-mono text-[9px] tracking-widest">
                        <ScoreEditInfo matchId={m.id} editedAt={m.editedAt} prev={m.prevScore} now={{ s1: m.score1, s2: m.score2 }} director />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {pendingAssign && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <h3 className="font-display text-2xl tracking-wide mb-2">
              {pendingAssign.paused ? "RESUME" : "START"} {pendingAssign.name.toUpperCase()}?
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              {pendingAssign.name} isn’t live, so it won’t get courts on its own. {pendingAssign.paused ? "Resume" : "Start"} it now so its next matches keep getting courts?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => confirmAssign(true)} disabled={busy} className="h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider disabled:opacity-50">
                ASSIGN &amp; {pendingAssign.paused ? "RESUME" : "START"}
              </button>
              <button onClick={() => confirmAssign(false)} disabled={busy} className="h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider disabled:opacity-50">
                ASSIGN ONLY
              </button>
              <button onClick={() => setPendingAssign(null)} className="h-9 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {correcting && (
        <EditScoreDialog
          match={{
            id: correcting.id, team1: correcting.team1, team2: correcting.team2,
            team1People: correcting.team1People, team2People: correcting.team2People,
            score1: correcting.score1, score2: correcting.score2,
          }}
          poolRebuildHint={!!correcting.poolLabel && state.matches.some((x) => x.divisionId === correcting.divisionId && !x.poolLabel)}
          onClose={() => setCorrecting(null)}
          onSaved={async () => { setCorrecting(null); toast.success("Score corrected."); await load(); }}
        />
      )}

      {scoring && (
        <ScoreEntryDialog
          team1={scoring.team1}
          team2={scoring.team2}
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
    </div>
  );
}

function QueueList({
  title, empty, matches, label, highlight, line, team, freeCourts, busy, onDragStart, onAssign,
}: {
  title: string;
  empty: string;
  matches: LiveMatch[];
  label: (m: LiveMatch) => string;
  highlight: (m: LiveMatch) => boolean;
  line: (m: LiveMatch) => string;
  /** One team on one line: short names (teamNames.ts). */
  team: (people: TeamPerson[], name: string | null) => string;
  freeCourts: string[];
  busy: boolean;
  onDragStart: (id: string | null) => void;
  onAssign: (matchId: string, court: string) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground mb-3">{title}</p>
      {matches.length === 0 ? (
        empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => onDragStart(m.id)}
              onDragEnd={() => onDragStart(null)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-grab active:cursor-grabbing ${
                highlight(m) ? "border-amber-400/60 bg-amber-400/10" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <DotsSixVertical size={14} className="text-muted-foreground flex-shrink-0 hidden sm:block" />
              <span className={`font-mono text-[9px] tracking-widest flex-shrink-0 w-20 ${highlight(m) ? "text-amber-500" : "text-muted-foreground"}`}>{label(m)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" title={`${teamFull(m.team1People) || m.team1 || "TBD"} vs ${teamFull(m.team2People) || m.team2 || "TBD"}`}>
                  {team(m.team1People, m.team1)} <span className="font-mono text-[10px] text-muted-foreground font-normal">vs</span> {team(m.team2People, m.team2)}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">{line(m)}</div>
              </div>
              <select
                aria-label="Assign to court"
                disabled={busy || freeCourts.length === 0}
                value=""
                onChange={(e) => { if (e.target.value) onAssign(m.id, e.target.value); }}
                className="h-8 max-w-[7.5rem] rounded-full border border-border bg-secondary px-2 font-mono text-[10px] disabled:opacity-40"
              >
                <option value="">{freeCourts.length ? "COURT…" : "NO FREE COURT"}</option>
                {freeCourts.map((c) => <option key={c} value={c}>{courtLabel(c)}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
