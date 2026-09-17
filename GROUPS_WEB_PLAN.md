# Groups — Web Implementation Plan

Audit + plan written 2026-09-17, revised same day after decisions. Scope:
**web app only** (`web/`). No mobile code is touched by this document or by
the work it describes. Companion to `COMMUNITY_GAMES_WEB_PLAN.md` — that plan
covers Community Play (pickup games); this one covers Groups, the social-
community feature that plan deliberately parked as workstream B.

**Decisions locked in 2026-09-17 — three of the four go beyond straight
mobile parity, which changes what this plan needs to build:**
- **Full feed parity from the start.** Text posts, polls, and photo posts
  all ship together in one phase, not split into a later "richness" pass.
- **Real invite-link-gated secret groups.** Mobile's copy promises this but
  never built it (§3b). This plan builds the actual mechanism — a
  shareable join link — which mobile has no equivalent of. **New schema.**
- **Invite Members = open search by name/handle.** Fully decoupled from any
  connections/matchmaking system, per your correction that Groups and
  matchmaking are separate features. Mobile restricts invite candidates to
  `partner_matches` connections; web does not carry that restriction over.
- **Group-admin moderation view.** Mobile has none — reports only ever
  reach site-wide admins. This plan adds a scoped view so a group's own
  admins/owners can see and act on reports filed within their group.
  **New schema (RLS).**

Because two of these are real additions beyond what mobile has, this plan
now includes two new migrations. Everything else still needs zero schema
changes.

---

## 1. Current state

**Mobile: full build.** `apps/mobile/src/app/groups/[id].tsx` (1818 lines) +
`apps/mobile/src/lib/groupService.ts` + `apps/mobile/src/lib/supabase/
groupInvites.ts`. Directory screen at `apps/mobile/src/app/(tabs)/partner.tsx`
(the Groups tab, despite the filename).

**Web: zero.** `web/src/app/groups/[id]/page.tsx` is only a
`MobileLinkFallback` — an SEO/share-link card that tells the visitor to open
the group in the mobile app. No directory, no create flow, nothing reads or
writes any `group_*` table from web today.

**Schema: mostly built already.** `groups`, `group_members`, `group_invites`,
`group_posts`, `group_post_comments`, `group_post_likes`, `group_poll_options`,
`group_poll_votes`, `group_photos`, `group_post_reports` all exist with RLS
already in place, and storage bucket `group-photos` exists (public read,
authenticated upload, own-delete). This plan adds one column and two RPCs
for shareable secret-group invite links, and one RLS policy pair for
group-admin moderation — see §5.

---

## 2. What the mobile feature actually is (condensed from the full audit)

**A group** (`groups` table): name, description, banner image, location,
skill focus, privacy (`public`/`private`/`secret`), `allow_invites`,
`allow_posts`, an owner (`organizer_id`), and a linked `conversations` row
(every group gets a group chat for free via `conversation_id`).

**Membership** (`group_members`): role (`owner`/`admin`/`member`) × status
(`active`/`pending`). Two ways in on mobile today:
- **Self-serve**: `joinGroup()` — public and secret groups join instantly;
  private groups go to `pending` and need an admin's approval.
- **Invited**: an admin or (if `allow_invites`) any member sends a targeted
  `group_invites` row to one of their existing `partner_matches` connections;
  the invitee gets a notification and an "Accept Invite" state on the group
  page.

Web adds a third way in for secret groups specifically (§5, new) — a
shareable invite link — and replaces the connections-restriction on targeted
invites with open user search (§5, new).

**The Feed**: text posts, single-choice polls, and photo-posts, each with
likes (toggle) and comments (one level of nesting, edit/delete by author,
report by anyone else). A separate Photos tab shows every photo ever
uploaded to the group (feed-sourced or standalone). Creating a Community
Play event from inside a group tags it with `group_id` and it appears as a
synthetic "New event created" card interleaved into the Feed by timestamp.

