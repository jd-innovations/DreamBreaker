import type { StatusTone } from "@shared/status";

// Web's half of the status contract. packages/shared/src/status.ts decides what
// a status MEANS (label + tone); this file decides what a tone LOOKS like here.
//
// The split exists so the shared module never contains a Tailwind class —
// mobile imports it too, and a `bg-orange-400` in there would be web styling in
// a file React Native reads.
//
// Replaces two hand-maintained maps that had drifted: admin/page.tsx and
// director/page.tsx carried identical labels and DIFFERENT colours for half the
// tournament statuses, including `completed` as grey on one page and green on
// the other.

/** Dot colour for the small status indicators in admin and director lists. */
export const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-blue-400",
  positive: "bg-green-500",
  attention: "bg-amber-400",
  critical: "bg-red-400",
  muted: "bg-muted-foreground",
};

/** Pill/badge styling where a status needs more presence than a dot. */
export const STATUS_BADGE_CLASS: Record<StatusTone, string> = {
  neutral: "text-muted-foreground border-border",
  info: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  positive: "text-green-500 border-green-500/40 bg-green-500/10",
  attention: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  critical: "text-red-400 border-red-400/40 bg-red-400/10",
  muted: "text-muted-foreground border-border bg-muted/40",
};
