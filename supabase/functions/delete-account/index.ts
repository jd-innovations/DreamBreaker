import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Self-service account deletion (TODO1.1_EXECUTION_PLAN.md item 1.3).
//
// Policy: IMMEDIATE deletion with anonymized retention. There is no grace
// period and no request queue — the account is unrecoverable when this returns.
//
//   purge      strictly-private rows with no counterparty and no integrity role
//              (push tokens, precise location, matchmaking intent, saved lists)
//   anonymize  the profiles row in place, stripping every PII column and
//              revoking every privilege, keeping only the id as a tombstone
//   delete     the auth.users row, last — the account itself genuinely ceases
//              to exist and no session, provider identity, or password remains
//
// Everything with financial, tournament-integrity, or moderation value keeps its
// rows and its foreign keys: payments, transactions, registrations, brackets,
// reservations, coach purchases, wallet vouchers, messages, support tickets, and
// abuse reports filed BY or ABOUT this user. They resolve to "Deleted User"
// instead of disappearing, so reconciliation, bracket history, and trust/safety
// records survive the deletion of the person's identity.
//
// The auth deletion is only possible because 20260817000000_account_deletion.sql
// dropped profiles_id_fkey — see that migration for why, and for the full list of
// constraints that made a naive DELETE FROM auth.users impossible.
//
// The user id is taken from the verified JWT and NEVER from the request body.
// There is no parameter by which a caller can name a different account.

const CORS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

/**
 * Strictly-private rows: data the user generated about themselves, with no
 * counterparty who retains an interest in it and no role in any financial,
 * bracket, or moderation record. These are hard-deleted.
 *
 * Deliberately NOT listed: partner_likes.to_user_id, matchmaking_swipes.target_id,
 * user_reports.reported_id, group_post_reports.reported_user_id — those rows are
 * OTHER people's actions and reports. Deleting them would let an account deletion
 * erase the abuse history filed against the person deleting it.
 */
const PRIVATE_ROWS: ReadonlyArray<{ table: string; column: string }> = [
  { table: "push_tokens", column: "user_id" },
  { table: "location_settings", column: "user_id" },
  { table: "partner_preferences", column: "user_id" },
  { table: "partner_likes", column: "from_user_id" },
  { table: "matchmaking_swipes", column: "requester_id" },
  { table: "profile_hidden_matches", column: "player_id" },
  { table: "story_views", column: "user_id" },
  { table: "tournament_bookmarks", column: "player_id" },
  { table: "saved_play_events", column: "player_id" },
  { table: "notifications", column: "user_id" },
  { table: "conversation_participant_settings", column: "user_id" },
];

/**
 * Tournament statuses that mean other people are depending on this director.
 * `draft` is excluded: nobody can see or register for a draft, so it blocks
 * nothing. `completed` and `cancelled` are terminal and safe to leave behind.
 */
const LIVE_TOURNAMENT_STATUSES = [
  "pending_approval",
  "approved",
  "published",
  "open",
  "filling_fast",
  "registration_closed",
  "in_progress",
];

async function purgePrivateRows(service: SupabaseClient, userId: string): Promise<void> {
  for (const { table, column } of PRIVATE_ROWS) {
    const { error } = await service.from(table).delete().eq(column, userId);
    // Fail loudly. A partial purge that reports success is exactly the "fake
    // deletion" this flow exists to avoid — better to 500 and let the user retry
    // than to sign them out of an account that still holds their push tokens.
    if (error) throw new Error(`purge ${table}.${column} failed: ${error.message}`);
  }
}

/**
 * Strips the profiles row down to a tombstone: no name, no email, no photo, no
 * location, no rating, no Stripe linkage, no bio, no demographics — and no
 * director/coach/admin authority. `id` and `created_at` are all that survive,
 * because the foreign keys listed in the migration require a valid target.
 */
async function anonymizeProfile(service: SupabaseClient, userId: string): Promise<void> {
  const { error } = await service
    .from("profiles")
    .update({
      full_name: "Deleted User",
      // profiles.email is NOT NULL. `.invalid` is the RFC 2606 reserved TLD, so
      // this address can never resolve or be delivered to.
      email: `deleted+${userId}@deleted.invalid`,
      handle: null,
      avatar_url: null,
      cover_url: null,
      bio: null,
      paddle: null,
      hand: null,
      play_style: null,
      availability: null,
      availability_schedule: {},
      date_of_birth: null,
      gender: null,
      onboarding_intent: null,
      location_city: null,
      location_state: null,
      location_coords: null,
      location_lat: null,
      location_lng: null,
      home_court_id: null,
      dupr: null,
      dupr_verified: false,
      self_rating: null,
      skill_level: null,
      // Stripe keeps its own authoritative customer/account records; payments
      // reconcile through payments.provider_payment_intent_id, not through these.
      // Nulling them removes the local identity linkage without breaking books.
      stripe_customer_id: null,
      stripe_connect_account_id: null,
      stripe_connect_onboarded_at: null,
      // Revoke every privilege. Defence in depth: the auth user is deleted moments
      // from now, so no session can exist, but nothing keyed on profiles.role
      // should ever treat a tombstone as an admin, director, or coach.
      role: "player",
      is_director: false,
      director_status: null,
      director_rating: null,
      is_coach: false,
      coach_status: "inactive",
      coach_commission_override_pct: null,
      // Keep the tombstone out of search, discovery, matchmaking, and invites.
      is_discoverable: false,
      looking_status: "not_looking",
      notif_new_match: false,
      notif_liked_you: false,
      notif_hold_expiry: false,
      notif_tournaments: false,
      deleted_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw new Error(`profile anonymization failed: ${error.message}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Identity comes from the JWT alone. An unauthenticated caller gets 401 here,
  // and an authenticated caller can only ever reach their own `user.id`.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  const userId = user.id;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Precondition. A director who walks away from a live tournament strands every
  // player who registered and paid for it, and no anonymization can undo that.
  // Deletion is refused with an explicit reason rather than silently orphaning
  // other users' events.
  const { data: liveTournaments, error: tournamentError } = await service
    .from("tournaments")
    .select("id")
    .eq("director_id", userId)
    .in("status", LIVE_TOURNAMENT_STATUSES)
    .limit(1);

  if (tournamentError) {
    console.error("[delete-account] director check failed", tournamentError.message);
    return json({ error: "internal_error" }, 500);
  }
  if (liveTournaments && liveTournaments.length > 0) {
    return json({ error: "active_tournaments" }, 409);
  }

  try {
    await purgePrivateRows(service, userId);
    await anonymizeProfile(service, userId);
  } catch (err) {
    // Nothing has been signed out and the auth user is untouched, so the client
    // can safely retry. Log server-side only — the message may name internal
    // tables and belongs nowhere near a client response.
    console.error("[delete-account] purge/anonymize failed", err instanceof Error ? err.message : err);
    return json({ error: "internal_error" }, 500);
  }

  // Last, per policy: this is the irreversible step. Cascades within the auth
  // schema (identities, sessions, refresh tokens, MFA factors, one-time tokens)
  // are all ON DELETE CASCADE, so every credential and provider link goes with
  // it. After the migration dropped profiles_id_fkey, nothing in `public` can
  // block this.
  const { error: deleteError } = await service.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[delete-account] auth user deletion failed", deleteError.message);
    return json({ error: "internal_error" }, 500);
  }

  return json({ ok: true }, 200);
});
