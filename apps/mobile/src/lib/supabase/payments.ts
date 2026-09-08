import { supabase } from '@/lib/supabase';
import type { Purchase, PurchasePurposeType } from '@/lib/paymentTypes';

// Only money that actually moved belongs in a purchase history. Rows sitting
// in requires_confirmation/processing are in-flight checkouts, and failed/
// canceled ones never charged the user — showing either would read as a
// charge that isn't on their statement.
const SETTLED_STATUSES = ['succeeded', 'refunded', 'partially_refunded'] as const;

const PAYMENT_SELECT =
  'id,purpose_type,purpose_id,status,amount_cents,refunded_amount_cents,currency,created_at,confirmed_at';

/** Rows whose purpose_id is a tournament id directly. */
const TOURNAMENT_PURPOSES: PurchasePurposeType[] = [
  'tournament_registration_entry',
  'tournament_registration_hold',
  'tournament_registration_balance',
];

type Row = Record<string, unknown>;

function idsFor(rows: Row[], purposes: string[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (purposes.includes(String(r.purpose_type)) && r.purpose_id) set.add(String(r.purpose_id));
  }
  return [...set];
}

/**
 * Resolves the human-readable line under each purchase (tournament name,
 * facility name, offer title). The payments table stores only a soft
 * purpose_type/purpose_id pointer and no display text, so this is a second
 * hop by design.
 *
 * Every lookup is best-effort: a purpose whose target row is gone, or which
 * RLS won't return, resolves to no subtitle rather than failing the whole
 * history. Losing one caption is not worth hiding a real charge.
 */
async function resolveSubtitles(rows: Row[]): Promise<Map<string, string>> {
  const subs = new Map<string, string>();

  const tournamentIds = idsFor(rows, TOURNAMENT_PURPOSES);
  const groupIds      = idsFor(rows, ['tournament_team_entry']);
  const purchaseIds   = idsFor(rows, ['coach_offer_purchase']);
  const reservationIds = idsFor(rows, ['reservation_payment']);

  const safe = async <T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
    try {
      const { data } = await p;
      return data ?? [];
    } catch {
      return [];
    }
  };

  // Team entries point at a registration_group, which in turn names the
  // tournament — so their tournament ids aren't known until that hop lands.
  const groups = groupIds.length
    ? await safe<{ id: string; tournament_id: string }>(
        supabase.from('registration_groups').select('id,tournament_id').in('id', groupIds),
      )
    : [];

  const groupToTournament = new Map(groups.map((g) => [g.id, g.tournament_id]));
  const allTournamentIds = [...new Set([...tournamentIds, ...groups.map((g) => g.tournament_id)])];

  const [tournaments, purchases, reservations] = await Promise.all([
    allTournamentIds.length
      ? safe<{ id: string; name: string }>(
          supabase.from('tournaments').select('id,name').in('id', allTournamentIds),
        )
      : Promise.resolve([]),
    purchaseIds.length
      ? safe<{ id: string; offer_title: string }>(
          supabase.from('coach_offer_purchases').select('id,offer_title').in('id', purchaseIds),
        )
      : Promise.resolve([]),
    reservationIds.length
      ? safe<{ id: string; facilities: { name: string } | null }>(
          supabase.from('reservations').select('id,facilities(name)').in('id', reservationIds),
        )
      : Promise.resolve([]),
  ]);

  const tournamentNames = new Map(tournaments.map((t) => [t.id, t.name]));

  for (const r of rows) {
    const id = String(r.id);
    const purposeId = String(r.purpose_id);

    switch (String(r.purpose_type)) {
      case 'tournament_registration_entry':
      case 'tournament_registration_hold':
      case 'tournament_registration_balance': {
        const name = tournamentNames.get(purposeId);
        if (name) subs.set(id, name);
        break;
      }
      case 'tournament_team_entry': {
        const tid = groupToTournament.get(purposeId);
        const name = tid ? tournamentNames.get(tid) : undefined;
        if (name) subs.set(id, name);
        break;
      }
      case 'coach_offer_purchase': {
        const title = purchases.find((p) => p.id === purposeId)?.offer_title;
        if (title) subs.set(id, title);
        break;
      }
      case 'reservation_payment': {
        const name = reservations.find((x) => x.id === purposeId)?.facilities?.name;
        if (name) subs.set(id, name);
        break;
      }
    }
  }

  return subs;
}

function dbRowToPurchase(row: Row, subtitle: string | undefined): Purchase {
  const amountCents   = Number(row.amount_cents ?? 0);
  const refundedCents = Number(row.refunded_amount_cents ?? 0);

  return {
    id:            String(row.id),
    purposeType:   String(row.purpose_type) as PurchasePurposeType,
    purposeId:     String(row.purpose_id),
    subtitle:      subtitle ?? null,
    amountCents,
    refundedCents,
    currency:      String(row.currency ?? 'usd'),
    status:        String(row.status) as Purchase['status'],
    // confirmed_at is when the charge actually settled; created_at is only
    // when checkout began. Prefer the former so the date matches the receipt.
    paidAt:        String(row.confirmed_at ?? row.created_at),
  };
}

/**
 * Settled purchases for one user, newest first. RLS ("payments: payer read
 * own") already restricts this to the caller, but the explicit payer filter
 * keeps the query honest and lets the index on payer_user_id do the work.
 */
export async function fetchPurchaseHistory(userId: string, limit?: number): Promise<Purchase[]> {
  let query = supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('payer_user_id', userId)
    .in('status', SETTLED_STATUSES)
    .order('created_at', { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  const subs = await resolveSubtitles(rows);

  return rows.map((r) => dbRowToPurchase(r, subs.get(String(r.id))));
}
