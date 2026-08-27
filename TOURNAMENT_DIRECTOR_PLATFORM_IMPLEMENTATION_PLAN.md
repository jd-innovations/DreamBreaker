# Tournament Director Platform — Implementation Plan

Use `TOURNAMENT_DIRECTOR_PLATFORM_PRD_v1.3.md` and `TOURNAMENT_DIRECTOR_PLATFORM_AUDIT.md` as the source of truth.

Implementation must be incremental, preserve existing working functionality, and maintain **one continuous tournament state** from pre-event setup through live operations and final results.

## Phase 1A — Authoritative Lifecycle

### Goal

Establish the authoritative tournament and match lifecycle before changing UI behavior.

### Tournament lifecycle

Implement/normalize:

`Pre-Event → Published → Live → Completed`

Define permitted transitions and authorization.

### Match lifecycle

Implement:

`Pending → Eligible → Queued → Called → On Court → Score Pending → Completed`

Support exception states where required:

* Held
* Delayed
* Cancelled
* Forfeit
* Disputed

### Requirements

* Extend existing authoritative records rather than create duplicate live records.
* Pre-generated matches remain the same records when competition goes live.
* Existing brackets remain the same brackets.
* Existing pool assignments remain connected to live competition.
* Add timestamps and state metadata required for live operations.
* Add concurrency/version protection where appropriate.

### Deliverable

Forward-only Supabase migrations plus updated generated types.

Stop and validate lifecycle behavior before continuing.

---

## Phase 1B — Tournament Event & Audit Foundation

### Goal

Create an authoritative history of meaningful tournament operations.

Add an append-only tournament activity/event model capable of recording:

* Tournament went live
* Match became eligible
* Match queued
* Queue order changed
* Court assigned
* Court reassigned
* Match called
* Match started
* Score submitted
* Score finalized
* Score corrected
* Match completed
* Court unavailable
* Court restored
* Player substituted
* Player withdrawn
* No-show
* Override
* Bracket advanced
* Pool finalized

Record where appropriate:

* Tournament
* Match
* Division/session
* Actor
* Event type
* Timestamp
* Previous state
* New state
* Reason
* Metadata

This event layer will later power realtime and communications.

---

## Phase 2 — Transactional Live Operations RPCs

### Goal

Remove critical tournament operations from direct client mutation.

Implement secure server-authoritative RPCs for:

### Tournament

* `go_live`
* `complete_tournament`

### Match Queue

* Mark eligible
* Queue
* Requeue
* Hold
* Release hold
* Reorder queue

### Court Operations

* Assign court
* Reassign court
* Release court
* Mark court unavailable
* Restore court

### Match Operations

* Call match
* Start match
* Submit/finalize score
* Correct/reopen score
* Complete match
* Forfeit

### Participant Exceptions

* Substitute player
* Mark injured
* Mark no-show
* Withdraw player/team
* Disqualify where supported

### RPC requirements

Each critical RPC should include as appropriate:

* Authorization
* Row locking
* Idempotency
* State-transition validation
* Conflict detection
* Server timestamps
* Audit/event creation
* Clear result/error codes

Do not allow the client to independently advance competition state after these RPCs exist.

---

## Phase 3 — Court Assignment Model

### Goal

Create a reliable operational court model while preserving assignment history.

Treat:

**Match = competition state**

**Court Assignment = operational relationship/history**

Evaluate and extend existing `court_assignments` rather than relying only on `bracket_matches.court`.

Support:

* Current assignment
* Assignment timestamp
* Call/start/end timestamps
* Reassignment
* Release
* Assignment history
* Court availability status
* Reason for reassignment

Example history:

`Match 42 → Court 7 → Court 7 unavailable → Court 10 → Completed`

Do not overwrite historical assignment information.

---

## Phase 4 — Refocus Director Web Command Center

### Goal

Convert the existing Director day-of web UI from local state to authoritative tournament state.

Preserve useful existing UI and interaction patterns.

Replace local:

* Generated matches
* Queue
* Court assignments
* Completed-match state

with Supabase-backed authoritative data.

### Command Center sections

Implement/refocus:

* Tournament Pulse
* Active session
* Court board
* Matches playing
* Ready queue
* Blocked/pending matches
* Score pending
* Check-in readiness
* Operational alerts

All meaningful actions must call the new RPC layer.

---

## Phase 5 — Interactive Director Operations

### Goal

Make the web Command Center function as a true tournament control board.

Implement drag-and-drop where appropriate for:

* Queue ordering
* Match → court assignment
* Court reassignment
* Teams between pools
* Seed ordering

Every drag operation must have a non-drag alternative.

### Validation

Before committing a move, validate:

* Match eligibility
* Court availability
* Player conflicts
* Session
* Rest recommendation
* Division restrictions
* Existing assignments

Support:

### Hard constraints

Action blocked.

### Soft constraints

Warning + authorized override.

Record overrides in the activity log.

---

## Phase 6 — Sessions

### Goal

Introduce first-class tournament sessions if confirmed missing by audit.

Support:

* Name
* Date
* Start/end time
* Check-in window
* Assigned divisions
* Assigned courts
* Status
* Session announcements

Example:

**Morning — Gender Doubles**

**Afternoon — Mixed Doubles**

Sessions should scope Command Center operations and match eligibility without duplicating tournament data.

---

## Phase 7 — Authoritative Pools

### Goal

Replace local-only pool concepts with persistent competition structures.

Implement/normalize:

* Pools
* Pool membership
* Pool seed/order
* Pool matches
* Pool status

Allow directors to:

* Generate pools
* Create manually
* Drag teams between pools
* Swap teams
* Lock pools
* Generate matches

Pre-event pool matches must become the same matches used during live scoring.

---

