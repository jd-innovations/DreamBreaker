// Next.js server instrumentation hook.
//
// onRequestError is what makes server-side render and route-handler failures
// visible; without it, only client errors would ever reach Sentry and the
// payment paths — which are all server-side — would stay dark.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
