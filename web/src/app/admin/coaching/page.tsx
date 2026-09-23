"use client";

// Coach-offer moderation — /admin/coaching.
//
// Every offer in every status, removed ones first. Remove (reason required,
// shown to the coach in an in-app notification) takes a lesson out of
// discovery everywhere and freezes it; the coach cannot undo it. Restore puts
// it back PAUSED, never straight to active — a removal meant something was
// wrong and the coach should look before it sells again. Both are recorded in
// coach_offer_moderation_log (20260923310000).
//
// One card per offer at every width, like admin/marketplace: it reads the same
// on a phone and a desktop, which a wide table would not.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, ArrowLeft, Prohibit, Tag } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FIELD, INPUT_TEXT, SELECT } from "@/components/ui/field-classes";
import { formatPrice, OFFER_TYPE_LABEL } from "@/lib/coaching/browse";
import {
  ADMIN_OFFER_PAGE_SIZE, ADMIN_OFFER_STATUS_FILTERS, listCoachOffers, removeCoachOffer,
  restoreCoachOffer, type AdminOffer,
} from "@/lib/coaching/admin-service";

export default function AdminCoachingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6">Loading…</div>}>
      <Moderation />
    </Suspense>
  );
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  removed: "bg-destructive/10 text-destructive",
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

function Moderation() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<AdminOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [removing, setRemoving] = useState<AdminOffer | null>(null);
  const [restoring, setRestoring] = useState<AdminOffer | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (q: string, st: string) => {
    const r = await listCoachOffers(q, st, 0);
    setLoading(false);
    if (!r.ok) { toast.error(r.message); return; }
    setRows(r.data);
    setTotal(Number(r.data[0]?.total_count ?? 0));
  }, []);

  useEffect(() => {
    void (async () => { await load(params.get("q") ?? "", ""); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    void load(search, status);
  }

  async function more() {
    setLoadingMore(true);
    const r = await listCoachOffers(search, status, rows.length);
    setLoadingMore(false);
    if (!r.ok) { toast.error(r.message); return; }
    setRows((prev) => [...prev, ...r.data]);
  }

  async function confirmRemove() {
    if (!removing || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await removeCoachOffer(removing.id, reason);
      if (!r.ok) { toast.error(r.message); return; }
      toast.success("Lesson removed. The coach has been notified.");
      setRemoving(null);
      setReason("");
      setLoading(true);
      await load(search, status);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function confirmRestore() {
    if (!restoring || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await restoreCoachOffer(restoring.id);
      if (!r.ok) { toast.error(r.message); return; }
      toast.success("Restored, and paused so the coach can review it.");
      setRestoring(null);
      setLoading(true);
      await load(search, status);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 500;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Admin
      </Link>
      <h1 className="mt-4 font-display text-3xl tracking-wide">Coaching</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every lesson in every status, removed ones first. Removing takes it out of discovery
        everywhere and tells the coach why; they cannot undo it. Everything here is recorded
        against your account.
      </p>

      <form onSubmit={apply} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
        <div>
          <Label htmlFor="coach-search" className="sr-only">Search</Label>
          <Input id="coach-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Lesson, coach name, coach email or offer id" className={INPUT_TEXT} />
        </div>
        <div>
          <Label htmlFor="coach-status" className="sr-only">Status</Label>
          <select id="coach-status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}>
            {ADMIN_OFFER_STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        {loading ? "Loading…" : `${total} lesson${total === 1 ? "" : "s"}`}
      </p>

      {!loading && rows.length === 0 && (
        <div className="mt-3 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nothing matches.
        </div>
      )}

      <ul className="mt-3 space-y-3">
        {rows.map((o) => {
          const displayStatus = o.removed_at ? "removed" : o.status;
          const price = o.discounted_price_cents ?? o.regular_price_cents;
          return (
            <li key={o.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row">
              <div className="flex h-20 w-full shrink-0 items-center justify-center rounded-md bg-muted sm:w-24">
                <Tag size={22} weight="fill" className="text-muted-foreground" aria-hidden />
              </div>

              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-semibold">{o.title}</span>
                  <span className={cn("rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                    STATUS_TONE[displayStatus] ?? "bg-muted text-muted-foreground")}>
                    {displayStatus}
                  </span>
                  {o.purchase_count > 0 && (
                    <span className="rounded-sm bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {o.purchase_count} sold
                    </span>
                  )}
                </div>

                <div className="text-muted-foreground">
                  {formatPrice(price)}
                  {` · ${OFFER_TYPE_LABEL[o.offer_type] ?? o.offer_type}`}
                  {[o.facility_name, [o.city, o.state].filter(Boolean).join(", ")]
                    .filter(Boolean).length ? ` · ${[o.facility_name, [o.city, o.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}` : ""}
                </div>

                <div className="text-xs text-muted-foreground">
                  Coach{" "}
                  <Link href={`/coach/${o.coach_id}`} className="text-foreground underline-offset-4 hover:underline">
                    {o.coach_name || "Unnamed"}
                  </Link>
                  {o.coach_email ? ` · ${o.coach_email}` : ""}
                  {` · created ${fmt(o.created_at)}`}
                  {o.removed_at ? ` · removed ${fmt(o.removed_at)}` : ""}
                </div>

                {o.removed_at && o.last_removed_reason && (
                  <div className="text-xs text-destructive">Removed because: {o.last_removed_reason}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:w-40 sm:flex-col">
                {!o.removed_at && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/lessons/${o.id}`} target="_blank">View lesson</Link>
                  </Button>
                )}
                {o.removed_at ? (
                  <Button variant="secondary" size="sm" onClick={() => setRestoring(o)} disabled={busy}>
                    <ArrowCounterClockwise size={14} /> Restore
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => { setReason(""); setRemoving(o); }} disabled={busy}>
                    <Prohibit size={14} /> Remove
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!loading && rows.length < total && (
        <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load ${Math.min(ADMIN_OFFER_PAGE_SIZE, total - rows.length)} more`}
          </Button>
        </div>
      )}

      <Dialog open={!!removing} onOpenChange={(o) => { if (!busy && !o) setRemoving(null); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Remove this lesson?</DialogTitle>
            <DialogDescription>
              &ldquo;{removing?.title}&rdquo; disappears from the app and the website at once. The coach gets
              an in-app notice with your reason and cannot put it back. You can restore it later.
              {removing?.purchase_count ? ` It has ${removing.purchase_count} purchase${removing.purchase_count === 1 ? "" : "s"} — those vouchers are not affected.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="remove-reason">Reason (shown to the coach)</Label>
            <textarea id="remove-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              maxLength={500} className={FIELD}
              placeholder="e.g. The photo is not of this facility; please re-upload before republishing." />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Keep it</Button>
            <Button type="button" variant="destructive" disabled={busy || !reasonOk} onClick={() => void confirmRemove()}>
              <Prohibit size={14} /> {busy ? "Removing…" : "Remove lesson"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restoring} onOpenChange={(o) => { if (!busy && !o) setRestoring(null); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Restore this lesson?</DialogTitle>
            <DialogDescription>
              &ldquo;{restoring?.title}&rdquo; comes back <strong>paused</strong>, not live — the coach reviews it
              and publishes again themselves. They are notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRestoring(null)}>Cancel</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void confirmRestore()}>
              <ArrowCounterClockwise size={14} /> {busy ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
