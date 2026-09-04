export type WalletItemType = 'credit' | 'membership' | 'offer' | 'pass' | 'ticket' | 'reward' | 'coach_voucher';

export type WalletItemStatus =
  | 'processing'
  | 'new'
  | 'available'
  | 'active'
  | 'partially_redeemed'
  | 'redeemed'
  | 'expired'
  | 'revoked'
  | 'failed';

export type WalletActionType = 'external_url' | 'internal_route' | 'redemption' | 'view_details' | 'none';

export interface WalletPartner {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
}

// Coach Marketplace V1 Phase 4. Parsed from wallet_items.metadata for
// type === 'coach_voucher' only — a presentation snapshot of the purchase
// terms (Phase 3's immutable coach_offer_purchases row), never re-derived
// from the current (possibly since-edited) coach_offers row.
export interface CoachVoucherSnapshot {
  purchaseId: string;
  coachId: string;
  offerId: string;
  offerType: 'private' | 'semi_private' | 'group_clinic' | 'camp' | 'package';
  facilityId: string | null;
  facilityName: string | null;
  heroImageUrl: string | null;
  regularPriceCents: number;
  sellingPriceCents: number;
  discountPct: number;
  participantQuantity: number;
  lessonsIncluded: number | null;
  buyerTotalChargedCents: number;
  purchasedAt: string;
}

// Live redemption-entitlement summary for a coach voucher — deliberately
// NOT cached in wallet_items.metadata (that snapshot is purchase terms
// only) because remaining/total will change once Phase 5 redemption ships;
// always fetched fresh from coach_voucher_entitlements.
export interface CoachVoucherEntitlementSummary {
  entitlementType: 'participant' | 'package';
  totalRedemptions: number;
  remainingRedemptions: number;
}

export interface WalletItem {
  id: string;
  partnerId: string | null;
  partner: WalletPartner | null;

  type: WalletItemType;
  status: WalletItemStatus;

  title: string;
  subtitle: string | null;
  description: string | null;

  valueAmount: number | null;
  currencyCode: string;
  valueLabel: string | null;
  originalValueAmount: number | null;
  remainingValueAmount: number | null;

  startsAt: string | null;
  expiresAt: string | null;
  redeemedAt: string | null;

  actionType: WalletActionType;
  actionLabel: string | null;
  actionUrl: string | null;

  isSeen: boolean;
  seenAt: string | null;

  createdAt: string;

  coachVoucher: CoachVoucherSnapshot | null;
}

export interface WalletActivityEntry {
  id: string;
  walletItemId: string;
  eventType: string;
  title: string;
  description: string | null;
  amount: number | null;
  currencyCode: string | null;
  createdAt: string;
}

export interface WalletRedemption {
  id: string;
  walletItemId: string;
  status: 'pending' | 'completed' | 'failed';
  amount: number | null;
  currencyCode: string | null;
  startedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}
