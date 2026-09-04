import type { StatusVariant } from '@/components/StatusChip';
import type { WalletItem, WalletItemStatus } from '@/lib/walletTypes';

export type WalletStatusInfo = {
  label: string;
  variant: StatusVariant;
  priority: number;
};

const WALLET_ITEM_STATUS_INFO: Record<WalletItemStatus, WalletStatusInfo> = {
  processing:          { label: 'Processing',         variant: 'gray',  priority: 0 },
  failed:              { label: 'Failed',              variant: 'red',   priority: 1 },
  new:                 { label: 'New',                 variant: 'gold',  priority: 2 },
  available:           { label: 'Available',           variant: 'gold',  priority: 3 },
  active:              { label: 'Active',               variant: 'green', priority: 4 },
  partially_redeemed:  { label: 'Partially Redeemed',  variant: 'navy',  priority: 5 },
  redeemed:            { label: 'Redeemed',             variant: 'gray',  priority: 6 },
  expired:             { label: 'Expired',              variant: 'gray',  priority: 7 },
  revoked:             { label: 'Revoked',              variant: 'red',   priority: 8 },
};

export function getWalletItemStatusInfo(status: WalletItemStatus): WalletStatusInfo {
  return WALLET_ITEM_STATUS_INFO[status];
}

export type WalletDashboardSection =
  | 'actionable'
  | 'vouchers'
  | 'memberships'
  | 'credits'
  | 'offers'
  | 'passes'
  | 'tickets'
  | 'rewards'
  | 'history';

const TYPE_TO_SECTION: Record<WalletItem['type'], WalletDashboardSection> = {
  membership:    'memberships',
  credit:        'credits',
  offer:         'offers',
  pass:          'passes',
  ticket:        'tickets',
  reward:        'rewards',
  // Coach Marketplace V1 Phase 4 (spec §13 "MY VOUCHERS").
  coach_voucher: 'vouchers',
};

const SECTION_LABELS: Record<WalletDashboardSection, string> = {
  actionable:  'Needs Attention',
  vouchers:    'My Vouchers',
  memberships: 'Memberships',
  credits:     'Credits',
  offers:      'Offers',
  passes:      'Passes',
  tickets:     'Tickets',
  rewards:     'Rewards',
  history:     'History',
};

export function getWalletSectionLabel(section: WalletDashboardSection): string {
  return SECTION_LABELS[section];
}

/**
 * Buckets an item into a dashboard section per the spec's display-priority
 * rules: processing/failed/unseen items surface first, redeemed/expired
 * items collapse into a trailing history section, everything else groups
 * by type.
 */
export function getWalletDashboardSection(item: WalletItem): WalletDashboardSection {
  if (item.status === 'processing' || item.status === 'failed') return 'actionable';
  if (item.status === 'redeemed' || item.status === 'expired' || item.status === 'revoked') return 'history';
  return TYPE_TO_SECTION[item.type];
}

const SECTION_ORDER: WalletDashboardSection[] = [
  'actionable', 'vouchers', 'memberships', 'credits', 'offers', 'passes', 'tickets', 'rewards', 'history',
];

export function groupWalletItems(items: WalletItem[]): { section: WalletDashboardSection; items: WalletItem[] }[] {
  const bySection = new Map<WalletDashboardSection, WalletItem[]>();
  for (const item of items) {
    const section = getWalletDashboardSection(item);
    const bucket = bySection.get(section) ?? [];
    bucket.push(item);
    bySection.set(section, bucket);
  }
  return SECTION_ORDER
    .filter(section => (bySection.get(section)?.length ?? 0) > 0)
    .map(section => ({ section, items: bySection.get(section)! }));
}
