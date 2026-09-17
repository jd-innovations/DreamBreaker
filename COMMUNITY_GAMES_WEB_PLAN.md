# Community Games — Web Implementation Plan

Audit + plan written 2026-09-17, revised same day after decisions. Scope:
**web app only** (`web/`). No mobile code is touched by this document or by
the work it describes.

**Decisions locked in:**
- Full event-type parity (quick games, clinics, mixers — not just round
  robin) is **in scope**, folded into the core phases below (was Phase 4,
  now merged into Phases 2–3).
- Map view uses **Google Maps JS API** (`@react-google-maps/api`). Needs a
  Google Cloud Maps JavaScript API key with billing enabled — see Phase 5.
- **Groups (workstream B) stays parked.** Not touched by this plan.

---

## 0. Terminology — read this first

The word "community" is overloaded in this codebase and the two things it
refers to are unrelated:

1. **Community Play events** — pickup games / round robins / mixers / clinics.
   A `play_events` row. This is what mobile's `app/community/[id].tsx` shows
   and what web's `/play` section already implements (partially — see §2).
2. **Groups** — an actual social community: membership, roles, a feed with
   posts/polls/photos. A `groups` row + `group_members`. Mobile has a full
   build (`app/groups/[id].tsx`, ~1800 lines). **Web has zero UI for this** —
   `web/src/app/groups/[id]/page.tsx` is only a "open this in the mobile app"
   deep-link fallback.

This plan treats them as two separate workstreams (A and B below) because
they have different data models, different existing web coverage, and
different build cost. "Nearby" discovery (workstream C) applies mainly to (1)
but the mechanism generalizes.

---

## 1. Current state — mobile vs. web

### 1a. Community Play events (`play_events`)

| Capability | Mobile | Web |
|---|---|---|
| Browse/list events | ✅ Games tab (Upcoming/Held/Joined/Past) + Nearby tab | ✅ `/play` — flat list, status filter only |
| Create event | ✅ 5 types (quick game/round robin/mini tournament/clinic/practice), facility picker, photo, skill range, group attribution | ⚠️ `/play/create` — **round robin only**, free-text location, no facility picker, no photo, no group link |
| Event detail | ✅ Overview/Players/Chat tabs, weather, organizer DM, map card | ⚠️ `play-event-client.tsx` exists (350 lines) — has join/manage/standings; no chat, no weather, no map card, no facility linkage (schema allows `facility_id` but web never sets it) |
| Join (account + guest) | ✅ via `join_play_event` RPC | ✅ `/play/[id]/join` exists, calls the same RPC family |
| Manage (organizer) | ✅ ManageEventSheet | ✅ `/play/[id]/manage` exists |
| Standings/scoring | ✅ | ✅ `/play/[id]/standings` — round-robin scheduling logic already ported into `web/src/lib/community-play.ts` |
| **Nearby discovery** | ✅ dedicated tab, map + list, distance filter, skill filter | ❌ does not exist on web |

Web's Community Play build is real and further along than I expected —
`community-play.ts` already ports the round-robin generator and standings
math verbatim. The gap for *this* task is narrower than "build it all": it's
**nearby/discovery**, plus the event-type and facility-linkage restrictions
web imposed on itself (`EVENT_TYPES` in `community-play.ts` marks everything
but `round_robin` as `available: false` — that looks like a deliberate v1
scope cut, not an oversight).

### 1b. Groups (the actual "community" entity)

Mobile: full CRUD, membership with owner/admin/member roles, public/private/
secret privacy with join-approval flow, feed (posts/polls/photos), and
group-attributed play events via `play_events.group_id`.

Web: nothing. `/groups/[id]` only renders a "open in app" card for share
links (SEO/deep-link fallback, same pattern as `/community/[id]` redirecting
to `/play/[id]`).

### 1c. "Nearby" mechanism (mobile), and what actually generalizes to web

