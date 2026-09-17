"use client";

// Instructor search for Clinic creation. Mirrors mobile's create-clinic.tsx
// instructor picker (apps/mobile/src/app/create-clinic.tsx), which searches
// `profiles` by full_name — there's no "is_instructor" role/flag anywhere in
// the schema, any player can be tagged as the instructor. Defaults to the
// organizer (same default mobile's createCommunityEvent applies server-side
// for clinics when no instructor is explicitly chosen), with an option to
// reassign to someone else.

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

export type PickedInstructor = { id: string; full_name: string | null };

const inputCls = "w-full h-11 rounded-xl bg-secondary border border-border px-3.5 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

async function searchInstructors(query: string, excludeId: string | null): Promise<PickedInstructor[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const supabase = createClient();
  let q = supabase.from("profiles").select("id, full_name").ilike("full_name", `%${trimmed}%`).limit(8);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return data ?? [];
}

export function InstructorPicker({ organizerId, organizerName }: { organizerId: string; organizerName: string | null }) {
  const [selected, setSelected] = useState<PickedInstructor>({ id: organizerId, full_name: organizerName });
  const [reassigning, setReassigning] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedInstructor[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!reassigning) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Dropdown only renders once the query is 2+ chars — see render below —
    // so skip scheduling a search without needing to clear state here.
    if (query.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setResults(await searchInstructors(query, organizerId));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, reassigning, organizerId]);

  return (
    <div>
      <label className="font-mono text-[10px] tracking-widest text-muted-foreground block mb-1.5">INSTRUCTOR</label>
      <input type="hidden" name="instructor_id" value={selected.id} />
      {!reassigning ? (
        <div className="flex items-center gap-2.5 rounded-xl bg-secondary border border-border px-3.5 h-11">
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{selected.full_name ?? "You"}{selected.id === organizerId ? " (you)" : ""}</p>
          </div>
          <button type="button" onClick={() => setReassigning(true)} className="text-xs text-primary hover:underline flex-shrink-0">
            Reassign
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <MagnifyingGlass size={15} weight="bold" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players by name…"
              className={`${inputCls} pl-10 pr-10`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => { setReassigning(false); setQuery(""); setResults([]); }}
              aria-label="Cancel reassign"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={15} weight="bold" />
            </button>
          </div>
          {query.trim().length >= 2 && (
            <div className="mt-1.5 rounded-xl border border-border bg-card overflow-hidden max-h-56 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-3.5 py-3 text-sm text-muted-foreground">No players found.</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelected(p); setReassigning(false); setQuery(""); setResults([]); }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-secondary transition-colors border-b border-border last:border-b-0 text-sm"
                  >
                    {p.full_name ?? "Unnamed player"}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
