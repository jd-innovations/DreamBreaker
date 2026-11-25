"use client";

// The submission form. For an edit it is prefilled and sends only what the
// player changed; for a new court it first places the map pin (address lookup
// or "I'm at the court"), then shows nearby listed courts so a duplicate is
// caught before it reaches the review queue.

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, MapPin, NavigationArrow } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { FIELD } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";
import { STATE_NAMES, facilityHref } from "@/lib/courts/places";
import type { CourtDetail } from "@/lib/courts/directory";
import { SUBMISSION_FIELDS, callRpc, submissionErrorMessage, type FieldDef } from "@/lib/courts/submissions";

type Values = Record<string, string>;
type Pin = { latitude: number; longitude: number };
type Dupe = { id: string; name: string; address: string | null; city: string | null; distance_meters: number };

const BUTTON = "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:opacity-60";

function initialValues(court: CourtDetail | null): Values {
  const v: Values = {};
  for (const f of SUBMISSION_FIELDS) {
    const raw = court ? (court as unknown as Record<string, unknown>)[f.key] : null;
    v[f.key] = raw === null || raw === undefined ? "" : f.kind === "bool" ? (raw ? "yes" : "no") : String(raw);
  }
  // Imported rows store 0 for "unknown" court counts; show those as blank.
  for (const k of ["court_count", "indoor_courts", "outdoor_courts"]) if (v[k] === "0") v[k] = "";
  return v;
}

/** Form strings -> typed payload. Blank means "not provided" and is left out. */
function toPayload(values: Values, base: Values | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of SUBMISSION_FIELDS) {
    const s = (values[f.key] ?? "").trim();
    if (base && s === (base[f.key] ?? "").trim()) continue; // unchanged edit field
    if (s === "") continue;
    if (f.kind === "int") out[f.key] = Number(s);
    else if (f.kind === "bool") out[f.key] = s === "yes";
    else if (f.kind === "state") out[f.key] = s.toUpperCase();
    else out[f.key] = s;
  }
  return out;
}

