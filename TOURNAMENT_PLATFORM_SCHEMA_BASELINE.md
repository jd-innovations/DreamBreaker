# Tournament Platform — Verified Schema Baseline

Companion to `TOURNAMENT_DIRECTOR_PLATFORM_IMPLEMENTATION_PLAN.md`.

**Verified 2026-08-27** against production Supabase (`fbzetvkbhneptvfruilw`) by
direct `information_schema` and `pg_enum` queries. Everything here is an
observation of the live database, not a design proposal. Re-verify before acting
on it — the point of this file is to record what was true on that date so the
foundation phases start from evidence instead of a discovery pass.

---

## 1. Data volumes — migrations are low-risk today

| Table | Rows |
| --- | --- |
| `tournaments` | 10 |
| `bracket_matches` | 7 |
| `court_assignments` | 1 |
| `courts` | 4 |

**This is the single most useful fact in this document.** There is almost no
production data to migrate or backfill. Restructuring decisions that would be
expensive against a live event are nearly free right now. That window closes the
first time a real tournament runs on this schema.

---

## 2. `court_assignments` is already a duplicate copy of match state 🔴

Full column list, as it exists today:

```
id | tournament_id | match_id | court_number | status | created_at
player_a | player_b | round_label | score_a | score_b | winner | completed_at
```

The last seven columns are **competition state living in the operational table**:
players, round, both scores, the winner, and completion time.

This is exactly what Implementation Rule 4 forbids — *"Do not create separate
live copies of matches, pools or brackets"* — and it is what Phase 3's split
(**Match = competition state, Court Assignment = operational relationship**) is
meant to establish. The table already violates the rule the plan is written to
protect.

So Phase 3 is not "extend `court_assignments`". It is:

1. Decide whether `bracket_matches` or `court_assignments` owns scores today
   (check which one the mobile score-entry path actually writes).
2. Migrate any authoritative data out of the duplicated columns.
3. Reduce `court_assignments` to the operational relationship plus history.

Doing this before Phase 2 matters, because the RPCs in Phase 2 have to write to
whichever table wins. Building them against the current ambiguity means writing
them twice.

---

## 3. `bracket_matches` has no state column

Columns relevant to lifecycle:

```
scheduled_at | started_at | score_entered_at | completed_at | court (text)
```

There is **no `status` or `state` column**. Match state is currently *inferred
from which timestamps are non-null*.

Consequences for Phase 1A:

- The seven-state match lifecycle (`Pending → Eligible → Queued → Called →
  On Court → Score Pending → Completed`) is **net-new**, not a normalization.
- The migration needs an explicit mapping from existing timestamp combinations
  onto the new states, for all 7 existing rows.
- States with no timestamp equivalent — `Eligible`, `Queued`, `Called` — cannot
  be derived from existing data at all. They start empty by definition.

---

## 4. Court identity has two incompatible types

| Location | Column | Type |
| --- | --- | --- |
| `bracket_matches` | `court` | `text` |
| `court_assignments` | `court_number` | `integer` |

A court is a free-text label in one table and an integer in the other, and
neither is a foreign key to `courts`. Phase 3's instruction to prefer
`court_assignments` over `bracket_matches.court` is right, and this mismatch is
the concrete reason: they cannot currently be joined or compared without a cast,
and nothing guarantees either refers to a real row in `courts`.

---

## 5. `tournament_status` has ten values, and one is not a lifecycle state

```
draft | pending_approval | approved | published | open | filling_fast
| registration_closed | in_progress | completed | cancelled
```

The plan's model is four states: `Pre-Event → Published → Live → Completed`.
A mapping has to be decided and written down. The obvious reading:

| Plan state | Existing enum values |
| --- | --- |
| Pre-Event | `draft`, `pending_approval`, `approved` |
| Published | `published`, `open`, `registration_closed` |
| Live | `in_progress` |
| Completed | `completed` |
| *(outside the model)* | `cancelled` |

**`filling_fast` is the problem.** It is a *marketing/derived* signal — a
function of how full registration is — sitting inside a lifecycle enum. It has
no place in a state machine, because it is not a state anyone transitions to on
purpose. Recommend deriving it from registration counts at read time and
removing it from the enum, rather than carrying it into the new model.

Currently in use across the 10 rows: `draft`, `open`, `cancelled` only. The
other seven values are unexercised, which makes them cheap to change.

---

## 6. Confirmed absent — Phases 1B, 6 and 7 are greenfield

No tables exist for:

- **Pools** — pool membership, seeding, pool matches, pool status (Phase 7)
- **Tournament sessions** (Phase 6). Note `personal_sessions` exists but is
  **unrelated** — that is casual/social play, not tournament sessions. Do not
  extend it.
- **Events / audit** (Phase 1B)
- **Concurrency control** — no version, lock, or optimistic-concurrency column
  on any tournament table. Phase 1A's "concurrency/version protection" has
  nothing existing to build on.

Present and matching the plan's assumptions: `courts`, `court_assignments`,
`bracket_matches`, `bracket_seeds`, `tournaments`.

---

## 7. Two corrections to earlier verbal claims

Recorded because they were stated in conversation before being checked, and
someone acting on the earlier version would waste a day.

**`tournaments.state` is NOT a competing lifecycle column.** It holds `"FL"` and
sits beside a `city` column — it is the venue's US state. It has nothing to do
with tournament lifecycle and must not be repurposed.

**`format` and `tournament_format` are NOT duplicates.** They model different
things and both are needed:

| Column | Type | Values | Meaning |
| --- | --- | --- | --- |
| `format` | enum | `singles, doubles, mixed_doubles, juniors` | event category |
| `tournament_format` | text | `pool_bracket, single_elim` | competition structure |

`tournament_format` is the one Phase 7 and Phase 9 care about — it already
distinguishes pool-to-bracket events from straight single-elimination, which
means the pool/bracket continuity work has an existing discriminator to key off.

---

## 8. Suggested order adjustment

The plan's immediate scope is **1A → 1B → 2 → 3**. Based on the above, consider
resolving the `court_assignments` ownership question (§2) as part of **1A**
rather than waiting for Phase 3.

The reason is Phase 2: every RPC that touches scores, court assignment, or match
completion has to know which table is authoritative. Writing those RPCs while
two tables both hold `score_a`/`score_b`/`winner` means either writing to both,
or rewriting them at Phase 3.

The data volumes in §1 make this a cheap decision today and an expensive one
later.
