import { supabase } from '@/lib/supabase';

// Facility Marketplace Phase 1 — applying to manage a venue.
//
// The application names a facility and carries proposed corrections. Nothing
// reaches `facilities` until an admin approves, so this module only ever writes
// to facility_manager_applications via the RPCs.

export type FacilityApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

// The subset of facility columns an applicant may propose. Deliberately narrow:
// the server whitelists the same set, and anything else in the payload is
// discarded rather than rejected, so sending more would silently do nothing.
export type ProposedFacility = {
  name?: string;
  address?: string;
  address_line_2?: string | null;
  city?: string;
  state?: string;
  postal_code?: string | null;
  country?: string;
  latitude?: number;
  longitude?: number;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
  court_count?: number;
  indoor_courts?: number;
  outdoor_courts?: number;
  surface_type?: string | null;
  lighting?: boolean;
  restrooms?: boolean;
  water?: boolean;
  parking?: boolean;
  public_access?: boolean;
  membership_required?: boolean;
  bookable_by_public?: boolean;
  hours_summary?: string | null;
  amenities?: string[];
};

export type FacilityApplication = {
  id: string;
  facilityId: string | null;
  status: FacilityApplicationStatus;
  proposed: ProposedFacility;
  applicantNote: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type DuplicateCandidate = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  distanceMeters: number;
};

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please sign in to apply.',
  facility_or_name_required: 'Choose a facility, or give the new one a name.',
  facility_not_found: 'That facility no longer exists.',
  facility_already_managed: 'This facility already has a manager. Contact support if that is wrong.',
  application_already_pending: 'You already have an application pending for this facility.',
  application_not_found: 'That application no longer exists.',
  application_not_pending: 'That application has already been reviewed.',
  not_your_application: 'That application belongs to someone else.',
  admin_only: 'Only an admin can do that.',
  // Surfaced verbatim because it is the one the form can actually provoke:
  // court_count must be at least indoor + outdoor.
  check_court_subtotals: 'Total courts must be at least the indoor and outdoor counts added together.',
};

// Supabase rejects with a PostgrestError — a plain object, not an Error — so
// `instanceof Error` would miss the message.
export function facilityApplicationError(err: unknown): string {
  const raw =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  for (const [code, text] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return text;
  }
  return raw || 'Something went wrong. Please try again.';
}

/** Only the keys that actually changed, so the review shows edits not a full copy. */
export function diffProposed(
  original: Record<string, unknown>,
  edited: ProposedFacility,
): ProposedFacility {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(edited)) {
    const before = original[k];
    // Arrays compare by content; everything else by value, with null and ''
    // treated as the same "empty" so an untouched blank field is not an edit.
    const same = Array.isArray(v) && Array.isArray(before)
      ? JSON.stringify(v) === JSON.stringify(before)
      : (before ?? '') === (v ?? '');
    if (!same) out[k] = v;
  }
  return out as ProposedFacility;
}

export async function applyToManageFacility(args: {
  facilityId: string | null;
  proposed: ProposedFacility;
  note: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('apply_to_manage_facility', {
    // null is a real, supported argument here — it is the "this venue is not
    // listed yet" case. The generated types spell a uuid parameter as a plain
    // string, so the nullability has to be asserted rather than inferred.
    p_facility_id: args.facilityId as unknown as string,
    p_proposed: args.proposed as never,
    p_note: args.note.trim() || undefined,
  });
  if (error) return { ok: false, message: facilityApplicationError(error) };
  return { ok: true, id: data as unknown as string };
}

export async function withdrawFacilityApplication(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('withdraw_facility_manager_application', { p_id: id });
  return error ? { ok: false, message: facilityApplicationError(error) } : { ok: true };
}

/** The caller's own applications. RLS restricts this to them. */
export async function fetchMyFacilityApplications(): Promise<FacilityApplication[]> {
  const { data, error } = await supabase
    .from('facility_manager_applications')
    .select('id, facility_id, status, proposed, applicant_note, review_note, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id,
    facilityId: r.facility_id,
    status: r.status as FacilityApplicationStatus,
    proposed: (r.proposed ?? {}) as ProposedFacility,
    applicantNote: r.applicant_note,
    reviewNote: r.review_note,
    createdAt: r.created_at,
  }));
}

/**
 * Nearby facilities with a similar name, for the "not listed" path.
 *
 * 178 of 194 rows came from Google Places, so the venue a user is about to add
 * is usually already there under a slightly different name. Two rows for one
 * venue eventually means two owners and two payout destinations.
 */
export async function findDuplicateCandidates(
  name: string,
  latitude: number,
  longitude: number,
): Promise<DuplicateCandidate[]> {
  const { data, error } = await supabase.rpc('facility_duplicate_candidates', {
    p_name: name,
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) return [];
  return (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    address: r.address,
    city: r.city,
    distanceMeters: r.distance_meters,
  }));
}
