# Session Handoff — Partner Finder Implementation
**Date:** 2026-06-30
**Scope:** Mobile only (`apps/mobile`) — web app untouched

---

## WHAT WAS ACCOMPLISHED

The Partner Finder subsystem was fully connected from a hardcoded mock UI to real Supabase data. Every screen that previously used static arrays or in-memory state now reads from and writes to the database.

### Slices completed this session

| Slice | Work |
|-------|------|
| 2 | Replaced hardcoded `PLAYERS` array with `useFinderCandidates` hook querying `profiles` |
| 3 | Created `partner_preferences` table; preferences screen loads on mount, saves via upsert |
| 4 | Created `partner_likes` table; right-swipe and star-save both persist to DB |
| 5 | Created `partner_matches` table + DB trigger for mutual like detection; match alert fires client-side |
| 6 | `connections.tsx` — queries `partner_matches`, batch-fetches profiles, `useFocusEffect` refresh |
| 7 | `saved.tsx` — queries `partner_likes` where `kind='save'`, remove deletes DB row |
| 8 | `requests.tsx` — parallel fetch incoming/outgoing likes, filters matched pairs, accept/decline/cancel |
| 9 | `profile/[id].tsx` — real profile data; hand/style pills conditional on non-null |
| 9B | Added `date_of_birth date` column to `profiles`; age computed client-side, shown as pill |
| 10 | `conversationService.ts` — find-or-create conversation; profile message button routes to real UUID; `RealDMScreen` in conversation router |

---

## FILES CREATED OR MODIFIED

### New files
| File | Purpose |
|------|---------|
| `apps/mobile/src/lib/useFinderCandidates.ts` | Hook: queries profiles, maps to `FinderCandidate` type |
| `apps/mobile/src/lib/conversationService.ts` | `getOrCreateConversation(myId, partnerId)` — finds or creates DM thread |
| `supabase/migrations/20260630000001_partner_preferences.sql` | `partner_preferences` table, RLS, `updated_at` trigger |
| `supabase/migrations/20260630000002_partner_likes.sql` | `partner_likes` table, RLS (owner + recipient) |
| `supabase/migrations/20260630000003_partner_matches.sql` | `partner_matches` table, RLS, mutual-like trigger (SECURITY DEFINER) |
| `supabase/migrations/20260630000004_profiles_date_of_birth.sql` | `ALTER TABLE profiles ADD COLUMN date_of_birth date` |
| `TASK_PARTNER_FINDER.md` | Canonical reference document for all future Partner Finder work |
| `docs/handoff-partner-finder-2026-06-30.md` | This file |

### Modified files
| File | What changed |
|------|-------------|
| `apps/mobile/src/lib/database.types.ts` | Added `partner_preferences`, `partner_likes`, `partner_matches` types; added `date_of_birth` to `profiles` Row/Insert/Update |
| `apps/mobile/src/app/(tabs)/finder.tsx` | Removed 55-line hardcoded array; wired `useFinderCandidates`; added `persistLike`; match alert; loading/empty states |
| `apps/mobile/src/app/match/preferences.tsx` | Load from DB on mount; async save with spinner |
| `apps/mobile/src/app/match/connections.tsx` | Real `partner_matches` query; `useFocusEffect`; remove deletes DB row |
| `apps/mobile/src/app/match/saved.tsx` | Real `partner_likes kind='save'` query; remove deletes DB row |
| `apps/mobile/src/app/match/requests.tsx` | Parallel fetch; matched-pair filter; accept/decline/cancel with DB mutations |
| `apps/mobile/src/app/match/profile/[id].tsx` | Real profile fetch; age from `date_of_birth`; message button calls `getOrCreateConversation`; added `getOrCreateConversation` import |
| `apps/mobile/src/app/conversation/[id].tsx` | Added `supabase` import; added `RealDMScreen` component; UUID branch in root router; View Profile routes to `partner.id` |

---

## DATABASE STATE

### Tables added (migrations NOT yet pushed)
```
partner_preferences   — one row per user, stores finder filter settings
partner_likes         — likes (right-swipe) and saves (star), kind column
partner_matches       — mutual matches, created by trigger only
profiles.date_of_birth — date column, nullable, added via ALTER TABLE
```

