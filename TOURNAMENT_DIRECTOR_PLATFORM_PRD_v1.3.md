# Tournament Director Platform

## Product Requirements Document — v1.3

**Product:** Pickleball App
**Module:** Tournament Director Platform
**Primary Director Surface:** Web App
**Player Surfaces:** Public Web + Native Mobile
**Strategy:** Audit-first · Web-first operations · Mobile-connected
**Status:** Planning

---

# 1. Product Vision

Build a complete tournament management and live operations platform supporting the full lifecycle of a pickleball tournament:

**Organize → Prepare → Publish → Go Live → Operate → Adapt → Communicate → Complete**

The platform must preserve and extend all existing tournament functionality.

The Live Tournament Command Center is **not a separate tournament system**.

It is the live operational view of the same tournament, pools, brackets, matches, teams, courts and competition structures created before the event begins.

> **There is one tournament state from setup through completion.**

Anything prepared before the event should transition directly into live operations without recreation, duplication or manual import.

---

# 2. Core Product Principles

## 2.1 One Continuous Tournament State

There must not be separate:

* Pre-event tournament records
* Live tournament copies
* Duplicate pools
* Duplicate brackets
* Duplicate matches

Pre-event competition structures become the starting state of live operations.

Example:

**Pre-Event**

Pool A created
Pool B created
Pool matches generated
Single-elimination bracket configured
Advancement rules established

↓

**Tournament Goes Live**

The same pool matches become:

* Pending
* Eligible
* Queued
* Called
* On Court
* Completed

The same bracket remains intact and fills dynamically as advancement conditions are satisfied.

---

## 2.2 Preserve Before Rebuilding

Existing tournament functionality must be audited before new implementation.

Every capability should be classified:

**EXISTS / PARTIAL / MISSING / REFACTOR / DEFER**

Working functionality should be reused unless there is a documented technical or product reason to replace it.

---

## 2.3 Automation Assists — Director Decides

The system should automate repetitive and deterministic tournament operations while preserving director control.

Automation may:

* Generate matches
* Calculate standings
* Determine match eligibility
* Recommend court assignments
* Populate brackets
* Advance winners
* Generate seeds
* Send communications
* Detect conflicts

Authorized directors can intervene where tournament rules permit.

---

## 2.4 Real-World Flexibility

Live tournaments are unpredictable.

The system must accommodate:

* Injuries
* No-shows
* Player replacements
* Withdrawals
* Court failures
* Weather interruptions
* Schedule delays
* Score corrections
* Match holds
* Queue changes
* Seeding adjustments
* Division changes
* Director overrides

These are core operational requirements.

---

## 2.5 Players Should Always Know What Is Happening

Participants should have easy answers to:

* When do I play?
* Who do I play?
* Where do I play?
* What is my current standing?
* What happens next?

Tournament information should be accessible through public web, native mobile and appropriate communication channels.

---

# 3. Tournament Lifecycle

## PRE-TOURNAMENT

**Tournament → Divisions → Registrations → Teams/Players → Sessions → Courts**

↓

## COMPETITION SETUP

**Formats → Seeds → Pools → Matches → Advancement Rules → Brackets**

↓

## PUBLISH

**Schedule → Pools → Brackets → Player Information**

↓

## GO LIVE

**Existing Competition Structures Become Operational**

↓

## LIVE OPERATIONS

**Check-In → Eligibility → Queue → Court Assignment → Scoring → Advancement**

↓

## ADAPT

**Overrides → Substitutions → Court Changes → Injury Handling → Schedule Adjustments**

↓

## COMMUNICATE

**Realtime Web → Push → Live Activity → SMS → Email**

↓

## COMPLETE

**Placements → Results → Statistics → Tournament History**

---

# 4. Reference Operating Scenario

Initial benchmark:

* Approximately 120 participants
* Approximately 12 courts
* Multiple divisions
* Multiple sessions
* Gender doubles session
* Mixed doubles session
* Pool play
* Pool standings
* Pool-based seeding
* Pool play followed by single elimination
* Continuous scoring
* Dynamic match eligibility
* Continuous court utilization
* Immediate player communication

