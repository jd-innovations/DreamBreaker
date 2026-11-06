import type { MetadataRoute } from "next";
import { ogClient } from "@/lib/og/client";
import { APP_ORIGIN, WEB_PAGE_PATH } from "@/lib/og/types";

// Rebuilt at most hourly. New events reach Google through this file, so a
// stale hour is fine; a request per crawl would not be.
export const revalidate = 3600;

// Read with the anon client, so RLS decides what is listed exactly as it
// decides what a signed-out visitor can open: drafts, cancelled events and
// private groups never appear.
//
// Deliberately left out:
// - Marketplace listings: short-lived and user-written; they sell or expire
//   faster than a crawler revisits.
// - Facilities: the web page is still an "open in the app" stub, and hundreds
//   of near-empty pages would count against the site. Add them once the page
//   shows the courts, address and hours.
// - Player profiles: private by design (robots.ts blocks /profile).

const STATIC_PAGES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/tournaments", priority: 0.9, changeFrequency: "daily" },
  { path: "/play", priority: 0.9, changeFrequency: "daily" },
  { path: "/lessons", priority: 0.8, changeFrequency: "weekly" },
  { path: "/marketplace", priority: 0.6, changeFrequency: "daily" },
  { path: "/groups", priority: 0.5, changeFrequency: "weekly" },
  { path: "/help", priority: 0.3, changeFrequency: "monthly" },
  { path: "/legal/privacy", priority: 0.1, changeFrequency: "monthly" },
  { path: "/legal/terms", priority: 0.1, changeFrequency: "monthly" },
];

const LIVE_GAME_STATUSES = ["open", "full", "in_progress"] as const;

function url(path: string): string {
  return `${APP_ORIGIN}${path}`;
}

/** Yesterday as YYYY-MM-DD, so a game later today in any US zone still counts as upcoming. */
function yesterday(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = ogClient();

  // Each section fails on its own: a broken query drops that section rather
  // than serving an error page where the whole sitemap should be.
  const [tournaments, games, lessons, groups] = await Promise.all([
    db.from("tournaments").select("id, updated_at").neq("status", "cancelled").limit(5000),
    db.from("play_events").select("id, updated_at")
      .in("status", [...LIVE_GAME_STATUSES]).gte("event_date", yesterday()).limit(5000),
    // The same search /lessons runs, so test coaches stay out as they do there.
    db.rpc("browse_coach_offers", { p_limit: 1000 }),
    db.from("groups").select("id, updated_at").eq("privacy", "public").limit(5000),
  ]);

  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: url(p.path),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  for (const t of tournaments.data ?? []) {
    entries.push({ url: url(WEB_PAGE_PATH.tournament(t.id)), lastModified: t.updated_at, priority: 0.8 });
  }
  for (const g of games.data ?? []) {
    entries.push({ url: url(WEB_PAGE_PATH.community(g.id)), lastModified: g.updated_at, priority: 0.6 });
  }
  const coachIds = new Set<string>();
  for (const o of lessons.data ?? []) {
    entries.push({ url: url(WEB_PAGE_PATH.coach_offer(o.id)), priority: 0.6 });
    if (o.coach_id) coachIds.add(o.coach_id);
  }
  for (const id of coachIds) {
    entries.push({ url: url(WEB_PAGE_PATH.coach(id)), priority: 0.5 });
  }
  for (const g of groups.data ?? []) {
    entries.push({ url: url(WEB_PAGE_PATH.group(g.id)), lastModified: g.updated_at, priority: 0.4 });
  }

  return entries;
}
