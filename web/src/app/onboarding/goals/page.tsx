"use client";

// Step 6 — intent, and the write.
//
// This is where finalizeOnboarding runs. Two outcomes, and the difference is
// not an error:
//
//   saved     a session existed (OAuth, or a confirmed user resuming) and the
//             profile was written and verified
//   deferred  no session yet, which is the NORMAL email-signup case while
//             confirmation is pending. The draft stays in localStorage and the
//             nudge host flushes it once the user confirms.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOnboarding } from "@/lib/onboarding/state";
import { INTENT_OPTIONS } from "@/lib/onboarding/options";
import { finalizeOnboarding } from "@/lib/onboarding/finalize";
import { DONE_PATH } from "@/lib/onboarding/steps";
import { StepFrame } from "@/components/onboarding/step-frame";
import { OptionGrid } from "@/components/onboarding/option-grid";

export default function GoalsStep() {
  const router = useRouter();
  const { draft, touched, toggleInList, reset } = useOnboarding();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await finalizeOnboarding(draft, touched);

      if (result.status === "error") {
        toast.error(result.message);
        return false; // stay put; the draft is intact and they can retry
      }

      if (result.status === "saved") {
        // Only clear once it is definitely persisted. A deferred draft must
        // survive — it is the only copy of their answers.
        reset();
        router.push(`${DONE_PATH}?status=saved`);
      } else {
        router.push(`${DONE_PATH}?status=deferred`);
      }
      return false; // navigation handled here, not by StepFrame
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepFrame slug="goals" onContinue={submit} continueLabel="FINISH" busy={busy}>
      <OptionGrid
        options={INTENT_OPTIONS}
        selected={draft.intent}
        onSelect={(key) => toggleInList("intent", key)}
        testIdPrefix="onboarding-intent"
      />
    </StepFrame>
  );
}
