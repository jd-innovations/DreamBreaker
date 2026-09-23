# Notifications — parked state, 2026-09-23

Written for the owner. Everything below is either an action only you can take,
or a decision only you can make. Nothing here is blocking anything I can do.

## Where it stands

**39 automations catalogued · 35 built · 5 live.**

Live now: `hold_expiring`, `waitlist_spot_offered`, `event_reminder`,
`registration_confirmed`, `tournament_cancelled`.

The other 30 are built and switched off. They cannot fire while off, and most
have nothing to fire about yet (no real tournaments, bookings or purchases).

Everything is editable at **/admin/notifications → Automations**: copy, timing,
channels, throttle, on/off, plus a per-row **Test** button that pushes to your
own device even while the automation is off.

---

## 1. Deploy the email gate — the one real loose end

```bash
npx supabase functions deploy send-transactional-email
```

The gate was deployed this morning but shipped in **log mode**: it records
callers and refuses nobody, so the function is still reachable by anyone
holding the public anon key. The database route is already closed (the RPC was
revoked from `anon`), so this is the second half of that fix.

The code is committed as `enforce` (8aa6554) and just needs deploying.

**Why it is safe:** every caller lands in an allowed bucket — database triggers
carry the Vault dispatch secret; `waitlist-sweeper`, `cancel-registration` and
the web Stripe webhook use the service-role key; the admin composer, review
invitations and email preview call as a signed-in admin; the mobile app never
calls it at all.

**If mail breaks afterwards**, flip `EMAIL_GATE_MODE` back to `"log"` in
`supabase/functions/_shared/email-gate.ts` and redeploy. No migration involved.

## 2. Test and enable the automations you want

The **Test** button on each row sends that automation's real copy to your
device. Worth doing for a few of the newer ones before switching them on —
everything since your six test pushes has been verified by my dry runs only.

Suggested order to enable, most valuable first:

| Automation | Why |
|---|---|
| `hold_expired` | money already paid, spot gone |
| `reservation_confirmed`, `reservation_reminder` | people book courts today and hear nothing |
| `support_ticket_reply` | answers to questions they asked you |
| `group_invite`, `play_event_invite`, `group_post_new` | social, already writing in-app rows |
| `review_invite` | also auto-issues invitations from scans — see the warning below |

**Before enabling `review_invite`:** it EMAILS. Its auto-issuer looks back 2
days, so switching it on invites anyone scanned in the last 48 hours. That is
intended, but it is the one automation where "on" immediately sends real mail.

## 3. Remaining device QA

Cases 6–13 in `docs/DEVICE_QA_CHECKLIST.md` (opt-out honoured, opt back in,
signed-out behaviour, long titles, permission off/on, reinstall, abort wording,
non-admin 404). Cases 1–5 passed; 2 and 3 passed 2026-09-23.

---

## Decisions waiting on you

**Membership and voucher emails are built** (2026-09-23). Branded templates for
`membership_payment_failed`, `membership_renewing` and `coach_voucher_expiring`,
with the Email channel restored and honoured by each sender — so the toggle is
now real in both directions. They send nothing until those automations are
switched on, and nothing exists to send about yet (StoreKit purchasing is not
live).

**Two automations that are buildable but unspecified:**
- `play_event_starting_soon` — a game you joined starts in N hours. Ready to
  build; just needs your nod on timing.
- `flash_deal` — who should hear about a deal? Everyone with marketing on, or
  only people near the facility?

**Two blocked on data, not effort:**
- `checkin_open` — `checkin_opens_at` is set on roughly 1 tournament in 9.
- `coach_session_booked` — nothing in the schema schedules a session;
  redemptions record a lesson *used*.

**Group badges are built** (2026-09-23). `group_members.last_read_at` plus
`group_unread_counts()` and `mark_group_read()`; the Partner tab badges each
group card and opening a group clears it. Unread = posts and comments since you
last opened, by anyone but you; a brand-new member counts from joining, not
from the whole history. Needs an OTA to reach your phone.

With badges in place, notifications are down to polls and game posts, which is
where they belong. Fan-out is still per member — fine at your size (largest
group: 3), wants batching into one push per group somewhere in the hundreds.

**Deep links.** Taps resolve for tournaments, groups, community, bookings,
marketplace, conversations, coach offers, claims and reviews. They do **not**
for wallet, stats, membership, support or profile — those open the app instead
of the screen. Adding roots is a mobile change and ships over the air.

**Reservation cancellations skip the organizer**, because the schema does not
record who cancelled and it is normally them. A facility-side cancellation
therefore misses the organizer. Fixable the day reservations record an actor.

---

## Notes for whoever picks this up

- The dispatcher lives in `20260922191000`; the rules are in
  `private.automation_push_blocked_reason`. Read that before changing anything
  about quiet hours or the caps.
- Copy for every automation comes from the catalog via
  `private.render_automation`. A sender that hard-codes a string is a bug.
- The dispatcher has a **regression suite**:
  `supabase/_rls_tests/20260923_notification_automations.sql`, 42 tests over the
  gate, the renderer, the dispatch trigger, the resolver, RLS and catalog
  integrity. Run it after touching any of those. It found a duplicate resolver
  overload on its first run.
- `notification_push_log` is pruned daily at 180 days
  (`push_log_retention_days` in Platform settings). The Automations list's
  "all time" count means "up to 180 days".
