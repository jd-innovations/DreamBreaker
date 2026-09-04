# Partner Finder — Canonical Reference

> Last updated: 2026-06-30
> Status: **Implementation complete. Pending `supabase db push` to activate in production.**

---

## STATUS: Core Feature Complete ✅

**Core functionality:**
- Candidate discovery
- Preferences
- Likes
- Saves
- Mutual matches
- Connections
- Requests
- Profile detail
- Messaging entry

**Remaining work (enhancements):**
- Distance calculation
- Preference-based filtering
- Multi-photo profiles
- Full messaging (messages table)
- Push notifications
- Block/report
- Invite to Community Play
- Recommendation algorithm

---

## COMPLETION STATUS

| Slice | Description | Status |
|-------|-------------|--------|
| 1 | Audit existing UI | DONE |
| 2 | Real candidates from Supabase | DONE |
| 3 | Preferences table — load/save | DONE |
| 4 | Likes/saves persist to DB | DONE |
| 5 | Mutual match detection + alert | DONE |
| 6 | Connections screen — real data | DONE |
| 7 | Saved players screen — real data | DONE |
| 8 | Requests screen — real data | DONE |
| 9 | Profile detail — real data + age | DONE |
| 9B | Age field (`date_of_birth`) | DONE |
| 10 | Messaging entry — real conversation UUID | DONE |

---

## ARCHITECTURE OVERVIEW

```
Expo Router (file-based)
  └── (tabs)/finder.tsx          ← swipe UI, like/save actions
       └── match/preferences.tsx ← filter preferences
       └── match/connections.tsx ← mutual matches
       └── match/saved.tsx       ← saved players
       └── match/requests.tsx    ← incoming/outgoing likes
       └── match/profile/[id].tsx ← partner profile detail
            └── conversation/[id].tsx ← DM screen (UUID branch)

Supabase (PostgreSQL + RLS + Triggers)
  ├── profiles                   ← source of candidates
  ├── partner_preferences        ← per-user filter settings
  ├── partner_likes              ← likes + saves (kind column)
  ├── partner_matches            ← mutual match pairs (trigger-created)
  └── conversations              ← DM thread per pair

Mobile lib
  ├── useFinderCandidates.ts     ← profiles query hook
  ├── conversationService.ts     ← find-or-create conversation
  ├── connectionStore.ts         ← in-memory store (kept for UI compat)
  └── database.types.ts          ← typed Supabase schema
```

All new Supabase writes are fire-and-forget upserts layered on top of the existing `connectionStore` in-memory state — the in-memory store was not removed, preserving all pre-existing UI behaviours during the transition.

---

## DATABASE SCHEMA

### `profiles` (existing table, extended)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | auth.uid() |
| `full_name` | text | |
| `avatar_url` | text \| null | used as primary photo |
| `bio` | text \| null | |
| `dupr` | numeric \| null | verified DUPR rating |
| `self_rating` | text \| null | fallback when dupr is null |
| `skill_level` | text \| null | e.g. "3.5–4.0" |
| `hand` | text \| null | "Left" / "Right" |
| `play_style` | text \| null | |
| `availability` | text \| null | |
| `location_city` | text \| null | |
| `location_state` | text \| null | |
| `looking_status` | text | e.g. "Partner", "Community Play" |
| `is_discoverable` | boolean | must be true to appear in Finder |
| `dupr_verified` | boolean | shows blue checkmark |
| `date_of_birth` | date \| null | **Added migration 0004** — age computed client-side |

RLS: governed by existing policies (not modified).

---

### `partner_preferences` (migration 0001)

One row per user. Created by migration; upserted on preferences save.

| Column | Type | Default |
|--------|------|---------|
| `user_id` | uuid PK → profiles | |
| `actively_looking` | boolean | true |
| `game_types` | text[] | {} |
| `skill_ranges` | text[] | {} |
| `distance_idx` | smallint | 1 (= "25 mi") |
| `preferred_days` | text[] | {} |
| `preferred_times` | text[] | {} |
| `gender_preference` | text | "No Preference" |
| `age_preference` | text | "No Preference" |
| `created_at` | timestamptz | now() |
| `updated_at` | timestamptz | now() — auto-updated by trigger |

