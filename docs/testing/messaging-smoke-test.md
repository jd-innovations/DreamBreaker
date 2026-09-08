# Messaging Smoke Test Checklist

**Feature:** Player Messaging MVP  
**Slices covered:** 2 (schema/RLS), 3 (service), 4 (chat list), 5 (DM screen), 6 (Partner Finder entry), 7 (Community Play entry)  
**Prerequisite:** `npx supabase db push` applied through `20260630000005_messaging_rls_fixes`

---

## SETUP

- [ ] Two test accounts exist in Supabase (`user_a`, `user_b`)
- [ ] Both profiles have `is_discoverable = true`
- [ ] Both accounts have mutual `partner_likes` rows (`kind = 'like'`) so RLS allows conversation creation
- [ ] A `partner_matches` row exists for the pair (created automatically by trigger on mutual like)
- [ ] At least one profile has `date_of_birth` set so age pill renders

---

## CHAT LIST — `(tabs)/chat.tsx`

### Load

- [ ] Chat tab loads without crash
- [ ] Spinner shows while fetching
- [ ] Empty state shows "No conversations yet" when user has no conversations
- [ ] Conversation rows appear once data loads
- [ ] Partner name displays correctly
- [ ] Partner avatar displays if `avatar_url` is set; initials fallback if not
- [ ] `last_message_at` timestamp renders in correct relative format (e.g. "2:30 PM", "Yesterday", "Mon")
- [ ] Last message body preview shows real message text, not placeholder
- [ ] Unread badge shows correct count (gold pill, white number)
- [ ] Conversations are sorted newest-first by `last_message_at`
- [ ] "Direct Message" tag renders on each row

### Search

- [ ] Typing in search bar filters by partner name
- [ ] Clearing search restores full list
- [ ] Searching a name not in list shows empty state

### Focus refresh

- [ ] Navigate away from Chat tab and back — list refreshes (new conversations appear without restart)

### Error

- [ ] Simulate offline / revoke Supabase anon key — error state shows with Retry button
- [ ] Tapping Retry reloads the list

---

## DM SCREEN — `conversation/[id].tsx` (UUID route)

### Load

- [ ] Tapping a conversation row navigates to the DM screen
- [ ] Partner name appears in the header
- [ ] Partner avatar appears if set; person-icon fallback if not
- [ ] DUPR rating pill appears in header if profile has a rating
- [ ] Spinner shows while messages load
- [ ] Empty state "Start the conversation" shows for new conversations with no messages
- [ ] Real messages render in correct sent/received bubbles
- [ ] Sent messages (own `sender_id`) appear right-aligned, navy bubble, white text
- [ ] Received messages appear left-aligned, light grey bubble, dark text
- [ ] Message timestamps display in `HH:MM AM/PM` format
- [ ] Read checkmark (`checkmark-done`) shows on sent messages where `read_at` is set
- [ ] Messages scroll to bottom on open
- [ ] New messages scroll into view after sending

### Send

- [ ] Text input accepts typing
- [ ] Send button is inactive (grey) when input is empty
- [ ] Send button activates (gold) when input has text
- [ ] Tapping send with empty/whitespace input does nothing
- [ ] Tapping send with valid text inserts message into DB
- [ ] Sent message appears immediately in the bubble list (optimistic append)
- [ ] Input clears after send
- [ ] Spinner replaces send icon while send is in flight
- [ ] After send: verify row exists in Supabase `messages` table
- [ ] After send: `conversations.last_message_at` updated in DB
- [ ] After send: Chat list preview updates on next tab focus

### Mark read

- [ ] Opening a conversation with unread messages triggers `markConversationRead`
- [ ] After opening: verify `read_at` is set on received messages in Supabase `messages` table
- [ ] Unread badge on Chat list clears after returning from conversation

### Header actions

- [ ] Back button navigates back to Chat list
- [ ] "Profile" button in header navigates to `/match/profile/[partner_id]`

