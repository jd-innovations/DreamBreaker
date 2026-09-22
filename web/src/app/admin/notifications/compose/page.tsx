"use client";

// Push-campaign composer (Phase 5). New campaign, or ?id=<draft> to edit one.
// Rules live in @/lib/campaigns/campaign-logic; data calls in campaign-service.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FloppyDisk, PaperPlaneTilt, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { CampaignPreview } from "@/components/admin/campaign-preview";
import { CampaignConfirmDialog, type ConfirmSummary } from "@/components/admin/campaign-confirm-dialog";
import {
  audienceLabel, BODY_MAX, BODY_WARN, buildDestination, DESTINATION_LABEL, DESTINATION_OPTIONS,
  lengthState, NAME_MAX, parseDestination, scheduleInstant, timezoneLabel, TITLE_MAX, TITLE_WARN,
  type AudienceChoice, type LengthState,
} from "@/lib/campaigns/campaign-logic";
import {
  confirmSend, getBroadcastConfig, getCampaign, previewAudience, previewDestination, saveDraft,
  type AudiencePreview, type BroadcastConfig, type DestinationLookup,
} from "@/lib/campaigns/campaign-service";
import type { DeepLinkType } from "@shared/deep-link";

export default function ComposePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">Loading…</main>}>
      <Composer />
    </Suspense>
  );
}

