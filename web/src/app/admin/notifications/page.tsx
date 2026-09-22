"use client";

// Push-campaign list (Phase 5). Newest first; search by name or title; filter
// by status. Counts come from admin_campaign_summary — no tokens reach here.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { CampaignStatusBadge } from "@/components/admin/campaign-status-badge";
import {
  audienceLabel, CAMPAIGN_STATUSES, DESTINATION_LABEL, STATUS_LABEL, type CampaignStatus,
} from "@/lib/campaigns/campaign-logic";
import {
  getBroadcastConfig, listCampaigns, type BroadcastConfig, type CampaignRow, type CampaignSummary,
} from "@/lib/campaigns/campaign-service";
import type { DeepLinkType } from "@shared/deep-link";

type Row = CampaignRow & { summary: CampaignSummary | undefined };

export default function CampaignListPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<BroadcastConfig | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CampaignStatus | "">("");

  // No synchronous setState here: the initial `loading` is already true, and
  // Refresh flips it itself before calling.
  const load = useCallback(async () => {
    const r = await listCampaigns();
    setLoading(false);
    if (!r.ok) { toast.error(r.message); return; }
    const byId = new Map(r.data.summaries.map((s) => [s.campaign_id, s]));
    setRows(r.data.rows.map((c) => ({ ...c, summary: byId.get(c.id) })));
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setConfig(await getBroadcastConfig());
    })();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) =>
      (!status || c.status === status) &&
      (!q || c.internal_name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
    );
  }, [rows, query, status]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Admin
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-wide">Push campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Broadcast notifications to app users.{" "}
            {config && (
              <span className={config.enabled ? "font-semibold text-primary" : "font-semibold text-muted-foreground"}>
                Broadcasts are {config.enabled ? "on" : "off"}.
              </span>
            )}
          </p>
        </div>
        <Link
          href="/admin/notifications/compose"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus size={16} weight="bold" /> New campaign
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="campaign-search" className="sr-only">Search campaigns</label>
          <input
            id="campaign-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or title"
            className="w-full rounded-full border border-input bg-background py-2 pl-9 pr-4 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <label htmlFor="campaign-status" className="sr-only">Status</label>
        <select
          id="campaign-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CampaignStatus | "")}
          className="rounded-full border border-input bg-background px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button
          type="button"
          onClick={() => { setLoading(true); void load(); }}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Campaign</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Audience</th>
              <th scope="col" className="px-4 py-3 font-medium">Opens</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Devices</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Accepted</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Failed</th>
              <th scope="col" className="px-4 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "No campaigns yet." : "Nothing matches."}
                </td>
              </tr>
            )}
            {!loading && visible.map((c) => {
              const s = c.summary;
              const when = c.completed_at ?? c.scheduled_at ?? c.created_at;
              const whenLabel = c.completed_at ? "Finished" : c.scheduled_at ? "Scheduled" : "Created";
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="max-w-[18rem] px-4 py-3">
                    <Link href={`/admin/notifications/${c.id}`} className="font-semibold hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring">
                      {c.internal_name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">{c.title}</div>
                  </td>
                  <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{audienceLabel(c.audience_type, c.audience_platform)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{DESTINATION_LABEL[c.destination_type as DeepLinkType] ?? c.destination_type}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.recipient_device_count ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s && c.recipient_device_count !== null ? s.accepted : "—"}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${s && s.failed > 0 ? "text-destructive" : ""}`}>
                    {s && c.recipient_device_count !== null ? s.failed : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {whenLabel} {new Date(when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length >= 500 && (
        <p className="mt-2 text-xs text-muted-foreground">Showing the newest 500 campaigns.</p>
      )}
    </main>
  );
}
