"use client";

// Mounted once in the root layout. Does two jobs, and the first is the more
// important one.
//
// **1. Flushes a deferred draft.** Email signup has no session while onboarding
// runs (`enable_confirmations` is on), so the answers sit in localStorage until
// a session exists. Clicking the confirmation link produces exactly that, on
// some later page load — which is the moment this catches. Without this, the
// email path collects answers and never writes them.
//
// **2. Nudges thin profiles.** Only when there is nothing to flush.
//
// It stays silent unless it is sure: a failed profile read does nothing at all,
// because a nag based on a read that did not happen is worse than no nag.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { loadDraft, clearDraft, draftBelongsTo } from "@/lib/onboarding/persistence";
import { writeProfileFields } from "@/lib/onboarding/finalize";
import { needsProfileEnrichment, type CompletenessFields } from "@/lib/onboarding/completion";
import { OnboardingNudge } from "./onboarding-nudge";

const SNOOZE_KEY = "dbpb.onboarding.nudge.snoozedUntil";
const SHOWN_KEY = "dbpb.onboarding.nudge.shownCount";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIFETIME_SHOWS = 3;
// Let the page settle before interrupting.
const APPEAR_DELAY_MS = 1500;

// Routes where an overlay would be wrong: the flow itself, anything
// unauthenticated, and legal pages someone may have been linked to directly.
const SUPPRESSED_PREFIXES = ["/onboarding", "/auth", "/legal", "/api", "/claim"];

function isSuppressed(pathname: string): boolean {
  if (pathname === "/") return true;
  return SUPPRESSED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function readNumber(key: string): number {
  try {
    const v = window.localStorage.getItem(key);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
}

function isSnoozed(): boolean {
  try {
    if (readNumber(SNOOZE_KEY) > Date.now()) return true;
    return readNumber(SHOWN_KEY) >= MAX_LIFETIME_SHOWS;
  } catch {
    // Storage blocked — better to stay quiet than to nag on every page.
    return true;
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    window.localStorage.setItem(SHOWN_KEY, String(readNumber(SHOWN_KEY) + 1));
  } catch {
    /* nothing useful to do */
  }
}

// Rough completeness for the meter only. Never used for routing — see
// completion.ts on why those are separate questions.
const METER_FIELDS: ((p: CompletenessFields) => boolean)[] = [
  (p) => !!p.full_name,
  (p) => !!(p.dupr || p.self_rating || p.skill_level),
  (p) => !!p.gender,
  (p) => !!p.hand,
  (p) => !!p.play_style,
  (p) => !!p.availability,
  (p) => !!p.onboarding_intent?.length,
  (p) => !!p.location_city,
];

function completionPercent(profile: CompletenessFields): number {
  const done = METER_FIELDS.filter((f) => f(profile)).length;
  return Math.round((done / METER_FIELDS.length) * 100);
}

export function OnboardingNudgeHost() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [percent, setPercent] = useState(0);

  const dismiss = useCallback(() => {
    snooze();
    setVisible(false);
  }, []);

  useEffect(() => {
    if (isSuppressed(pathname)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // ── Flush first ────────────────────────────────────────────────────
        const stored = loadDraft();
        if (stored) {
          if (!draftBelongsTo(stored, user)) {
            // Someone else's abandoned draft on a shared browser. Discard it
            // rather than write it onto this account.
            clearDraft();
          } else {
            const result = await writeProfileFields(
              user.id,
              stored.draft,
              new Set(stored.touched),
            );
            if (result.status === "saved") {
              clearDraft();
              if (!cancelled) toast.success("Your profile is all set.");
            }
            // On error the draft stays put and the next page load retries.
            return;
          }
        }

        // ── Otherwise consider nudging ─────────────────────────────────────
        if (isSnoozed()) return;

        const { data: profile, error } = await supabase
          .from("profiles")
          .select(
            "full_name, dupr, self_rating, skill_level, gender, hand, play_style, availability, onboarding_intent, location_city",
          )
          .eq("id", user.id)
          .maybeSingle();

        // A read that failed is not evidence of a thin profile.
        if (error || !profile || cancelled) return;
        if (!needsProfileEnrichment(profile)) return;

        setPercent(completionPercent(profile));
        timer = setTimeout(() => { if (!cancelled) setVisible(true); }, APPEAR_DELAY_MS);
      } catch {
        // Never let this break the page it is mounted on.
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  if (!visible) return null;
  return <OnboardingNudge onDismiss={dismiss} completionPercent={percent} />;
}