- **Only `facilities` has real server-side geo filtering** — a `coords
  geography(Point,4326)` column (trigger-synced from `latitude`/`longitude`)
  plus the PostGIS RPC `search_facilities_nearby(lat, lng, radius_meters, …)`
  using `ST_DWithin`/`ST_Distance` on a GiST index. This RPC already exists
  in Supabase and is schema-complete; nothing new needed server-side to reuse
  it for a web "nearby courts" feature.
- **`play_events` and `tournaments` are NOT distance-filtered server-side on
  mobile.** "Nearby Community Play" on mobile is really "fetch the next 20
  upcoming open events, join facility lat/lng where present, compute
  Haversine distance client-side for display/sort/filter." There is no
  `search_play_events_nearby` RPC to reuse — web would either replicate the
  same client-side-Haversine-after-fetch approach, or (better, since web
  events currently store no coordinates at all — see below) build one.
- **Location acquisition differs by platform.** Mobile uses
  `expo-location` with a permission prompt and a hardcoded fallback
  coordinate. Web already has a *different*, existing pattern for this:
  `web/src/lib/geo/ip-location.ts` — best-effort IP geolocation (`ipapi.co`),
  no permission prompt, used today to prefill onboarding's location step.
  Browser `navigator.geolocation` (an actual permission prompt) is not used
  anywhere in web yet.
- **Structural gap that blocks "nearby" outright today:** web's
  `/play/create` form only writes a free-text `location` string — it never
  sets `facility_id`, and therefore never gets a `latitude`/`longitude` to
  filter or sort by. Mobile's facility-picker (`FacilityPicker` → real
  `facilities` row → real coordinates) is what makes its "X mi away" labels
  possible at all. **Nearby-for-events on web depends on wiring the create
  form to a facility picker first** — that's not optional infrastructure, it's
  the prerequisite.
- **Known mobile bug, worth carrying into the plan as a decision, not a
  silent inheritance:** mobile's quick-game creation form has a "Who Can
  Join? Public / Invite Only" toggle that is captured in UI state but never
  sent to the backend — there is no `visibility` column on `play_events`, so
  every event is effectively public regardless of that toggle. If web later
  adds full event-type parity (quick games, not just round robins), do not
  silently port this — either add real enforcement or drop the toggle from
  the web UI. Flagging only; out of scope for this plan's phases below.
- **No map library exists in web today** (`web/package.json` has no
  mapbox/leaflet/`@react-google-maps` dependency). Mobile's `ExploreMap` is
  Expo/React-Native-specific and not portable. A map view for web nearby is a
  net-new dependency decision (§3).

---

## 2. Decisions this plan makes (flag if you want a different call)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Event types in scope | **All 5 types** (quick game/round robin/mini tournament/clinic/practice) — confirmed | Full parity with mobile's create form. This is the larger scope item: facility picker, photo upload, skill-range picker for every type, group-attribution field (`group_id`, nullable — Groups itself stays parked, but the column is harmless to set if a future Groups UI wants it), and per-type field differences (clinics need `instructor_id`, mini tournaments need bracket setup downstream). |
| D2 | Location acquisition | Browser `navigator.geolocation` (permission prompt) with the existing `fetchIpLocation()` as the no-permission/denied fallback | Web already has the IP fallback built and tested for onboarding; reusing it here avoids a second geo-fallback implementation. GPS-accurate browser geolocation is the right primary since "nearby games" needs real distance, not just city-level. |
| D3 | Distance mechanism for events | Client-side Haversine over a capped fetch (mirror mobile, ≤~30 events per type or ≤~50 blended), **not** a new PostGIS RPC | Matches mobile's actual behavior (mobile doesn't do server-side radius filtering for events either), and avoids a new migration for v1. Revisit only if event volume in one metro area grows past what a flat fetch-and-sort can handle. |
| D4 | Distance mechanism for facilities/courts | Reuse `search_facilities_nearby` RPC directly (already server-side, already indexed) | Zero new backend work; same call shape as mobile's `fetchFacilities`. |
| D5 | Map view | **Google Maps JS API** (`@react-google-maps/api`) — confirmed | Chosen over Mapbox/Leaflet. Requires a Google Cloud project with the Maps JavaScript API enabled and billing configured, plus a browser-restricted API key. See Phase 5 for the concrete setup steps and cost note. |
| D6 | Groups (workstream B) | **Parked — confirmed.** Out of scope for this plan's phases | Materially different, larger feature (membership, roles, approval flow, feed) with zero existing web surface. `groups`/`group_members`/`group_posts` etc. already exist in the schema and are untouched by anything below. |

