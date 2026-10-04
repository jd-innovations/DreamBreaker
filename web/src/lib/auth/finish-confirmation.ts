// What happens once a signup is confirmed and a session exists — shared by the
// link (/auth/confirm) and the typed code (/auth/code, 2026-10-04) so both land
// people in the same place with the same answers saved.
//
// Moved verbatim from /auth/confirm; its comments there explain the why:
// flushing the onboarding draft collected before the account had a session,
// and routing on a profile read that never sends someone back to onboarding on
// a failed read.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDraft, clearDraft, draftBelongsTo } from "@/lib/onboarding/persistence";
import { writeProfileFields } from "@/lib/onboarding/finalize";
import { isProfileCompleteForEntry } from "@/lib/onboarding/completion";

export type FinishResult =
  | { ok: true; destination: "/dashboard" | "/onboarding" }
  | { ok: false; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function finishConfirmedSignup(supabase: SupabaseClient<any>): Promise<FinishResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Your email is confirmed, but we could not start a session. Try signing in." };
  }

  // Flush the draft collected before this account had a session.
  const stored = loadDraft();
  if (stored) {
    if (!draftBelongsTo(stored, user)) {
      // Someone else's abandoned draft on a shared browser. Discard it rather
      // than write it onto this account.
      clearDraft();
    } else {
      const written = await writeProfileFields(user.id, stored.draft, new Set(stored.touched));
      // On failure the draft stays put; OnboardingNudgeHost retries on the next
      // page load. Never block confirmation on it.
      if (written.status === "saved") clearDraft();
    }
  }

  // A failed or missing profile read resolves to the dashboard, never
  // onboarding: `fn_handle_new_user` always creates the row, so an absent one
  // means the READ failed.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, dupr, self_rating, skill_level")
    .eq("id", user.id)
    .maybeSingle();

  return {
    ok: true,
    destination: error || !profile || isProfileCompleteForEntry(profile) ? "/dashboard" : "/onboarding",
  };
}
