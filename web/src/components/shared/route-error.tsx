"use client";

// Shared body for route-level `error.tsx` boundaries (TODO 1.1 item 6.3).
//
// Before this the app had exactly one route boundary (`dashboard/error.tsx`)
// and a root `global-error.tsx`. Anything else that threw during render fell
// all the way through to the global boundary, which **replaces the entire
// document** — nav, shell and all. That is the right response to a broken root
// layout and much too heavy for "the tournaments query threw": the user loses
// the whole page instead of the one section that failed.
//
// The prop contract is verified against the installed Next 16 docs
// (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`),
// not from memory:
//
//   unstable_retry()  re-fetches and re-renders the boundary's children. This
//                     is what you want for a failed data load, and the docs say
//                     to prefer it "in most cases".
//   reset()           still exists, but only clears the error state and
//                     re-renders *without* re-fetching. For a fetch failure it
//                     re-renders the same failure, so the button appears to do
//                     nothing.
//   error.message     in production, a Server Component error is replaced with
//                     a generic string to avoid leaking details. Showing it is
//                     both unhelpful and, for Client Component errors, leaky.
//   error.digest      a hash, not a message. Safe to show, and the only thing
//                     that lets support tie a user's report to a server log.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function RouteError({
  error,
  retry,
  title = "Something went wrong",
  description = "This section failed to load. The error has been reported.",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
      <div className="font-mono text-[11px] tracking-[0.3em] text-destructive mb-3">ERROR</div>
      <h2 className="font-display text-3xl tracking-wide mb-3">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>

      {error.digest && (
        <p className="font-mono text-[11px] text-muted-foreground/60 mb-6">{error.digest}</p>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => retry()}
          className="h-11 px-8 rounded-full bg-primary text-primary-foreground font-display tracking-[0.2em] text-sm hover:bg-primary/90 transition-colors"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