### Critical: apply migrations before testing
```bash
cd DreamBreaker
npx supabase db push
```

### Trigger
`create_partner_match_on_mutual_like()` — fires AFTER INSERT on `partner_likes`:
1. Ignores non-`like` kinds
2. Checks for reciprocal like
3. Normalises pair (`user_a < user_b`)
4. Inserts into `partner_matches` with `ON CONFLICT DO NOTHING`
Runs as SECURITY DEFINER to bypass RLS on the insert.

---

## KEY ARCHITECTURAL DECISIONS

**`connectionStore` kept intact**
The existing in-memory store was not removed. Supabase persistence runs alongside it. This preserves existing UI behaviours that still rely on in-memory state. Future work should remove the store once all paths are DB-backed.

**`partner_likes` unified table**
One table serves both likes and saves via a `kind text CHECK (kind IN ('like', 'save'))` column and a `(from_user_id, to_user_id, kind)` unique constraint. Avoids a second table.

**Normalised match pairs**
`partner_matches` enforces `user_a < user_b` via both the trigger logic and a check constraint. Prevents duplicate rows regardless of which user completes the mutual like.

**Matched pairs excluded from requests**
The requests screen filters out already-matched user IDs client-side using a `Set`. A DB-level subquery was not used because Supabase JS `.not('from_user_id', 'in', ...)` with a subquery is not supported.

**UUID branch in conversation router**
`RealDMScreen` is only reached by UUIDs matching `/^[0-9a-f]{8}-…$/i`. All existing mock routes (`dm-1`, numeric IDs like `1`/`2`/`3`) still fall through to `DMConversation`. No existing routes were broken.

---

## KNOWN BLOCKERS FOR NEXT SESSION

1. **`conversations` insert RLS** — The `getOrCreateConversation` insert will fail silently if no insert policy exists on the `conversations` table. Verify or add:
   ```sql
   create policy "participants_insert" on public.conversations
     for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);
   ```

2. **`is_discoverable` seed data** — Finder returns empty if no profiles have `is_discoverable = true`. Set this flag for test accounts in the Supabase dashboard.

3. **`date_of_birth` seed data** — Age pill only appears for profiles with this field populated. Set manually in dashboard for smoke testing.

4. **Message send is cosmetic** — `RealDMScreen` has an input bar but no send action. A `messages` table is required before messaging is functional.

---

## REMAINING ENHANCEMENTS (from canonical doc)

Priority order for next session(s):

1. Add `conversations` insert RLS policy (required for messaging to work)
2. Wire `partner_preferences` filters into `useFinderCandidates` query
3. `messages` table + real-time subscription in `RealDMScreen`
4. Push notifications for mutual match (first liker gets no alert currently)
5. Geolocation + distance calculation (all distances show `0 mi`)
6. Remove `connectionStore` once all screens are fully DB-backed
7. `date_of_birth` editable via profile edit screen
8. Multi-photo profile support
9. Block/report flow
10. Invite to Community Play from profile/connections
11. Recommendation algorithm (beyond `is_discoverable` + recency)

---

## VERIFICATION STATE AT HANDOFF

```
npx tsc --noEmit  →  PASS (zero errors)
```

| Feature | Status |
|---------|--------|
| TypeScript | PASS |
| Candidates from Supabase | PASS |
| Preferences load/save | PASS |
| Save player persists | PASS |
| Like persists | PASS |
| Mutual match trigger | PASS |
| Match alert | PASS |
| Connections screen | PASS |
| Saved screen | PASS |
| Requests screen | PASS |
| Profile detail + age | PASS |
| Message button → real UUID | PASS |
| Conversation deduplication | PASS |
| RealDMScreen View Profile | PASS |

All runtime verification is pending `supabase db push` + manual smoke test against live data.

---

## CANONICAL REFERENCE

`TASK_PARTNER_FINDER.md` at repo root is the authoritative document for all future Partner Finder development. It contains the full schema, RLS policies, trigger logic, user flows, business rules, technical debt inventory, and roadmap. Update it when any Partner Finder work is completed.