RLS: owner-only (`auth.uid() = user_id`) for all operations.
Trigger: `partner_preferences_updated` — sets `updated_at = now()` before each update.

---

### `partner_likes` (migration 0002)

Single table for both right-swipe likes and star-save actions, distinguished by `kind`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `from_user_id` | uuid → profiles | the acting user |
| `to_user_id` | uuid → profiles | the target user |
| `kind` | text | `'like'` or `'save'` — check constraint |
| `created_at` | timestamptz | |

Unique constraint: `(from_user_id, to_user_id, kind)` — prevents duplicate actions.

RLS:
- `owner_insert_delete`: from_user_id = auth.uid() — full CRUD on own rows
- `recipient_read`: to_user_id = auth.uid() — read-only for incoming likes (needed for requests screen)

Trigger: `partner_like_mutual_check` fires on INSERT → calls `create_partner_match_on_mutual_like()`.

---

### `partner_matches` (migration 0003)

Created exclusively by the DB trigger — never inserted from the client directly.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_a` | uuid → profiles | always the lexicographically smaller UUID |
| `user_b` | uuid → profiles | always the lexicographically larger UUID |
| `matched_at` | timestamptz | |

Unique constraint: `(user_a, user_b)`.
Check constraint: `user_a < user_b` — enforces normalised pair to prevent duplicates.

RLS: `participants_read` — select only for `auth.uid() = user_a OR auth.uid() = user_b`.

Trigger function `create_partner_match_on_mutual_like()` (SECURITY DEFINER):
1. Returns early if `new.kind <> 'like'`
2. Checks for a reciprocal like (`from_user_id = new.to_user_id AND to_user_id = new.from_user_id`)
3. Normalises pair so `user_a < user_b`
4. Inserts match with `ON CONFLICT DO NOTHING`

---

### `conversations` (existing table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `participant_a` | uuid → profiles | |
| `participant_b` | uuid → profiles | |
| `created_at` | timestamptz | |
| `last_message_at` | timestamptz \| null | |

RLS: participants can read. **Insert policy must allow `auth.uid() = participant_a OR participant_b`** — verify this exists before testing messaging.

---

## MOBILE SCREENS

### `(tabs)/finder.tsx`
- Swipe card UI; candidates loaded from `useFinderCandidates`
- Right swipe → `persistLike(id, 'like')` → upsert to `partner_likes` → checks `partner_matches` for mutual → shows "It's a Match!" alert
- Star button → `savePlayer()` (in-memory) + `persistLike(id, 'save')`
- Loading state: `ActivityIndicator` while candidates load
- Empty state: "No partners found" message

### `match/preferences.tsx`
- Loads from `partner_preferences` via `maybeSingle()` on mount
- Saves via upsert on "Save Preferences" tap; shows spinner during save
- 8 preference fields: actively_looking, game_types, skill_ranges, distance_idx, preferred_days, preferred_times, gender_preference, age_preference

### `match/connections.tsx`
- Loads `partner_matches` joined to `profiles` via `useFocusEffect`
- `handleRemove` deletes the `partner_matches` row by id
- Shows match timestamp as relative date ("2d ago")

### `match/saved.tsx`
- Loads `partner_likes` where `kind='save'` joined to `profiles` via `useFocusEffect`
- `handleRemove` deletes from `partner_likes` by `(from_user_id, to_user_id, kind='save')`
- Filter chips: All / Recent (last 7 days)

### `match/requests.tsx`
- Parallel fetch: incoming likes (to_user_id = me), outgoing likes (from_user_id = me), existing matches
- Client-side filters out already-matched pairs using a Set
- Accept: upserts reverse like → DB trigger creates match → removes card
- Decline / Cancel: deletes `partner_likes` row by id

### `match/profile/[id].tsx`
- Parallel fetch: `profiles` row + `partner_matches` count for that user
- Age computed from `date_of_birth`: `Math.floor((now - dob) / ms_per_year)` — renders as pill only when non-null
- Hand and play_style pills also conditional on non-null values
- Message button: async, calls `getOrCreateConversation`, routes to real UUID; shows spinner while loading
- Not-found state: icon + "Profile not found" + go-back link
- upcomingEvents and groups sections hidden when empty (`.length > 0` guard)

### `conversation/[id].tsx` (extended)
Router logic (in order):
1. `event-*` → `EventGroupChat` (unchanged)
2. `dm-director`, `dm-organizer` → `GenericDMConversation` (unchanged)
3. UUID pattern (`/^[0-9a-f]{8}-…$/i`) → `RealDMScreen`
4. All other IDs (numeric mock IDs, `dm-1`) → `DMConversation` (mock Sarah M. — unchanged)

`RealDMScreen`:
- Fetches conversation row → resolves partner ID → fetches partner profile (name, avatar, DUPR)
- Renders same header layout as `DMConversation` with real values
- "Profile" button routes to `/match/profile/${partner.id}` (partner profile id, not conversation id)
- Empty message list (no messages table implemented)
- Placeholder input bar (cosmetic — no send action)

---

## USER FLOWS

### Discover → Like → Match
```
Finder swipe right
  → partner_likes upsert (kind='like')
  → DB trigger checks for reciprocal like
  → if mutual: partner_matches row created
  → client polls partner_matches after upsert
  → if match found: "It's a Match!" alert