**Admin tools**: approve/decline join requests, promote/demote
admin↔member, remove a member, edit group settings, delete the group
(owner only — enforced at the RLS layer, not just hidden in the UI).

**What it deliberately is NOT (on mobile — web adds two of these back in,
see §5)**: no realtime (feed is fetch-on-load, not subscribed — web keeps
this as-is), no rich moderation UI for group admins (web adds one), no
invite-link mechanism (web adds one).

---

## 3. Two facts that shaped the decisions above

### 3a. Web's "connections" and mobile's "connections" are different graphs

Mobile's invite-candidate list and its Members-tab "Connect" button both read
`partner_matches`, populated by mobile's own like/pass partner-finder. Web's
matchmaking page uses a separate, structurally similar but non-overlapping
system (`matchmaking_swipes` / `v_mutual_matches`). **This is now moot for
Groups** — the decision was to decouple Invite Members from any
connections/matchmaking system entirely (open search instead), so neither
table is read by anything in this plan. The divergence between the two
connections systems still exists platform-wide and is still out of scope
here (§8) — it just no longer matters for Groups specifically.

### 3b. "Secret" groups don't behave like the name implies — now being fixed

Mobile's create-group copy says secret groups are "Only people with an
invite link can join," but no invite-link mechanism exists in the code —
`joinGroup()` treats `secret` identically to `public` (instant join), and
the only thing that actually makes a group "secret" is exclusion from
`fetchDiscoverGroups`. A secret group's row is already properly hidden by
RLS from anyone who isn't a member, the organizer, or has a pending targeted
invite — so the gap isn't a security hole, it's a missing *feature*: there's
no way to hand someone a link that gets them in without an admin
individually inviting them first. §5 designs that mechanism for web.

---

## 4. Scope for the web build

Given full feed parity ships in one pass, this plan is less about staging
Core-vs-richness and more about sequencing what depends on what. Everything
below ships as one coherent feature; the phases in §6 are build order, not
a v1/v2 split.

- Groups directory: "My Groups" + "Discover Groups" (public groups only).
- Create group: name, description, banner upload, location, skill, privacy,
  `allow_invites`, `allow_posts`. Secret groups get an invite link generated
  at creation (§5).
- Group detail page: banner header, membership-state CTA (Join / Leave /
  Requested / Accept Invite / "Ask for an invite link" for secret groups),
  privacy-gated tab visibility matching mobile's matrix.
- Members tab: list, role badges, join-request approve/decline, promote/
  demote/remove, Message button (wires into web's existing
  `/conversation/[id]`).
- Feed tab: text posts, polls, and photo posts together — compose, like,
  comment (one level of nesting), edit/delete own content, report others'.
  Community Play events tagged with this `group_id` still surface as
  synthetic feed cards.
- Photos tab: grid of every photo uploaded to the group, upload, own-delete.
- Group Settings (admin): edit fields, manage/regenerate invite link
  (secret groups), delete group (owner only).
- Invite Members: open search by name/handle (§5), sends the same
  `group_invites` row mobile uses under the hood.
- **New**: Reports view for group admins/owners (§5) — see and resolve
  reports filed within their own group, in addition to (not instead of)
  site-wide admin review.

---

## 5. What's actually new here (schema + design)

### 5a. Shareable invite links for secret groups (new)

**Migration** (illustrative — final SQL gets written as a real migration
file when this phase starts, following the repo's committed-migration
convention, not applied ad hoc):

