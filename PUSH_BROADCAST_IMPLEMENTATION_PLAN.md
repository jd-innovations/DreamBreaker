# Push Notification Broadcasting — Corrected Implementation Plan

**Status: Phases 1–7 PARKED 2026-09-21 by the product owner. Phase 0a/0c DONE and enforcing 2026-09-22; 0b moved into Phase 2 (decided 2026-09-22).**

Not rejected — deferred. The plan is complete and all eighteen decisions are settled, so
resuming means picking up at Phase 0 with no re-litigation. Decisions 16–18 were answered
on 2026-09-20 and are folded in.

**One item does not belong to the parked feature.** Phase 0 remediates an open relay in
`send-message-push` that exists in production today, independent of whether broadcasting
is ever built. It was scoped as standalone work for exactly this reason. Parking the
feature does not close that finding.

Supersedes `PickleballApp_Push_Notification_Broadcasting_System_Spec.md` v1.0 wherever
the two conflict. The original spec remains the product statement of intent; this
document is the buildable version of it, corrected against the code that actually
exists in this repository as of 2026-09-20.

**Written for:** the engineer implementing this, who may not have read the audit that
produced it. Every correction states what the original spec assumed, what is actually
true, and the file that proves it.

---

## 0. Why this plan differs from the spec

The spec's §2 required an audit of the existing push implementation before coding.
That audit was done. Eight assumptions did not survive it:

