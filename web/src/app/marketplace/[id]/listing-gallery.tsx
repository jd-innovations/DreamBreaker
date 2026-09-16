"use client";

import { useState } from "react";
import Image from "next/image";

// The only interactive part of the listing page, so the only part that ships
// JavaScript. Everything else is server-rendered — this page's whole purpose
// is being opened from a pasted link by someone who may not have the app, on
// an unknown connection, so the text and price should paint without waiting
// for a bundle.
//
// Built same-day with plain <img> tags, because next.config.ts's
// remotePatterns didn't cover the Supabase storage host these photos are
// served from — WEB_PERFORMANCE_AUDIT.md F2. That gap is now closed
// (Phase 1), so this file converts along with the rest of the sweep rather
// than being left as an exception just because it's new.

type Photo = { id: string; url: string };

export function ListingGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = photos[active] ?? photos[0];

  if (!current) {
    return (
      <div className="aspect-square w-full rounded-2xl border border-border bg-muted/40 flex items-center justify-center">
        <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          No photos
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* `relative` added for `fill`; the plain <img> version didn't need
          positioning since it filled the box via h-full/w-full instead. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/40">
        {/* The single largest image on the page a stranger opens from a
            pasted link — priority, not lazy, and sized against the actual
            layout (this column is capped at half of max-w-5xl on desktop). */}
        <Image
          src={current.url}
          alt={title}
          fill
          priority
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover"
        />
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              aria-current={i === active}
              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border transition ${
                i === active
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border opacity-70 hover:opacity-100"
              }`}
            >
              <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
