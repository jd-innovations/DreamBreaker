# Executive Summary

**Overall completion: ~55%** against the 13-phase roadmap. Phases 0–1 (Foundation, Tournaments) and Phase 5 (Facilities) are genuinely built and Supabase-backed. Phase 2 (Community Play) has real core logic but a risky parallel mock-data code path. Phase 3 (Partner Finder) is real on web, largely mock on mobile. Phase 4 (Messaging) has one real shared schema but incomplete UI surfacing. Phases 6–7 (Director/Admin) are more built than the roadmap credits, but with real gaps (staff, reports, facility moderation, real analytics).

**Biggest strengths:** Tournament platform (player+director+admin) and web Admin console are fully real, non-trivial implementations. The messaging schema is genuinely unified (one `conversations`/`messages` system) rather than duplicated per feature. Facilities Directory is real and well-integrated into creation flows.

**Biggest risks:** (1) ~~Mobile Partner Finder runs on an in-memory mock store...~~ **[Corrected 2026-07-06, see below]** — mostly already real; the remaining gaps were fixed the same day. (2) ~~Community Play screens silently branch between real Supabase writes and a non-persistent in-memory fallback...~~ **[Corrected 2026-07-06, see below]** — confirmed dead code, not a live risk. (3) Heavy, repeated RLS "debug/fix" migration churn on `conversations` (8 migrations in 2 days) signals the DM permission layer was unstable through early July. (4) Web's tournament list silently substitutes mock tournaments when Supabase returns empty/errors, which can mask backend outages as normal content.

---

# Post-Audit Corrections (2026-07-06 follow-up work)

Two findings from the original pass turned out to be more optimistic on closer, file-level inspection during implementation. Recorded here rather than silently rewriting history above.

**Partner Finder mock backend (originally listed as a top risk):** Only 4 real gaps existed, not a wholesale mock system. `match/connections.tsx`, `match/requests.tsx`, `match/saved.tsx`, and `finder.tsx`'s like/save persistence were already reading/writing the real `partner_likes`/`partner_matches` tables — the audit conflated these with an older, separate `matchmaking_swipes`/`v_mutual_matches` table pair that only the *web* app uses. The actual gaps (`match/profile/[id].tsx` fully mock, two dead duplicate mock writes in `finder.tsx`, a mock pending-count in `(tabs)/games.tsx`, a mock connections list in `tournament/[id]/register.tsx`) were fixed same-day. See TODO.md §2 for detail.

**Community Play "silent data-loss risk" (originally listed as a top risk):** Traced every creation flow (`create-quick-game.tsx`, `create-round-robin.tsx`, `create-mini-tournament.tsx`) and confirmed each one *always* calls the real Supabase create function and *always* forwards a real UUID to every downstream screen. The `UUID_RE`/`isSupabase` mock-fallback branches in `*-created`/roster/schedule/score-entry/bracket screens are dead code in the real product flow — reachable only via the separate mock "Groups" feature's event routing, or a manual deep link. Not a live risk. Two confirmed-dead unused imports (`setRoundRobin`, `setMiniTournament`) were removed; the unreachable fallback branches themselves were left in place (revisit only if Groups becomes a real feature). See TODO.md §3 for detail.

# Completion Matrix

**Phase 0 — Foundation**
- Auth (sign up/in): ✅ — real Supabase calls on both platforms.
- OAuth: 🔴 — web button is a "coming soon" toast; no mobile OAuth code.
- Profiles/avatar: ✅ — real fetch/update/upload.
- Onboarding: 🟡 — 15-screen flow persists nothing; local state only, per its own DATA_GAPS note.
- Navigation: 🟡 — several tabs (tournaments, stats, chat, marketplace) exist but are hidden from the tab bar.
- Theme (dark/light): 🟡 — real on web; mobile has fixed single palette, no dark-mode switch.
- Shared components/design tokens: 🟡 — tokens exist but ~57 mobile screens hardcode hex colors instead of using them.

**Phase 1 — Tournament Platform**
- Player discovery: 🟡 — mobile real; web has silent mock-data fallback on empty/error.
- Tournament detail/registration: ✅ — real across the board.
- Hold My Spot: 🟡 — real DB hold row, but no actual payment processing behind it.
- My Tournaments: ✅ — real.
- Director tools: ✅ — real Supabase-backed CRUD, check-in, brackets.
- Admin: ✅ — large, real, Supabase-backed console.

**Phase 2 — Community Play**
- Quick Game: 🟡 — create/join/leave real; roster has a mock-ID fallback path.
- Round Robin: 🟡 — real circle-method scheduling + score persistence for real events; parallel in-memory store for demo events.
- Mini Tournament: 🟡 — real bracket seeding algorithm; explicit dev-only mock roster path acknowledged in code.
- Web parity: 🔴 — no dedicated round-robin/mini-tournament UI on web, mobile-only.

**Phase 3 — Partner Finder**
- Preferences: ✅ — real, persisted.
- Discovery pool: 🟡 — real query, but ignores saved preferences and hardcodes distance to 0.
- Compatibility scoring: 🟡 — real on web; absent on mobile (cosmetic tags only).
- Likes/matches: 🔴 (mobile) / ✅ (web) — mobile uses an in-memory mock store with seeded fake players, not `matchmaking_swipes`/`v_mutual_matches`.
- Messaging entry: ✅ — real when reached, but reached mainly from mock connections on mobile.

