// Next.js server instrumentation hook.
//
// Lives in src/ because this project uses a src directory. Next accepts either
// location, but the Sentry server SDK was silently never initialising and this
// was the first suspect -- keeping the file beside the app it instruments
// removes the ambiguity rather than reasoning about it.
//
// onRequestError is what makes server-side render and route-handler failures
// visible; without it, only client errors would ever reach Sentry and the
// payment paths — which are all server-side — would stay dark.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