```sql
ALTER TABLE public.groups
  ADD COLUMN invite_token text UNIQUE;

-- Generated only for secret groups, on creation and on "regenerate link."
-- Nullable so public/private groups simply never have one.

CREATE OR REPLACE FUNCTION public.get_group_preview_by_invite_token(p_token text)
RETURNS TABLE (id uuid, name text, description text, image_url text, member_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.id, g.name, g.description, g.image_url,
         (SELECT count(*) FROM group_members m WHERE m.group_id = g.id AND m.status = 'active')
  FROM groups g
  WHERE g.invite_token = p_token AND g.privacy = 'secret';
$$;
-- SECURITY DEFINER deliberately: this is the one narrow, intentional bypass
-- of the "secret groups are invisible without membership" RLS policy — it
-- reveals only a minimal preview (no member list, no feed), gated on
-- knowing the exact token, not on browsing/guessing.

CREATE OR REPLACE FUNCTION public.join_group_via_invite_token(p_token text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_group_id uuid;
begin
  select id into v_group_id from groups where invite_token = p_token and privacy = 'secret';
  if v_group_id is null then raise exception 'invalid_invite_link'; end if;
  insert into group_members (group_id, user_id, role, status)
    values (v_group_id, p_user_id, 'member', 'active')
    on conflict (group_id, user_id) do update set status = 'active';
  insert into conversation_participants (conversation_id, user_id, role)
    select conversation_id, p_user_id, 'member' from groups where id = v_group_id and conversation_id is not null
    on conflict (conversation_id, user_id) do nothing;
end;
$$;
```

- **UI**: Group Settings gets a "Secret Group Invite Link" card (copy link,
  "Regenerate link" — invalidates the old one by overwriting the token,
  same UX as Slack/Discord invite-link resets).
- **New route**: `/groups/join/[token]` — public-reachable page that calls
  `get_group_preview_by_invite_token`, shows the minimal preview, and on
  "Join" (auth required, redirects through `/auth?redirect=...` if signed
  out) calls `join_group_via_invite_token`.
- This coexists with, doesn't replace, the existing targeted `group_invites`
  flow — a secret group can still be joined via a specific admin-sent
  invite, or now also via the shareable link.
- Public/private groups are unaffected — this mechanism is secret-group-only,
  matching what the decision asked for.

### 5b. Group-admin moderation view (new)

**Migration** (illustrative, same caveat as above):

```sql
CREATE POLICY "group admins can view their group's reports"
  ON public.group_post_reports FOR SELECT
  USING (is_group_admin(group_id, auth.uid()));

CREATE POLICY "group admins can resolve their group's reports"
  ON public.group_post_reports FOR UPDATE
  USING (is_group_admin(group_id, auth.uid()))
  WITH CHECK (is_group_admin(group_id, auth.uid()));
```

`group_post_reports` already has `status`/`reviewed_by`/`reviewed_at`
columns (built for the site-wide admin flow) — group admins reuse the same
columns, so no new columns are needed, only the policy letting them reach
rows scoped to groups they admin. `is_group_admin()` already exists as a
helper function (used elsewhere in the existing RLS policies).

- **UI**: a "Reports" tab/section visible only to `isAdmin`, listing
  pending reports for the group with the reported content's preview
  (post text or comment text, truncated), reporter's reason/notes, and two
  actions: **Dismiss** (sets `status='dismissed'`, `reviewed_by`,
  `reviewed_at`) or **Remove content** (deletes the underlying
  `group_posts`/`group_post_comments` row via the same delete path an
  admin already has — `group_posts`/`group_post_comments` RLS already lets
  an admin delete any post in their group — then marks the report
  resolved). Site-wide admins keep seeing everything regardless; this adds
  a second, group-scoped lens on the same data, not a replacement.

### 5c. Invite Members via open search (no migration — decoupling only)

```ts
// web/src/lib/groups/group-invites.ts
async function searchInvitableUsers(groupId: string, query: string) {
  // ilike on profiles.full_name / profiles.handle, excluding self,
  // current members (any status), and already-pending invitees for this
  // group. No dependency on partner_matches or v_mutual_matches — this is
  // the one deliberate mobile-parity break in this plan (see decisions
  // banner at top).
}
```
Same pattern as the instructor/player search already built for Community
Play (`web/src/components/instructor-picker.tsx`) — a debounced name search,
not a connections list. `sendGroupInvite`/`acceptGroupInvite`/
`declineGroupInvite` and the `notify_group_invite` DB trigger are unchanged;
only the candidate-sourcing query is new.

---

## 6. Architecture

