import { colors } from '@/theme';
import type { WalletItemType } from '@/lib/walletTypes';

export type WalletTypeAccent = {
  label: string;
  color: string;
  bg: string;
  icon: string;
};

// Per-type color coding for wallet cards. `pass` and `ticket`/`reward` have
// no brand-color equivalent, so they reuse colors already established as
// documented exceptions elsewhere in the app: blue matches the "Verified"
// badge (director.tsx/profile.tsx), purple/teal match the plan-tier accents
// in membership-settings.tsx. `credit`/`offer`/`membership` use existing
// brand/status tokens — no new colors introduced for those.
const WALLET_TYPE_ACCENT: Record<WalletItemType, WalletTypeAccent> = {
  credit:     { label: 'Credit',     color: colors.gold,    bg: colors.goldBg,             icon: 'cash-outline' },
  offer:      { label: 'Offer',      color: colors.success, bg: colors.successBg,          icon: 'pricetag-outline' },
  membership: { label: 'Membership', color: colors.navy,    bg: 'rgba(10,18,40,0.06)',      icon: 'shield-checkmark-outline' },
  pass:       { label: 'Pass',       color: '#3B82F6',      bg: 'rgba(59,130,246,0.10)',    icon: 'ticket-outline' },
  ticket:     { label: 'Ticket',     color: '#6C3FC5',      bg: 'rgba(108,63,197,0.10)',    icon: 'albums-outline' },
  reward:     { label: 'Reward',     color: '#0B9E8A',      bg: 'rgba(11,158,138,0.10)',    icon: 'gift-outline' },
  // Coach Marketplace V1 Phase 4. Reuses the same gold/school-icon language
  // as the Lesson Marketplace browse/detail screens (apps/mobile/src/app/lessons) —
  // a coach voucher IS a purchased lesson offer, not a new visual category.
  coach_voucher: { label: 'Lesson Voucher', color: colors.gold, bg: colors.goldBg, icon: 'school-outline' },
};

export function getWalletTypeAccent(type: WalletItemType): WalletTypeAccent {
  return WALLET_TYPE_ACCENT[type];
}
