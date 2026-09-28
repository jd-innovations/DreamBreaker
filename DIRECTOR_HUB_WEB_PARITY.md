# Director Hub: web parity handoff (mobile changes of 2026-09-28)

On 2026-09-28 these Director Hub fixes shipped on **mobile only**. Web
(`web/src/app/director/...`) doesn't have them yet. This file lists what to
bring over in a separate session. The database work is **already live in
production**, so web parity is a client-side job: use the RPCs, columns and
rules below, and don't recreate them.

Branch: `feature/push-broadcast`. Read the commits for the full diffs.

| # | Feature | Mobile commit | DB migration (live) |
|---|---------|---------------|---------------------|
| 1 | Player search in the registrations list | `4bdda4d` | none |
| 2 | Day-of walk-ins after registration closes | `3118676` | `20260928120000_director_day_of_registration` |
| 3 | Walk-ins in paid divisions, paid on site | `41ba511` | `20260928130000_director_onsite_payment` |
| 4 | Mixed Doubles naming in Create Division | `8ca1146` | none (one data fix run by hand, see below) |
| 5 | Tournament court list and one live match per court | `7c10746` | `20260928140000_tournament_courts` |
| 6 | Court auto-assign queue and live bracket | (this commit) | `20260928150000_court_auto_assign`, `20260928160000_court_queue_fairness` |

---

## 1. Registrations search

- **Mobile:** `apps/mobile/src/app/tournament/[id]/workspace.tsx`, `matchesSearch()`.
- **Rule:** a case-insensitive substring match on the player name **or** the
  partner name. It works on the list already loaded, together with the status
  tab and the division filter. Tab counts stay whole-tournament totals, and a
  search with no results shows an empty state with a Clear option.

## 2. Day-of walk-ins

- **DB:** `fn_enforce_registration_close()` now lets a registration the
  director added skip the `registration_closes_at` check. The bypass requires
  `director_added` **and** `added_by_director_id = tournaments.director_id`.
  Cancelled or completed tournaments, anything after the event date, capacity
  and players' own self-service closing are all unchanged.
- **Web to-do:** expose "Add player" wherever web shows a tournament's
  registrations, using `director_add_tournament_registration()`, and make it
  usable after registration closes.
- **Mobile entry points:** the **Add** button beside the Workspace search, and
  Command Center → Add Registration. Both open
  `apps/mobile/src/app/tournament/[id]/add-registration.tsx`.

## 3. Paid divisions, paid on site

- **DB:** new columns `registrations.onsite_tender` (`cash | other | comp`),
  `onsite_amount_cents`, `onsite_recorded_by` and `onsite_recorded_at`.
  - **Recorded, never processed.** They never touch `entry_fee_paid_cents` or
    `stripe_*`, so refunds, payouts and revenue ignore them.
  - **Guarded:** only the RPC or `service_role` can write them
    (`fn_protect_registration_onsite_fields`).
  - **RPC:** `director_add_tournament_registration(..., p_onsite_tender text)`
    is required for a priced division. The amount is derived from the
    division's effective fee (0 when comped) and is never sent by the client.
    The old 6-argument signature was dropped.
- **Client rules to mirror:**
  - **Balance due:** 0 when `onsite_tender` is set
    (`apps/mobile/src/lib/supabase/registrations.ts`).
  - **Rows:** show "Cash $40 on site" or "Comped".
  - **Totals:** show a separate "$X collected on site", **not** in Revenue.
  - **Cancelling:** an on-site registration says "refund at the desk".
  - **Add form:** every division shows its fee, and a paid division needs
    Cash / Other / Comped before submitting.
- **Mobile files:** `add-registration.tsx`, `workspace.tsx`,
  `lib/supabase/directorRegistrations.ts`, `lib/directorRegistrationAdapter.ts`.
- **Open:** the owner hasn't tested the paid flow yet (parked). Changing a
  tender after adding a player isn't supported.

## 4. Division naming

- **Bug:** the name was built as `${gender} ${eventType}`, which produced
  "Men's Mixed Doubles".