```
web/src/lib/groups/
  types.ts                 // Group, GroupMember, GroupPostWithMeta, GroupFeedItem
  group-service.ts          // fetchGroup, fetchMyGroups, fetchDiscoverGroups,
                             //  createGroup, updateGroup, deleteGroup, getMembership,
                             //  joinGroup, leaveGroup, approveJoinRequest,
                             //  declineJoinRequest, setMemberRole, removeMember,
                             //  fetchMembers, fetchGroupEvents, fetchGroupFeed,
                             //  createPost/createPoll/createPhotoPost, toggleLike,
                             //  fetchComments/addComment/updateComment/deleteComment,
                             //  votePoll, fetchGroupPhotos/uploadGroupPhoto/
                             //  deleteGroupPhoto, uploadGroupBanner, reportContent
  group-invites.ts           // searchInvitableUsers (NEW, §5c), sendGroupInvite,
                             //  fetchPendingGroupInviteForUser, acceptGroupInvite,
                             //  declineGroupInvite
  invite-links.ts             // NEW (§5a) — regenerateInviteLink,
                              //  fetchGroupPreviewByToken, joinGroupViaToken
  group-reports.ts              // NEW (§5b) — fetchGroupReports, dismissReport,
                                //  removeReportedContent
web/src/app/groups/
  page.tsx                       // NEW — directory (My Groups + Discover)
  create/page.tsx                  // NEW — create-group form
  [id]/page.tsx                     // REPLACE MobileLinkFallback with the real
                                    //  detail page; keep generateMetadata/fetchGroupOg
  [id]/edit/page.tsx                 // NEW — settings incl. invite-link management
  join/[token]/page.tsx                // NEW (§5a) — secret-group invite-link landing
web/src/components/groups/
  group-card.tsx, membership-cta.tsx
  feed-tab.tsx, members-tab.tsx, events-tab.tsx, photos-tab.tsx, reports-tab.tsx (NEW)
  post-composer.tsx, poll-composer.tsx, photo-composer.tsx, post-card.tsx, comment-thread.tsx
  invite-members-modal.tsx (open search, §5c)
  report-sheet.tsx
```

---

## 7. Phased plan (build order)

### Phase 1 — Directory + create
- `/groups` directory (My Groups + Discover).
- `/groups/create`: full form; secret groups generate an `invite_token` at
  creation time (§5a) — the migration in §5a needs to land before this
  phase, since the create flow depends on the column existing.
- Add `/groups` to `header.tsx`'s `navLinks`.

### Phase 2 — Group detail shell + membership
- Replace the `MobileLinkFallback`; banner header; membership-state CTA
  including the new "secret group — ask for an invite link" state for
  non-members without a pending invite.
- Members tab: list, role badges, approve/decline, promote/demote/remove,
  Message button.