The platform should continue functioning effectively when unexpected changes occur.

---

# 5. Product Surfaces

## 5.1 Director Web Platform

Primary tournament administration and live operations interface.

Used for:

* Tournament creation
* Registrations
* Divisions
* Sessions
* Pools
* Seeding
* Brackets
* Courts
* Scheduling
* Publishing
* Check-in
* Live match operations
* Queue management
* Court assignment
* Scoring
* Overrides
* Communications
* Results

Optimized for desktop and tablet.

---

## 5.2 Public Live Tournament Page

Every published tournament should have a mobile-first public webpage.

No native app should be required to access basic tournament information.

Primary audiences:

* Players
* Coaches
* Parents
* Families
* Spectators

Information may include:

* Tournament status
* Sessions
* Announcements
* Schedule
* Pools
* Standings
* Brackets
* Live matches
* Courts
* On deck
* Scores
* Results
* Venue information
* Tournament instructions

Sensitive information must remain protected.

---

## 5.3 Native Player Experience

Authenticated players receive the richest personalized experience.

Potential capabilities:

* Personal tournament dashboard
* Push notifications
* Match status
* Queue status
* Court assignments
* Standings
* Results
* Bracket progression
* Tournament announcements

iOS may additionally support:

* Live Activities
* Lock Screen
* Dynamic Island

The app enhances participation but is not mandatory.

---

# 6. Pre-Tournament Management

Existing functionality must be preserved and audited.

## Tournament Setup

Support:

* Name
* Description
* Dates
* Venue
* Courts
* Capacity
* Registration dates
* Rules
* Policies
* Director/staff
* Tournament status

## Divisions

Configurable attributes may include:

* Gender
* Skill
* Age
* Event type
* Team format
* Capacity
* Entry fee

## Registrations

Support:

* Player registration
* Team registration
* Paid registration
* Free registration
* Manual director-added registration
* Waitlists where applicable
* Withdrawal
* Partner/team management
* Registration status

Existing payment infrastructure should remain intact.

---

# 7. Sessions

Sessions should be supported as a first-class operational concept where required.

Example:

### Morning Session

Gender Doubles
8:00 AM – 1:00 PM

### Afternoon Session

Mixed Doubles
2:00 PM – 7:00 PM

Sessions may define:

* Divisions
* Courts
* Check-in windows
* Scheduled start
* Match queue scope
* Staff
* Announcements
* Competition phases

---

# 8. Competition Setup

Before competition begins, directors should configure:

* Competition format
* Pools
* Pool sizes
* Pool assignments
* Preliminary seeds
* Match generation
* Tiebreakers
* Advancement rules
* Brackets
* Sessions
* Court availability

All setup should be reviewable before publication.

---

# 9. Pools

Directors should be able to:

* Generate pools
* Create pools manually
* Edit pools
* Move teams between pools
* Drag teams between pools
* Swap teams
* Reorder seeds
* Review pool balance
* Generate pool matches
* Validate minimum-game guarantees

Pool matches created before the event become the actual live matches used once play begins.

No duplicate live pool matches should be created.

---

# 10. Preliminary Seeding

Potential seed sources:

* Director-defined
* Rating/ranking
* Registration data
* Randomization
* Existing tournament logic

Directors retain final control.

Where appropriate, seeds should support drag-and-drop ordering.

The final pre-event seed configuration becomes the starting seed state when the tournament goes live.

---

# 11. Bracket Configuration

Initial priority:

**Single Elimination**

Architecture should allow future support for:

* Double elimination
* Consolation
* Placement matches
* Play-ins
* Custom advancement

Brackets may be created before pool play is completed using placeholders such as:

**Pool A #1 vs Pool C #2**

The bracket remains the same bracket during live competition.

When pool standings are finalized:

**Pool A #1**

is resolved into the qualifying team.

The system should populate the existing bracket rather than generating a new live bracket.

