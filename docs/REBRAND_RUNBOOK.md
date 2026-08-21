# Rebrand runbook — Pickleball App

Ordered steps to finish the rebrand. The repo-side work (Steps 1–3 and 5 of
`docs/REBRAND_PICKLEBALL_APP.md`) is already done and sitting uncommitted on
`feature/expo-mobile-foundation`; everything below is what remains.

**Ownership:** 🧑 = you, in a console I cannot reach. 🤖 = me, on request.

**The ordering is not cosmetic.** Step 3 must precede any mobile build, and
Step 5 must precede Step 6. The rest can slip without harm.

---

## Phase A — get the code out of the working tree

### 1. 🤖 Review the diff, then commit

81 changed paths across two apps plus Supabase. Worth reading the diff before it
becomes history:

```bash
git diff --stat
git diff apps/mobile/app.json apps/mobile/app.config.js
```

Then a commit per concern, not one giant one:

- `feat(legal): add terms, privacy, deletion and support pages` — item 1.4
- `feat: rebrand to Pickleball App` — identity, domain constants, copy sweep
- `feat(db): rebrand production email templates and claim scheme` — the pending
  migration
- `docs: record the rebrand plan and runbook`

### 2. 🧑 Push and open the PR

```bash
git push -u origin feature/expo-mobile-foundation
```

Do **not** merge yet — Step 3 has to land first, or the deploy in Step 5 ships a
web app whose AASA advertises a bundle id no build uses yet. That is harmless but
confusing; landing them in order avoids explaining it later.

---

## Phase B — the blocking console change

### 3. 🧑 Add the new scheme to the Supabase Auth redirect allow-list

**This blocks every mobile build from here on.** The repo now emits
`pickleballapp://`; a build made before this lands fails OAuth sign-in and
password reset with a redirect mismatch.

Supabase dashboard → Authentication → URL Configuration → Redirect URLs. The
full expected set is documented in `supabase/config.toml:38-42`:

```
https://pickleballapp.app/auth/callback
pickleballapp://
pickleballapp://reset-password
https://pickleballapp.app/**
exp://**                          (only if you use Expo Go / dev client)
```

**Leave the old `dreambreaker://` entries in place for now.** They cost nothing,
and they keep any existing dev build on your phone working until you install the
new one. Remove them at Step 15.

---

## Phase C — web and backend

### 4. 🧑 Set the environment variables

Both currently fall back to a hardcoded value in code. The fallbacks are now
correct, but relying on them is what item 2.3 exists to prevent.

- **Vercel** → project → Settings → Environment Variables:
  `NEXT_PUBLIC_APP_URL = https://pickleballapp.app` (all environments)
- **Supabase** → Edge Functions → Secrets:
  `PUBLIC_APP_URL = https://pickleballapp.app`

### 5. 🧑 Merge and deploy the web app

Merge the PR to `main`. Vercel deploys via git integration, so the merge is the
deploy.

This is the step that makes the four legal/support routes stop returning 404.
They have never resolved — item 1.4 shipped them into a working tree, not to
production.

### 6. 🧑 Verify the web deploy

```bash
for p in /legal/terms /legal/privacy /legal/delete-account /help; do
  printf "%-26s " "$p"
  curl -s -o /dev/null -w "%{http_code}\n" -L "https://pickleballapp.app$p"
done
curl -s https://pickleballapp.app/.well-known/apple-app-site-association
```

Expect four `200`s, and an AASA naming **`app.pickleballapp`**. If the AASA still
says `com.dreambreakerpb.app`, the deploy did not pick up the change — stop and
fix before building the app, or universal links will break.

### 7. 🧑 Redeploy the two edge functions

Neither redeploys automatically on a git merge.

```bash
supabase functions deploy send-transactional-email
supabase functions deploy waitlist-sweeper
```

`send-transactional-email` carries the sender display name; `waitlist-sweeper`
carries the `APP_URL` fallback.

---

## Phase D — production data

### 8. 🧑 Apply the rebrand migration

`supabase/migrations_pending/20260820000000_rebrand_pickleball_app.sql`.

Held out of the replay path per item 2.1, so `db push` will not pick it up.
Apply it deliberately — SQL editor, or MCP `apply_migration` — then record it:

```bash
supabase migration repair --status applied 20260820000000
```

Then move the file from `supabase/migrations_pending/` into
`supabase/migrations/` and commit, so the repo keeps mirroring production.

