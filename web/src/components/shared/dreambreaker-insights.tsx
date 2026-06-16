import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { InsightResult } from "@/lib/insights";

interface DreamBreakerInsightsProps {
  insight: InsightResult;
  className?: string;
}

export function DreamBreakerInsights({ insight, className = "" }: DreamBreakerInsightsProps) {
  return (
    <div
      className={`relative rounded-2xl border border-border bg-card overflow-hidden px-5 py-4 sm:px-7 sm:py-5 flex items-center gap-2 sm:gap-4 ${className}`}
      data-testid="dreambreaker-insights"
    >
      {/* Glow — matches "Ready to Play" section */}
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

      {/* Left column */}
      <div className="relative flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkle size={11} weight="fill" className="text-primary flex-shrink-0" />
          <span className="font-mono text-[9px] sm:text-[10px] tracking-[0.35em] font-bold text-muted-foreground uppercase">
            Compete Insights
          </span>
        </div>
        <div className="font-display text-xl sm:text-2xl md:text-3xl tracking-wide leading-tight">
          {insight.headline.toUpperCase()}
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-snug">
          {insight.subtext}
        </p>
      </div>

      {/* Vertical separator */}
      <div className="hidden sm:block w-px self-stretch bg-border flex-shrink-0" />

      {/* Right column: fill chance badge */}
      <div className="relative flex-shrink-0 text-center pl-1 sm:pl-3">
        <div className="font-mono font-black leading-none text-primary tabular-nums">
          <span className="text-4xl sm:text-5xl md:text-6xl">{insight.fillChancePct}</span>
          <span className="text-xl sm:text-2xl">%</span>
        </div>
        <div className="font-mono text-[8px] sm:text-[9px] tracking-[0.3em] text-muted-foreground mt-1 uppercase">
          Fill Chance
        </div>
      </div>
    </div>
  );
}
