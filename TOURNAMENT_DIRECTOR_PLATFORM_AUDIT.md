# Tournament Director Platform Audit

Source of truth: `TOURNAMENT_DIRECTOR_PLATFORM_PRD_v1.3.md`

Scope: Phase 0 audit only. This document assesses current DreamBreaker tournament infrastructure against PRD v1.3 and identifies reuse, gaps, risks, and recommended implementation sequence. No implementation, refactor, schema change, or UI rebuild is included.

Phase 0 status: accepted as complete. Preserve the findings and gap classifications in this audit unless a future implementation phase produces new evidence.

## 1. Executive Summary

DreamBreaker already has a meaningful tournament foundation: tournament creation, approval-oriented statuses, divisions, registrations, team payment groups, guest/manual director registrations, QR/manual check-in, bracket seed storage, DB-backed bracket matches, basic score entry, payment functions, notifications, conversations, and some realtime publication setup.

The platform is not yet aligned with the PRD's core requirement: one continuous tournament state from setup through live operations to completed results. The biggest gap is that the current "live tournament" behavior is split across DB state, local React state, and older in-memory stores. In particular, the web director day-of queue/court UI is not authoritative, while mobile bracket scoring writes directly to `bracket_matches` without a transactional live operations layer.

The recommended next phase is Phase 1A through Phase 1C: authoritative tournament lifecycle, transactional operations layer, and web command center refocus. This is not a visual rebuild. It should preserve one continuous tournament state where pre-generated matches, pools, and brackets transition into live operations without creating separate live copies. Existing registration, payment, check-in, director, public tournament, and messaging infrastructure should be reused.

## 2. Current Architecture

Current tournament architecture is split across Supabase, mobile Expo screens, Next.js web director/player screens, and a legacy frontend directory.

Supabase is the strongest foundation. The baseline schema includes `tournaments`, `divisions`, `registrations`, `bracket_matches`, `bracket_seeds`, `court_assignments`, `transactions`, `tournament_bookmarks`, `tournament_sponsors`, `notifications`, conversations, and RLS policies. Later migrations add team payment groups, director manual registration, guest players, check-in RPC, and realtime publication for selected tables.

Mobile contains production-relevant tournament flows:

- `apps/mobile/src/app/director.tsx`
- `apps/mobile/src/app/director/create-tournament.tsx`
- `apps/mobile/src/app/tournament/[id].tsx`
- `apps/mobile/src/app/tournament/[id]/workspace.tsx`
- `apps/mobile/src/app/tournament/[id]/command-center.tsx`
- `apps/mobile/src/app/tournament/[id]/check-in.tsx`
- `apps/mobile/src/app/tournament/[id]/check-in-scan.tsx`
- `apps/mobile/src/app/tournament/[id]/check-in-qr.tsx`
- `apps/mobile/src/app/tournament/[id]/brackets.tsx`
- `apps/mobile/src/app/tournament/[id]/division-bracket.tsx`
- `apps/mobile/src/app/tournament/[id]/player-brackets.tsx`
- `apps/mobile/src/app/tournament/[id]/player-results.tsx`

Mobile services include tournament, division, registration, group payment, bracket, match, and court helpers under `apps/mobile/src/lib/supabase`.

Web contains the most PRD-like director surface:

- `web/src/app/director/page.tsx`
- `web/src/app/director/tournaments/[id]/page.tsx`
- `web/src/components/shared/bracket-tree.tsx`
- `web/src/app/tournaments/page.tsx`
- `web/src/app/tournaments/[id]/page.tsx`

However, the web director tournament page currently uses local state for generated matches, court assignments, queued matches, and completed matches. That makes it useful as a UX prototype/foundation, but not yet an authoritative live command center.

Legacy/mock frontend files under `frontend/src/pages` appear to be non-authoritative design or prototype material. They should not become the implementation source of truth.

## 3. Existing Tournament Lifecycle

Current lifecycle support exists, but it is uneven.

