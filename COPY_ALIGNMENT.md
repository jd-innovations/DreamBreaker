# Copy alignment: mobile is the source, web mirrors it

Started 2026-10-09 (owner request: "review mobile app copy and realign web app
to mirror the mobile app language as close as possible").

Method: every user-visible string extracted from `apps/mobile/src` (~2,500
unique) and `web/src` (~1,500 unique), compared by domain term and by
feature area. Scripts lived in the session scratchpad; re-run them from
`git log` of this file if needed. Counts below are the number of strings
containing the term.

**Rule:** web uses mobile's WORDS. Each app keeps its own visual casing
(web's small mono caps section labels are a design-system choice, not copy).

---

## 1. Navigation (biggest visible gap)

| Concept | Mobile | Web today | Web after |
|---|---|---|---|
| Home screen | **Home** (tab) | Dashboard (bottom nav), Player (header), Home (slide menu) | **Home** everywhere |
| Your own events | **Events** (tab: Upcoming / Held Spots / Joined / Past) | Play (bottom nav → /tournaments), My Events (dashboard) | bottom nav **Events** |
| Find a partner | **Partner** (tab), **Partner Finder** (menu) | Match (bottom nav), Matchmaking (header + menu), Partner Finder (quick action) | **Partner** (tab) / **Partner Finder** (menus) |
| Casual organized play | **Community Play** | Community Play | unchanged |
| Lessons | Lessons, Lesson Marketplace (profile menu) | Lessons | see D5 |
| Messaging | **Chat** (slide menu) but **Messages** on screens | Messages | see D1 |
| Director area | **Director Hub** (screen), **Command Center** (in-event) | Director (nav), Day-of (tab) | see D4 |

## 2. Partner Finder vocabulary (web reads like a dating app)

| Mobile | Web today |
|---|---|
| PASS / CONNECT | Pass / **LIKE** |
| Match Requests (Pending / Accepted / Declined) | **INCOMING LIKES**, LIKE BACK |
| My Connections | **MUTUAL MATCHES**, MATCHES |
| "Connection Request Sent" | "Liked {name}!" |
| (no equivalent) | **IT'S A MATCH**, **Super Connect**, "Super-connected with {name}!" |
| Partner Preferences / Save Preferences | MATCH SETTINGS / FILTERS / APPLY |
| Swipe left to pass, right to connect | — |

## 3. Mobile's own inconsistencies (fix on mobile first, then web copies)

- **Log out** (Account Settings) vs **Sign out** (Profile). Everything else
  says Sign in / Sign out (32 vs 1).
- **Chat** (slide menu) vs **Messages** (notification settings, screens).
- **Partner** (tab) vs **Partner Finder** (slide menu, empty states).
- **Lesson Marketplace** (profile menu) vs **Lessons** (everywhere else).
- **Director Hub** (screen title) vs **Command Center** (return buttons on
  round robin / mini tournament / division bracket; one lowercase
  "command center").
- Casing drift in one area: "Check In" / "Check-In" / "Check in";
  "Awaiting Previous Round" / "Awaiting previous round"; "COMPLETE" /
  "COMPLETED" for the same state.

## 4. Feature areas: web-only phrasings to realign

- **Tournaments:** "Registration complete!", "Your hold has expired",
  "Hold window closed", "Could not cancel hold", "WHO'S GOING",
  "COUNTS TO ENTRY", "SECURE" → map to mobile's "Already Registered",
  "Complete Registration", "Confirm Your Hold", "Applied to entry fee",
  "Balance Due", "Cancel Registration".
- **Community Play:** "EVENT FULL / EVENT IS LIVE / EVENT ENDED",
  "BROWSE EVENTS", event-type labels → mobile's status and type labels
  (Quick Game, Round Robin, Mini Tournament, Clinic).
- **Groups:** mostly aligned; web adds "!" to every toast ("Group created!",
  "Joined!", "Link copied!") where mobile alerts don't.
- **Marketplace / Lessons:** small; mainly filter labels and "View" buttons.
- **Auth:** web's "COMPETE / CONNECT / CONQUER", "I AM A PLAYER / DIRECTOR"
  have no mobile equivalent (decide keep or drop).

## 5. Decisions (owner)

- **D1 Messaging:** "Messages" or "Chat"? Recommend **Messages** (already
  the word on screens and on web; only the mobile slide menu says Chat).
- **D2 Sign out:** recommend **Sign in / Sign out** everywhere (fix mobile
  Account Settings "Log out").
- **D3 Partner Finder on web:** adopt mobile's Pass / Connect / Requests /
  Connections. "Super Connect" and the "It's a match" screen exist only on
  web: keep (renamed in mobile's voice) or remove?
- **D4 Director naming:** "Director Hub" for the area; "Command Center" vs
  web's "Day-of" for the live event screen: pick one for both.
- **D5 Lessons:** "Lessons" or "Lesson Marketplace" as the name?
- **D6 Web bottom nav:** mirror mobile's tabs (Home / Events / Partner /
  Profile + Messages in place of Nearby, which web has no page for)?

## 6. Plan (after decisions)

1. Mobile fixes from section 3 (small; ships by OTA).
2. Web navigation: header, slide menu, bottom nav, page titles.
3. Web Partner Finder vocabulary.
4. Web feature areas one at a time: tournaments, community play, groups,
   marketplace, lessons, auth.
5. Put the nav labels in `packages/shared` (both apps import them) so they
   can't drift again.

Each step: typecheck + lint, commit, web via Vercel; mobile via
`publish-update.js all`.
