"use client";

import { RouteError } from "@/components/shared/route-error";

export default function TournamentsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <RouteError error={error} retry={unstable_retry} title="Couldn't load tournaments" />;
}