It touches 8 `email_templates` rows, 1 `wallet_partners` row, and replaces
`create_personal_match_claim_link` with a body verified byte-identical to
production's except the scheme literal (md5 `7e10f0d70b3a92267dcdb229f517b337`).
It is idempotent — running it twice is a no-op.

### 9. 🧑 Verify the migration

The three queries are at the bottom of the migration file:

```sql
select count(*) from public.email_templates
 where subject like '%DreamBreaker%' or html_body like '%DreamBreaker%';  -- 0
select name, description from public.wallet_partners
 where slug = 'premium-membership';                                       -- Pickleball App
select prosrc like '%pickleballapp://claim/%'
  from pg_proc where proname = 'create_personal_match_claim_link';        -- t
```

### 10. 🧑 Update Stripe

Dashboard → Settings → Business:

- **Business name** and **public business name** → Pickleball App
- **Statement descriptor** → so a player's card statement matches the app that
  charged them. This is a common chargeback cause when it does not.

The in-app `merchantDisplayName` for the Apple Pay / Google Pay sheet is already
updated in the repo.

### 11. 🧑 Rename the Supabase project (cosmetic)

`dreambreaker-pb` → `pickleball-app`, dashboard only. Nothing references it.

---

## Phase E — the mobile app

### 12. 🧑 Rename the EAS project and slug (optional, do it alone)

Still `dreambreaker`. Invisible to users — it appears in expo.dev URLs and OTA
update paths. The slug in `app.json` must match the EAS project name, so this is
a coordinated change and a mismatch breaks builds.

```bash
eas project:info                      # note the current name
# rename the project on expo.dev, then:
# 🤖 update "slug" in app.json to match
eas project:info                      # confirm the link still resolves
```

Skip this entirely if you would rather not risk it — nothing else depends on it.

### 13. 🧑 New icon and splash assets

Only if the mark itself changes. `apps/mobile/assets/images/` — `icon.png`,
`logo-splash.png`, `android-icon-foreground.png`, `android-icon-background.png`.

### 14. 🧑 Build and verify on device

```bash
eas build --profile preview --platform ios
```

The new bundle id needs new credentials — expect an Apple sign-in prompt. Then
verify, in this order, because each depends on the last:

1. **Google sign-in** — proves the Step 3 allow-list entry works.
2. **Apple sign-in.**
3. **Password reset** — the `pickleballapp://reset-password` deep link.
4. **A universal link** — open `https://pickleballapp.app/tournament/<id>` from
   Messages, with the app installed. Then again with it removed, to confirm the
   web fallback page renders.
5. **A guest match claim link**, if Step 8 is applied — confirm it opens the app.
6. **Skim for stale copy** — the landing header lockup, sign-up, account
   settings, permissions, help & support.

### 15. 🧑 Remove the old redirect entries

Once a build with the new scheme is installed and verified, delete the
`dreambreaker://` entries from the Supabase Auth allow-list.

---

## Phase F — still open, not blocking

### 16. 🧑 Decide the governing-law jurisdiction

Terms §16 still reads `[GOVERNING LAW JURISDICTION]` — the last placeholder in
the documents. Florida is the obvious answer given the entity is a Bradenton
LLC, but it is a legal choice, so it belongs with Step 18.

### 17. 🧑 Decide on a privacy mailbox

`PRIVACY_EMAIL` in `web/src/lib/legal.ts` currently aliases `SUPPORT_EMAIL`,
deliberately: the privacy policy promises a 30-day response, and naming a
mailbox nobody reads is worse than sharing one that works. If you create
`privacy@pickleballapp.app`, flipping it back is one constant.

Either way, **`support@pickleballapp.app` must exist and be monitored** before
store submission.

### 18. 🧑 Have a lawyer review the Terms and Privacy Policy

They are drafted to describe this system accurately — which is not the same as
being legally sufficient.

### 19. 🧑 Confirm the logo lockup

`landing.tsx` renders `PICKLEBALL` + a gold `APP`, preserving the two-part
structure the old mark used. That was my substitution, not a design decision.

---

## What this runbook does not cover

The rebrand does not close any item in `TODO1.1_EXECUTION_PLAN.md` by itself.
Item **1.4** is complete once Step 5 deploys and Step 6 verifies. Item **7.1**
(store metadata) is where the name, icon, screenshots and store listing
converge, and it is still ahead of you.
