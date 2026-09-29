// Director walk-ins on the web (DIRECTOR_HUB_WEB_PARITY.md, W2 item 3): the client
// half of director_add_tournament_registration(), ported from mobile's
// lib/supabase/directorRegistrations.ts with the same rules and messages.
//   * Works after registration closes (fn_enforce_registration_close lets a
//     director-added row through; capacity and event-date checks still apply).
//   * A priced division needs an on-site tender: cash | other | comp. It is
//     recorded in registrations.onsite_*, never processed, and the amount is
//     derived server-side from the division's effective fee; the client never
//     sends it. Those rows are never in Revenue.

import { createClient } from "@/lib/supabase/client";

export type OnsiteTender = "cash" | "other" | "comp";

export const ONSITE_TENDER_LABELS: Record<OnsiteTender, string> = {
  cash: "Cash",
  other: "Other",
  comp: "Comped",
};

/** A person with no app account. Becomes a personal_guest_players row, never an auth user. */
export interface GuestInput {
  displayName: string;
  phone?: string;
  email?: string;
}

export type Participant =
  | { kind: "profile"; profileId: string; displayName: string }
  | { kind: "guest"; guest: GuestInput };

// The RPC raises bare codes; trigger failures (window closed, duplicate player)
// arrive as sentences, so anything unmatched shows the server's own text.
const ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in again.",
  not_tournament_director: "Only this tournament’s director can add registrations.",
  director_not_approved: "Your director account is not approved yet.",
  division_not_in_tournament: "That division does not belong to this tournament.",
  division_requires_payment: "This division charges an entry fee. Choose how it was paid on site: Cash, Other or Comped.",
  invalid_onsite_tender: "Choose how the entry fee was paid: Cash, Other or Comped.",
  invalid_participant: "Choose either an existing player or enter a guest, not both.",
  invalid_partner: "Choose either an existing partner or enter a guest partner, not both.",
  partner_required: "This is a doubles division. Add a partner to complete the team.",
  partner_not_allowed: "This is a singles division. Remove the partner.",
  division_full: "This division is full.",
  duplicate_participant: "A player cannot partner with themselves.",
};

function guestPayload(g: GuestInput) {
  return {
    display_name: g.displayName.trim(),
    phone: g.phone?.trim() || null,
    email: g.email?.trim() || null,
  };
}

export async function directorAddRegistration(input: {
  tournamentId: string;
  divisionId: string;
  player: Participant;
  partner?: Participant;
  onsiteTender?: OnsiteTender;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { player, partner } = input;
  const { error } = await createClient().rpc("director_add_tournament_registration", {
    p_tournament_id: input.tournamentId,
    p_division_id: input.divisionId,
    // Omitted (undefined) rather than null, so the function's DEFAULT NULL applies.
    p_player_id: player.kind === "profile" ? player.profileId : undefined,
    p_guest: player.kind === "guest" ? guestPayload(player.guest) : undefined,
    p_partner_id: partner?.kind === "profile" ? partner.profileId : undefined,
    p_partner_guest: partner?.kind === "guest" ? guestPayload(partner.guest) : undefined,
    p_onsite_tender: input.onsiteTender,
  });
  if (!error) return { ok: true };
  const raw = error.message ?? "";
  const code = Object.keys(ERROR_MESSAGES).find((k) => raw.includes(k));
  return { ok: false, error: code ? ERROR_MESSAGES[code] : raw || "Could not add the registration. Please try again." };
}

export interface DirectorDivision {
  id: string;
  name: string;
  entryFeeCents: number;
  drawSize: number;
  spotsFilled: number;
  requiresOnsitePayment: boolean;
  requiresPartner: boolean;
}

export async function fetchDirectorDivisions(tournamentId: string): Promise<DirectorDivision[]> {
  // A division's NULL entry_fee_cents inherits the tournament's fee; resolve it
  // the way the RPC does so the form never offers what the server refuses.
  const supabase = createClient();
  const [{ data: tournament }, { data, error }] = await Promise.all([
    supabase.from("tournaments").select("entry_fee_cents").eq("id", tournamentId).maybeSingle(),
    supabase
      .from("divisions")
      .select("id, name, format, entry_fee_cents, draw_size, spots_filled")
      .eq("tournament_id", tournamentId)
      .order("name"),
  ]);
  if (error || !data) return [];
  const tournamentFee = tournament?.entry_fee_cents ?? null;
  return data.map((d) => {
    const fee = d.entry_fee_cents ?? tournamentFee ?? 0;
    return {
      id: d.id,
      name: d.name,
      entryFeeCents: fee,
      drawSize: d.draw_size,
      spotsFilled: d.spots_filled,
      requiresOnsitePayment: fee > 0,
      // The RPC's own rule reads format, not the name.
      requiresPartner: d.format === "doubles" || d.format === "mixed_doubles",
    };
  });
}

export interface RegistrableProfile {
  id: string;
  fullName: string;
}

/** Players by name. Doesn't exclude the caller: a director may enter their own event. */
export async function searchRegistrableProfiles(query: string): Promise<RegistrableProfile[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data } = await createClient()
    .from("profiles")
    .select("id, full_name")
    .ilike("full_name", `%${trimmed.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
    .limit(20);
  return (data ?? []).map((p) => ({ id: p.id, fullName: p.full_name ?? "Unnamed player" }));
}

export function formatFee(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/** "Cash $40 on site", "Comped", or null for a normal registration. */
export function onsiteLabel(tender: string | null, amountCents: number | null): string | null {
  if (!tender) return null;
  if (tender === "comp") return "Comped";
  return `${tender === "cash" ? "Cash" : "Other"} ${formatFee(amountCents ?? 0)} on site`;
}