| Lifecycle stage | Current state | Assessment |
|---|---|---|
| Create tournament | Mobile and web can create tournaments. Schema supports venue/facility, format, fees, divisions, dates, approval status. | EXISTS |
| Configure divisions | `divisions` table and mobile/web flows exist. | EXISTS |
| Configure sessions | No first-class tournament session model. `event_date`, check-in windows, and UI fields exist, but not PRD sessions. | MISSING |
| Register players | Registrations, holds, payments, waitlist concepts, manual director registration, guest players, and group payments exist. | EXISTS |
| Team payment continuity | `registration_groups` and `registration_group_members` support per-member payment obligations. | EXISTS |
| Approve/publish | Tournament statuses and approval flows exist. | PARTIAL |
| Check-in | Strong QR/manual check-in RPC with authorization and row locking exists. | EXISTS |
| Seed players | `bracket_seeds` persists seed number, pool letter, and lock state. Web has drag/drop seeding. | PARTIAL |
| Generate brackets | Mobile has DB-backed bracket generation into `bracket_matches`; web has local generated matches. | PARTIAL / REFACTOR |
| Generate pool matches | Web can generate local round-robin/pool-style matches, but not authoritative DB pool matches. | MISSING |
| Go live | No explicit go-live transition or command-center state boundary. | MISSING |
| Match lifecycle | Current states are derived from court/winner fields. PRD lifecycle is not modeled. | MISSING |
| Court assignment | `court_assignments` exists, mobile writes `bracket_matches.court`, web uses local state. | PARTIAL / REFACTOR |
| Score entry | Mobile score entry updates DB and advances next match. | PARTIAL |
| Score correction | No transactional correction/reopen/cascade workflow. | MISSING |
| Pool-to-bracket advancement | No authoritative standings/tiebreakers or placeholder resolution. | MISSING |
| Substitutions/no-shows | Registration statuses and some director actions exist. No live override workflow. | PARTIAL |
| Public live page | Public tournament pages and player bracket/result pages exist. Live queue/court state is not surfaced as PRD requires. | PARTIAL |
| Communications | Notifications, templates, conversations, and message push exist. Live tournament event communication is not integrated. | PARTIAL |
| Complete tournament | Some bracket completion detection exists. No formal tournament completion workflow with results publishing. | PARTIAL |

## 4. PRD Gap Matrix

| PRD requirement | Status | Current evidence | Gap |
|---|---:|---|---|
| One continuous tournament state | REFACTOR | Shared tables exist, but web live ops and older stores duplicate state. | Need one authoritative DB lifecycle. |
| Director web platform as primary operations surface | PARTIAL | `web/src/app/director/tournaments/[id]/page.tsx` has setup/day-of UI. | Day-of operations are local state, not persisted. |
| Public live tournament page | PARTIAL | Web/mobile tournament pages exist. | Need live courts, queue, called matches, results, player lookup. |
| Native player experience | PARTIAL | Mobile tournament, QR, brackets, results exist. | Need live updates, Find My Matches, push/live activity hooks. |
| Event metadata setup | EXISTS | `tournaments` schema and create/edit forms. | Needs alignment with PRD field naming and validation. |
| Sessions | MISSING | No tournament session table/model. | Add session model or approved equivalent. |
| Divisions/categories | EXISTS | `divisions` table and screens. | Needs final PRD validation rules. |
| Pools | PARTIAL | `bracket_seeds.pool_letter` exists. | No first-class pool structure or authoritative pool match generation. |
| Seeds | PARTIAL | `bracket_seeds` and drag/drop web seeding. | Need unified generation into live match records. |
| Brackets | PARTIAL | DB `bracket_matches`; mobile creates single-elim style brackets. | Web bracket setup is not writing authoritative match records. |
| Courts | PARTIAL | Facility `courts`, tournament `court_assignments`, and `bracket_matches.court`. | Need one live assignment strategy. |
| Capacity/waitlist | PARTIAL | Registration statuses and waitlist fields exist. | Need full director live override/promote flows. |
| Check-in dashboard | EXISTS | QR/manual check-in screens and RPC. | Strong reuse candidate. |
| Bracket readiness validation | PARTIAL | Some UI readiness metrics exist. | Need server-side validation before go-live. |
| Go-live button | MISSING | No explicit transition. | Add guarded lifecycle transition. |
| Live command center | PARTIAL | Web day-of UI and mobile command center exist. | Must be persisted/realtime/action-driven. |
| Drag/drop assignment | PARTIAL | Web local drag/drop exists. | Must write through RPC to live match/court records. |
| Match states | MISSING | Pending/scheduled/in_progress/completed are derived client states. | Need PRD states: Pending, Eligible, Queued, Called, On Court, Score Pending, Completed. |
| Dynamic queue | PARTIAL | Web local `matchQueue`. | Need DB queue order, eligibility, locking, realtime. |
| Court failure | MISSING | No court outage/blocked model. | Add court status and reassignment workflow. |
| Pool score entry | MISSING | No authoritative pool match scoring. | Add pool matches, standings, tiebreakers. |
| Bracket score entry | PARTIAL | Mobile `saveMatchScore` writes score/winner and advances next slot. | Needs RPC transaction, audit, correction support. |
| Auto advancement | PARTIAL | `next_match_id` and `next_match_slot` exist. | Needs server-side deterministic advancement. |
| Substitutions | PARTIAL | `substitute` status and replacement fields exist. | Needs live substitution workflow and audit. |
| Injury/no-show handling | PARTIAL | no-show and withdrawn statuses exist. | Need live match impact handling. |
| Score corrections | MISSING | No correction RPC/audit/cascade behavior. | Add controlled correction/reopen flow. |
| Undo/recovery | MISSING | Some registration restore actions exist. | No general live operation undo model. |
| Override system | PARTIAL | Director direct updates exist. | Need explicit override reason, audit, authorization. |
| Audit log | MISSING | No tournament operation log found. | Add append-only activity/event log. |
| Realtime director/player updates | PARTIAL | Realtime publication includes `bracket_matches`, `registrations`, messages, notifications. | Client subscriptions are not wired for tournament live state; `court_assignments` not published. |
| Communication engine | PARTIAL | Notification templates, notifications table, conversations, message push function. | Need tournament event notifications, SMS, Live Activities. |
| Find My Matches | MISSING | Player bracket/results screens exist. | Need player-specific live match query and UI. |
| Role permissions | PARTIAL | RLS distinguishes directors, players, admins. | Need assistant/staff/scorer roles if PRD requires them. |
| Failure/recovery | MISSING | No offline/retry/conflict recovery model for live ops. | Add idempotent RPCs and recovery states. |