**Phase 4 — Messaging**
- Schema (conversations/messages): ✅ — one real, shared, increasingly-hardened system.
- Inbox: 🟡 — two independent implementations (web panel, mobile tab), same schema.
- Realtime: 🟡 — real on web; mobile has no subscription, loads once on mount.
- Read state: ✅ — `read_at` implemented and used both platforms.
- Cross-feature integration: 🟡 — Partner Finder and Community Play wired to shared conversations; tournament "Contact Director" is a mock toast, not connected despite DB support existing.

**Phase 5 — Facilities Directory**
- Nearby/map: 🟡 — courts tab real; tournament-pin layer hardcoded.
- Facility detail/picker/card: ✅ — real, reused in creation flows.
- Data population: 🟡 — one-time static SQL import, not a live pipeline.

**Phase 6 — Director Platform**
- Dashboard/registration/brackets: ✅ — real Supabase-backed data and seeding logic.
- Analytics: 🟡 — fill/waitlist real; no revenue analytics in-app for directors.
- Staff/roles: 🔴 — no feature exists.
- Payments (Stripe Connect): ✅ — real onboarding + webhook; no payout visibility UI.
- Reports: 🔴 — no director-facing report/export feature.

**Phase 7 — Admin Platform**
- User/tournament/director moderation: ✅ — real CRUD.
- Platform settings/email/sponsors/user reports: ✅ — real.
- Communications send: 🟡 — compose UI real, but "send" only updates local state, not actually dispatched.
- Facility moderation: 🔴 — no admin surface despite claim/verification concepts existing in migrations.
- Analytics/growth chart: 🔴 — explicitly randomized mock chart and hardcoded trend percentages.

---

# Gaps

- Mobile Partner Finder is not connected to the real matchmaking schema (mock `connectionStore` instead of `matchmaking_swipes`/`v_mutual_matches`).
- Mobile chat has no realtime subscription — messages don't appear without manual reload.
- Tournament "Contact Director" is not wired to the real conversation system despite DB support existing for it.
- Onboarding collects data that is never persisted (some fields have no destination column at all).
- No director-facing reports/exports; no staff/role-assignment feature.
- No admin facility moderation surface.
- OAuth sign-in not implemented on either platform.
- Web tournament list can silently display mock data when the real query is empty or fails.
- Admin platform-growth analytics and admin "communications send" are non-functional despite looking real in the UI.

---

# Technical Debt

- In-memory data stores still live in shipped code paths: `connectionStore.ts` (Partner Finder mock), `roundRobinStore.ts`, `rrScheduleStore.ts`, `quickGameStore.ts`, `miniTournamentStore.ts` — silent fallback depending on whether an event ID is a UUID.
- 8 conversations/DM RLS migrations within ~2 days (including 3 pure-debug introspection scripts: `debug_dm_organizer_check`, `debug_dm_full_check`, `debug_show_policy[_anon]`) — indicates the policy was tuned reactively; the 3 debug-only SQL functions (`debug_dm_full_check`, `debug_dm_organizer_check`, `debug_show_conversations_policies`) are still present in the deployed schema and should be dropped.
- Partner Finder has 4 migrations reportedly created but not yet pushed to production per its own status doc (unverified as of last handoff).
- Widespread design-token bypass on mobile: ~57 files with raw hex colors, ~80 files with hardcoded spacing/radius values, despite a mature token system in `@/theme`.
- Web has 38 files using arbitrary Tailwind bracket values (`text-[13px]` etc.), lighter drift than mobile but still off-token.
- `database.types.ts` is one migration behind the latest schema change (minor).
- Mock/demo data fallbacks that can mask real failures: web tournament list fallback to `mockTournaments`; director dashboard hardcodes director name (`'Mike Johnson'`) and imports the mock `Tournament` type.

---

# Freeze Recommendation

- **Phase 1 — Tournament Platform** (player + admin sides): core flows are real and stable; freeze pending payment-behind-hold decision.
- **Phase 5 — Facilities Directory**: real and integrated; freeze, revisit only if a live import pipeline is later required.
- **Phase 7 — Admin Platform (moderation/user/director/settings)**: real and substantial; freeze the CRUD surfaces, leave communications-send and analytics chart as known non-frozen exceptions.

Do not freeze Phase 2 (mock-path risk unresolved), Phase 3 (mobile not yet real), or Phase 4 (still 🚧 per project's own tracker and UI integration incomplete).

---

# Recommended Next Phase

**Finish Phase 4 — Messaging**, specifically closing the gap between the (already unified) schema and its UI surfacing: add realtime subscription to mobile chat, wire "Contact Director" to the real conversation RPC, and replace mobile's mock `connectionStore` with the real matchmaking tables (this also resolves the largest Phase 3 gap, since Partner Finder's messaging entry point depends on real match state to be meaningful). This is the project's own stated next subsystem, it's the one place a partial system currently touches three other phases at once, and finishing it converts two 🚧/🟡 phases toward ✅ with one focused effort — consistent with the project's build-one-subsystem-completely principle.

---

# Build Order

1. Phase 4 — Messaging (finish UI integration + mobile realtime)
2. Phase 3 — Partner Finder (mobile: replace mock store with real matchmaking backend)
3. Phase 2 — Community Play (remove/guard the mock in-memory fallback paths; web parity is optional, not blocking)
4. Phase 6 — Director Platform (staff/roles, reports, payout visibility)
5. Phase 7 — Admin Platform (facility moderation, real analytics, real communications send)
6. Phase 8 — Fitness
7. Phase 9 — Analytics & AI
8. Phase 10 — Marketplace
9. Phase 11 — Design Sprint (token-compliance cleanup belongs here, once feature work is frozen)
10. Phase 12 — Production Launch

---

# STATUS

PASS