All six decisions are now confirmed. The phases below reflect D1 and D5 as
locked-in scope, not options.

---

## 3. Proposed architecture (web)

```
web/src/lib/geo/
  browser-location.ts     // NEW — navigator.geolocation wrapper, permission
                           //   state, falls back to fetchIpLocation()
  distance.ts              // NEW — Haversine, shared by events + facilities UI
web/src/lib/supabase/
  facilities.ts             // NEW — thin wrapper around search_facilities_nearby RPC
web/src/lib/community-play.ts  // EXTEND — flip EVENT_TYPES availability flags
                                //   on, add distance/sort helpers, keep
                                //   existing round-robin/standings code as-is
web/src/lib/media/
  upload-event-cover.ts      // NEW — image upload for event cover photo,
                              //   mirrors mobile's uploadPlayEventCover
                              //   against the shared `tournament-covers` bucket
web/src/app/play/
  page.tsx                  // EXTEND — becomes the discovery/nearby surface:
                             //   distance sort, distance filter, skill filter,
                             //   type filter (quick game/round robin/mini
                             //   tournament/clinic — practice excluded from
                             //   public discovery, matching mobile),
                             //   "use my location" prompt row
  create/page.tsx           // EXTEND — per-type form: facility picker,
                             //   photo upload, skill range, type selector;
                             //   clinics add instructor_id, mini tournaments
                             //   route into the existing bracket flow after
                             //   creation
web/src/components/
  facility-picker.tsx        // NEW — combobox over `facilities` (name/city
                              //   search), sets facility_id on the create form
  distance-filter.tsx         // NEW — the "5/25/50/Any" chip row, shared by
                               //   the events list
  event-type-picker.tsx        // NEW — the 5-type selector, gates which
                                //   extra fields render (instructor, bracket
                                //   note, etc.)
  nearby-map.tsx                // NEW (Phase 5) — Google Maps wrapper,
                                 //   facility + event pins, "search this
                                 //   area" pan re-query
```

No new tables or migrations for Phases 1–4. `facility_id`, `group_id`,
`instructor_id`, `facilities.latitude/longitude`, and
`search_facilities_nearby` already exist and are untouched. Phase 5 adds one
new npm dependency (`@react-google-maps/api`) and one new environment
variable (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) — no schema change.

---

## 4. Phased plan

### Phase 1 — Location acquisition (foundation)
- Build `browser-location.ts`: request `navigator.geolocation
  .getCurrentPosition`, handle permission-denied/unsupported by falling back
  to the existing `fetchIpLocation()`, expose `{ lat, lng, source: 'gps' |
  'ip' | 'none', loading, error, request() }`.
- No UI yet — this is the hook other phases consume.
- Verify against Vercel preview over HTTPS (geolocation API requires a
  secure context; confirm no behavior surprises on the promoted-preview
  deploy model this project uses).

### Phase 2 — Wire event creation to real coordinates + full type parity
- Add `facility-picker.tsx`: type-ahead search against `facilities` (name/
  city/state ilike, same shape as mobile's `FacilityPicker` but web-native —
  a combobox, not a bottom sheet). Selecting a result sets `facility_id` and
  prefills `venue_name`/`city`/`state`.