export function SuggestForm({ court }: { court: CourtDetail | null }) {
  const supabase = useMemo(() => createClient(), []);
  const base = useMemo(() => (court ? initialValues(court) : null), [court]);
  const [values, setValues] = useState<Values>(() => initialValues(court));
  const [pin, setPin] = useState<Pin | null>(null);
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  const [dupes, setDupes] = useState<Dupe[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "lookup" | "locate" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const isNew = !court;
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  async function afterPin(p: Pin) {
    setPin(p);
    const { data } = await callRpc<Dupe[]>(supabase, "facility_duplicate_candidates", {
      p_name: values.name || "",
      p_latitude: p.latitude,
      p_longitude: p.longitude,
      p_radius_meters: 300,
    });
    setDupes(data ?? []);
  }

  async function lookUp() {
    const q = [values.address, values.city, values.state, values.postal_code].filter((x) => x?.trim()).join(", ");
    if (q.length < 4) { setError("Enter an address or at least a city and state first."); return; }
    setBusy("lookup"); setError(null);
    try {
      const res = await fetch(`/api/courts/geocode?q=${encodeURIComponent(q)}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error === "not_found" ? "We couldn't find that address. Check it, or use “I'm at the court”." :
          j.error === "rate_limited" ? "Too many lookups. Please wait a bit and try again." : "Address lookup failed. Please try again.");
        return;
      }
      // Fill blanks from the lookup; never overwrite what the player typed.
      setValues((cur) => ({
        ...cur,
        address: cur.address || j.address || "",
        city: cur.city || j.city || "",
        state: cur.state || j.state || "",
        postal_code: cur.postal_code || j.postal_code || "",
      }));
      setPinLabel(j.formatted ?? null);
      await afterPin({ latitude: j.latitude, longitude: j.longitude });
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!navigator.geolocation) { setError("Your browser can't share a location."); return; }
    setBusy("locate"); setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPinLabel("Your current location");
        await afterPin({ latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) });
        setBusy(null);
      },
      () => { setBusy(null); setError("Location is off for this site. Use the address lookup instead."); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const proposed = toPayload(values, base);
    if (isNew) {
      if (!pin) { setError("Place the map pin first: look up the address or use “I'm at the court”."); return; }
      Object.assign(proposed, pin);
    }
    setBusy("send");
    const { error: err } = await callRpc<string>(supabase, "submit_facility_submission", {
      p_kind: isNew ? "new" : "edit",
      p_facility_id: court?.id ?? null,
      p_proposed: proposed,
      p_note: note.trim() || null,
    });
    setBusy(null);
    if (err) { setError(submissionErrorMessage(err.message)); return; }
    setSent(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-border p-6 text-center" role="status">
        <CheckCircle size={40} className="mx-auto text-primary" weight="fill" />
        <h2 className="mt-3 text-xl font-semibold">Thanks! We got it.</h2>
        <p className="mt-2 text-muted-foreground">
          Our team will review your submission. We&apos;ll let you know by email and in the app when it&apos;s approved.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href={court ? facilityHref(court) : "/courts"} className={cn(BUTTON, "border border-border hover:bg-secondary")}>
            {court ? "Back to the court" : "Back to courts"}
          </Link>
          {isNew && (
            <button type="button" onClick={() => { setSent(false); setValues(initialValues(null)); setPin(null); setDupes(null); setNote(""); }}
              className={cn(BUTTON, "bg-primary text-primary-foreground hover:bg-primary/90")}>
              Add another
            </button>
          )}
        </div>
      </div>
    );
  }

  const textField = (f: FieldDef) => (
    <label key={f.key} className="block space-y-1.5">
      <span className="text-sm font-medium">{f.label}{isNew && ["name", "city", "state"].includes(f.key) && " *"}</span>
      {f.kind === "longtext" ? (
        <textarea value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} maxLength={f.max} rows={3} className={FIELD} />
      ) : f.kind === "state" ? (
        <select value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} className={cn(FIELD, "h-11")}>
          <option value="">Choose…</option>
          {Object.entries(STATE_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      ) : (
        <input
          value={values[f.key]}
          onChange={(e) => set(f.key, e.target.value)}
          maxLength={f.kind === "zip" ? 10 : f.kind === "phone" ? 30 : f.max}
          inputMode={f.kind === "int" || f.kind === "zip" ? "numeric" : f.kind === "phone" ? "tel" : f.kind === "url" ? "url" : undefined}
          type={f.kind === "int" ? "number" : f.kind === "url" ? "url" : "text"}
          min={f.kind === "int" ? 0 : undefined}
          max={f.kind === "int" ? 100 : undefined}
          placeholder={f.kind === "url" ? "https://" : undefined}
          className={cn(FIELD, "h-11")}
        />
      )}
    </label>
  );

  const fields = SUBMISSION_FIELDS.filter((f) => f.kind !== "bool");
  const flags = SUBMISSION_FIELDS.filter((f) => f.kind === "bool");
  const placeFields = fields.filter((f) => ["name", "address", "city", "state", "postal_code"].includes(f.key));
  const detailFields = fields.filter((f) => !placeFields.includes(f));

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Where is it?</h2>
        {placeFields.map(textField)}

        {isNew && (
          <div className="space-y-3 rounded-2xl border border-border p-4">
            <p className="text-sm font-medium">Map pin *</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={lookUp} disabled={!!busy} className={cn(BUTTON, "border border-border hover:bg-secondary")}>
                <MapPin size={16} /> {busy === "lookup" ? "Looking up…" : "Find this address"}
              </button>
              <button type="button" onClick={locate} disabled={!!busy} className={cn(BUTTON, "border border-border hover:bg-secondary")}>
                <NavigationArrow size={16} /> {busy === "locate" ? "Finding you…" : "I'm at the court"}
              </button>
            </div>
            {pin && (
              <p className="text-sm text-muted-foreground">
                Pin set{pinLabel ? `: ${pinLabel}` : ""}.{" "}
                <a href={`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`}
                  target="_blank" rel="noopener noreferrer" className="underline">Check it on the map</a>
              </p>
            )}
            {dupes && dupes.length > 0 && (
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="text-sm font-semibold">Is it one of these? They&apos;re already listed nearby.</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {dupes.slice(0, 5).map((d) => (
                    <li key={d.id}>
                      <Link href={`/courts/suggest?facility=${d.id}`} className="underline">{d.name}</Link>
                      <span className="text-muted-foreground">
                        {" "}· {[d.address, d.city].filter(Boolean).join(", ")} · {Math.round(d.distance_meters)} m away
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">If yes, open it to suggest an edit instead. If not, carry on below.</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Courts and details</h2>
        <div className="grid gap-4 sm:grid-cols-3">{detailFields.slice(0, 3).map(textField)}</div>
        {detailFields.slice(3).map(textField)}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Amenities and access</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {flags.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="text-sm">{f.label}</span>
              <select value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} className={cn(FIELD, "h-9 w-28")}>
                <option value="">Not sure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Anything else? (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3}
          placeholder={court ? "For example: it closed, it moved, the courts were resurfaced…" : "For example: how you know about it, best entrance…"}
          className={FIELD} />
      </label>

      {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}

      <button type="submit" disabled={!!busy} className={cn(BUTTON, "w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto")}>
        {busy === "send" ? "Sending…" : "Send for review"}
      </button>
    </form>
  );
}
