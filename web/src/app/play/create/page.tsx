"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Confetti, ArrowLeft, Info, CheckCircle, Camera, X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { EVENT_TYPES, FORMAT_OPTIONS, type PlayEventType } from "@/lib/community-play";
import { FacilityPicker } from "@/components/facility-picker";
import { InstructorPicker } from "@/components/instructor-picker";
import { uploadEventCover } from "@/lib/media/upload-event-cover";
import { consumePendingGroupId } from "@/lib/groups/pending-group-link";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

const EVENT_TYPE_TITLES: Record<string, string> = {
  open_play: "CREATE A QUICK GAME",
  round_robin: "CREATE A ROUND ROBIN",
  mini_tournament: "CREATE A MINI TOURNAMENT",
  clinic: "CREATE A CLINIC",
  mixer: "CREATE A MIXER",
};

export default function CreatePlayEventPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [organizerName, setOrganizerName] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventType, setEventType] = useState<PlayEventType>("round_robin");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    getUserId().then(async (id) => {
      if (!id) { router.replace("/auth?redirect=/play/create"); return; }
      setUserId(id);
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("full_name").eq("id", id).single();
      setOrganizerName(data?.full_name ?? null);
      setChecking(false);
    });
  }, [router]);

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) return;
    const fd = new FormData(e.currentTarget);

    const name = (fd.get("name") as string)?.trim();
    const location = (fd.get("location") as string)?.trim();
    const event_date = fd.get("event_date") as string;
    if (!name || !location || !event_date) {
      toast.error("Name, location, and date are required.");
      return;
    }

    setSaving(true);

    let cover_url: string | null = null;
    if (coverFile) {
      try {
        cover_url = await uploadEventCover(userId, coverFile);
      } catch (err) {
        console.error(err);
        toast.error("Could not upload the cover photo — creating the event without it.");
      }
    }

    const supabase = createClient();

    const skillMinRaw = fd.get("skill_min") as string;
    const skillMaxRaw = fd.get("skill_max") as string;
    const timeRaw = fd.get("start_time") as string;
    const facilityId = (fd.get("facility_id") as string) || null;
    const durationRaw = fd.get("duration_minutes") as string;
    const instructorId = (fd.get("instructor_id") as string) || null;

    const { data, error } = await supabase
      .from("play_events")
      .insert({
        organizer_id: userId,
        name,
        event_type: eventType,
        venue_name: (fd.get("venue_name") as string)?.trim() || null,
        location,
        city: (fd.get("city") as string)?.trim() || null,
        state: (fd.get("state") as string)?.trim() || null,
        event_date,
        start_time: timeRaw || null,
        skill_min: skillMinRaw ? parseFloat(skillMinRaw) : null,
        skill_max: skillMaxRaw ? parseFloat(skillMaxRaw) : null,
        max_players: parseInt(fd.get("max_players") as string, 10) || 12,
        format: eventType === "round_robin" ? ((fd.get("format") as string) || FORMAT_OPTIONS[0].value) : null,
        notes: (fd.get("notes") as string)?.trim() || null,
        facility_id: facilityId,
        cover_url,
        duration_minutes: durationRaw ? parseInt(durationRaw, 10) : null,
        instructor_id: eventType === "clinic" ? (instructorId || userId) : null,
        group_id: consumePendingGroupId(),
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !data) {
      toast.error("Could not create event. Please try again.");
      console.error(error);
      return;
    }

    toast.success("Event created! Share the link to fill it up.");
    router.push(`/play/${data.id}/manage?created=1`);
  }

  if (checking) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/play" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft size={15} weight="bold" /> Back to Community Play
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <Confetti size={18} weight="fill" className="text-primary" />
          <span className="font-mono text-[11px] tracking-[0.25em] text-primary">HOST AN EVENT</span>
        </div>
        <h1 className="font-display text-4xl tracking-wide mb-6">{EVENT_TYPE_TITLES[eventType] ?? "CREATE AN EVENT"}</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Event type */}
          <Field label="EVENT TYPE">
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={!t.available}
                  onClick={() => t.available && setEventType(t.value)}
                  className={`px-4 h-9 rounded-full text-xs font-mono tracking-wider border transition-colors flex items-center gap-1.5 ${
                    eventType === t.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : t.available
                        ? "border-border hover:border-primary/50"
                        : "border-border/50 text-muted-foreground/50 cursor-not-allowed"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="h-px bg-border" />

          {/* Cover photo */}
          <Field label="COVER PHOTO (OPTIONAL)">
            {coverPreview ? (
              <div className="relative h-40 rounded-xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center"
                  aria-label="Remove cover photo"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed border-border hover:border-primary/50 cursor-pointer text-sm text-muted-foreground transition-colors">
                <Camera size={18} weight="bold" />
                Upload a cover photo
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
              </label>
            )}
          </Field>

          <Field label="EVENT NAME">
            <input name="name" required placeholder="Saturday Morning Dinkfest" className={inputCls} />
          </Field>

          <FacilityPicker />

          <div className="grid grid-cols-2 gap-4">
            <Field label="MAX PLAYERS">
              <input name="max_players" type="number" min={2} max={200} defaultValue={12} className={inputCls} />
            </Field>
            <Field label="DURATION IN MINUTES (OPTIONAL)">
              <input name="duration_minutes" type="number" min={15} step={15} placeholder="90" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="DATE">
              <input name="event_date" type="date" required className={inputCls} />
            </Field>
            <Field label="TIME (OPTIONAL)">
              <input name="start_time" type="time" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="SKILL MIN (OPTIONAL)">
              <input name="skill_min" type="number" step="0.25" min={2} max={8} placeholder="3.0" className={inputCls} />
            </Field>
            <Field label="SKILL MAX (OPTIONAL)">
              <input name="skill_max" type="number" step="0.25" min={2} max={8} placeholder="4.5" className={inputCls} />
            </Field>
          </div>

          {eventType === "round_robin" && (
            <Field label="FORMAT">
              <select name="format" defaultValue={FORMAT_OPTIONS[0].value} className={inputCls}>
                {FORMAT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
          )}

          {eventType === "clinic" && userId && (
            <InstructorPicker organizerId={userId} organizerName={organizerName} />
          )}

          <Field label="NOTES (OPTIONAL)" hint="Anything players should know — bring your own paddle, parking, refreshments, etc.">
            <textarea name="notes" rows={3} placeholder="Casual, fun, all welcome. Balls provided." className={`${inputCls} h-auto py-3 resize-none`} />
          </Field>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 flex items-start gap-2.5 text-sm">
            <Info size={16} weight="fill" className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              After creating, you&apos;ll get a <span className="text-foreground font-semibold">shareable link</span>. Players can join without an account — you manage the roster, generate matches, and record results.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <Link href="/play" className="flex-1">
              <button type="button" className="w-full h-12 rounded-full border border-border hover:bg-secondary text-sm font-display tracking-[0.15em] transition-colors">
                CANCEL
              </button>
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-[0.15em] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <CheckCircle size={16} weight="fill" />}
              CREATE EVENT
            </button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
