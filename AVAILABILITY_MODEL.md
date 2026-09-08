# `profiles.availability` — a lossy cache used for matching

**Investigated 2026-08-27.** Decision needed before code changes.

This looked like `play_style` — several vocabularies in one text column — and the
fix looked like the same fix. It is not. The structured model **already exists**
and is already correct. The problem is that matching ignores it in favour of a
lossy summary of it.

## The two columns

| Column | Type | Populated | Written by |
| --- | --- | --- | --- |
| `availability_schedule` | `jsonb` | 5 of 35 non-empty | mobile only |
| `availability` | `text` | 12 of 35 | mobile (derived) **and web (primary)** |

`availability_schedule` is a real model — seven days by three blocks:

```json
{"fri":["afternoon","evening"], "tue":["morning"], "wed":["evening"]}
```

`availability` is generated from it by `summarizeSchedule()` in
`apps/mobile/src/app/edit-profile.tsx:289`:

```ts
const days = AVAILABILITY_DAYS.filter(d => (schedule[d]?.length ?? 0) > 0);
return days.map(d => DAY_LABELS[d].slice(0, 3)).join(', ');
```

## Why this is worse than play_style

**1. The summary throws away the time of day.** The schedule above becomes
`"Tue, Wed, Fri"`. Which *part* of those days is gone.

**2. Matching compares those summaries as whole strings**, in
`web/src/app/matchmaking/page.tsx:78`:

```ts
if (p.availability && myAvail && p.availability === myAvail) {
  score += 30; reasons.push("Matching availability");
}
```

Two consequences, both real in the current data:

- Two players who are both `"Wed, Sat"` score **+30 and a "Matching
  availability" badge** — even when one is Wednesday *morning* and the other
  Wednesday *evening*. They can never actually play. The app asserts the
  opposite.
- `"Wed, Sat"` and `"Mon, Tue, Wed, Fri, Sat, Sun"` — two people who genuinely
  share Wednesday and Saturday — score **zero**.

The signal is not merely weak. It is frequently inverted, and it is 30 points.

**3. Web never writes the schedule at all.** Seven profiles have summary text
and no schedule, because the web editors write the text column directly. So the
structured data does not exist for anyone who edited on web.

**4. Four label vocabularies**, none of which are the day/block model:

| Location | Values |
| --- | --- |
| `web/matchmaking:62` | `Weekends`, `Weeknights`, `Flexible`, `Sat / Sun mornings`, `Weekends + Tue evenings` |
| `web/profile:99` | same, plus `Weekdays only` |
| `web/profile-settings:24` | duplicate of the above |
| `web/onboarding/options.ts`, `mobile/mockData.ts` | onboarding keys |

Stored values today span all of them: `"Weekends"`, `"Nights"`,
`"Mornings, Afternoons"`, `"Weekdays, Nights"`, `"Mon, Tue, Wed, Thu, Fri, Sat, Sun"`.

## Recommendation

**Make `availability_schedule` the source of truth. Match on overlap. Derive the
text.**

Not the `play_style` treatment — no new key set is needed, because the right
model is already built and already shipped on mobile.

1. **Move the day/block types into `packages/shared`** — `AVAILABILITY_DAYS`,
   `AVAILABILITY_BLOCKS`, `AvailabilitySchedule`, plus `summarizeSchedule()` so
   web and mobile derive identical text.
2. **Web edits the grid**, like mobile does, and writes both columns. The four
   label lists collapse into one control.
3. **Matching computes real overlap** — shared day *and* shared block — and can
   then say *"Both free Wednesday evenings"* instead of a string coincidence.
4. **Backfill the 7 text-only rows** onto schedules where the text supports it:
   `Weekends` → sat/sun all blocks; `Weeknights` → mon–fri evening; `Nights` →
   all days evening; `Flexible` → everything. Ambiguous values map to empty
   rather than a guess.

### The decision needed

**Does `availability` text survive as a derived column, or get dropped?**

- **Keep it derived** — cheaper. Existing read sites keep working, and it stays
  useful for display. Risk: it is a cache, and caches drift. It drifted already.
- **Drop it** — one source of truth, derive at render. Touches every read site,
  and needs the migration to land before those reads change.

Recommended: **keep it, derived, written only through the shared
`summarizeSchedule()`** — and never read it for logic again. Matching reads the
schedule; the text is for humans only.

## Cost

15 rows total, 5 with real schedules. The matching change is the valuable part
and is independent of the migration — it can land as soon as the schedule is
populated.