---

# 12. Pre-Event Match Generation

Directors may generate matches before the tournament starts.

Examples:

* Pool round-robin matches
* Preliminary bracket matches
* Play-in matches
* Session-specific matches

Pre-generated matches should carry forward directly into live operations.

At tournament start, their operational state is evaluated.

Example:

### Match 18

Created before event.

At Go Live:

* Teams checked in
* Dependencies satisfied
* Session active

Result:

**Match 18 → Eligible**

If conditions are not satisfied:

**Match 18 → Pending**

The match itself is not recreated.

---

# 13. Publish and Lock

Tournament information should support appropriate draft and published states.

Directors may prepare:

* Pools
* Seeds
* Matches
* Brackets
* Sessions
* Schedule
* Court plans

before publishing.

Publication should make relevant information visible to participants.

The system may support a configurable pre-event **lock** or confirmation state before live competition begins.

Example:

**Competition Setup Ready**

* Registrations confirmed
* Pools confirmed
* Seeds confirmed
* Matches generated
* Bracket configuration confirmed

**Start Live Session**

Starting live competition does not clone any data.

It changes operational state.

---

# 14. Go-Live Transition

The transition into live tournament operations must be explicit and reliable.

When a tournament/session goes live:

1. Existing registrations remain intact.
2. Existing teams remain intact.
3. Existing pools remain intact.
4. Existing seeds remain intact.
5. Existing brackets remain intact.
6. Existing matches remain intact.
7. Existing advancement rules remain intact.
8. Existing court/session assignments remain available.
9. Match operational eligibility is evaluated.
10. The Live Command Center begins displaying the same records.

The go-live process should primarily change **state**, not create replacement data.

---

# 15. Check-In

Existing QR and manual check-in should be preserved.

Command Center should show:

* Checked-in participants
* Missing participants
* Partial teams
* Division readiness
* Session readiness

Check-in may affect live match eligibility.

---

# 16. Live Tournament Command Center

The Command Center becomes the main operational surface during active competition.

It should answer immediately:

* What is happening?
* Which courts are active?
* Which courts are available?
* Which matches are playing?
* Which matches are ready?
* Which matches are blocked?
* Which scores are pending?
* Which players are missing?
* Are we ahead or behind?
* Are participants receiving instructions?

Example:

### Gender Doubles — Morning Session

**11 / 12 Courts Active**

**8 Ready · 6 Waiting · 2 Scores Pending**

---

# 17. Interactive Tournament Control Board

The Command Center should behave as an interactive tournament control board.

Where practical, directors should manipulate tournament objects visually.

Examples:

### Match

**Match 27 → Court 4**

### Queue

**Move Match 31 ahead of Match 28**

### Team

**Pool A → Pool B**

### Seed

**#3 ↔ #5**

### Court

**Court 7 → Court 10**

Drag-and-drop should be optimized for web/tablet.

Accessible non-drag alternatives must exist.

---

# 18. Validation Before Modification

Manual operations must pass server-side validation.

Example:

Director moves:

**Match 27 → Court 4**

Validate:

* Court available?
* Match eligible?
* Players available?
* Correct session?
* Conflicting assignment?
* Rest requirement satisfied?
* Court restrictions satisfied?

If valid:

**Assign Match 27 to Court 4**

If a soft warning exists:

> Garcia completed a match 3 minutes ago. Recommended rest is 10 minutes.

Options:

**Cancel**

**Override & Assign**

Hard integrity constraints should block invalid actions.

---

# 19. Court Operations

Court states may include:

* Available
* Assigned
* In Progress
* Score Pending
* Temporarily Unavailable
* Closed

Directors can:

* Assign match
* Reassign match
* Release court
* Hold court
* Close court
* Return court to service

---

# 20. Court Failure / Unplayable Court

Courts may become unavailable due to:

* Weather
* Surface issue
* Net failure
* Lighting
* Safety
* Facility requirement
* Other

Example:

### COURT 9 UNAVAILABLE

