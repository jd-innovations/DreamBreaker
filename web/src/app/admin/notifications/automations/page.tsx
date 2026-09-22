"use client";

// Automations — the catalog of every automatic notification the app sends.
//
// One row per automation: what it is, whether it is on, when it last fired and
// how often. Opening one lets an admin edit the copy (with a phone-style
// preview), the timing, the channels and the throttle, and send a real test
// push to their own device before switching it on.
//
// What an admin CANNOT do here is invent a new trigger: the sensing half of an
// automation is code. Rows marked "not built yet" are catalogued so the
// backlog is visible in the product rather than in a document — they cannot be
// enabled (a database constraint enforces that, not just this screen).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, BellRinging, DeviceMobile, PencilSimple, Warning } from "@phosphor-icons/react";
import { NotificationsTabs } from "@/components/admin/notifications-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FIELD, INPUT_TEXT } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL, CATEGORY_NOTE, CHANNEL_LABEL, describeTiming, listAutomations, parseOffsets,
  renderPreview, testAutomation, updateAutomation, variablesFor,
  type Automation, type Channel,
} from "@/lib/notifications/automations";

const CATEGORY_TONE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  social: "bg-primary/10 text-primary",
  discovery: "bg-primary/10 text-primary",
  marketing: "bg-muted text-muted-foreground",
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";
}

