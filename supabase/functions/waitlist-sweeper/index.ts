import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ── Email helper — no-ops gracefully when RESEND_API_KEY is not set ────────────

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${payload.to} subject=${payload.subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Compete Pickleball <no-reply@competepickleball.com>",
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    console.error(`[email failed] ${res.status} ${await res.text()}`);
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
  data?: Record<string, unknown>;
  emailSubject?: string;
  emailHtml?: string;
}) {
  const { error } = await supabase.from("notifications").insert({
    user_id: opts.userId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link ?? null,
    data: opts.data ?? {},
  });
  if (error) console.error(`[notify insert error] ${error.message}`);

  if (opts.email && opts.emailSubject && opts.emailHtml) {
    await sendEmail({ to: opts.email, subject: opts.emailSubject, html: opts.emailHtml });
    if (!error) {
      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("user_id", opts.userId)
        .eq("type", opts.type)
        .is("email_sent_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
    }
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
    data: { tournament_id: tournamentId, expires_at: offerExpiry },
    emailSubject: `Your waitlist spot is ready — ${tournamentName}`,
    emailHtml: `
      <p>Hi ${profile?.full_name ?? "there"},</p>
      <p>A spot has opened in <strong>${tournamentName}</strong> and you're next on the waitlist.</p>
      <p><strong>You have 24 hours to complete your registration.</strong> After that, the spot moves to the next player.</p>
      <p><a href="https://competepickleball.com/tournaments/${tournamentId}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Complete Registration</a></p>
      <p style="color:#888;font-size:12px">Compete Pickleball · You're receiving this because you joined the waitlist.</p>
    `,
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
      data: { tournament_id: reg.tournament_id },
      emailSubject: `Your hold for ${t.name} has expired`,
      emailHtml: `
        <p>Hi ${profile?.full_name ?? "there"},</p>
        <p>Your <strong>Hold My Spot</strong> reservation for <strong>${t.name}</strong> has expired because you did not complete registration before the cutoff date.</p>
        <p>Your hold fee has been forfeited per our policy. Your spot has been offered to the next player on the waitlist.</p>
        <p>If you'd still like to attend, you can <a href="https://competepickleball.com/tournaments/${reg.tournament_id}">join the waitlist</a>.</p>
        <p style="color:#888;font-size:12px">Compete Pickleball</p>
      `,
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
      data: { tournament_id: reg.tournament_id },
      emailSubject: `Waitlist offer expired — ${t?.name ?? "tournament"}`,
      emailHtml: `
        <p>Hi ${profile?.full_name ?? "there"},</p>
        <p>Your 24-hour window to register for <strong>${t?.name ?? "the tournament"}</strong> has passed. Your spot has been offered to the next player on the waitlist.</p>
        <p style="color:#888;font-size:12px">Compete Pickleball</p>
      `,
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