Current Match: Match 42
Upcoming Assignments: 3

Actions:

* Move current match
* Requeue match
* Hold match
* Redistribute future assignments

The queue engine should immediately account for reduced court capacity.

When repaired:

**Return Court 9 to Service**

---

# 21. Match Lifecycle

Recommended operational states:

**Pending → Eligible → Queued → Called → On Court → Score Pending → Completed**

Exception states:

* Held
* Delayed
* Cancelled
* Forfeit
* Disputed

Pre-generated matches begin live competition at the appropriate point in this lifecycle based on current conditions.

---

# 22. Dynamic Match Queue

The system continuously identifies eligible matches.

Eligibility may consider:

* Match dependencies
* Check-in
* Player availability
* Court availability
* Session
* Division
* Player rest
* Match priority
* Director holds
* Court restrictions

Example:

### READY QUEUE

1. Men's 4.5 — Match 18
2. Women's 3.5 — Match 24
3. Men's 4.0 — Match 31
4. Women's 4.0 — Match 16

Directors can:

* Assign
* Reorder
* Hold
* Delay
* Requeue
* Inspect dependencies
* Override recommendations

---

# 23. Prebuilt Brackets in Live Operations

If an elimination bracket was configured before the tournament, the live system should use that exact bracket.

Example pre-event:

### Quarterfinal

Pool A #1
vs
Pool C #2

After pool completion:

Pool A #1 = Smith/Jones
Pool C #2 = Garcia/Davis

The existing matchup becomes:

**Smith/Jones vs Garcia/Davis**

The match then enters the live eligibility engine.

No manual bracket reconstruction should be required.

---

# 24. Player / Team Operational Status

Participant operational status should remain independent of registration.

Possible states:

* Active
* Temporarily unavailable
* Injured
* Withdrawn
* Disqualified
* No-show

Changing status should cause the engine to evaluate affected matches.

---

# 25. Player Replacement & Substitution

Authorized directors should be able to replace a player when permitted.

Example:

**Smith / Jones**

becomes:

**Smith / Williams**

Reasons:

* Injury
* Withdrawal
* No-show
* Approved substitute
* Registration correction
* Director correction
* Other

Timing matters.

## Before Competition

Update registration/team normally.

## During Pool Play

Evaluate:

* Existing results
* Future matches
* Standings
* Eligibility
* Tournament rules

## During Elimination

Evaluate:

* Bracket integrity
* Advancement
* Eligibility
* Existing results

Before committing, show consequences.

Material substitutions must be logged.

---

# 26. Injury Workflow

Director may mark:

**Player Injured**

Possible actions:

* Temporarily hold match
* Replace player
* Withdraw team
* Retire
* Forfeit match
* Continue if permitted

The engine should evaluate downstream impact.

---

# 27. Withdrawal / No-Show

Support:

* Player no-show
* Team no-show
* Mid-event withdrawal
* Disqualification

Evaluate:

* Future matches
* Forfeits
* Pool standings
* Advancement
* Bracket implications
* Communications

Historical results should remain unless explicitly corrected.

---

# 28. Score Closure Engine

Finalizing a score may trigger:

1. Match completion
2. Court release
3. Player/team record update
4. Pool standings recalculation
5. Bracket advancement
6. Dependency evaluation
7. New match eligibility
8. Queue update
9. Command Center update
10. Communication events

This should be server-authoritative.

---

# 29. Score Corrections

Authorized directors should be able to correct scores.

Corrections should:

* Require permission
* Identify downstream effects
* Recalculate standings
* Recalculate seeds where necessary
* Reevaluate bracket progression
* Warn if later matches already occurred

All corrections must be logged.

---

# 30. Pool-to-Bracket Transition

Workflow:

**Pool Results → Standings → Tiebreakers → Seeds → Director Review → Existing Bracket Population → Queue**

1. Final pool match completes.
2. Standings calculated.
3. Ties identified.
4. Tiebreakers applied.
5. Proposed seeds generated.
6. Director reviews.
7. Director approves.
8. Existing bracket placeholders resolve.
9. Eligible bracket matches enter queue.
10. Players are notified.

