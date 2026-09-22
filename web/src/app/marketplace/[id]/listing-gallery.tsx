"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CaretLeft, CaretRight, MagnifyingGlassPlus, X } from "@phosphor-icons/react";

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
//
// Full view (2026-09-22): tapping the main photo opens it full screen, the
// web counterpart of the app's ProgressiveImageViewer. Whole photo, never
// cropped (object-contain); swipe, arrow buttons or arrow keys move between
// photos; Escape or ✕ closes. Radix Dialog provides the focus trap and focus
// return. Pinch-zoom is left to the browser rather than reimplemented.

type Photo = { id: string; url: string };

const SWIPE_PX = 50;

export function ListingGallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const touchX = useRef<number | null>(null);
  const current = photos[active] ?? photos[0];
  const many = photos.length > 1;

  const step = useCallback((by: number) => {
    setActive((i) => (i + by + photos.length) % photos.length);
  }, [photos.length]);

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View photo ${active + 1} of ${photos.length} full screen`}
        className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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
        <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-foreground opacity-90 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <MagnifyingGlassPlus size={14} aria-hidden /> View full size
        </span>
      </button>

      {many && (
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

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/95" />
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 flex flex-col focus:outline-none"
            onKeyDown={(e) => {
              if (!many) return;
              if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
              if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
            }}
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">{title} — photo {active + 1} of {photos.length}</DialogPrimitive.Title>

            <div className="flex items-center justify-between px-4 py-3 text-white">
              <span className="font-mono text-xs tracking-wider tabular-nums">
                {many ? `${active + 1} / ${photos.length}` : ""}
              </span>
              <DialogPrimitive.Close
                aria-label="Close full view"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={22} weight="bold" />
              </DialogPrimitive.Close>
            </div>

            <div
              className="relative min-h-0 flex-1"
              onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
              onTouchEnd={(e) => {
                const start = touchX.current;
                touchX.current = null;
                const end = e.changedTouches[0]?.clientX;
                if (!many || start === null || end === undefined) return;
                if (end - start > SWIPE_PX) step(-1);
                else if (start - end > SWIPE_PX) step(1);
              }}
            >
              <Image
                key={current.id}
                src={current.url}
                alt={`${title} — photo ${active + 1} of ${photos.length}`}
                fill
                sizes="100vw"
                className="select-none object-contain"
                draggable={false}
              />

              {many && (
                <>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-4"
                  >
                    <CaretLeft size={22} weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-4"
                  >
                    <CaretRight size={22} weight="bold" />
                  </button>
                </>
              )}
            </div>

            {many && (
              <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Show photo ${i + 1} of ${photos.length}`}
                    aria-current={i === active}
                    className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border transition ${
                      i === active ? "border-white" : "border-white/20 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <Image src={photo.url} alt="" fill sizes="48px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
