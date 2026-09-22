"use client";

// Push-campaign detail (Phase 5): content, audience, lifecycle and actors,
// delivery and receipt counts, errors by cause, the tap metric with its
// denominator spelled out, and the audit trail. Polls while the campaign is
// queuing/sending/aborting — realtime isn't worth a subscription for a page
// one person watches.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, DeviceMobile, PencilSimple, Prohibit, StopCircle } from "@phosphor-icons/react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CampaignPreview } from "@/components/admin/campaign-preview";
import { CampaignStatusBadge } from "@/components/admin/campaign-status-badge";
import {
  AUDIT_ACTION_LABEL, audienceLabel, canAbort, canCancel, canEdit, DESTINATION_LABEL,
  ERROR_CODE_LABEL, groupDeliveryErrors, isLive, tapMetric,
} from "@/lib/campaigns/campaign-logic";
import {
  abortCampaign, cancelCampaign, getActorNames, getAudit, getCampaign, getDeliveries, getSummary, sendTest,
  type AuditRow, type CampaignDelivery, type CampaignRow, type CampaignSummary,
} from "@/lib/campaigns/campaign-service";
import type { DeepLinkType } from "@shared/deep-link";

const POLL_MS = 4000;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [deliveries, setDeliveries] = useState<CampaignDelivery[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [dialog, setDialog] = useState<"cancel" | "abort" | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const [c, s, d, a] = await Promise.all([getCampaign(id), getSummary(id), getDeliveries(id), getAudit(id)]);
    setLoading(false);
    if (!c.ok) { toast.error(c.message); return; }
    if (!c.data) { setNotFound(true); return; }
    setCampaign(c.data);
    if (s.ok) setSummary(s.data);
    if (d.ok) setDeliveries(d.data);
    if (a.ok) {
      setAudit(a.data);
      setNames(await getActorNames([
        c.data.created_by, c.data.sent_by, c.data.cancelled_by, c.data.aborted_by,
        ...a.data.map((r) => r.actor_id),
      ]));
    }
  }, [id]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  // Poll only while something is moving.
  const live = campaign ? isLive(campaign.status) : false;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [live, load]);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await action();
      if (!r.ok) toast.error(r.message ?? "Request failed.");
      else toast.success(success);
      setDialog(null);
      await load();
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function onTest() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await sendTest(id);
      if (!r.ok) toast.error(r.message);
      else toast.success(`Test sent to ${r.data.accepted} of your ${r.data.deviceCount} device${r.data.deviceCount === 1 ? "" : "s"}.`);
      await load();
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  if (loading) return <Shell><p className="mt-6 text-sm text-muted-foreground">Loading…</p></Shell>;
  if (notFound || !campaign) return <Shell><p className="mt-6 text-sm">Campaign not found.</p></Shell>;

  const c = campaign;
  const s = summary;
  const actor = (uid: string | null, fallback: string) => (uid ? names[uid] ?? "Admin" : fallback);
  const errors = groupDeliveryErrors(deliveries);
  const tap = s ? tapMetric(Number(s.taps), Number(s.tap_capable_accepted), Number(s.accepted)) : null;
  const pruned = !!s?.stats_frozen_at && deliveries.length === 0 && (c.recipient_device_count ?? 0) > 0;
  const capped = deliveries.length >= 1000;
  const submittedSoFar = s ? Number(s.accepted) + Number(s.failed) + Number(s.invalid_token) : 0;

  return (
    <Shell>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words font-display text-3xl tracking-wide">{c.internal_name}</h1>
            <CampaignStatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {audienceLabel(c.audience_type, c.audience_platform)} · opens a{" "}
            {(DESTINATION_LABEL[c.destination_type as DeepLinkType] ?? c.destination_type).toLowerCase()}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {(c.status === "draft" || c.status === "scheduled") && (
            <ActionButton onClick={() => void onTest()} disabled={busy} icon={<DeviceMobile size={16} />}>
              Send me a test
            </ActionButton>
          )}
          {canEdit(c.status) && (
            <Button asChild variant="secondary">
              <Link href={`/admin/notifications/compose?id=${c.id}`}>
                <PencilSimple size={16} /> Edit and send
              </Link>
            </Button>
          )}
          {canCancel(c.status) && (
            <ActionButton onClick={() => setDialog("cancel")} disabled={busy} icon={<Prohibit size={16} />}>
              {c.status === "draft" ? "Discard draft" : "Cancel"}
            </ActionButton>
          )}
          {canAbort(c.status) && (
            <Button type="button" variant="destructive" onClick={() => setDialog("abort")} disabled={busy}>
              <StopCircle size={16} /> Abort
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          {s && c.recipient_device_count !== null && (
            <Section title="Delivery">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="People" value={c.recipient_user_count} />
                <Metric label="Devices" value={c.recipient_device_count} />
                <Metric label="Accepted by Expo" value={Number(s.accepted)} />
                <Metric label="Failed" value={Number(s.failed)} bad={Number(s.failed) > 0} />
                <Metric label="Uninstalled" value={Number(s.invalid_token)} />
                <Metric label="Skipped" value={Number(s.skipped)} hint="aborted or halted before sending" />
                <Metric label="Waiting" value={Number(s.queued) + Number(s.retry_pending) + Number(s.submitted)} />
                <Metric label="Excluded: no platform" value={c.excluded_unknown_platform_count} />
              </div>
              <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipts from Expo</h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Confirmed delivered" value={Number(s.receipt_ok)} />
                <Metric label="Awaiting receipt" value={Number(s.receipt_pending)} hint="up to 24h" />
                <Metric label="Unconfirmed" value={Number(s.unconfirmed)} hint="Expo never answered" />
                <Metric label="Failed by receipt" value={Number(s.receipt_failed)} bad={Number(s.receipt_failed) > 0} />
              </div>
              {s.stats_frozen_at && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Final counts, frozen {fmt(s.stats_frozen_at)}.{pruned ? " Per-device detail has been pruned (kept 90 days)." : ""}
                </p>
              )}
            </Section>
          )}

          {s && c.recipient_device_count !== null && tap && (
            <Section title="Taps">
              {tap.kind === "rate" ? (
                <p className="text-sm">
                  <span className="font-display text-3xl">{tap.pct}%</span>{" "}
                  <span className="text-muted-foreground">
                    — {tap.taps} tap{tap.taps === 1 ? "" : "s"} out of {tap.denominator} accepted deliveries to app
                    versions that report taps.
                  </span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No tap rate: none of the accepted deliveries went to an app version that reports taps.
                </p>
              )}
              {tap.excluded > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {tap.excluded} accepted deliver{tap.excluded === 1 ? "y was" : "ies were"} to older app versions
                  that can&apos;t report a tap, and {tap.excluded === 1 ? "is" : "are"} left out of both sides of the rate.
                </p>
              )}
            </Section>
          )}

          {(errors.length > 0 || capped) && (
            <Section title="Problems by cause">
              <ul className="divide-y divide-border">
                {errors.map((e) => (
                  <li key={`${e.source}:${e.code}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {ERROR_CODE_LABEL[e.code] ?? e.code}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {e.code} · {e.source === "receipt" ? "receipt" : "send"}
                      </span>
                    </span>
                    <span className="tabular-nums font-semibold">{e.count}</span>
                  </li>
                ))}
              </ul>
              {capped && <p className="mt-2 text-xs text-muted-foreground">Grouped from the first 1,000 deliveries.</p>}
            </Section>
          )}

          <Section title="Timeline">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Row label="Created" at={c.created_at} by={actor(c.created_by, "—")} />
              {c.scheduled_at && <Row label="Scheduled for" at={c.scheduled_at} />}
              {c.queued_at && <Row label="Queued" at={c.queued_at} by={actor(c.sent_by, "Scheduler")} />}
              {c.started_at && <Row label="Started sending" at={c.started_at} />}
              {c.completed_at && <Row label="Finished" at={c.completed_at} />}
              {c.cancelled_at && <Row label="Cancelled" at={c.cancelled_at} by={actor(c.cancelled_by, "—")} />}
              {c.aborted_at && <Row label="Aborted" at={c.aborted_at} by={actor(c.aborted_by, "—")} />}
              {!c.aborted_at && c.aborted_by && <Row label="Abort requested" by={actor(c.aborted_by, "—")} />}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            </p>
          </Section>

          <Section title="Audit history">
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : (
              <ol className="space-y-2">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="font-mono text-[11px] text-muted-foreground">{fmt(a.created_at)}</span>
                    <span className="font-semibold">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</span>
                    <span className="text-muted-foreground">{a.actor_id ? names[a.actor_id] ?? "Admin" : "System"}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Content">
            <CampaignPreview title={c.title} body={c.body} />
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-xs text-muted-foreground">Title</dt><dd className="break-words">{c.title}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Message</dt><dd className="whitespace-pre-wrap break-words">{c.body}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Opens</dt><dd className="break-all font-mono text-xs">{c.destination_url}</dd></div>
            </dl>
          </Section>
        </aside>
      </div>

      <ActionDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !busy && setDialog(o ? "cancel" : null)}
        title={c.status === "draft" ? "Discard this draft?" : "Cancel this campaign?"}
        description={c.status === "draft"
          ? "The draft is marked cancelled and can't be sent. Its audit history is kept."
          : "It won't be sent. This can't be undone — to send later, create a new campaign."}
        confirmLabel={c.status === "draft" ? "Discard draft" : "Cancel campaign"}
        icon={<Prohibit size={16} />}
        busy={busy}
        onConfirm={() => void run(() => cancelCampaign(c.id), c.status === "draft" ? "Draft discarded." : "Campaign cancelled.")}
      />
      <ActionDialog
        open={dialog === "abort"}
        onOpenChange={(o) => !busy && setDialog(o ? "abort" : null)}
        title="Abort this campaign?"
        description={
          `Abort stops the notifications that haven't gone out yet. Notifications already handed to Expo ` +
          `— ${submittedSoFar} so far — cannot be recalled and will still arrive.`
        }
        confirmLabel="Abort sending"
        icon={<StopCircle size={16} />}
        busy={busy}
        onConfirm={() => void run(() => abortCampaign(c.id), "Abort requested. Sending stops at the next batch.")}
      />
    </Shell>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/admin/notifications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Push campaigns
      </Link>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, hint, bad = false }: { label: string; value: number | null; hint?: string; bad?: boolean }) {
  return (
    <div>
      <div className={`font-display text-2xl tabular-nums ${bad ? "text-destructive" : ""}`}>{value ?? "—"}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">
        {label}{hint && <span className="block">{hint}</span>}
      </div>
    </div>
  );
}

function Row({ label, at, by }: { label: string; at?: string; by?: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{at ? fmt(at) : ""}{by && <span className="text-muted-foreground">{at ? " · " : ""}{by}</span>}</dd>
    </>
  );
}

function ActionButton({ onClick, disabled, icon, children }: {
  onClick: () => void; disabled: boolean; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={disabled}>
      {icon} {children}
    </Button>
  );
}

// Both actions are irreversible, so both confirm in the destructive role.
function ActionDialog({ open, onOpenChange, title, description, confirmLabel, icon, busy, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  icon: React.ReactNode;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            {icon}
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