The bracket should not need to be recreated.

---

# 31. Undo & Recovery

Frequent low-risk operational changes should support Undo where safe.

Examples:

* Queue reorder
* Court reassignment
* Match hold
* Court availability change

High-impact changes should require confirmation:

* Score correction
* Player replacement
* Withdrawal
* Bracket modification
* Seed override after publication

---

# 32. Director Overrides

Authorized directors may override recommendations when allowed.

Examples:

* Rest-time recommendation
* Queue priority
* Court recommendation
* Match hold
* Court assignment
* Seed recommendation

Distinguish:

### Hard Constraint

Cannot be overridden without breaking tournament integrity.

### Soft Constraint

Override permitted with warning.

Workflow:

**Warning → Confirmation → Execute → Audit Log**

---

# 33. Tournament Activity & Audit Log

Important operational changes should create history.

Examples:

**3:42 PM**
Court 7 marked unavailable

**3:43 PM**
Match 38 moved Court 7 → Court 10

**3:51 PM**
Jones replaced by Williams
Reason: Injury

**4:02 PM**
Match 41 moved ahead of Match 40
Rest recommendation overridden

Record where applicable:

* Timestamp
* Staff member
* Action
* Previous state
* New state
* Reason
* Override flag

---

# 34. Real-Time Tournament State

Changes should propagate without manual refresh.

Examples:

* Score entered
* Court changed
* Match queued
* Match called
* Player status changed
* Court unavailable
* Player substituted
* Standings changed
* Bracket advanced
* Announcement published

Existing realtime infrastructure should be audited before adding new technology.

---

# 35. Communication Engine

Architecture:

**Tournament Event**

↓

**Communication Router**

↓

**Public Web | App Realtime | Push | Live Activity | SMS | Email**

Communication should be event-driven.

---

# 36. Communication Priority

## Informational

* Score posted
* Standings updated
* Bracket published

**Web + In-App + selective Push**

## Important

* Coming up soon
* Opponent determined
* Session starting
* Schedule adjustment

**Push + Live Activity**

## Critical

* Report to court
* Court changed
* Match called
* Significant delay

**Push + Live Activity + optional SMS**

## Administrative

* Pre-event instructions
* Weather update
* Next-day schedule

**Web + Push + Email + optional SMS**

---

# 37. Communication Triggered by Changes

Material operational changes should automatically notify affected users.

Example:

**Match moved Court 7 → Court 10**

Affected players receive:

> Court Change
> Your match has moved to Court 10.

Communication should target only relevant audiences whenever possible.

---

# 38. Player Acknowledgment

Critical communication may support:

* Sent
* Delivered
* Viewed
* Acknowledged
* Failed

Example:

### Court 10

Smith/Jones vs Garcia/Davis

**3 / 4 acknowledged**

---

# 39. Public Live Tournament Page

Public tournament URL should provide:

* Tournament status
* Current session
* Announcements
* Schedule
* Pools
* Standings
* Brackets
* Live matches
* Courts
* On deck
* Scores
* Results
* Player/team search

The page should reflect the same authoritative tournament state as the Director Command Center.

---

# 40. Find My Matches

Participants should be able to locate themselves or their team.

Example:

### YOUR TOURNAMENT

**UP NEXT**

Men's 4.5 Doubles

Dominguez / Smith
vs
Jones / Garcia

**2 matches ahead**

Estimated ~10:40 AM

Later:

### REPORT TO COURT 8

Your match is ready.

---

# 41. iOS Live Activities

Potential progression:

**UP NEXT**

↓

**ON DECK**

↓

**REPORT TO COURT**

↓

**MATCH IN PROGRESS**

↓

**RESULT**

Live Activities consume tournament events.

They do not contain tournament business logic.

---

# 42. SMS & Escalation

SMS should focus on mission-critical communication.

Potential escalation:

**Push**

↓

**No acknowledgment**

