import { supabase } from '@/lib/supabase';
import type {
  WalletItem, WalletActivityEntry, WalletPartner, CoachVoucherSnapshot, CoachVoucherEntitlementSummary,
} from '@/lib/walletTypes';

const WALLET_ITEM_SELECT =
  'id,partner_id,type,status,title,subtitle,description,value_amount,currency_code,value_label,' +
  'original_value_amount,remaining_value_amount,starts_at,expires_at,redeemed_at,' +
  'action_type,action_label,action_url,is_seen,seen_at,created_at,metadata,' +
  'wallet_partners(id,slug,name,description,logo_url,website_url)';

function parseCoachVoucherSnapshot(type: unknown, metadata: unknown): CoachVoucherSnapshot | null {
  if (type !== 'coach_voucher' || !metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  return {
    purchaseId:            String(m.purchaseId ?? ''),
    coachId:                String(m.coachId ?? ''),
    offerId:                String(m.offerId ?? ''),
    offerType:              m.offerType as CoachVoucherSnapshot['offerType'],
    facilityId:             m.facilityId != null ? String(m.facilityId) : null,
    facilityName:           m.facilityName != null ? String(m.facilityName) : null,
    heroImageUrl:           m.heroImageUrl != null ? String(m.heroImageUrl) : null,
    regularPriceCents:      Number(m.regularPriceCents ?? 0),
    sellingPriceCents:      Number(m.sellingPriceCents ?? 0),
    discountPct:            Number(m.discountPct ?? 0),
    participantQuantity:    Number(m.participantQuantity ?? 1),
    lessonsIncluded:        m.lessonsIncluded != null ? Number(m.lessonsIncluded) : null,
    buyerTotalChargedCents: Number(m.buyerTotalChargedCents ?? 0),
    purchasedAt:            String(m.purchasedAt ?? ''),
  };
}

// Coach vouchers are never flipped to 'expired' by a cron (see Phase 4
// migration comment) — the stored status can lag reality. This is a
// display-only correction, scoped to coach_voucher so no other Wallet item
// type's behavior changes. Phase 5 security checks must independently
// compare expires_at server-side regardless of this or the stored status.
function deriveDisplayStatus(type: unknown, status: string, expiresAt: string | null): WalletItem['status'] {
  if (type === 'coach_voucher' && expiresAt && (status === 'active' || status === 'available' || status === 'new')) {
    if (new Date(expiresAt).getTime() < Date.now()) return 'expired';
  }
  return status as WalletItem['status'];
}

function dbRowToPartner(row: Record<string, unknown> | null): WalletPartner | null {
  if (!row) return null;
  return {
    id:          String(row.id),
    slug:        String(row.slug ?? ''),
    name:        String(row.name ?? ''),
    description: row.description != null ? String(row.description) : null,
    logoUrl:     row.logo_url != null ? String(row.logo_url) : null,
    websiteUrl:  row.website_url != null ? String(row.website_url) : null,
  };
}

function dbRowToWalletItem(row: Record<string, unknown>): WalletItem {
  return {
    id:                    String(row.id),
    partnerId:             row.partner_id != null ? String(row.partner_id) : null,
    partner:               dbRowToPartner(row.wallet_partners as Record<string, unknown> | null),

    type:                  row.type as WalletItem['type'],
    status:                deriveDisplayStatus(row.type, String(row.status ?? ''), row.expires_at != null ? String(row.expires_at) : null),

    title:                 String(row.title ?? ''),
    subtitle:              row.subtitle != null ? String(row.subtitle) : null,
    description:           row.description != null ? String(row.description) : null,

    valueAmount:           row.value_amount != null ? Number(row.value_amount) : null,
    currencyCode:          String(row.currency_code ?? 'USD'),
    valueLabel:            row.value_label != null ? String(row.value_label) : null,
    originalValueAmount:   row.original_value_amount != null ? Number(row.original_value_amount) : null,
    remainingValueAmount:  row.remaining_value_amount != null ? Number(row.remaining_value_amount) : null,

    startsAt:              row.starts_at != null ? String(row.starts_at) : null,
    expiresAt:             row.expires_at != null ? String(row.expires_at) : null,
    redeemedAt:            row.redeemed_at != null ? String(row.redeemed_at) : null,

    actionType:            row.action_type as WalletItem['actionType'],
    actionLabel:           row.action_label != null ? String(row.action_label) : null,
    actionUrl:             row.action_url != null ? String(row.action_url) : null,

    isSeen:                Boolean(row.is_seen),
    seenAt:                row.seen_at != null ? String(row.seen_at) : null,

    createdAt:             String(row.created_at ?? ''),

    coachVoucher:          parseCoachVoucherSnapshot(row.type, row.metadata),
  };
}

function dbRowToActivity(row: Record<string, unknown>): WalletActivityEntry {
  return {
    id:            String(row.id),
    walletItemId:  String(row.wallet_item_id),
    eventType:     String(row.event_type ?? ''),
    title:         String(row.title ?? ''),
    description:   row.description != null ? String(row.description) : null,
    amount:        row.amount != null ? Number(row.amount) : null,
    currencyCode:  row.currency_code != null ? String(row.currency_code) : null,
    createdAt:     String(row.created_at ?? ''),
  };
}

export async function fetchWalletItems(userId: string): Promise<WalletItem[]> {
  const { data, error } = await supabase
    .from('wallet_items')
    .select(WALLET_ITEM_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.warn('fetchWalletItems failed', error);
    return [];
  }
  return data.map(row => dbRowToWalletItem(row as unknown as Record<string, unknown>));
}

export async function fetchWalletItemById(id: string): Promise<WalletItem | null> {
  const { data, error } = await supabase
    .from('wallet_items')
    .select(WALLET_ITEM_SELECT)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.warn('fetchWalletItemById failed', error);
    return null;
  }
  return dbRowToWalletItem(data as unknown as Record<string, unknown>);
}

export async function fetchWalletActivity(walletItemId: string): Promise<WalletActivityEntry[]> {
  const { data, error } = await supabase
    .from('wallet_activity')
    .select('id,wallet_item_id,event_type,title,description,amount,currency_code,created_at')
    .eq('wallet_item_id', walletItemId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    console.warn('fetchWalletActivity failed', error);
    return [];
  }
  return data.map(dbRowToActivity);
}

// Coach Marketplace V1 Phase 4. Always live — never cached in
// wallet_items.metadata — because Phase 5 redemption will change these
// counts. A package purchase has exactly one row; a multi-participant
// purchase has one row per participant, summed here into a single
// "X of Y remaining" figure for card/detail display.
export async function fetchCoachVoucherEntitlementSummary(purchaseId: string): Promise<CoachVoucherEntitlementSummary | null> {
  const { data, error } = await supabase
    .from('coach_voucher_entitlements')
    .select('entitlement_type,total_redemptions,remaining_redemptions')
    .eq('purchase_id', purchaseId);

  if (error || !data || data.length === 0) {
    if (error) console.warn('fetchCoachVoucherEntitlementSummary failed', error);
    return null;
  }

  const entitlementType = data[0]!.entitlement_type as CoachVoucherEntitlementSummary['entitlementType'];
  const totalRedemptions = data.reduce((sum, row) => sum + row.total_redemptions, 0);
  const remainingRedemptions = data.reduce((sum, row) => sum + row.remaining_redemptions, 0);
  return { entitlementType, totalRedemptions, remainingRedemptions };
}

export async function markWalletItemSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_wallet_item_seen', { p_item_id: id });
  if (error) console.warn('markWalletItemSeen failed', error);
}
