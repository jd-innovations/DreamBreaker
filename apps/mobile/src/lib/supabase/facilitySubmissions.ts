// Player court submissions from the app (Phase 4, 2026-11-25).
//
// Same database functions the web /courts/suggest form uses, so the same
// validation, limits and admin review queue (/admin/facility-submissions)
// apply. Nothing here writes to `facilities`: an admin approves first.

import { supabase } from '@/lib/supabase';
import { submissionErrorMessage, type SubmissionKind } from '@shared/facilitySubmissions';

export type DuplicateCandidate = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  distance_meters: number;
};

// These RPCs are newer than the generated database types; call them untyped.
// Called as a method on the client: a detached supabase.rpc loses `this`.
const rpc = (fn: string, args: Record<string, unknown>) => (supabase as unknown as {
  rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}).rpc(fn, args) as Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/** Throws an Error whose message is already in plain words. */
export async function submitFacilitySubmission(input: {
  kind: SubmissionKind;
  facilityId?: string | null;
  proposed: Record<string, unknown>;
  note?: string | null;
}): Promise<string> {
  const { data, error } = await rpc('submit_facility_submission', {
    p_kind: input.kind,
    p_facility_id: input.facilityId ?? null,
    p_proposed: input.proposed,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(submissionErrorMessage(error.message));
  return data as string;
}

/** Listed courts near a pin, name matches first — the "is it one of these?" step. */
export async function fetchDuplicateCandidates(
  name: string,
  latitude: number,
  longitude: number,
  radiusMeters = 300,
): Promise<DuplicateCandidate[]> {
  const { data, error } = await rpc('facility_duplicate_candidates', {
    p_name: name,
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_meters: radiusMeters,
  });
  if (error) return [];
  return (data ?? []) as DuplicateCandidate[];
}
