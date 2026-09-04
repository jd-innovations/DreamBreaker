# `profiles.play_style` — three concepts in one column

**Found 2026-08-27.** Decision taken; migration not yet written. Workstream C2 of
`WEB_MOBILE_ALIGNMENT_PLAN.md`.

## The finding

The column is not one concept stored inconsistently. It is **three different
questions** sharing one text column, plus a free-text field letting users answer
a fourth.

| Writer | Chips? | Stores | Question it asks |
| --- | --- | --- | --- |
| Web + mobile onboarding | yes | keys: `competitive`, `recreational`, `social`, `tournament_play`, `ladder`, `round_robin`, `mixed_doubles`, `mens_doubles`, `womens_doubles`, `singles` | **two** questions at once — see below |
| Web profile editor | yes | labels: `Aggressive baseliner`, `Soft-game specialist`, `Counter-puncher`, `All-court`, `Bangers + transition`, `Dink master` | *how* you play |
| Mobile edit-profile | **no — free text** | anything the user types | ambiguous |

Onboarding's single chip list mixes an **intensity** axis (`competitive`,
`recreational`, `social` — how seriously) with a **format** axis
(`mixed_doubles`, `singles`, `ladder`, `round_robin`, `tournament_play` — what
you enter). Those are independent: a recreational player enters mixed doubles.

Neither of those is the profile editor's question, which is genuinely about
*style of play* — a dinker, a banger, a counter-puncher.

Both onboarding flows offer up to 3 selections and store **1**, so the other two
are discarded before they reach the database.

## Decision

**Chips everywhere, but three fields, storing keys, rendering labels** — the
shape `onboarding_intent` already uses (`text[]` of keys).

| Field | Type | Question | Values |
| --- | --- | --- | --- |
| `play_style` | `text[]` | *how* you play | `aggressive_baseliner`, `soft_game`, `dink_master`, `banger`, `counter_puncher`, `all_court`, `third_shot_specialist`, `net_player` |
| `preferred_formats` | `text[]` **new** | *what* you play | `singles`, `mixed_doubles`, `mens_doubles`, `womens_doubles`, `ladder`, `round_robin`, `tournament_play` |
| `play_intensity` | `text` **new** | *how seriously* | `competitive`, `recreational`, `social` |
| `onboarding_intent` | `text[]` *exists* | *why you are here* | unchanged |

`play_intensity` is single-valued deliberately — the three are mutually
exclusive in a way the other axes are not.

Converting mobile's free-text field to chips is part of this, not an
alternative to it. Chips alone would have forced a choice between two chip sets
that answer different questions; whichever was picked, one concept would have
been silently dropped.

Keys rather than labels because matchmaking cannot filter on free prose, and a
copy edit to a label must not orphan stored rows.

## Migration mapping — every existing row

12 rows have a value; 10 distinct. Every one maps unambiguously.

| Current value | Rows | `play_style` | `preferred_formats` | `play_intensity` |
| --- | --- | --- | --- | --- |
| `Soft Game / Dinker` | 2 | `{soft_game, dink_master}` | — | — |
| `tournament_play` | 2 | — | `{tournament_play}` | — |
| `Soft game` | 1 | `{soft_game}` | — | — |
| `Dinker` | 1 | `{dink_master}` | — | — |
| `Aggressive Net Player` | 1 | `{net_player}` | — | — |
| `Banger` | 1 | `{banger}` | — | — |
| `Aggressive baseliner` | 1 | `{aggressive_baseliner}` | — | — |
| `Third-Shot Specialist` | 1 | `{third_shot_specialist}` | — | — |
| `competitive, Soft-game specialist` | 1 | `{soft_game}` | — | `competitive` |
| `recreational` | 1 | — | — | `recreational` |

Note `Soft Game / Dinker` is a slash-pair — one row holding two styles, which the
current single-value model cannot represent. It becomes two array entries.

## Work required

**Migration** (forward-only, not yet written):

1. Add `preferred_formats text[]` and `play_intensity text` with a CHECK.
2. Add `play_style_keys text[]`, backfill from the table above, then swap and
   drop the old text column. Do not convert in place — the mapping is not
   derivable in SQL from the free-text values.

**Shared** — the three key sets and their label maps go in
`packages/shared/src/play-profile.ts`, so all four writers use one definition.
Web can consume it today; mobile joins when the workspace lands.

**Call sites**

- `web/src/lib/onboarding/options.ts` — split `PLAYING_STYLE_OPTIONS` across the
  three fields; onboarding gains a step or splits an existing one
- `web/src/lib/onboarding/transform.ts` — stop writing `playingStyle[0]`; write
  all selections
- `web/src/app/profile/page.tsx:94` — `PLAY_STYLES` labels become shared keys
- `apps/mobile/src/app/edit-profile.tsx:492` — free-text field becomes chips
- `apps/mobile/src/lib/onboarding/finalize.ts` — same as web's transform
- `web/src/app/matchmaking/page.tsx` — already splits on commas (302bbfe);
  becomes a plain array read

## Why now

12 rows. Every value maps by hand without ambiguity, and no real user has typed
anything that would be lost. After launch this is a data-cleaning project
against values nobody can reconstruct. Same argument as
`TOURNAMENT_PLATFORM_SCHEMA_BASELINE.md` §1.
