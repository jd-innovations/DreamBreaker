"use client";

// Selectable option cards, single- and multi-select.
//
// Responsive contract: one column on a phone, two from `sm`, three from `lg`.
// Labels wrap rather than truncate — an option the user cannot read is worse
// than a taller card. Every target is h-14 (56px), well over the 44px minimum,
// because these are the primary interaction in five of the six steps.

import { Check } from "@phosphor-icons/react";
import type { Option } from "@/lib/onboarding/options";

function cardClasses(selected: boolean, disabled: boolean) {
  return [
    "relative flex items-center gap-3 w-full min-h-14 px-4 py-3 rounded-xl border text-left transition-colors",
    selected
      ? "border-primary bg-primary/10"
      : "border-border bg-secondary/20 hover:border-primary/50",
    disabled && !selected ? "opacity-40 cursor-not-allowed hover:border-border" : "",
  ].join(" ");
}

export function OptionGrid({
  options,
  selected,
  onSelect,
  /** Multi-select cap. Unselected options disable once it is reached. */
  max,
  columns = "auto",
  testIdPrefix,
}: {
  options: Option[];
  selected: string[];
  onSelect: (key: string) => void;
  max?: number;
  columns?: "auto" | "two";
  testIdPrefix?: string;
}) {
  const atCap = max != null && selected.length >= max;

  const grid =
    columns === "two"
      ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3";

  return (
    <div className={grid}>
      {options.map((opt) => {
        const isSelected = selected.includes(opt.key);
        const disabled = atCap && !isSelected;
        const Icon = opt.icon;

        return (
          <button
            key={opt.key}
            type="button"
            role={max === 1 ? "radio" : "checkbox"}
            aria-checked={isSelected}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => onSelect(opt.key)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt.key}` : undefined}
            className={cardClasses(isSelected, disabled)}
          >
            {Icon && (
              <Icon
                size={20}
                weight={isSelected ? "fill" : "regular"}
                className={isSelected ? "text-primary shrink-0" : "text-muted-foreground shrink-0"}
              />
            )}
            {/* min-w-0 lets the label wrap instead of forcing the card wider. */}
            <span className="text-sm font-medium min-w-0">{opt.label}</span>
            {isSelected && (
              <Check size={16} weight="bold" className="text-primary ml-auto shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}
