// When a player is free.
//
// See AVAILABILITY_MODEL.md. `profiles.availability_schedule` (jsonb) is the
// source of truth; `profiles.availability` (text) is a DERIVED summary for
// humans and must never be read for logic again.
//
// That rule exists because reading it for logic is exactly what went wrong.
// Matching compared the summary by string equality, and the summary drops the
// time of day — so two players both showing "Wed, Sat" scored a 30-point
// "Matching availability" bonus even when one meant Wednesday morning and the
// other Wednesday evening. Meanwhile two people genuinely sharing Wednesday and
// Saturday scored zero because their summary strings differed.
//
// Ported from apps/mobile/src/lib/services/profile.ts, which had the right
// model all along.

export const AVAILABILITY_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type AvailabilityDay = (typeof AVAILABILITY_DAYS)[number];

export const AVAILABILITY_BLOCKS = ["morning", "afternoon", "evening"] as const;
export type AvailabilityBlock = (typeof AVAILABILITY_BLOCKS)[number];

export type AvailabilitySchedule = Partial<Record<AvailabilityDay, AvailabilityBlock[]>>;

export const DAY_LABELS: Record<AvailabilityDay, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const DAY_SHORT: Record<AvailabilityDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const BLOCK_LABELS: Record<AvailabilityBlock, string> = {
  morning: "mornings",
  afternoon: "afternoons",
  evening: "evenings",
};

/** Anything stored in the jsonb column, narrowed. Unknown days and blocks are
 *  dropped rather than trusted — the column is client-written. */
