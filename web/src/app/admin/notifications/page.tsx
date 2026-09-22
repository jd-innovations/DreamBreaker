"use client";

// Push-campaign list (Phase 5). Newest first; search by name or title; filter
// by status. Counts come from admin_campaign_summary — no tokens reach here.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { CampaignStatusBadge } from "@/components/admin/campaign-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INPUT_TEXT, SELECT } from "@/components/ui/field-classes";
import {
  audienceLabel, CAMPAIGN_STATUSES, DESTINATION_LABEL, STATUS_LABEL, type CampaignStatus,
} from "@/lib/campaigns/campaign-logic";
import {
  getBroadcastConfig, listCampaigns, type BroadcastConfig, type CampaignRow, type CampaignSummary,
} from "@/lib/campaigns/campaign-service";
import type { DeepLinkType } from "@shared/deep-link";

type Row = CampaignRow & { summary: CampaignSummary | undefined };

/** The most telling date for a campaign, and what it means. */
function whenOf(c: Row): { label: string; at: string } {
  if (c.completed_at) return { label: "Finished", at: c.completed_at };
  if (c.scheduled_at) return { label: "Scheduled", at: c.scheduled_at };
  return { label: "Created", at: c.created_at };
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

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
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
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
        <Button asChild variant="secondary">
          <Link href="/admin/notifications/compose">
            <Plus size={16} weight="bold" /> New campaign
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="campaign-search" className="sr-only">Search campaigns</label>
          <Input
            id="campaign-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or title"
            className={`pl-9 ${INPUT_TEXT}`}
          />
        </div>
        <label htmlFor="campaign-status" className="sr-only">Status</label>
        <select
          id="campaign-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as CampaignStatus | "")}
          className={`${SELECT} w-auto`}
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <Button type="button" variant="outline" onClick={() => { setLoading(true); void load(); }}>
          Refresh
        </Button>
      </div>

      {/* Phones: one card per campaign. The table below needs ~52rem, which on
          a phone means scrolling sideways to find the status. */}
      <ul className="mt-6 space-y-3 sm:hidden">
        {loading && <li className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">Loading…</li>}
        {!loading && visible.length === 0 && (
          <li className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No campaigns yet." : "Nothing matches."}
          </li>
        )}
        {!loading && visible.map((c) => {
          const s = c.summary;
          const w = whenOf(c);
          const counted = s && c.recipient_device_count !== null;
          return (
            <li key={c.id}>
              <Link
                href={`/admin/notifications/${c.id}`}
                className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 break-words font-semibold">{c.internal_name}</span>
                  <CampaignStatusBadge status={c.status} className="shrink-0" />
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.title}</div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {audienceLabel(c.audience_type, c.audience_platform)}
                  {" · "}{DESTINATION_LABEL[c.destination_type as DeepLinkType] ?? c.destination_type}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums">
                  <span>{c.recipient_device_count ?? "—"} devices</span>
                  <span>{counted ? s.accepted : "—"} accepted</span>
                  <span className={counted && s.failed > 0 ? "text-destructive" : ""}>{counted ? s.failed : "—"} failed</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{w.label} {fmtWhen(w.at)}</div>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 hidden overflow-x-auto rounded-lg border border-border bg-card sm:block">
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
              const w = whenOf(c);
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="max-w-[18rem] px-4 py-3">
                    <Link href={`/admin/notifications/${c.id}`} className="rounded-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
                    {w.label} {fmtWhen(w.at)}
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
    </div>
  );
}
