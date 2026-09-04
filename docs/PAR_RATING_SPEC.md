# PAR Rating Spec

# PAR - Pickleball Activity Rating

## Overview

PAR (Pickleball Activity Rating) is DreamBreaker's proprietary player rating system.

Its purpose is to estimate a player's current playing ability using their complete pickleball activity, not only tournaments.

PAR is built around transparency, explainability, and continuous improvement.

PAR is not intended to replace DUPR or other external ratings.

Instead, it complements them by incorporating recreational play, leagues, community games, verified open play, and future activity data.

DreamBreaker should become the place where players understand their entire pickleball journey, not just tournament performance.

---

# Product Philosophy

PAR exists to answer one simple question:

> "Based on everything we know today, how is this player currently performing?"

PAR should always feel:

- Fair
- Transparent
- Explainable
- Predictable
- Difficult to manipulate
- Easy to understand

A player should never wonder why their rating changed.

Every movement must have a human-readable explanation.

---

# Guiding Principles

## Performance Moves PAR

Winning against stronger opponents improves PAR.

Losing to weaker opponents decreases PAR.

Playing frequently does not automatically increase PAR.

---

## Data Quality Increases Confidence

Playing more games gives DreamBreaker more information.

Verified games increase confidence.

Playing different opponents increases confidence.

Playing different partners increases confidence.

Confidence reflects how trustworthy the rating is.

---

## Transparency Is Required

Every PAR movement must explain:

- Why it changed.
- Why it did not change.
- What influenced it.
- What did not influence it.

No unexplained rating changes.

---

## Simplicity Over Complexity

If two mathematically equivalent approaches exist, DreamBreaker should choose the one that can be explained to players in plain language.

---

# PAR Scale

Recommended V1

Minimum

1.0

Maximum

6.0

Display precision

1 decimal

Internal precision

2 decimals

Example

3.8 PAR

---

# PAR Stages

Every player progresses through rating stages.

## Building PAR

Player has not yet completed enough qualifying games.

Display:

Building Your PAR

Progress:

0 / 8 qualifying games

Estimated completion requirements should be visible.

---

## Estimated

Initial PAR estimate.

Low confidence.

Moves quickly.

---

## Provisional

Enough data exists to estimate playing level.

Confidence improving.

Moderate movement.

---

## Established

Reliable rating.

Confidence high.

Movement becomes smaller.

---

## Verified

Highly reliable rating.

Large historical sample.

Movement should be gradual.

---

# Confidence

Confidence measures how much DreamBreaker trusts the rating.

Confidence is independent from PAR.

Two players may have identical PAR values but different confidence.

Example

Player A

PAR

3.8

Confidence

92%

Player B

PAR

3.8

Confidence

34%

Both players have similar skill estimates.

Only one has enough data to strongly support that estimate.

---

# Confidence Inputs

Confidence may consider:

- Number of scored games
- Number of verified games
- Number of unique opponents
- Number of unique partners
- Number of facilities
- Tournament participation
- Recency
- Data consistency
- Verification quality

Exact weighting should remain configurable.

---

# Initial PAR

New users receive an Estimated PAR.

Possible inputs

- Self rating
- Skill selection
- Existing DUPR
- Existing external rating
- Coach assessment (future)

Suggested mapping

| Onboarding Skill | Initial PAR |
| --- | ---: |
| Beginner | 2.0 |
| 2.5 & Below | 2.4 |
| 3.0-3.5 | 3.25 |
| 3.5-4.0 | 3.75 |
| 4.0-4.5 | 4.25 |
| 4.5+ | 4.75 |

If a verified external rating exists, DreamBreaker may initialize PAR near that value while keeping confidence low until enough DreamBreaker activity exists.

---

# Qualifying Games

A game may affect PAR only when it satisfies minimum quality requirements.

Examples

- Complete score
- Winner recorded
- Valid participants
- Session completed
- Not disputed

Games that do not qualify should still appear in:

- Match history
- Session history
- My Stats

They simply should not affect PAR.

---

# Supported Rating Sources (V1)

## Core Product Rule

Any registered user who participates in an eligible tournament or organized event must
have **organizer-submitted scores count toward PAR**.

PAR V1 **must not** be limited to personal-session games.

Wherever valid participant identity and completed scores already exist, the following
sources must feed PAR:

- Personal matches
- Tournaments
- Round robins
- Mini tournaments
- Organized Community Play
- Leagues or facility-operated events supported by the current schema

## Source → Data Mapping

