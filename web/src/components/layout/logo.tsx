import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="dbpb-logo">
      <div className="relative h-9 w-9 rounded-md bg-primary flex items-center justify-center">
        <span className="font-display text-primary-foreground text-xl leading-none">CP</span>
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-foreground/90 ring-2 ring-background" />
      </div>
      <div className="leading-none">
        <div className="font-display text-foreground text-[22px] tracking-[0.38em]">COMPETE</div>
        <div className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] mt-0.5">PICKLEBALL</div>
      </div>
    </div>
  );
}
