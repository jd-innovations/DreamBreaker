'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// Star rating for an emailed invitation. The token is the only credential the
// form carries: resolve_review_invitation refuses one that is not the signed-in
// user's, so this screen never has to decide who may write.

type Resolved = {
  subject_type: string;
  subject_id: string;
  subject_label: string;
  already_reviewed: boolean;
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'signed_out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; subject: Resolved }
  | { kind: 'done'; subject: Resolved };

// Postgres raises bare codes; a person reading their email needs a sentence.
// Anything unmapped falls through to its own text rather than being flattened
// into "something went wrong", which would hide a real bug.
const MESSAGES: Record<string, string> = {
  invitation_not_found:
    'We could not find this review link. Check that you copied the whole address from the email.',
  not_your_invitation:
    'This review link belongs to a different account. Sign in with the address the email was sent to.',
  invitation_revoked: 'This review link is no longer active.',
  invitation_expired: 'This review link has expired. Review links are good for 60 days.',
  not_eligible:
    'We could not confirm the booking behind this review, so it cannot be submitted.',
  invalid_rating: 'Please choose a rating from one to five stars.',
  not_authenticated: 'Please sign in to leave your review.',
};

function messageFor(raw: string | undefined): string {
  if (!raw) return 'Something went wrong loading this review link.';
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return text;
  }
  return raw;
}

const PROMPTS: Record<string, string> = {
  coach: 'How was your lesson with',
  coach_offer: 'How was',
  facility: 'How was your visit to',
  tournament: 'How was',
};

export function ReviewForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setPhase({ kind: 'signed_out' });
      return;
    }

    const { data, error } = await supabase.rpc('resolve_review_invitation', { p_token: token });
    if (error) {
      setPhase({ kind: 'error', message: messageFor(error.message) });
      return;
    }
    const subject = (Array.isArray(data) ? data[0] : data) as Resolved | undefined;
    if (!subject) {
      setPhase({ kind: 'error', message: MESSAGES.invitation_not_found });
      return;
    }
    // An already-written review is still editable: the same token reopens it and
    // submit_review upserts. So this only changes the wording, not the flow.
    setPhase({ kind: 'ready', subject });
  }, [token]);

  useEffect(() => {
    // load() awaits getSession() before it ever calls setState, so nothing
    // here is a synchronous set. The rule matches on the call shape, not the
    // await, so it is suppressed rather than worked around.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit() {
    if (phase.kind !== 'ready' || rating < 1 || submitting) return;
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('submit_review', {
        p_token: token,
        p_rating: rating,
        p_body: body.trim() || undefined,
      });
      if (error) {
        setPhase({ kind: 'error', message: messageFor(error.message) });
        return;
      }
      setPhase({ kind: 'done', subject: phase.subject });
    } finally {
      setSubmitting(false);
    }
  }

  const signInHref = '/auth?next=' + encodeURIComponent('/review/' + token);

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md space-y-6 text-center">
        <p className="font-mono text-xs tracking-[0.28em] text-primary uppercase">Pickleball App</p>

        {phase.kind === 'loading' && (
          <p className="text-sm text-muted-foreground">Loading your review…</p>
        )}

        {phase.kind === 'signed_out' && (
          <>
            <h1 className="font-display text-4xl tracking-wide">Sign in to review</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Your review link is personal, so we need to know it is you. Sign in with the address
              this email was sent to and we will bring you straight back here.
            </p>
            <Link
              href={signInHref}
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 font-display text-sm tracking-[0.18em] text-primary-foreground transition hover:bg-primary/90"
            >
              Sign in
            </Link>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <h1 className="font-display text-4xl tracking-wide">Review link</h1>
            <p className="text-sm leading-6 text-muted-foreground">{phase.message}</p>
            <Link href="/dashboard" className="text-sm text-primary underline underline-offset-4">
              Go to your dashboard
            </Link>
          </>
        )}

        {phase.kind === 'done' && (
          <>
            <h1 className="font-display text-4xl tracking-wide">Thank you</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Your rating for {phase.subject.subject_label} has been saved. It helps the next player
              know what to expect.
            </p>
            <Link href="/dashboard" className="text-sm text-primary underline underline-offset-4">
              Go to your dashboard
            </Link>
          </>
        )}

        {phase.kind === 'ready' && (
          <>
            <h1 className="font-display text-4xl tracking-wide">
              {PROMPTS[phase.subject.subject_type] ?? 'How was'}{' '}
              <span className="text-primary">{phase.subject.subject_label}</span>?
            </h1>
            {phase.subject.already_reviewed && (
              <p className="text-xs text-muted-foreground">
                You have already rated this. Submitting again replaces your earlier review.
              </p>
            )}

            <div className="flex justify-center gap-2" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={n + (n === 1 ? ' star' : ' stars')}
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  className="text-4xl leading-none transition-transform hover:scale-110"
                >
                  <span className={n <= (hovered || rating) ? 'text-primary' : 'text-muted-foreground/30'}>
                    &#9733;
                  </span>
                </button>
              ))}
            </div>

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Anything you would want the next player to know? (optional)"
              className="w-full rounded-2xl border border-border bg-card p-4 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />

            <button
              type="button"
              onClick={submit}
              disabled={rating < 1 || submitting}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-6 font-display text-sm tracking-[0.18em] text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              {submitting ? 'Sending…' : 'Submit review'}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