↓

**SMS**

SMS may link directly to the public/personalized tournament web experience.

---

# 43. Roles & Permissions

Audit existing authorization first.

Potential roles:

### Tournament Director

Full control.

### Tournament Staff

Operational actions.

### Scorekeeper

Score-related actions.

### Read Only / Display

Monitoring only.

Higher-risk actions may require elevated permissions.

---

# 44. Failure & Recovery

Plan for:

* Internet interruption
* Browser refresh
* Device disconnect
* Duplicate score submission
* Concurrent staff changes
* Duplicate court assignment
* Notification failure
* Incorrect score
* Court failure
* Tournament recovery

Server state remains authoritative.

Critical operations should be idempotent where practical.

---

# 45. PHASED DEVELOPMENT ROADMAP

## Phase 0 — Full Tournament Platform Audit

**No major new development before this audit.**

Audit:

* Tournament creation
* Director Hub
* Command Center
* Registrations
* Manual registrations
* Payments
* Divisions
* Teams
* Sessions
* Courts
* Check-in
* Pools
* Pool generation
* Seeding
* Match generation
* Brackets
* Advancement
* Scoring
* Results
* Publishing
* Public pages
* Realtime
* Notifications
* Roles/RLS
* Overrides
* Mobile tournament functionality

Classify:

**EXISTS / PARTIAL / MISSING / REFACTOR / DEFER**

Critical questions:

* Are pools already authoritative records?
* Are bracket records reusable during live play?
* Are pre-generated matches the same records used for scoring?
* Does live state require duplication anywhere?
* Can existing structures safely transition into operational match states?
* What existing UI can be reused?

Deliver:

* Architecture map
* Gap matrix
* Reusable components
* Schema gaps
* UI gaps
* Risks
* Recommended implementation order

### Non-Regression Requirement

Existing working tournament functionality must remain operational.

---

## Phase 1 — Tournament Lifecycle Alignment

Close only gaps identified during audit.

Ensure this is one continuous flow:

**Tournament**

↓

**Registrations**

↓

**Divisions**

↓

**Sessions**

↓

**Pools / Seeds / Brackets**

↓

**Pre-Generated Matches**

↓

**Go Live**

↓

**Same Matches Enter Operational Lifecycle**

Goal:

No duplication between tournament setup and live tournament operations.

---

## Phase 2 — Go-Live & Command Center Foundation

Implement/refocus:

* Go-live state transition
* Tournament Pulse
* Court board
* Session status
* Match lifecycle
* Existing-match eligibility evaluation
* Live matches
* Ready matches
* Blocked matches
* Score pending
* Realtime updates

---

## Phase 3 — Interactive Operations

Implement:

* Drag-and-drop control board
* Queue manipulation
* Court assignment
* Reassignment
* Match holds
* Court availability
* Validation
* Soft/hard constraints
* Director overrides
* Undo
* Audit logging

---

## Phase 4 — Exception & Recovery

Implement:

* Player replacement
* Injury
* Withdrawal
* No-show
* Disqualification
* Court failure
* Score correction
* Competition-state recalculation

---

## Phase 5 — Pool & Bracket Live Automation

Implement/refine:

* Live standings
* Tiebreakers
* Pool completion
* Seed calculation
* Director approval
* Existing bracket placeholder resolution
* Advancement
* Queue integration

Goal:

Preconfigured pools and brackets transition seamlessly into live play.

---

## Phase 6 — Public Live Tournament Page

Implement/refine:

* Public URL
* Live status
* Schedule
* Announcements
* Pools
* Standings
* Brackets
* Scores
* Courts
* On deck
* Results
* Player/team search
* Find My Matches

---

## Phase 7 — Communication Engine

Implement:

* Tournament event model
* Communication router
* Push
* In-app alerts
* Court calls
* Court changes
* Schedule changes
* Delivery tracking
* Acknowledgment

---

## Phase 8 — iOS Live Tournament Experience

Implement:

