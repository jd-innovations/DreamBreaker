"use client";

/**
 * Admin CSV import for the facility directory.
 *
 * Upload -> mandatory dry run -> review (new / matched / flagged / invalid)
 * -> confirm -> commit -> batch history. See the migration
 * 20260908010000_facility_import_pipeline.sql for why this is split the way
 * it is: staging (matching + writing facility_import_rows) runs as a plain
 * admin-gated RPC over this page's own session and never touches
 * `facilities`; committing is the one step that needs the
 * admin-facility-import-commit edge function's service-role client, because
 * updating an already-claimed/verified facility has no RLS policy that would
 * let an ordinary authenticated admin do it.
 *
 * Photo (2026-09-08 update): the PRIMARY photo only, same as the CLI script
 * — this is not a gallery importer, and admin_commit_facility_import upserts
 * exactly one facility_photos row per facility. The review card below shows
 * that photo (or a graceful placeholder — the facility-photo proxy can be
 * down independent of anything this page does) plus a live Google Maps link
 * from the row's own lat/lng, so an admin can sanity-check what a row will
 * actually look like before it becomes a real facility.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { parseFacilityCsv, type StageRowInput } from "@/lib/facilityImport";

type MatchType = "confident" | "possible" | "new" | "invalid";
type Decision = "approve_update" | "create_new" | "skip";

interface ImportRow {
  id: string;
  row_number: number;
  raw: Record<string, string>;
  mapped: Record<string, unknown>;
  match_type: MatchType;
  matched_facility_id: string | null;
  match_score: number | null;
  match_reason: string | null;
  error: string | null;
  admin_decision: Decision | null;
  applied: boolean;
  apply_error: string | null;
}

interface ImportBatch {
  id: string;
  filename: string;
  status: "dry_run" | "committed" | "failed";
  row_count: number;
  confident_count: number;
  possible_count: number;
  new_count: number;
  invalid_count: number;
  created_at: string;
  committed_at: string | null;
  committed_row_count: number | null;
}

const MATCH_LABEL: Record<MatchType, string> = {
  confident: "Confident match — will update",
  possible: "Possible match — needs your decision",
  new: "No match — will create new",
  invalid: "Invalid — will not be imported",
};

const MATCH_COLOR: Record<MatchType, string> = {
  confident: "text-primary border-primary/40 bg-primary/10",
  possible: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  new: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  invalid: "text-destructive border-destructive/40 bg-destructive/10",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function FacilityImportPage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"upload" | "history">("upload");

  const [file, setFile] = useState<File | null>(null);
  const [staging, setStaging] = useState(false);
  const [parseSkipped, setParseSkipped] = useState<{ rowNumber: number; reason: string }[]>([]);

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rowFilter, setRowFilter] = useState<MatchType | "all">("all");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ appliedCount: number; skippedCount: number; errorCount: number } | null>(null);

  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/auth"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("facility_import_batches")
      .select("id,filename,status,row_count,confident_count,possible_count,new_count,invalid_count,created_at,committed_at,committed_row_count")
      .order("created_at", { ascending: false })
      .limit(50);
    setHistoryLoading(false);
    if (error) { toast.error("Failed to load import history."); return; }
    setHistory((data ?? []) as ImportBatch[]);
  }, [supabase]);

  function switchTab(t: "upload" | "history") {
    setTab(t);
    if (t === "history") void loadHistory();
  }

  const loadRows = useCallback(async (batchId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("facility_import_rows")
      .select("id,row_number,raw,mapped,match_type,matched_facility_id,match_score,match_reason,error,admin_decision,applied,apply_error")
      .eq("batch_id", batchId)
      .order("row_number", { ascending: true });
    if (error) { toast.error("Failed to load import rows."); return; }
    setRows((data ?? []) as ImportRow[]);
  }, [supabase]);

  async function handleUploadAndStage() {
    if (!file) { toast.error("Choose a CSV file first."); return; }
    setStaging(true);
    setCommitResult(null);
    setDecisions({});
    try {
      const text = await file.text();
      const functionsBaseUrl = `${getSupabaseUrl()}/functions/v1`;
      const { rows: parsedRows, skipped } = parseFacilityCsv(text, functionsBaseUrl);
      setParseSkipped(skipped);
      if (parsedRows.length === 0) {
        toast.error("No usable rows found in this CSV.");
        return;
      }

      const storagePath = `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("facility-import-uploads")
        .upload(storagePath, file, { contentType: "text/csv" });
      if (uploadError) {
        toast.error(`Could not store the original CSV: ${uploadError.message}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: batchId, error: stageError } = await (supabase as any).rpc("admin_stage_facility_import", {
        p_filename: file.name,
        p_storage_path: storagePath,
        p_rows: parsedRows as unknown as StageRowInput[],
      });
      if (stageError) {
        toast.error(stageError.message.includes("admin_only") ? "Admins only." : `Dry run failed: ${stageError.message}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: batchRow, error: batchError } = await (supabase as any)
        .from("facility_import_batches")
        .select("id,filename,status,row_count,confident_count,possible_count,new_count,invalid_count,created_at,committed_at,committed_row_count")
        .eq("id", batchId)
        .single();
      if (batchError || !batchRow) { toast.error("Dry run finished but could not load its summary."); return; }

      setBatch(batchRow as ImportBatch);
      await loadRows(batchId as string);
      toast.success(`Dry run complete — ${parsedRows.length} row${parsedRows.length === 1 ? "" : "s"} matched.`);
    } finally {
      setStaging(false);
    }
  }

  function setDecision(rowId: string, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [rowId]: decision }));
  }

  const possibleRows = rows.filter((r) => r.match_type === "possible");
  const undecidedPossible = possibleRows.filter((r) => !decisions[r.id]).length;

  async function handleCommit() {
    if (!batch) return;
    if (undecidedPossible > 0) {
      const proceed = window.confirm(
        `${undecidedPossible} possible match${undecidedPossible === 1 ? "" : "es"} still ha${undecidedPossible === 1 ? "s" : "ve"} no decision and will be skipped, not applied. Continue?`,
      );
      if (!proceed) return;
    }
    const confident = rows.filter((r) => r.match_type === "confident").length;
    const newCount = rows.filter((r) => r.match_type === "new").length;
    const approvedPossible = possibleRows.filter((r) => decisions[r.id] && decisions[r.id] !== "skip").length;
    const confirmed = window.confirm(
      `Commit this import?\n\n` +
      `${confident} existing facilit${confident === 1 ? "y" : "ies"} will be updated\n` +
      `${newCount} new facilit${newCount === 1 ? "y" : "ies"} will be created\n` +
      `${approvedPossible} of ${possibleRows.length} possible match${possibleRows.length === 1 ? "" : "es"} will be applied per your decisions\n\n` +
      `This cannot be undone from this screen.`,
    );
    if (!confirmed) return;

    setCommitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data: fnData, error: fnError } = await supabase.functions.invoke("admin-facility-import-commit", {
        body: { batchId: batch.id, decisions },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (fnError) {
        toast.error(`Commit failed: ${fnError.message}`);
        return;
      }
      const result = fnData as { ok?: boolean; appliedCount: number; skippedCount: number; errorCount: number; error?: string };
      if (!result.ok) {
        toast.error(result.error ?? "Commit failed.");
        return;
      }
      setCommitResult(result);
      setBatch((prev) => prev && { ...prev, status: "committed", committed_row_count: result.appliedCount });
      await loadRows(batch.id);
      toast.success(`Committed: ${result.appliedCount} applied, ${result.skippedCount} skipped, ${result.errorCount} errors.`);
    } finally {
      setCommitting(false);
    }
  }

  function resetUpload() {
    setFile(null);
    setBatch(null);
    setRows([]);
    setDecisions({});
    setCommitResult(null);
    setParseSkipped([]);
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const filteredRows = rowFilter === "all" ? rows : rows.filter((r) => r.match_type === rowFilter);

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl tracking-wide">Facility Directory Import</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload a CSV, review the matches, then commit.</p>
        </div>
        <button onClick={() => router.push("/admin")} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Admin
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        {(["upload", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "upload" ? "Upload & Review" : "Batch History"}
          </button>
        ))}
      </div>

      {tab === "upload" && (
        <div className="space-y-6">
          {!batch && (
            <div className="border border-border rounded-2xl p-6 bg-card">
              <label className="block text-sm font-medium mb-2">CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground border border-border rounded-xl p-2 mb-4"
              />
              <button
                onClick={handleUploadAndStage}
                disabled={!file || staging}
                className="h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-wider disabled:opacity-40"
              >
                {staging ? "Running dry run…" : "Upload & Run Dry Run"}
              </button>
              {parseSkipped.length > 0 && (
                <p className="text-xs text-amber-400 mt-3">
                  {parseSkipped.length} row{parseSkipped.length === 1 ? "" : "s"} skipped before staging (missing facility_name).
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                Nothing is written to the facility directory until you review the matches below and explicitly commit.
              </p>
            </div>
          )}

          {batch && (
            <>
              <div className="border border-border rounded-2xl p-6 bg-card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-display text-lg">{batch.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {batch.row_count} rows · {batch.status === "committed" ? `Committed ${batch.committed_row_count} rows` : "Dry run — not yet committed"}
                    </div>
                  </div>
                  {batch.status === "dry_run" && (
                    <button onClick={resetUpload} className="text-sm text-muted-foreground hover:text-foreground">
                      Start over
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {([
                    ["confident", batch.confident_count],
                    ["possible", batch.possible_count],
                    ["new", batch.new_count],
                    ["invalid", batch.invalid_count],
                  ] as const).map(([type, count]) => (
                    <button
                      key={type}
                      onClick={() => setRowFilter(rowFilter === type ? "all" : type)}
                      className={`rounded-xl border px-3 py-2 text-left transition-colors ${MATCH_COLOR[type]} ${rowFilter === type ? "ring-2 ring-ring" : ""}`}
                    >
                      <div className="text-2xl font-display">{count}</div>
                      <div className="text-[11px] leading-tight">{MATCH_LABEL[type]}</div>
                    </button>
                  ))}
                </div>

                {rowFilter !== "all" && (
                  <button onClick={() => setRowFilter("all")} className="text-xs text-muted-foreground hover:text-foreground mb-2">
                    Clear filter (showing all {rows.length})
                  </button>
                )}
              </div>

              {commitResult && (
                <div className="border border-primary/40 bg-primary/10 rounded-2xl p-4 text-sm">
                  <strong>Committed.</strong> {commitResult.appliedCount} applied, {commitResult.skippedCount} skipped, {commitResult.errorCount} errors.
                </div>
              )}

              <div className="space-y-3">
                {filteredRows.map((row) => (
                  <RowCard key={row.id} row={row} decision={decisions[row.id]} onDecide={setDecision} readOnly={batch.status === "committed"} />
                ))}
                {filteredRows.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No rows in this category.</p>
                )}
              </div>

              {batch.status === "dry_run" && (
                <div className="sticky bottom-4 border border-border rounded-2xl p-4 bg-card shadow-lg flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {undecidedPossible > 0 && <span className="text-amber-400">{undecidedPossible} possible match{undecidedPossible === 1 ? "" : "es"} not yet decided. </span>}
                    Confirming applies confident matches and new facilities automatically.
                  </div>
                  <button
                    onClick={handleCommit}
                    disabled={committing}
                    className="h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-wider disabled:opacity-40 flex-shrink-0"
                  >
                    {committing ? "Committing…" : "Confirm Import"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {historyLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!historyLoading && history.length === 0 && <p className="text-sm text-muted-foreground">No imports yet.</p>}
          {history.map((b) => (
            <div key={b.id} className="border border-border rounded-2xl p-4 bg-card flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{b.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(b.created_at)} · {b.row_count} rows · {b.confident_count} confident · {b.possible_count} possible · {b.new_count} new · {b.invalid_count} invalid
                </div>
              </div>
              <span className={`text-xs font-mono px-2 py-1 rounded-full ${b.status === "committed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {b.status === "committed" ? `Committed (${b.committed_row_count})` : "Dry run"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RowMapped {
  name?: string; city?: string; state?: string; address?: string;
  phone?: string | null; website?: string | null; description?: string | null;
  court_count?: number; indoor_courts?: number; outdoor_courts?: number;
  surface_type?: string | null; amenities?: string[]; skill_levels?: string[];
  latitude?: number | null; longitude?: number | null;
  photo_url?: string | null;
}

function mapsSearchUrl(lat: number | null | undefined, lng: number | null | undefined, name: string) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
}

function RowCard({
  row, decision, onDecide, readOnly,
}: {
  row: ImportRow;
  decision: Decision | undefined;
  onDecide: (rowId: string, decision: Decision) => void;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const m = row.mapped as RowMapped;
  const name = m.name ?? "(no name)";
  const city = m.city ?? "";
  const state = m.state ?? "";
  const hasPhoto = !!m.photo_url && !photoFailed;

  return (
    <div className="border border-border rounded-xl p-4 bg-card">
      <div className="flex items-start gap-3">
        {/* Photo preview — same proxy URL the app itself will use. A failed
            load (e.g. the facility-photo function or the underlying Google
            token being unavailable) falls back to a plain placeholder rather
            than a broken-image icon, since that failure is independent of
            this import and shouldn't read as "the import is broken". */}
        <div className="w-20 h-20 rounded-lg bg-secondary border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
          {hasPhoto ? (
            // Admin-only preview thumbnail from a controlled proxy — next/image's
            // remote-domain allowlist isn't worth configuring for this one page.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.photo_url!}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground text-center px-1">
              {m.photo_url ? "Photo unavailable" : "No photo"}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{name}</div>
              <div className="text-xs text-muted-foreground">Row {row.row_number} · {[city, state].filter(Boolean).join(", ")}</div>
            </div>
            <span className={`text-[10px] font-mono px-2 py-1 rounded-full border flex-shrink-0 ${MATCH_COLOR[row.match_type]}`}>
              {row.match_type.toUpperCase()}
            </span>
          </div>

          {row.error && <div className="text-xs text-destructive mt-1">{row.error}</div>}
          {row.match_reason && <div className="text-xs text-muted-foreground mt-1">Matched: {row.match_reason}</div>}
          {row.applied && <div className="text-xs text-primary mt-1">Applied ✓</div>}
          {row.apply_error && <div className="text-xs text-destructive mt-1">Apply error: {row.apply_error}</div>}

          <div className="flex items-center gap-3 mt-2">
            <a
              href={mapsSearchUrl(m.latitude, m.longitude, `${name} ${city} ${state}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              View on map ↗
            </a>
            <button onClick={() => setExpanded((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
              {expanded ? "Hide details" : "Show details"}
            </button>
          </div>

          {expanded && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs border-t border-border pt-3">
              <dt className="text-muted-foreground">Address</dt>
              <dd className="truncate">{m.address || "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{m.phone || "—"}</dd>
              <dt className="text-muted-foreground">Website</dt>
              <dd className="truncate">{m.website || "—"}</dd>
              <dt className="text-muted-foreground">Courts</dt>
              <dd>{m.court_count ?? 0} total ({m.indoor_courts ?? 0} indoor / {m.outdoor_courts ?? 0} outdoor)</dd>
              <dt className="text-muted-foreground">Surface</dt>
              <dd>{m.surface_type || "—"}</dd>
              <dt className="text-muted-foreground">Amenities</dt>
              <dd className="truncate">{m.amenities?.length ? m.amenities.join(", ") : "—"}</dd>
              {m.description && (
                <>
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="col-span-1">{m.description}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>

      {row.match_type === "possible" && !readOnly && (
        <div className="flex gap-2 mt-3">
          {([
            ["approve_update", "Update existing"],
            ["create_new", "Create as new"],
            ["skip", "Skip"],
          ] as const).map(([action, label]) => (
            <button
              key={action}
              onClick={() => onDecide(row.id, action)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                decision === action ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
