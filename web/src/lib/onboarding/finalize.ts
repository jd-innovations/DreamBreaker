// Writing the draft to `profiles`.
//
// Web cannot follow mobile's approach here. Mobile defers `signUp()` to the last
// screen so the answers ride in as `raw_user_meta_data` and the
// `fn_handle_new_user` trigger writes them atomically. On web the account
// already exists by the time onboarding runs — /auth creates it — and
// `enable_confirmations` is on, so the user has NO SESSION for the whole flow.
//
// So the write is deferred instead of the signup:
//
//   session present  -> write now (OAuth, or a confirmed user resuming)
//   no session       -> leave the draft in localStorage; the nudge host flushes
//                       it on a later page load, which is exactly what clicking
//                       the confirmation link produces
//
// Every failure degrades to "profile still incomplete", which the nudge covers.

import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { ensureFreshSession } from "@/lib/ensure-session";
import { draftToProfileFields, profileFieldsSchema } from "./transform";
import type { OnboardingDraft, DraftField } from "./draft";

export type FinalizeResult =
  | { status: "saved" }
  /** No session yet — the draft stays put and is flushed after confirmation. */
  | { status: "deferred" }
  | { status: "error"; message: string };

/**
 * Writes the touched fields for `userId`.
 *
 * Uses the pattern the rest of the app uses for profile writes and that the old
 * onboarding page did not: `ensureFreshSession()` first, then `.select("id")`
 * and a row-count check. Without both, an expired token makes an RLS-guarded
 * update match zero rows and return NO error — the save appears to succeed and
 * silently never happens.
 */
export async function writeProfileFields(
  userId: string,
  draft: OnboardingDraft,
  touched: ReadonlySet<DraftField>,
): Promise<FinalizeResult> {
  const fields = draftToProfileFields(draft, touched);

  if (Object.keys(fields).length === 0) return { status: "saved" };

  // Guard the payload against the real column constraints before writing, so a
  // drift from the mobile mirror fails here rather than as a rejected write.
  const parsed = profileFieldsSchema.safeParse(fields);
  if (!parsed.success) {
    console.error("[onboarding] payload failed validation", parsed.error.issues);
    return {
      status: "error",
      message: "Some of your answers could not be saved. Please try again.",
    };
  }

  const fresh = await ensureFreshSession();
  if (!fresh) {
    return {
      status: "error",
      message: "Your session expired. Sign in again and we'll pick up where you left off.",
    };
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update(parsed.data)
      .eq("id", userId)
      .select("id");

    if (error) {
      console.error("[onboarding] profile update failed", error);
      return { status: "error", message: "We couldn't save your profile. Please try again." };
    }

    // RLS mismatch returns no error and no rows. Treat it as failure.
    if (!data || data.length === 0) {
      console.error("[onboarding] profile update matched no rows", { userId });
      return {
        status: "error",
        message: "We couldn't save your profile. Please sign in again and retry.",
      };
    }

    return { status: "saved" };
  } catch (err) {
    console.error("[onboarding] profile update threw", err);
    return { status: "error", message: "We couldn't save your profile. Please try again." };
  }
}

/**
 * Called by the final step. Writes if there is a session; otherwise reports
 * `deferred` so the UI can say "check your email" and leave the draft in place.
 */
export async function finalizeOnboarding(
  draft: OnboardingDraft,
  touched: ReadonlySet<DraftField>,
): Promise<FinalizeResult> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { status: "deferred" };
    const result = await writeProfileFields(user.id, draft, touched);
    // Only a real write counts. "deferred" means no session existed yet and
    // the draft is still sitting in localStorage — reporting that as a
    // completed profile would make the funnel claim conversions that have not
    // happened, and the retry would then count the same person again.
    if (result.status === "saved") {
      track("profile_completed", { source: "onboarding" });
    }
    return result;
  } catch (err) {
    console.error("[onboarding] finalize failed to resolve a session", err);
    // Treat an unreadable session as deferred rather than an error: the draft
    // survives and the flush will retry later.
    return { status: "deferred" };
  }
}
