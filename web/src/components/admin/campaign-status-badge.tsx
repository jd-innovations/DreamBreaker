import { cn } from "@/lib/utils";
import { isLive, STATUS_LABEL, statusTone, type CampaignStatus } from "@/lib/campaigns/campaign-logic";

// Token roles only — the palette has no success/warning colour, so weight is
// carried by fill: solid primary for sent, tinted primary for in progress,
// tinted destructive for trouble, muted for everything inert.
const TONE_CLASS = {
  active: "bg-primary/10 text-primary",
  good: "bg-primary text-primary-foreground",
  bad: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function CampaignStatusBadge({ status, className }: { status: string; className?: string }) {
  const label = STATUS_LABEL[status as CampaignStatus] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        TONE_CLASS[statusTone(status)],
        className,
      )}
    >
      {isLive(status) && <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label}
    </span>
  );
}
