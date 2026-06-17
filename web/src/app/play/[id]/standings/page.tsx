"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Trophy, Crown, Medal, Confetti, ArrowRight, UserCircle, Lightning,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { ShareButton } from "@/components/shared/share-button";
import { createClient } from "@/lib/supabase/client";
import {
  type PlayEvent, type PlayParticipantPublic, type PlayMatch,
  statusLabel, displayName, computeStandings, formatEventDate,
} from "@/lib/community-play";

export default function StandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<PlayEvent | null>(null);
  const [participants, setParticipants] = useState<PlayParticipantPublic[]>([]);
  const [matches, setMatches] = useState<PlayMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      setShareUrl(typeof window !== "undefined" ? `${window.location.origin}/play/${id}/standings` : "");
      const [{ data: ev }, { data: parts }, { data: ms }] = await Promise.all([
        supabase.from("play_events").select("*").eq("id", id).single(),
        supabase.from("play_participants_public").select("*").eq("event_id", id),
        supabase.from("play_matches").select("*").eq("event_id", id),
      ]);
      setEvent(ev);
      setParticipants(parts ?? []);
      setMatches(ms ?? []);
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (!event) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto px-4 py-32 text-center">
          <h1 className="font-display text-2xl tracking-wide mb-2">EVENT NOT FOUND</h1>
          <Link href="/play"><button className="mt-4 h-11 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">BROWSE EVENTS</button></Link>
        </div>
      </PageShell>
    );
  }

  const nameOf = (pid: string) => {
    const p = participants.find((x) => x.id === pid);
    return p ? displayName(p) : "—";
  };

  const partIds = participants.map((p) => p.id).filter(Boolean) as string[];
  const standings = computeStandings(matches, partIds);
  const hasResults = standings.some((s) => s.played > 0);
  const podium = standings.slice(0, 3);
  const isDone = event.status === "completed";

  return (
    <PageShell>
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <Link href={`/play/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={15} weight="bold" /> Back to event
            </Link>
            <ShareButton title={`${event.name} — Standings`} text={`Standings for ${event.name}`} url={shareUrl} size="sm" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={18} weight="fill" className="text-primary" />
            <span className="font-mono text-[11px] tracking-[0.25em] text-primary">{isDone ? "FINAL STANDINGS" : "LIVE STANDINGS"}</span>
            <span className={`px-2 py-0.5 rounded-full border font-mono text-[9px] tracking-[0.12em] ${
              event.status === "in_progress" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-secondary text-muted-foreground border-border"
            }`}>{statusLabel(event.status).toUpperCase()}</span>
          </div>
          <h1 className="font-display text-4xl tracking-wide">{event.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatEventDate(event.event_date)}</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {!hasResults ? (
          <div className="border border-dashed border-border rounded-3xl py-20 text-center">
            <Lightning size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
            <h3 className="font-display text-2xl tracking-wide mb-2">NO RESULTS YET</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">Standings will appear here as match results are recorded.</p>
          </div>
        ) : (
          <>
            {/* Podium */}
            {podium.length >= 2 && (
              <div className="grid grid-cols-3 gap-3 items-end">
                {[1, 0, 2].map((slot) => {
                  const s = podium[slot];
                  if (!s) return <div key={slot} />;
                  const isFirst = slot === 0;
                  const heights = isFirst ? "h-28" : "h-20";
                  const medalColor = slot === 0 ? "text-amber-400" : slot === 1 ? "text-zinc-400" : "text-orange-400";
                  return (
                    <div key={slot} className="flex flex-col items-center">
                      <div className="mb-2 text-center">
                        {isFirst ? <Crown size={24} weight="fill" className="text-amber-400 mx-auto mb-1" /> : <Medal size={20} weight="fill" className={`${medalColor} mx-auto mb-1`} />}
                        <div className="font-display text-sm tracking-wide leading-tight">{nameOf(s.participantId)}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{s.wins}W – {s.losses}L</div>
                      </div>
                      <div className={`w-full ${heights} rounded-t-xl bg-gradient-to-t ${isFirst ? "from-primary/30 to-primary/10 border-primary/40" : "from-secondary to-secondary/40 border-border"} border flex items-start justify-center pt-2`}>
                        <span className="font-display text-2xl text-muted-foreground">{slot + 1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full table */}
            <div className="border border-border rounded-2xl bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-mono text-[10px] tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-normal">#</th>
                    <th className="px-2 py-3 font-normal">PLAYER</th>
                    <th className="px-2 py-3 font-normal text-center">P</th>
                    <th className="px-2 py-3 font-normal text-center">W</th>
                    <th className="px-2 py-3 font-normal text-center">L</th>
                    <th className="px-4 py-3 font-normal text-center">DIFF</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.participantId} className={`border-b border-border/60 last:border-0 ${i === 0 && s.played > 0 ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-3 font-medium flex items-center gap-1.5">
                        {i === 0 && s.played > 0 && <Crown size={13} weight="fill" className="text-amber-400" />}
                        {nameOf(s.participantId)}
                      </td>
                      <td className="px-2 py-3 text-center font-mono text-muted-foreground">{s.played}</td>
                      <td className="px-2 py-3 text-center font-mono font-semibold">{s.wins}</td>
                      <td className="px-2 py-3 text-center font-mono text-muted-foreground">{s.losses}</td>
                      <td className="px-4 py-3 text-center font-mono">{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Growth nudge — post-event claim */}
        <div className="border border-primary/30 bg-primary/5 rounded-2xl p-5 text-center">
          <Confetti size={28} weight="fill" className="text-primary mx-auto mb-2" />
          <p className="font-display text-lg tracking-wide mb-1">
            {isDone ? "CLAIM YOUR PROFILE" : "MAKE IT OFFICIAL"}
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            {isDone
              ? "Claim your profile to see your results, partner matches, and future events."
              : "Want us to find compatible partners and tournaments for you? Create a free profile."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Link href="/auth?mode=signup">
              <button className="h-11 px-6 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-[0.15em] transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto">
                <UserCircle size={15} weight="fill" /> CREATE FREE PROFILE
              </button>
            </Link>
            <Link href="/play">
              <button className="h-11 px-6 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-[0.15em] transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto">
                MORE EVENTS <ArrowRight size={13} weight="bold" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
