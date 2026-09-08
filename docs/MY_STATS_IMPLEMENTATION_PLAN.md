# My Stats Implementation Plan

## Phase 0

Audit Existing Code

Deliverables

Acceptance Criteria

---

## Phase 1

Player Card

Acceptance Criteria

Files

Database

---

## Phase 2

Play Session

Acceptance Criteria

---

## Phase 3

Game Logging

---

## Phase 4

Verification

---

## Phase 5

Analytics

---

## Phase 6

PAR

### Scope (mandatory)

Regardless of final phase numbering, PAR must implement this rule before it is
considered complete:

> Any registered user who participates in an eligible tournament or organized event
> must have organizer-submitted scores count toward PAR. PAR V1 must not be limited to
> personal-session games.

Rating sources (see `docs/PAR_RATING_SPEC.md` → **Supported Rating Sources (V1)**):

- Personal matches — `personal_games` (already wired)
- Tournaments — `bracket_matches`
- Round robins / mini tournaments / organized Community Play — `play_matches`
- Leagues / facility events — via `play_events` or `tournaments` (no new table for V1)

Implementation deliverables:

- Generalize `par_game_processing` / `par_rating_events` off the personal-only FKs so a
  rating event references `(event_type, game_id)` polymorphically; preserve existing
  personal rows.
- Add eligibility evaluators for `play_matches` and `bracket_matches` mirroring
  `evaluate_personal_game_par_eligibility`.
- Map organizer-submitted organized-event scores to a higher verification level than
  self-reported personal games.
- Backfill already-completed organized-event scores with registered participants
  (idempotent, gated by algorithm version).

This may land in a later phase, but it is required — not optional.

---

## Phase 7

Fitness

---

## Phase 8

AI Insights