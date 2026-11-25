"use client";

/**
 * Court search box with live suggestions (2026-11-25).
 *
 * Still a plain GET form to /courts?q=, so Search / Enter (with nothing
 * highlighted) opens the full results page, it works without JavaScript, and
 * every result page has a URL. On top of that, after 2 characters and a short
 * pause it asks /api/courts/suggest for up to 5 cities + 8 courts and shows them
 * in a dropdown (arrow keys + Enter, or tap).
 *
 * `state` (on a state page) puts that state's results first and adds a
 * "Search all states" row. `onQueryChange` lets a page filter its own list as
 * the visitor types (the state page's city tiles).
 */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { INPUT_TEXT } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";

type CitySuggestion = { city: string; state: string; count: number; href: string };
type CourtSuggestion = { name: string; city: string; state: string; court_count: number | null; href: string };
type Row = { key: string; href: string; title: string; sub: string; kind: "city" | "court" | "all" };

export function CourtSearchForm({
  defaultValue = "", state, stateName, onQueryChange,
}: {
  defaultValue?: string;
  state?: string;
  stateName?: string;
  onQueryChange?: (q: string) => void;
}) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(defaultValue);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: term });
        if (state) params.set("state", state);
        const res = await fetch(`/api/courts/suggest?${params}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { cities: CitySuggestion[]; courts: CourtSuggestion[] };
        const next: Row[] = [
          ...data.cities.map((c) => ({
            key: `c:${c.href}`, href: c.href, kind: "city" as const,
            title: c.city, sub: `${c.state} · ${c.count} place${c.count === 1 ? "" : "s"} to play`,
          })),
          ...data.courts.map((c) => ({
            key: `f:${c.href}`, href: c.href, kind: "court" as const,
            title: c.name, sub: `${c.city}, ${c.state}${c.court_count ? ` · ${c.court_count} court${c.court_count === 1 ? "" : "s"}` : ""}`,
          })),
        ];
        if (state) next.push({ key: "all", kind: "all", href: `/courts?q=${encodeURIComponent(term)}`, title: `Search all states for “${term}”`, sub: "" });
        setRows(next);
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or offline: keep the plain form */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, state]);

  // Close when tapping outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function change(v: string) {
    setQ(v);
    onQueryChange?.(v);
    if (v.trim().length < 2) { setRows([]); setOpen(false); }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || rows.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % rows.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? rows.length - 1 : a - 1)); }
    else if (e.key === "Escape") { setOpen(false); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); setOpen(false); router.push(rows[active].href); }
  }

  const showList = open && q.trim().length >= 2;

  return (
    <form action="/courts" method="get" role="search" className="flex gap-2" onSubmit={() => setOpen(false)}>
      <label htmlFor="courts-q" className="sr-only">City, ZIP or court name</label>
      <div ref={boxRef} className="relative flex-1">
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          id="courts-q"
          name="q"
          type="search"
          value={q}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (rows.length && q.trim().length >= 2) setOpen(true); }}
          maxLength={120}
          autoComplete="off"
          placeholder={stateName ? `City, ZIP or court name in ${stateName}` : "City, ZIP or court name"}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          className={cn(INPUT_TEXT, "h-11 w-full rounded-xl border border-border bg-secondary pl-10 pr-3")}
        />
        {showList && (
          <ul id={listId} role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
            {rows.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">{loading ? "Searching…" : "No matches yet. Press Search to look everywhere."}</li>
            )}
            {rows.map((r, i) => (
              <li key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <a
                  href={r.href}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => { e.preventDefault(); setOpen(false); router.push(r.href); }}
                  className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                    i === active ? "bg-secondary" : "hover:bg-secondary/60",
                    r.kind === "all" && "border-t border-border text-primary")}
                >
                  {r.kind !== "all" && <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" weight={r.kind === "city" ? "regular" : "fill"} />}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.title}</span>
                    {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="submit"
        className="h-11 shrink-0 rounded-xl bg-primary px-5 font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        Search
      </button>
    </form>
  );
}
