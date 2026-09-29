"use client";

// Director Bracket tab for Pool Play → Bracket tournaments (DIRECTOR_HUB_WEB_PARITY.md,
// W3). One card per division, the same flow as mobile's Brackets and division
// screens: Generate Pools (placed by rating, snake order) → pool matches play
// through Day Of like any other → standings → Build bracket once every pool
// match is scored (director-confirmed, with a seed preview). Updates live.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Trophy, Warning, X } from "@phosphor-icons/react";
import {
  DEFAULT_ADVANCE_PER_POOL, maxPoolCount, poolSizes, suggestPoolCount,
} from "@shared/poolSchedule";
import {
  fetchLiveBrackets, subscribeLiveBrackets, type LiveDivision,
} from "@/lib/tournament/live-brackets";
import {
  buildBracketFromPools, createPools, planBracketFromPools, poolTeams,
  type BracketPlan, type PoolRegistration,
} from "@/lib/tournament/pools";
import { PoolStandingsTable, usePoolStandings } from "@/components/tournament/pool-standings";

interface DivisionInfo { id: string; name: string }

export function PoolPlayPanel({
  tournamentId, divisions, registrations, preferredPoolCount,
}: {
  tournamentId: string;
  divisions: DivisionInfo[];
  registrations: PoolRegistration[];
  preferredPoolCount: number | null;
}) {
  const [live, setLive] = useState<LiveDivision[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLive(await fetchLiveBrackets(tournamentId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [tournamentId]);

  useEffect(() => {
    // Database fetch (an external system); state is set after it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return subscribeLiveBrackets(tournamentId, load);
  }, [tournamentId, load]);

  if (loadError) return <p className="text-sm text-muted-foreground">Pools couldn’t load. Refresh to try again.</p>;
  if (!live) return <div className="flex justify-center py-10"><div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  if (divisions.length === 0) return <p className="text-sm text-muted-foreground">Add a division first.</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Pool play, then a bracket. Teams are placed in pools by rating (snake order) and everyone in a pool plays everyone else.
        Pool matches run through Day Of like any other. Once every pool match is scored, build the bracket from the standings.
      </p>
      {divisions.map((d) => (
        <DivisionPoolCard
          key={d.id}
          tournamentId={tournamentId}
          division={d}
          live={live.find((x) => x.id === d.id) ?? null}
          registrations={registrations}
          preferredPoolCount={preferredPoolCount}
          onChanged={load}
        />
      ))}
    </div>
  );
}

function DivisionPoolCard({
  tournamentId, division, live, registrations, preferredPoolCount, onChanged,
}: {
  tournamentId: string;
  division: DivisionInfo;
  live: LiveDivision | null;
  registrations: PoolRegistration[];
  preferredPoolCount: number | null;
  onChanged: () => Promise<void>;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [plan, setPlan] = useState<BracketPlan | null>(null);
  const teamCount = useMemo(() => poolTeams(registrations, division.id).length, [registrations, division.id]);

  const matches = useMemo(() => live?.matches ?? [], [live]);
  const poolMatches = matches.filter((m) => m.poolLabel);
  const elim = matches.filter((m) => !m.poolLabel);
  const hasPools = poolMatches.length > 0;
  const hasBracket = elim.length > 0;
  const scoredPools = poolMatches.filter((m) => m.completed).length;
  const scoredBracket = elim.filter((m) => m.completed && m.team1.length > 0 && m.team2.length > 0).length;
  const allScored = hasPools && scoredPools === poolMatches.length;
  const advance = live?.advancePerPool ?? DEFAULT_ADVANCE_PER_POOL;
  const { pools } = usePoolStandings(hasPools ? division.id : null, hasPools ? matches : null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-sm flex-1 min-w-0 truncate">{division.name}</span>
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground whitespace-nowrap">
          {teamCount} {teamCount === 1 ? "TEAM" : "TEAMS"}
          {hasPools && ` · POOLS ${scoredPools}/${poolMatches.length} SCORED`}
          {hasBracket && " · BRACKET BUILT"}
        </span>
      </div>

      {!hasPools ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setSetupOpen(true)}
            disabled={teamCount < 2}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider disabled:opacity-40"
          >
            GENERATE POOLS
          </button>
          {teamCount < 2 && <span className="text-xs text-muted-foreground">At least 2 teams are needed.</span>}
        </div>
      ) : (
        <>
          {pools && pools.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {pools.map((p) => (
                <div key={p.label} className="rounded-xl border border-border p-3">
                  <p className="font-mono text-[10px] tracking-widest text-primary mb-1">POOL {p.label}</p>
                  <PoolStandingsTable pool={p} advancePerPool={advance} />
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {allScored ? (
              <button
                onClick={() => pools && setPlan(planBracketFromPools(pools, advance, registrations, division.id))}
                disabled={!pools}
                className="h-9 px-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-display tracking-wider disabled:opacity-40"
              >
                {hasBracket ? "REBUILD BRACKET FROM POOLS" : "BUILD BRACKET"}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {poolMatches.length - scoredPools} pool {poolMatches.length - scoredPools === 1 ? "match" : "matches"} left. Build bracket unlocks when every pool match is scored.
              </span>
            )}
            {!hasBracket && (
              <button onClick={() => setSetupOpen(true)} className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-xs font-display tracking-wider">
                REDO POOLS
              </button>
            )}
          </div>
        </>
      )}

      {setupOpen && (
        <PoolSetupDialog
          divisionName={division.name}
          teamCount={teamCount}
          defaultPoolCount={suggestPoolCount(teamCount, preferredPoolCount)}
          defaultAdvance={advance}
          scoredPools={scoredPools}
          onClose={() => setSetupOpen(false)}
          onConfirm={async (poolCount, advancePerPool) => {
            const result = await createPools({ tournamentId, divisionId: division.id, registrations, poolCount, advancePerPool });
            if (!result.ok) { toast.error(result.error); return; }
            setSetupOpen(false);
            toast.success(`${division.name}: pools created.`);
            await onChanged();
          }}
        />
      )}

      {plan && (
        <BuildBracketDialog
          divisionName={division.name}
          plan={plan}
          advancePerPool={advance}
          rebuild={hasBracket}
          scoredBracket={scoredBracket}
          onClose={() => setPlan(null)}
          onConfirm={async () => {
            const result = await buildBracketFromPools(tournamentId, division.id, plan);
            if (!result.ok) { toast.error(result.error); return; }
            setPlan(null);
            toast.success(`${division.name}: bracket built.`);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30">
          <Minus size={12} weight="bold" />
        </button>
        <span className="w-6 text-center font-display text-xl">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary disabled:opacity-30">
          <Plus size={12} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-2xl tracking-wide">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 flex-shrink-0 rounded-full border border-border flex items-center justify-center hover:bg-secondary">
            <X size={14} weight="bold" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PoolSetupDialog({
  divisionName, teamCount, defaultPoolCount, defaultAdvance, scoredPools, onClose, onConfirm,
}: {
  divisionName: string;
  teamCount: number;
  defaultPoolCount: number;
  defaultAdvance: number;
  /** Existing pools already have scores: regenerating wipes them. */
  scoredPools: number;
  onClose: () => void;
  onConfirm: (poolCount: number, advancePerPool: number) => Promise<void>;
}) {
  const maxPools = maxPoolCount(teamCount);
  const [pools, setPools] = useState(Math.min(Math.max(1, defaultPoolCount), maxPools));
  const [advance, setAdvance] = useState(defaultAdvance);
  const [busy, setBusy] = useState(false);
  const sizes = poolSizes(teamCount, pools);
  const maxAdvance = Math.max(1, sizes.smallest);
  const advanceClamped = Math.min(advance, maxAdvance);

  return (
    <Dialog title="POOL PLAY" onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-4">
        {divisionName}: {teamCount} teams, placed in pools by rating (snake order). Everyone in a pool plays everyone else.
      </p>
      <div className="space-y-3 mb-4">
        <Stepper label="Pools" value={pools} min={1} max={maxPools} onChange={setPools} />
        <Stepper label="Advance per pool" value={advanceClamped} min={1} max={maxAdvance} onChange={setAdvance} />
      </div>
      <div className="rounded-xl bg-secondary px-3 py-2 text-sm mb-4">
        {sizes.label} · {sizes.matches} pool {sizes.matches === 1 ? "match" : "matches"} · {pools * advanceClamped} to the bracket
      </div>
      {scoredPools > 0 && (
        <p className="flex gap-2 text-sm text-destructive mb-4">
          <Warning size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
          Redoing pools deletes the current pools and their {scoredPools} recorded {scoredPools === 1 ? "score" : "scores"}.
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">CANCEL</button>
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(pools, advanceClamped); } finally { setBusy(false); } }}
          className={`flex-1 h-11 rounded-full text-sm font-display tracking-wider disabled:opacity-50 ${scoredPools > 0 ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
        >
          {busy ? "CREATING…" : scoredPools > 0 ? "REDO POOLS" : "CREATE POOLS"}
        </button>
      </div>
    </Dialog>
  );
}

function BuildBracketDialog({
  divisionName, plan, advancePerPool, rebuild, scoredBracket, onClose, onConfirm,
}: {
  divisionName: string;
  plan: BracketPlan;
  advancePerPool: number;
  rebuild: boolean;
  scoredBracket: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const blocked = plan.unmatched.length > 0;
  return (
    <Dialog title={rebuild ? "REBUILD BRACKET" : "BUILD BRACKET"} onClose={onClose}>
      <p className="text-sm text-muted-foreground mb-3">
        {divisionName}: top {advancePerPool} from each pool. Every pool winner is seeded ahead of every runner-up, then by pool record
        (wins, point difference, points scored). Teams from the same pool don’t meet in the first round.
        {plan.byes > 0 && ` ${plan.byes} ${plan.byes === 1 ? "bye goes" : "byes go"} to the top seeds.`}
      </p>
      <div className="rounded-xl border border-border divide-y divide-border mb-3">
        {plan.seeds.map((s) => (
          <div key={s.teamKey} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-primary w-5 text-right">{s.seed}</span>
            <span className="flex-1 min-w-0 truncate">{s.name}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{s.pool}{s.rank}</span>
          </div>
        ))}
      </div>
      <div className="space-y-2 mb-4">
        {plan.cutoffTiePools.length > 0 && (
          <p className="flex gap-2 text-sm text-amber-500">
            <Warning size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
            Pool {plan.cutoffTiePools.join(", ")}: the last qualifying place is an exact tie on every tie-break, so the system decided it.
            Settle it before building if needed.
          </p>
        )}
        {blocked && (
          <p className="flex gap-2 text-sm text-destructive">
            <Warning size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
            Can’t find the registration for: {plan.unmatched.join(", ")}. Check they’re still registered.
          </p>
        )}
        {rebuild && (
          <p className="flex gap-2 text-sm text-destructive">
            <Warning size={16} weight="fill" className="flex-shrink-0 mt-0.5" />
            This replaces the current bracket{scoredBracket > 0 ? ` and its ${scoredBracket} recorded ${scoredBracket === 1 ? "score" : "scores"}` : ""}. Pool results are kept.
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider">CANCEL</button>
        <button
          disabled={busy || blocked}
          onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
          className={`flex-1 h-11 rounded-full text-sm font-display tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 ${rebuild ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
        >
          <Trophy size={14} weight="fill" /> {busy ? "BUILDING…" : rebuild ? "REBUILD" : "BUILD BRACKET"}
        </button>
      </div>
    </Dialog>
  );
}
