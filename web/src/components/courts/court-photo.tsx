"use client";

// A facility photo that falls back when it fails to load. Google photo
// references expire, and our facility-photo proxy then answers 502; without
// this the page shows a broken image instead of the placeholder.

import { useEffect, useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";

export function CourtPhoto({
  src, alt, className, placeholder = "icon", loading = "lazy",
}: {
  src: string | null;
  alt: string;
  className?: string;
  /** "icon" shows a pin on a tinted box; "hide" renders nothing. */
  placeholder?: "icon" | "hide";
  loading?: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before React hydrates and attaches
  // onError; catch that case by checking the element once mounted.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (!src || failed) {
    return placeholder === "hide" ? null : (
      <div className={`flex items-center justify-center bg-secondary text-muted-foreground ${className ?? ""}`}>
        <MapPin size={22} />
      </div>
    );
  }
  return (
    // Served through our facility-photo edge function, a host next/image is
    // not configured for; a plain img with an error fallback.
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt={alt} loading={loading} onError={() => setFailed(true)} className={className} />
  );
}
