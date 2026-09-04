"use client";

import { useEffect } from "react";
import { initAnalytics, identifyUser, resetAnalytics, track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/client";

/**
 * Starts analytics, keeps identity in step with the session, and reports the
 * one sign-in the browser could not otherwise see (TODO1.1 4.2).
 *
 * Renders nothing. It exists as a component only because all of this has to
 * happen client-side: posthog-js touches window and localStorage, so importing
 * it into a server render would break the build.
 *
 * Mounted in the root layout rather than in PageShell — /dashboard and /admin
 * roll their own shells, and partial coverage produces funnels with holes that
 * read as user drop-off.
 */
export function AnalyticsProvider({
  posthogKey,
  posthogHost,
}: {
  posthogKey?: string;
  posthogHost?: string;
}) {
  // Passed down from the root layout rather than read here. A client component
  // that imports posthog-js cannot reliably read process.env — see
  // lib/analytics/env.ts for what that cost.
  useEffect(() => {
    initAnalytics({ key: posthogKey, host: posthogHost });
  }, [posthogKey, posthogHost]);

  // ── Identity ──────────────────────────────────────────────────────────────
  //
  // Before this, web called identifyUser in exactly one place: the password
  // sign-in handler. Everyone who arrived through Google or Apple stayed
  // anonymous forever, and so did anyone who simply returned with a live
  // session — so their events never joined the person record built from their
  // first visit.
  //
  // Driving it from auth state instead covers every path, including ones not
  // written yet, and mirrors what mobile does in its root layout.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user?.id) identifyUser(data.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) identifyUser(session.user.id);
      // Clearing on sign-out matters on a shared browser: PostHog's identity is
      // persisted and outlives the session, so without this the next person's
      // whole visit is attributed to whoever logged out.
      else resetAnalytics();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ── The OAuth success event ───────────────────────────────────────────────
  //
  // /auth/callback is a server route handler, so it cannot capture anything
  // itself; it appends ?auth_ok=<provider> and this reads it. Until now web
  // recorded auth_started and auth_failed for Google and Apple but never
  // auth_succeeded, so the funnel showed every federated sign-in as an
  // abandonment — the shape of a totally broken login.
  //
  // Read from window.location rather than useSearchParams on purpose: the hook
  // forces a Suspense boundary and opts the whole tree out of static rendering,
  // which is a heavy price for a value read once.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const provider = params.get("auth_ok");
    if (!provider) return;

    // Strip it first, and unconditionally. If a capture ever throws, the
    // parameter must still go — otherwise every refresh of this URL, and every
    // share of it, replays the event.
    params.delete("auth_ok");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );

    // Only ever the two the callback sets. A hand-typed value should not be
    // able to invent a funnel entry.
    if (provider !== "google" && provider !== "apple") return;

    track("auth_succeeded", { method: provider, source: "oauth_callback" });
  }, []);

  return null;
}
