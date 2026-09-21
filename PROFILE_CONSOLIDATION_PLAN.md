# Public Profile Consolidation

**Status: COMPLETE 2026-09-21.** All five phases shipped. Mobile is live over
OTA; web needs a Vercel promote. Kept as the record of what was decided and why
— the retirement note at the foot is the last entry.

**Written for:** whoever implements this, who may not have seen the comparison
that produced it.

---

## The problem

Three implementations of "show me a player", each with its own query, its own
column list and its own idea of what a profile contains:

| Surface | Reached from | Has | Lacks |
| --- | --- | --- | --- |
| `apps/mobile/src/app/match/profile/[id].tsx` | directory, My Connections (All/Recent/Contacts), Match Requests, chat header — 8+ links | distance, match %, availability overlap, home court, formats, intensity, gender, groups, upcoming events, marketplace listings, connect/like, report & block, tap-to-view photo | action bar, stats, attribute grid, tabs |
| `apps/mobile/src/app/players/[id].tsx` | community event roster, invite-detail, round-robin roster — 3 links | Message/Invite/Save/Share bar, attribute grid, Events Played + Partners Played, tabs, the preferred layout | everything in the column to its left; "…" is unwired; Events and Marketplace tabs are placeholder components |
| `web/src/app/profile/[id]/page.tsx` | web | 12 columns, basic stats | distance, availability, activity, listings, groups |

A player looks different depending on which link was tapped. Every profile fix
today had to be applied two or three times, and twice it was applied to only one
surface.

`apps/mobile/src/app/coach/[id].tsx` is a coach marketplace listing, not a player
profile. Out of scope.

`apps/mobile/src/app/(tabs)/profile.tsx` is the viewer's OWN profile and is an
editing surface. Out of scope — see Decision 3.

---

## What "standardize" means here

Three separable things. The first is the durable win; the other two are the
visible one.

1. **One definition.** A shared type and one fetch in `packages/shared` — what a
   public profile *is*, independent of platform. Today each surface picks its own
   columns, which is precisely how one gained availability and the others did not.
2. **One screen per platform.** One mobile route, one web page, every link points
   there.
3. **One layout.** `players/[id]`'s design — action bar, attribute grid, stats
   card — becomes what that single screen looks like.

Doing only (3) puts us back here in a month.

---

## Phases

### Phase 1 — the shared definition

- `packages/shared/src/public-profile.ts`: a `PublicProfile` type and the canonical
  column list. No React, no platform imports.
- A `fetchPublicProfile(client, viewerId, targetId)` taking the Supabase client as a
  parameter, since mobile and web construct theirs differently.
- Returns identity, rating, location + **distance from the viewer**, availability
  (with overlap when the viewer has a schedule), home court, formats, intensity,
  gender, hand, play style, bio, skill band, counts (connections, events played,
  partners played), activity, groups, active marketplace listings, and the viewer
  relationship (self / connected / pending / none / blocked).
- Tests in `packages/shared/src/__tests__/` — they run under web's runner; mobile
  must not gain a `test` script (EAS fingerprint input).

**Risk:** the fetch is wide. Measure it; split into a required core and a deferred
tail if a single round trip is slow.

### Phase 2 — the one mobile screen

- `match/profile/[id].tsx` adopts `players/[id]`'s layout and becomes the single
  public profile. Chosen as the survivor because it holds the connect and safety
  flows, which are the expensive half to reimplement, and because it already has
  8 of the 11 inbound links.
- Port across: action bar (Message / Invite / Save / Share), attribute grid, stats
  card, tabs.
- Fix while porting: the avatar becomes tappable (shared photo viewer), and the
  "…" gets wired to the existing `ContextMenu` with Report / Block / Share. It has
  no `onPress` at all today.
- The Events and Marketplace tabs stop being placeholders and take real data.

### Phase 3 — repoint and retire

