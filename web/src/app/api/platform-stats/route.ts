import { NextResponse } from "next/server";
import { getPlatformStats } from "@/lib/platform-stats";

// Public read-only counts for client components that advertise them (the auth
// page sidebar). Server components import getPlatformStats directly instead.
//
// Only three integers are returned — no rows, no identifiers. The underlying
// query uses the service-role client for `partner_matches`, which is
// RLS-restricted to its own participants and would otherwise count 0 forever.

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getPlatformStats();

  if (!stats) {
    // The caller renders a dash. Never substitute invented numbers.
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
