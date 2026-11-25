"use client";

/**
 * Admin review for player court submissions (/courts/suggest), 2026-11-25.
 *
 * Each card shows the change side by side: what the directory says now and
 * what the player proposes. Untick a field to leave it out; Approve applies
 * only the ticked fields through approve_facility_submission()'s column
 * whitelist. Reject needs a reason, which the player is sent.
 *
 * For a NEW court the nearby-duplicates list is loaded per card, so two rows
 * for one venue are caught here even if the player skipped the warning.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { facilityHref } from "@/lib/courts/places";
import { FIELD_LABELS, callRpc } from "@/lib/courts/submissions";

type Submission = {
  id: string;
  kind: "new" | "edit";
  status: string;
  created_at: string;
  facility_id: string | null;
  facility_name: string | null;
  facility_slug: string | null;
  facility_city: string | null;
  facility_state: string | null;
  current_values: Record<string, unknown> | null;
  proposed: Record<string, unknown>;
  note: string | null;
  submitter_id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_total: number;
  review_note: string | null;
  reviewed_at: string | null;
  created_facility_id: string | null;
};

type Dupe = { id: string; name: string; address: string | null; city: string | null; distance_meters: number };

const STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function FacilitySubmissionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: string) => {
    setLoading(true);
    const { data, error } = await callRpc<Submission[]>(supabase, "list_facility_submissions", { p_status: s });
    setLoading(false);
    if (error) { toast.error(error.message.includes("admin_only") ? "Admins only." : error.message); return; }
    setRows(data ?? []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/auth?next=/admin/facility-submissions"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      await load("pending");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl tracking-wide">Court submissions</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        New courts and edits sent by players from the public court directory. Nothing is published until you approve it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => { setStatus(s); void load(s); }}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize ${status === s ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
            {s}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} submission${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="mt-6 space-y-4">
        {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
        {rows.map((r) => <SubmissionCard key={r.id} row={r} onDone={() => load(status)} />)}
      </div>
    </div>
  );
}

function SubmissionCard({ row, onDone }: { row: Submission; onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const keys = Object.keys(row.proposed);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(keys));
  const [dupes, setDupes] = useState<Dupe[] | null>(null);
  const [working, setWorking] = useState(false);
  const pending = row.status === "pending";
  const lat = row.proposed.latitude as number | undefined;
  const lng = row.proposed.longitude as number | undefined;

  useEffect(() => {
    if (row.kind !== "new" || !pending || lat === undefined || lng === undefined) return;
    void callRpc<Dupe[]>(supabase, "facility_duplicate_candidates", {
      p_name: String(row.proposed.name ?? ""), p_latitude: lat, p_longitude: lng, p_radius_meters: 500,
    }).then(({ data }) => setDupes(data ?? []));
  }, [row, pending, lat, lng, supabase]);

  function toggle(k: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k); else next.add(k);
      // The pin is one thing: latitude and longitude go together.
      if (k === "latitude" || k === "longitude") {
        const on = next.has(k);
        for (const c of ["latitude", "longitude"]) if (on) next.add(c); else next.delete(c);
      }
      return next;
    });
  }

  async function approve() {
    if (row.kind === "new" && !["name", "city", "state", "latitude"].every((k) => picked.has(k))) {
      toast.error("A new court needs its name, city, state and map pin.");
      return;
    }
    if (keys.length > 0 && picked.size === 0) { toast.error("Tick at least one field, or reject instead."); return; }
    const note = window.prompt("Note for the record (optional):", "");
    if (note === null) return;
    setWorking(true);
    const { error } = await callRpc<string>(supabase, "approve_facility_submission", {
      p_id: row.id,
      p_fields: picked.size === keys.length ? null : [...picked],
      p_review_note: note.trim() || null,
    });
    setWorking(false);
    if (error) {
      toast.error(error.message.includes("check_court_subtotals")
        ? "Indoor plus outdoor courts would exceed the total. Untick one of the court numbers."
        : error.message);
      return;
    }
    toast.success("Approved and published.");
    onDone();
  }

  async function reject() {
    const reason = window.prompt("Reason (the player is sent this):", "");
    if (reason === null) return;
    if (!reason.trim()) { toast.error("A reason is required."); return; }
    setWorking(true);
    const { error } = await callRpc<null>(supabase, "reject_facility_submission", { p_id: row.id, p_review_note: reason.trim() });
    setWorking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rejected.");
    onDone();
  }

  const courtLink = row.facility_slug && row.facility_city && row.facility_state
    ? facilityHref({ slug: row.facility_slug, city: row.facility_city, state: row.facility_state })
    : null;

  return (
    <article className="rounded-2xl border border-border p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {row.kind === "new" ? "New court" : "Edit"} · {new Date(row.created_at).toLocaleString()}
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {row.kind === "new" ? show(row.proposed.name) : (
              courtLink ? <Link href={courtLink} target="_blank" className="underline">{row.facility_name}</Link> : row.facility_name
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            From {row.submitter_name ?? "a player"}{row.submitter_email ? ` (${row.submitter_email})` : ""} · {row.submitter_total} submission{row.submitter_total === 1 ? "" : "s"} total
          </p>
        </div>
        {lat !== undefined && lng !== undefined && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener noreferrer"
            className="text-sm underline">Open pin in Google Maps</a>
        )}
      </header>

      {keys.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                {pending && <th className="w-8 py-1" />}
                <th className="py-1 pr-3">Field</th>
                {row.kind === "edit" && <th className="py-1 pr-3">Now</th>}
                <th className="py-1">{row.kind === "edit" ? "Proposed" : "Value"}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-t border-border align-top">
                  {pending && (
                    <td className="py-2">
                      <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(k)} aria-label={`Apply ${FIELD_LABELS[k] ?? k}`} />
                    </td>
                  )}
                  <td className="py-2 pr-3 font-medium">{FIELD_LABELS[k] ?? k}</td>
                  {row.kind === "edit" && <td className="py-2 pr-3 text-muted-foreground">{show(row.current_values?.[k])}</td>}
                  <td className="break-words py-2">{show(row.proposed[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {row.note && (
        <p className="mt-4 whitespace-pre-line rounded-xl bg-secondary/60 p-3 text-sm">
          <span className="font-semibold">Note: </span>{row.note}
        </p>
      )}

      {dupes && dupes.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">Possible duplicates within 500 m:</p>
          <ul className="mt-1 list-disc pl-5">
            {dupes.slice(0, 5).map((d) => (
              <li key={d.id}>{d.name} · {[d.address, d.city].filter(Boolean).join(", ")} · {Math.round(d.distance_meters)} m</li>
            ))}
          </ul>
        </div>
      )}

      {!pending && (
        <p className="mt-4 text-sm text-muted-foreground">
          {row.status}{row.reviewed_at ? ` ${new Date(row.reviewed_at).toLocaleDateString()}` : ""}{row.review_note ? ` · ${row.review_note}` : ""}
        </p>
      )}

      {pending && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={approve} disabled={working}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {picked.size === keys.length ? "Approve" : `Approve ${picked.size} of ${keys.length}`}
          </button>
          <button type="button" onClick={reject} disabled={working}
            className="h-10 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-60">
            Reject
          </button>
        </div>
      )}
    </article>
  );
}
