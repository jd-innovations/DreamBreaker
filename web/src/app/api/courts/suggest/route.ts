import { NextResponse } from "next/server";
import { STATE_NAMES, cityHref, facilityHref, getDirectoryIndex, searchWords, suggestCourts } from "@/lib/courts/directory";

/**
 * Public type-ahead for the court search box: GET /api/courts/suggest?q=..&state=FL
 *
 * - No auth: it reads only the public directory (anon key, same data as the
 *   /courts pages).
 * - q is cut to 120 chars and reduced by searchWords() to at most four plain
 *   words (letters, digits, ' . -), so nothing can add a PostgREST filter.
 *   Under 2 characters returns nothing.
 * - state must be a known two-letter code, else it is ignored.
 * - At most 5 cities + 8 courts. Responses are CDN-cached for 5 minutes so
 *   repeated keystrokes from many visitors hit the cache, not the database.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 120).trim();
  const st = (url.searchParams.get("state") ?? "").toUpperCase();
  const state = STATE_NAMES[st] ? st : null;
  const words = searchWords(q);
  if (q.length < 2 || words.length === 0) {
    return NextResponse.json({ cities: [], courts: [] }, { headers: { "Cache-Control": "public, s-maxage=300" } });
  }

  try {
    const [index, courts] = await Promise.all([getDirectoryIndex(), suggestCourts(q, state, 8)]);
    const needle = q.toLowerCase();
    const cityRows: { city: string; state: string; count: number; href: string }[] = [];
    const states = state ? [state] : Object.keys(index.cities);
    for (const s of states) {
      for (const c of index.cities[s] ?? []) {
        if (c.city.toLowerCase().includes(needle)) cityRows.push({ city: c.city, state: s, count: c.count, href: cityHref(s, c.city) });
      }
    }
    // Prefix matches first, then bigger cities.
    cityRows.sort((a, b) =>
      Number(b.city.toLowerCase().startsWith(needle)) - Number(a.city.toLowerCase().startsWith(needle)) || b.count - a.count);

    return NextResponse.json(
      {
        cities: cityRows.slice(0, 5),
        courts: courts.map((c) => ({ name: c.name, city: c.city, state: c.state, court_count: c.court_count, href: facilityHref(c) })),
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
