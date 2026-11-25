"use client";

/**
 * "Discover" tab: find pickleball venues from OpenStreetMap courts, fill in
 * details from Google Places, then hand the rows to the normal dry run
 * (admin_stage_facility_import) so they go through the same review + commit
 * as an uploaded CSV. Nothing here writes to the directory.
 *
 * Step 1 (free) runs OSM tile by tile; step 2 (Google) runs in batches of 10
 * sites so no request outlives a serverless function. Both can be stopped.
 * The same engine powers scripts/facilities-osm/discover.mjs.
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { toCsv, type BBox, type DiscoveryRow, type Site } from "@/lib/facilityDiscovery/engine";

const BATCH = 10;
const STATES = ["FL", "TX", "GA", "AZ", "NC", "SC", "CA"];

const ERRORS: Record<string, string> = {
  google_not_configured: "The Google key isn't set up on the server yet (GOOGLE_PLACES_API_KEY in Vercel).",
  place_not_found: "Couldn't find that place. Try “City, ST”.",
  geocode_failed: "Google couldn't look up that place right now.",
  area_not_found: "Couldn't work out that area.",
  osm_busy: "OpenStreetMap is busy. Wait a minute and try again.",
  google_quota: "Google's limit was reached. Try again later; finished work is kept.",
  google_failed: "Google returned an error. Try again.",
  not_found: "Admins only.",
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin/facility-discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((json as { error?: string }).error ?? "discover_failed"), { status: res.status });
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function DiscoverPanel({ onStage }: { onStage: (csv: string, filename: string) => Promise<void> }) {
  const [mode, setMode] = useState<"city" | "state">("city");
  const [query, setQuery] = useState("");
  const [state, setState] = useState("FL");
  const [label, setLabel] = useState("");

  const [phase, setPhase] = useState<"idle" | "osm" | "found" | "details" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [courts, setCourts] = useState(0);
  const [alreadyListed, setAlreadyListed] = useState(0);
  const [sites, setSites] = useState<Site[]>([]);
  const [includeUnmatched, setIncludeUnmatched] = useState(false);

  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [unmatchedRows, setUnmatchedRows] = useState<DiscoveryRow[]>([]);
  const [unmatchedCount, setUnmatchedCount] = useState(0);
  const [googleRequests, setGoogleRequests] = useState(0);
  const [staging, setStaging] = useState(false);
  const stopRef = useRef(false);

  function fail(err: unknown) {
    const code = err instanceof Error ? err.message : "discover_failed";
    toast.error(ERRORS[code] ?? "Something went wrong. Try again.");
  }

  function reset() {
    stopRef.current = true;
    setPhase("idle");
    setSites([]); setRows([]); setUnmatchedRows([]); setUnmatchedCount(0);
    setCourts(0); setAlreadyListed(0); setGoogleRequests(0);
    setProgress({ done: 0, total: 0 });
  }

  async function findCourts() {
    reset();
    stopRef.current = false;
    setPhase("osm");
    try {
      const area = await call<{ bbox: BBox; label: string; tiles: BBox[] }>(
        mode === "state" ? { action: "resolve", state } : { action: "resolve", query },
      );
      setLabel(area.label);
      setProgress({ done: 0, total: area.tiles.length });
      const found: Site[] = [];
      let courtCount = 0;
      let listed = 0;
      for (const [i, tile] of area.tiles.entries()) {
        if (stopRef.current) break;
        let attempt = 0;
        for (;;) {
          try {
            const r = await call<{ courts: number; sites: Site[]; alreadyListed: number }>({ action: "osm", bbox: tile });
            courtCount += r.courts; listed += r.alreadyListed; found.push(...r.sites);
            break;
          } catch (err) {
            // 503 = osm_busy; 504 = the platform timed the request out. Both are worth a retry.
            const status = (err as { status?: number }).status;
            if ((status === 503 || status === 504) && attempt < 4) { attempt += 1; await sleep(8000 * attempt); continue; }
            throw err;
          }
        }
        setProgress({ done: i + 1, total: area.tiles.length });
        setCourts(courtCount); setAlreadyListed(listed); setSites([...found]);
      }
      setPhase("found");
    } catch (err) {
      fail(err);
      setPhase("idle");
    }
  }

  async function getDetails() {
    stopRef.current = false;
    setPhase("details");
    const all = [...rows];
    const allUnmatched = [...unmatchedRows];
    let unmatched = unmatchedCount;
    let requests = googleRequests;
    const remaining = sites;
    setProgress({ done: 0, total: remaining.length });
    try {
      for (let i = 0; i < remaining.length; i += BATCH) {
        if (stopRef.current) break;
        const batch = remaining.slice(i, i + BATCH);
        const r = await call<{ rows: DiscoveryRow[]; unmatchedRows: DiscoveryRow[]; unmatchedCount: number; googleRequests: number }>({
          action: "details", sites: batch, includeUnmatched,
        });
        all.push(...r.rows); allUnmatched.push(...r.unmatchedRows);
        unmatched += r.unmatchedCount; requests += r.googleRequests;
        setRows([...all]); setUnmatchedRows([...allUnmatched]); setUnmatchedCount(unmatched); setGoogleRequests(requests);
        setSites(remaining.slice(i + BATCH));
        setProgress({ done: Math.min(i + BATCH, remaining.length), total: remaining.length });
      }
    } catch (err) {
      fail(err);
    }
    setPhase("done");
  }

  function finalRows(): DiscoveryRow[] {
    // One venue can appear twice when its courts fell into two clusters/tiles.
    const seen = new Set<string>();
    const out: DiscoveryRow[] = [];
    for (const r of [...rows, ...(includeUnmatched ? unmatchedRows : [])]) {
      const id = String(r.google_place_id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(r);
    }
    return out;
  }

  const fileName = () => `discover-${(label || "area").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;

  async function sendToReview() {
    const r = finalRows();
    if (!r.length) { toast.error("Nothing to review yet."); return; }
    setStaging(true);
    try { await onStage(toCsv(r), fileName()); } finally { setStaging(false); }
  }

  function download() {
    const blob = new Blob([toCsv(finalRows())], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const busy = phase === "osm" || phase === "details";
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const withPhotos = rows.filter((r) => r.photos).length;

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-2xl p-6 bg-card">
        <p className="text-sm text-muted-foreground mb-4">
          Finds venues where OpenStreetMap shows pickleball courts, skips ones already in the directory, and fills in names,
          addresses and photos from Google. Results go to the normal dry run for review. Nothing is written until you commit.
        </p>

        <div className="flex gap-2 mb-3">
          {(["city", "state"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={busy}
              className={`px-3 py-1.5 rounded-full text-xs border ${mode === m ? "border-primary text-foreground bg-primary/10" : "border-border text-muted-foreground"}`}
            >
              {m === "city" ? "City or area" : "Whole state"}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {mode === "city" ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Bradenton, FL"
              maxLength={120}
              disabled={busy}
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm"
            />
          ) : (
            <select value={state} onChange={(e) => setState(e.target.value)} disabled={busy} className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm">
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button
            onClick={findCourts}
            disabled={busy || (mode === "city" && query.trim().length < 2)}
            className="h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-wider disabled:opacity-40"
          >
            Find courts
          </button>
        </div>
        {mode === "state" && (
          <p className="text-xs text-amber-400 mt-2">A whole state takes a while and this tab has to stay open. Stopping keeps what&apos;s finished.</p>
        )}
      </div>

      {phase !== "idle" && (
        <div className="border border-border rounded-2xl p-6 bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg">{label || "Searching…"}</div>
            {busy ? (
              <button onClick={() => { stopRef.current = true; }} className="text-sm text-muted-foreground hover:text-foreground">Stop</button>
            ) : (
              <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">Start over</button>
            )}
          </div>

          {busy && (
            <div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {phase === "osm" ? `Map areas ${progress.done}/${progress.total}` : `Sites ${progress.done}/${progress.total}`}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat n={courts} label="Courts in OpenStreetMap" />
            <Stat n={alreadyListed} label="Sites already listed" />
            <Stat n={sites.length + rows.length + unmatchedCount} label="New sites" />
            <Stat n={rows.length} label={`Matched to Google${rows.length ? ` · ${withPhotos} with photos` : ""}`} />
          </div>

          {phase === "found" && (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={includeUnmatched} onChange={(e) => setIncludeUnmatched(e.target.checked)} className="mt-1" />
                <span>
                  Include courts with no Google listing (usually inside a residential community). They get a street-only address
                  and no photo.
                </span>
              </label>
              <button
                onClick={getDetails}
                disabled={sites.length === 0}
                className="h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-wider disabled:opacity-40"
              >
                Get details from Google
              </button>
              <p className="text-xs text-muted-foreground">
                About {sites.length * (includeUnmatched ? 2 : 1)}–{sites.length * 2} Google requests for {sites.length} site{sites.length === 1 ? "" : "s"}.
              </p>
            </div>
          )}

          {phase === "done" && (
            <div className="space-y-3">
              <p className="text-sm">
                {rows.length} venue{rows.length === 1 ? "" : "s"} ready
                {includeUnmatched && unmatchedRows.length ? ` + ${unmatchedRows.length} community court site${unmatchedRows.length === 1 ? "" : "s"}` : ""}
                {!includeUnmatched && unmatchedCount ? ` · ${unmatchedCount} without a Google listing left out` : ""}
                {sites.length ? ` · ${sites.length} not looked up yet` : ""} · {googleRequests} Google requests used.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={sendToReview}
                  disabled={staging || finalRows().length === 0}
                  className="h-11 px-6 rounded-full bg-primary text-primary-foreground text-sm font-display tracking-wider disabled:opacity-40"
                >
                  {staging ? "Running dry run…" : "Send to review"}
                </button>
                {sites.length > 0 && (
                  <button onClick={getDetails} className="h-11 px-6 rounded-full border border-border text-sm">Continue lookups</button>
                )}
                <button onClick={download} disabled={finalRows().length === 0} className="h-11 px-6 rounded-full border border-border text-sm disabled:opacity-40">
                  Download CSV
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">Court data © OpenStreetMap contributors.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <div className="text-2xl font-display">{n}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}