export function normalizeSchedule(raw: unknown): AvailabilitySchedule {
  if (typeof raw !== "object" || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const out: AvailabilitySchedule = {};
  for (const day of AVAILABILITY_DAYS) {
    const blocks = input[day];
    if (!Array.isArray(blocks)) continue;
    const kept = AVAILABILITY_BLOCKS.filter((b) => blocks.includes(b));
    if (kept.length) out[day] = kept;
  }
  return out;
}

export function isScheduleEmpty(schedule: AvailabilitySchedule): boolean {
  return AVAILABILITY_DAYS.every((d) => (schedule[d]?.length ?? 0) === 0);
}

/**
 * The human-readable summary written to `profiles.availability`.
 *
 * Names the blocks, unlike the mobile original this replaces, which listed days
 * only — "Wed, Sat" for a schedule that meant Wednesday evenings and Saturday
 * mornings. Callers that need the terse form can use `summarizeDays`.
 *
 * Days sharing an identical set of blocks are grouped, so a full week of
 * evenings reads "Mon-Sun evenings" rather than seven repetitions.
 */
export function summarizeSchedule(schedule: AvailabilitySchedule): string {
  const active = AVAILABILITY_DAYS.filter((d) => (schedule[d]?.length ?? 0) > 0);
  if (active.length === 0) return "";

  const groups: { days: AvailabilityDay[]; blocks: AvailabilityBlock[] }[] = [];
  for (const day of active) {
    const blocks = schedule[day]!;
    const key = blocks.join("|");
    const last = groups[groups.length - 1];
    if (last && last.blocks.join("|") === key) last.days.push(day);
    else groups.push({ days: [day], blocks: [...blocks] });
  }

  return groups
    .map((g) => {
      const days =
        g.days.length > 2
          ? `${DAY_SHORT[g.days[0]]}-${DAY_SHORT[g.days[g.days.length - 1]]}`
          : g.days.map((d) => DAY_SHORT[d]).join(", ");
      const blocks =
        g.blocks.length === AVAILABILITY_BLOCKS.length
          ? "all day"
          : g.blocks.map((b) => BLOCK_LABELS[b]).join(" & ");
      return `${days} ${blocks}`;
    })
    .join(", ");
}

/** Days only, matching the original mobile output. */
export function summarizeDays(schedule: AvailabilitySchedule): string {
  return AVAILABILITY_DAYS.filter((d) => (schedule[d]?.length ?? 0) > 0)
    .map((d) => DAY_SHORT[d])
    .join(", ");
}

// ─── Matching ────────────────────────────────────────────────────────────────

export type ScheduleOverlap = { day: AvailabilityDay; blocks: AvailabilityBlock[] };

/**
 * Slots two players genuinely share — the same day AND the same block.
 *
 * This is the whole point of the model. Sharing a day is not sharing a game.
 */
export function scheduleOverlap(
  a: AvailabilitySchedule,
  b: AvailabilitySchedule,
): ScheduleOverlap[] {
  const out: ScheduleOverlap[] = [];
  for (const day of AVAILABILITY_DAYS) {
    const mine = a[day];
    const theirs = b[day];
    if (!mine?.length || !theirs?.length) continue;
    const blocks = mine.filter((block) => theirs.includes(block));
    if (blocks.length) out.push({ day, blocks });
  }
  return out;
}

export function overlapSlotCount(overlap: ScheduleOverlap[]): number {
  return overlap.reduce((n, o) => n + o.blocks.length, 0);
}

/** "Both free Wednesday evenings" — a reason a person can act on, rather than
 *  a report that two strings were equal. */
export function describeOverlap(overlap: ScheduleOverlap[]): string | null {
  if (overlap.length === 0) return null;
  const first = overlap[0];
  const when = `${DAY_LABELS[first.day]} ${BLOCK_LABELS[first.blocks[0]]}`;
  const more = overlapSlotCount(overlap) - 1;
  return more > 0 ? `Both free ${when} (+${more} more)` : `Both free ${when}`;
}

// ─── Legacy text ─────────────────────────────────────────────────────────────
//
// Seven profiles carry summary text with no schedule behind it, because the web
// editors wrote the text column directly and never the structured one. These
// map the unambiguous phrases; anything else yields an empty schedule rather
// than a guess, because inventing someone's availability is worse than leaving
// it blank.

const WEEKDAYS: AvailabilityDay[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND: AvailabilityDay[] = ["sat", "sun"];
const ALL_BLOCKS: AvailabilityBlock[] = [...AVAILABILITY_BLOCKS];

function build(days: AvailabilityDay[], blocks: AvailabilityBlock[]): AvailabilitySchedule {
  const out: AvailabilitySchedule = {};
  for (const d of days) out[d] = [...blocks];
  return out;
}

const LEGACY_TEXT: Record<string, AvailabilitySchedule> = {
  weekends: build(WEEKEND, ALL_BLOCKS),
  "weekdays only": build(WEEKDAYS, ALL_BLOCKS),
  weekdays: build(WEEKDAYS, ALL_BLOCKS),
  weeknights: build(WEEKDAYS, ["evening"]),
  nights: build([...WEEKDAYS, ...WEEKEND], ["evening"]),
  mornings: build([...WEEKDAYS, ...WEEKEND], ["morning"]),
  afternoons: build([...WEEKDAYS, ...WEEKEND], ["afternoon"]),
  evenings: build([...WEEKDAYS, ...WEEKEND], ["evening"]),
  flexible: build([...WEEKDAYS, ...WEEKEND], ALL_BLOCKS),
  "sat / sun mornings": build(WEEKEND, ["morning"]),
};

/**
 * Best-effort schedule from a legacy `availability` string.
 *
 * Comma-joined phrases are merged — "Weekdays, Nights" becomes weekdays all day
 * plus every evening. Unrecognised segments contribute nothing.
 */
export function scheduleFromLegacyText(raw: string | null | undefined): AvailabilitySchedule {
  if (!raw) return {};
  const out: AvailabilitySchedule = {};

  for (const segment of raw.split(",")) {
    const hit = LEGACY_TEXT[segment.trim().toLowerCase()];
    if (!hit) continue;
    for (const day of AVAILABILITY_DAYS) {
      const add = hit[day];
      if (!add?.length) continue;
      const existing = out[day] ?? [];
      out[day] = AVAILABILITY_BLOCKS.filter(
        (b) => existing.includes(b) || add.includes(b),
      );
    }
  }

  return out;
}
