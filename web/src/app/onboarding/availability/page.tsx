"use client";

// Step 5 — availability windows.
//
// These are stored as a joined string of LABELS in `profiles.availability`
// ("Weekdays, Evenings"), matching how edit-profile writes it. The jsonb
// `availability_schedule` grid is deliberately untouched — the shapes do not map
// onto each other without inventing a conversion.

import { useOnboarding } from "@/lib/onboarding/state";
import { AVAILABILITY_OPTIONS } from "@/lib/onboarding/options";
import { StepFrame } from "@/components/onboarding/step-frame";
import { OptionGrid } from "@/components/onboarding/option-grid";

export default function AvailabilityStep() {
  const { draft, toggleInList } = useOnboarding();

  return (
    <StepFrame slug="availability">
      <OptionGrid
        options={AVAILABILITY_OPTIONS}
        selected={draft.availability}
        onSelect={(key) => toggleInList("availability", key)}
        testIdPrefix="onboarding-availability"
      />
      <p className="text-xs text-muted-foreground mt-6">
        Pick as many as you like. You can refine this later in your profile.
      </p>
    </StepFrame>
  );
}
