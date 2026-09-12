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

// ─── Receipt ─────────────────────────────────────────────────────────────────

export type ReceiptRefund = {
  id: string;
  amountCents: number;
  reason: string | null;
  status: string;
  at: string;
};

export type Receipt = Purchase & {
  /** Stripe's PaymentIntent id — the reference support will ask for. */
  reference: string | null;
  provider: string | null;
  refunds: ReceiptRefund[];
};

/**
 * One payment, with the individual refunds against it.
 *
 * The purchase row already shows an aggregate (`refunded_amount_cents`), which
 * is enough for a list. A receipt should show each refund separately: two
 * partial refunds on one purchase are two events a person may need to
 * reconcile, and a single summed figure hides that.
 *
 * Card brand and last four are deliberately absent — `payments` does not store
 * them, and saved payment methods are not linked per payment, so any card
 * detail here would be a guess.
 *
 * RLS does the authorisation: `payments` is readable by its payer and `refunds`
 * by the payer of the payment they belong to, so passing someone else's id
 * simply returns nothing.
 */
export async function fetchReceipt(paymentId: string): Promise<Receipt | null> {
  const { data, error } = await supabase
    .from('payments')
    // Literal, not PAYMENT_SELECT + extras: the typed client parses this
    // string at compile time and a concatenation defeats it.
    .select('id,purpose_type,purpose_id,status,amount_cents,refunded_amount_cents,currency,created_at,confirmed_at,provider,provider_payment_intent_id')
    .eq('id', paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Row;
  const subs = await resolveSubtitles([row]);
  const base = dbRowToPurchase(row, subs.get(String(row.id)));

  const { data: refundRows, error: refundError } = await supabase
    .from('refunds')
    .select('id,amount_cents,reason,status,completed_at,created_at')
    .eq('payment_id', paymentId)
    .order('created_at', { ascending: true });

  // A receipt without its refund detail is still a usable receipt, and the
  // aggregate on the payment row already shows that money came back.
  if (refundError) console.warn('[payments] receipt refunds unavailable', refundError.message);

  return {
    ...base,
    reference: row.provider_payment_intent_id != null ? String(row.provider_payment_intent_id) : null,
    provider: row.provider != null ? String(row.provider) : null,
    refunds: ((refundRows ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      amountCents: Number(r.amount_cents ?? 0),
      reason: r.reason != null ? String(r.reason) : null,
      status: String(r.status ?? ''),
      at: String(r.completed_at ?? r.created_at),
    })),
  };
}