- **Mobile rule** (`tournament/[id]/divisions/create.tsx`,
  `normalizePicks()` / `composeName()`):
  - Mixed Doubles forces gender Mixed, and the name is "Mixed Doubles".
  - Doubles + Mixed becomes Mixed Doubles, with format `mixed_doubles`.
  - Singles has no Mixed option.
  - Contradictory genders are disabled.
  - The name follows the picks until the director types their own.
- **Web to-do:** check whether web's division form has the same bug, and
  apply the same rule if so.
- **Data:** only the current event was corrected by hand. Past and cancelled
  events were deliberately left alone, at the owner's request.

## 5. Courts

- **DB:**
  - `tournaments.courts text[]` holds real court names in display order, for
    example `{7,8,9,12}` or `{Stadium,A}`.
  - `set_tournament_courts(p_tournament_id, p_courts)` is callable only by the
    approved director. It works in any status except completed/cancelled and
    doesn't re-trigger approval. It trims, drops blanks, removes duplicates
    ignoring case (keeping the first), and caps at 64 courts of 24 characters.
    Use it for every change after creation.
  - The unique index `bracket_matches_one_live_match_per_court` on
    `(tournament_id, court)` applies only where `court` is set and
    `completed_at` is null. A duplicate fails with Postgres error `23505`.
  - `bracket_matches.court` was already text and now holds the court name.
- **Client rules to mirror:**
  - **Parsing:** the input accepts ranges, lists and names (`7-12, 14,
    Stadium`) and strips a "Court" prefix (`lib/tournamentCourts.ts`).
  - **Display:** numeric names show as "Court 7"; other names show as typed.
  - **Picker statuses:** Available, This match, or In use with its division,
    round and match number.
  - **In use** means another tournament match has that court and is
    unfinished. This is checked across all divisions, and the court frees
    itself when the score is saved.
  - **Assigning:** only once both teams are known. Clear court is allowed.
  - **Lost race:** show "That court was just assigned to another match" and
    reload the statuses.
  - **Court count:** use the tournament's list length first, then the
    facility's `court_count` if it's above 0, otherwise hide the count (never
    show "0 courts").
- **Web already** shows a facility's court count in its venue picker.
  **Web to-do:** a courts editor on create and edit, a picker that uses the
  list and live status in any bracket or court-assignment view, and the
  court count on the public tournament page.
- **Mobile files:** `components/CourtListEditor.tsx`, `components/CourtsSheet.tsx`,
  `tournament/[id]/division-bracket.tsx` (CourtModal), `lib/supabase/matches.ts`
  (`fetchCourtsInUse`, `assignCourt`), and the court count in
  `components/FacilityPicker.tsx`.
- **Not covered:** round-robin play events keep their own court numbering
  (`rrScheduleStore`). Two separate tournaments sharing one venue court on the
  same day aren't blocked; the rule is per tournament.

## 6. Court auto-assign

- **DB (all automatic):** the `trg_bracket_court_automation` trigger on
  `bracket_matches` fills free courts whenever a match completes or becomes
  ready. Web gets this for free: any score saved from web moves the queue.
  - **Queue:** `court_queue(p_tournament_id)` returns `(match_id,
    queue_position)`. Use it for "Up next"; don't re-derive the order.
  - **Order:** `ready_at`, then the round relative to the division's own first
    round, then match number, then division. Opening matches count as ready
    from the start of the event day, so divisions interleave.
  - **Skipped:** a match whose player (profile or guest) is already on another
    court.
  - **Switch:** `tournaments.auto_assign_courts`, default true. Change it with
    `set_tournament_auto_assign_courts()`. Saving the court list through
    `set_tournament_courts()` also fills free courts.
- **Mobile UI** (`tournament/[id]/division-bracket.tsx`):
  - a realtime subscription on `bracket_matches` filtered by `tournament_id`,
    debounced by 400 ms;
  - "ON COURT 7" gold highlight for unfinished matches with a court;
  - "UP NEXT #n" for queue positions 1-5;
  - a Courts board strip above the rounds;
  - the Auto-assign switch in `CourtsSheet`.
- **Not supported yet:** holding a waiting match off the courts. A cleared match
  that is still first in line gets the next freed court. There are no player
  "you're up" notifications yet.

## 7. Tournament format (mobile now mirrors web)