| Source | Table | Score fields | Participant identity | Status today |
| --- | --- | --- | --- | --- |
| Personal matches | `personal_games` / `personal_sessions` | present | `personal_game_participants` | Wired to PAR |
| Tournaments | `bracket_matches` | `score_team1[]`, `score_team2[]`, `winner`, `score_entered_by/at` | `team1_player_a/b`, `team2_player_a/b` | Not yet ingested |
| Round robins | `play_matches` (`round_robin`) | `score_a`, `score_b`, `winner` | `player_a_id` / `player_a2_id` / `player_b_id` / `player_b2_id` | Not yet ingested |
| Mini tournaments | `play_matches` (`mini_tournament`) | same | same | Not yet ingested |
| Organized Community Play | `play_matches` (`open_play` / `mixer` / `ladder` / `kings_court` / `clinic`) | same | same | Not yet ingested |
| Leagues / facility events | No dedicated table — modeled via `play_events` or `tournaments` | via host table | via host table | Ingest through host table; no new schema required for V1 |

The same qualifying-game requirements above (complete score, winner recorded, valid
registered participants, not disputed) apply to every source. Temporary/guest players
remain recorded but non-qualifying until they claim an account (see Temporary Players).

## Implementation

Delivered in migration `supabase/migrations/20260724000000_par_v1_organized_events.sql`:
the personal-only FKs on `par_game_processing`/`par_rating_events` are dropped and a
`source_type` (`personal` | `play_match` | `bracket_match`) discriminator is added. A
generalized `par_process_match_roster(...)` reuses the personal engine's math, fed by
`process_play_match_par` / `process_bracket_match_par` and their eligibility evaluators.
Organizer scores auto-process via triggers on play-event completion and bracket-match
completion, map to the new `official` verification level, and existing completed matches
are backfilled. Personal-game PAR behavior is unchanged (`source_type='personal'`).

---

# Temporary Players

DreamBreaker supports Temporary Players.

Games involving temporary players should still be recorded.

As temporary players later claim accounts, historical games may become eligible for higher-confidence PAR calculations.

Historical linking should improve confidence, not rewrite history unexpectedly.

---

# Verification Levels

Every game has a verification level.

Self Reported

Partner Confirmed

Opponent Confirmed

Fully Verified

Official

Higher verification increases confidence in the result.

Verification strengthens rating quality.

Verification alone should never increase PAR.

---

# What Influences PAR

Examples

- Match result
- Score differential
- Opponent strength
- Partner strength
- Game type
- Session type
- Tournament context
- Recent performance
- Verification quality
- Confidence level

Exact weighting should remain configurable.

---

# What Does Not Influence PAR

The following should never directly increase PAR.

- Number of workouts
- Calories
- Steps
- Court visits
- Messages
- Friends
- Achievements
- Badges
- App usage

These may improve analytics or confidence but never player skill.

---

# Reference Algorithm

Version 1 should intentionally remain simple.

The implementation should be modular so future versions may evolve without changing the overall philosophy.

Suggested V1 concepts

Expected Result

Actual Result

Score Differential

Context Weight

Confidence Weight

Partner Strength

Opponent Strength

These values should come from configurable constants rather than hard-coded numbers scattered throughout the application.

---

# Movement Limits

To avoid unstable ratings:

Maximum single-session movement

Configurable

Maximum daily movement

Configurable

High-confidence players should experience smaller movement than Estimated players.

---

# Explainability

Every PAR update must include a human explanation.

Examples

"You defeated a stronger team."

"Close loss against stronger opponents."

"Tournament result carried additional weight."

"Early ratings move faster because confidence is still building."

---

# No Movement

DreamBreaker should also explain when PAR does not change.

Examples

"Game awaiting verification."

"Opponent ratings still provisional."

"Result excluded due to dispute."

---

# PAR Outputs

Every player should expose

current_par

par_stage

par_confidence

par_updated_at

par_history

par_trend_7d

par_trend_30d

last_par_change_reason

last_par_explanation

---

# Analytics Integration

PAR is one output of the larger My Stats system.

Future analytics include

- Best Partner
- Best Facility
- Home Court Advantage
- Mixed Doubles Performance
- Singles Performance
- Indoor vs Outdoor
- Morning vs Evening
- Left-handed Opponents
- Preferred Court Side
- Weather Correlation
- Session Trends
- AI Coaching

PAR should integrate with these systems but remain independent from them.

---

# Versioning

PAR should support versioning.

Future algorithm improvements should not require rewriting historical code.

Suggested example

PAR v1

PAR v1.1

PAR v2

Every algorithm revision should document

- Version
- Date
- Summary
- Expected impact
- Migration strategy
- Whether historical ratings are recalculated

---

# Final Principle

DreamBreaker is not trying to create a mysterious rating.

DreamBreaker is trying to create the most understandable player rating in pickleball.

Players should always understand:

- Why their PAR changed.
- Why it did not.
- What they can do to improve.
- What increases confidence.
- What information DreamBreaker still needs.

Transparency is a core feature of PAR, not an afterthought.