export default function AutomationsPage() {
  const [rows, setRows] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | null>(null);

  const load = useCallback(async () => {
    const r = await listAutomations();
    setLoading(false);
    if (!r.ok) { toast.error(r.message); return; }
    setRows(r.data);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  async function toggle(a: Automation, enabled: boolean) {
    const r = await updateAutomation(a.key, { enabled });
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(enabled ? `${a.name} is on.` : `${a.name} is off.`);
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Admin
      </Link>

      <h1 className="mt-4 font-display text-3xl tracking-wide">Notifications</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Notifications the app sends by itself. Copy, timing and channels are editable here; critical ones ignore
        quiet hours and the frequency caps, which live in Platform settings.
      </p>

      <NotificationsTabs />

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((a) => (
            <li key={a.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.name}</span>
                    <span className={cn("rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                      CATEGORY_TONE[a.category] ?? "bg-muted text-muted-foreground")}>
                      {CATEGORY_LABEL[a.category]}
                    </span>
                    {!a.wired && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <Warning size={12} /> not built yet
                      </span>
                    )}
                    {a.enabled && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <BellRinging size={12} weight="fill" /> on
                      </span>
                    )}
                  </div>

                  {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}

                  <p className="mt-2 text-sm">
                    <span className="font-medium">{renderPreview(a.title_template)}</span>
                    <span className="text-muted-foreground"> — {renderPreview(a.body_template)}</span>
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {a.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}
                    {describeTiming(a) ? ` · ${describeTiming(a)}` : ""}
                    {a.throttle_hours ? ` · at most once every ${a.throttle_hours}h` : ""}
                    {` · last sent ${fmt(a.last_sent_at)}`}
                    {a.sent_total > 0 ? ` · ${a.sent_7d} in the last 7 days, ${a.sent_total} all time` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                    <PencilSimple size={14} /> Edit
                  </Button>
                  <Button
                    variant={a.enabled ? "outline" : "secondary"}
                    size="sm"
                    disabled={!a.wired}
                    title={a.wired ? undefined : "Nothing senses this event yet."}
                    onClick={() => void toggle(a, !a.enabled)}
                  >
                    {a.enabled ? "Turn off" : "Turn on"}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditDialog
          automation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function EditDialog({ automation, onClose, onSaved }: {
  automation: Automation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(automation.title_template);
  const [body, setBody] = useState(automation.body_template);
  const [offsets, setOffsets] = useState(
    Array.isArray(automation.timing?.offsets_hours) ? automation.timing.offsets_hours.join(", ") : "",
  );
  const [throttle, setThrottle] = useState(automation.throttle_hours?.toString() ?? "");
  const [channels, setChannels] = useState<Channel[]>(automation.channels);
  const [busy, setBusy] = useState(false);

  const hasOffsets = Array.isArray(automation.timing?.offsets_hours);
  const parsedOffsets = hasOffsets ? parseOffsets(offsets) : [];
  const offsetsBad = hasOffsets && parsedOffsets === null;
  const throttleBad = throttle !== "" && !(Number(throttle) > 0);
  const vars = variablesFor(automation);

  function flip(c: Channel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function save() {
    if (offsetsBad || throttleBad || channels.length === 0 || !title.trim() || !body.trim()) return;
    setBusy(true);
    const r = await updateAutomation(automation.key, {
      title_template: title.trim(),
      body_template: body.trim(),
      channels,
      throttle_hours: throttle === "" ? null : Number(throttle),
      ...(hasOffsets ? { timing: { ...automation.timing, offsets_hours: parsedOffsets ?? [] } } : {}),
    });
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success("Saved.");
    onSaved();
  }

  async function test() {
    setBusy(true);
    const r = await testAutomation(automation.key);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    if (!r.data.sent) {
      toast.error(r.data.reason === "no_device"
        ? "No device is registered for your account — open the app and allow notifications first."
        : "Nothing was sent.");
      return;
    }
    toast.success("Test sent to your device. Save first if you want to test unsaved copy.");
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!busy && !o) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{automation.name}</DialogTitle>
          <DialogDescription>{CATEGORY_NOTE[automation.category]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_TEXT} maxLength={120} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-body">Body</Label>
            <textarea id="a-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={FIELD} maxLength={300} />
            {vars.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Variables: {vars.map((v) => `{{${v}}}`).join(", ")}. A variable the event cannot supply is left as-is,
                so only use ones already in this automation.
              </p>
            )}
          </div>

          {/* Phone-style preview, the same shape as a lock-screen notification. */}
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Preview</p>
            <div className="flex gap-3 rounded-2xl bg-card p-3 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <DeviceMobile size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{renderPreview(title) || "Title"}</p>
                <p className="text-sm text-muted-foreground">{renderPreview(body) || "Body"}</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Channels</Label>
            <div className="flex flex-wrap gap-2">
              {(["push", "in_app", "email"] as Channel[]).map((c) => (
                <Button key={c} type="button" size="sm" variant={channels.includes(c) ? "secondary" : "outline"}
                  aria-pressed={channels.includes(c)} onClick={() => flip(c)}>
                  {CHANNEL_LABEL[c]}
                </Button>
              ))}
            </div>
            {channels.length === 0 && <p className="text-xs text-destructive">Pick at least one channel.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {hasOffsets && (
              <div className="space-y-1.5">
                <Label htmlFor="a-offsets">Send before (hours)</Label>
                <Input id="a-offsets" value={offsets} onChange={(e) => setOffsets(e.target.value)}
                  placeholder="24, 2" className={INPUT_TEXT} />
                <p className="text-xs text-muted-foreground">
                  Comma-separated. Each one sends once; a player only gets the reminder their remaining time falls in.
                </p>
                {offsetsBad && <p className="text-xs text-destructive">Use whole numbers of hours, e.g. 24, 2.</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="a-throttle">Throttle (hours)</Label>
              <Input id="a-throttle" value={throttle} onChange={(e) => setThrottle(e.target.value)}
                placeholder="none" className={INPUT_TEXT} inputMode="numeric" />
              <p className="text-xs text-muted-foreground">
                Least time between two of these for one person. Blank means no limit.
              </p>
              {throttleBad && <p className="text-xs text-destructive">Use a whole number of hours, or leave it blank.</p>}
            </div>
          </div>

          {!automation.wired && (
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Nothing senses this event yet, so it cannot be switched on. The copy can still be written and tested.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void test()}>
            Send me a test
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button type="button" variant="secondary"
              disabled={busy || offsetsBad || throttleBad || channels.length === 0 || !title.trim() || !body.trim()}
              onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
