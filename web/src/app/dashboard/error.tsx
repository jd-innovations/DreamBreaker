"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-foreground">
      <div className="font-mono text-[11px] tracking-[0.3em] text-destructive mb-3">DASHBOARD ERROR</div>
      <h2 className="font-display text-2xl tracking-wide mb-4">Something went wrong</h2>
      <pre className="text-xs bg-secondary p-4 rounded-xl max-w-lg w-full overflow-auto mb-6 text-left">
        {error.message || "Unknown error"}
      </pre>
      <button
        onClick={reset}
        className="rounded-full h-11 px-8 bg-primary text-primary-foreground font-display tracking-[0.2em] text-sm"
      >
        TRY AGAIN
      </button>
    </div>
  );
}
