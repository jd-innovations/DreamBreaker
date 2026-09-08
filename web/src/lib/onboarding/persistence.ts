// Draft persistence.
//
// Mobile's onboarding keeps its draft in context only — killing the app loses
// everything. Web cannot do that, for a reason specific to this platform:
// `enable_confirmations` is on, so an email signup has NO SESSION while the flow
// runs. The answers have to survive until the user clicks the confirmation link,
// which may be minutes later and in a different tab.
//
// So the draft is written to localStorage (not sessionStorage — a new tab must
// see it) and flushed to `profiles` once a session exists.
//
// Every read is defensive. localStorage throws in some contexts (private mode,
// blocked site data) and can return anything at all, since a user or an older
// build may have written it.

import { INITIAL_DRAFT, type OnboardingDraft, type DraftField } from "./draft";

const KEY = "dbpb.onboarding.draft.v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PersistedDraft = {
  version: 1;
  savedAt: number;
  /** The user this draft belongs to, when known. Null before confirmation. */
  userId: string | null;
  /** Set at the point the draft was started, so a draft cannot be flushed onto
   *  a different account on a shared browser. */
  email: string | null;
  draft: OnboardingDraft;
  touched: DraftField[];
  lastStep: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function loadDraft(): PersistedDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    // An unknown version is discarded, never migrated. A half-understood draft
    // writing to `profiles` is worse than asking the user to answer again.
    if (parsed.version !== 1) { clearDraft(); return null; }

    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
    if (Date.now() - savedAt > MAX_AGE_MS) { clearDraft(); return null; }

    if (!isRecord(parsed.draft)) { clearDraft(); return null; }

    return {
      version: 1,
      savedAt,
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      // Merge over INITIAL_DRAFT so a draft written by an older build that
      // lacked a field still loads.
      draft: { ...INITIAL_DRAFT, ...(parsed.draft as Partial<OnboardingDraft>) },
      touched: Array.isArray(parsed.touched)
        ? (parsed.touched.filter((t) => typeof t === "string") as DraftField[])
        : [],
      lastStep: typeof parsed.lastStep === "string" ? parsed.lastStep : null,
    };
  } catch {
    return null;
  }
}

export function saveDraft(value: Omit<PersistedDraft, "version" | "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedDraft = { version: 1, savedAt: Date.now(), ...value };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked. The flow still works in-memory for this tab;
    // only resume-after-refresh is lost, which is not worth failing over.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Whether a stored draft may be flushed onto this account.
 *
 * The shared-browser hazard is real: person A starts onboarding and abandons it,
 * person B signs in on the same machine, and B's profile gets A's answers. A
 * draft with no identity yet (the normal pre-confirmation case) is claimable by
 * whoever confirms; one already stamped with a different user or email is not.
 */
export function draftBelongsTo(
  stored: PersistedDraft,
  user: { id: string; email?: string | null },
): boolean {
  if (stored.userId && stored.userId !== user.id) return false;
  if (stored.email && user.email && stored.email.toLowerCase() !== user.email.toLowerCase()) {
    return false;
  }
  return true;
}

// ── Signup seed ──────────────────────────────────────────────────────────────
//
// The name and email captured by the signup form, held for the onboarding flow
// that runs immediately after.
//
// This exists because of `enable_confirmations`. With it on, `signUp()` returns
// no session, so onboarding runs unauthenticated — and the profile step's
// prefill, which reads `full_name` from the `profiles` row, has no session to
// read it with. It bailed silently and asked the user to type a name they had
// entered on the previous screen.
//
// Kept separate from the draft rather than folded into it: the draft is the
// user's answers and is cleared once written, while this is signup context and
// must survive a draft reset. It also carries the email, which lets the identity
// stamp work with no session — without it a draft is unattributable and cannot
// be defended against being flushed onto the wrong account.

const SEED_KEY = "dbpb.onboarding.seed.v1";

export type SignupSeed = { firstName: string; lastName: string; email: string | null };

export function saveSignupSeed(seed: SignupSeed): void {
  try {
    window.localStorage.setItem(SEED_KEY, JSON.stringify(seed));
  } catch {
    // Storage blocked. The user types their name again — annoying, not broken.
  }
}

export function loadSignupSeed(): SignupSeed | null {
  try {
    const raw = window.localStorage.getItem(SEED_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const s = parsed as Record<string, unknown>;
    if (typeof s.firstName !== "string" || typeof s.lastName !== "string") return null;
    return {
      firstName: s.firstName,
      lastName: s.lastName,
      email: typeof s.email === "string" ? s.email : null,
    };
  } catch {
    return null;
  }
}

export function clearSignupSeed(): void {
  try {
    window.localStorage.removeItem(SEED_KEY);
  } catch {
    /* nothing useful to do */
  }
}
