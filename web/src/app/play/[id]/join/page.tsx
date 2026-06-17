"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Confetti, CheckCircle, ArrowRight, UserCircle, Calendar, MapPin, Sparkle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";
import {
  type PlayEvent, eventTypeLabel, skillLabel, formatEventDate, formatEventTime,
} from "@/lib/community-play";

const SKILL_OPTIONS = ["Beginner (2.0–2.5)", "Intermediate (3.0–3.5)", "Advanced (4.0–4.5)", "Pro (5.0+)", "Not sure"];
const GENDER_OPTIONS = ["Prefer not to say", "Male", "Female", "Non-binary"];

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

export default function JoinPlayEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [event, setEvent] = useState<PlayEvent | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: ev } = await withTimeout(supabase.from("play_events").select("*").eq("id", id).single());
      setEvent(ev);
      if (ev) {
        const { count: c } = await supabase.from("play_participants_public").select("id", { count: "exact", head: true }).eq("event_id", id);
        setCount(c ?? 0);
      }
      setLoading(false);
    }
    load().catch(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const first_name = (fd.get("first_name") as string)?.trim();
    const email = (fd.get("email") as string)?.trim();
    if (!first_name || !email) { toast.error("First name and email are required."); return; }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("play_participants").insert({
      event_id: id,
      first_name,
      last_initial: (fd.get("last_initial") as string)?.trim()?.slice(0, 1) || null,
      email,
      phone: (fd.get("phone") as string)?.trim() || null,
      self_rating: (fd.get("self_rating") as string) || null,
      gender: (fd.get("gender") as string) === "Prefer not to say" ? null : (fd.get("gender") as string) || null,
    });
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("You've already joined this event with that email.");
      } else if (error.message?.includes("full")) {
        toast.error("Sorry — this event just filled up.");
      } else {
        toast.error("Could not join. Please try again.");
      }
      console.error(error);
      return;
    }
    setDone(true);
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
          <h1 className="font-display text-2xl tracking-wide mb-2">EVENT NOT FOUND</h1>
          <Link href="/play"><button className="mt-4 h-11 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">BROWSE EVENTS</button></Link>
        </div>
      </PageShell>
    );
  }

  const spotsLeft = event.max_players - count;
  const closed = event.status === "cancelled" || event.status === "completed" || (event.status !== "open" && spotsLeft <= 0);

  if (done) {
    return (
      <PageShell>
        <div className="max-w-lg mx-auto px-4 sm:px-6 py-12">
          <div className="border border-border rounded-3xl bg-card overflow-hidden text-center">
            <div className="bg-gradient-to-b from-primary/15 to-transparent px-6 pt-10 pb-6">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={36} weight="fill" className="text-primary" />
              </div>
              <h1 className="font-display text-3xl tracking-wide mb-2">YOU&apos;RE IN!</h1>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                You&apos;re on the roster for <span className="text-foreground font-semibold">{event.name}</span>. See you on the courts!
              </p>
            </div>

            <div className="px-6 pb-8 pt-2 space-y-5">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <UserCircle size={18} weight="fill" className="text-primary" />
                  <p className="font-display tracking-wide">WANT MORE PICKLEBALL?</p>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Want us to find compatible partners and tournaments for you? Create a free profile — it takes seconds.
                </p>
                <Link href="/auth?mode=signup">
                  <button className="w-full h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-display tracking-[0.15em] transition-colors flex items-center justify-center gap-1.5">
                    CREATE FREE PROFILE <ArrowRight size={14} weight="bold" />
                  </button>
                </Link>
              </div>

              <Link href={`/play/${id}`}>
                <button className="w-full h-11 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-[0.15em] transition-colors">
                  BACK TO EVENT
                </button>
              </Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (closed) {
    return (
      <PageShell>
        <div className="max-w-md mx-auto px-4 py-32 text-center">
          <Confetti size={44} weight="duotone" className="mx-auto mb-4 text-primary" />
          <h1 className="font-display text-2xl tracking-wide mb-2">JOINING CLOSED</h1>
          <p className="text-muted-foreground text-sm mb-6">This event is {event.status === "full" || spotsLeft <= 0 ? "full" : event.status}. Browse other events to find a game.</p>
          <Link href="/play"><button className="h-11 px-6 rounded-full bg-primary text-primary-foreground font-display tracking-[0.15em] text-sm">BROWSE EVENTS</button></Link>
        </div>
      </PageShell>
    );
  }

  const time = formatEventTime(event.start_time);

  return (
    <PageShell>
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
        <Link href={`/play/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} weight="bold" /> Back to event
        </Link>

        {/* Event summary */}
        <div className="border border-border rounded-2xl bg-card p-5 mb-6">
          <span className="px-2.5 py-1 rounded-full bg-secondary border border-border font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
            {eventTypeLabel(event.event_type).toUpperCase()}
          </span>
          <h1 className="font-display text-2xl tracking-wide mt-3 mb-3">{event.name}</h1>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5"><Calendar size={13} weight="bold" className="text-primary" />{formatEventDate(event.event_date)}{time ? ` · ${time}` : ""}</div>
            <div className="flex items-center gap-1.5"><MapPin size={13} weight="bold" className="text-primary" />{event.venue_name ? `${event.venue_name} · ` : ""}{event.location}</div>
            <div className="flex items-center gap-1.5"><Sparkle size={13} weight="bold" className="text-primary" />{skillLabel(event.skill_min, event.skill_max)}</div>
          </div>
          <p className="mt-3 text-xs font-mono text-primary">{spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left</p>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <Confetti size={18} weight="fill" className="text-primary" />
          <span className="font-mono text-[11px] tracking-[0.25em] text-primary">JOIN EVENT</span>
        </div>
        <h2 className="font-display text-3xl tracking-wide mb-1">GRAB YOUR SPOT</h2>
        <p className="text-sm text-muted-foreground mb-6">No account required. We only need a few details to add you to the roster.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">FIRST NAME *</label>
              <input name="first_name" required placeholder="Alex" className={inputCls} />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">LAST INITIAL</label>
              <input name="last_initial" maxLength={1} placeholder="M" className={`${inputCls} w-20 text-center`} />
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">EMAIL *</label>
            <input name="email" type="email" required placeholder="alex@email.com" className={inputCls} />
            <p className="mt-1 text-xs text-muted-foreground">We&apos;ll use this to confirm your spot and let you claim your results later.</p>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">PHONE (OPTIONAL)</label>
            <input name="phone" type="tel" placeholder="(555) 123-4567" className={inputCls} />
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">SELF RATING / SKILL LEVEL</label>
            <select name="self_rating" defaultValue="" className={inputCls}>
              <option value="" disabled>Select your level</option>
              {SKILL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">GENDER (OPTIONAL)</label>
            <select name="gender" defaultValue="Prefer not to say" className={inputCls}>
              {GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
          >
            {saving ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Confetti size={16} weight="fill" />}
            JOIN EVENT
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account? <Link href={`/auth?redirect=/play/${id}/join`} className="text-primary hover:underline">Sign in</Link> to auto-fill.
          </p>
        </form>
      </div>
    </PageShell>
  );
}
