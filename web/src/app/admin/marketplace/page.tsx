"use client";

// Marketplace moderation — /admin/marketplace.
//
// Every listing in every status, most-reported first. Remove (reason required,
// shown to the seller in an in-app notification) takes a listing down
// everywhere; the seller cannot undo it. Restore puts it back — active, or
// expired if its time ran out meanwhile. Both are recorded in
// marketplace_moderation_log (20260922160000).
//
// One card per listing at every width: it reads the same on a phone and a
// desktop, which a wide table would not.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowCounterClockwise, ArrowLeft, Flag, Prohibit, Tag } from "@phosphor-icons/react";
import { formatCents } from "@shared/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FIELD, INPUT_TEXT, SELECT } from "@/components/ui/field-classes";
import {
  ADMIN_PAGE_SIZE, ADMIN_STATUS_FILTERS, listListings, removeListing, REPORT_REASON_LABEL,
  restoreListing, type AdminListing,
} from "@/lib/marketplace/admin-service";

export default function AdminMarketplacePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6">Loading…</main>}>
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
  const [rows, setRows] = useState<AdminListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [removing, setRemoving] = useState<AdminListing | null>(null);
  const [restoring, setRestoring] = useState<AdminListing | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (q: string, st: string) => {
    const r = await listListings(q, st, 0);
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
    const r = await listListings(search, status, rows.length);
    setLoadingMore(false);
    if (!r.ok) { toast.error(r.message); return; }
    setRows((prev) => [...prev, ...r.data]);
  }

  async function confirmRemove() {
    if (!removing || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await removeListing(removing.id, reason);
      if (!r.ok) { toast.error(r.message); return; }
      toast.success("Listing removed. The seller has been notified.");
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
      const r = await restoreListing(restoring.id);
      if (!r.ok) { toast.error(r.message); return; }
      toast.success(r.data === "expired" ? "Restored as expired — its time had run out." : "Listing restored and live again.");
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
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Admin
      </Link>
      <h1 className="mt-4 font-display text-3xl tracking-wide">Marketplace</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every listing in every status, most-reported first. Removing takes a listing down everywhere and tells the
        seller why; they cannot undo it. Everything here is recorded against your account.
      </p>

      <form onSubmit={apply} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
        <div>
          <Label htmlFor="mod-search" className="sr-only">Search</Label>
          <Input id="mod-search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, brand, model, seller or listing id" className={INPUT_TEXT} />
        </div>
        <div>
          <Label htmlFor="mod-status" className="sr-only">Status</Label>
          <select id="mod-status" value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT}>
            {ADMIN_STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
        {loading ? "Loading…" : `${total} listing${total === 1 ? "" : "s"}`}
      </p>

      {!loading && rows.length === 0 && (
        <div className="mt-3 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">Nothing matches.</div>
      )}

      <ul className="mt-3 space-y-3">
        {rows.map((l) => {
          const displayStatus = l.removed_at ? "removed" : l.status;
          return (
            <li key={l.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row">
              <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted sm:w-32">
                {l.photo_url
                  ? <Image src={l.photo_url} alt="" width={256} height={192} className="h-full w-full object-cover" />
                  : <Tag size={24} weight="fill" className="text-muted-foreground" aria-hidden />}
              </div>

              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-semibold">{l.title}</span>
                  <span className={cn("rounded-sm px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
                    STATUS_TONE[displayStatus] ?? "bg-muted text-muted-foreground")}>
                    {displayStatus}
                  </span>
                  {l.open_reports > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                      <Flag size={12} weight="fill" /> {l.open_reports} open report{l.open_reports === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {formatCents(l.asking_price_cents, { omitZeroCents: true })}
                  {[l.brand, l.model].filter(Boolean).length ? ` · ${[l.brand, l.model].filter(Boolean).join(" ")}` : ""}
                  {[l.location_city, l.location_state].filter(Boolean).length
                    ? ` · ${[l.location_city, l.location_state].filter(Boolean).join(", ")}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  Seller{" "}
                  <Link href={`/profile/${l.seller_id}`} className="text-foreground underline-offset-4 hover:underline">
                    {l.seller_name || "Unnamed"}
                  </Link>
                  {" · "}listed {fmt(l.created_at)}
                  {l.expires_at ? ` · expires ${fmt(l.expires_at)}` : ""}
                  {l.removed_at ? ` · removed ${fmt(l.removed_at)}` : ""}
                </div>
                {l.report_reasons && l.report_reasons.length > 0 && (
                  <div className="text-xs text-destructive">
                    Reported as: {l.report_reasons.map((r) => REPORT_REASON_LABEL[r] ?? r).join(", ")}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:w-40 sm:flex-col">
                {displayStatus === "active" && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/marketplace/${l.id}`} target="_blank">View listing</Link>
                  </Button>
                )}
                {l.removed_at ? (
                  <Button variant="outline" size="sm" onClick={() => setRestoring(l)} disabled={busy}>
                    <ArrowCounterClockwise size={14} /> Restore
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={() => { setReason(""); setRemoving(l); }} disabled={busy}>
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
          <Button variant="outline" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load ${Math.min(ADMIN_PAGE_SIZE, total - rows.length)} more`}
          </Button>
        </div>
      )}

      <Dialog open={!!removing} onOpenChange={(o) => { if (!busy && !o) setRemoving(null); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Remove this listing?</DialogTitle>
            <DialogDescription>
              &ldquo;{removing?.title}&rdquo; disappears from the app and the website at once. The seller gets an
              in-app notice with your reason and cannot put it back. You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="remove-reason">Reason (shown to the seller)</Label>
            <textarea id="remove-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              maxLength={500} className={FIELD} placeholder="e.g. Reported as counterfeit; photos do not match the model." />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoving(null)}>Keep it</Button>
            <Button type="button" variant="destructive" disabled={busy || !reasonOk} onClick={() => void confirmRemove()}>
              <Prohibit size={14} /> {busy ? "Removing…" : "Remove listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restoring} onOpenChange={(o) => { if (!busy && !o) setRestoring(null); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Restore this listing?</DialogTitle>
            <DialogDescription>
              &ldquo;{restoring?.title}&rdquo; goes back up — or back to expired if its 30 days ran out while it was
              removed. The seller is not notified.
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
    </main>
  );
}
