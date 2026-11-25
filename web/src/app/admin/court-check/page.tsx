"use client";

/**
 * Admin "Court check" (2026-11-25): go through imported venues one by one,
 * open the spot in Google or Apple satellite view, count the courts, and fix
 * the name, address, city or court counts by hand.
 *
 * "Checked" is stored in facilities.last_verified_date. It deliberately does
 * NOT touch facilities.verified, which shows a public "Verified" badge in the
 * mobile app.
 *
 * Writes go straight to facilities under the existing RLS policy
 * "facilities: admin full access" (is_admin()), so the database, not this
 * page, decides who may save. Only the six fields below plus
 * last_verified_date are ever sent. An update that matches no row (not an
 * admin) is reported as an error rather than silently "saved".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getUserId } from "@/lib/dev-user";
import { facilityHref } from "@/lib/courts/places";

type Venue = {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  court_count: number;
  indoor_courts: number;
  outdoor_courts: number;
  last_verified_date: string | null;
};

const COLS = "id,name,slug,address,city,state,latitude,longitude,court_count,indoor_courts,outdoor_courts,last_verified_date";
const PAGE = 1000; // PostgREST returns at most 1,000 rows per request
const FILTERS = [["unchecked", "Not checked"], ["checked", "Checked"], ["all", "All"]] as const;
type Filter = (typeof FILTERS)[number][0];

// Satellite view, zoomed in far enough to count nets. Built from the stored
// numbers only; the name never goes into the URL.
const googleSat = (v: Venue) =>
  `https://www.google.com/maps/@?api=1&map_action=map&center=${v.latitude},${v.longitude}&zoom=20&basemap=satellite`;
const appleSat = (v: Venue) => `https://maps.apple.com/?ll=${v.latitude},${v.longitude}&z=19&t=k`;

export default function CourtCheckPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<Record<string, { all: number; checked: number }>>({});
  const [state, setState] = useState("");
  const [filter, setFilter] = useState<Filter>("unchecked");
  const [query, setQuery] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCounts = useCallback(async () => {
    const all: { state: string; last_verified_date: string | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("facilities").select("state,last_verified_date").order("id").range(from, from + PAGE - 1);
      if (error) { toast.error(error.message); return; }
      all.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    const c: Record<string, { all: number; checked: number }> = {};
    for (const r of all) {
      const s = (c[r.state] ??= { all: 0, checked: 0 });
      s.all++;
      if (r.last_verified_date) s.checked++;
    }
    setCounts(c);
  }, [supabase]);

  const loadVenues = useCallback(async (s: string) => {
    if (!s) return;
    setLoading(true);
    const out: Venue[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from("facilities").select(COLS).eq("state", s)
        .order("city").order("name").range(from, from + PAGE - 1);
      if (error) { setLoading(false); toast.error(error.message); return; }
      out.push(...((data ?? []) as Venue[]));
      if (!data || data.length < PAGE) break;
    }
    setVenues(out);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const userId = await getUserId();
      if (!userId) { router.push("/auth?next=/admin/court-check"); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!profile || profile.role !== "admin") { router.push("/dashboard"); return; }
      setReady(true);
      await loadCounts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((v) =>
      (filter === "all" || (filter === "checked") === !!v.last_verified_date) &&
      (!q || v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q)));
  }, [venues, filter, query]);

  function onSaved(next: Venue) {
    setVenues((cur) => cur.map((v) => (v.id === next.id ? next : v)));
    const was = venues.find((v) => v.id === next.id);
    if (was && !was.last_verified_date && next.last_verified_date) {
      setCounts((c) => ({ ...c, [next.state]: { ...c[next.state], checked: c[next.state].checked + 1 } }));
    }
  }

  if (!ready) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</div>;

  const states = Object.keys(counts).sort();
  const cur = counts[state];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl tracking-wide">Court check</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Open each venue in satellite view, count the courts, fix anything wrong, then mark it checked. Checking does not
        add the public &ldquo;Verified&rdquo; badge.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={state}
          onChange={(e) => { setState(e.target.value); setQuery(""); void loadVenues(e.target.value); }}
          className="h-10 rounded-full border border-border bg-background px-4 text-sm"
        >
          <option value="">Pick a state…</option>
          {states.map((s) => (
            <option key={s} value={s}>{s} · {counts[s].checked}/{counts[s].all} checked</option>
          ))}
        </select>
        {state && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or city"
            className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm"
          />
        )}
      </div>

      {state && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
              {label}
            </button>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">
            {loading ? "Loading…" : `${shown.length} shown${cur ? ` · ${cur.checked} of ${cur.all} checked in ${state}` : ""}`}
          </span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {state && !loading && shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
        {shown.map((v) => <VenueRow key={v.id} venue={v} onSaved={onSaved} />)}
      </div>
    </div>
  );
}

const LIMITS = { name: 120, address: 200, city: 80 };

function VenueRow({ venue, onSaved }: { venue: Venue; onSaved: (v: Venue) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => toForm(venue));
  const set = (k: keyof ReturnType<typeof toForm>) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(): string | null {
    for (const k of ["name", "address", "city"] as const) {
      const t = form[k].trim();
      if (!t) return `${k[0].toUpperCase() + k.slice(1)} can't be empty.`;
      if (t.length > LIMITS[k]) return `${k[0].toUpperCase() + k.slice(1)} is too long (max ${LIMITS[k]}).`;
    }
    const nums = [form.court_count, form.indoor_courts, form.outdoor_courts];
    if (nums.some((n) => !/^\d{1,3}$/.test(n.trim()) || +n > 200)) return "Court counts must be whole numbers from 0 to 200.";
    if (+form.indoor_courts + +form.outdoor_courts !== +form.court_count) return "Indoor + outdoor must equal the total.";
    return null;
  }

  async function save() {
    const problem = validate();
    // The quick "looks right" button lands here too: open the editor so it can be fixed.
    if (problem) { toast.error(problem); setOpen(true); return; }
    setSaving(true);
    const patch = {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      court_count: +form.court_count,
      indoor_courts: +form.indoor_courts,
      outdoor_courts: +form.outdoor_courts,
      last_verified_date: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("facilities").update(patch).eq("id", venue.id).select(COLS);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("Not saved: no permission to edit this venue."); return; }
    const next = data[0] as Venue;
    onSaved(next);
    setForm(toForm(next));
    setOpen(false);
    toast.success(`${next.name} checked.`);
  }

  const summary = `${venue.court_count} court${venue.court_count === 1 ? "" : "s"}` +
    (venue.indoor_courts || venue.outdoor_courts ? ` (${venue.outdoor_courts} outdoor / ${venue.indoor_courts} indoor)` : "");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {venue.slug ? (
              <Link href={facilityHref({ state: venue.state, city: venue.city, slug: venue.slug })} target="_blank" className="hover:underline">
                {venue.name}
              </Link>
            ) : venue.name}
          </div>
          <div className="text-xs text-muted-foreground">{venue.address} · {venue.city}</div>
          <div className="mt-1 text-xs">
            {summary}
            {venue.last_verified_date && (
              <span className="ml-2 text-primary">Checked {new Date(venue.last_verified_date).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={googleSat(venue)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-3 py-1.5 text-xs">Google satellite ↗</a>
          <a href={appleSat(venue)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-3 py-1.5 text-xs">Apple satellite ↗</a>
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full border border-border px-3 py-1.5 text-xs">
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Field label="Name"><input value={form.name} onChange={set("name")} maxLength={LIMITS.name} className={INPUT} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Address"><input value={form.address} onChange={set("address")} maxLength={LIMITS.address} className={INPUT} /></Field>
            <Field label="City"><input value={form.city} onChange={set("city")} maxLength={LIMITS.city} className={INPUT} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total courts"><input value={form.court_count} onChange={set("court_count")} inputMode="numeric" className={INPUT} /></Field>
            <Field label="Outdoor"><input value={form.outdoor_courts} onChange={set("outdoor_courts")} inputMode="numeric" className={INPUT} /></Field>
            <Field label="Indoor"><input value={form.indoor_courts} onChange={set("indoor_courts")} inputMode="numeric" className={INPUT} /></Field>
          </div>
          <button type="button" onClick={save} disabled={saving}
            className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {saving ? "Saving…" : "Save & mark checked"}
          </button>
        </div>
      )}
      {!open && !venue.last_verified_date && (
        <button type="button" onClick={save} disabled={saving} className="mt-3 text-xs text-primary hover:underline disabled:opacity-40">
          {saving ? "Saving…" : "Looks right — mark checked"}
        </button>
      )}
    </div>
  );
}

const INPUT = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function toForm(v: Venue) {
  return {
    name: v.name ?? "",
    address: v.address ?? "",
    city: v.city ?? "",
    court_count: String(v.court_count ?? 0),
    indoor_courts: String(v.indoor_courts ?? 0),
    outdoor_courts: String(v.outdoor_courts ?? 0),
  };
}
