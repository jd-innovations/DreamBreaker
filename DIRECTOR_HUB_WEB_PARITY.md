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
| 6 | Court auto-assign queue and live bracket | `eae6c69` | `20260928150000_court_auto_assign`, `20260928160000_court_queue_fairness` |
| 7 | Tournament format picker | `2f00b98` | none |
| 8 | Pool Play → Bracket, step 1: pools | `c15f995` | `20260928170000_pool_play` |
| 9 | Pool Play → Bracket, step 2: build the bracket | `b546a5a` | none |
| 10 | Division play status | `201559d` | `20260928180000_division_play_status` |
| 11 | Score corrections | `daed1e6` | `20260928190000_score_corrections` |

---

## Agreed target: web ↔ mobile (owner, 2026-09-28)

**Parity means one live system, not identical screens.** Every day-of fact (courts,
queue, scores, corrections, division status) lives in the database under the same
rules, both apps update live, and every action a director needs on the day works on
either device. Each app keeps the layout that suits it: web for the desk (drag-and-drop
courts board, bulk work), mobile for the courts (quick scoring, QR, walking the venue).

**Codex's `feature/tournament-live-operations` (uncommitted in
`C:\Users\dhjes\DreamBreaker-tournament`, 2026-08-27) is not the base.** It models
courts, queue and corrections differently from what is live (`tournament_courts` /
`court_assignments` / `operational_status` vs `tournaments.courts` / `court_queue()` /
`correct_match_score()`), was never applied, and its mobile edits would overwrite the
live court code. Reuse from it: the idea of hydrating Day Of from `bracket_matches`, and
the backlog items below (hold, no-show, activity log).

✅ works · ⚠️ partial · ❌ missing

| # | Feature | Web today | Mobile today | Target | Phase |
|---|---|---|---|---|---|
| | **Setup** | | | | |
| 1 | Create/edit tournament, format picker | ✅ | ✅ | Both | done |
| 2 | Court list (names, ranges) | ❌ | ✅ | Both | W1 |
| 3 | Divisions, "Mixed Doubles" naming rule | ✅ fixed presets | ✅ | Both | done (W2) |
| 4 | Seeding review / drag-reorder | ✅ `bracket_seeds` | ❌ | Web-first | — |
| 5 | Build single-elim bracket, saved to `bracket_matches` | ⚠️ in-browser pairs only | ✅ | Both, saved | W1 |
| 6 | Pool play: pools, standings, build bracket | ✅ | ✅ | Both | done (W3) |
| 7 | Sponsors, public page, analytics, messages | ✅ | partial | Web-first | — |
| | **Registration & check-in** | | | | |
| 8 | Registrations list + search | ✅ | ✅ | Both | done |
| 9 | Walk-ins after close, paid on site | ✅ | ✅ | Both | done (W2) |
| 10 | Manual check-in | ✅ | ✅ | Both | done |
| 11 | QR check-in scanning | ❌ | ✅ | Mobile-only | — |
| 12 | Exports (CSV) | ❌ | ❌ | Web-only | later |
| | **Running the day** | | | | |
| 13 | Live queue (`court_queue`), UP NEXT / ON DECK | ❌ in-browser | ✅ | Both | W1 |
| 14 | Assign / clear court, one live match per court | ⚠️ drag-drop, in-browser | ✅ | Both (web keeps drag-drop) | W1 |
| 15 | Auto-assign switch | ✅ | ✅ | Both | done (W2) |
| 16 | Division Start / Pause / Resume | ❌ | ✅ | Both | W2 |
| 17 | Score entry | ⚠️ in-browser | ✅ | Both | W1 |
| 18 | Score correction with reason, ⓘ history | ✅ | ✅ | Both | done (W2) |
| 19 | Live sync across devices | ❌ | ✅ | Both | W1 |
| 20 | Big-screen court board / venue TV | ❌ | ❌ | Web-only | later |
| | **Players & spectators** | | | | |
| 21 | Public brackets / results, live | ❌ none (BracketTree is director-only) | ✅ live | Both, live | W1b |
| 22 | "You're up on Court X" push | ❌ | ❌ | Mobile (push) | later |
| 23 | Pool standings view | ✅ public + director | ✅ | Both | done (W3) |
| | **Backlog** | | | | |
| 24 | Hold a match off the courts | ❌ | ❌ | Both | later |
| 25 | No-show / withdrawn skips future matches | ❌ | ❌ | Both | later |
| 26 | Full tournament activity log | ❌ | score edits only | Both (read on web) | later |