- Keep a manual-entry escape hatch (free-text `location`) for organizers
  whose venue isn't in `facilities` yet — mirror mobile's dual-mode picker so
  the create form doesn't regress for anyone playing somewhere unlisted.
- Flip `EVENT_TYPES` in `community-play.ts` to mark quick game
  (`open_play`), mini tournament, mixer, and clinic as `available: true`
  (leave `practice` off the public create form — mobile treats it as a
  private 1-on-1 invite flow, not a discoverable event type; carrying that
  restriction forward is a straight port, not a new judgment call).
- Add `event-type-picker.tsx` and gate per-type fields: clinics get an
  `instructor_id` selector (profiles with an instructor flag/role — confirm
  the exact mobile field name before wiring), mini tournaments get a note
  that bracket setup happens after creation (reuse the existing tournament
  bracket flow rather than duplicating it).
- Add photo upload (`upload-event-cover.ts`) targeting the same
  `tournament-covers` storage bucket mobile uses, writing to
  `play_events.cover_url`.
- **`visibility` toggle:** do not port mobile's "Public / Invite Only"
  toggle as-is — it's cosmetic on mobile (never enforced; see §1c). For web,
  either (a) omit the toggle entirely for this phase, matching what actually
  happens today, or (b) add a real `visibility` column + enforce it in the
  discovery query in Phase 3. Recommendation: (a) for now — ship the field
  when there's a concrete request for private events, not as a side effect
  of porting a form.
- Update `/play/create` to submit `facility_id` (nullable), `cover_url`,
  and the selected `event_type`. No schema change — every field written
  here already exists on `play_events` and mobile already writes to all of
  them.

### Phase 3 — Nearby discovery on `/play`
- On load, call the Phase 1 hook; show a location-permission prompt row
  ("Show games near you") rather than forcing it — matches mobile's
  non-blocking fallback philosophy.
- Fetch events same as today (`neq('status','cancelled')`), excluding
  `event_type = 'practice'` (matches mobile's public-discovery exclusion),
  and select the joined facility's `latitude`/`longitude` (via
  `facilities!play_events_facility_id_fkey(latitude,longitude)`, same join
  mobile uses).
- Compute distance client-side (`distance.ts`, Haversine) for events that
  have a facility; events without one (manual-location) show no distance
  badge and sort last, not first — avoid the illusion of "0 mi away."
- Add `distance-filter.tsx` chip row (5/25/50/Any) and a type filter
  (quick game/round robin/mini tournament/mixer/clinic) — both client-side,
  same semantics as mobile's `ExploreFilterModal`.
- Add a sort control: Date (current default) vs. Distance.
- Keep the existing status filter (`All/Open/Live/Completed`) — this is
  additive, not a redesign.

### Phase 4 — Skill-range filter + polish
- Add the skill-band filter (3.0–3.5 / 3.5–4.0 / 4.0–4.5 / 4.5+) to `/play`,
  matching `FindGamesFilterModal`'s bands exactly so organizer-facing skill
  labels stay consistent between platforms.
- Add "Hide Full Games" toggle (client-side, `participant_count >=
  max_players`).
- At this point `/play` has full parity with mobile's Nearby tab's
  Community-Play category, minus the map.

### Phase 5 — Map view (Google Maps JS API)
- Add `@react-google-maps/api` as a dependency.
- Provision a Google Cloud Maps JavaScript API key: enable the "Maps
  JavaScript API" on a Google Cloud project with billing enabled, restrict
  the key to the production + preview domains (HTTP referrer restriction),
  and set it as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel env vars (all
  environments) — this needs to happen before any map code ships, since the
  key must exist to test locally.
- Build `nearby-map.tsx`: renders facility pins (from `search_facilities_nearby`)
  and event pins (from the Phase 3 fetch, using each event's facility
  coordinates), reusing the same distance/filter state Phases 3–4 already
  built. Clicking a pin opens the same card content the list row shows.
