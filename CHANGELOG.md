# DreamBreaker Changelog

This document records major product, architecture, and engineering decisions.

Its purpose is to preserve design intent across future development.

It is not a Git commit log.

Minor bug fixes and routine refactoring should remain in Git history.

Only significant product, architecture, database, UX, or business-rule decisions belong here.

---

# Format

Every entry should include:

- Date
- Version
- Area
- Summary
- Reason
- Impact
- Breaking Changes
- Follow-up Work

---

# Version 1.0

## Date

2026-07

---

## Area

Project Vision

### Summary

Established DreamBreaker as a player-first platform.

### Decision

The player, not the court, club, or tournament, is now the central entity of the product.

### Reason

Every major feature ultimately exists to help players improve, connect, and play more pickleball.

### Impact

Future development should prioritize player identity, player analytics, player history, and player intelligence before expanding court- or tournament-centric features.

---

## Area

My Stats

### Summary

Redefined My Stats.

### Decision

My Stats is no longer a statistics page.

It becomes the player's personal intelligence center.

### Purpose

Help players answer:

- How am I improving?
- Where do I play best?
- Who do I play best with?
- Why did my PAR change?
- What should I improve next?

---

## Area

Player Card

### Summary

Introduced Player Card.

### Decision

The top section of My Stats becomes a premium athlete credential inspired by tournament lanyards.

Features include:

- Photo
- PAR
- PAR Confidence
- QR Code
- Home Court
- Current Form
- Record
- Progress

### Design Direction

Dark theme.

Premium.

Editorial.

Gold accents.

High readability.

---

## Area

PAR

### Summary

Renamed PAR.

### Decision

PAR now stands for:

Pickleball Activity Rating.

Previously considered:

Pickleball App Rating.

### Reason

The rating measures complete pickleball activity rather than app engagement.

---

## Area

PAR Philosophy

### Decision

Established core principles.

Performance moves PAR.

Data quality moves Confidence.

Transparency is mandatory.

Every PAR movement must be explainable.

Confidence is independent from skill.

---

## Area

Play Session

### Summary

Introduced Play Session as the platform's primary activity object.

### Decision

Every meaningful pickleball experience should begin with a Play Session.

Examples

- Tournament
- League
- Community Game
- Open Play
- Practice
- Challenge Match

A Play Session may contain:

- Multiple Games
- Participants
- Fitness
- Notes
- Verification
- Analytics

---

## Area

Game Verification

### Summary

Introduced verification model.

Verification Levels

- Self Reported
- Partner Confirmed
- Opponent Confirmed
- Fully Verified
- Official

Verification improves confidence.

Verification alone never increases PAR.

---

## Area

Temporary Players

### Summary

Added Temporary Player concept.

### Decision

Games should always be loggable even when participants do not have DreamBreaker accounts.

Temporary Players may later claim historical matches.

Historical linking should improve confidence while preserving data integrity.

---

## Area

Player QR

### Summary

Introduced permanent Player QR.

### Decision

Every player profile receives a permanent QR code.

Supported use cases:

- Add Player
- Add Partner
- Verify Game
- Tournament Check-In
- View Profile
- Connect

The QR represents the player's identity across the platform.

---

## Area

Player Analytics

### Summary

Expanded long-term analytics vision.

Future analytics include:

- Best Partner
- Best Facility
- Mixed Doubles Performance
- Singles Performance
- Home Court Advantage
- Left-Handed Opponents
- Preferred Court Side
- Time of Day
- Indoor vs Outdoor
- Weather Correlation
- AI Coaching

These analytics are long-term goals and should influence data model design.

---

## Area

Design Language

### Decision

Separated product experiences.

Public discovery screens:

Light Theme

Player intelligence screens:

Dark Theme

Reason

Create a premium "locker room" experience focused on the player.

---

## Area

Engineering

### Decision

New features must begin with a repository audit.

Engineering Principles

- Reuse existing code.
- Reuse existing services.
- Avoid duplicate implementations.
- Prefer extending existing models.
- Never fabricate backend functionality.
- Preserve working architecture whenever possible.

---

## Area

Documentation

### Summary

Established repository documentation structure.

Primary documents

PROJECT_VISION.md

MY_STATS_PRODUCT_SPEC.md

PLAY_SESSION_DATA_MODEL.md

MY_STATS_UI_SPEC.md

PAR_RATING_SPEC.md

MY_STATS_IMPLEMENTATION_PLAN.md

CHANGELOG.md

These documents become the authoritative source for future AI-assisted development.

---

# Future Entries

Every major change should append a new version entry.

Examples

Version 1.1

- Added Singles PAR

Version 1.2

- Added HealthKit integration

Version 2.0

- Introduced AI Coaching

Version 2.1

- Added Weather Performance Analytics

Version 3.0

- Introduced Team PAR

Never rewrite historical entries.

Always append.

The changelog should represent the evolution of DreamBreaker over time.