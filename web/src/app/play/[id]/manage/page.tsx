"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Gear, Users, Plus, Trash, Lightning, Trophy, ShareNetwork,
  CheckCircle, Play, FlagCheckered, ArrowClockwise, Link as LinkIcon, Crown,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { withTimeout } from "@/lib/with-timeout";
import {
  type PlayEvent, type PlayParticipant, type PlayMatch,
  eventTypeLabel, statusLabel, displayName, generateRoundRobin, computeStandings,
} from "@/lib/community-play";

const inputCls = "h-10 rounded-xl bg-secondary border border-border px-3 text-sm outline-none focus:ring-2 focus:ring-ring transition-shadow";

export default function ManagePlayEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";

  const [event, setEvent] = useState<PlayEvent | null>(null);
  const [participants, setParticipants] = useState<PlayParticipant[]>([]);
  const [matches, setMatches] = useState<PlayMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [{ data: parts }, { data: ms }] = await withTimeout(Promise.all([
      supabase.from("play_participants").select("*").eq("event_id", id).order("created_at", { ascending: true }),
      supabase.from("play_matches").select("*").eq("event_id", id).order("round", { ascending: true }),
    ]));
    setParticipants(parts ?? []);
    setMatches(ms ?? []);
  }, [id]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      setShareUrl(typeof window !== "undefined" ? `${window.location.origin}/play/${id}` : "");
      const uid = await getUserId();
      if (!uid) { router.replace(`/auth?redirect=/play/${id}/manage`); return; }

      const { data: ev } = await withTimeout(supabase.from("play_events").select("*").eq("id", id).single());
      if (!ev) { setLoading(false); return; }
      if (ev.organizer_id !== uid) { setLoading(false); setAuthorized(false); return; }

      setEvent(ev);
      setAuthorized(true);
      await reload();
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [id, router, reload]);

  const updateStatus = async (status: PlayEvent["status"]) => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("play_events").update({ status }).eq("id", id);
    setBusy(false);
    if (error) { toast.error("Could not update event status."); return; }
    setEvent((e) => e ? { ...e, status } : e);
    toast.success(`Event ${statusLabel(status).toLowerCase()}.`);
  };

  const addParticipant = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const first_name = (fd.get("first_name") as string)?.trim();
    const email = (fd.get("email") as string)?.trim();
    if (!first_name || !email) { toast.error("Name and email required."); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("play_participants").insert({
      event_id: id, first_name, email,
      last_initial: (fd.get("last_initial") as string)?.trim()?.slice(0, 1) || null,
      self_rating: (fd.get("self_rating") as string)?.trim() || null,
      added_by_organizer: true,
    });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "That email is already on the roster." : error.message?.includes("full") ? "Event is full." : "Could not add player.");
      return;
    }
    (e.target as HTMLFormElement).reset();
    setShowAdd(false);
    toast.success(`${first_name} added.`);
    reload();
  };

  const removeParticipant = async (pid: string, name: string) => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("play_participants").delete().eq("id", pid);
    setBusy(false);
    if (error) { toast.error("Could not remove player."); return; }
    toast.success(`${name} removed.`);
    reload();
  };

  const generateMatches = async () => {
    if (participants.length < 2) { toast.error("Need at least 2 players."); return; }
    if (matches.length > 0 && !confirm("Regenerate matches? This clears existing matches and scores.")) return;
    setBusy(true);
    const supabase = createClient();
    // Clear existing
    if (matches.length > 0) await supabase.from("play_matches").delete().eq("event_id", id);

    const rounds = generateRoundRobin(participants.map((p) => p.id));
    const rows = rounds.flatMap((r) =>
      r.pairs
        .filter(([a, b]) => a !== null && b !== null) // skip BYE rows
        .map(([a, b], i) => ({ event_id: id, round: r.round, court: i + 1, player_a_id: a, player_b_id: b })),
    );
    const { error } = await supabase.from("play_matches").insert(rows);
    setBusy(false);
    if (error) { toast.error("Could not generate matches."); console.error(error); return; }
    toast.success(`${rows.length} matches generated across ${rounds.length} rounds.`);
    reload();
  };

  const recordResult = async (matchId: string, scoreA: number, scoreB: number) => {
    if (scoreA === scoreB) { toast.error("Scores can't be tied."); return; }
    const winner = scoreA > scoreB ? 1 : 2;
    const supabase = createClient();
    const { error } = await supabase.from("play_matches").update({ score_a: scoreA, score_b: scoreB, winner }).eq("id", matchId);
    if (error) { toast.error("Could not save result."); return; }
    setMatches((ms) => ms.map((m) => m.id === matchId ? { ...m, score_a: scoreA, score_b: scoreB, winner } : m));
    toast.success("Result saved.");
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (!authorized || !event) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto px-4 py-32 text-center">
          <Gear size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
          <h1 className="font-display text-2xl tracking-wide mb-2">NOT AUTHORIZED</h1>
          <p className="text-muted-foreground text-sm mb-6">Only the organizer can manage this event.</p>
          <Link href={`/play/${id}`}><button className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">VIEW EVENT</button></Link>
        </div>
      </PageShell>
    );
  }

  const nameOf = (pid: string | null) => {
    if (!pid) return "BYE";
    const p = participants.find((x) => x.id === pid);
    return p ? displayName(p) : "—";
  };

  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const completedCount = matches.filter((m) => m.winner != null).length;
  const standings = computeStandings(matches, participants.map((p) => p.id));
  const leaderId = standings[0]?.played > 0 ? standings[0].participantId : null;

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href={`/play/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} weight="bold" /> View public page
        </Link>

        {justCreated && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-6 flex items-start gap-3">
            <CheckCircle size={20} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Event created! 🎉</p>
              <p className="text-sm text-muted-foreground mt-0.5">Share the link below to fill it up — players can join without an account.</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[11px] tracking-[0.25em] text-primary">MANAGE</span>
              <span className={`px-2 py-0.5 rounded-full border font-mono text-[9px] tracking-[0.12em] ${
                event.status === "open" ? "bg-primary/15 text-primary border-primary/30"
                : event.status === "in_progress" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                : "bg-secondary text-muted-foreground border-border"
              }`}>{statusLabel(event.status).toUpperCase()}</span>
            </div>
            <h1 className="font-display text-3xl tracking-wide">{event.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{eventTypeLabel(event.event_type)} · {participants.length}/{event.max_players} players</p>
          </div>
        </div>

        {/* Share link */}
        <div className="border border-border rounded-2xl bg-card p-4 my-6 flex items-center gap-3">
          <LinkIcon size={18} weight="bold" className="text-primary flex-shrink-0" />
          <input readOnly value={shareUrl} className="flex-1 bg-transparent text-sm text-muted-foreground outline-none min-w-0" />
          <button
            onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success("Link copied!"); }}
            className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-xs font-mono tracking-wider flex items-center gap-1.5 flex-shrink-0 hover:bg-primary/90 transition-colors"
          >
            <ShareNetwork size={13} weight="bold" /> COPY
          </button>
        </div>

        {/* Lifecycle controls */}
        <div className="flex flex-wrap gap-2 mb-8">
          {(event.status === "open" || event.status === "full") && (
            <button onClick={generateMatches} disabled={busy || participants.length < 2}
              className="h-10 px-5 rounded-full bg-secondary border border-border hover:border-primary/50 text-sm font-display tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50">
              <ArrowClockwise size={15} weight="bold" /> {matches.length > 0 ? "REGENERATE" : "GENERATE"} MATCHES
            </button>
          )}
          {(event.status === "open" || event.status === "full") && matches.length > 0 && (
            <button onClick={() => updateStatus("in_progress")} disabled={busy}
              className="h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors flex items-center gap-2">
              <Play size={15} weight="fill" /> START EVENT
            </button>
          )}
          {event.status === "in_progress" && (
            <button onClick={() => updateStatus("completed")} disabled={busy}
              className="h-10 px-5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-wider transition-colors flex items-center gap-2">
              <FlagCheckered size={15} weight="fill" /> COMPLETE EVENT
            </button>
          )}
          <Link href={`/play/${id}/standings`}>
            <button className="h-10 px-5 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-wider transition-colors flex items-center gap-2">
              <Trophy size={15} weight="fill" className="text-primary" /> STANDINGS
            </button>
          </Link>
        </div>

        {/* Participants */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl tracking-wide flex items-center gap-2">
              <Users size={18} weight="fill" className="text-primary" /> PARTICIPANTS
            </h2>
            <button onClick={() => setShowAdd((v) => !v)}
              className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5">
              <Plus size={14} weight="bold" /> ADD PLAYER
            </button>
          </div>

          {showAdd && (
            <form onSubmit={addParticipant} className="border border-border rounded-2xl bg-card p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[9px] tracking-widest text-muted-foreground">FIRST NAME</label>
                <input name="first_name" required className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[9px] tracking-widest text-muted-foreground">LAST INITIAL</label>
                <input name="last_initial" maxLength={1} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[9px] tracking-widest text-muted-foreground">EMAIL</label>
                <input name="email" type="email" required className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[9px] tracking-widest text-muted-foreground">RATING</label>
                <div className="flex gap-2">
                  <input name="self_rating" placeholder="3.5" className={`${inputCls} flex-1 min-w-0`} />
                  <button type="submit" disabled={busy} className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Plus size={16} weight="bold" />
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="border border-border rounded-2xl bg-card overflow-hidden">
            {participants.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">No players yet. Share the link or add players manually.</div>
            ) : (
              <ul className="divide-y divide-border">
                {participants.map((p) => (
                  <li key={p.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-display text-sm text-primary">
                      {p.first_name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {displayName(p)}
                        {p.claimed_by && <CheckCircle size={13} weight="fill" className="text-primary" />}
                        {p.added_by_organizer && <span className="text-[9px] font-mono text-muted-foreground">(added)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}{p.phone ? ` · ${p.phone}` : ""}</div>
                    </div>
                    {p.self_rating && <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-secondary border border-border text-muted-foreground flex-shrink-0">{p.self_rating}</span>}
                    <button onClick={() => removeParticipant(p.id, displayName(p))} disabled={busy}
                      className="h-8 w-8 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50">
                      <Trash size={14} weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Matches */}
        {matches.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl tracking-wide flex items-center gap-2">
                <Lightning size={18} weight="fill" className="text-primary" /> MATCHES
              </h2>
              <span className="text-xs font-mono text-muted-foreground">{completedCount}/{matches.length} recorded</span>
            </div>

            <div className="space-y-5">
              {rounds.map((r) => (
                <div key={r}>
                  <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-2">ROUND {r}</p>
                  <div className="space-y-2">
                    {matches.filter((m) => m.round === r).map((m) => (
                      <MatchRow key={m.id} match={m} nameA={nameOf(m.player_a_id)} nameB={nameOf(m.player_b_id)} onSave={recordResult} locked={event.status === "completed"} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live standings preview */}
        {standings.some((s) => s.played > 0) && (
          <section>
            <h2 className="font-display text-xl tracking-wide flex items-center gap-2 mb-4">
              <Trophy size={18} weight="fill" className="text-primary" /> STANDINGS
            </h2>
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 font-normal">#</th>
                    <th className="px-2 py-2.5 font-normal">PLAYER</th>
                    <th className="px-2 py-2.5 font-normal text-center">W</th>
                    <th className="px-2 py-2.5 font-normal text-center">L</th>
                    <th className="px-4 py-2.5 font-normal text-center">DIFF</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.participantId} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-2.5 font-medium flex items-center gap-1.5">
                        {s.participantId === leaderId && <Crown size={13} weight="fill" className="text-amber-400" />}
                        {nameOf(s.participantId)}
                      </td>
                      <td className="px-2 py-2.5 text-center font-mono">{s.wins}</td>
                      <td className="px-2 py-2.5 text-center font-mono text-muted-foreground">{s.losses}</td>
                      <td className="px-4 py-2.5 text-center font-mono">{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}

function MatchRow({ match, nameA, nameB, onSave, locked }: {
  match: PlayMatch; nameA: string; nameB: string;
  onSave: (id: string, a: number, b: number) => void; locked: boolean;
}) {
  const [a, setA] = useState(match.score_a?.toString() ?? "");
  const [b, setB] = useState(match.score_b?.toString() ?? "");
  const recorded = match.winner != null;

  return (
    <div className={`border rounded-xl p-3 flex items-center gap-3 ${recorded ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <span className="text-[10px] font-mono text-muted-foreground w-6 flex-shrink-0">#{match.court}</span>
      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0">
        <span className={`text-sm text-right truncate ${match.winner === 1 ? "font-bold text-primary" : ""}`}>{nameA}</span>
        <div className="flex items-center gap-1.5">
          <input value={a} onChange={(e) => setA(e.target.value)} disabled={locked} type="number" min={0}
            className="h-9 w-12 rounded-lg bg-secondary border border-border text-center text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
          <span className="text-muted-foreground text-xs">–</span>
          <input value={b} onChange={(e) => setB(e.target.value)} disabled={locked} type="number" min={0}
            className="h-9 w-12 rounded-lg bg-secondary border border-border text-center text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
        </div>
        <span className={`text-sm truncate ${match.winner === 2 ? "font-bold text-primary" : ""}`}>{nameB}</span>
      </div>
      {!locked && (
        <button
          onClick={() => { const na = parseInt(a, 10); const nb = parseInt(b, 10); if (isNaN(na) || isNaN(nb)) { toast.error("Enter both scores."); return; } onSave(match.id, na, nb); }}
          className="h-9 w-9 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center flex-shrink-0 transition-colors"
          title="Save result"
        >
          <CheckCircle size={16} weight="fill" />
        </button>
      )}
    </div>
  );
}
