"use client";

// Step 2 — skill band.
//
// The band is translated into two columns by transform.ts: `skill_level` (a
// CHECK-constrained band) and `self_rating` (a numeric midpoint the partner
// finder and PAR both read when `dupr` is null).
//
// Note what is NOT here: a DUPR input. The old onboarding page had one and wrote
// it into `profiles.dupr` — the VERIFIED rating column. Mobile never asks for
// it, and a self-reported number does not belong there.

import { useOnboarding } from "@/lib/onboarding/state";
import { SELF_RATING_OPTIONS } from "@/lib/onboarding/options";
import { StepFrame } from "@/components/onboarding/step-frame";
import { OptionGrid } from "@/components/onboarding/option-grid";

export default function RatingStep() {
  const { draft, update } = useOnboarding();

  return (
    <StepFrame slug="rating">
      <OptionGrid
        options={SELF_RATING_OPTIONS}
        selected={draft.selfRating ? [draft.selfRating] : []}
        onSelect={(key) => update("selfRating", key)}
        max={1}
        testIdPrefix="level"
      />
      <p className="text-xs text-muted-foreground mt-6">
        Not sure? Pick the closest — your rating adjusts as you log games.
      </p>
    </StepFrame>
  );
}
