import { Bell } from "@phosphor-icons/react";

// Approximate lock-screen renderings of a campaign, so the admin sees roughly
// where each platform cuts the text. Deliberately approximate: real truncation
// depends on device width and font size. Content is rendered as text, never
// HTML (Phase 5 security requirement).

const APP_NAME = "Pickleball App";

function AppIcon() {
  return (
    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <Bell size={11} weight="fill" />
    </span>
  );
}

export function CampaignPreview({ title, body }: { title: string; body: string }) {
  const t = title.trim() || "Notification title";
  const b = body.trim() || "Your message appears here.";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <figure>
        <figcaption className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">iOS</figcaption>
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <AppIcon />
            <span className="font-semibold uppercase tracking-wide">{APP_NAME}</span>
            <span className="ml-auto">now</span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-card-foreground">{t}</p>
          <p className="line-clamp-4 text-sm text-card-foreground">{b}</p>
        </div>
      </figure>
      <figure>
        <figcaption className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Android</figcaption>
        <div className="rounded-md border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <AppIcon />
            <span>{APP_NAME}</span>
            <span aria-hidden>·</span>
            <span>now</span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm font-medium text-card-foreground">{t}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{b}</p>
        </div>
      </figure>
    </div>
  );
}
