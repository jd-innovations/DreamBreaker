import { supabase } from '@/lib/supabase';

// Reading an emailed review invitation, and answering it.
//
// The token is the whole credential. resolve_review_invitation refuses one that
// is not the caller's, so nothing here decides who may write — it only turns
// the database's bare error codes into sentences a person can act on.

export type ReviewSubjectType = 'coach' | 'coach_offer' | 'facility' | 'tournament';

export type ReviewSubject = {
  subjectType: ReviewSubjectType;
  subjectId: string;
  subjectLabel: string;
  alreadyReviewed: boolean;
};

export type ResolveResult =
  | { ok: true; subject: ReviewSubject }
  | { ok: false; message: string };

export type SubmitResult = { ok: true } | { ok: false; message: string };

// The codes resolve_review_invitation and submit_review actually raise. Kept
// exhaustive rather than defaulting everything to one apology: an unmapped code
// surfacing its own text is how a real bug stays visible.
const MESSAGES: Record<string, string> = {
  invitation_not_found:
    'We could not find this review link. Check that you opened the whole link from the email.',
  not_your_invitation:
    'This review link belongs to a different account. Sign in with the address the email was sent to.',
  invitation_revoked: 'This review link is no longer active.',
  invitation_expired: 'This review link has expired. Review links are good for 60 days.',
  not_eligible:
    'We could not confirm the booking behind this review, so it cannot be submitted.',
  invalid_rating: 'Please choose a rating from one to five stars.',
  not_authenticated: 'Please sign in to leave your review.',
};

// Supabase rejects with a PostgrestError — a plain object, not an Error — so
// `instanceof Error` would miss the message entirely.
function messageFor(err: unknown): string {
  const raw =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return text;
  }
  return raw || 'Something went wrong with this review link.';
}

export function subjectPrompt(subjectType: string): string {
  switch (subjectType) {
    case 'coach': return 'How was your lesson with';
    case 'facility': return 'How was your visit to';
    default: return 'How was';
  }
}

export async function resolveReviewInvitation(token: string): Promise<ResolveResult> {
  const { data, error } = await supabase.rpc('resolve_review_invitation', {
    p_token: token.trim(),
  });
  if (error) return { ok: false, message: messageFor(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, message: MESSAGES.invitation_not_found };

  return {
    ok: true,
    subject: {
      subjectType: row.subject_type as ReviewSubjectType,
      subjectId: row.subject_id,
      subjectLabel: row.subject_label,
      alreadyReviewed: !!row.already_reviewed,
    },
  };
}

export async function submitReview(
  token: string,
  rating: number,
  body: string,
): Promise<SubmitResult> {
  const { error } = await supabase.rpc('submit_review', {
    p_token: token.trim(),
    p_rating: rating,
    // undefined, not null: the generated signature types p_body as optional,
    // and omitting it lets the SQL default supply the null.
    p_body: body.trim() || undefined,
  });
  return error ? { ok: false, message: messageFor(error) } : { ok: true };
}