- Repoint 3 links: `community/[id].tsx:1256`, `invite-detail.tsx:159`,
  `round-robin/[id]/roster.tsx:131`.
- Only after Phase 2 is at parity, so there is never a window where a link lands
  somewhere with no way to connect or report.
- `players/[id].tsx` is left in place and unlinked at first, then deleted in a
  separate commit once nothing points at it. **`players/[id]/invite*` is real and
  in use — that directory stays regardless.**

### Phase 4 — web

- `web/src/app/profile/[id]/page.tsx` adopts the shared fetch and reaches parity on
  content. Layout follows web's own conventions; the definition is what is shared,
  not the markup.

### Phase 5 — verification

- Same player opened from every entry point renders the same profile.
- Each viewer relationship (self, connected, pending, stranger, blocked) shows the
  right actions.
- A sparse profile renders no empty cards.
- Web and mobile agree on distance, availability and counts for the same pair.

---

## Decisions needed before Phase 2

1. **Top-right.** Message/Invite/Save/Share already sit in a visible action bar, so
   putting CTAs in the corner duplicates them. Recommend the "…" becomes the
   safety menu (Report / Block / Share). Confirm, or say what you want there.
2. **Medals Won / Reviews.** Hardcoded "—" today. Keep as placeholders, or remove
   until data exists? Recommend removing; a dash invites the question "why is this
   empty".
3. **Own profile.** Recommend leaving `(tabs)/profile.tsx` out — it is an editor,
   not a viewer. Confirm.
4. **Connect vs Invite.** They are different actions (partner request vs event
   invite) and will sit side by side. Recommend both, clearly labelled, with
   Connect showing state (Connect / Pending / Connected).

---

## Sequencing

Phase 1 is a prerequisite for everything. Phases 2–3 are one work item and should
not be split across sessions — an unlinked half-migrated screen is worse than
either end state. Phase 4 is independent and can wait; web has far fewer users
than the TestFlight build will.

Not urgent relative to TestFlight, which remains the only thing blocking a build.

---

## Out of scope

Coach profiles, the self-profile editor, `players/[id]/invite*`, and adding new
data to the schema. This consolidates what exists; `paddle`, `social_links`,
`cover_url` and `dupr_verified` remain unbuilt because zero of 48 profiles have
them.

---

## Retired: `apps/mobile/src/app/players/[id].tsx`

**Deleted 2026-09-21, with the product owner's explicit approval for this file
and no other.**

792 lines. The second player-profile screen — tabbed Overview / Events /
Marketplace, a Message / Invite / Save / Share action bar, an attribute grid, and
a stats card whose Events Played and Partners Played were real while Medals Won
and Reviews were hardcoded "—". Its Events and Marketplace tabs were placeholder
components ("No events to show yet", "Marketplace features coming soon").

**Why it went.** Phases 2 and 3 made `match/profile/[id]` the one public profile
and moved its layout there, which is the half of it worth keeping. All five
inbound links were repointed first — community roster, invite detail,
round-robin roster, and invite-sent's return — so nothing reached it.

**What was checked before deleting:**

- no route reference anywhere in `src/` (the only textual hit is a prose comment
  in match/profile/[id].tsx explaining where its layout came from)
- `_layout.tsx` registers `players/[id]/invite` only, never `players/[id]`, so no
  registration needed removing
- tsc, eslint and both test suites clean afterwards

**What SURVIVES, and must not be confused with it.** The `players/[id]/`
directory stays. It holds the invite flow, which is real and in use:

- `players/[id]/invite.tsx`
- `players/[id]/invite-details.tsx`
- `players/[id]/invite-sent.tsx`

Deleting the leaf route `players/[id].tsx` does not affect them: in expo-router
they are sibling routes, not children of a screen.

**Recovering it**, should the layout ever need consulting again:

```
git show 7b248a5:apps/mobile/src/app/players/[id].tsx
```

That is its last commit before deletion.