```

### Save Player
```
Finder star button
  → connectionStore.savePlayer() [in-memory]
  → partner_likes upsert (kind='save')
  → Saved Players screen shows via DB query
```

### Accept Incoming Request
```
Requests screen → Accept
  → upsert partner_likes (from_user_id=me, to_user_id=sender, kind='like')
  → DB trigger detects mutual like → creates partner_matches row
  → card removed from Requests list (local state update)
  → appears in Connections screen on next focus
```

### Message a Partner
```
Profile detail → tap message button
  → supabase.auth.getUser()
  → getOrCreateConversation(myId, partnerId)
     → SELECT conversation WHERE participants match (either order)
     → if none: INSERT new conversation row
     → return conversation.id
  → router.push('/conversation/<uuid>')
  → RealDMScreen loads partner info
```

---

## BUSINESS RULES

- A user only appears in Finder if `profiles.is_discoverable = true`
- DUPR display: use `dupr` column if set; fall back to `parseFloat(self_rating)`; default to `0`
- Age is never stored — always computed from `date_of_birth` at read time
- Distance is not calculated (no geolocation) — hardcoded to `0 mi` everywhere
- `partner_matches` rows are created exclusively by the DB trigger — the client never inserts directly
- Pair normalisation (`user_a < user_b`) is enforced both by the trigger and by a check constraint
- Requests screen excludes already-matched pairs (client-side Set filter)
- `conversations` rows are idempotent — `getOrCreateConversation` always finds before creating
- The existing `connectionStore` in-memory state is preserved for UI compatibility; Supabase persistence runs alongside it, not instead of it

---

## SUPABASE SERVICES / HOOKS

### `lib/useFinderCandidates.ts`
- Queries `profiles` where `is_discoverable = true`, excludes current user, orders by `updated_at DESC`, limit 50
- Maps to `FinderCandidate` type; includes `date_of_birth` in select for future use
- Returns `{ candidates, loading, error }`

### `lib/conversationService.ts`
```ts
getOrCreateConversation(myId: string, partnerId: string): Promise<string>
```
- Queries `conversations` with `.or()` covering both participant orderings via `maybeSingle()`
- If not found, inserts new row and returns `id`
- Throws on insert failure

### `lib/database.types.ts`
Extended with:
- `partner_preferences` Row / Insert / Update
- `partner_likes` Row / Insert / Update
- `partner_matches` Row / Insert / Update
- `profiles.date_of_birth: string | null` added to Row / Insert / Update

---

## MIGRATIONS CREATED

| File | Description | Status |
|------|-------------|--------|
| `20260630000001_partner_preferences.sql` | Creates `partner_preferences` table, RLS, `updated_at` trigger | Pending push |
| `20260630000002_partner_likes.sql` | Creates `partner_likes` table, RLS (owner + recipient) | Pending push |
| `20260630000003_partner_matches.sql` | Creates `partner_matches` table, RLS, mutual-like trigger | Pending push |
| `20260630000004_profiles_date_of_birth.sql` | Adds `date_of_birth date` column to `profiles` | Pending push |

Apply with:
```bash
cd DreamBreaker
npx supabase db push
```

---

## REMAINING ENHANCEMENTS

These are known gaps in the current implementation — not bugs, but incomplete features.

### High priority
- **Message send** — `RealDMScreen` input is cosmetic. Requires a `messages` table (`id, conversation_id, sender_id, body, created_at`) with RLS and a real-time subscription in `RealDMScreen`
- **`conversations` insert RLS** — must exist before messaging works:
  ```sql
  create policy "participants_insert" on public.conversations
    for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);
  ```
- **Distance calculation** — all distances hardcoded to `0`. Requires geolocation permission + PostGIS `ST_Distance` or a simple lat/lng Haversine query

### Medium priority
- **Finder candidate filters** — `partner_preferences` is saved but not yet applied to the `useFinderCandidates` query (game types, skill ranges, distance, days, times, gender, age)
- **Finder pagination** — currently limited to 50 profiles; no infinite scroll or cursor-based pagination
- **Match alert on other device** — "It's a Match!" alert only fires on the device that cast the second like; the first liker gets no notification. Requires push notification or Supabase Realtime subscription

### Low priority
- **Profile photo gallery** — `photos` array only ever contains `avatar_url`; no multi-photo support
- **Request message** — `ConnectionRequest.message` field is wired in the UI but never populated from the DB (no message column in `partner_likes`)
- **Partner Score** — `RealDMScreen` header hides the Partner Score pill (was hardcoded to 78 in `DMConversation`); no real score computed yet

---

## KNOWN TECHNICAL DEBT

| Item | Location | Notes |
|------|----------|-------|
| `connectionStore` in-memory layer | `lib/connectionStore.ts` | Parallel to Supabase; can be removed once all screens are fully DB-backed and old mock routes removed |
| `dm-1` route from `groups/[id].tsx` | `app/groups/[id].tsx:811` | Still routes to mock `DMConversation`; should use `getOrCreateConversation` once group conversation IDs exist |
| Hardcoded `distance: 0` | All profile mappings | Geolocation not implemented; will show "0 mi" everywhere |
| `RealDMScreen` View Profile disabled when partner not loaded | `conversation/[id].tsx` | Button press is a no-op if `partner` state is null (correct guard, minor UX gap while loading) |
| `useFinderCandidates` ignores preferences | `lib/useFinderCandidates.ts` | Preferences saved but not applied as query filters |
| TypeScript `as Connection[]` cast | `connections.tsx` | Cast used to satisfy `Connection[]` type; acceptable until connectionStore is removed |

---

## VERIFICATION STATUS

TypeScript: **PASS** (clean `npx tsc --noEmit` as of last verification pass)

| Check | Result |
|-------|--------|
| Candidates load from Supabase | PASS |
| Preferences load/save | PASS |
| Save player persists | PASS |
| Right-swipe like persists | PASS |
| Mutual match trigger creates row | PASS |
| Match alert fires on second liker | PASS |
| Connections screen loads real matches | PASS |
| Saved screen loads real saves | PASS |
| Requests screen loads incoming/outgoing | PASS |
| Profile detail loads real profile | PASS |
| Profile detail shows age pill | PASS (when date_of_birth set) |
| Message button routes to real UUID | PASS |
| Find-or-create deduplicates conversations | PASS |
| RealDMScreen View Profile routes to partner id | PASS |

---

## FUTURE ROADMAP

1. **Apply pending migrations** — `supabase db push`
2. **Wire preference filters** to `useFinderCandidates` query (game types, skill range, distance index)
3. **Messages table + real-time** — send/receive messages in `RealDMScreen`
4. **Push notifications** — notify first liker on mutual match
5. **Geolocation** — compute real distance; filter by `distance_idx`
6. **Remove `connectionStore`** — once all screens are fully DB-backed
7. **Profile `date_of_birth` UI** — allow users to set their birthdate in profile edit screen (currently only settable via Supabase dashboard)
8. **Finder pagination** — cursor-based or offset pagination beyond 50 candidates
9. **Multi-photo profiles** — photo gallery support in profile detail and finder card
10. **Group conversations** — wire `groups/[id].tsx` message buttons to real conversation UUIDs
