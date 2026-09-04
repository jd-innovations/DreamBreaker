// Normalized input for the central "Add to Calendar" utility. Business
// screens build one of these from their own domain data — they never touch
// expo-calendar directly (see calendarEvents.native.ts / calendarEvents.web.ts).
export type CalendarEventInput = {
  title: string;
  startDate: Date;
  // Omit when the domain has no reliable end/duration (see calendarEvents.native.ts
  // for what happens when this is left out — the OS applies its own default,
  // nothing here invents one).
  endDate?: Date;
  // All-day events (e.g. a tournament with only a calendar date, no time-of-day)
  // sidestep timezone ambiguity entirely rather than guessing a time.
  allDay?: boolean;
  location?: string;
  // Plain text. The canonical pickleballapp link (if any) is folded into this
  // by the caller-facing helpers below rather than the raw `url` field, since
  // expo-calendar's `url` is iOS-only — notes is the only field that reliably
  // carries a tappable link cross-platform.
  notes?: string;
};

export type AddToCalendarOutcome =
  // iOS: the user saved the event in the native editor.
  | 'saved'
  // iOS: the user canceled/deleted without saving. Not an error.
  | 'canceled'
  // Android: expo-calendar cannot distinguish saved/canceled/deleted here —
  // the OS UI was presented and returned, but the outcome is unconfirmed.
  | 'unknown'
  // Web (or any platform without a native calendar UI): no-op by design.
  | 'unsupported'
  | 'error';

export type AddToCalendarResult = {
  outcome: AddToCalendarOutcome;
  errorMessage?: string;
};

// Shared, platform-agnostic helper: folds a canonical pickleballapp link into
// a notes string. expo-calendar's dedicated `url` field is iOS-only, so the
// link is embedded in `notes` instead -- native calendar apps on both
// platforms auto-linkify a bare https URL inside an event's notes/description,
// giving the "tap the link to return to pickleballapp" behavior on iOS and
// Android alike, not just iOS.
//
// Lives in this file (not calendarEvents.ts) deliberately: this file has no
// .native/.web platform-specific twin, so Metro always resolves it at
// runtime. calendarEvents.ts is a TypeScript-only resolution fallback --
// Metro's platform-extension resolution picks calendarEvents.native.ts /
// calendarEvents.web.ts directly and never actually loads calendarEvents.ts,
// so anything defined only there (as withLink previously was) silently
// doesn't exist at runtime even though tsc sees it fine.
export function withLink(notes: string | undefined, url: string | undefined): string | undefined {
  const parts = [notes?.trim(), url?.trim()].filter((p): p is string => !!p);
  return parts.length ? parts.join('\n\n') : undefined;
}
