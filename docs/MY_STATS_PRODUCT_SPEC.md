# DreamBreaker My Stats

## Product Objective

Transform the existing My Stats section into DreamBreaker's player identity, activity, and analytics hub.

The feature should help a player answer:

- How am I performing?
- Am I improving?
- Where do I play best?
- Which formats suit me?
- Who do I play best with?
- What affects my performance?
- Why did my PAR change?
- What data is still needed to improve PAR confidence?

## Product Hierarchy

The player is the primary entity.

Player
-> Play Sessions
-> Games
-> Participants
-> Verification
-> PAR
-> Analytics

Courts and events provide context but are not the center of My Stats.

## Screen 1: Player Card

The first My Stats screen must present the user as an athlete through a premium digital player credential inspired by a laminated tournament badge hanging from a lanyard.

Visual direction:

- Dark theme
- Matte navy or near-black background
- Warm gold accents
- Premium sports credential aesthetic
- High readability
- Player card is the dominant element
- Do not allow court activity or weather content to overpower the player

Player Card content:

- Profile photo
- Full name
- PAR label and value
- PAR stage
- PAR confidence
- PAR progress
- Current form
- Wins
- Losses
- Games played
- Best win
- Home court
- Permanent profile QR code

The first screen must work for:

- No games
- Estimated PAR
- Provisional PAR
- Established PAR
- High-confidence PAR
- Missing profile information
- Loading and error states

## New-Player State

Do not display only "Not Rated."

Display:

- Building Your PAR
- Games logged toward initial PAR
- Clear next action
- Explanation of what is required

Example:

```text
Building Your PAR
0 of 8 qualifying games
Log and verify recreational games to receive your first Estimated PAR.
```

The initial threshold remains configurable and must not be hard-coded across multiple components.

## PAR Principles

PAR means Pickleball Activity Rating.

PAR measures demonstrated playing ability.

Playing frequently does not automatically increase PAR.

- Performance moves PAR.
- More quality data increases confidence.
- Verification increases trust in a game's rating influence.
- Fitness activity does not directly raise skill rating.
- Court variety does not directly raise skill rating.
- New opponents improve rating confidence, not skill by themselves.

Every PAR movement must be explainable.

## Play Sessions

A Play Session represents a real visit or period of play.

A session may contain:

- One or more games
- Facility
- Start and end time
- Session type
- Participants
- Fitness data
- Notes
- Verification status

Users may create sessions manually or through contextual flows such as court arrival detection.

## Games

Every game must support:

- Singles or doubles
- Team assignments
- Final score
- Date and time
- Facility
- Participants
- Registered users
- Temporary players
- Verification status
- Dispute state
- PAR eligibility
- PAR impact explanation

Game logging must remain possible even when some participants do not have DreamBreaker accounts.

## Player QR

Every registered profile receives a permanent QR code.

Scanning the QR can:

- Add the player to a session
- Add the player to a game
- Open the player profile
- Send a connection request
- Support event check-in
- Support score verification

The QR must reference a secure profile identifier or deep link. It must not embed private personal information directly.

## Analytics

The data model must eventually support:

- Mixed doubles performance
- Gender doubles performance
- Singles performance
- Partner chemistry
- Opponent history
- Facility performance
- Home versus away
- Indoor versus outdoor
- Morning versus afternoon versus evening
- Right-handed and left-handed opponents
- Right-handed and left-handed partners
- Preferred court side
- Score differential
- Session duration
- Fitness correlations
- Weather correlations

Not every analytic must be implemented in the first release, but the data model must not block them.

## Transparency

The user must be able to see:

- Why PAR increased
- Why PAR decreased
- Why PAR did not change
- Whether a game was rating eligible
- Whether a game was self-reported, opponent verified, fully verified, or official
- What will increase confidence
- What performance outcomes could move PAR

Avoid opaque language such as "the algorithm adjusted your score."

## Non-Goals For The First Phase

- Final production PAR formula
- AI coaching
- Automatic Apple Watch workout initiation
- Weather-performance correlations
- Predictive recommendations
- Public leaderboards