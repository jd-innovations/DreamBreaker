// Player submissions for the court directory (Phase 2, 2026-11-25). Field
// definitions and error wording live in @shared/facilitySubmissions (shared
// with mobile); this file adds the web RPC helper. The database is the
// authority on every rule (private.facility_submission_clean).

import type { SupabaseClient } from "@supabase/supabase-js";

export {
  SUBMISSION_FIELDS, FIELD_LABELS, QUICK_EDIT_KEYS, NEW_COURT_REQUIRED, submissionErrorMessage,
  type FieldKind, type FieldDef, type SubmissionKind,
} from "@shared/facilitySubmissions";

/**
 * Untyped RPC call. These functions are newer than the generated
 * @shared/database.types; regenerate the types after the migration is applied
 * and this can become a typed supabase.rpc() call.
 */
export async function callRpc<T>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const { data, error } = await client.rpc(fn, args);
  return { data: (data ?? null) as T | null, error };
}
