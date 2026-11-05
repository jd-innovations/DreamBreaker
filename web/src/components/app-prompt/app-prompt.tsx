"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import localFont from "next/font/local";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, AppleLogo } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getAppHref } from "@/lib/app-store";
import {
  APP_PREVIEW_QR,
  APP_PREVIEW_SCREENS,
  APP_PROMPT_ICONS,
  type AppPreviewScreen,
} from "@/lib/app-preview";

export type AppPromptSource = "landing" | "tournament" | "play_event";
export type AppPromptVariant = "lightbox" | "sheet";
/**
 * A/B arm, assigned once per browser by app-prompt-host.tsx.
 * d = court sketch with stickers, e = tournament ticket.
 */
export type AppPromptDesign = "d" | "e";

// The serif of the App Store screenshot frames. preload: false — this file is
// reachable from the root layout, and only a visitor who actually gets the
// prompt should download the font.
const newsreader = localFont({
  src: [
    { path: "../../app/fonts/newsreader-latin-opsz-wght-normal.woff2", style: "normal", weight: "400" },
    { path: "../../app/fonts/newsreader-latin-opsz-wght-italic.woff2", style: "italic", weight: "400" },
  ],
  display: "swap",
  preload: false,
});

// Fixed palette, deliberately not the theme tokens: the prompt is the App
// Store listing's cream-and-navy in light AND dark mode, so the website, the
// store screenshots and the prompt read as one brand.
const INK = "text-[#0A1228]";
const CREAM = "bg-[#F4F3EF]";
const MUTED = "text-[#3b4256]";
const GOLD_STROKE = "#d4a63a";

// Same vocabulary as the app's own welcome screen (COPY_ALIGNMENT.md: mobile
// wording is the source). `em` is the italic second line.
const COPY: Record<AppPromptSource, { lead: string; em: string; body: string }> = {
  landing: {
    lead: "Play more",
    em: "pickleball.",
    body: "Find open play near you, register for tournaments, and message partners, all from your phone.",
  },
  tournament: {
    lead: "This tournament is",
    em: "better in the app.",
    body: "Register, get reminders, and check in with a QR code at the desk.",
  },
  play_event: {
    lead: "This game is",
    em: "better in the app.",
    body: "Join in a tap, get reminders, and see who is coming.",
  },
};

// The ticket's landing headline. Other pages keep their own.
const TICKET_LANDING = { lead: "Your pass to", em: "more pickleball." };

// Radix focuses the first control on open, which paints a focus ring on the
// close button before anyone has touched the keyboard. Focus the dialog
// itself instead: still trapped inside it, Tab still reaches every control.
function focusDialog(e: Event) {
  e.preventDefault();
  (e.currentTarget as HTMLElement | null)?.focus();
}

function Phone({ screen, className, style }: { screen: AppPreviewScreen; className?: string; style?: CSSProperties }) {
  const s = APP_PREVIEW_SCREENS[screen];
  return (
    <div
      className={cn(
        "absolute aspect-[1320/2868] overflow-hidden rounded-[1.6rem] border-[6px] border-[#0A1228] bg-black shadow-[0_24px_50px_rgba(10,18,40,0.28)]",
        className,
      )}
      style={style}
    >
      <Image src={s.src} alt={s.alt} fill sizes="200px" className="object-cover" />
    </div>
  );
}

function Icon({ name, size, className, style }: { name: keyof typeof APP_PROMPT_ICONS; size: number; className?: string; style?: CSSProperties }) {
  return <Image src={APP_PROMPT_ICONS[name]} alt="" width={size} height={size} unoptimized className={className} style={style} />;
}

function Sticker({ name, style }: { name: keyof typeof APP_PROMPT_ICONS; style: CSSProperties }) {
  return (
    <div className="absolute z-10 rounded-full bg-white p-2.5 shadow-[0_8px_18px_rgba(10,18,40,0.16)]" style={style}>
      <Icon name={name} size={38} />
    </div>
  );
}