### Phase 3 — Full feed (text + polls + photos together)
- Compose box supporting text, poll (2–4 options), and photo attachment in
  one composer (matching mobile's three-button composer bar).
- Like toggle, one-level comment threads, edit/delete own content, Report
  modal.
- Poll vote UI with live tally bars; single-choice enforced.
- Photos tab: grid, upload, own-delete.
- Events tab: "Create Event for This Group" using a web module-level
  one-shot variable (same non-persistent hand-off pattern as mobile's
  `pendingGroupLink.ts`).

### Phase 4 — Invite Members (open search)
- `searchInvitableUsers` debounced name/handle search (§5c), independent of
  any connections system.
- Send/accept/decline via existing `group_invites` + `notify_group_invite`
  trigger — confirm `notifications/bell.tsx` renders `type='group_invite'`
  sensibly, or extend it, rather than building a parallel notification UI.

### Phase 5 — Secret-group invite links
- `/groups/join/[token]` landing page + "Regenerate link" in Group Settings
  (§5a). Ship after Phase 1's migration is live and Phase 2's detail page
  exists, since the landing page's "Join" action needs somewhere to send
  the user afterward.

### Phase 6 — Group-admin moderation view
- Reports tab (admin-only) + Dismiss/Remove-content actions (§5b). Needs
  the §5b RLS migration landed first.

---

## 8. Explicitly out of scope

- **Unifying `partner_matches` and `matchmaking_swipes`/`v_mutual_matches`
  into one connections graph.** Real, pre-existing, platform-wide
  divergence — no longer relevant to Groups specifically now that Invite
  Members is decoupled (§5c), but still not something this plan touches.
- **Realtime feed updates.** Mobile doesn't have them; matching mobile means
  fetch-on-load/action.
- **A general Invites inbox** (mobile's `apps/mobile/src/app/invites.tsx`,
  which aggregates group + play-event + reservation invites in one screen).
  Phase 4 only needs the group's own "Accept Invite" state plus the existing
  notification bell, not a full inbox screen.
- **"Manage Notifications."** Mobile's own version is a stub — nothing to
  port.
- **Deeper comment nesting than one level.** The schema's `parent_comment_id`
  technically allows arbitrary depth, but this plan matches mobile's
  one-level UI rather than opening that up as a side effect of building
  the feed.
- **Invite links for public/private groups.** Scoped to secret groups only,
  per the decision — public groups already have open discovery, and private
  groups keep their existing request-to-join/admin-approve flow.

---

## 9. Status

**Built 2026-09-17.** All six phases shipped. Type-check, lint, the full
Vitest suite, and a production `next build` all pass on the finished state.
Verified live against the real Supabase project with a headless-browser
smoke test (directory page, auth redirect, invalid invite-link state, group
not-found state, nav link) — no real group/account was created during
verification to avoid writing test data into production.

**Three migrations applied to `dreambreaker-pb`, all committed to
`supabase/migrations/`:**
- `20260917083954_group_secret_invite_links.sql` — `groups.invite_token` +
  two SECURITY DEFINER RPCs (§5a). Caught and fixed a real bug before
  shipping: the join RPC initially took a client-supplied user id, which a
  SECURITY DEFINER function must never trust — rewritten to read
  `auth.uid()` internally. Also found and closed a gap where this project's
  default privileges silently re-granted `anon` execute access despite an
  explicit `REVOKE ALL FROM PUBLIC`.
- `20260917083955_group_admin_moderation.sql` — RLS policy pair letting
  group admins see/resolve reports scoped to their own group (§5b).
- `20260917084500_conversation_allowlist_group_members.sql` — **not in the
  original plan.** Discovered while building the Members-tab Message
  button: `get_or_create_direct_conversation` (the shared allowlist RPC
  used by web and mobile) had no clause for "these two people share a
  group," so messaging a fellow group member with no other prior
  relationship failed outright — a dormant bug already present in mobile's
  own Members tab, not something this build introduced. Fixed at the
  database level (mirroring the precedent that already fixed the same
  class of bug for marketplace), which silently fixes mobile's copy of the
  same button too without touching any mobile source file.

**Also discovered and fixed:** `/dashboard` read `?section=` from the URL
but had no way to open a specific conversation via URL — mobile's own
bottom-nav link to `/dashboard?section=messages` was already effectively
dead on web. Added `?dm=<userId>` support alongside the existing `section`
handling so the new Message button (and any future deep link) can open a
specific conversation.

**Regenerated types by hand-patching, not wholesale replacement** — the
Supabase-generated types dump omits the `storage` schema and
`reserved_handles` that the checked-in `database.types.ts` already carries
(generated with broader scope originally), so replacing the whole file
would have silently dropped types nothing currently uses but might. Patched
in just the three new pieces instead.

**Everything from §4 is live**, including the beyond-parity pieces:
full feed (text/poll/photo) in one pass, real shareable invite links for
secret groups, invite Members via open name/handle search fully decoupled
from any connections system, and a group-admin Reports tab.

**Unchanged from the plan:** §8's out-of-scope list still holds — no
realtime feed, no general invites inbox, no unification of
`partner_matches`/`matchmaking_swipes`.