- **W1** Web Day Of on live data: rows 2, 5, 13, 14, 16, 17, 19. Row 16 moved up from W2
  because `court_queue` only includes live divisions. Also in W1: bracket, seeding and
  court rules shared in `packages/shared`, and one atomic `record_match_score` used by
  both apps (mobile's two-write save retired).
- **W1b** Public web tournament page with live brackets: row 21. **Done 2026-09-28**
  (0c90072): `web/src/components/tournament/live-brackets.tsx`, public Brackets +
  Leaderboard tabs, director LIVE BRACKETS tab, `tournament_guest_names` for guest names.

### W2 scope (agreed 2026-09-28). **Done 2026-09-28**, web only, no migrations

What shipped:
- `components/tournament/score-edit.tsx` (EditScoreDialog + ScoreEditInfo) and
  `lib/tournament/score-corrections.ts`. Used in LIVE BRACKETS (`<LiveBrackets director />`)
  and the Day Of Completed list. The public page's ⓘ shows when and the old score only.
- Day Of: the AUTO-ASSIGN label is now a switch (`setAutoAssignCourts` in `day-of.ts`).
- LIVE BRACKETS: Add 3rd-place match banner when a division has 2 semifinals and no bronze.
- Roster tab: Add Player (`components/director/add-registration-dialog.tsx`,
  `lib/tournament/director-registrations.ts`), search on player or partner, guest and partner
  names, CHECKED IN status, "Cash $40 on site" / "Comped", "$X collected on site";
  on-site rows are left out of the Overview Revenue tile.
- Division naming: closed, web only creates divisions from the fixed FORMAT_OPTIONS presets.
- Public page: Schedule is derived from checkin_opens_at / checkin_closes_at / start_time and
  hidden when none is set; Prize shows only the real total and is hidden when unset; Rules and
  the Overview "About" card show only the director's own text; the FAQ tab was removed.
- Web still has no cancel-registration action, so the "refund at the desk" note has nowhere
  to go yet.

The original scope, for reference:

All database functions below are live; W2 is web client work unless noted.

1. **Score corrections + ⓘ history** (row 18). `preview_score_correction` then
   `correct_match_score(match, s1, s2, reason)`; director/admin only; reason required;
   shows what gets cleared (now including a played 3rd-place match). Audit rows in
   `bracket_match_score_edits` (director/admin readable). Add "Edit score" to completed
   matches in the director LIVE BRACKETS view and the Day Of completed list; the ⓘ shows
   when, old score, editor, reason (public sees only when + old score, as on mobile).
   Mobile reference: `division-bracket.tsx` score modal edit mode, `lib/supabase/matches.ts`.
2. **Auto-assign switch** (row 15). `set_tournament_auto_assign_courts(p_tournament_id,
   p_enabled)`; Day Of currently only displays "AUTO-ASSIGN ON/OFF". Mobile: `CourtsSheet`.
3. **Walk-ins after close, incl. paid on site** (row 9).
   `director_add_tournament_registration(p_tournament_id, p_division_id, p_player_id |
   p_guest, p_partner_id | p_partner_guest, p_onsite_tender)`; tender cash | other | comp
   required for a priced division; amount derived server-side. Web has no Add Player
   today. Client rules in section 3 above. Mobile: `tournament/[id]/add-registration.tsx`.
4. **Add 3rd-place match** to an existing bracket: `add_third_place_match(p_tournament_id,
   p_division_id)` (errors: already_exists, no_semifinals, semifinal_walkover). Offer it in
   the director LIVE BRACKETS view when a division has semifinals and no bronze.
5. **Division naming** (row 3): web uses fixed presets in `web/src/app/director/page.tsx`
   (FORMAT_OPTIONS), so the "Men's Mixed Doubles" bug likely can't happen. Verify and close.
6. **Invented content on the public page** (`tournaments/[id]/tournament-detail-client.tsx`,
   AGENTS.md "no fake data"): the Schedule tab is a hard-coded day for every tournament;
   the Overview description fallback claims "Pro Circuit", pool play and live scoring;
   check Prize and FAQ too. Replace with real fields (event_date, start_time,
   checkin_opens_at/closes_at, prize_pool_cents, rules) or hide the section when empty.
   Owner decision needed on what to hide vs derive.
- **W2** Director controls: rows 3, 9, 15, 18.
- **W3** Pool play on web: rows 6, 23. **Done 2026-09-29.**
  - Rules moved to `packages/shared/src/poolSchedule.ts` (placement, interleaved round robin,
    seeding, same-pool split, cut ties), unit-tested; mobile `lib/poolSchedule.ts` and
    `createPools` now use it.
  - Web: `lib/tournament/pools.ts`, `components/director/pool-play-panel.tsx` (Bracket tab for
    Pool Play → Bracket: Generate / Redo Pools, standings, Build / Rebuild bracket with seed
    preview), `components/tournament/pool-standings.tsx` (standings above each pool in the
    public Brackets tab and director LIVE BRACKETS).
  - The old per-player drag-and-drop pool columns (`bracket_seeds.pool_letter`) were removed
    with the owner's OK; AUTO-SEED / GENERATE / LOCK are hidden for pool tournaments.
  - `20260928290000_pool_standings_public`: `division_pool_standings` granted to anon.
  - Moving a team between pools by hand is not supported on either app (owner, 2026-09-29).

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
- **Web:** done in W3 (see the phase notes above).

## 9. Pool Play → Bracket, step 2: building the bracket (no DB change)

- **Seeding** (`packages/shared/src/poolSchedule.ts`, unit-tested since W3):
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
- **Web:** done in W3; the seeding rules are shared (`packages/shared/src/poolSchedule.ts`).

## 10. Division play status (only live divisions get courts)

- **DB** (`20260928180000_division_play_status`, live):
  - `divisions.play_status` = `not_started` (the default) | `live` | `paused`.
  - `court_queue` includes only live divisions.
  - `trg_division_play_status_changed`: when a division goes live (from
    not_started or paused), its waiting matches get `ready_at =
    clock_timestamp()` (back of the line), then free courts fill.
  - Pausing never takes a match off a court.
  - "Complete" is derived: the division's final is scored.
  - Directors set the status with a plain update (the existing
    "director manage own" policy).
- **Mobile:**
  - `components/DivisionPlayControl.tsx` (chip, plus Start / Pause / Resume
    with a pause confirmation), shown on Brackets cards, a status bar on the
    division bracket screen, and Command Center "Divisions in play".
  - The court picker notes when a division isn't live. Hand-assigning is still
    allowed.
- **Web to-do:** the same control. Web's generate / assign views should
  respect it.

## 11. Score corrections (item 9)

- **DB** (`20260928190000_score_corrections`, live):
  - `correct_match_score(match, s1, s2, reason)`: SECURITY DEFINER; the
    tournament's approved director or an admin; reason required; same score
    rules as the app. All or nothing: if the winner changes, the new winner
    takes the next-match slot, and any later matches on that path that were
    already played are cleared (score, winner, completion and court released,
    their advancement undone). Then courts refill.
  - `preview_score_correction` is read-only and reports `winner_changed` and
    `cleared_count`.
  - Public on the match: `score_edited_at`, `score_edited_prev`.
  - `bracket_match_score_edits` is the audit (editor, reason, cleared ids).
    Only directors and admins can read it; only the function writes it.
- **Mobile:**
  - The director bracket and pools views have "Edit score" on completed
    matches: the score modal in edit mode, with a required reason and a
    confirmation showing what will be cleared. A pool match edited after the
    bracket was built shows a "rebuild" hint.
  - The "i" on edited matches: everyone sees when and the old score; the
    director also sees the editor and reason (director and player bracket
    views).
- **Web to-do:** the same edit flow and "i".

---

## Before starting the web session

1. Read `feedback_web_page_shell` in memory: every new web page goes inside
   PageShell and must work at phone width.
2. Web production is a **promoted preview**. Pushing doesn't deploy it. See the
   Vercel deploy model note in memory.
3. `packages/shared/src/database.types.ts` was edited by hand for these
   migrations (courts, onsite_*, `set_tournament_courts`,
   `p_onsite_tender`). Web may keep its own generated types, so check.