| # | Spec assumed | Reality | Where |
| --- | --- | --- | --- |
| 1 | A referenceable `push_token_id` and an "active" flag | `push_tokens` has a composite PK `(user_id, expo_push_token)` and dead tokens are **deleted**, not deactivated | [`20260708010000_push_notifications.sql:20-28`](supabase/migrations_legacy/20260708010000_push_notifications.sql#L20-L28), [`send-message-push/index.ts:145-150`](supabase/functions/send-message-push/index.ts#L145-L150) |
| 2 | The existing Expo sender can be reused for broadcasts | It builds one message array and issues a single `fetch` — no chunking, no rate handling, no retry | [`send-message-push/index.ts:86-100`](supabase/functions/send-message-push/index.ts#L86-L100) |
| 3 | Privileged sends are already server-side-only | `send-message-push` accepts an arbitrary `{tokens, title, body}` authenticated by the **public anon key** | [`20260831020000_preference_aware_push.sql:113`](supabase/migrations/20260831020000_preference_aware_push.sql#L113) |
| 4 | `data.destination = {type, id}` routes in the app | The resolver understands only `data.conversationId` or `data.url`/`data.link`, requires root **and** id, and allowlists nine roots | [`externalRouting.ts:104-113`](apps/mobile/src/lib/externalRouting.ts#L104-L113) |
| 5 | A payload with no destination opens a landing screen | It logs and does nothing | [`pushNotifications.ts:189-195`](apps/mobile/src/lib/pushNotifications.ts#L189-L195) |
| 6 | Tap/open events can be measured | No tap event pipe exists at all; it is net-new mobile code and therefore build-dependent | [`pushNotifications.ts:189-202`](apps/mobile/src/lib/pushNotifications.ts#L189-L202) |
| 7 | Suspended/banned accounts can be excluded | No suspension or ban state exists anywhere in the schema | schema-wide grep |
| 8 | A support/editor role exists to grant | Admin is `profiles.role = 'admin'` via `is_admin()`; there is no second tier | [`baseline_from_prod.sql:1994`](supabase/migrations/20260725000000_baseline_from_prod.sql#L1994) |

### Decisions carried into this plan

Approved by the product owner on 2026-09-20 and treated as binding:

1. Keep the composite-key / token-deletion model. Deliveries key on `(campaign_id, expo_push_token)`. No `push_token_id`, no `active` flag.
2. Build a dedicated batched broadcast worker. Reuse only the ticket/receipt bookkeeping *pattern* from `send-message-push`, never its send loop.
3. The initiation endpoint accepts a campaign id and an admin JWT. It never accepts tokens.
4. The `send-message-push` open relay is remediated as its own P0, isolated from the feature.
5. Extend `push_tickets` and `push-receipt-sweeper`. No second receipt system.
6. Emit `data.url` in the existing allowlisted shape. The composer offers only routes installed builds already support.
7. V1 **requires** a supported destination. No no-destination campaigns.
8. Tap tracking is version-dependent. Capability is recorded per recipient; unsupported builds are excluded from the tap-rate numerator *and* denominator. Displayed denominator is accepted deliveries, labelled.
9. Cut from V1: editor role, suspended/banned exclusion, membership targeting, geography targeting, rich images, failed-delivery CSV export, UI-driven retry.
10. V1 audiences: All Eligible Users, and Platform. `platform = 'unknown'` is excluded from platform-specific campaigns and the excluded count is shown at confirmation.
11. Add `aborting` and `aborted` states. Abort stops unclaimed batches; it cannot recall submitted messages.
12. Expo batch size, concurrency, rate budget, backoff, jitter and max attempts are all explicit, and confirmed against Expo's docs at implementation time.
13. Aggregates and audit retained indefinitely. Per-device delivery rows retained 90 days, then pruned by a scheduled job.
14. Typed `SEND` confirmation at ~100 targeted devices, threshold configurable.
15. Reuse the pg_cron protected-function pattern and the one-column-per-category preference model (`notif_announcements`).
16. The announcements opt-out ships on **both** platforms: mobile's notifications-settings screen and web's match-settings panel, which already reads and writes four `notif_*` columns.
17. Alerting is **Sentry plus email**. Exceptions go to Sentry; the non-exception states — stalled queue, partially-failed campaign — are emailed to `support@pickleballapp.app` through the existing `send-transactional-email` function. A stalled queue raises no exception, so Sentry alone would not catch the failure mode most likely to go unnoticed.
18. Phase 0 is done **now, as standalone work**, before and separate from everything else here.

### Naming

Repo convention is snake_case tables named for the thing, not the layer
(`push_tokens`, `push_tickets`, `email_log`, `facility_import_batches`). This plan
uses `notification_campaigns`, `campaign_deliveries`, `campaign_audit_log`,
`campaign_taps`. Any deviation taken during implementation gets recorded in the
implementation summary.

---

## Sequencing recommendation — read before scheduling this work

Production currently holds roughly **48 profiles**, and only devices that granted
notification permission have a token at all. A platform-wide broadcast today reaches
a number of devices you could count on your hands. The app is not yet on TestFlight.

That produces a clear split:

**Must happen before, or alongside, the first TestFlight build:**

- **Phase 0** (security remediation), **as standalone work, first** (decision 18). It is
  independent of this feature, it fixes a live hole, and it needs no product decisions.
  Doing it in isolation also means that if DM delivery regresses, there is exactly one
  candidate cause.
- **Phase 1's preference column** and **Phase 6's mobile half** (the
  `notif_announcements` toggle, the tap recorder, the capability fields on token
  registration). This is the part that is *expensive to retrofit*: every build shipped
  without it reports no taps and offers no opt-out forever, and installed builds cannot
  be fixed by a server change. Shipping it in the first TestFlight binary costs very
  little now and avoids a permanently split install base later.

**Can wait until user acquisition creates real broadcast volume:**

- Phases 2–5 (the campaign API, worker, receipts integration, admin UI). None of it is
  reachable by users, none of it blocks the store, and building a batching worker for an
  audience of forty devices is optimising a problem you do not have. The schema in
  Phase 1 is cheap to land early so the mobile half has something to write against, but
  the server pipeline can follow the first few hundred real users.

**Recommended order:** Phase 0 → Phase 1 → Phase 6 (mobile) → TestFlight → *pause* →
Phases 2, 3, 4, 5 → Phase 7 → staged rollout.

This reorders the spec's §13 deliberately. Building the admin UI before the mobile
capability exists would produce a console that can send notifications nobody can opt
out of and whose taps cannot be counted.

---

# Phase 0 — Existing push security remediation (P0, independent)

The one thing in this document that should be done regardless of whether broadcasting is
ever built.

## The defect

`notify_new_message` calls `send-message-push` over `net.http_post` with the **anon key**
in the `Authorization` header ([`20260831020000_preference_aware_push.sql:113`](supabase/migrations/20260831020000_preference_aware_push.sql#L113)).
The function is absent from [`supabase/config.toml`](supabase/config.toml), so `verify_jwt`
defaults to true — and an anon-key JWT satisfies it. The function then sends whatever
`{tokens, title, body, data}` the caller supplied.

The anon key is public by construction: it is compiled into the mobile bundle and served
in the web app's environment. So **any party can cause an arbitrary push notification to
be delivered to any Expo token they can name**, attributed to this app.

What limits the blast radius today is only that `push_tokens` is RLS'd to self-read, so an
attacker needs tokens obtained some other way. That is a containment accident, not a
control. A leaked token, a database backup, or a future view that widens token access
turns this into arbitrary push to arbitrary users.

`push-receipt-sweeper` has the same exposure via the cron job's anon-key header
([`20260831010100_schedule_push_receipt_sweeper.sql:16`](supabase/migrations/20260831010100_schedule_push_receipt_sweeper.sql#L16)).
It is lower severity — an attacker can only force sweeps — but it is a free way to burn
Expo receipt lookups and function invocations, and it is fixed by the same mechanism.

## Existing components reused

- `notify_new_message` trigger function — recipient/mute/preference resolution is correct and stays exactly as it is.
- `send-message-push` — ticket bookkeeping and dead-token handling stay as they are.
- `push-receipt-sweeper` and its cron job.
- `supabase_vault` for secret storage (confirm it is enabled on the project first; it ships enabled on Supabase).

## Work

> **Status 2026-09-22 — 0a ENFORCING, the open relay is closed.** Verified after
> the enforce deploy: anon key without header → 401; wrong secret → 401; right
> secret → 200; sweeper without header → 401; the 02:15 scheduled sweep passed the
> gate; real DMs delivered (3 in log mode, all `ok`). 0b is DEFERRED to Phase 2.
>
> History: 0a and 0c first went LIVE in log-only mode: migration
> `20260921180000_push_dispatch_secret.sql` applied (recorded as 20260922015921),
> `send-message-push` v17 and `push-receipt-sweeper` v6 deployed. Verified by
> hand-firing the sweeper: with the header → `[dispatch-gate] …: ok`; without →
> `would reject (missing)`. Then `DISPATCH_GATE_MODE` was flipped to `"enforce"`.
> **0b is deferred to Phase 2** — see "Second caller" below and Phase 2's 0b section.
>
> **Second caller (missed by this plan).** `fn_notify_price_drop`
> (20260909230000) also posts a raw token list to `send-message-push`. 0a covers it
> — the migration gives it the header. 0b as written does not: a price drop has no
> message to reference, and the old price is gone by the time the function runs.
> 0b needs either a second payload kind (`{ kind: "price_drop", listingId, dropCents }`,
> recipients resolved server-side) or its own function.
>
> **Decision (2026-09-22): 0b moves into Phase 2, whole.** Do NOT ship it for DMs
> alone. Its only value is that no caller can hand the function a token list, and
> that holds only once the token path is gone for EVERY caller — a DM-only 0b
> leaves the price-drop token path open and buys nothing, at the cost of touching
> the one working push path. Until Phase 2 the dispatch gate is the boundary.
>
> **Order actually used.** Migration first, then the log-only deploys — the reverse
> of steps 2–4 below. Safe because the old functions ignore an unknown header, and
> better, because the new functions saw valid headers from their first request.

**0a — Shared-secret gate (immediate mitigation).**

- Generate a 32-byte random secret out of band and store it in Supabase Vault as
  `push_dispatch_secret`. **Vault is the only copy.** (Done 2026-09-22.)
- `send-message-push` and `push-receipt-sweeper` require an `x-dispatch-secret` header
  and validate it by calling `is_valid_push_dispatch(candidate text) returns boolean`
  with the service-role client. Missing, wrong, or RPC error → `401`, no body detail.
- `notify_new_message` and the sweeper's cron job read the secret from Vault at call time and add the header.

  **Why not an edge-function secret as well (decided 2026-09-22).** The original design
  held the value twice — Vault for the caller, `PUSH_DISPATCH_SECRET` for the function —
  and the two had to be hand-synced. Setting them up, they drifted twice in ten minutes,
  and a drift here is silent: `net.http_post` is fire-and-forget, so a mismatch just stops
  DM push. With one copy, both sides read the same row and rotation is a single
  `vault.update_secret(...)`. Cost: one database round-trip per push, negligible beside
  the Expo call it gates. The `PUSH_DISPATCH_SECRET` edge secret is not read by anything
  and should be unset.

  `is_valid_push_dispatch` compares SHA-256 digests of the candidate and the stored
  value rather than the raw strings, which removes the early-exit timing signal of text
  equality. It is SECURITY DEFINER, `service_role` only, returns only a boolean, and
  returns false (never raises) for a null or empty candidate or a missing Vault row.

  **The secret must never appear in a migration file.** Migrations are committed. Read it
  with `(select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret')`.
  If Vault turns out to be unavailable, the fallback is a database-level setting
  (`ALTER DATABASE postgres SET app.push_dispatch_secret = '…'`, applied out of band, read
  via `current_setting('app.push_dispatch_secret', true)`) — documented in
  `PRODUCTION_CONFIG.md`, value never committed.

**0b — Remove the token list from the wire (structural fix).**

- `send-message-push` stops accepting `tokens`. It accepts `{ messageId }`, and resolves
  recipients itself with `SUPABASE_SERVICE_ROLE_KEY` by calling a new
  `resolve_message_push_recipients(p_message_id uuid)` — which is the existing recipient
  query from `notify_new_message`, lifted verbatim into a reusable function.
- `notify_new_message` becomes: insert happened → post `{messageId}`. The SQL-side
  recipient resolution moves into the shared function both paths call.
- After this, even a leaked dispatch secret only permits re-sending a real message to its
  legitimate recipients. That is the actual security property worth having.

**0c — Config hygiene.**

- Add explicit `[functions.send-message-push]` and `[functions.push-receipt-sweeper]` blocks to `config.toml` with `verify_jwt = true` and a comment recording that the JWT check is *not* the authorization boundary — the dispatch secret is.

## New / modified files

| File | Change |
| --- | --- |
| `supabase/functions/send-message-push/index.ts` | modified — secret gate; accept `messageId`; resolve recipients via service role |
| `supabase/functions/push-receipt-sweeper/index.ts` | modified — secret gate |
| `supabase/config.toml` | modified — explicit blocks + comment |
| `supabase/migrations/<ts>_push_dispatch_secret.sql` | new — `is_valid_push_dispatch`, `resolve_message_push_recipients`, rewritten `notify_new_message`, rescheduled cron job |
| `PRODUCTION_CONFIG.md` | modified — document the Vault secret `push_dispatch_secret` and how to rotate it (name only, never the value) |

## Migrations

One: `<ts>_push_dispatch_secret.sql`. Creates `is_valid_push_dispatch` and
`resolve_message_push_recipients` (both SECURITY DEFINER, `revoke all from public`,
explicit revoke from `anon` and `authenticated`, `grant execute to service_role`), replaces
`notify_new_message` whole (repo convention — the body is the contract), and re-schedules
`push-receipt-sweeper` with the header.

## Security requirements

- No raw-string comparison of the secret: `is_valid_push_dispatch` compares digests.
- The secret never enters a migration, a log line, an error response, or Sentry. The
  edge functions never see the stored value at all — only the header they were sent.
- `is_valid_push_dispatch` and `resolve_message_push_recipients` are `service_role` only.
  The first would otherwise be a guessing oracle; the second returns tokens.
- Verify with `has_function_privilege` after applying, for both functions, for `anon` **and** `authenticated`. A `REVOKE … FROM PUBLIC` does **not** remove grants held by those named roles on this project — that trap has bitten this repo before.
- Re-run the Supabase security advisor after the migration.

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Anon relay closed | A POST to `send-message-push` with the anon key and a handcrafted token list returns 401 and sends nothing |
| Legitimate path intact | Sending a DM on a real device still produces a push |
| Sweeper gated | A POST to `push-receipt-sweeper` without the header returns 401; the cron job still runs |
| No token list accepted | After 0b, a request carrying `tokens` is rejected as a bad request |
| Grants | `has_function_privilege('anon', 'resolve_message_push_recipients(uuid)', 'execute')` is false; same for `authenticated` |
| Regression | Existing message-push integration behaviour unchanged; mute and `notif_messages` still honoured |

## Deployment order

1. Create the secret in Vault. (Done.) Unset the unused `PUSH_DISPATCH_SECRET` edge secret.
2. Apply the migration's `is_valid_push_dispatch` first — the functions call it.
3. Deploy both functions with the gate **accepting requests that lack the header or fail validation** (log-only mode), so a partial deploy cannot break DMs.
4. Apply the rest of the migration so callers start sending the header.
5. Confirm from logs that unheadered and failed-validation calls have stopped.
6. Flip both functions to enforcing.
7. Ship 0b.

## Rollback / forward-fix

Each step is independently revertible. The risky one is step 6; rollback is redeploying
the function in log-only mode, which is a single deploy and needs no migration. The
migration's rollback is `CREATE OR REPLACE` of the previous `notify_new_message` body,
which is preserved in `20260831020000`. **Do not roll back by dropping the function** —
the trigger depends on it.

## Dependencies and risks

- **Depends on:** Vault (enabled, v0.3.1; secret present — verified 2026-09-22).
- **Risk:** the gate now depends on a database call. If the database is unreachable the
  push cannot be delivered anyway (recipients are resolved there), so this adds no new
  failure mode — but the function must treat an RPC error as invalid, never as valid.
- **Risk:** DM push is the only working push path in the product. Every change here is on that path. The log-only staging step exists precisely so that an error in the gate cannot silence messaging.
- **Risk:** `net.http_post` is fire-and-forget. A 401 from a bad header is invisible to the trigger — it will not raise, it will simply stop delivering. Step 5's log check is not optional.

---

# Phase 1 — Minimal schema and preferences

> **Status 2026-09-22: DONE** on `feature/push-broadcast`. Migrations
> `20260921190000_notification_announcements_pref.sql` and
> `20260921190100_notification_campaigns.sql` applied to production; types
> hand-patched (302 lines added, 0 removed; `storage` and `reserved_handles`
> intact). Every acceptance check below passed in a rolled-back dry run first.
>
> **Deviations from the text below, all deliberate:**
>
> 1. **Admin reads are functions, not views.** The text asks for `security_invoker`
>    views *and* for `authenticated` to hold no grant on `campaign_deliveries`. Those
>    contradict — an invoker view runs with the caller's privileges, so the admin
>    would get "permission denied". Built instead: `admin_campaign_summary(uuid)` and
>    `admin_campaign_deliveries(uuid, limit, offset)`, SECURITY DEFINER, `is_admin()`
>    checked inside, token masked to `…` + last six. Same pattern as
>    `admin_profile_emails`. The security property is unchanged: no browser role can
>    read `campaign_deliveries` at all.
> 2. **Ten states, not eleven.** The text says "eleven" and then lists ten. The ten
>    listed are what the check constraint holds.
> 3. **`campaign_audit_log` has no foreign keys at all**, not merely no cascade. Even
>    `ON DELETE SET NULL` is an UPDATE, which the immutability trigger refuses — the
>    FK would have made campaigns and admin profiles undeletable. TRUNCATE is also
>    blocked by trigger.
> 4. **No separate `campaign_taps (campaign_id)` index** — the primary key
>    `(campaign_id, user_id)` leads with it.
> 5. **Explicit `REVOKE ALL` on every new table.** Supabase's default privileges
>    grant anon and authenticated everything on new public tables (TRUNCATE ignores
>    RLS). Grants added back: SELECT on campaigns, audit and taps for authenticated,
>    admin-only by RLS. Nothing on deliveries.
> 6. **`grant select (notif_announcements) on profiles to authenticated`.** profiles is
>    on column-level SELECT grants, so without it Phase 6's settings query would
>    fail outright. UPDATE is already table-level.
>
> **Advisor:** three new notices, all intended — RLS with no policies on
> `campaign_deliveries` (deny-all by design) and the two admin functions being
> executable by `authenticated` (they check `is_admin()` themselves).

## Existing components reused

- `profiles` one-boolean-per-category preference model, and [`notificationPreferences.ts`](apps/mobile/src/lib/notificationPreferences.ts), which already distinguishes honoured preferences from stored intent and should keep doing so.
- `is_admin()` for every policy.
- The views-not-columns pattern for admin reads (see Security below).

## New / modified files

| File | Change |
| --- | --- |
| `supabase/migrations/<ts>_notification_announcements_pref.sql` | new |
| `supabase/migrations/<ts>_notification_campaigns.sql` | new |
| `packages/shared/src/database.types.ts` | regenerated — **hand-patch, do not wholesale-regenerate** (a fresh generation drops the `storage` schema and `reserved_handles`) |

## Migrations

**Migration A — preference column.**

```
alter table public.profiles
  add column if not exists notif_announcements boolean not null default true;
```

Defaults true, matching every other `notif_*` column: an existing user who never opens
the setting keeps the behaviour they had. Comment it in the house style, naming the
sender that honours it (nothing does, until Phase 3 — say so). The column sits outside
the `anon` column allowlist by default, which is correct.

**Migration B — campaign tables.**

`notification_campaigns`

| Column | Type / constraint |
| --- | --- |
| `id` | uuid pk default `gen_random_uuid()` |
| `internal_name` | text not null, length ≤ 120 |
| `title` | text not null, length ≤ 100 |
| `body` | text not null, length ≤ 240 |
| `category` | text not null default `'platform_announcements'` |
| `audience_type` | text not null check in (`'all'`, `'platform'`) |
| `audience_platform` | text null check in (`'ios'`, `'android'`); not null iff `audience_type = 'platform'` |
| `destination_url` | text **not null** — validated against the deep-link allowlist at write time (decision 7) |
| `destination_type` | text not null — the resolved root, for display and reporting |
| `status` | text not null default `'draft'`, check in the eleven states below |
| `scheduled_at`, `queued_at`, `started_at`, `completed_at`, `cancelled_at`, `aborted_at` | timestamptz, UTC |
| `created_by`, `sent_by`, `cancelled_by`, `aborted_by` | uuid → `profiles(id)` |
| `idempotency_key` | text unique |
| `recipient_user_count`, `recipient_device_count`, `excluded_unknown_platform_count` | integer |
| `created_at`, `updated_at` | timestamptz not null default now() |

Typed columns rather than the spec's `audience_filter jsonb`. With two audience types,
JSONB buys nothing and costs a validation surface; add it when a third audience arrives.

States: `draft`, `scheduled`, `queuing`, `sending`, `aborting`, `aborted`, `sent`,
`partially_failed`, `failed`, `cancelled`. (`aborting`/`aborted` are decision 11.)

`campaign_deliveries`

| Column | Type / constraint |
| --- | --- |
| `id` | uuid pk |
| `campaign_id` | uuid not null → `notification_campaigns(id)` on delete cascade |
| `user_id` | uuid not null → `profiles(id)` on delete cascade |
| `expo_push_token` | text not null — **no FK**, by decision 1 |
| `status` | text not null default `'queued'`, check in (`queued`, `submitted`, `accepted`, `retry_pending`, `failed`, `invalid_token`, `skipped`) |
| `ticket_id` | text null — Expo's ticket, links to `push_tickets` |
| `provider_receipt_status`, `error_code`, `error_message` | text, sanitised |
| `attempt_count` | integer not null default 0 |
| `next_attempt_at` | timestamptz |
| `app_version`, `tap_capable` | text null / boolean not null default false — capability snapshot at queue time (decision 8) |
| `submitted_at`, `reconciled_at`, `created_at`, `updated_at` | timestamptz |
| | **`unique (campaign_id, expo_push_token)`** |

That unique constraint is the whole duplicate-send defence. It survives retried requests,
overlapping workers and a double-fired scheduler, because it is enforced by the database
rather than by application care.

No FK on `expo_push_token` is deliberate and mirrors `push_tickets`' existing reasoning:
by the time a receipt says `DeviceNotRegistered` the token row is already gone, and a FK
would either block the delete or erase the delivery history that explains it.

`campaign_audit_log` — `id`, `campaign_id` (nullable, **no cascade**: the audit outlives
the campaign), `actor_id`, `action`, `metadata jsonb`, `created_at`. Append-only,
enforced by a `BEFORE UPDATE OR DELETE` trigger that raises, not merely by grants.

`campaign_taps` — `campaign_id`, `user_id`, `occurred_at`, `unique (campaign_id, user_id)`.
Deduplicated per user per campaign.

`push_tokens` gains two nullable, self-reported capability columns: `app_version text`
and `tap_events_supported boolean not null default false`. Written by the client at
registration. Self-reported means a user could lie; that is acceptable for a metric and
unacceptable for anything else, so nothing but reporting may read them.

**Indexes**

- `notification_campaigns (scheduled_at)` partial `where status = 'scheduled'` — the scheduler's only query.
- `campaign_deliveries (campaign_id, status, next_attempt_at)` — the worker's claim query.
- `campaign_deliveries (ticket_id)` partial `where ticket_id is not null` — receipt reconciliation.
- `campaign_deliveries (created_at)` — the 90-day prune.
- unique `(campaign_id, expo_push_token)`.
- `campaign_taps (campaign_id)`.

## Security requirements

- RLS enabled on all four new tables. **No policy grants `anon` anything.**
- **`authenticated` receives no grant at all on `campaign_deliveries`.** Admin reads go through views. This is not stylistic: a column-level `REVOKE` cannot subtract from a table-level `GRANT` on this project — it reports success and does nothing. The only reliable way to keep `expo_push_token` out of an admin response is to never grant the table.
- Two views, both `security_invoker`, both admin-gated by `is_admin()`:
  - `v_campaign_summary` — per-campaign aggregate counts only.
  - `v_campaign_delivery_admin` — per-delivery rows with the token masked to its last six characters and `user_id` retained.
- `campaign_audit_log`: admin SELECT; INSERT only by the definer functions; UPDATE/DELETE blocked by trigger for every role including `service_role`.
- Run the security advisor after applying; record the result.

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Anon | Cannot select from any of the four tables or either view |
| Authenticated non-admin | Cannot select campaigns, deliveries, audit or taps, directly or through the views |
| Admin | Can read both views; a direct `select * from campaign_deliveries` is still denied |
| Token leakage | No query path available to a browser session returns a full `ExponentPushToken[...]` |
| Uniqueness | A second insert for the same `(campaign_id, expo_push_token)` raises |
| Audit immutability | `update` and `delete` on `campaign_audit_log` raise, including as `service_role` |
| Preference default | An existing profile reads `notif_announcements = true` without a backfill |
| Types | `database.types.ts` still contains the `storage` schema and `reserved_handles` after patching |

## Deployment order

Migration A, then Migration B, then the hand-patched types. Both migrations are purely
additive; neither touches a live path.

## Rollback / forward-fix

Additive, so rollback is `drop table` in FK order plus `alter table profiles drop column`.
Safe at this stage precisely because nothing reads any of it yet. After Phase 6 ships,
dropping `notif_announcements` would break installed clients — treat Phase 1 as
irreversible from that point and forward-fix instead.

## Dependencies and risks

- **Depends on:** nothing. Can land before or in parallel with Phase 0.
- **Risk:** `database.types.ts` regeneration. Wholesale regeneration has previously dropped the `storage` schema and `reserved_handles` from this file. Hand-patch the new tables in.
- **Risk:** adding a column to `profiles` has previously broken the signup trigger when the column was reshaped. This is an additive nullable-with-default boolean, which is the safe case, but check `auth_logs` after applying.

---

# Phase 2 — Authenticated campaign API and server-side audience snapshot

> **Status 2026-09-22: DONE, including Phase 0b.** Migrations
> `20260921200000_campaign_api.sql` and `20260921200100_push_triggers_send_ids.sql`
> applied; `send-message-push`, `admin-campaign-send` and `admin-campaign-test-send`
> deployed. The campaign API is dormant until Phase 5's UI.
>
> **0b is live.** Both triggers send only `{ kind, id }`; `send-message-push` resolves
> recipients and text itself and refuses a token list (`tokens_not_accepted`, verified
> with a valid dispatch secret). Real DMs delivered through the new path before the
> legacy path was switched off.
>
> **Verified** (rolled-back dry run, then live): every admin RPC refuses anon and
> non-admins; both functions 401 without a user JWT; destination validation rejects
> `javascript:`, `data:`, other hosts, `www.`, bare roots, personal routes, query
> strings; the claim succeeds once, then `already_claimed`; wrong key → `key_mismatch`;
> snapshot re-run changes nothing; opted-out users and `unknown` devices on a platform
> campaign excluded; preview counts equal snapshot counts; every mutation audited; the
> 21st preview in a minute is rate-limited; 138 shared tests incl. an oracle proving
> the moved deep-link resolver is behaviour-identical, and a drift test pinning the
> SQL pattern to the TypeScript one. NOT verified live: the admin happy path of the
> two edge functions (needs an admin JWT — first exercised by Phase 5) and a live price
> drop (no saved listings in production; the resolver was exercised in the dry run).
>
> **Deviations, all deliberate:**
>
> 1. **Devices are distinct tokens.** `push_tokens` is keyed on `(user_id, token)`, and
>    one phone signed into several accounts is registered once per account (production:
>    8 rows, 2 devices). Preview, snapshot and stored counts all count distinct tokens;
>    one delivery per device.
> 2. **Send requires `scheduled`.** The claim is `status = 'scheduled'` plus a matching
>    idempotency key, not `status in ('draft','scheduled')`: a draft has no key, and
>    scheduling is what freezes content. "Send now" = schedule for now, then send. A
>    campaign scheduled for later returns `not_due` until its time.
> 3. **Claim and snapshot are one service-role function** (`claim_campaign_send`), one
>    transaction — a failed snapshot leaves the campaign `scheduled`, not stranded.
> 4. **Broadcast destinations are a subset:** tournament, community, marketplace, group,
>    coach offer. Conversation, booking, claim and review are per-person routes.
> 5. **Cancel also discards drafts; abort also stops `queuing`.** There was no other way
>    to discard a draft, and a campaign mid-snapshot is as abortable as one mid-send.
> 6. **0b price drop carries only `listingId`** — the text comes from the in-app
>    notification the trigger just wrote, so there is no amount to forge. DM and price
>    drop are both limited to rows from the last 10 minutes.
> 7. **Rate limits count the audit log** (preview 20/min, test-send 5/min per admin),
>    the repo's count-existing-rows pattern. Previews are therefore audited.
> 8. **Triggers keep a cheap "anyone else has a device?" guard** so a conversation
>    nobody has the app for costs no edge invocation. The real rules live only in the
>    resolvers.
>
> **Found, not fixed (owner's call):** a signed-out account's token stays on the phone,
> so one device can receive another account's DMs; and price-drop pushes carry
> `listingId`, which the app does not route on, so tapping one does nothing.

> **Includes Phase 0b (moved here 2026-09-22).** `send-message-push` stops
> accepting `tokens` and resolves recipients server-side, for BOTH callers in one
> change: DMs (`{ kind: "message", messageId }` → `resolve_message_push_recipients`)
> and price drops (`fn_notify_price_drop`, e.g. `{ kind: "price_drop", listingId,
> dropCents }` → savers with `notif_marketplace`). Phase 0b's text above still
> describes the DM half; its tests and grant checks apply unchanged. Build it
> alongside this phase's server-side audience resolution, which solves the same
> problem, and remove the `tokens` field only after both callers have switched.

## Existing components reused

- **The two-step trust pattern** from [`admin-facility-import-commit/index.ts:37-53`](supabase/functions/admin-facility-import-commit/index.ts#L37-L53): verify the caller's own JWT resolves to an admin *first*, then switch to `service_role` for the privileged write. Never the reverse.
- Its precedent for *where* logic lives: staging and review are plain admin-gated RPCs under the caller's session; only the privileged commit needs an edge function. This plan follows that split exactly.
- `is_admin()`.
- The deep-link allowlist in [`externalRouting.ts:65-100`](apps/mobile/src/lib/externalRouting.ts#L65-L100) — the *source of truth* for what the composer may offer.

## Work

**RPCs (admin-gated, caller's own session, no service role):**

| Function | Purpose |
| --- | --- |
| `admin_upsert_campaign(...)` | Create/edit a draft. Validates length, audience, destination. Writes audit. |
| `admin_preview_campaign_audience(...)` | Returns `{user_count, device_count, excluded_unknown_platform}`. **Counts only — never tokens.** |
| `admin_schedule_campaign(id, at)` | draft → scheduled, freezes content and audience, mints the idempotency key. |
| `admin_cancel_campaign(id)` | scheduled → cancelled, only if `queued_at is null`. |
| `admin_abort_campaign(id)` | sending → aborting (decision 11). |

Each begins `if not public.is_admin() then raise exception …`, is SECURITY DEFINER with
`search_path = public`, and is `revoke all from public` + `grant execute to authenticated`
— the `is_admin()` check inside is the boundary, matching the `admin/wallet` precedent.

**Edge functions (need `service_role`):**

| Function | Purpose |
| --- | --- |
| `admin-campaign-send` | Accepts **`{ campaignId, idempotencyKey }` and nothing else** (decision 3). Two-step trust, atomic claim, snapshot, return `202` immediately. |
| `admin-campaign-test-send` | Sends to the calling admin's own registered tokens only. Writes an audit row. Creates **no** `campaign_deliveries` rows, so it cannot pollute metrics. |

**Atomic claim** — the concurrency defence, one statement:

```
update notification_campaigns
   set status = 'queuing', queued_at = now(), sent_by = <admin>
 where id = $1
   and status in ('draft', 'scheduled')
returning id;
```

No row returned means someone else claimed it. Two admins clicking Send, or a scheduler
firing twice, cannot both proceed.

**Audience snapshot** — `snapshot_campaign_recipients(p_campaign_id uuid)`, SECURITY
DEFINER, `service_role` only:

```
insert into campaign_deliveries (campaign_id, user_id, expo_push_token, app_version, tap_capable)
select c.id, pt.user_id, pt.expo_push_token, pt.app_version, coalesce(pt.tap_events_supported, false)
  from push_tokens pt
  join profiles p on p.id = pt.user_id
  join notification_campaigns c on c.id = p_campaign_id
 where p.notif_announcements is not false
   and (c.audience_type = 'all' or pt.platform = c.audience_platform)
on conflict (campaign_id, expo_push_token) do nothing;
```

Notes that matter:

- `is not false`, not `= true`, matching `notify_new_message`'s existing reasoning about a null from a bad backfill.
- `platform = c.audience_platform` naturally excludes `'unknown'` on a platform campaign (decision 10). The excluded count is computed separately and stored, so the confirmation dialog can show it.
- Deleted accounts need no explicit exclusion: deletion removes push tokens, and the anonymised tombstone has none. **Verify this against [`delete-account/index.ts`](supabase/functions/delete-account/index.ts) during implementation** rather than trusting this sentence.
- `on conflict do nothing` makes the snapshot itself idempotent, so a retried claim cannot double-enqueue.

**Destination validation.** The allowlist lives in mobile TypeScript today. Port it to
`packages/shared` as a single exported list of roots, consumed by the composer, the
validating RPC and (ideally) `externalRouting.ts` itself, so the three cannot drift.
Reject anything not `pickleballapp://` or `https://pickleballapp.app` with an allowlisted
root **and** a non-empty id. Explicitly reject `javascript:`, `data:`, external hosts and
bare roots.

## New / modified files

| File | Change |
| --- | --- |
| `supabase/migrations/<ts>_campaign_api.sql` | new — the five RPCs + snapshot function |
| `supabase/functions/admin-campaign-send/index.ts` | new |
| `supabase/functions/admin-campaign-test-send/index.ts` | new |
| `supabase/config.toml` | modified — two blocks, `verify_jwt = true` |
| `packages/shared/src/deep-link-allowlist.ts` | new — shared root list |
| `apps/mobile/src/lib/externalRouting.ts` | modified — import the shared list (behaviour unchanged) |

## Security requirements

- `admin-campaign-send` rejects any request body containing a `tokens` key outright, with a distinct error code. A rejected key is a signal worth alerting on.
- Admin re-verified inside every RPC and every edge function — never inferred from the UI having rendered.
- `snapshot_campaign_recipients` is `service_role` only; verify with `has_function_privilege` for `anon` and `authenticated`.
- Audience preview returns counts. There is no code path from a browser session to a token.
- Rate limits on preview and test-send (per admin, per minute).
- `idempotency_key` is generated server-side, not accepted from the client.

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Authorization | Non-admin calls to every RPC and both functions return 403; direct table access denied |
| No tokens in | A send request carrying `tokens` is rejected |
| No tokens out | No response from any endpoint contains a full token |
| Atomic claim | Two concurrent sends for one campaign produce exactly one `queuing` transition |
| Snapshot idempotence | Running the snapshot twice yields the same row count |
| Eligibility | Opted-out users, tokenless users and `unknown`-platform devices on a platform campaign are excluded; counts match the preview |
| Destination validation | `javascript:`, external hosts, unlisted roots and null-id routes are all rejected |
| Test send | Reaches only the calling admin's devices and creates no delivery rows |
| Audit | Every mutating call writes actor, action and timestamp |

## Deployment order

Migration, then shared allowlist package, then edge functions, then config. Nothing is
reachable until Phase 5's UI exists, so this phase can sit deployed and dormant.

## Rollback / forward-fix

Functions are droppable; edge functions are undeployable. Dormancy makes rollback
genuinely safe here — prefer forward-fix only once Phase 5 is live.

## Dependencies and risks

- **Depends on:** Phase 1.
- **Risk:** the allowlist is currently mobile-only. Moving it to `packages/shared` touches a live routing path. `packages/shared` reaches mobile through a Metro watch folder, so this is OTA-safe, but the change must be behaviour-preserving and covered by tests before it ships.
- **Risk:** the snapshot's cost grows with token count. At current scale it is trivial; add a `LIMIT`-guarded chunked insert only if a campaign ever exceeds ~50k tokens.

---

# Phase 3 — Batched worker, abort, retries, Expo budgeting

> **Status 2026-09-22: DONE, dormant.** Migrations `20260921210000_campaign_worker.sql`
> and `20260921210100_campaign_worker_jobs.sql` applied; `process-campaign-batch`
> deployed; cron jobs `campaign-batch-worker` and `campaign-scheduler` running every
> minute. Kill switch `platform_settings.push_broadcast_enabled` is **'false'** — the
> worker claims nothing, the scheduler queues nothing, `admin-campaign-send` answers
> 503 `broadcast_disabled`. Turned on in Phase 7.
>
> **Budget, confirmed 2026-09-22** against Expo's docs (100 messages/request, 600
> notifications/s per project, few concurrent connections — their SDK uses six,
> 4096-byte payload) and Supabase's (150s wall clock free / 400s paid, 2s CPU):
> 100 per request, concurrency 3, **300/s**, 2,000 deliveries or 50s per run, 30s
> request timeout, 3 attempts with 30s·2ⁿ backoff ±20%. All in
> `process-campaign-batch/logic.ts`, with the doc links.
>
> **Verified:** 16 Deno tests (batching 250→100/100/50, 5,000-delivery pacing under
> 300/s, 429/5xx/network → retry, 429 and MessageRateExceeded widen the pace,
> DeviceNotRegistered → invalid_token, MessageTooBig and unknown codes → failed without
> retry, InvalidCredentials / MismatchSenderId / Expo 401 → campaign-fatal, missing
> ticket → failed not retried, error text capped, no token in any outcome). SQL state
> machine in a rolled-back transaction against 250 synthetic deliveries: kill switch
> touches nothing; claims disjoint; outcomes recorded and dead tokens deleted; replay
> ignored; retry ladder ~25s → ~59s → failed; abort skips the 55 unsent rows and lands
> `aborted`; fatal halts with rows skipped; all six terminal cases; scheduler claims
> due campaigns once and leaves future ones; grants service_role only. Live: worker
> 200 with the secret, 401 without.
>
> **Live end-to-end, 2026-09-22** (owner-authorised; switch on for ~2 minutes, then off
> again): campaign `5b5a45c7…` "E2E test 2026-09-22", audience all = 2 devices / 8
> accounts. The scheduler cron queued it at 03:12:00; the worker cron sent it at
> 03:13:00; `sending` → `sent` in ~300ms; both deliveries accepted on attempt 1 with
> Expo tickets; audit `send_claimed` (by scheduler) → `completed`. The owner confirmed
> the notification arrived on both phones and the tap opened the linked tournament —
> so `data.url` routes on installed builds with no app change.
>
> **Deviations, all deliberate:**
>
> 1. **No `campaign-scheduler` edge function.** Queuing due campaigns touches only the
>    database, so the cron job calls `claim_due_campaigns()` directly — no HTTP hop, no
>    secret, nothing to deploy.
> 2. **The state machine is in SQL, the edge function only talks to Expo.** Claim,
>    record, backoff, abort, fatal halt and finalize are service-role functions — where
>    `SKIP LOCKED` and the conditional updates live, and testable without sending.
> 3. **Interrupted deliveries fail, never retry.** A row still `submitted` ten minutes
>    later means a worker died after handing it to Expo, maybe. `failed`/`interrupted`:
>    a missing broadcast beats a duplicate. Same for a missing ticket.
> 4. **`invalid_token` does not make a campaign `partially_failed`.** Uninstalled apps
>    are churn. A campaign with no recipients at all is `sent`.
> 5. **`MismatchSenderId` and an Expo 401/403 are campaign-fatal** alongside
>    `InvalidCredentials` — all mean our credentials are wrong.
> 6. **The worker cron makes its HTTP call only when the switch is on and a campaign is
>    active** — an idle system costs a query a minute, not an edge invocation.
> 7. **Retry backoff is 30s then 60s**: `MAX_ATTEMPTS = 3` means two retries, so the
>    plan's third value (120s) is never reached.
>
> **Runbook — stop everything with no deploy:** flip the switch off in admin settings,
> or `select cron.unschedule('campaign-batch-worker');`. Interrupted campaigns resume
> when re-enabled; all state is in `campaign_deliveries`.

## Existing components reused

- The **pattern** from `send-message-push`: ticket-vs-receipt distinction, `DeviceNotRegistered` in a ticket meaning delete now, bookkeeping never failing the send.
- pg_cron + protected edge function, as used by eight existing jobs.
- `platform_settings` (already exists) for the kill switch and the typed-SEND threshold.

**Explicitly not reused:** `send-message-push`'s send loop (decision 2). It is a single
unchunked `fetch`, correct for a DM to three tokens and wrong for a broadcast.

## Work

New edge function `process-campaign-batch`, invoked by pg_cron every minute, gated by the
Phase 0 dispatch secret.

**Budget constants — starting values, all to be confirmed against Expo's current
documentation during implementation and recorded in the implementation summary:**

| Constant | Starting value | Why |
| --- | --- | --- |
| `EXPO_MESSAGES_PER_REQUEST` | 100 | Expo's documented per-request cap. Confirm. |
| `REQUEST_CONCURRENCY` | 3 | Conservative; Expo recommends a small number of simultaneous connections. Confirm. |
| `DELIVERIES_PER_INVOCATION` | 2,000 | Keeps a run inside the edge-function time limit with headroom. |
| `NOTIFICATIONS_PER_SECOND` | 300 | A self-imposed budget below Expo's published rate limit, enforced by inter-batch delay. Confirm the published limit. |
| `MAX_ATTEMPTS` | 3 | |
| `BACKOFF_BASE_SECONDS` | 30 | Doubling: 30s, 60s, 120s. |
| `BACKOFF_JITTER` | ±20% | Prevents a synchronised retry storm after a provider blip. |
| `RECEIPT_SETTLE_MINUTES` | 5 | Matches the existing sweeper. |

**Claim loop** — `FOR UPDATE SKIP LOCKED` is what makes overlapping workers safe:

```
with claimed as (
  select id from campaign_deliveries
   where campaign_id = $1
     and status in ('queued', 'retry_pending')
     and (next_attempt_at is null or next_attempt_at <= now())
   order by created_at
   limit $2
   for update skip locked
)
update campaign_deliveries d
   set status = 'submitted', attempt_count = d.attempt_count + 1, submitted_at = now()
  from claimed where d.id = claimed.id
returning d.id, d.expo_push_token;
```

**Abort.** Before each batch the worker re-reads the campaign status. `aborting` →
stop immediately, mark remaining `queued`/`retry_pending` rows as `skipped`, set
`aborted`, write audit. Messages already handed to Expo are gone and cannot be recalled;
the admin UI must say this in the abort dialog rather than implying a recall.

**Kill switch.** A `platform_settings` row `push_broadcast_enabled`. When false the
worker exits without claiming, and `admin-campaign-send` refuses. Independent of any
single campaign, flippable without a deploy.

**Failure classification** — the spec's §9.3 table, made concrete:

| Expo signal | Class | Action |
| --- | --- | --- |
| Network timeout, 5xx, 429 | transient | `retry_pending`, backoff + jitter, until `MAX_ATTEMPTS` |
| `MessageRateExceeded` | transient | as above, and widen the inter-batch delay for the rest of the run |
| `DeviceNotRegistered` (ticket) | permanent | `invalid_token`; delete the token, matching existing behaviour |
| `MessageTooBig` | permanent | `failed`; validation should have prevented it — alert |
| `InvalidCredentials` | permanent, campaign-fatal | stop the whole campaign, mark `failed`, alert. Retrying wastes the budget and the fault is ours |
| Unknown | permanent unless explicitly classified transient | `failed`, alert |

**Aggregates.** After each run, recompute the campaign's counts from delivery rows and
set the terminal status: all accepted → `sent`; some failed → `partially_failed`; none
succeeded → `failed`.

**Scheduler.** A second cron job claims due campaigns with the same atomic conditional
update as Phase 2, so two overlapping scheduler runs cannot both queue one campaign.
Stored UTC; the admin UI renders local and names the zone.

## New / modified files

| File | Change |
| --- | --- |
| `supabase/functions/process-campaign-batch/index.ts` | new |
| `supabase/functions/campaign-scheduler/index.ts` | new |
| `supabase/migrations/<ts>_campaign_worker_jobs.sql` | new — two cron jobs, `platform_settings` seed rows |
| `supabase/config.toml` | modified |

## Security requirements

- Both functions require the dispatch secret. Neither is callable with the anon key.
- Neither accepts a token list or a campaign body; the worker takes a campaign id or nothing at all.
- Error messages persisted to `campaign_deliveries` are sanitised — Expo's error text only, never headers or credentials.
- Logs carry campaign id, batch id, counts, duration and error codes. **Never tokens.**

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Batching | 250 deliveries produce 3 Expo requests, none exceeding the per-request cap |
| Concurrency | Two simultaneous workers on one campaign never submit the same delivery twice (`SKIP LOCKED` + unique constraint) |
| Abort | Aborting mid-send stops further submissions within one batch; remaining rows become `skipped`; the campaign lands `aborted` |
| Kill switch | With `push_broadcast_enabled = false`, the worker claims nothing and send is refused |
| Retry | A simulated 429 retries with growing, jittered delays and stops at `MAX_ATTEMPTS` |
| Permanent failures | `MessageTooBig` and `InvalidCredentials` do not retry; `InvalidCredentials` halts the campaign |
| Rate budget | A 5,000-delivery run stays under the configured notifications-per-second |
| Aggregates | Terminal status and counts match the delivery rows exactly |
| Timeout safety | A run exceeding `DELIVERIES_PER_INVOCATION` exits cleanly and resumes next tick with no gaps or repeats |

## Deployment order

Deploy both functions **before** scheduling the cron jobs. A cron job pointed at a
missing function fails silently every minute. Seed `platform_settings` with
`push_broadcast_enabled = false`, and turn it on deliberately in Phase 7.

## Rollback / forward-fix

`select cron.unschedule('campaign-batch-worker')` stops everything immediately with no
deploy. That is the fastest lever and should be in the runbook. A campaign left mid-flight
by an unschedule resumes correctly when rescheduled, because all state is in delivery rows.

## Dependencies and risks

- **Depends on:** Phases 1, 2, and Phase 0's secret.
- **Risk:** edge-function wall-clock limits. `DELIVERIES_PER_INVOCATION` must be tuned against the real limit, with the resume path tested, not assumed.
- **Risk:** Expo's published limits change. Constants live in one block at the top of the worker with the doc link and the date checked.
- **Risk:** a partial-send bug is not undoable. This is why the kill switch, the `aborting` state and the false-by-default seed all exist before the first real campaign.

---

# Phase 4 — Receipt-sweeper integration and 90-day cleanup

> **Status 2026-09-22: DONE, re-specified.** Migrations
> `20260922100000_campaign_receipt_reconcile.sql` and
> `20260922100100_campaign_receipt_jobs.sql` applied to production. **No edge
> function was changed or deployed.** Types hand-patched (45 added, 1 removed;
> `storage` and `reserved_handles` intact).
>
> **Why re-specified.** The text below assumes deliveries stay `submitted` until a
> receipt arrives. Phase 3 instead sets `accepted` when Expo issues a ticket and fails
> anything still `submitted` after 10 minutes, so `submitted` is a seconds-long
> in-flight state. The owner approved the re-spec on 2026-09-22.
>
> **What was built:**
>
> 1. **`push_tickets.campaign_delivery_id`** (nullable, FK `on delete set null`,
>    partial index). **`worker_record_results`** (SQL, not the edge function) inserts a
>    ticket row for each accepted delivery, inside its own exception block: a failed
>    ticket write costs that delivery its receipt, never its recorded outcome.
> 2. **`reconcile_campaign_receipts()`** on its own cron job (`campaign-receipt-reconcile`,
>    `5,20,35,50 * * * *`). **`push-receipt-sweeper` is untouched:** it already checks
>    every unchecked ticket and deletes tokens on `DeviceNotRegistered`, so campaign
>    tickets only need to be in the table. A reconcile failure cannot reach the DM path.
>    Mapping: receipt `ok` → stays `accepted`, `provider_receipt_status = 'ok'`;
>    `DeviceNotRegistered` → `invalid_token`; any other receipt error → `failed` with
>    Expo's code. Only `accepted`, unreconciled rows move; a re-run is a no-op.
> 3. **"Unconfirmed" is derived, not relabelled:** `accepted`, no `ok` receipt, and past
>    24h. No nightly job.
> 4. **Frozen counts (new — the plan's premise was wrong).** The campaign row held no
>    outcome counts; every number was computed live from delivery rows, so the prune
>    would have erased them. `notification_campaigns` gains `stats_*` columns +
>    `stats_frozen_at`; `freeze_campaign_stats()` (cron `campaign-stats-freeze`, daily
>    03:30 UTC) fills them for terminal campaigns ended >25h ago with no row in flight.
> 5. **`prune_campaign_deliveries()`** (cron `campaign-delivery-prune`, daily 04:00 UTC),
>    behind `platform_settings.campaign_delivery_prune_enabled = 'false'`. Off, it deletes
>    nothing and records what it would delete. Every run writes one audit row
>    (`deliveries_prune_run`, campaign_id null); a real delete adds `deliveries_pruned`
>    per campaign. Taps and audit are never pruned.
> 6. **`admin_campaign_summary`** gains `receipt_ok`, `receipt_pending`, `unconfirmed`,
>    `receipt_failed`, `stats_frozen_at`, and reads frozen counts once set.
>    **`admin_campaign_deliveries`** gains `provider_receipt_status`. Both dropped and
>    recreated (return shape changed); no caller exists until Phase 5.
>
> **Deviations from the text below, all deliberate:**
>
> 1. No change to `process-campaign-batch` or `push-receipt-sweeper` — see 1 and 2.
> 2. No "relabel `submitted` older than 25h" job — see 3.
> 3. Receipt errors other than `DeviceNotRegistered` mark the delivery `failed` (the text
>    only named `accepted`/`invalid_token`). **The campaign's own status is not
>    revisited:** `sent`/`partially_failed` is the send-time verdict; receipt failures
>    are reported alongside it. Phase 7's alert email must read `receipt_failed` too.
> 4. Prune age is measured from when the **campaign** ended, not per delivery row, so a
>    campaign's detail goes all at once. It requires frozen counts, not merely non-null
>    audience counts.
> 5. An aborted campaign whose worker died mid-send keeps a `submitted` row forever
>    (`worker_finalize_campaign` only runs on `queuing`/`sending` — a Phase 3 gap, not
>    fixed here). Such a campaign is never frozen and so never pruned; the prune reports
>    it as `refused_unfrozen`.
>
> **Verified** (rolled-back dry run against production, then applied): worker links 6
> tickets for 6 accepted rows, none for the failed one; a forced ticket-insert failure
> still records the delivery `accepted`; receipts ok×3 / DeviceNotRegistered / MessageTooBig
> reconcile to accepted/ok, invalid_token, failed; re-run reconciles 0; a message-push
> ticket is ignored; summary live counts correct (receipt_pending and unconfirmed split
> on the 24h line); non-admin refused; new service functions not executable by anon or
> authenticated; freeze freezes once and skips an aborted campaign with an orphaned row;
> prune: too young → nothing, off → dry run with counts, on → 4 rows deleted, frozen
> counts and taps survive, ticket links nulled, unfrozen campaign refused and untouched,
> both audit rows written.
>
> **Live end-to-end, 2026-09-22:** the E2E campaign's 2 real tickets were backfilled into
> `push_tickets` with their original 03:13 `created_at` and linked deliveries. The 10:15
> `push-receipt-sweeper` run (unchanged code) checked both → `ok`; the 10:20
> `campaign-receipt-reconcile` run set both deliveries `provider_receipt_status = 'ok'`,
> `reconciled_at` 10:15:02, status still `accepted`. No token deleted (8 before and after).
> Matches the receipts fetched from Expo by hand at 09:57.
>
> **Prune enablement.** The only campaign ends its 90 days on **2026-12-21**; until then
> every run logs zeros. Leave the switch off until a week of dry-run rows after that date
> shows the expected counts.

## Existing components reused

- `push_tickets` and `push-receipt-sweeper` in full (decision 5). The sweeper already handles the hard part: the settle delay, the 1,000-id batch, the "only `DeviceNotRegistered` deletes a token" rule, and the 24-hour prune.
- `prune_push_tickets()` and the 15-minute cron job.

## Work

- Add `campaign_delivery_id uuid null` to `push_tickets`, with an index. Nullable because message pushes have no campaign — one table, two producers.
- The worker writes tickets with that reference, exactly as `send-message-push` writes them without one.
- The sweeper, when it resolves a receipt carrying a `campaign_delivery_id`, additionally updates that `campaign_deliveries` row: `provider_receipt_status`, `error_code`, `reconciled_at`, and `status` → `accepted` or `invalid_token`.

**The 24-hour trap, stated explicitly.** `prune_push_tickets()` deletes tickets older than
24 hours because Expo stops serving their receipts. Campaign tickets are pruned by the
same rule. So a delivery whose receipt never resolves within 24 hours will keep
`status = 'submitted'` forever. That is the correct outcome — Expo genuinely never told
us — but the admin UI must report it honestly as **"submitted, unconfirmed"** and not
silently fold it into either accepted or failed. Add a nightly job that relabels
`submitted` deliveries older than 25 hours to make the state explicit rather than
ambiguous.

**90-day cleanup** (decision 13). `prune_campaign_deliveries()`, daily via pg_cron:
aggregates are already maintained on the campaign row, so the prune simply deletes
`campaign_deliveries` older than 90 days. Before the first delete, assert the parent
campaign's counts are non-null — never destroy the detail while the summary is missing.
`campaign_audit_log` and `campaign_taps` are **not** pruned.

## New / modified files

| File | Change |
| --- | --- |
| `supabase/migrations/<ts>_campaign_receipt_link.sql` | new — column, index, `prune_campaign_deliveries()`, two cron jobs |
| `supabase/functions/push-receipt-sweeper/index.ts` | modified — reconcile campaign deliveries |
| `supabase/functions/process-campaign-batch/index.ts` | modified — write the ticket reference |

## Security requirements

- `prune_campaign_deliveries()` is `service_role` only, same grant shape as `prune_push_tickets()`.
- The sweeper's new write path is service-role and touches nothing outside `campaign_deliveries` and `push_tokens`.
- No change to the sweeper's token-deletion rule. Widening it is out of scope and would silently unsubscribe reachable users.

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Reconciliation | A campaign delivery's `accepted`/`invalid_token` status matches its Expo receipt |
| Coexistence | Message-push tickets (null campaign ref) still reconcile unchanged |
| Dead tokens | `DeviceNotRegistered` deletes the token and marks the delivery `invalid_token` |
| Unconfirmed | A delivery whose ticket is pruned unresolved reports as "submitted, unconfirmed", never as accepted |
| Prune | Rows older than 90 days are deleted; aggregates survive; audit and taps untouched |
| Prune safety | The prune refuses to delete detail for a campaign with null aggregates |

## Deployment order

Migration first (nullable column is safe against the running sweeper), then the sweeper,
then the worker. Nullable-first ordering means no deploy window can break message pushes.

## Rollback / forward-fix

The column is additive and ignorable. Reverting the sweeper leaves campaign deliveries
unreconciled but harms nothing else. Unschedule the prune job to stop deletion instantly.

## Dependencies and risks

- **Depends on:** Phase 3.
- **Risk:** the sweeper is on the live message-push path. Its new work must be wrapped so a campaign-reconciliation error cannot abort the token-cleanup run that messaging depends on — same failure posture the existing code already documents.
- **Risk:** the 90-day prune is destructive and runs unattended. Ship it disabled, verify the count it *would* delete for a week, then enable.

---

# Phase 5 — Lean admin interface

> **Status 2026-09-22: BUILT, not yet deployed.** Web only. Migration
> `20260922110000_push_broadcast_send_confirm_threshold.sql` applied. Web production
> is a manual promote of a preview, so nothing is live until the owner promotes.
> Sending stays impossible while `push_broadcast_enabled` is off.
>
> **Files:** `web/src/app/admin/notifications/{layout,page}.tsx`, `compose/page.tsx`,
> `[id]/page.tsx`; `web/src/components/admin/campaign-{preview,confirm-dialog,status-badge}.tsx`;
> `web/src/lib/campaigns/campaign-{logic,service}.ts` (rules and data kept out of the
> route files); `web/src/lib/__tests__/campaign-logic.test.ts` (33 tests); the nav
> link in `admin/page.tsx` (6 lines, no refactor); `database.types.ts` hand-patched.
>
> **Design tokens only.** Every colour comes from the generated roles in
> `packages/shared/src/tokens.ts` (`primary`, `muted`, `destructive`, `card`,
> `border`, …) — no raw Tailwind palette, no hex. The palette has no success or
> warning role, so status weight is carried by fill: solid primary = sent, tinted
> primary = in progress, tinted destructive = trouble, muted = inert.
>
> **Deviations from the text below, all deliberate:**
>
> 1. **The typed-SEND threshold row did not exist** (the plan assumed Phase 3 seeded
>    it). New setting `push_broadcast_send_confirm_threshold = '100'`, editable from
>    admin Settings. The UI reads a missing or bad value as 1 — every send asks for SEND.
> 2. **Five admin RPCs were missing from `database.types.ts`** (Phase 2 never patched
>    them): `admin_upsert_campaign`, `admin_preview_campaign_audience`,
>    `admin_schedule_campaign`, `admin_cancel_campaign`, `admin_abort_campaign`. Added.
> 3. **Server-side gate is a layout, and it 404s.** `notifications/layout.tsx` checks the
>    session and `is_admin()` server-side: signed out → `/auth`, non-admin → `notFound()`.
>    (The other admin pages redirect client-side to `/login`, which does not exist.)
> 4. **"Review and send" is blocked while the kill switch is off.** Scheduling while off
>    would leave a campaign that fires the moment someone turns broadcasts on. Drafts,
>    editing and test sends still work.
> 5. **Send-now/schedule is chosen in the composer; the confirm dialog shows it.**
>    Confirm = `admin_schedule_campaign` (freezes content, mints the key) then, for now,
>    `admin-campaign-send` with that key. A later time needs nothing more: the scheduler
>    cron queues it.
> 6. **"Send me a test"** (the Phase 2 `admin-campaign-test-send`) is on the detail page
>    for drafts and scheduled campaigns — the only way to see a real notification
>    before the switch is on.
> 7. **Double-click** is guarded by a ref lock around every write; drafts have no
>    server idempotency key, so the client lock is what prevents a duplicate draft.
>    Sends are protected server-side by the key and the atomic claim.
> 8. **Errors grouped by cause** use the first 1,000 delivery rows (the page says so if
>    capped); counts above them come from the summary and are exact.
> 9. The detail page shows receipt counts, frozen-at and pruned states (Phase 4).
>
>
> **Loose ends closed 2026-09-22 (after the promote):** migration
> `20260922120000_campaign_destination_lookup.sql` — `admin_campaign_destination_preview`
> shows what an id points at (name, status, warning when not live), and
> `admin_schedule_campaign` refuses a destination that matches nothing. The composer shows
> the target as you type and blocks Review and send on "not found". The four older admin
> pages that bounced signed-out users to the non-existent `/login` now use
> `/auth?next=<page>`, as does this gate.
>
> **Not verified:** the pages were not exercised in a browser against a real admin
> session — that needs the owner signed in on a preview deployment.

## Existing components reused

- [`web/src/app/admin/page.tsx`](web/src/app/admin/page.tsx) patterns and its Phosphor icon set (`Megaphone` and `Broadcast` are already imported).
- `web/src/app/admin/facility-import/page.tsx` as the closest structural precedent: a multi-step admin tool calling admin RPCs plus one privileged edge function.
- `sonner` toasts, `createClient` from `@/lib/supabase/client`, existing admin styling.

## Work

Three routes under `web/src/app/admin/notifications/`:

- **List** — reverse chronological, search, status filter, the columns from spec §4.1 minus CSV export.
- **Composer** — internal name, title (live count, warn past 50), body (live count, warn past 150), audience (All / iOS / Android), **required** destination via a dropdown of allowlisted roots plus an id field, send-now or schedule with the timezone named explicitly.
- **Detail** — content, audience, lifecycle timestamps, actors, aggregate counts, errors grouped by cause, audit history, and the tap metric with its denominator spelled out.

**Confirmation dialog** must show: title, body, audience, resolved unique-user and
active-device counts, **the count excluded for `platform = 'unknown'`** (decision 10),
destination, timing — and require typing `SEND` at or above the configured threshold
(~100 devices, read from `platform_settings`, decision 14).

**Abort control** on a sending campaign, with copy that states plainly that messages
already submitted cannot be recalled.

**Not built in V1** (decision 9): editor role, image upload, geography and membership
targeting, CSV export, UI-driven retry.

Status updates by polling the summary view every few seconds while a campaign is
`queuing`/`sending`. Realtime is not worth the subscription for a page one person watches.

## New / modified files

| File | Change |
| --- | --- |
| `web/src/app/admin/notifications/page.tsx` | new — list |
| `web/src/app/admin/notifications/compose/page.tsx` | new |
| `web/src/app/admin/notifications/[id]/page.tsx` | new — detail |
| `web/src/components/admin/campaign-preview.tsx` | new — iOS/Android preview cards |
| `web/src/components/admin/campaign-confirm-dialog.tsx` | new |
| `web/src/app/admin/page.tsx` | modified — nav entry |

## Security requirements

- Server-side admin check on entry; hiding the nav item is not authorization.
- The client never sees a token. It reads the two admin views and calls RPCs.
- The send button is disabled while in flight, but **the server-side idempotency key is the real defence** — the button state is a courtesy.
- No campaign content is rendered as HTML anywhere.

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Authorization | A non-admin navigating directly to any of the three routes is refused, and the underlying reads fail independently |
| Drafting | A draft round-trips with all fields intact |
| Validation | Over-length title/body, missing destination and unlisted routes are all blocked client- and server-side |
| Confirmation | The dialog shows user count, device count, excluded-unknown count, destination and timing |
| Typed SEND | Required at/above threshold; the threshold is read from config, not hardcoded |
| Double-click | Two rapid submissions produce exactly one campaign |
| Abort | Reachable during `sending`, states clearly that submitted messages cannot be recalled |
| Tap display | The denominator is labelled, and excluded builds are visibly accounted for |
| Accessibility | Matches existing admin pages; dialog is keyboard-navigable and focus-trapped |

## Deployment order

Ship behind the `push_broadcast_enabled` kill switch already seeded false. The UI can be
live and non-functional safely; it cannot send until the switch is flipped.

Note: web production is a **manual promote** of a preview deployment. Pushing does not
deploy.

## Rollback / forward-fix

Revert the routes. The kill switch means a UI bug cannot cause a send, which makes this
the lowest-risk phase.

## Dependencies and risks

- **Depends on:** Phases 1–3.
- **Risk:** `admin/page.tsx` is a large single client component. Add the nav entry; do not refactor it as part of this work.

---

# Phase 6 — Mobile routing and version-aware tap tracking

**Sequencing note:** the mobile half should ship in the first TestFlight build even if
Phases 2–5 are deferred. It is the only part that cannot be fixed server-side later.

## Existing components reused

- [`notificationPreferences.ts`](apps/mobile/src/lib/notificationPreferences.ts) and [`notifications-settings.tsx`](apps/mobile/src/app/notifications-settings.tsx) — one more toggle in an established pattern.
- [`routeFromNotificationResponse`](apps/mobile/src/lib/pushNotifications.ts#L189-L202) and [`resolveNotificationDestination`](apps/mobile/src/lib/externalRouting.ts#L104-L113) — **unchanged**. Because V1 emits `data.url` in the existing shape (decision 6), routing already works on installed builds.
- `registerPushTokenForUser`'s upsert ([`pushNotifications.ts:139-151`](apps/mobile/src/lib/pushNotifications.ts#L139-L151)) — the natural place for capability fields.

## Work

**Preference toggle.** Add `announcements` to `NotificationPreferences`, to `COLUMNS`, to
`DEFAULT_NOTIFICATION_PREFERENCES` (true), to the update mapper, and a row under
NOTIFICATION CATEGORIES labelled "Announcements" / "Product news and platform updates".
Keep the module's existing honesty about honoured-vs-stored-intent: from Phase 3 this one
*is* honoured, and the comment should say so.

**Capability reporting.** The registration upsert adds `app_version` (from
`Constants.expoConfig.version`) and `tap_events_supported: true`. Older builds omit both
fields; a partial upsert does not clear existing columns, and a fresh install from an old
build inserts the `false` default. So **null/false reliably means "unknown or incapable"**,
which is exactly the signal the tap-rate needs.

**Tap recording.** In `routeFromNotificationResponse`, when the payload carries a
`campaignId`, call a new `record_campaign_tap(p_campaign_id uuid)` RPC — SECURITY DEFINER,
`authenticated`, deriving the user from `auth.uid()` and **never** from the payload. The
unique `(campaign_id, user_id)` constraint does the deduplication. Fire-and-forget: a
failed analytics write must never block navigation.

**Tap-rate definition** (decision 8), to be implemented identically in the RPC and the
admin UI:

- **Numerator:** distinct users with a `campaign_taps` row.
- **Denominator:** accepted deliveries **whose `tap_capable` is true**.
- **Displayed** as "N taps / M accepted deliveries on tap-capable builds", with the
  count of accepted deliveries on non-capable builds shown beside it. Never a bare
  percentage.

**No-destination behaviour.** V1 requires a destination, so this case should not arise.
Defensively: an unroutable payload still records the tap and leaves the user where they
are, which is current behaviour and is correct — do not add a mobile fallback screen in
V1, because it would only work on new builds and would make the metric's meaning
build-dependent in a second dimension.

## New / modified files

| File | Change |
| --- | --- |
| `apps/mobile/src/lib/notificationPreferences.ts` | modified |
| `apps/mobile/src/app/notifications-settings.tsx` | modified |
| `apps/mobile/src/lib/pushNotifications.ts` | modified — capability fields, tap recording |
| `supabase/migrations/<ts>_record_campaign_tap.sql` | new |
| `web/src/components/shared/match-settings-panel.tsx` | modified — **required** (decision 16): add `notif_announcements` to the four `notif_*` columns it already reads and writes |

## Migrations

`record_campaign_tap(p_campaign_id uuid)`: SECURITY DEFINER, `search_path = public`,
`revoke all from public`, `grant execute to authenticated`. Inserts
`(p_campaign_id, auth.uid())` with `on conflict do nothing`. Raises if `auth.uid()` is
null. It takes no user id parameter — a SECURITY DEFINER function that trusts a
client-supplied user id is a hole, and this project has caught that exact mistake before.

## Security requirements

- The tap RPC derives identity from `auth.uid()`, full stop.
- `app_version` and `tap_events_supported` are self-reported. They may inform reporting and nothing else — never eligibility, never authorization.
- No change to `push_tokens` RLS; the existing self-write policies already cover the new columns.

## Tests and acceptance criteria

| Check | Pass condition |
| --- | --- |
| Toggle persists | Off survives a relaunch; Phase 3's snapshot then excludes that user |
| Independence | Turning announcements off leaves messages, marketplace and the rest working |
| Capability | A new build writes `app_version` and `tap_events_supported = true`; an older build's re-registration does not clear them |
| Tap dedup | Tapping the same notification twice yields one `campaign_taps` row |
| Identity | A forged `userId` in the payload cannot attribute a tap to another user |
| Routing | All nine allowlisted destination types open correctly from foreground, background and terminated |
| Non-blocking | With the network down, a tap still navigates |
| OTA safety | Changes are confined to `apps/mobile/src/**`; the fingerprint input list is unaffected |

## Deployment order

Migration first (the RPC must exist before a client calls it), then the mobile change via
`node ./scripts/publish-update.js preview` — **never a bare `eas update`**, which drops
`EXPO_PUBLIC_APP_ENV` and hides every internal-only feature.

Before publishing, run the pre-flight from `MOBILE_BUILD_CHECKLIST.md` to confirm no
fingerprint input changed. All files listed above are under `src/`, so this should be
OTA-safe — but confirm rather than assume, and confirm the runtime in the CLI output
matches the installed build.

## Rollback / forward-fix

An OTA can be rolled back by republishing the previous bundle. The RPC is additive. The
preference column cannot be rolled back once clients read it — forward-fix only.

## Dependencies and risks

- **Depends on:** Phase 1's column and tables.
- **Risk:** capability reporting only reaches users who update. Tap coverage will be partial for as long as old installs survive, which is precisely why the metric is defined against capable devices only.
- **Risk:** every install predating this phase is permanently opt-out-less for announcements. That is the strongest argument for shipping Phase 6 in the first TestFlight build.

---

# Phase 7 — Testing, staged rollout, monitoring, rollback

## Automated tests

| Area | Coverage |
| --- | --- |
| Audience resolver | Every inclusion/exclusion: opted out, no token, unknown platform on a platform campaign, deleted account, duplicate token across users |
| State machine | Every legal transition, every illegal one rejected, concurrent transitions |
| Idempotency | Repeated sends, overlapping workers, double-fired scheduler |
| Batching | Above one Expo batch and above one database page |
| Retry classification | Transient, permanent, invalid-token, too-big, credentials, max-attempts |
| RLS | anon, authenticated non-admin, admin, service_role, against all four tables and both views |
| Deep links | Allowlist accept/reject table, including the rejection cases |
| Preferences | Announcements independent of every other category; existing transactional categories unaffected |
| Phase 0 regression | Message push still delivers, with mute and `notif_messages` honoured |

Web tests run under vitest (`npm test` in `web/`); mobile has its own vitest config.
Add RLS assertions to `supabase/_rls_tests/` in the existing format.

## Manual / device tests

Real iPhone and Android, foreground / background / terminated / signed-out, permission
denied then re-enabled, token refresh after reinstall, long titles with emoji and
combining characters, a schedule crossing a DST boundary, two admins acting at once, and
network interruption mid-send.

Add these to `docs/DEVICE_QA_CHECKLIST.md` rather than a new document.

## Monitoring

- Structured logs with campaign id, batch id, counts, duration, sanitised error codes. **No tokens, ever.**
- **Two channels** (decision 17), split by whether the condition is an exception:

  | Condition | Channel | Why |
  | --- | --- | --- |
  | Unhandled worker error, `InvalidCredentials` | Sentry | Genuine exceptions, already scrubbed |
  | Campaign `failed` | Sentry **and** email | Terminal and needs a human |
  | Queue stalled (queued rows >10 min with no worker progress) | Email | **Raises no exception** — nothing is throwing, work simply stopped. Sentry alone cannot see this |
  | Failure rate >20% in a run | Email | Degradation, not an error |
  | Scheduler missed a due campaign | Email | Silent by nature |

- Email goes to `support@pickleballapp.app` via the existing [`send-transactional-email`](supabase/functions/send-transactional-email/index.ts) function — no new sender, no new secret. A stall detector runs on the existing pg_cron pattern, since by definition no running code will report it.
- Sentry scrubbing already redacts sensitive keys on both platforms; verify `expo_push_token` is in the redaction list and add it if not.
- Alert emails carry campaign id, state and counts. **Never message content or tokens.**

## Staged rollout

1. Deploy everything with `push_broadcast_enabled = false`.
2. Enable the admin UI for yourself only; exercise drafting and audience preview against real counts.
3. Test-send to your own devices on both platforms.
4. Flip the kill switch on. Send one campaign to a deliberately narrow audience (your own account's devices, targeted as a real campaign rather than a test send) and verify the full pipeline end to end: snapshot, batch, ticket, receipt, tap, aggregate.
5. Send to iOS-only, verify the unknown-platform exclusion count matches the database.
6. Only then send to all eligible users.
7. Keep the kill switch as standing operational capability, not a launch artefact.

## Rollback levers, fastest first

| Lever | Effect | Cost |
| --- | --- | --- |
| `push_broadcast_enabled = false` | No new campaign starts | One row update, instant |
| Abort the campaign | Stops unclaimed batches | One RPC; submitted messages are gone |
| `cron.unschedule('campaign-batch-worker')` | All processing halts | One statement, no deploy |
| Revert the admin UI | No new campaigns composed | A promote |
| Drop Phase 1 tables | Full removal | Only safe before Phase 6 ships |

## Runbook

Deliverable alongside the code, as `docs/PUSH_BROADCAST_RUNBOOK.md`, following
`docs/PAYMENT_RECONCILIATION_RUNBOOK.md`: how to pause, how to abort, how to read a
stalled queue, how to interpret each Expo error, how to re-drive a partially failed
campaign, how invalid-token cleanup behaves, and who to tell when a broadcast goes wrong.

## Acceptance criteria for "done"

Per the spec's closing requirement, and it is the right one: **not** green API responses.
Done means a real campaign delivered to real devices on both platforms, deep links opened
from all three app states, an opt-out demonstrably honoured, duplicate protection proven
under concurrency, a failure path exercised deliberately, admin authorization verified by
attempting access as a non-admin, and no token or credential in any log, response or
export.

---

## Resolved by the product owner, 2026-09-20

The three questions this plan opened with are answered and folded in as decisions 16–18:

1. **Announcements opt-out ships on web as well as mobile.** See Phase 6's file list.
2. **Alerting is Sentry plus email to support@.** See Phase 7's monitoring table.
3. **Phase 0 is standalone and goes first.** See the sequencing recommendation.

No open questions remain. This plan is ready for a go/no-go.