function Headline({ lead, em, underline, className }: { lead: string; em: string; underline?: boolean; className?: string }) {
  return (
    <DialogPrimitive.Title className={cn(newsreader.className, "font-normal tracking-[-0.015em]", INK, className)}>
      {lead}
      <br />
      <span className="relative inline-block italic">
        {em}
        {underline && (
          <svg aria-hidden className="absolute -bottom-2.5 left-0 h-3.5 w-full" viewBox="0 0 300 16" preserveAspectRatio="none">
            <path d="M4 10 C 70 3, 150 4, 296 8" stroke={GOLD_STROKE} strokeWidth="5" fill="none" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </DialogPrimitive.Title>
  );
}

function StoreButton({
  design,
  onClick,
  label = "Get it on the App Store",
  newTab,
  className,
}: {
  design: AppPromptDesign;
  onClick: () => void;
  label?: string;
  newTab?: boolean;
  className?: string;
}) {
  return (
    <a
      href={getAppHref(design === "d" ? "web_prompt_d" : "web_prompt_e")}
      onClick={onClick}
      {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0A1228] px-6 text-[15px] font-extrabold text-white transition-colors hover:bg-[#1b2647] outline-none focus-visible:ring-2 focus-visible:ring-[#d4a63a] focus-visible:ring-offset-2",
        className,
      )}
    >
      <AppleLogo size={18} weight="fill" />
      {label}
    </a>
  );
}

function Qr({ design, size }: { design: AppPromptDesign; size: number }) {
  return (
    <div className="shrink-0 rounded-2xl bg-white p-2 shadow-[0_2px_0_#e2ddd0]">
      <Image src={APP_PREVIEW_QR[design]} alt="QR code to download Pickleball App" width={size} height={size} unoptimized />
    </div>
  );
}

function CloseX({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      className={cn(
        "absolute z-20 rounded-full p-1.5 text-[#0A1228] opacity-60 transition-opacity hover:opacity-100 outline-none focus-visible:ring-2 focus-visible:ring-[#d4a63a]",
        className,
      )}
    >
      <X size={20} weight="bold" />
      <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
  );
}

function NotNow() {
  return (
    <DialogPrimitive.Close className="h-11 w-full rounded-full text-sm font-semibold text-[#6b7183] outline-none hover:text-[#0A1228] focus-visible:ring-2 focus-visible:ring-[#d4a63a]">
      Not now
    </DialogPrimitive.Close>
  );
}

// ── D: court sketch + stickers ──────────────────────────────────────────────

function CourtSketch({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 560 520" fill="none" stroke="#0A1228" strokeWidth="2.4" strokeLinecap="round" opacity="0.16">
      <path d="M90 470 L180 60 L420 58 L520 468 Z" />
      <path d="M300 59 L302 470" />
      <path d="M128 300 L470 298" />
      <path d="M152 190 L445 190" />
      <path d="M60 300 L540 300" strokeDasharray="2 9" strokeWidth="3" />
    </svg>
  );
}

function CourtLightbox({ design, copy, onGet }: { design: AppPromptDesign; copy: (typeof COPY)[AppPromptSource]; onGet: () => void }) {
  return (
    <div className={cn("relative grid grid-cols-1 overflow-hidden rounded-[2rem] md:grid-cols-[440px_1fr]", CREAM, INK)}>
      <div className="relative hidden h-[540px] md:block">
        <CourtSketch className="absolute -left-10 top-6 h-[520px] w-[560px]" />
        <Phone screen="explore" className="w-[150px]" style={{ left: 40, top: 150, transform: "rotate(-10deg)" }} />
        <Phone screen="partner" className="w-[150px]" style={{ left: 262, top: 150, transform: "rotate(8deg)" }} />
        <Phone screen="home" className="z-[5] w-[186px]" style={{ left: 138, top: 66 }} />
        <Sticker name="paddles" style={{ left: 30, top: 54, transform: "rotate(-12deg)" }} />
        <Sticker name="trophy" style={{ left: 360, top: 44, transform: "rotate(10deg)" }} />
        <Sticker name="score" style={{ left: 18, top: 430, transform: "rotate(8deg)" }} />
        <Sticker name="watch" style={{ left: 370, top: 440, transform: "rotate(-8deg)" }} />
      </div>
      <div className="relative flex flex-col gap-5 px-8 pb-14 pt-10 md:pb-16 md:pt-12 md:pl-4 md:pr-12">
        <Icon name="ball" size={54} />
        <Headline lead={copy.lead} em={copy.em} underline className="text-[52px] leading-[1.02]" />
        <DialogPrimitive.Description className={cn("text-[17px] leading-relaxed", MUTED)}>{copy.body}</DialogPrimitive.Description>
        <div className="relative mt-3 flex items-center gap-5">
          <Qr design={design} size={96} />
          <div className="flex flex-col gap-2.5">
            <StoreButton design={design} onClick={onGet} newTab />
            <span className="text-[13px] font-bold text-[#6b7183]">Free on iPhone</span>
          </div>
          {/* Hand-drawn "scan me!" pointing at the QR code. */}
          <span aria-hidden className={cn(newsreader.className, "pointer-events-none absolute -bottom-9 left-1 -rotate-3 text-[22px] italic text-[#b8892c]")}>
            scan me!
          </span>
          <svg aria-hidden className="pointer-events-none absolute -bottom-7 left-[86px]" width="44" height="34" viewBox="0 0 110 80" fill="none" stroke="#b8892c" strokeWidth="5" strokeLinecap="round">
            <path d="M10 66 C 40 74, 74 58, 84 18" />
            <path d="M68 30 L84 14 L98 32" />
          </svg>
        </div>
      </div>
      <CloseX className="right-5 top-5" />
    </div>
  );
}

function CourtSheet({ design, copy, onGet }: { design: AppPromptDesign; copy: (typeof COPY)[AppPromptSource]; onGet: () => void }) {
  return (
    <div className={cn("relative overflow-hidden rounded-t-[1.75rem] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6", CREAM, INK)}>
      <CourtSketch className="pointer-events-none absolute -left-14 top-2 h-[250px] w-[270px]" />
      <div className="relative mx-auto flex max-w-md items-center gap-4">
        <div className="relative h-[200px] w-[128px] shrink-0">
          <Phone screen="explore" className="w-[82px] rounded-[1rem] border-4" style={{ left: 0, top: 26, transform: "rotate(-9deg)" }} />
          <Phone screen="home" className="z-[5] w-[92px] rounded-[1rem] border-4" style={{ left: 34, top: 4 }} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <Icon name="ball" size={30} />
            <Icon name="paddles" size={26} />
            <Icon name="trophy" size={26} />
          </div>
          <Headline lead={copy.lead} em={copy.em} underline className="text-[30px] leading-[1.05]" />
          <DialogPrimitive.Description className={cn("text-sm leading-snug", MUTED)}>{copy.body}</DialogPrimitive.Description>
        </div>
      </div>
      <div className="relative mx-auto mt-5 flex max-w-md flex-col gap-1.5">
        <StoreButton design={design} onClick={onGet} className="w-full" />
        <NotNow />
      </div>
    </div>
  );
}

// ── E: tournament ticket ────────────────────────────────────────────────────

// Notches where the ticket tears: masks cut half-circles out of the edges.
// Desktop tears vertically: right corners of the main part, left of the stub.
const MAIN_NOTCH: CSSProperties = {
  WebkitMask:
    "radial-gradient(circle 16px at 100% 0, #0000 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 16px at 100% 100%, #0000 98%, #000) bottom/100% 51% no-repeat",
  mask: "radial-gradient(circle 16px at 100% 0, #0000 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 16px at 100% 100%, #0000 98%, #000) bottom/100% 51% no-repeat",
};
const STUB_NOTCH: CSSProperties = {
  WebkitMask:
    "radial-gradient(circle 16px at 0 0, #0000 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 16px at 0 100%, #0000 98%, #000) bottom/100% 51% no-repeat",
  mask: "radial-gradient(circle 16px at 0 0, #0000 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 16px at 0 100%, #0000 98%, #000) bottom/100% 51% no-repeat",
};
// The sheet tears horizontally: bottom corners of the top part, top corners of the stub.
const SHEET_MAIN_NOTCH: CSSProperties = {
  WebkitMask:
    "radial-gradient(circle 14px at 0 100%, #0000 98%, #000) left/51% 100% no-repeat, radial-gradient(circle 14px at 100% 100%, #0000 98%, #000) right/51% 100% no-repeat",
  mask: "radial-gradient(circle 14px at 0 100%, #0000 98%, #000) left/51% 100% no-repeat, radial-gradient(circle 14px at 100% 100%, #0000 98%, #000) right/51% 100% no-repeat",
};
const SHEET_STUB_NOTCH: CSSProperties = {
  WebkitMask:
    "radial-gradient(circle 14px at 0 0, #0000 98%, #000) left/51% 100% no-repeat, radial-gradient(circle 14px at 100% 0, #0000 98%, #000) right/51% 100% no-repeat",
  mask: "radial-gradient(circle 14px at 0 0, #0000 98%, #000) left/51% 100% no-repeat, radial-gradient(circle 14px at 100% 0, #0000 98%, #000) right/51% 100% no-repeat",
};

function TicketMeta({ className }: { className?: string }) {
  const items: [string, string][] = [["Price", "Free"], ["Device", "iPhone"], ["Courts", "Near you"]];
  return (
    <dl className={cn("flex gap-8", className)}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#8a8f9e]">{k}</dt>
          <dd className="text-[17px] font-extrabold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function TicketLightbox({ design, source, copy, onGet }: { design: AppPromptDesign; source: AppPromptSource; copy: (typeof COPY)[AppPromptSource]; onGet: () => void }) {
  const title = source === "landing" ? TICKET_LANDING : copy;
  return (
    <div className={cn("grid grid-cols-1 drop-shadow-[0_30px_40px_rgba(0,0,0,0.4)] md:grid-cols-[1fr_270px]", INK)}>
      <div className={cn("relative grid grid-cols-1 overflow-hidden rounded-t-[2rem] md:grid-cols-[320px_1fr] md:rounded-l-[2rem] md:rounded-tr-none", CREAM)} style={MAIN_NOTCH}>
        <div className="relative hidden h-[520px] md:block">
          <Phone screen="tournament" className="w-[164px]" style={{ left: 22, top: 74, transform: "rotate(-6deg)" }} />
          <Phone screen="stats" className="z-[5] w-[164px]" style={{ left: 124, top: 112, transform: "rotate(5deg)" }} />
        </div>
        <div className="flex flex-col justify-center gap-5 px-8 py-10 md:pl-4 md:pr-10">
          <div className="flex items-center gap-3">
            <Icon name="ball" size={42} />
            <Icon name="paddles" size={42} />
            <Icon name="trophy" size={42} />
          </div>
          <Headline lead={title.lead} em={title.em} className="text-[48px] leading-[1.02]" />
          <DialogPrimitive.Description className={cn("text-base leading-relaxed", MUTED)}>{copy.body}</DialogPrimitive.Description>
          <TicketMeta />
        </div>
        <CloseX className="right-5 top-5" />
      </div>
      <div className="relative flex flex-col items-center justify-center gap-4 rounded-b-[2rem] bg-[#e9c763] px-6 py-8 md:rounded-l-none md:rounded-r-[2rem]" style={STUB_NOTCH}>
        <div aria-hidden className="absolute bottom-8 left-0 top-8 hidden border-l-[3px] border-dashed border-[#0A1228]/35 md:block" />
        <span className="text-xs font-extrabold tracking-[0.3em]">ADMIT ONE</span>
        <Qr design={design} size={132} />
        <span className={cn(newsreader.className, "text-lg italic")}>Scan with your camera</span>
        <StoreButton design={design} onClick={onGet} newTab label="App Store" />
      </div>
    </div>
  );
}

function TicketSheet({ design, source, copy, onGet }: { design: AppPromptDesign; source: AppPromptSource; copy: (typeof COPY)[AppPromptSource]; onGet: () => void }) {
  const title = source === "landing" ? TICKET_LANDING : copy;
  return (
    <div className={cn("flex flex-col", INK)}>
      <div className={cn("relative rounded-t-[1.75rem] px-5 pb-6 pt-6", CREAM)} style={SHEET_MAIN_NOTCH}>
        <div className="mx-auto flex max-w-md items-center gap-4">
          <div className="relative h-[196px] w-[108px] shrink-0">
            <Phone screen="tournament" className="w-[76px] rounded-[1rem] border-4" style={{ left: 0, top: 4, transform: "rotate(-6deg)" }} />
            <Phone screen="stats" className="z-[5] w-[76px] rounded-[1rem] border-4" style={{ left: 28, top: 18, transform: "rotate(5deg)" }} />
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <Icon name="ball" size={28} />
              <Icon name="paddles" size={26} />
              <Icon name="trophy" size={26} />
            </div>
            <Headline lead={title.lead} em={title.em} className="text-[28px] leading-[1.05]" />
            <DialogPrimitive.Description className={cn("text-sm leading-snug", MUTED)}>{copy.body}</DialogPrimitive.Description>
          </div>
        </div>
        <TicketMeta className="mx-auto mt-4 max-w-md gap-6" />
      </div>
      <div className="relative bg-[#e9c763] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5" style={SHEET_STUB_NOTCH}>
        <div aria-hidden className="absolute left-6 right-6 top-0 border-t-[3px] border-dashed border-[#0A1228]/35" />
        <div className="mx-auto flex max-w-md flex-col items-center gap-1.5">
          <span className="text-[11px] font-extrabold tracking-[0.3em]">ADMIT ONE</span>
          <StoreButton design={design} onClick={onGet} className="mt-1.5 w-full" />
          <NotNow />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function AppPrompt({
  source,
  variant,
  design,
  onDismiss,
  onGet,
}: {
  source: AppPromptSource;
  variant: AppPromptVariant;
  design: AppPromptDesign;
  onDismiss: () => void;
  onGet: () => void;
}) {
  const copy = COPY[source];
  let body: ReactNode;
  if (variant === "lightbox") {
    body = design === "d"
      ? <CourtLightbox design={design} copy={copy} onGet={onGet} />
      : <TicketLightbox design={design} source={source} copy={copy} onGet={onGet} />;
  } else {
    body = design === "d"
      ? <CourtSheet design={design} copy={copy} onGet={onGet} />
      : <TicketSheet design={design} source={source} copy={copy} onGet={onGet} />;
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {variant === "lightbox" ? (
          <DialogPrimitive.Content
            onOpenAutoFocus={focusDialog}
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[980px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            {body}
          </DialogPrimitive.Content>
        ) : (
          <DialogPrimitive.Content
            onOpenAutoFocus={focusDialog}
            className="fixed inset-x-0 bottom-0 z-50 outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom"
          >
            {body}
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
