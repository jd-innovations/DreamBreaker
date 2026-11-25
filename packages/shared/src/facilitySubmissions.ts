// Player court submissions — the rules both apps share (2026-11-25).
//
// The database is the authority (private.facility_submission_clean in
// supabase/migrations/20261125120000_facility_submissions.sql); this mirrors
// its field list and limits so the web form and the mobile sheets can say them
// up front, and turns its short error codes into one set of plain words.
// Mobile wording is the source (COPY_ALIGNMENT.md); change it here and both
// apps follow.

export type FieldKind = "text" | "longtext" | "state" | "zip" | "phone" | "url" | "int" | "bool";

export type FieldDef = { key: string; label: string; kind: FieldKind; max?: number };

export const SUBMISSION_FIELDS: FieldDef[] = [
  { key: "name", label: "Name", kind: "text", max: 120 },
  { key: "address", label: "Street address", kind: "text", max: 200 },
  { key: "city", label: "City", kind: "text", max: 80 },
  { key: "state", label: "State", kind: "state" },
  { key: "postal_code", label: "ZIP", kind: "zip" },
  { key: "court_count", label: "Total courts", kind: "int" },
  { key: "outdoor_courts", label: "Outdoor courts", kind: "int" },
  { key: "indoor_courts", label: "Indoor courts", kind: "int" },
  { key: "surface_type", label: "Surface", kind: "text", max: 40 },
  { key: "hours_summary", label: "Hours", kind: "text", max: 300 },
  { key: "phone", label: "Phone", kind: "phone" },
  { key: "website", label: "Website", kind: "url", max: 300 },
  { key: "description", label: "Description", kind: "longtext", max: 1000 },
  { key: "public_access", label: "Open to the public", kind: "bool" },
  { key: "lighting", label: "Lights", kind: "bool" },
  { key: "restrooms", label: "Restrooms", kind: "bool" },
  { key: "water", label: "Water", kind: "bool" },
  { key: "parking", label: "Parking", kind: "bool" },
  { key: "open_play_available", label: "Open play", kind: "bool" },
  { key: "reservation_required", label: "Reservation required", kind: "bool" },
  { key: "membership_required", label: "Membership required", kind: "bool" },
];

export const FIELD_LABELS: Record<string, string> = Object.fromEntries([
  ...SUBMISSION_FIELDS.map((f) => [f.key, f.label]),
  ["latitude", "Map pin (latitude)"],
  ["longitude", "Map pin (longitude)"],
]);

export type SubmissionKind = "new" | "edit";

/** The fields players most often know and correct: the mobile Suggest-an-Edit sheet. */
export const QUICK_EDIT_KEYS = [
  "court_count", "outdoor_courts", "indoor_courts", "lighting", "public_access",
  "hours_summary", "phone", "website",
] as const;

/** Required for a new court, besides the map pin. */
export const NEW_COURT_REQUIRED = ["name", "city", "state"] as const;

/** The database raises short codes ("too_long:name"); say them in words. */
export function submissionErrorMessage(raw: string): string {
  const m = raw.match(/(sign_in_required|too_many_pending|daily_limit|no_changes|already_pending|missing_required|facility_not_found|payload_too_large|unknown_field|invalid_value|too_long|too_short)(?::([a-z_]+))?/);
  const label = (k?: string) => (k && FIELD_LABELS[k]) || (k === "coordinates" ? "Map pin" : k === "note" ? "Note" : "A field");
  switch (m?.[1]) {
    case "sign_in_required": return "Please sign in to send a submission.";
    case "too_many_pending": return "You have 10 submissions waiting for review. Please wait for some to be reviewed first.";
    case "daily_limit": return "You have reached today's limit of 20 submissions. Please try again tomorrow.";
    case "no_changes": return "Nothing changed. Edit at least one field or add a note.";
    case "already_pending": return "You already have an update for this court waiting for review.";
    case "missing_required": return "Name, city, state and the map pin are required.";
    case "facility_not_found": return "That court no longer exists.";
    case "payload_too_large": return "That submission is too long.";
    case "too_long": return `${label(m[2])} is too long.`;
    case "too_short": return `${label(m[2])} is too short.`;
    case "invalid_value":
      if (m[2] === "court_count") return "Indoor plus outdoor courts can't be more than the total.";
      if (m[2] === "website") return "Website must start with http:// or https://.";
      return `${label(m[2])} doesn't look right.`;
    default: return "Something went wrong. Please try again.";
  }
}
