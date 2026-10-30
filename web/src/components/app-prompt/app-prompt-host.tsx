"use client";

// "Get the app" prompt. Mounted once in the root layout, next to the
// onboarding nudge, and quiet unless every condition holds:
//
//   - the App Store switch is on (lib/app-store.ts, read by the root layout
//     and passed in as `appStoreId`);
//   - the page is the landing page or a tournament / play-event page, never a
//     task page (auth links, legal, checkout, Connect returns, onboarding);
//   - the visitor is on iPhone/iPad (bottom sheet) or desktop (lightbox).
//     Android sees nothing: there is no Android app;
//   - it was not dismissed in the last 30 days and has not shown this visit;
//   - a signed-in visitor has no push token. A token means the app is
//     installed, and a failed read counts as "don't know", so we stay quiet;
//   - nothing else has claimed the overlay (lib/overlay-lock.ts).

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { claimOverlay } from "@/lib/overlay-lock";
import { AppPrompt, type AppPromptSource, type AppPromptVariant } from "./app-prompt";

const DISMISS_KEY = "dbpb.appPrompt.dismissedUntil";
const SHOWN_THIS_VISIT_KEY = "dbpb.appPrompt.shownThisVisit";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const APPEAR_DELAY_MS = 2000;
const APPEAR_SCROLL_PX = 400;

// Allowlist, not a blocklist: a new route stays prompt-free until someone
// decides otherwise.
function sourceFor(pathname: string): AppPromptSource | null {
  if (pathname === "/") return "landing";
  const m = /^\/(tournaments|play)\/([^/]+)$/.exec(pathname);
  if (!m || m[2] === "create") return null;
  return m[1] === "tournaments" ? "tournament" : "play_event";
}

function variantForDevice(): AppPromptVariant | null {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return null;
  // iPadOS reports itself as a Mac; touch points give it away.
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return "sheet";
  if (/Mobi/i.test(ua)) return null;
  return "lightbox";
}

function isQuiet(): boolean {
  try {
    if (window.sessionStorage.getItem(SHOWN_THIS_VISIT_KEY)) return true;
    return Number(window.localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
  } catch {
    // Storage blocked: a dismissal could not be remembered, so never show.
    return true;
  }
}

function remember(storage: "local" | "session", key: string, value: string) {
  try {
    (storage === "session" ? window.sessionStorage : window.localStorage).setItem(key, value);
  } catch {
    /* nothing useful to do */
  }
}

async function appLikelyInstalled(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("push_tokens")
    .select("expo_push_token")
    .eq("user_id", user.id)
    .limit(1);
  if (error) return true;
  return (data?.length ?? 0) > 0;
}

export function AppPromptHost({ appStoreId }: { appStoreId: string | null }) {
  const pathname = usePathname();
  const [shown, setShown] = useState<{ source: AppPromptSource; variant: AppPromptVariant } | null>(null);

  useEffect(() => {
    if (!appStoreId) return;
    const source = sourceFor(pathname);
    if (!source) return;
    const variant = variantForDevice();
    if (!variant || isQuiet()) return;

    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const appear = () => {
      if (done) return;
      done = true;
      if (!claimOverlay("app-prompt")) return;
      remember("session", SHOWN_THIS_VISIT_KEY, "1");
      setShown({ source, variant });
      track("app_prompt_shown", { source, prompt_variant: variant });
    };
    const onScroll = () => {
      if (window.scrollY >= APPEAR_SCROLL_PX) appear();
    };

    (async () => {
      try {
        if (await appLikelyInstalled()) return;
        if (done) return;
        timer = setTimeout(appear, APPEAR_DELAY_MS);
        window.addEventListener("scroll", onScroll, { passive: true });
      } catch {
        // Never let this break the page it is mounted on.
      }
    })();

    return () => {
      done = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname, appStoreId]);

  const close = useCallback(
    (event: "app_prompt_dismissed" | "app_prompt_clicked") => {
      if (!shown) return;
      remember("local", DISMISS_KEY, String(Date.now() + DISMISS_MS));
      track(event, { source: shown.source, prompt_variant: shown.variant });
      setShown(null);
    },
    [shown],
  );

  if (!shown) return null;
  return (
    <AppPrompt
      source={shown.source}
      variant={shown.variant}
      onDismiss={() => close("app_prompt_dismissed")}
      onGet={() => close("app_prompt_clicked")}
    />
  );
}
