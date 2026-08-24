-- Fixes an unauthenticated read of the entire mutual-match graph.
--
-- v_mutual_matches was created without `security_invoker`, so on PG15+ it runs
-- as its owner and the caller's RLS on matchmaking_swipes never applies. anon
-- also held SELECT on it. Verified against production before this migration:
--
--   set local role anon;
--   select count(*) from public.matchmaking_swipes;  -- 0   (RLS holds)
--   select count(*) from public.v_mutual_matches;    -- 6   (RLS bypassed)
--
-- The view has no auth.uid() predicate of its own. The only thing scoping rows
-- today is a client-supplied filter that all four web call sites happen to
-- add:
--
--   .from("v_mutual_matches").select("user_a,user_b")
--     .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
--
-- Dropping that filter returns every pair in the system, and the anon key that
-- makes the call ships inside the mobile app. A predicate the client is free
-- to omit is not an access control.
--
-- Why this is NOT fixed with `security_invoker = on`, which is the usual
-- remedy: the view needs to read rows the caller cannot. The swipe self-join
-- is fine -- "swipes: own read" and "swipes: read targeting me" together let a
-- user see both halves of their own match. The block check is not. blocked_users
-- restricts SELECT to `blocker_id = auth.uid()`, so under security_invoker a
-- user would only see blocks they created, and the NOT EXISTS would silently
-- stop honoring blocks made *against* them -- turning a safety feature
-- one-directional. Reading blocks as owner is the reason this view is
-- SECURITY DEFINER, so it stays SECURITY DEFINER and gets the row filter it
-- always should have had.
--
-- Note for the linter: `security_definer_view` will still be reported for this
-- view. That is now a deliberate, documented choice -- a definer view with an
-- internal auth.uid() predicate -- not the accidental default it was before.

CREATE OR REPLACE VIEW "public"."v_mutual_matches" AS
  SELECT a.requester_id AS user_a,
         a.target_id    AS user_b,
         GREATEST(a.created_at, b.created_at) AS matched_at
    FROM "public"."matchmaking_swipes" a
    JOIN "public"."matchmaking_swipes" b
      ON b.requester_id = a.target_id
     AND b.target_id    = a.requester_id
     AND b.direction    = 'like'::"public"."match_direction"
   WHERE a.direction = 'like'::"public"."match_direction"
     -- The fix: a caller only ever sees pairs they are part of. auth.uid() is
     -- NULL for anon, so an unauthenticated read now returns zero rows even if
     -- the grant below were somehow restored.
     AND (SELECT auth.uid()) IN (a.requester_id, a.target_id)
     AND NOT EXISTS (
       SELECT 1 FROM "public"."blocked_users" bl
        WHERE (bl.blocker_id = a.requester_id AND bl.blocked_id = a.target_id)
           OR (bl.blocker_id = a.target_id    AND bl.blocked_id = a.requester_id)
     );

COMMENT ON VIEW "public"."v_mutual_matches" IS
  'Mutual likes for the calling user only. SECURITY DEFINER on purpose: it must read blocked_users rows the caller cannot see, so blocks are honored in both directions. Row scoping is the auth.uid() predicate in the WHERE clause -- never the caller''s filter.';

-- Matchmaking is an authenticated-only feature; anon never had a legitimate
-- reason to read this. Defense in depth -- the auth.uid() predicate already
-- returns nothing for anon.
REVOKE ALL ON "public"."v_mutual_matches" FROM "anon";

-- The view is not auto-updatable (it joins), so write grants were dead weight
-- that only widened the surface. Reads are all the app has ever needed.
REVOKE ALL ON "public"."v_mutual_matches" FROM "authenticated";
GRANT SELECT ON "public"."v_mutual_matches" TO "authenticated";