## 5. Data Continuity Assessment

The desired continuity is achievable, but the current implementation is not yet continuous.

Pre-event pools are not fully authoritative. `bracket_seeds.pool_letter` can persist pool assignment, but there is no first-class `pools` table, no pool lifecycle, and no authoritative generated pool matches.

Pre-generated pool matches do not currently become the same records used for score entry and results. Web-generated matches are local `GeneratedMatch[]` objects. Mobile DB brackets use `bracket_matches`, but the web setup flow is not aligned to those records.

Operational match states can be added without duplicating match records. `bracket_matches` is the right base for competition state, but it needs explicit lifecycle columns, queue order, lock/version fields, and server-side transitions.

Court assignment should not be reduced to only a `court` field on `bracket_matches`. The architecture should treat match state and court assignment as separate concepts:

- Match = competition state.
- Court Assignment = operational relationship/history.

The system must preserve assignment history, for example: `Match 42 -> Court 7 -> Court 7 unavailable -> reassigned Court 10 -> played Court 10`. Keeping or extending `court_assignments` as the authoritative assignment/history model is preferred, optionally with a convenient current-assignment reference on `bracket_matches` for read performance.

Existing brackets are partly reusable during live operations. Mobile DB-backed brackets are reusable. Web visual brackets and local generated matches must be refocused to persist into `bracket_matches`.

Bracket advancement exists only for elimination-style next-match links. Pool-to-bracket placeholder resolution, standings, and tiebreakers are missing.

Score advancement is currently client-driven. `saveMatchScore` directly updates a match and then the next match slot. This should become a transactional RPC with row locking, authorization, audit logging, and correction behavior.

Sessions are missing. The PRD's session model should not be faked with `event_date` alone.

Courts are fragmented. Facility court inventory exists, `court_assignments` exists, and `bracket_matches.court` exists. The platform needs one authoritative live court assignment/history model that can still reference facility courts and preserve reassignment history.

Realtime is partially prepared at the database publication level but not complete at the client behavior level. `bracket_matches` and `registrations` are published; `court_assignments`, `bracket_seeds`, tournament lifecycle changes, and division changes are not fully covered.

The biggest continuity blockers are duplicated state, local-only live operation state, direct client mutations for operational actions, and the absence of a match lifecycle/event log.

## 6. Reusable Infrastructure

The following should be reused and extended rather than rebuilt:

- Existing Supabase auth, profile, director approval, and RLS patterns.
- `tournaments`, `divisions`, `registrations`, `registration_groups`, and `registration_group_members`.
- Director manual registration RPC and guest player support.
- QR/manual check-in RPC and mobile check-in screens.
- Stripe tournament payment Edge Functions and transaction infrastructure.
- `bracket_seeds` for seed and pool assignment metadata.
- `bracket_matches` as the base authoritative match table.
- Existing public tournament pages and mobile tournament pages.
- Conversations/messages infrastructure for tournament chat.
- Notifications table, notification templates, and message push Edge Function.
- Facility/court inventory infrastructure, if connected cleanly to tournament live assignments.

