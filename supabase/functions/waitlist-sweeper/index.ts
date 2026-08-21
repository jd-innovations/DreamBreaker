import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://pickleballapp.app";

// ── Email — routed through the shared send-transactional-email function ───────
// Previously this had its own local sendEmail() hitting Resend directly under
// the wrong brand ("Compete Pickleball" / competepickleball.com) and a
// notify() helper that referenced notifications.data / notifications.email_sent_at,
// neither of which exist on the notifications table — those writes were
// silently failing. Fixed by consolidating onto the one shared sender
// (correct brand/domain lives there) and dropping the two nonexistent columns.

async function sendTemplateEmail(
  to: string,
  templateKey: string,
  variables: Record<string, string>,
  idempotencyKey: string,
): Promise<void> {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    console.error("[waitlist-sweeper] SUPABASE_ANON_KEY not available, skipping email");
    return;
  }
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ to, templateKey, variables, idempotencyKey }),
  });
  if (!res.ok) {
    console.error(`[waitlist-sweeper email failed] ${res.status} ${await res.text()}`);
  }
}

// ── Notification helper — inserts into DB and optionally sends email ───────────

async function notify(opts: {
  userId: string;
  email: string | null;
  type: string;
  title: string;
  body: string;
  link?: string;
  templateKey?: string;
  variables?: Record<string, string>;
  idempotencyKey?: string;
}) {
  const { error } = await supabase.from("notifications").insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
  });
  if (error) console.error(`[notify insert error] ${error.message}`);

  if (opts.email && opts.templateKey && opts.idempotencyKey) {
    await sendTemplateEmail(opts.email, opts.templateKey, opts.variables ?? {}, opts.idempotencyKey);
  }
}

// ── Promote the next waitlisted player for a tournament ───────────────────────

async function promoteNextWaitlisted(tournamentId: string) {
  const { data: next } = await supabase
    .from("registrations")
    .select("id, player_id, waitlist_position, profiles!player_id(full_name, email)")
    .eq("tournament_id", tournamentId)
    .eq("status", "waitlisted")
    .order("waitlist_position", { ascending: true })
    .limit(1)
    .single();

  if (!next) return;

  const offerExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("registrations")
    .update({ status: "waitlist_offered", waitlist_offer_expires_at: offerExpiry })
    .eq("id", next.id);

  const profile = next.profiles as { full_name: string; email: string } | null;
  const tournamentName = await getTournamentName(tournamentId);

  await notify({
    userId: next.player_id,
    email: profile?.email ?? null,
    type: "waitlist_spot_offered",
    title: "A spot just opened up!",
    body: `You have 24 hours to complete payment for ${tournamentName}. Don't miss it.`,
    link: `/tournaments/${tournamentId}`,
    templateKey: "waitlist_spot_offered",
    variables: {
      full_name: profile?.full_name ?? "there",
      tournament_name: tournamentName,
      link_url: `${APP_URL}/tournaments/${tournamentId}`,
    },
    idempotencyKey: `waitlist-spot-offered/${next.id}/${offerExpiry}`,
  });
}

async function getTournamentName(tournamentId: string): Promise<string> {
  const { data } = await supabase
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .single();
  return (data as { name: string } | null)?.name ?? "the tournament";
}

// ── Sweep 1: Expire holds past the hold_cutoff_days window ───────────────────

async function sweepExpiredHolds() {
  // Find tournaments where today >= event_date - hold_cutoff_days
  const { data: expiredHolds } = await supabase
    .from("registrations")
    .select(`
      id, player_id, tournament_id,
      profiles!player_id(full_name, email),
      tournaments!tournament_id(name, event_date, hold_cutoff_days)
    `)
    .eq("status", "held");

  if (!expiredHolds?.length) return;

  const now = Date.now();
  for (const reg of expiredHolds) {
    const t = reg.tournaments as { name: string; event_date: string; hold_cutoff_days: number } | null;
    if (!t) continue;

    const cutoff = new Date(t.event_date);
    cutoff.setDate(cutoff.getDate() - (t.hold_cutoff_days ?? 7));

    if (now < cutoff.getTime()) continue; // still within window

    // Mark hold as expired
    await supabase
      .from("registrations")
      .update({ status: "expired_hold", hold_expired_at: new Date().toISOString() })
      .eq("id", reg.id);

    const profile = reg.profiles as { full_name: string; email: string } | null;

    // Notify the player whose hold expired
    await notify({
      userId: reg.player_id,
      email: profile?.email ?? null,
      type: "hold_expired",
      title: "Your hold has expired",
      body: `Your Hold My Spot for ${t.name} has expired. Your hold fee is non-refundable. We've opened your spot to the next waitlisted player.`,
      link: `/tournaments/${reg.tournament_id}`,
      templateKey: "hold_expired",
      variables: {
        full_name: profile?.full_name ?? "there",
        tournament_name: t.name,
        link_url: `${APP_URL}/tournaments/${reg.tournament_id}`,
      },
      idempotencyKey: `hold-expired/${reg.id}`,
    });

    // Promote next waitlisted player
    await promoteNextWaitlisted(reg.tournament_id);
  }

  console.log(`[sweepExpiredHolds] processed ${expiredHolds.length} held registrations`);
}

// ── Sweep 2: Expire lapsed waitlist offers ────────────────────────────────────

async function sweepExpiredWaitlistOffers() {
  const { data: lapsedOffers } = await supabase
    .from("registrations")
    .select("id, player_id, tournament_id, profiles!player_id(full_name, email), tournaments!tournament_id(name)")
    .eq("status", "waitlist_offered")
    .lt("waitlist_offer_expires_at", new Date().toISOString());

  if (!lapsedOffers?.length) return;

  for (const reg of lapsedOffers) {
    // Remove from waitlist — they had their chance
    await supabase
      .from("registrations")
      .update({ status: "withdrawn", waitlist_offer_expires_at: null })
      .eq("id", reg.id);

    const profile = reg.profiles as { full_name: string; email: string } | null;
    const t = reg.tournaments as { name: string } | null;

    await notify({
      userId: reg.player_id,
      email: profile?.email ?? null,
      type: "waitlist_offer_expired",
      title: "Your waitlist offer expired",
      body: `You didn't complete registration for ${t?.name ?? "the tournament"} within 24 hours. Your spot has been passed to the next player.`,
      link: `/tournaments/${reg.tournament_id}`,
      templateKey: "waitlist_offer_expired",
      variables: {
        full_name: profile?.full_name ?? "there",
        tournament_name: t?.name ?? "the tournament",
      },
      idempotencyKey: `waitlist-offer-expired/${reg.id}`,
    });

    // Promote next waitlisted player
    await promoteNextWaitlisted(reg.tournament_id);
  }

  console.log(`[sweepExpiredWaitlistOffers] processed ${lapsedOffers.length} lapsed offers`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Allow both scheduled (GET) and manual triggers (POST)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    await sweepExpiredHolds();
    await sweepExpiredWaitlistOffers();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[waitlist-sweeper error]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
