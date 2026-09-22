# Push Broadcast — Session Handoff

**Written for:** the next Claude session picking up admin push broadcasting, with no
memory of the session that built Phases 0–3. Last updated 2026-09-22.

`PUSH_BROADCAST_IMPLEMENTATION_PLAN.md` is the source of truth. Each finished phase has
a **Status box** at its top recording what was verified and every deliberate deviation
from the plan's own text. Read those boxes before touching anything — the code follows
the boxes where they disagree with the prose beneath them.

---

## Where things stand

| Phase | State | Commits |
| --- | --- | --- |
| 0 — close the `send-message-push` open relay | **Live, enforcing** | `bcb60d8`, `e765462` (on `feature/marketplace-map`) |
| 0b — callers name a row, never recipients | **Live** (shipped inside Phase 2) | `6f75d1c`, `2369f70` |
| 1 — schema + `notif_announcements` opt-out | **Live** | `ce820d1` |
| 2 — admin campaign API | **Live, dormant** (no UI until Phase 5) | `6f75d1c` |
| 3 — batched worker, kill switch, abort, retries | **Live, dormant** — and proven end to end | `8f1d4a7`, `4ca7591`, `4dfafb2` |
| 4 — receipt reconciliation + 90-day prune | **Live** (re-specified; prune ships OFF) | `2c02101` |
| 5 — lean admin interface | **Live** (promoted 2026-09-22; sending blocked by kill switch) | `58b0e84` |
| 6 — mobile tap tracking | **Next.** Not started | — |
| 7 | Not started | — |

**Branch:** `feature/push-broadcast`, created from `168bd4a`. Working tree clean.
**Pushed 2026-09-22:** `feature/push-broadcast` tracks `origin`, and
`feature/marketplace-map` is in sync with its remote (Phase 0 commits included).
Production web is a promoted preview of `feature/push-broadcast`. Ask the owner before pushing.

### Live production state (Supabase project `fbzetvkbhneptvfruilw`)

- **Kill switch:** `platform_settings.push_broadcast_enabled = 'false'`. With it off the
  worker claims nothing, the scheduler queues nothing, and `admin-campaign-send` answers
  503 `broadcast_disabled`. Stays off until Phase 7.
- **Cron jobs:** `campaign-batch-worker` and `campaign-scheduler`, every minute. Inert
  while the switch is off (the worker job makes no HTTP call unless the switch is on
  and a campaign is active). Phase 4 added `campaign-receipt-reconcile`
  (`5,20,35,50 * * * *`), `campaign-stats-freeze` (03:30 UTC) and
  `campaign-delivery-prune` (04:00 UTC) — all pure SQL, all live.
- **Prune switch:** `platform_settings.campaign_delivery_prune_enabled = 'false'`. The
  prune only logs (`campaign_audit_log`, action `deliveries_prune_run`) until enabled.
- **Edge functions deployed:** `send-message-push`, `push-receipt-sweeper`,
  `admin-campaign-send`, `admin-campaign-test-send`, `process-campaign-batch`.
- **One real campaign exists:** `5b5a45c7-d54c-42f7-a18e-518c9667199e`, "E2E test
  2026-09-22", status `sent`, 2 deliveries `accepted` with Expo ticket ids. Sent to the
  owner's two phones; arrival and tap routing confirmed by the owner. Both receipts
  reconciled live through Phase 4 (`provider_receipt_status = 'ok'`, 10:15 UTC). Its
  counts freeze on 2026-09-24 03:30 UTC; its detail becomes prunable 2026-12-21.
- **Dispatch secret:** Vault `push_dispatch_secret`, 64 bare hex chars. Vault is the ONLY
  copy — there is deliberately no edge-function secret. Never read `decrypted_secret`;
  check shape or SHA-256 only.

---

## Phase 4, as built (2026-09-22)

Re-specified with the owner's approval — the plan's original text assumed deliveries
stay `submitted` until a receipt arrives, which Phase 3 did not build. The Phase 4
Status box in the plan has the full record. In short:

- **Migration-only.** The worker's ticket write lives in `worker_record_results` (SQL),
  and reconciliation is its own cron job, so **neither `process-campaign-batch` nor
  `push-receipt-sweeper` changed** and nothing needed deploying.
- `accepted` = Expo took it. The receipt sets `provider_receipt_status` + `reconciled_at`;
  `DeviceNotRegistered` → `invalid_token`; other receipt errors → `failed`. The
  campaign's `sent` / `partially_failed` is NOT revisited — Phase 7's alerting must read
  `receipt_failed` from `admin_campaign_summary` as well.
- "Unconfirmed" is derived in the summary (accepted, no `ok` receipt, >24h).
- Outcome counts are frozen onto `notification_campaigns.stats_*` 25h after a campaign
  ends; the prune refuses anything unfrozen.

## Phase 5, as built (2026-09-22)

