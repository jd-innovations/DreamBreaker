"use client";

// Payment reconciliation queue (TODO1.1 3.3).
//
// Presentational only. Every state shown here is derived server-side by
// admin_payment_reconciliation() from live rows -- this component must not
// re-derive "is it stuck?" in the client, because a second implementation of
// that judgement is a second thing to get wrong, and this one would be the one
// people actually look at.
//
// There is deliberately no dismiss/acknowledge control. An item leaves this
// queue when the underlying state is fixed and not before; a dismiss button
// would let a real incident be tidied away, which is how a stranded $10 refund
// stayed invisible for hours. The cost is that a few genuinely-fine items
// (a player entered in two divisions of one tournament) sit here permanently.
// That is the right trade.

import { useState } from "react";
import { Warning, WarningCircle, CheckCircle, ArrowClockwise, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";

export type ReconciliationItem = {
  kind: string;
  severity: string;
  payment_id: string | null;
  refund_id: string | null;
  purpose_type: string | null;
  purpose_id: string | null;
  payer_user_id: string | null;
  payer_name: string | null;
  amount_cents: number | null;
  currency: string | null;
  provider_ref: string | null;
  occurred_at: string | null;
  age_minutes: number | null;
  detail: string | null;
};

// Titles and one-line orientation per kind. The runbook
// (docs/PAYMENT_RECONCILIATION_RUNBOOK.md) is indexed by these same keys and
// carries the actual procedure -- this is only enough to triage at a glance.
const KIND_META: Record<string, { title: string; blurb: string }> = {
  succeeded_not_fulfilled: {
    title: "Charged, nothing delivered",
    blurb: "Payment succeeded and the registration, reservation or purchase it paid for does not exist. Contact the player before you finish diagnosing.",
  },
  webhook_unprocessed: {
    title: "Webhook never finished",
    blurb: "Stripe's event was recorded then the handler died. Redelivery is deduped, so these do not retry themselves.",
  },
  refund_failed: {
    title: "Refund rejected by Stripe",
    blurb: "Money was authorised to go back and did not. The row is the retry handle — re-run the cancel/refund action.",
  },
  refund_stuck: {
    title: "Refund never completed",
    blurb: "Authorised but never submitted, or submitted and unacknowledged for over a day.",
  },
  stuck_pending: {
    title: "PaymentIntent unresolved",
    blurb: "Usually an abandoned checkout. Occasionally a captured charge whose webhook never arrived — check Stripe to tell them apart.",
  },
  duplicate_payment: {
    title: "Possible duplicate charge",
    blurb: "Same payer, same purpose, more than one live payment. Two divisions of one tournament look like this and are legitimate — check the metadata.",
  },
};

// Ordered worst-first. Anything unrecognised sorts last rather than being
// hidden, so a kind added to the SQL still renders before its entry lands here.
const KIND_ORDER = [
  "succeeded_not_fulfilled",
  "webhook_unprocessed",
  "refund_failed",
  "refund_stuck",
  "duplicate_payment",
  "stuck_pending",
];

function fmtMoney(cents: number | null, currency: string | null) {
  if (cents == null) return "—";
  const amount = (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency && currency.toLowerCase() !== "usd" ? `${amount} ${currency.toUpperCase()}` : `$${amount}`;
}

/** Age in the coarsest unit that still reads as urgent. "437m" tells nobody anything. */
function fmtAge(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 48) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

function CopyRef({ value }: { value: string }) {
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}
      className="font-mono text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 max-w-full"
      title={`Copy ${value}`}
    >
      <span className="truncate">{value}</span>
      <Copy size={11} className="flex-shrink-0" />
    </button>
  );
}

export function PaymentReconciliation({
  items,
  loading,
  onRefresh,
}: {
  items: ReconciliationItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [openKind, setOpenKind] = useState<string | null>(null);

  const criticalCount = items.filter((i) => i.severity === "critical").length;
  const groups = KIND_ORDER
    .concat(items.map((i) => i.kind).filter((k) => !KIND_ORDER.includes(k)))
    .filter((kind, idx, arr) => arr.indexOf(kind) === idx)
    .map((kind) => ({ kind, rows: items.filter((i) => i.kind === kind) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold mb-1">
              {criticalCount > 0
                ? `${criticalCount} item${criticalCount === 1 ? "" : "s"} need attention now`
                : items.length > 0
                  ? "Nothing critical"
                  : "Everything reconciles"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Stuck and failed payment states, derived from live rows rather than from any flag — a code path
              that fails silently still shows up here. Procedures for every item:{" "}
              <span className="font-mono">docs/PAYMENT_RECONCILIATION_RUNBOOK.md</span>
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-4 rounded-full border border-border hover:bg-secondary text-xs font-display tracking-wider inline-flex items-center gap-2 disabled:opacity-40"
          >
            <ArrowClockwise size={14} className={loading ? "animate-spin" : undefined} />
            REFRESH
          </button>
        </div>
      </div>

      {items.length === 0 && !loading && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <CheckCircle size={28} className="text-green-400 mx-auto mb-3" weight="fill" />
          <p className="text-sm font-semibold mb-1">No stuck payments</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            An empty queue is not proof a player was not charged. If someone reports a payment with nothing to
            show for it, check their payments rows directly — an intent that never reached succeeded is
            invisible here by design.
          </p>
        </div>
      )}

      {groups.map(({ kind, rows }) => {
        const meta = KIND_META[kind] ?? { title: kind, blurb: "No description for this kind yet." };
        const critical = rows[0].severity === "critical";
        const expanded = openKind === kind || groups.length === 1;
        return (
          <div
            key={kind}
            className={`rounded-2xl border bg-card overflow-hidden ${critical ? "border-red-400/40" : "border-border"}`}
          >
            <button
              onClick={() => setOpenKind(expanded && openKind === kind ? null : kind)}
              className="w-full flex items-start gap-3 p-5 sm:p-6 text-left hover:bg-secondary/40 transition-colors"
            >
              {critical
                ? <WarningCircle size={18} weight="fill" className="text-red-400 flex-shrink-0 mt-0.5" />
                : <Warning size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{meta.title}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${critical ? "bg-red-400/15 text-red-400" : "bg-amber-400/15 text-amber-400"}`}>
                    {rows.length}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{kind}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{meta.blurb}</p>
              </div>
            </button>

            {expanded && (
              <div className="border-t border-border divide-y divide-border">
                {rows.map((r, i) => (
                  <div key={`${r.payment_id ?? r.refund_id ?? kind}-${i}`} className="p-5 sm:p-6 space-y-2">
                    <div className="flex items-baseline justify-between gap-4 flex-wrap">
                      <div className="font-display text-xl tracking-wide">
                        {fmtMoney(r.amount_cents, r.currency)}
                        <span className="ml-2 text-sm font-sans text-muted-foreground">
                          {r.payer_name ?? "Unknown payer"}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {fmtAge(r.age_minutes)} old
                        {r.occurred_at && ` · ${new Date(r.occurred_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                      </div>
                    </div>

                    <p className="text-sm">{r.detail}</p>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1">
                      {r.purpose_type && (
                        <span className="font-mono text-[11px] text-muted-foreground">{r.purpose_type}</span>
                      )}
                      {/* The Stripe reference is the one field an operator always
                          needs next — it is what the runbook has them paste into
                          the Stripe dashboard — so it is one click, not a
                          select-and-drag out of a truncated table cell. */}
                      {r.provider_ref && <CopyRef value={r.provider_ref} />}
                      {r.payment_id && <CopyRef value={r.payment_id} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