function Composer() {
  const router = useRouter();
  const params = useSearchParams();

  const [id, setId] = useState<string | null>(params.get("id"));
  const [loading, setLoading] = useState(!!params.get("id"));
  const [blocked, setBlocked] = useState<string | null>(null);

  const [internalName, setInternalName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AudienceChoice>("all");
  const [destType, setDestType] = useState<DeepLinkType | "">("");
  const [destId, setDestId] = useState("");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [scheduleLocal, setScheduleLocal] = useState("");

  const [config, setConfig] = useState<BroadcastConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // One in-flight write at a time, whatever the button state says: a
  // double-click must not create two drafts.
  const inFlight = useRef(false);

  useEffect(() => {
    void getBroadcastConfig().then(setConfig);
    const draftId = params.get("id");
    if (!draftId) return;
    void getCampaign(draftId).then((r) => {
      setLoading(false);
      if (!r.ok) { setBlocked(r.message); return; }
      const c = r.data;
      if (!c) { setBlocked("Campaign not found."); return; }
      if (c.status !== "draft") { setBlocked("Only drafts can be edited. This campaign has moved on."); return; }
      setInternalName(c.internal_name);
      setTitle(c.title);
      setBody(c.body);
      setAudience(c.audience_type === "all" ? "all" : (c.audience_platform as AudienceChoice));
      const d = parseDestination(c.destination_url);
      setDestType(d.type);
      setDestId(d.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameState = lengthState(internalName, null, NAME_MAX);
  const titleState = lengthState(title, TITLE_WARN, TITLE_MAX);
  const bodyState = lengthState(body, BODY_WARN, BODY_MAX);
  const destination = useMemo(() => buildDestination(destType, destId), [destType, destId]);

  // What the id actually points at. Looked up after typing pauses; a result
  // is only trusted for the URL it was fetched for, so a stale answer never
  // labels a different id.
  const [lookup, setLookup] = useState<{ url: string; result: DestinationLookup } | null>(null);
  const destUrl = destination.ok ? destination.url : null;
  useEffect(() => {
    if (!destUrl) return;
    const t = setTimeout(() => {
      void previewDestination(destUrl).then((r) => {
        if (r.ok) setLookup({ url: destUrl, result: r.data });
      });
    }, 400);
    return () => clearTimeout(t);
  }, [destUrl]);
  const target = destUrl && lookup?.url === destUrl ? lookup.result : null;
  const when = timing === "later" ? scheduleInstant(scheduleLocal) : null;
  const tz = useMemo(() => timezoneLabel(), []);

  const contentValid =
    nameState !== "empty" && nameState !== "over" &&
    titleState !== "empty" && titleState !== "over" &&
    bodyState !== "empty" && bodyState !== "over" &&
    destination.ok;
  const timingValid = timing === "now" || (when?.ok ?? false);

  async function persist(): Promise<string | null> {
    if (!destination.ok) return null;
    const r = await saveDraft({ id, internalName, title, body, audience, destinationUrl: destination.url });
    if (!r.ok) { toast.error(r.message); return null; }
    if (!id) {
      setId(r.data);
      // Further saves update this draft instead of creating another.
      router.replace(`/admin/notifications/compose?id=${r.data}`);
    }
    return r.data;
  }

  async function onSaveDraft() {
    setShowErrors(true);
    if (!contentValid || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const saved = await persist();
      if (saved) toast.success("Draft saved.");
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  async function onReview() {
    setShowErrors(true);
    if (!contentValid || !timingValid || inFlight.current || !config?.enabled) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const saved = await persist();
      if (!saved) return;
      // Fresh check, not the debounced one: the server refuses to schedule a
      // destination that matches nothing, so say so before the dialog opens.
      if (destination.ok) {
        const t = await previewDestination(destination.url);
        if (t.ok && !t.data.found) {
          toast.error(`No ${(DESTINATION_LABEL[destination.type] ?? "item").toLowerCase()} has that id.`);
          return;
        }
        if (t.ok) setLookup({ url: destination.url, result: t.data });
      }
      setPreview(null);
      setPreviewError(null);
      setConfirmOpen(true);
      const p = await previewAudience(audience);
      if (p.ok) setPreview(p.data); else setPreviewError(p.message);
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  async function onConfirm() {
    if (!id || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      const at = timing === "later" && when?.ok ? when.iso : null;
      const r = await confirmSend(id, at);
      if (!r.ok) {
        toast.error(r.message);
        // Scheduling may have succeeded before the send failed; the detail
        // page shows the true state either way.
        router.push(`/admin/notifications/${id}`);
        return;
      }
      toast.success(
        r.data.mode === "scheduled"
          ? "Campaign scheduled."
          : `Sending to ${r.data.deviceCount ?? "the"} device${r.data.deviceCount === 1 ? "" : "s"}.`,
      );
      router.push(`/admin/notifications/${id}`);
    } finally {
      setSending(false);
      inFlight.current = false;
    }
  }

  const summary: ConfirmSummary = {
    title: title.trim(),
    body: body.trim(),
    audienceLabel: audienceLabel(audience === "all" ? "all" : "platform", audience === "all" ? null : audience),
    isPlatformAudience: audience !== "all",
    destinationLabel: destination.ok
      ? `${DESTINATION_LABEL[destination.type] ?? destination.type}${target?.found ? `: ${target.label}` : ""}`
      : "",
    destinationWarning: target?.found ? target.warning : null,
    destinationUrl: destination.ok ? destination.url : "",
    timingLabel: timing === "now"
      ? "Now"
      : when?.ok ? `${new Date(when.iso).toLocaleString()} — ${tz}` : "",
    sendNow: timing === "now",
  };

  if (loading) {
    return <main className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">Loading draft…</main>;
  }
  if (blocked) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <BackLink />
        <p className="mt-6 text-sm">{blocked}</p>
        {id && (
          <Link href={`/admin/notifications/${id}`} className="mt-3 inline-block text-sm font-semibold text-primary">
            Open the campaign →
          </Link>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <BackLink />
      <h1 className="mt-4 font-display text-3xl tracking-wide">{id ? "Edit draft" : "New push campaign"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Goes to everyone who allows platform announcements, or only to one platform. It must open a
        tournament, community event, listing, group or coach offer.
      </p>

      {config && !config.enabled && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-muted p-4 text-sm">
          <WarningCircle size={18} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
          <p>
            <span className="font-semibold">Push broadcasts are switched off.</span>{" "}
            You can write and save drafts and send yourself a test from the campaign page, but nothing can be
            scheduled or sent until the switch is turned on in admin Settings.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()} noValidate>
          <Field label="Internal name" hint="Only admins see this." state={nameState} count={internalName.trim().length} max={NAME_MAX} showErrors={showErrors}>
            {(fid, describedBy) => (
              <input id={fid} aria-describedby={describedBy} value={internalName} onChange={(e) => setInternalName(e.target.value)}
                className={inputClass(showErrors && (nameState === "empty" || nameState === "over"))} />
            )}
          </Field>

          <Field label="Title" hint={`Over ${TITLE_WARN} characters may be cut off on the lock screen.`} state={titleState} count={title.trim().length} max={TITLE_MAX} warn={TITLE_WARN} showErrors={showErrors}>
            {(fid, describedBy) => (
              <input id={fid} aria-describedby={describedBy} value={title} onChange={(e) => setTitle(e.target.value)}
                className={inputClass(showErrors && (titleState === "empty" || titleState === "over"))} />
            )}
          </Field>

          <Field label="Message" hint={`Over ${BODY_WARN} characters shows only partly until expanded.`} state={bodyState} count={body.trim().length} max={BODY_MAX} warn={BODY_WARN} showErrors={showErrors}>
            {(fid, describedBy) => (
              <textarea id={fid} aria-describedby={describedBy} rows={4} value={body} onChange={(e) => setBody(e.target.value)}
                className={cn(inputClass(showErrors && (bodyState === "empty" || bodyState === "over")), "resize-y")} />
            )}
          </Field>

          <fieldset>
            <legend className="text-sm font-semibold">Audience</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["all", "ios", "android"] as const).map((a) => (
                <Choice key={a} name="audience" checked={audience === a} onChange={() => setAudience(a)}
                  label={a === "all" ? "All eligible users" : a === "ios" ? "iOS only" : "Android only"} />
              ))}
            </div>
            {audience !== "all" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Devices that never reported a platform are left out; the confirmation shows how many.
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Opens</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <label className="sr-only" htmlFor="dest-type">Destination type</label>
              <select id="dest-type" value={destType} onChange={(e) => setDestType(e.target.value as DeepLinkType | "")}
                className={inputClass(showErrors && !destType && !destId.includes("/"))}>
                <option value="">Choose…</option>
                {DESTINATION_OPTIONS.map((t) => (
                  <option key={t} value={t}>{DESTINATION_LABEL[t] ?? t}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="dest-id">Item id or link</label>
              <input id="dest-id" placeholder="Id, or paste a link" value={destId} onChange={(e) => setDestId(e.target.value)}
                aria-describedby="dest-msg" className={cn(inputClass(showErrors && !destination.ok), "font-mono text-sm")} />
            </div>
            <div id="dest-msg" className="mt-2 space-y-1 text-xs" aria-live="polite">
              {!destination.ok ? (
                <p className={showErrors ? "text-destructive" : "text-muted-foreground"}>{destination.message}</p>
              ) : (
                <>
                  <p className="break-all font-mono text-muted-foreground">{destination.url}</p>
                  {!target ? (
                    <p className="text-muted-foreground">Checking…</p>
                  ) : target.found ? (
                    <p>
                      <span className="font-semibold">{target.label || "Untitled"}</span>
                      {target.status && <span className="text-muted-foreground"> · {target.status.replace(/_/g, " ")}</span>}
                      {target.warning && <span className="block text-destructive">{target.warning}</span>}
                    </p>
                  ) : (
                    <p className="text-destructive">
                      No {(DESTINATION_LABEL[destination.type] ?? "item").toLowerCase()} has that id. It can be saved as a draft but not sent.
                    </p>
                  )}
                </>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">When</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <Choice name="timing" checked={timing === "now"} onChange={() => setTiming("now")} label="Send now" />
              <Choice name="timing" checked={timing === "later"} onChange={() => setTiming("later")} label="Schedule" />
            </div>
            {timing === "later" && (
              <div className="mt-3">
                <label htmlFor="schedule-at" className="text-xs text-muted-foreground">Date and time in {tz}</label>
                <input id="schedule-at" type="datetime-local" value={scheduleLocal} onChange={(e) => setScheduleLocal(e.target.value)}
                  className={cn(inputClass(showErrors && !(when?.ok ?? false)), "mt-1 max-w-xs")} />
                {showErrors && when && !when.ok && <p className="mt-1 text-xs text-destructive">{when.message}</p>}
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap gap-3 border-t border-border pt-6">
            <button type="button" onClick={() => void onSaveDraft()} disabled={saving}
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold disabled:opacity-40">
              <FloppyDisk size={16} /> {saving ? "Saving…" : "Save draft"}
            </button>
            <button type="button" onClick={() => void onReview()} disabled={saving || !config?.enabled}
              title={config && !config.enabled ? "Push broadcasts are switched off" : undefined}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              <PaperPlaneTilt size={16} /> Review and send…
            </button>
          </div>
        </form>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <h2 className="mb-3 text-sm font-semibold">Preview</h2>
          <CampaignPreview title={title} body={body} />
          <p className="mt-3 text-xs text-muted-foreground">
            Approximate — the real cut-off depends on the device. Test on your own phone from the campaign page.
          </p>
        </aside>
      </div>

      <CampaignConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        summary={summary}
        preview={preview}
        previewError={previewError}
        threshold={config?.threshold ?? 1}
        busy={sending}
        onConfirm={() => void onConfirm()}
      />
    </main>
  );
}

function BackLink() {
  return (
    <Link href="/admin/notifications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft size={14} /> Push campaigns
    </Link>
  );
}

function inputClass(invalid: boolean) {
  return cn(
    "w-full rounded-xl border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring",
    invalid ? "border-destructive" : "border-input",
  );
}

function Field({
  label, hint, state, count, max, warn, showErrors, children,
}: {
  label: string;
  hint: string;
  state: LengthState;
  count: number;
  max: number;
  warn?: number;
  showErrors: boolean;
  children: (id: string, describedBy: string) => React.ReactNode;
}) {
  const fid = `f-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const hid = `${fid}-hint`;
  const over = state === "over";
  const empty = state === "empty" && showErrors;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fid} className="text-sm font-semibold">{label}</label>
        <span
          className={cn(
            "font-mono text-[11px] tabular-nums",
            over ? "text-destructive" : state === "warn" ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {count}/{max}
        </span>
      </div>
      <div className="mt-1.5">{children(fid, hid)}</div>
      <p id={hid} className={cn("mt-1 text-xs", over || empty ? "text-destructive" : "text-muted-foreground")}>
        {over ? `Too long — ${max} characters at most.` : empty ? "Required." : state === "warn" ? `Longer than ${warn}: ${hint.charAt(0).toLowerCase()}${hint.slice(1)}` : hint}
      </p>
    </div>
  );
}

function Choice({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}
