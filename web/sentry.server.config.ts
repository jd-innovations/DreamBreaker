// Node runtime. Loaded by instrumentation.ts.
// All scrubbing and release/environment tagging lives in the shared options —
// see src/lib/observability/scrub.ts for why the defaults are not safe here.
import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/observability/scrub";

Sentry.init(sharedSentryOptions);