### Error

- [ ] Simulate message load failure — error state shows with Retry
- [ ] Tapping Retry reloads messages

---

## PARTNER FINDER ENTRY — `match/profile/[id].tsx`

### Message button

- [ ] Message button is visible in the sticky CTA bar on a partner profile
- [ ] Tapping message button shows spinner while creating/finding conversation
- [ ] On success: navigates to `/conversation/{uuid}` — UUID format, not `dm-*`
- [ ] Second tap on same profile reuses the existing conversation (no duplicate rows in `conversations`)
- [ ] Verify in Supabase: only one row exists for the pair regardless of how many times tapped

### Guards

- [ ] Viewing your own profile (if navigable): message button does nothing (self-guard)
- [ ] Signed-out user: message button shows "Sign in required" alert
- [ ] No mutual like / RLS blocks insert: error alert shown, does not crash

---

## RLS VERIFICATION (Supabase dashboard or SQL editor)

Run as `user_a`:

```sql
-- Should return only conversations user_a participates in
select * from public.conversations;

-- Should return only messages in those conversations
select * from public.messages;
```

Run as `user_b` (different session):

```sql
-- Should NOT return user_a's conversations that user_b is not part of
select * from public.conversations where participant_a != auth.uid() and participant_b != auth.uid();
-- Expected: 0 rows
```

- [ ] `conversations` select returns only own conversations
- [ ] `messages` select returns only messages in own conversations
- [ ] `conversations` insert with no mutual like returns RLS error
- [ ] `conversations` insert for mutual partners succeeds
- [ ] `messages` insert with wrong `sender_id` returns RLS error
- [ ] `messages` update `read_at` on received message succeeds
- [ ] `messages` update `read_at` on own sent message returns RLS error (sender_id check)
- [ ] `conversations` update `last_message_at` succeeds as participant

---

## MOCK ROUTES (regression — must still work)

- [ ] `/conversation/dm-director` loads Generic DM (director) screen
- [ ] `/conversation/dm-organizer` loads Generic DM (organizer) screen
- [ ] `/conversation/event-1` loads Group Chat screen
- [ ] `/conversation/1` (or any non-UUID non-`dm-`/`event-` id) loads fallback `DMConversation` (Sarah M. mock)

---

## COMMUNITY PLAY ENTRY — `community/[id].tsx`

### Message Organizer (Overview tab)

- [ ] "Message Organizer" button is visible below organizer card
- [ ] When `event.organizer.userId` is null (mock data): button navigates to `/conversation/dm-organizer` (mock fallback)
- [ ] When `event.organizer.userId` is a real UUID: button calls `getOrCreateConversation`, navigates to `/conversation/{uuid}`
- [ ] Spinner shows inside button while conversation is being created
- [ ] Signed-out user: button shows "Sign in required" alert
- [ ] Self-message guard: if organizer UUID matches own user ID, button does nothing

### Participant Message (Players tab → Accepted)

- [ ] When `player.userId` is null (mock data): row shows "Accepted" chip (no message button)
- [ ] When `player.userId` is a real UUID: row shows message icon button (gold circle)
- [ ] Tapping message icon: spinner shows, navigates to `/conversation/{uuid}` on success
- [ ] Error alert shown if conversation creation fails
- [ ] Self-message guard: cannot message yourself even if your own UUID appears in the list

---

## KNOWN LIMITATIONS (not blocking MVP)

- Realtime — new messages from partner require navigating away and back to appear (Slice 9)
- Last message preview query fetches all messages for all conversations; acceptable at MVP scale
- `markConversationRead` requires the `messaging_rls_fixes` migration; no-op if migration not applied
- Community Play detail screen still uses mock event/player data; `userId` fields are all `null` until screen is Supabase-backed
- Tournament director message route still uses mock `dm-director` ID (Slice 8)
- Send failure is silent in the UI (draft preserved, no toast)
