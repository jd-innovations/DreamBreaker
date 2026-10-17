"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState, use } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  MapPin, Calendar, Clock, Users, Sparkle, ArrowLeft, Confetti,
  ArrowRight, NotePencil, Gear, Trophy, CheckCircle, UserCircle,
  ChatCircleDots, ShieldStar, EnvelopeSimple,
} from "@phosphor-icons/react";
import { PageShell } from "@/components/layout/page-shell";
import { ShareButton } from "@/components/shared/share-button";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { withTimeout } from "@/lib/with-timeout";
import Image from "next/image";
import { SafeImage } from "@/components/shared/safe-image";
import { eventCover } from "@/lib/stock-images";
import {
  type PlayEvent, type PlayParticipantPublic,
  eventTypeLabel, statusLabel, skillLabel, formatEventDate, formatEventTime, displayName,
} from "@/lib/community-play";

type Organizer = {
  id: string;
  full_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  director_status: string | null;
  director_events_hosted: number | null;
};

export default function PlayEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<PlayEvent | null>(null);
  const [participants, setParticipants] = useState<PlayParticipantPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  // Signed-in viewers (2026-10-17): the page used to show everyone the guest
  // form ("No account needed") and never looked for an invitation, so an
  // invited player arriving from the notification saw no invite at all.
  const [myInvite, setMyInvite] = useState<{ id: string; inviterName: string } | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      setShareUrl(typeof window !== "undefined" ? `${window.location.origin}/play/${id}` : "");
      const { data: ev } = await withTimeout(supabase.from("play_events").select("*").eq("id", id).single());
      if (!ev) { setLoading(false); return; }
      setEvent(ev);

      const uid = await getUserId();
      setViewerId(uid);
      setIsOrganizer(!!uid && uid === ev.organizer_id);

      const { data: org } = await supabase
        .from("profiles")
        .select("id, full_name, handle, avatar_url, director_status, director_events_hosted")
        .eq("id", ev.organizer_id)
        .single();
      setOrganizer(org as Organizer | null);

      const { data: parts } = await supabase
        .from("play_participants_public")
        .select("*")
        .eq("event_id", id)
        .order("created_at", { ascending: true });
      setParticipants(parts ?? []);

      if (uid && uid !== ev.organizer_id) {
        const [{ data: mine }, { data: inv }] = await Promise.all([
          supabase.from("play_participants").select("id").eq("event_id", id).eq("claimed_by", uid).limit(1),
          supabase.from("play_event_invites").select("id, inviter_id").eq("play_event_id", id)
            .eq("invitee_id", uid).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
        ]);
        setJoined((mine ?? []).length > 0);
        const invite = (inv ?? [])[0];
        if (invite) {
          let inviterName = org?.id === invite.inviter_id ? (org.full_name ?? "the organizer") : "a player";
          if (org?.id !== invite.inviter_id) {
            const { data: who } = await supabase.from("profiles").select("full_name").eq("id", invite.inviter_id).maybeSingle();
            if (who?.full_name) inviterName = who.full_name;
          }
          setMyInvite({ id: invite.id, inviterName });
        }
      }
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [id]);

  const reloadParticipants = useCallback(async () => {
    const { data } = await createClient().from("play_participants_public").select("*").eq("event_id", id).order("created_at", { ascending: true });
    setParticipants(data ?? []);
  }, [id]);

  // Joins as the signed-in player (claimed to their account), the same
  // join_play_event call the app makes; an accepted invite is marked too.
  async function joinAsMe(inviteId?: string) {
    if (!viewerId) return;
    setBusy(true);
    const supabase = createClient();
    try {
      const [{ data: auth }, { data: me }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("profiles").select("full_name").eq("id", viewerId).maybeSingle(),
      ]);
      const fullName = (me?.full_name ?? "").trim() || "Player";
      const parts = fullName.split(/\s+/);
      const { error } = await supabase.rpc("join_play_event", {
        p_event_id: id,
        p_first_name: parts[0],
        p_last_initial: parts.length > 1 ? parts[parts.length - 1][0] : undefined,
        p_email: auth.user?.email ?? "",
        p_claimed_by: viewerId,
      });
      if (error) {
        const m = error.message ?? "";
        toast.error(m.includes("event_full") ? "Sorry, this event just filled up."
          : m.includes("event_not_open") ? "This event isn't taking players right now."
          : m.includes("duplicate_email") ? "You've already joined this event."
          : "Could not join. Please try again.");
        return;
      }
      if (inviteId) {
        await supabase.from("play_event_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", inviteId);
        setMyInvite(null);
      }
      setJoined(true);
      await reloadParticipants();
      toast.success("You're in!", { description: event?.name });
    } finally {
      setBusy(false);
    }
  }

  async function declineInvite() {
    if (!myInvite) return;
    setBusy(true);
    const { error } = await createClient().from("play_event_invites")
      .update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", myInvite.id);
    setBusy(false);
    if (error) { toast.error("Could not decline. Please try again."); return; }
    setMyInvite(null);
    toast("Invite declined");
  }

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
          <Confetti size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
          <h1 className="font-display text-2xl tracking-wide mb-2">EVENT NOT FOUND</h1>
          <p className="text-muted-foreground text-sm mb-6">This event may have been removed or the link is incorrect.</p>
          <Link href="/play"><button className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">BROWSE EVENTS</button></Link>
        </div>
      </PageShell>
    );
  }

  const spotsLeft = event.max_players - participants.length;
  const time = formatEventTime(event.start_time);
  const canJoin = (event.status === "open") && spotsLeft > 0;
  const isLive = event.status === "in_progress";
  const isDone = event.status === "completed";

  return (
    <PageShell>
      {/* Header band, over the event's cover: the organizer's upload, else the
          same default court photo the app shows (2026-10-11). */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0">
          <SafeImage src={eventCover(event.cover_url)} alt="" fill priority sizes="100vw" className="object-cover opacity-50 dark:opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/30" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-8">
          <div className="flex items-center justify-between mb-4">
            <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={15} weight="bold" /> Community Play
            </Link>
            <div className="flex items-center gap-2">
              {isOrganizer && (
                <Link href={`/play/${id}/manage`}>
                  <button className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5">
                    <Gear size={14} weight="bold" /> MANAGE
                  </button>
                </Link>
              )}
              <ShareButton title={event.name} text={`Join my pickleball ${eventTypeLabel(event.event_type)} — ${event.name}`} url={shareUrl} size="sm" />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-full bg-secondary border border-border font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
              {eventTypeLabel(event.event_type).toUpperCase()}
            </span>
            <span className={`px-2.5 py-1 rounded-full border font-mono text-[10px] tracking-[0.12em] ${
              event.status === "open" ? "bg-primary/15 text-primary border-primary/30"
              : event.status === "full" ? "bg-amber-400/15 text-amber-500 border-amber-400/30"
              : event.status === "in_progress" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
              : "bg-secondary text-muted-foreground border-border"
            }`}>
              {statusLabel(event.status).toUpperCase()}
            </span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl tracking-tight leading-[0.85] mb-4">{event.name}</h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={Calendar} label="DATE" value={formatEventDate(event.event_date)} />
            <Stat icon={Clock} label="TIME" value={time ?? "TBD"} />
            <Stat icon={Sparkle} label="SKILL" value={skillLabel(event.skill_min, event.skill_max)} />
            <Stat icon={Users} label="PLAYERS" value={`${participants.length} / ${event.max_players}`} />
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 grid lg:grid-cols-3 gap-8">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Location */}
          <div className="border border-border rounded-2xl bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={18} weight="fill" className="text-primary" />
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-0.5">LOCATION</p>
                <p className="font-semibold">{event.venue_name ?? event.location}</p>
                {event.venue_name && <p className="text-sm text-muted-foreground">{event.location}</p>}
                {(event.city || event.state) && <p className="text-sm text-muted-foreground">{[event.city, event.state].filter(Boolean).join(", ")}</p>}
              </div>
            </div>
          </div>

          {/* Format + notes */}
          {(event.format || event.notes) && (
            <div className="border border-border rounded-2xl bg-card p-5 space-y-4">
              {event.format && (
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-1">FORMAT</p>
                  <p className="text-sm font-semibold">{event.format}</p>
                </div>
              )}
              {event.notes && (
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-1 flex items-center gap-1.5">
                    <NotePencil size={11} weight="bold" /> NOTES
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Roster */}
          <div className="border border-border rounded-2xl bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="font-display tracking-[0.15em] flex items-center gap-2">
                <Users size={16} weight="fill" className="text-primary" /> PLAYERS JOINED
              </div>
              <span className="text-xs font-mono text-muted-foreground">{participants.length} / {event.max_players}</span>
            </div>
            {participants.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No players yet — be the first to join!
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {participants.map((p, i) => (
                  <li key={p.id ?? i} className="px-5 py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 font-display text-sm text-primary">
                      {(p.first_name ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{displayName(p)}</span>
                    </div>
                    {p.self_rating && (
                      <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-secondary border border-border text-muted-foreground">{p.self_rating}</span>
                    )}
                    {p.is_claimed && <CheckCircle size={15} weight="fill" className="text-primary flex-shrink-0" />}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(isLive || isDone) && (
            <Link href={`/play/${id}/standings`}>
              <button className="w-full h-12 rounded-full border border-border hover:bg-secondary font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2">
                <Trophy size={16} weight="fill" className="text-primary" /> VIEW STANDINGS <ArrowRight size={14} weight="bold" />
              </button>
            </Link>
          )}
        </div>

        {/* Sidebar — join CTA */}
        <aside className="space-y-4">
          <div className="border border-border rounded-2xl bg-card p-5 lg:sticky lg:top-20">
            {joined && !isOrganizer ? (
              <>
                <p className="font-display text-2xl tracking-wide mb-1 flex items-center gap-2">
                  <CheckCircle size={22} weight="fill" className="text-primary" /> YOU&apos;RE IN
                </p>
                <p className="text-sm text-muted-foreground">{participants.length}/{event.max_players} attending.</p>
              </>
            ) : myInvite && canJoin ? (
              <>
                <p className="font-display text-2xl tracking-wide mb-1 flex items-center gap-2">
                  <EnvelopeSimple size={22} weight="fill" className="text-primary" /> YOU&apos;RE INVITED
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {myInvite.inviterName} invited you. <span className="text-primary font-semibold">{spotsLeft} {spotsLeft === 1 ? "spot" : "spots"}</span> left.
                </p>
                <button disabled={busy} onClick={() => joinAsMe(myInvite.id)}
                  className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  <CheckCircle size={16} weight="fill" /> {busy ? "JOINING…" : "ACCEPT INVITE"}
                </button>
                <button disabled={busy} onClick={declineInvite}
                  className="mt-2 w-full h-10 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-[0.15em] transition-colors disabled:opacity-60">
                  DECLINE
                </button>
              </>
            ) : canJoin && viewerId && !isOrganizer ? (
              <>
                <p className="font-display text-2xl tracking-wide mb-1">JOIN THIS EVENT</p>
                <p className="text-sm text-muted-foreground mb-4">
                  <span className="text-primary font-semibold">{spotsLeft} {spotsLeft === 1 ? "spot" : "spots"}</span> left.
                </p>
                <button disabled={busy} onClick={() => joinAsMe()}
                  className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                  <Confetti size={16} weight="fill" /> {busy ? "JOINING…" : "JOIN EVENT"}
                </button>
              </>
            ) : canJoin ? (
              <>
                <p className="font-display text-2xl tracking-wide mb-1">JOIN THIS EVENT</p>
                <p className="text-sm text-muted-foreground mb-4">
                  <span className="text-primary font-semibold">{spotsLeft} {spotsLeft === 1 ? "spot" : "spots"}</span> left. No account needed — just your name and email.
                </p>
                <Link href={`/play/${id}/join`}>
                  <button className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2">
                    <Confetti size={16} weight="fill" /> JOIN EVENT
                  </button>
                </Link>
              </>
            ) : event.status === "full" ? (
              <>
                <p className="font-display text-2xl tracking-wide mb-1">EVENT FULL</p>
                <p className="text-sm text-muted-foreground">All {event.max_players} spots are taken. Check back in case a spot opens.</p>
              </>
            ) : isLive ? (
              <>
                <p className="font-display text-2xl tracking-wide mb-1">EVENT IS LIVE</p>
                <p className="text-sm text-muted-foreground mb-4">Matches are underway. Follow the live standings.</p>
                <Link href={`/play/${id}/standings`}>
                  <button className="w-full h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2">
                    <Trophy size={16} weight="fill" /> LIVE STANDINGS
                  </button>
                </Link>
              </>
            ) : (
              <>
                <p className="font-display text-2xl tracking-wide mb-1">EVENT ENDED</p>
                <p className="text-sm text-muted-foreground mb-4">Thanks for playing! See the final standings.</p>
                <Link href={`/play/${id}/standings`}>
                  <button className="w-full h-12 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm flex items-center justify-center gap-2">
                    <Trophy size={16} weight="fill" /> FINAL STANDINGS
                  </button>
                </Link>
              </>
            )}

            <div className="mt-4 pt-4 border-t border-border">
              <ShareButton title={event.name} text={`Join my pickleball ${eventTypeLabel(event.event_type)} — ${event.name}`} url={shareUrl} />
              <span className="ml-1 align-middle text-xs text-muted-foreground">Share this event</span>
            </div>
          </div>

          {/* Organizer */}
          {organizer && (
            <div className="border border-border rounded-2xl bg-card p-5">
              <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-3">ORGANIZER</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {organizer.avatar_url
                    ? <Image src={organizer.avatar_url} alt="" width={48} height={48} className="h-full w-full object-cover" />
                    : <span className="font-display text-lg text-primary">{(organizer.full_name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-lg tracking-wide truncate">{organizer.full_name ?? "Organizer"}</span>
                    {organizer.director_status === "approved" && <ShieldStar size={15} weight="fill" className="text-amber-400 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {organizer.handle ? `@${organizer.handle}` : "Host"}
                    {organizer.director_events_hosted ? ` · ${organizer.director_events_hosted} events hosted` : ""}
                  </div>
                </div>
              </div>

              {isOrganizer ? (
                <p className="text-xs text-muted-foreground text-center py-1">You&apos;re hosting this event.</p>
              ) : viewerId ? (
                <Link href={`/profile/${organizer.id}`}>
                  <button className="w-full h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-[0.15em] transition-colors flex items-center justify-center gap-2">
                    <ChatCircleDots size={15} weight="fill" /> CONTACT ORGANIZER
                  </button>
                </Link>
              ) : (
                <>
                  <Link href={`/auth?mode=signup&redirect=/play/${id}`}>
                    <button className="w-full h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-[0.15em] transition-colors flex items-center justify-center gap-2">
                      <ChatCircleDots size={15} weight="fill" /> CONTACT ORGANIZER
                    </button>
                  </Link>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Create a free account to message the organizer.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Growth nudge: signed-out visitors only. */}
          {!viewerId && (
          <div className="border border-primary/30 bg-primary/5 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <UserCircle size={18} weight="fill" className="text-primary" />
              <p className="font-display tracking-wide">PLAY MORE, CONNECT MORE</p>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Want us to find compatible partners and tournaments for you? Create a free profile.
            </p>
            <Link href="/auth?mode=signup">
              <button className="w-full h-10 rounded-full border border-primary/40 text-primary hover:bg-primary/10 text-sm font-display tracking-[0.15em] transition-colors flex items-center justify-center gap-1.5">
                CREATE FREE PROFILE <ArrowRight size={13} weight="bold" />
              </button>
            </Link>
          </div>
          )}
        </aside>
      </div>
    </PageShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-card/60 border border-border rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} weight="fill" className="text-primary" />
        <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm font-semibold leading-tight">{value}</div>
    </div>
  );
}
