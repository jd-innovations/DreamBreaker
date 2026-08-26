"use client";

// Step 4 — playing style, capped at PLAYING_STYLE_MAX.
//
// Only the first selection reaches the database: `profiles.play_style` is a
// single free-text tag. The cap and the extra choices exist because mobile
// collects them the same way; DATA_GAPS.md records the tradeoff.

import { useOnboarding } from "@/lib/onboarding/state";
import { PLAYING_STYLE_OPTIONS, PLAYING_STYLE_MAX } from "@/lib/onboarding/options";
import { StepFrame } from "@/components/onboarding/step-frame";
import { OptionGrid } from "@/components/onboarding/option-grid";

export default function StyleStep() {
  const { draft, toggleInList } = useOnboarding();
  const remaining = PLAYING_STYLE_MAX - draft.playingStyle.length;

  return (
    <StepFrame slug="style">
      <OptionGrid
        options={PLAYING_STYLE_OPTIONS}
        selected={draft.playingStyle}
        onSelect={(key) => toggleInList("playingStyle", key, PLAYING_STYLE_MAX)}
        max={PLAYING_STYLE_MAX}
        testIdPrefix="onboarding-style"
      />
      <p className="text-xs text-muted-foreground mt-6" aria-live="polite">
        {remaining > 0
          ? `${remaining} more ${remaining === 1 ? "choice" : "choices"} available.`
          : "That's three — deselect one to change your picks."}
      </p>
    </StepFrame>
  );
}
