-- Pool standings on the public tournament page (DIRECTOR_HUB_WEB_PARITY.md, W3).
--
-- division_pool_standings() is SECURITY INVOKER and reads only bracket_matches,
-- which anon can already SELECT. Granting it to anon exposes nothing new; it lets
-- signed-out visitors see the same standings signed-in players see.

grant execute on function public.division_pool_standings(uuid) to anon;