## 7. Live Operations Readiness

Live operations readiness is low-to-medium.

Ready or close to ready:

- Director authentication and tournament ownership checks.
- Registrations and check-in state.
- Basic bracket match records.
- Basic score entry and next-match advancement.
- Web UI concepts for day-of queue/courts.
- Realtime publication foundation for some relevant tables.

Not ready:

- Explicit go-live transition.
- PRD match lifecycle.
- Authoritative queue ordering.
- Server-side court assignment workflow.
- Court outage handling.
- Court assignment history.
- Transactional score entry and correction.
- Pool standings and tiebreakers.
- Pool-to-bracket advancement.
- Live activity/audit log.
- Realtime live command center subscriptions.
- Public live page tied to authoritative live state.

## 8. Exception/Override Readiness

Exception handling exists mostly as registration status mutations, not as a live tournament operations system.

Existing useful pieces:

- Registration statuses include withdrawn, disqualified, no-show, substitute, checked-in, waitlist-related states.
- Manual director registration supports profile and guest players.
- Some mobile director actions can mark no-show, move to waitlist, restore, cancel, and undo check-in.

Missing or risky pieces:

- No operation audit log with actor, reason, before/after, and affected records.
- No explicit override reason requirement.
- No transactional no-show/injury handling that updates affected match, queue, bracket, and notification state together.
- No score correction workflow.
- No undo/recovery framework.
- No dedicated assistant/scorer permissions model.

## 9. Communication Readiness

Communication readiness is partial.

Existing infrastructure:

- `notifications` table.
- Notification templates for tournament published/rejected/cancelled/pending, registration confirmed, payment receipt, waitlist, reminders, check-in open, new match, and results ready.
- Conversations and tournament-related messaging.
- Push infrastructure for message notifications.

Missing for PRD live operations:

- Event-driven communication for called matches, court assignments, delayed courts, schedule changes, score disputes, bracket advancement, pool standings, and tournament completion.
- SMS integration.
- Live Activities integration.
- Player-specific "Find My Matches" notification logic.
- Director broadcast tooling tied to tournament state.

Communication expansion should be deferred until authoritative tournament events exist. SMS, Live Activities, and broad new notification work should not be prioritized before the core event stream is established.

The first event vocabulary should include:

- Match Eligible
- Match Queued
- Match Called
- Court Assigned
- Court Changed
- Match Started
- Score Finalized
- Match Completed
- Pool Finalized
- Bracket Advanced

These events should later power web realtime, push notifications, Live Activities, SMS, and email.

## 10. Technical Risks

HIGH: Duplicated authoritative state. Web day-of match queues and court assignments are local state, while mobile uses DB `bracket_matches`, and older in-memory stores still exist.

HIGH: Client-authoritative scoring and advancement. Current score save logic performs direct client updates and next-match advancement without a transactional RPC, row locks, idempotency, audit log, or correction model.

HIGH: Missing live lifecycle model. The PRD's operational states are not present in schema or server logic.

HIGH: Pool-to-bracket continuity is missing. Pool assignments exist only as seed metadata and local generated matches.

MEDIUM: Court model fragmentation. Facility courts, tournament `court_assignments`, and `bracket_matches.court` can drift unless assignment history has one authoritative model.

MEDIUM: Realtime is not fully wired. Publication exists for some tables, but live tournament clients are not subscribed to a complete state model.

MEDIUM: Web and mobile tournament management flows can diverge. Web appears closest to the director PRD, while mobile has more DB-backed bracket operations.

MEDIUM: Some registration and tournament mutations are direct client updates. These should be reviewed and moved behind RPCs where they affect money, capacity, live operations, or competitive state.

LOW: Legacy frontend files may confuse future implementation if treated as production source.

## 11. Recommended Implementation Sequence

Phase 1A - Authoritative Tournament Lifecycle

Define the tournament lifecycle:

- `Pre-Event -> Published -> Live -> Completed`

Define the match lifecycle:

- `Pending -> Eligible -> Queued -> Called -> On Court -> Score Pending -> Completed`

Preserve the PRD requirement of one continuous tournament state. Pre-generated matches, pools, and brackets must transition into live operations without duplication. Existing setup records should become live records through lifecycle transitions, not through copied "live" tables.

