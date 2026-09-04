-- notify_new_message() is a trigger function only — flagged by the security
-- advisor as callable via /rest/v1/rpc/notify_new_message by anon/authenticated
-- since it's SECURITY DEFINER and public. It doesn't need to be, so revoke.
revoke execute on function public.notify_new_message() from public, anon, authenticated;