- Add the "search this area" pan-to-re-query pattern mobile uses for
  facilities: panning the map beyond a threshold surfaces a "Search this
  area" button that re-runs `search_facilities_nearby` centered on the new
  map center. This maps directly onto the existing RPC — no new backend
  work.
- List view stays the default; map is a toggle, matching mobile's
  map/list switch on the Nearby tab.
- **Cost note:** Google Maps JS API billing is usage-based (per map load).
  Confirm expected traffic before shipping to production, or cap map-view
  usage behind the existing "use my location" opt-in so map loads only
  happen for users who actively switch to map view.

---

## 5. Explicitly out of scope here (flagging, not building)

- **Groups/communities (workstream B)** — membership, roles, feed, join
  approval. Confirmed parked. Zero existing web surface; would need its own
  audit-to-plan pass the same size as this one, whenever that's scheduled.
  `groups`/`group_members`/`group_posts` etc. already exist in the schema
  and are untouched by anything above.
- **Event chat** — mobile's per-event conversation tab (Realtime-backed) has
  no web equivalent (`play-event-client.tsx` has no chat/conversation code
  today). Not needed for "nearby discovery" itself.
- **True server-side radius filtering for events/tournaments** — a
  `search_play_events_nearby`-style RPC doesn't exist even on mobile; D3
  above defers building one until fetch-and-sort stops scaling.
- **Enforcing event `visibility`** — Phase 2 explicitly does not add
  enforcement for a "Public / Invite Only" toggle (see Phase 2 recommendation
  (a)). This plan does not touch mobile code per this session's constraint
  either way.

---

## 6. Status

**All five phases built 2026-09-17.** Type-check, lint, the full Vitest
suite, and a production `next build` all pass on the finished state.

| Phase | Status | Notes |
|---|---|---|
| 1 — Location acquisition | ✅ Done | `web/src/lib/geo/browser-location.ts` — `navigator.geolocation` with `fetchIpLocation()` fallback. |
| 2 — Event creation + full type parity | ✅ Done | `facility-picker.tsx`, `instructor-picker.tsx`, `upload-event-cover.ts`; `/play/create` now supports quick game/round robin/mini tournament/clinic/mixer. `visibility` toggle deliberately NOT ported (see Phase 2 note). |
| 3 — Nearby discovery on `/play` | ✅ Done | Distance badge/sort, "Show games near you" row, type filter. |
| 4 — Skill-range filter + polish | ✅ Done | Skill bands + hide-full toggle folded into the same filter panel as Phase 3. |
| 5 — Map view (Google Maps) | ✅ Built, key not provisioned | `@react-google-maps/api` added; `nearby-map.tsx` gates on `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` via `isMapAvailable()` — map toggle stays hidden and everything else works normally until that key is set. See `PRODUCTION_CONFIG.md` for the provisioning steps. |

**Follow-on adjustment made during implementation, not originally called out
in the plan:** `/play/[id]/manage` had a Format-selector + Generate/Regenerate
Matches + Standings section that used to render unconditionally, because
round robin was the only creatable type when it was built. With quick
game/mixer/clinic now creatable, that bracket UI is gated to
`event_type in (round_robin, mini_tournament)` — the two structured types —
so a quick game organizer isn't shown a "Format: Singles/Doubles/Rotating"
control or a match-generation button that mobile has no equivalent of. Quick
games/mixers/clinics still get the full participant-management and
open→in_progress→completed lifecycle, just without the bracket layer.

**Still outside this plan's scope, unchanged:** Groups/communities
(workstream B), event chat, and server-side radius filtering for events —
all per §5.

**External action still needed from you:** provision
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (Google Cloud project, Maps JavaScript API
enabled, billing on, key restricted by HTTP referrer) and set it in Vercel +
`web/.env.local` for local dev. Everything else ships without it.
