// Web user directory (/players) — the web half of the app's directory,
// owner-approved 2026-09-22. Mirrors apps/mobile/src/lib/supabase/playerDirectory.ts
// and lib/supabase/savedPlayers.ts so the two behave the same.
//
// Four relationship concepts exist and are NOT interchangeable
// (project memory "user directory build"):
//   Connection  partner_matches — mutual
//   Contact     partner_likes kind='save' — one-sided, private
//   Request     pending like — stays in /matchmaking on web
//   Directory   anyone discoverable, via search_players()
//
// Location: never precise. Rows show city/state only; the map places players at
// their home court or city (directory_map_pins, 20260922170000).

import { createClient } from "@/lib/supabase/client";

export const MIN_DIRECTORY_QUERY = 2;
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Pure helpers (tested) ──────────────────────────────────────────────────

export type PlayerRating = { value: number; source: "dupr" | "self" | "none" };

/** DUPR first, then the self-rating, else unrated — the app's resolvePlayerRating. */
export function resolvePlayerRating(dupr: number | null | undefined, selfRating: string | number | null | undefined): PlayerRating {
  if (dupr != null && Number.isFinite(Number(dupr))) return { value: Number(dupr), source: "dupr" };
  const n = typeof selfRating === "number" ? selfRating : selfRating ? Number.parseFloat(selfRating) : NaN;
  if (Number.isFinite(n)) return { value: n, source: "self" };
  return { value: 0, source: "none" };
}

/** "3.7 DUPR" | "3.7 Self" | "Unrated" — the app's formatPlayerRating. */
export function formatPlayerRating({ value, source }: PlayerRating): string {
  if (source === "none") return "Unrated";
  return `${value.toFixed(1)} ${source === "dupr" ? "DUPR" : "Self"}`;
}

/** "3 mutual connections" / "1 mutual connection" / null. */
export function mutualLabel(count: number): string | null {
  if (count <= 0) return null;
  return `${count} mutual connection${count === 1 ? "" : "s"}`;
}

export type DirectoryPlayer = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  rating: PlayerRating;
  location: string | null;
  isConnected: boolean;
  mutualCount: number;
  /** Connections/Contacts only: when the relationship started. */
  since?: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  handle?: string | null;
  avatar_url: string | null;
  dupr: number | null;
  self_rating: string | null;
  location_city: string | null;
  location_state: string | null;
  is_connected?: boolean | null;
  mutual_count?: number | null;
};

export function toPlayer(r: ProfileRow, extra: Partial<DirectoryPlayer> = {}): DirectoryPlayer {
  return {
    id: r.id,
    // A profile with no name still appears — it is a real account — but labelled, not blank.
    name: r.full_name?.trim() || "Unnamed player",
    handle: r.handle ?? null,
    avatarUrl: r.avatar_url,
    rating: resolvePlayerRating(r.dupr, r.self_rating),
    location: [r.location_city, r.location_state].filter(Boolean).join(", ") || null,
    isConnected: r.is_connected === true,
    mutualCount: r.mutual_count ?? 0,
    ...extra,
  };
}

// ─── Data ───────────────────────────────────────────────────────────────────

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
const FAIL = "Couldn't load players. Check your connection and try again.";

// Never location_lat/lng: city and state are all a row needs.
const PROFILE_COLUMNS = "id, full_name, handle, avatar_url, dupr, self_rating, location_city, location_state";

export async function searchDirectory(query: string): Promise<Result<DirectoryPlayer[]>> {
  const term = query.trim();
  if (term.length < MIN_DIRECTORY_QUERY) return { ok: true, data: [] };
  const { data, error } = await createClient().rpc("search_players", { p_query: term, p_limit: 25 });
  if (error) return { ok: false, message: FAIL };
  return { ok: true, data: (data ?? []).map((r) => toPlayer(r)) };
}

export async function fetchConnections(userId: string): Promise<Result<DirectoryPlayer[]>> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("partner_matches")
    .select("user_a, user_b, matched_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("matched_at", { ascending: false });
  if (error) return { ok: false, message: FAIL };
  const since = new Map((rows ?? []).map((m) => [m.user_a === userId ? m.user_b : m.user_a, m.matched_at]));
  const ids = [...since.keys()];
  if (ids.length === 0) return { ok: true, data: [] };
  const { data: profs, error: pErr } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
  if (pErr) return { ok: false, message: FAIL };
  return {
    ok: true,
    data: (profs ?? [])
      .map((p) => toPlayer(p as ProfileRow, { isConnected: true, since: since.get(p.id) ?? undefined }))
      .sort((a, b) => (b.since ?? "").localeCompare(a.since ?? "")),
  };
}

export async function fetchContacts(userId: string): Promise<Result<DirectoryPlayer[]>> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from("partner_likes")
    .select("to_user_id, created_at")
    .eq("from_user_id", userId)
    .eq("kind", "save")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, message: FAIL };
  const since = new Map((rows ?? []).map((r) => [r.to_user_id, r.created_at]));
  const ids = [...since.keys()];
  if (ids.length === 0) return { ok: true, data: [] };
  const { data: profs, error: pErr } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids);
  if (pErr) return { ok: false, message: FAIL };
  return {
    ok: true,
    data: (profs ?? [])
      .map((p) => toPlayer(p as ProfileRow, { since: since.get(p.id) ?? undefined }))
      .sort((a, b) => (b.since ?? "").localeCompare(a.since ?? "")),
  };
}

export async function removeContact(userId: string, playerId: string): Promise<Result<null>> {
  const { error } = await createClient()
    .from("partner_likes")
    .delete()
    .eq("from_user_id", userId)
    .eq("to_user_id", playerId)
    .eq("kind", "save");
  return error ? { ok: false, message: "That didn't save. Try again." } : { ok: true, data: null };
}

export type MapPin = {
  kind: "court" | "city";
  key: string;
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
  playerCount: number;
};

export async function fetchMapPins(lat: number, lng: number, radiusMeters: number): Promise<Result<MapPin[]>> {
  const { data, error } = await createClient().rpc("directory_map_pins", {
    p_lat: lat, p_lng: lng, p_radius_meters: radiusMeters,
  });
  if (error) return { ok: false, message: FAIL };
  return {
    ok: true,
    data: (data ?? []).map((p) => ({
      kind: p.kind === "city" ? "city" : "court",
      key: p.key,
      label: p.label,
      sublabel: p.sublabel,
      lat: p.lat,
      lng: p.lng,
      playerCount: p.player_count,
    })),
  };
}

export async function fetchPinPlayers(pin: Pick<MapPin, "kind" | "key">): Promise<Result<DirectoryPlayer[]>> {
  const { data, error } = await createClient().rpc("directory_map_players", { p_kind: pin.kind, p_key: pin.key });
  if (error) return { ok: false, message: FAIL };
  return { ok: true, data: (data ?? []).map((r) => toPlayer(r)) };
}
