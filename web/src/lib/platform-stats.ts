import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Live platform counts, shared by every surface that advertises them.
//
// Extracted from the landing page when the auth page turned out to be showing
// the same fabricated figures ("184 active tournaments", "3,210 partners
// matched", "$1.2M in prizes awarded") against a database of 29 profiles and a
// handful of tournaments — item 6.1 fixed one copy and missed the other.
// Having one implementation means the next surface cannot drift again.
//
// SERVER ONLY. This reaches for the service-role client and must never be
// imported from a client component — same rule as lib/supabase/service.ts.
// Client components read it through /api/platform-stats instead.

export type PlatformStats = {
  activePlayers: number;
  liveTournaments: number;
  partnersMatched: number;
};

export async function getPlatformStats(): Promise<PlatformStats | null> {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const [players, tournaments, matches] = await Promise.all([
      // "Active" = discoverable in the partner finder. Deliberately
      // conservative: it undercounts (a user who opts out of discovery is not
      // counted) and never overcounts.
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_discoverable", true),
      supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "filling_fast", "registration_closed"]),
      // Service-role deliberately: `partner_matches` is RLS-restricted to its
      // own participants, so an anonymous count would return 0 forever no
      // matter how many matches existed. Only an integer leaves this function.
      service.from("partner_matches").select("id", { count: "exact", head: true }),
    ]);

    return {
      activePlayers: players.count ?? 0,
      liveTournaments: tournaments.count ?? 0,
      partnersMatched: matches.count ?? 0,
    };
  } catch {
    // Never invent numbers to cover a failed read — callers render a dash.
    return null;
  }
}
