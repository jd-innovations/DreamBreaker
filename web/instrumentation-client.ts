// Browser runtime. Next.js loads this automatically for client-side code.
//
// No Replay or Session Tracking integration: replay records the DOM, which on
// this app means chat messages, support-ticket text and payment forms. That is
// the exact data 4.2 forbids collecting, and no scrubber applied afterwards is
// as reliable as never recording it.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/observability/scrub";

Sentry.init(sharedSentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
