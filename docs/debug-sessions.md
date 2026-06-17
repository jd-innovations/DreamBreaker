# Debug Sessions

A running log of system debug/health passes. Most recent first.

---

## 2026-06-16 23:55 EDT (2026-06-17 03:55 UTC)

**Scope:** Full system pass after a day of shipping (Community Play, partner
matching, recommended events, visual bracket tree, organizer contact CTA).
Production @ commit `a54acf1`, all routes 200, no server-side runtime errors.

### Fixed in this session
- DB hardening migration `20260616000004_community_play_hardening.sql` (applied + committed):
  - Pinned `search_path = public` on `fn_generate_play_event_slug` (security).
  - Rewrote all `play_*` RLS policies to use `(select auth.uid())` / `(select public.is_admin())` so they evaluate once per statement instead of per row (performance).
  - Added covering indexes on `play_matches.player_a_id` and `play_matches.player_b_id`.

### Outstanding — to fix in a later debug session
1. **ESLint error — `web/src/app/dashboard/page.tsx:1055`**
   `Date.now()` called inside the Cancel-registration dialog render IIFE →
   `react-hooks` "Cannot call impure function during render". Pre-existing
   (not introduced by recent feature work). Non-blocking (build passes).
   Fix: compute `daysUntil` from a value captured outside render (e.g. the
   already-existing `now` state) or in an event handler.

2. **ESLint error — `web/src/app/tournaments/[id]/page.tsx:338`**
   `setWaitlistPosition` referenced in the loader before its `useState`
   appears in source order (declared at line 520) → "Cannot access variable
   before it is declared". Works at runtime via closure; non-blocking.
   Fix: move the `waitlistPosition` `useState` up with the other state hooks
   above the `useEffect`.

### Flagged but intentional / pre-existing (no action needed)
- `play_participants_public` "Security Definer View" (advisor ERROR) — intentional;
  keeps participant email/phone private while exposing display-safe columns to
  the public. Same pattern as existing `v_mutual_matches`.
- Trigger functions executable by anon/authenticated, `multiple_permissive_policies`
  (admin-full-access + specific policy overlap), extensions in `public`,
  `spatial_ref_sys` RLS, leaked-password protection — all pre-existing and
  consistent across the whole project.
- Unused `play_*` indexes — expected; no production traffic yet.

### Notes
- ~64 ESLint warnings remain across the app (mostly `<img>` vs `next/image`
  and unused vars) — cosmetic, consistent with existing code.