Phase 1B - Transactional Operations Layer

Design server-authoritative RPCs for:

- Go Live
- Queue/requeue match
- Assign/reassign court
- Call match
- Start match
- Submit/finalize score
- Correct score
- Mark court unavailable/available
- Player substitution
- Injury/withdrawal/no-show
- Complete tournament

These RPCs should include authorization, row locking and idempotency where appropriate, validation, and audit logging. Score finalization, bracket advancement, no-shows, withdrawals, substitutions, and court changes should be transactional operations rather than direct client updates.

Court assignment architecture belongs in this layer. Do not reduce court assignment to only a `court` field on `bracket_matches`. Treat `bracket_matches` as competition state and `court_assignments` or its successor as operational assignment/history. A match may expose a current assignment reference, but the assignment history must survive court outages and reassignment.

Phase 1C - Web Command Center Refocus

Convert the existing web Director day-of experience from local React state to the authoritative Supabase tournament state and RPCs. Preserve useful existing UI instead of rebuilding it. The web command center should become the primary operator surface for live queue, court assignment, match calls, score finalization, overrides, and completion.

After Phase 1A-1C - Authoritative Pools

Prioritize:

- Pools
- Pool Matches
- Standings
- Tiebreakers
- Seeds
- Existing Bracket Placeholder Resolution

Do not create separate live copies of pools, matches, or brackets. Pool outputs should resolve existing bracket placeholders and continue through the same match lifecycle.

After authoritative events exist - Realtime and communication expansion

Publish and subscribe to the full live tournament state. Then connect authoritative tournament events to web realtime, push, Live Activities, SMS, and email. Do not prioritize SMS, Live Activities, or extensive new notification work before the event model and operations layer are stable.

Later hardening

Add override reasons, undo/recovery policies, correction workflows, assistant/scorer roles, failure recovery, operational reporting, and player-specific "Find My Matches" experiences.

## 12. Files Likely to Change

Likely Supabase changes:

- `supabase/migrations/*`
- `supabase/functions/*tournament*`
- generated Supabase type files, if present

Likely web changes:

- `web/src/app/director/tournaments/[id]/page.tsx`
- `web/src/app/director/page.tsx`
- `web/src/app/tournaments/[id]/page.tsx`
- `web/src/components/shared/bracket-tree.tsx`
- new web tournament live operation service modules

Likely mobile changes:

- `apps/mobile/src/app/tournament/[id]/command-center.tsx`
- `apps/mobile/src/app/tournament/[id]/workspace.tsx`
- `apps/mobile/src/app/tournament/[id]/brackets.tsx`
- `apps/mobile/src/app/tournament/[id]/division-bracket.tsx`
- `apps/mobile/src/app/tournament/[id]/player-brackets.tsx`
- `apps/mobile/src/app/tournament/[id]/player-results.tsx`
- `apps/mobile/src/lib/supabase/brackets.ts`
- `apps/mobile/src/lib/supabase/matches.ts`
- `apps/mobile/src/lib/supabase/registrations.ts`
- `apps/mobile/src/lib/supabase/courts.ts`

Likely files to retire from production tournament paths or isolate:

- `apps/mobile/src/lib/directorBracketStore.ts`
- `apps/mobile/src/lib/bracketStore.ts`
- legacy/mock tournament pages under `frontend/src/pages`

## 13. Do Not Rebuild

Do not rebuild the tournament platform from scratch.

Do not duplicate profiles, auth, directors, registrations, payments, divisions, courts, messaging, notifications, or brackets.

Do not replace the QR/manual check-in system. It is already one of the strongest pieces and should be extended only where needed.

Do not create a separate "live tournament" copy of matches. The PRD requires one continuous state. Extend the authoritative match records and surrounding operation tables instead.

Do not create separate live copies of pools, pool matches, standings, seeds, or brackets. They must flow through the same lifecycle foundation.

Do not flatten court assignment into only `bracket_matches.court`. Preserve court assignment as an operational relationship/history, with reassignment and court outage history intact.

Do not prioritize SMS, Live Activities, or broad new notification expansion before authoritative tournament events exist.

Do not make the web day-of UI authoritative through local state. Its concepts are useful, but its data model must be refocused to Supabase.

Do not treat legacy frontend mock pages as production architecture.

Do not invent PAR, player stats, or unrelated player intelligence behavior while implementing tournament director operations.
