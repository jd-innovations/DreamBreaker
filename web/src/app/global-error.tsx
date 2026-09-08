"use client";

// Root error boundary. There was none before this — an uncaught render error
// showed Next's default error page and was reported to nobody, which is the
// single largest blind spot crash reporting is meant to close.
//
// global-error.tsx replaces the entire document when it fires, so it must render
// its own <html>/<body>. It only catches errors in the root layout and below
// that no nested boundary handled; route-level error.tsx files still take
// precedence where they exist.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  // Next 16 renamed this from `reset`. It re-renders inside a Transition, so
  // Client Component state outside the boundary survives the retry.
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07091A",
          color: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.7, margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            The error has been reported. Try again, and if it keeps happening please contact support.
          </p>
          {/* The digest is Next's own error id and is safe to show: it is a hash,
              not a message, so it cannot leak details to the user while still
              letting support tie a report to a specific server-side failure. */}
          {error.digest && (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", opacity: 0.4 }}>
              {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1.5rem" }}>
            <button
              onClick={() => unstable_retry()}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "9999px",
                border: "none",
                background: "#f5f5f5",
                color: "#07091A",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A plain <a>, not next/link, on purpose. This boundary replaces the
                root layout because something failed catastrophically; a client-side
                navigation keeps the same broken JS context alive, whereas a full
                document load rebuilds it. "Try again" above is the soft retry —
                this is the hard one. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "9999px",
                border: "1px solid rgba(245,245,245,0.2)",
                color: "#f5f5f5",
                textDecoration: "none",
                fontSize: "0.875rem",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
