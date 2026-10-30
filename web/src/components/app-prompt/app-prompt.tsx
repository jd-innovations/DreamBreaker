"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, AppleLogo } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getAppHref } from "@/lib/app-store";
import { APP_PREVIEW_QR, APP_PREVIEW_SCREENS } from "@/lib/app-preview";

export type AppPromptSource = "landing" | "tournament" | "play_event";
export type AppPromptVariant = "lightbox" | "sheet";

// Same vocabulary as the app's own welcome screen (COPY_ALIGNMENT.md: mobile
// wording is the source).
const COPY: Record<AppPromptSource, { title: string; body: string }> = {
  landing: {
    title: "Get the Pickleball App",
    body: "Find open play near you, register for tournaments, and message partners, all from your phone.",
  },
  tournament: {
    title: "This tournament is better in the app",
    body: "Register, get reminders, and check in with a QR code at the desk.",
  },
  play_event: {
    title: "This game is better in the app",
    body: "Join in a tap, get reminders, and see who is coming.",
  },
};

const ROTATE_MS = 3000;

function PhonePreview({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (APP_PREVIEW_SCREENS.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % APP_PREVIEW_SCREENS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={cn(
        "relative aspect-[1320/2868] overflow-hidden rounded-[2.25rem] border-[8px] border-neutral-900 bg-[#07091A] shadow-2xl",
        className,
      )}
    >
      {APP_PREVIEW_SCREENS.length === 0 ? (
        <div className="flex h-full items-center justify-center p-4">
          <Image src="/brand/logo-pickleball-app-dark.png" alt="Pickleball App" width={320} height={120} className="h-auto w-full" />
        </div>
      ) : (
        APP_PREVIEW_SCREENS.map((s, i) => (
          <Image
            key={s.src}
            src={s.src}
            alt={s.alt}
            fill
            sizes="220px"
            className={cn("object-cover transition-opacity duration-700", i === index ? "opacity-100" : "opacity-0")}
            priority={i === 0}
          />
        ))
      )}
    </div>
  );
}

function StoreButton({ onClick, className, newTab }: { onClick: () => void; className?: string; newTab?: boolean }) {
  return (
    <a
      href={getAppHref("web_prompt")}
      onClick={onClick}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
        className,
      )}
    >
      <AppleLogo size={18} weight="fill" />
      Get it on the App Store
    </a>
  );
}

export function AppPrompt({
  source,
  variant,
  onDismiss,
  onGet,
}: {
  source: AppPromptSource;
  variant: AppPromptVariant;
  onDismiss: () => void;
  onGet: () => void;
}) {
  const copy = COPY[source];

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {variant === "lightbox" ? (
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 grid-cols-1 items-center gap-10 rounded-3xl border border-border bg-card p-8 md:grid-cols-[220px_1fr] md:p-10 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <PhonePreview className="hidden w-[220px] md:block" />
            <div className="flex flex-col gap-5">
              <p className="text-xs font-semibold tracking-[0.25em] text-primary">PLAY. ENGAGE. BELONG.</p>
              <DialogPrimitive.Title className="text-3xl font-bold leading-tight">{copy.title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-base text-muted-foreground">{copy.body}</DialogPrimitive.Description>
              <div className="flex items-center gap-5 pt-2">
                <div className="rounded-xl bg-white p-2">
                  <Image src={APP_PREVIEW_QR} alt="QR code to download Pickleball App" width={112} height={112} unoptimized />
                </div>
                <p className="max-w-[12rem] text-sm text-muted-foreground">Scan with your iPhone camera to download.</p>
              </div>
              <StoreButton onClick={onGet} newTab className="self-start" />
            </div>
            <DialogPrimitive.Close className="absolute right-5 top-5 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
              <X size={18} weight="bold" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        ) : (
          <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-border bg-card px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom">
            <div className="mx-auto flex max-w-md items-center gap-5">
              <PhonePreview className="w-[96px] shrink-0 rounded-[1.25rem] border-[5px]" />
              <div className="flex flex-col gap-2">
                <DialogPrimitive.Title className="text-xl font-bold leading-tight">{copy.title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">{copy.body}</DialogPrimitive.Description>
              </div>
            </div>
            <div className="mx-auto mt-5 flex max-w-md flex-col gap-2">
              <StoreButton onClick={onGet} className="w-full" />
              <DialogPrimitive.Close className="h-11 w-full rounded-full text-sm font-medium text-muted-foreground hover:text-foreground">
                Not now
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