- **What mobile added:** the web create-dialog "Tournament Structure" picker
  (`single_elim | double_elim | round_robin | pool_bracket | mlp`, plus
  `pool_count` for pool_bracket) on Create and Edit Tournament.
  - Same keys and labels as web: `apps/mobile/src/lib/tournamentFormats.ts`.
  - The format shows as a chip on the tournament page and in the Command
    Center header.
- **Web gap, the opposite way round:** web's `generateMatches` quietly builds
  single-elimination pairs for `double_elim`, `pool_bracket` and `mlp`. Mobile
  now asks for confirmation first (`confirmBracketFormat`, "X isn't supported
  yet. Generate Single Elimination?"). Web should show the same notice rather
  than falling back silently.
- **Next:** a real Pool → Bracket (hybrid) engine was chosen as the first
  format to build. It isn't scoped yet. The per-tournament vs per-division
  format question is still open.

## 8. Pool Play → Bracket (hybrid), step 1: pools

- **Decisions (owner, 2026-09-28):**
  - The format is set per tournament. Pool settings are per division.
  - 2 teams advance per pool by default, and the director can change it.
  - Pools are assigned automatically by rating.
  - Moving to the bracket is confirmed by the director. That's step 2, not built
    yet.
- **DB** (`20260928170000_pool_play`, live):
  - `bracket_matches.pool_label` ('A', 'B', ...). **`pool_label` marks pool
    play, not `round`:** `roundLabel()` also uses 'pool' for elimination
    rounds earlier than r64 in brackets over 128 entrants.
  - `divisions.pool_count` and `divisions.advance_per_pool` (default 2).
  - `division_pool_standings(division_id)` (SECURITY INVOKER) ranks by wins,
    then head-to-head wins among teams with the same win total, then point
    difference, then points scored.
- **Mobile:**
  - `lib/poolSchedule.ts` (pure logic): seeding by mean DUPR with unrated teams
    last, snake pools, circle-method round robin, pool-count suggestion.
  - `lib/supabase/pools.ts`: createPools, fetchDivisionPools and progress.
    Pool matches interleave across pools by `match_number`.
  - `components/PoolSetupSheet.tsx`.
  - The Brackets screen has Generate / View / Redo Pools.
  - The division screen has a Pools | Bracket toggle, standings tables and the
    reused MatchCard, so courts, queue, score entry and realtime all work.
  - Elimination readers and `createBracket`'s delete filter
    `pool_label is null`, so pools and the bracket never touch each other.
- **Web to-do:** web's pool seeding (`bracket_seeds`) is per tournament, by
  player, and never creates matches. Replace it with this model, and show the
  standings function's output.

## 9. Pool Play → Bracket, step 2: building the bracket (no DB change)

- **Seeding** (`lib/poolSchedule.ts`, unit-tested):
  - Tier first: every pool winner, then every runner-up. Within a tier, by pool
    record: wins, then point difference, then points scored (owner's choice).
  - Standard positions via `bracketPositions` (1v8, 4v5, 2v7, 3v6). Byes go to
    the top seeds.
  - `placeSeeds` swaps within a tier so no first-round match pairs two teams
    from the same pool.
  - `cutoffTies` flags exact ties at the qualification cut.
- **Engine:** `createBracket(..., { slots })` takes exact first-round slots.
  Plain single elimination is unchanged.
- **Mobile:**
  - The Pools view unlocks **Build bracket** once every pool match is scored.
  - `BuildBracketSheet` previews the seeds (e.g. "1 · Smith/Jones · A1"),
    byes, tie warnings, and a rebuild warning.
  - In a pools division, Regenerate means rebuild **from pools**. Redo Pools
    is hidden once a bracket exists.
- **Web to-do:** the same build flow and preview. Reuse the seeding rules
  (port `poolSchedule.ts`).

---

## Before starting the web session

1. Read `feedback_web_page_shell` in memory: every new web page goes inside
   PageShell and must work at phone width.
2. Web production is a **promoted preview**. Pushing doesn't deploy it. See the
   Vercel deploy model note in memory.
3. `packages/shared/src/database.types.ts` was edited by hand for these
   migrations (courts, onsite_*, `set_tournament_courts`,
   `p_onsite_tender`). Web may keep its own generated types, so check.
