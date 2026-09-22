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
| 4 — receipt reconciliation + 90-day prune | **Next.** Not started | — |
| 5–7 | Not started | — |

**Branch:** `feature/push-broadcast`, created from `168bd4a`. Working tree clean.
**Nothing is pushed.** `feature/push-broadcast` has no upstream; `feature/marketplace-map`
is 4 commits ahead of its remote (the Phase 0 work). Ask the owner before pushing.

### Live production state (Supabase project `fbzetvkbhneptvfruilw`)

- **Kill switch:** `platform_settings.push_broadcast_enabled = 'false'`. With it off the
  worker claims nothing, the scheduler queues nothing, and `admin-campaign-send` answers
  503 `broadcast_disabled`. Stays off until Phase 7.
- **Cron jobs:** `campaign-batch-worker` and `campaign-scheduler`, every minute. Inert
  while the switch is off (the worker job makes no HTTP call unless the switch is on
  and a campaign is active).
- **Edge functions deployed:** `send-message-push`, `push-receipt-sweeper`,
  `admin-campaign-send`, `admin-campaign-test-send`, `process-campaign-batch`.
- **One real campaign exists:** `5b5a45c7-d54c-42f7-a18e-518c9667199e`, "E2E test
  2026-09-22", status `sent`, 2 deliveries `accepted` with Expo ticket ids. Sent to the
  owner's two phones; arrival and tap routing confirmed by the owner.
- **Dispatch secret:** Vault `push_dispatch_secret`, 64 bare hex chars. Vault is the ONLY
  copy — there is deliberately no edge-function secret. Never read `decrypted_secret`;
  check shape or SHA-256 only.

---

## Read this before starting Phase 4

**The plan's Phase 4 text is written against a model Phase 3 did not build.** It assumes
a delivery stays `submitted` until its receipt arrives, and asks for a nightly job that
relabels `submitted` rows older than 25h as "unconfirmed". The built Phase 3 instead:

- sets a delivery to **`accepted` when Expo issues a ticket** (receipt not yet known);
- marks any row still `submitted` after 10 minutes as `failed` / `interrupted` (a worker
  died mid-send; never retried, to avoid duplicate pushes).

So `submitted` is only ever a seconds-long in-flight state here. Phase 4 must be
re-specified against that before coding. The likely shape — **propose it to the owner,
don't assume it:**

- `accepted` means "Expo took it"; the receipt refines it via `provider_receipt_status`
  + `reconciled_at`, and a `DeviceNotRegistered` receipt moves it to `invalid_token`.
- "Unconfirmed" = `accepted` with `reconciled_at is null` once its ticket is past Expo's
  24h window — derived for display, so no relabelling job is needed.

Also:

- **The worker does not write `push_tickets` yet** — that is Phase 4's job
  (`campaign_delivery_id` column, worker writes it, sweeper reconciles it).
- **The E2E campaign's 2 tickets are only in `campaign_deliveries.ticket_id`.** Expo keeps
  receipts 24h, so they can be backfilled into `push_tickets` for a real reconciliation
  test **until about 2026-09-23 03:13 UTC**. After that, test with a fresh campaign
  (needs the owner to flip the switch — see below).
- `push-receipt-sweeper` is on the **live DM path**. Its new campaign work must be
  wrapped so a failure there cannot abort the token cleanup messaging depends on.
- The 90-day prune ships **disabled**: log what it would delete for a week, then enable.

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
