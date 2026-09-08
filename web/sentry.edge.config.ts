// Edge runtime (middleware and edge routes). Same options as the Node runtime;
// the scrubber is deliberately dependency-free so it runs unchanged here.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/observability/scrub";

Sentry.init(sharedSentryOptions);
