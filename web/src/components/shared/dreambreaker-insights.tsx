import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { InsightResult } from "@/lib/insights";

interface DreamBreakerInsightsProps {
  insight: InsightResult;
  className?: string;
}

export function DreamBreakerInsights({ insight, className = "" }: DreamBreakerInsightsProps) {
  return (
    <div
      className={`rounded-2xl bg-primary/50 px-5 py-4 sm:px-7 sm:py-5 flex items-center gap-2 sm:gap-4 ${className}`}
      data-testid="dreambreaker-insights"
    >
      {/* Left column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkle size={11} weight="fill" className="text-primary-foreground/60 flex-shrink-0" />
          <span className="font-mono text-[9px] sm:text-[10px] tracking-[0.35em] font-bold text-primary-foreground/70 uppercase">
            DreamBreaker Insights
          </span>
        </div>
        <div className="font-display text-xl sm:text-2xl md:text-3xl tracking-wide text-primary-foreground leading-tight">
          {insight.headline.toUpperCase()}
        </div>
        <p className="text-xs sm:text-sm text-primary-foreground/80 mt-1.5 leading-snug">
          {insight.subtext}
        </p>
      </div>

      {/* Vertical separator */}
      <div className="hidden sm:block w-px self-stretch bg-primary-foreground/25 flex-shrink-0" />

      {/* Right column: fill chance badge */}
      <div className="flex-shrink-0 text-center pl-1 sm:pl-3">
        <div className="font-mono font-black leading-none text-primary-foreground tabular-nums">
          <span className="text-4xl sm:text-5xl md:text-6xl">{insight.fillChancePct}</span>
          <span className="text-xl sm:text-2xl">%</span>
        </div>
        <div className="font-mono text-[8px] sm:text-[9px] tracking-[0.3em] text-primary-foreground/70 mt-1 uppercase">
          Fill Chance
        </div>
      </div>
    </div>
  );
}
