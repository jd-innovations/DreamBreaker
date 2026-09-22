// Token classes for the native form controls that have no shared component.
//
// `Input` (./input.tsx) covers <input>. There is no shared Select or Textarea,
// so <select> and <textarea> take these — the exact tokens Input uses — so all
// three render as one family in light and dark mode: border-input,
// bg-background, the ring on keyboard focus.

export const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Same height as Input, so a select and an input side by side line up. */
export const SELECT = `${FIELD} h-10`;
