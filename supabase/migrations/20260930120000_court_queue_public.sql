-- UP NEXT / ON DECK for signed-out visitors on the public tournament page.
--
-- court_queue() is SECURITY INVOKER and reads only bracket_matches and
-- divisions (both already readable by anon) plus fn_round_order(), which anon
-- can already execute. Granting it to anon exposes nothing new; it lets the
-- public bracket show the same queue signed-in viewers see.

grant execute on function public.court_queue(uuid) to anon;