* Live Activities
* Lock Screen
* Dynamic Island where supported
* Queue state
* Court assignments
* Match calls
* Results
* Advancement

---

## Phase 9 — SMS & Escalation

Implement:

* SMS
* Critical communication rules
* Escalation
* Preferences
* Failure handling
* Cost controls

---

## Phase 10 — Intelligence & Optimization

After meaningful tournament data exists:

* Match start estimation
* Court release prediction
* Delay detection
* Schedule forecasting
* Player rest optimization
* Court utilization recommendations
* Division bottleneck detection
* Intelligent queue recommendations

Automation remains advisory unless explicitly configured otherwise.

---

# 46. Success Metrics

Track:

* Court utilization %
* Court idle time
* Court turnaround
* Matches/hour
* Match duration
* Queue time
* Schedule variance
* Score-entry delay
* Match completion → next assignment
* Court failures
* Reassignments
* Director overrides
* Player substitutions
* Notification delivery
* Critical acknowledgment
* Public tournament page usage
* Tournament completion time

---

# 47. Non-Goals for Initial Release

Do not initially require:

* Fully autonomous tournament management
* AI-controlled tournament decisions
* Every competition format
* Advanced predictive scheduling
* Mandatory app installation
* Director web/mobile feature parity
* Rebuilding existing working functionality
* Maintaining separate pre-event and live tournament data models

---

# 48. Architecture Principle

Preferred conceptual architecture:

**Tournament Configuration**

↓

**Competition Structure**

↓

**Pools / Brackets / Matches**

↓

**Operational State**

↓

**Live Operations Engine**

↓

**Tournament Events**

↓

**Director Command Center**

**Public Tournament Web**

**Native Mobile**

**Push**

**Live Activities**

**SMS**

**Email**

The same authoritative records should move through the lifecycle.

---

# 49. Data Continuity Requirement

This is a mandatory architecture requirement.

> **Competition structures created before the event must transition directly into live tournament operations.**

Examples:

* Prebuilt pools remain the live pools.
* Pre-generated pool matches remain the live matches.
* Preliminary seeds remain the initial seeds.
* Preconfigured brackets remain the live brackets.
* Bracket placeholders resolve dynamically.
* Advancement rules remain active.
* Court/session plans remain available.
* Published schedules remain connected to their underlying matches.

The system should never require the director to recreate competition structures merely because the tournament has entered live mode.

---

# 50. Director Experience Principle

The Command Center should feel like a live tournament control board.

**Court unavailable? Move the match.**

**Player injured? Replace, hold, withdraw or forfeit.**

**Queue wrong? Reorder it.**

**Pool needs adjustment? Move the team.**

**Seed incorrect? Correct it.**

**Score wrong? Fix it.**

The system should validate consequences and preserve tournament integrity without becoming unnecessarily restrictive.

---

# 51. Player Experience Principle

Players should always know:

* When they play
* Who they play
* Where they play
* Their current results
* Their standings
* What happens next

This information should remain available even without installing the native app.

---

# 52. Definition of Success

A director should be able to:

1. Create the tournament.
2. Manage registrations.
3. Configure divisions and sessions.
4. Build pools.
5. Seed competition.
6. Generate pool matches.
7. Configure brackets.
8. Publish tournament information.
9. Check players in.
10. Start the live session without recreating tournament structures.
11. See pre-generated matches immediately enter their appropriate live states.
12. Monitor every court.
13. Maintain a dynamic match queue.
14. Assign and reassign matches.
15. Enter and correct scores.
16. Automatically update standings.
17. Resolve pool seeds into prebuilt bracket slots.
18. Advance elimination brackets.
19. Handle injuries and substitutions.
20. Handle withdrawals and no-shows.
21. Take courts in and out of service.
22. Override system recommendations.
23. Immediately communicate material changes.
24. Publish tournament state to players and spectators.
25. Complete and preserve accurate results.

The platform should function as one continuous system from tournament creation through final results.

> **Prepare it once. Run that same tournament live. Adapt as reality changes. Keep everyone informed.**
