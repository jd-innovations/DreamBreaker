"use client";

// A week grid for availability — seven days by three blocks.
//
// Replaces three duplicated lists of prose labels ("Weekends + Tue evenings",
// "Sat / Sun mornings") that were each written straight into
// `profiles.availability` as text. That is why seven profiles have summary text
// and no structured schedule behind it: web never wrote the real column.
//
// Mirrors the control mobile already has in edit-profile.tsx. Editing the same
// thing in two shapes on two platforms is what let them drift.
//
// The stored value is `availability_schedule`; the text column is derived from
// it via the shared summarizeSchedule() and is never read for logic.

import {
  AVAILABILITY_DAYS,
  AVAILABILITY_BLOCKS,
  DAY_SHORT,
  type AvailabilityDay,
  type AvailabilityBlock,
  type AvailabilitySchedule,
} from "@shared/availability";

const BLOCK_HEADINGS: Record<AvailabilityBlock, string> = {
  morning: "AM",
  afternoon: "PM",
  evening: "EVE",
};

export function AvailabilityGrid({
  value,
  onChange,
  disabled = false,
}: {
  value: AvailabilitySchedule;
  onChange: (next: AvailabilitySchedule) => void;
  disabled?: boolean;
}) {
  const toggle = (day: AvailabilityDay, block: AvailabilityBlock) => {
    const current = value[day] ?? [];
    const next = current.includes(block)
      ? current.filter((b) => b !== block)
      : // Keep block order canonical rather than click order, so two identical
        // schedules always serialise identically and summaries stay stable.
        AVAILABILITY_BLOCKS.filter((b) => current.includes(b) || b === block);
    onChange({ ...value, [day]: next });
  };

  const toggleDay = (day: AvailabilityDay) => {
    const current = value[day] ?? [];
    onChange({
      ...value,
      [day]: current.length === AVAILABILITY_BLOCKS.length ? [] : [...AVAILABILITY_BLOCKS],
    });
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 min-w-[280px]">
        <thead>
          <tr>
            <th className="w-14" />
            {AVAILABILITY_BLOCKS.map((b) => (
              <th
                key={b}
                scope="col"
                className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground font-normal pb-1"
              >
                {BLOCK_HEADINGS[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AVAILABILITY_DAYS.map((day) => {
            const blocks = value[day] ?? [];
            const allOn = blocks.length === AVAILABILITY_BLOCKS.length;
            return (
              <tr key={day}>
                <th scope="row" className="text-left">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleDay(day)}
                    aria-label={`${allOn ? "Clear" : "Select"} all of ${DAY_SHORT[day]}`}
                    className={`w-full h-11 px-2 rounded-lg font-mono text-[11px] tracking-widest transition-colors disabled:opacity-50 ${
                      blocks.length
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {DAY_SHORT[day]}
                  </button>
                </th>
                {AVAILABILITY_BLOCKS.map((block) => {
                  const on = blocks.includes(block);
                  return (
                    <td key={block}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(day, block)}
                        aria-pressed={on}
                        aria-label={`${DAY_SHORT[day]} ${block}`}
                        className={`w-full h-11 rounded-lg border text-xs font-mono transition-colors disabled:opacity-50 ${
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/50 text-muted-foreground"
                        }`}
                      >
                        {on ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