Web admin at `/admin/notifications` (list, `compose`, `[id]` detail), linked from the
admin sidebar as "Push Campaigns". Server layout 404s non-admins. Design-token classes
only. Full record in the plan's Phase 5 Status box. **Live:** production promoted to
`58b0e84` on 2026-09-22, then to `37584f8` (loose ends: `/auth?next=` redirects and
the destination lookup) — verified live: the gate redirects to
`/auth?next=/admin/notifications`, and the shipped reviews chunk carries the new redirect. Not yet exercised by the owner with a real admin session.

- New setting `push_broadcast_send_confirm_threshold = '100'` (typed-SEND gate).
- "Review and send" is disabled while `push_broadcast_enabled` is off; drafts and
  "Send me a test" still work.
- **Destination lookup (loose end, 2026-09-22):** the composer shows the name and status
  of the item an id points at; `admin_schedule_campaign` refuses an id that matches
  nothing (`destination_not_found`). Non-live targets (sold, cancelled, private, paused)
  warn but do not block.

### Production branch

Web production is a promoted preview. `feature/marketplace-map` was fast-forwarded to
`feature/push-broadcast` on 2026-09-22, so both branches hold the same history and
either is safe to promote. Before promoting ANY branch, check it contains the live
commit: `git merge-base --is-ancestor <live-sha> <branch>`.

## Open items

- **Prune enablement:** the only campaign reaches 90 days on **2026-12-21**. Leave
  `campaign_delivery_prune_enabled` off until a week of dry-run audit rows after that
  date shows the expected counts.
- **Phase 3 gap, not fixed:** an aborted campaign whose worker died mid-send keeps a
  `submitted` row forever (`worker_finalize_campaign` ignores `aborted`). Phase 4 copes
  (never frozen, never pruned, reported as `refused_unfrozen`), but the row is wrong.
- **Sweeper throughput:** 1,000 tickets per 15-minute run, shared by DMs and campaigns
  (~96k/day). Fine at current scale; a large campaign would delay DM receipt checks.
- **`prune_push_tickets()` is executable by anon and authenticated** (its 2026-08-31
  migration only revoked from `public`). Low impact — it deletes only tickets past 24h —
  but it is a public RPC. Owner's call.
- **Sign-in bounces lose their return path in 9 pages.** `groups` (list, create, detail,
  edit, join), `matchmaking`, and `play` (create, join, manage) send `/auth?redirect=…`,
  but `/auth` reads only `?next=`, so the user lands on the dashboard instead of where
  they were. Found 2026-09-22; not fixed (owner's call).

---

## How this owner works

- **Review requests mean "wait for approval."** When asked to review or plan, report and
  stop. Implement only an approved phase. Findings outside the task get flagged, not fixed.
- **No deletion without explicit permission** — code, UI, CTAs, rows.
- **I cannot deploy edge functions or flip feature flags** — the auto-mode classifier
  blocks both. Give the owner the exact command (`npx supabase functions deploy <names>`
  from `C:\Users\dhjes\DreamBreaker`, on the right branch) or the exact toggle, then
  verify afterwards. Applying migrations and running SQL is allowed.
- The owner is the only person with the app installed. Test DMs are Bryce ↔ Jesus.

## Working practices that paid off here

- **Dry-run every migration** in a self-aborting transaction: the migration, then a
  `do $$ … raise exception 'DRYRUN %', <jsonb of results>; $$` block. Everything rolls
  back and the results come back in the error. Impersonate users with
  `set_config('request.jwt.claims', …, true)` + `set local role authenticated`.
- PL/pgSQL identifiers are case-insensitive: `s` and `S` collide.
- `apply_migration` writes no repo file — always write the file too. Recorded versions
  differ from repo filenames (the MCP stamps its own); that is the repo's convention.
- `config.toml` and `PRODUCTION_CONFIG.md` are CRLF: edit them with the scratchpad
  `edit.py` helper (it preserves the dominant line ending) or a byte-safe script.
- **Devices are distinct tokens.** One phone signed into several accounts has one
  `push_tokens` row per account (production: 8 rows, 2 phones). Count distinct tokens.
- New public tables get ALL for anon/authenticated by Supabase default — always
  `revoke all` first. `REVOKE FROM PUBLIC` does not remove those; name both roles.
- Never put `<...>` in SQL handed to the owner — it once got pasted literally into Vault.

## Verification commands

```
npx -y deno@2.9.6 check supabase/functions/<fn>/index.ts
npx -y deno@2.9.6 test supabase/functions/process-campaign-batch/logic.test.ts   # 16 tests
cd web && npx vitest run                                                          # 239 tests incl. packages/shared
cd apps/mobile && npx tsc --noEmit
```

## Open items outside this workstream (owner's call, not started)

1. **A signed-out account's push token stays on the phone** — one device receives
   another account's DMs. Fix: remove the token on sign-out.
2. **Price-drop pushes don't route when tapped** — payload has `listingId`, the app
   routes only on `conversationId` / `url`. Adding `url` fixes installed builds.
3. TestFlight credentials run; `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and `SENTRY_AUTH_TOKEN`
   unset in Vercel; harmless `[inbucket]` → `[local_smtp]` config.toml deprecation.
