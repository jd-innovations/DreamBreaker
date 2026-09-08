// Turns whatever createCoachOffer/updateCoachOffer threw into something a coach
// can act on.
//
// Supabase throws a PostgrestError — a plain object with `message`, not an
// Error instance. Every call site used `err instanceof Error ? err.message :
// 'Something went wrong'`, so the real reason was discarded on exactly the
// failures that have one: a coach hitting the publish-ready trigger saw
// "Something went wrong. Please try again." and retrying could never help.
//
// The raw database messages are also written for whoever reads the trigger,
// not for a coach, so the two that a coach can actually hit are translated.

function rawMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return null;
}

export function coachOfferErrorMessage(err: unknown): string {
  const raw = rawMessage(err);
  if (!raw) return 'Something went wrong. Please try again.';

  // fn_enforce_coach_offer_publish_rules: coach_status must be 'active' or
  // 'test_ready'. Says what unblocks it, and where.
  if (raw.includes('not publish-ready')) {
    return 'Your payout account is not set up yet, so offers cannot go live. '
      + 'Set up payouts in Account Settings, then publish. You can still save this as a draft.';
  }

  // Same trigger: the platform minimum discount.
  if (raw.includes('below the platform minimum')) {
    return `${raw}. Lower the discounted price, or raise the regular price.`;
  }

  return raw;
}
