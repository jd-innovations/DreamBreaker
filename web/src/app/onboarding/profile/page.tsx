"use client";

// Step 1 — name, date of birth, gender, handedness.
//
// Folds three mobile screens (your-name, the DOB half of self-rating, gender)
// into one. Name is prefilled from the profile row `fn_handle_new_user` created
// at signup, but stays editable — a Google display name is not always what
// someone wants shown.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOnboarding } from "@/lib/onboarding/state";
import { GENDER_OPTIONS, HANDEDNESS_OPTIONS } from "@/lib/onboarding/options";
import { StepFrame } from "@/components/onboarding/step-frame";
import { OptionGrid } from "@/components/onboarding/option-grid";
import { DateOfBirthField } from "@/components/onboarding/date-of-birth-field";

const inputCls =
  "w-full h-12 rounded-xl bg-secondary border border-border px-4 text-sm outline-none focus:ring-2 focus:ring-ring focus:border-primary/50 transition-shadow";

export default function ProfileStep() {
  const { draft, update, hydrating, stampIdentity } = useOnboarding();
  const [prefilled, setPrefilled] = useState(false);

  // Prefill the name from the existing row, once, and only into fields the user
  // has not already filled — a resumed draft must win over the database.
  useEffect(() => {
    if (hydrating || prefilled) return;
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) { setPrefilled(true); return; }

        // Stamp identity so this draft can only ever be flushed onto this
        // account, even if someone else uses the browser later.
        stampIdentity({ userId: user.id, email: user.email });

        if (draft.firstName || draft.lastName) { setPrefilled(true); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;
        const full = profile?.full_name?.trim();
        if (full) {
          const [first, ...rest] = full.split(/\s+/);
          update("firstName", first ?? "");
          update("lastName", rest.join(" "));
        }
      } catch {
        // Prefill is a convenience. Failing it just means typing a name.
      } finally {
        if (!cancelled) setPrefilled(true);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrating, prefilled]);

  return (
    <StepFrame slug="profile">
      <div className="space-y-8">
        {/* Two columns only from lg — a phone stacks these. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">
              FIRST NAME
            </label>
            <input
              value={draft.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              autoComplete="given-name"
              data-testid="onboarding-first-name"
              className={inputCls}
            />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-1.5">
              LAST NAME
            </label>
            <input
              value={draft.lastName}
              onChange={(e) => update("lastName", e.target.value)}
              autoComplete="family-name"
              data-testid="onboarding-last-name"
              className={inputCls}
            />
          </div>
        </div>

        <DateOfBirthField
          value={draft.dateOfBirth}
          onChange={(iso) => update("dateOfBirth", iso)}
        />

        <div>
          <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2.5">
            GENDER <span className="normal-case tracking-normal opacity-70">(optional)</span>
          </label>
          <OptionGrid
            options={GENDER_OPTIONS}
            selected={draft.gender ? [draft.gender] : []}
            onSelect={(key) => update("gender", draft.gender === key ? null : key)}
            max={1}
            columns="two"
            testIdPrefix="onboarding-gender"
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground block mb-2.5">
            PLAYING HAND <span className="normal-case tracking-normal opacity-70">(optional)</span>
          </label>
          <OptionGrid
            options={HANDEDNESS_OPTIONS}
            selected={draft.handedness ? [draft.handedness] : []}
            onSelect={(key) => update("handedness", draft.handedness === key ? null : key)}
            max={1}
            testIdPrefix="onboarding-hand"
          />
        </div>
      </div>
    </StepFrame>
  );
}
