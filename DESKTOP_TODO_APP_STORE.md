# Desktop To-Do — App Store v1.0 Submission

Written 2026-10-29. Do these in order; each step says how to know it worked.
Background and copy: `STORE_SUBMISSION.md`.

**Deadline:** Futures Classic (the reviewer's free event) closes **Dec 24**.
Submit well before then.

---

## 1. Apply the push migration (5 min)

One phone = one account for push notifications.

1. Supabase Dashboard → project `fbzetvkbhneptvfruilw` → **SQL Editor** → New query.
2. Paste the whole of
   `supabase/migrations/20261028120000_push_token_one_account_per_device.sql`
   → **Run**.
3. In a new query, record it so future `db push` doesn't try it again:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('20261028120000', 'push_token_one_account_per_device');
   ```
4. **Check:** this returns **0 rows**:
   ```sql
   select expo_push_token, count(*) from public.push_tokens
   group by 1 having count(*) > 1;
   ```

From now on your test phone only gets pushes for the account signed in last.

---

## 2. Push the code (2 min)

From the repo root:

```
git push origin feature/push-broadcast
```

Then GitHub → **jd-innovations/DreamBreaker** → **Settings** → **General** →
**Default branch** → switch to `feature/push-broadcast` → **Update**.
A manual workflow only shows up in the Actions tab when it's on the default
branch, and `main` is dead.

**Check:** **Actions** tab lists a workflow named **app-store**.

---

## 3. Create the App Store Connect API key (5 min)

1. appstoreconnect.apple.com → **Users and Access** → **Integrations** tab →
   **App Store Connect API** → **Team Keys**.
2. **+** (Generate API Key) → Name `fastlane GitHub` → Access **App Manager** →
   **Generate**.
3. **Download API Key** — the `.p8` file downloads **once only**. Keep it.
4. Note the **Key ID** (in the key's row) and the **Issuer ID** (above the
   table).

---

## 4. Add GitHub secrets (10 min)

GitHub → repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, once per row:

| Name | Value |
| --- | --- |
| `ASC_KEY_ID` | Key ID from step 3 |
| `ASC_ISSUER_ID` | Issuer ID from step 3 |
| `ASC_KEY_P8` | Open the `.p8` in Notepad, copy **everything** including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |
| `REVIEW_DEMO_PASSWORD` | Tyler's password (dhjesus122+tyler@gmail.com) |
| `REVIEW_FIRST_NAME` | Your first name (App Review's contact) |
| `REVIEW_LAST_NAME` | Your last name |
| `REVIEW_PHONE` | Your phone with country code, e.g. `+1 941 555 0100` |
| `EXPO_PUBLIC_SUPABASE_URL` | see below |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | see below |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | see below — must start `pk_live_` |
| `EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY` | see below |

Take the four `EXPO_PUBLIC_*` values from **expo.dev** → project
**dreambreaker** → **Environment variables** → **production** (not from your
local `.env`, which may hold the test Stripe key).

**Check:** 11 secrets listed. Then delete the `.p8` from Downloads, or move it
somewhere private — never into the repo.

---

## 5. Sign in as Tyler on your phone (2 min)

Open the TestFlight app (build 14) and sign in as Tyler with the password
you just saved. **Check:** it signs in, and Tournaments shows **Futures
Classic** as open and free. If not, stop — the reviewer would hit the same
wall.

---

## 6. Check Sentry for crashes (5 min)

sentry.io → **jd-innovations** → project **react-native** → **Issues**,
filtered to environment `production`, last 14 days.
**Check:** no crash that happens on launch, sign-in, or registration. Send me
anything that looks like one before submitting.

---

## 7. Capture screenshots (45 min, mostly waiting)

1. GitHub → **Actions** → **app-store** → **Run workflow** → lane
   `capture-screenshots`, **upload unticked** → **Run**.
2. When it finishes (~30–40 min), open the run → **Artifacts** →
   download **app-store-screenshots**.
3. Look at every image (`01-games` … `06-profile`):
   - **No real users' names or photos** — only you, Tyler, Mia, demo events.
   - Nothing blank, loading, or showing an error.
4. Good → run it again with **upload ticked**.
   Bad or the run failed → send me the failing step's log and the images in
   `maestro-output`; I'll fix the flow.

**Check:** App Store Connect → your app → version 1.0 → 6.9" Display shows
the six screenshots.

---

## 8. Upload the listing text (5 min)

**Actions** → **app-store** → **Run workflow** → lane `metadata` → **Run**.

**Check in App Store Connect** (version 1.0): subtitle, description,
keywords, URLs filled in; **App Review Information** shows Tyler's login,
your contact details and the notes.

---

## 9. Fill in what fastlane can't (20 min) — App Store Connect

1. **App Privacy** (left sidebar) → **Get Started / Edit** → answer from
   `STORE_SUBMISSION.md` §4: the "Collected and linked to the user" table,
   **no tracking**. Publish.
2. **Age Rating** (App Information → Age Rating → Edit) → answer honestly;
   the app has **user-generated content and messaging** (users can chat and
   post), no gambling, no mature themes.
3. **Pricing and Availability** → Price **Free (USD 0)** → availability
   (United States, or all countries — your call).
4. **App Information** → Content Rights → "does not contain third-party
   content" (or answer if you use any licensed content).

**Check:** no yellow warnings left on the version page except "Add for
Review".

---

## 10. Submit (5 min)

**Actions** → **app-store** → **Run workflow** → lane `submit` → **Run**.
This attaches build 14 and submits with **manual release**.

**Check:** App Store Connect shows **Waiting for Review**. Review usually
takes 1–3 days. Watch your email; answer any question in **App Review**
messages (send it to me first if unsure).

When approved, it waits for you: press **Release This Version** when ready.

---

## After launch (not now)

- Membership → 1.0.1 (needs build 15 and a second review). See
  `MEMBERSHIP_PHASE5_STOREKIT.md`.
- 1.1: free tournament registration shows only "Failed to complete
  registration" — `createRegistration` (apps/mobile/src/lib/supabase/registrations.ts)
  returns null on any DB error, so the real reason is lost. Surface it
  (already registered, registration closed, division full). JS only, ships
  over OTA. Found 2026-11-04 while fixing re-registration after withdrawal.

---

## Launch day — turn on the web "get the app" prompt

Only after Apple approves AND you press Release (the App Store link 404s
before that).

1. App Store Connect → your app → **App Information** → copy the **Apple ID**
   (a number like `6740000000`).
2. Optional, for install attribution: App Store Connect → **Analytics** →
   **Acquisition** → **Campaigns** → copy the **provider token** (`pt=` value).
3. Vercel → project **web** → **Settings** → **Environment Variables**
   (Production):
   - `NEXT_PUBLIC_APP_STORE_ID` = the Apple ID
   - `APP_STORE_PROVIDER_TOKEN` = the provider token (optional)
4. Redeploy / promote production (NEXT_PUBLIC_* is baked in at build time).
5. **Check:**
   - iPhone Safari on pickleballapp.app shows Apple's banner at the top and,
     after ~2 seconds, the "Get the Pickleball App" sheet.
   - Desktop shows the lightbox with the QR code; scanning it opens the App
     Store.
   - https://pickleballapp.app/get-app opens the App Store on an iPhone.
