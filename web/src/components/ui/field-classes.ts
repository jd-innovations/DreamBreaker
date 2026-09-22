// Token classes for the native form controls that have no shared component.
//
// `Input` (./input.tsx) covers <input>. There is no shared Select or Textarea,
// so <select> and <textarea> take these — the exact tokens Input uses — so all
// three render as one family in light and dark mode: border-input,
// bg-background, the ring on keyboard focus.

export const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground sm:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * For the shared <Input> on these pages. Input sets text-sm (14px), which beats
 * globals.css's 16px rule for inputs — and iOS Safari zooms the page on focus
 * for any field under 16px. 16px on phones, 14px from `sm` up.
 */
export const INPUT_TEXT = "text-base sm:text-sm";

/** Same height as Input, so a select and an input side by side line up. */
export const SELECT = `${FIELD} h-10`;