## Phase 8 — Pool Standings & Tiebreakers

### Goal

Provide deterministic live pool standings.

Implement authoritative calculations for configured rules such as:

* Wins/losses
* Games won/lost
* Point differential
* Head-to-head
* Other approved tiebreakers

Standings recalculate whenever a pool match is finalized or corrected.

Tiebreaker logic must be auditable and deterministic.

---

## Phase 9 — Pool-to-Bracket Continuity

### Goal

Complete the core PRD requirement of seamless pre-event structure → live advancement.

Support preconfigured bracket placeholders:

`Pool A #1 vs Pool C #2`

When pools finalize:

1. Calculate final standings.
2. Apply tiebreakers.
3. Generate proposed seeds.
4. Director reviews where required.
5. Resolve existing bracket placeholders.
6. Existing bracket matches become eligible.
7. Queue updates.

Do not recreate the bracket.

---

## Phase 10 — Score Correction & Recovery

### Goal

Make competitive state safely correctable.

Implement controlled score correction with:

* Permission checks
* Original score preservation
* Reason
* Audit record
* Downstream dependency analysis

Warn when a corrected result affects:

* Standings
* Seeds
* Completed advancement
* Already-played downstream matches

Do not silently rewrite downstream history.

---

## Phase 11 — Exception Workflows

### Goal

Handle real tournament disruptions without corrupting competition state.

Implement complete workflows for:

### Player substitution

* Before play
* During pool play
* During elimination

### Injury

* Hold
* Replace
* Withdraw
* Retire
* Forfeit

### No-show / withdrawal

Evaluate downstream matches and standings.

### Court failure

* Mark unavailable
* Identify affected match
* Requeue/reassign
* Recalculate available capacity
* Restore court

Every consequential action should create an event/audit entry.

---

## Phase 12 — Realtime Tournament State

### Goal

Make all live surfaces reflect the same tournament state.

Add/review realtime publication and subscriptions for required records, including:

* Matches
* Court assignments
* Court status
* Registrations/check-in
* Pools
* Standings
* Bracket changes
* Tournament/session state
* Operational events

Update Director Web first.

Then reuse the same state for player-facing surfaces.

---

## Phase 13 — Public Live Tournament Page

### Goal

Allow anyone to follow the event without installing the app.

Build/refocus the existing public tournament route to include:

* Tournament live status
* Current session
* Announcements
* Live courts
* Matches in progress
* On deck
* Pools
* Standings
* Brackets
* Scores
* Results

Add:

**Find My Matches**

Search by player/team and surface:

* Current status
* Next opponent
* Queue status
* Court
* Result
* Standing
* Next advancement

---

## Phase 14 — Communication Engine

### Goal

Connect authoritative tournament events to communication channels.

Create a routing layer based on event type and urgency.

Initial channels:

* Web realtime
* In-app
* Push

Example event mappings:

**Match Queued**
→ in-app status

**Match Called**
→ push

**Court Changed**
→ immediate push

**Bracket Published**
→ push/in-app

**Major schedule change**
→ push + optional email

Do not duplicate tournament logic inside notification code.

---

## Phase 15 — Player Acknowledgment

For critical events support:

* Sent
* Delivered where available
* Viewed
* Acknowledged
* Failed

Director Command Center may show:

**3 / 4 acknowledged**

Use this primarily for match calls and major operational changes.

---

## Phase 16 — iOS Live Activities

Only after authoritative live events are stable.

Consume existing tournament events for:

* Up next
* On deck
* Report to court
* Court change
* Match state
* Result
* Advancement

Live Activities must remain presentation-only.

---

## Phase 17 — SMS Escalation

Add SMS only after push/event routing is established.

Initial use:

* Match called
* Court changed
* Major delay
* Emergency communication

Potential escalation:

`Push → no acknowledgment → SMS`

Include:

* User preferences
* Cost controls
* Delivery status
* Failure handling

---

## Phase 18 — Operational Analytics

Track:

* Court utilization
* Court idle time
* Match turnaround
* Matches/hour
* Queue time
* Match duration
* Schedule variance
* Score-entry delay
* Court reassignments
* Court failures
* Overrides
* Substitutions
* Notification acknowledgment
* Tournament completion time

Preserve events required for later Admin Analytics.

---

## Phase 19 — Optimization & Intelligence

Only after enough real tournament data exists.

Potential future functionality:

* Match start estimates
* Court release estimates
* Delay prediction
* Bottleneck detection
* Rest-aware recommendations
* Court utilization recommendations
* Intelligent queue ordering
* Schedule forecasting

These should initially remain recommendations rather than autonomous decisions.

---

## Implementation Rules

Throughout all phases:

1. **Do not rebuild working tournament functionality unnecessarily.**
2. Use forward-only migrations.
3. Preserve registrations, payments, divisions, check-in, messaging and existing authoritative records.
4. Do not create separate live copies of matches, pools or brackets.
5. Keep critical tournament logic server-authoritative.
6. Prefer RPCs for operations affecting competitive state.
7. Protect against concurrent director/staff actions.
8. Add audit/event history for consequential actions.
9. Keep web, mobile and public pages consuming the same underlying tournament state.
10. Validate each phase before beginning the next.

---

## Recommended Immediate Build Scope

Begin with only:

**Phase 1A → Phase 1B → Phase 2 → Phase 3**

That means:

**Lifecycle → Events/Audit → RPC Operations → Court Assignment Model**

Do not begin the Command Center refocus until this foundation is validated.

At the end of these foundation phases, provide:

* Migrations created
* RPCs created
* Updated schema diagram
* Lifecycle transition matrix
* Court assignment model
* Event/audit model
* Tests performed
* Known risks
* Recommended next phase

Then stop for review before proceeding.
