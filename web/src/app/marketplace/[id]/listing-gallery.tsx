"use client";

import { useState } from "react";

// The only interactive part of the listing page, so the only part that ships
// JavaScript. Everything else is server-rendered — this page's whole purpose
// is being opened from a pasted link by someone who may not have the app, on
// an unknown connection, so the text and price should paint without waiting
// for a bundle.

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
      <div className="aspect-square w-full overflow-hidden rounded-2xl border border-border bg-muted/40">
        {/* Plain <img>: these are Supabase storage URLs on a host next/image is
            not configured for, and adding a remote pattern for user-uploaded
            content is a decision for its own change, not a side effect of this
            page. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={title}
          className="h-full w-full object-cover"
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
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border transition ${
                i === active
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border opacity-70 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
