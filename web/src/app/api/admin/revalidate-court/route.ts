import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { STATE_NAMES, cityHref, facilityHref, stateHref } from "@/lib/courts/places";

/**
 * Admin-only: refresh the cached public pages for one facility right after an
 * admin edit (Court check) or an approved player submission. Court pages are
 * ISR-cached for an hour, so without this an edit looks "not saved".
 *
 * POST { facilityId: uuid, previous?: { state, city } }
 *  - Caller must be signed in with profiles.role = 'admin' (same check as the
 *    other /api/admin routes); anyone else gets 403.
 *  - The facility's paths are built from the DATABASE row, never from the
 *    request. `previous` (the city before an edit, so the old city page drops
 *    the venue too) is only used after it is validated against STATE_NAMES and
 *    a short plain-text city.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CITY = /^[\p{L}\p{N} .'-]{1,80}$/u;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { facilityId?: unknown; previous?: { state?: unknown; city?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const id = typeof body.facilityId === "string" ? body.facilityId : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "bad_facility_id" }, { status: 400 });

  const { data: f, error } = await supabase.from("facilities").select("slug, state, city").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  if (!f?.slug || !f.state || !f.city) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const slug = f.slug;
  const paths = new Set<string>([facilityHref({ state: f.state, city: f.city, slug }), cityHref(f.state, f.city), stateHref(f.state)]);
  const ps = body.previous?.state, pc = body.previous?.city;
  if (typeof ps === "string" && typeof pc === "string" && STATE_NAMES[ps] && CITY.test(pc)) {
    paths.add(cityHref(ps, pc));
    paths.add(facilityHref({ state: ps, city: pc, slug }));
  }
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: [...paths] });
}
