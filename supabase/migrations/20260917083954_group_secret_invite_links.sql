-- Groups web plan, Phase 1/5 (GROUPS_WEB_PLAN.md §5a): shareable invite
-- links for secret groups.
--
-- Mobile's create-group copy promises "Only people with an invite link can
-- join" for secret groups, but no such mechanism exists anywhere in the
-- codebase today — joinGroup() treats 'secret' identically to 'public'
-- (instant join, no gate), and the only thing that actually makes a group
-- "secret" is exclusion from the discovery query. A secret group's row is
-- already correctly hidden by RLS from anyone who isn't a member, the
-- organizer, or has a pending targeted invite, so this isn't closing a
-- security hole — it's adding the feature mobile's own UI copy describes
-- but never built: a real shareable link.
--
-- Design: a unique token column on `groups` (nullable — only ever set for
-- secret groups), plus two SECURITY DEFINER functions that are the sole,
-- narrow, intentional bypass of "secret groups are invisible without
-- membership": one to preview a group by token (minimal fields only, no
-- member list, no feed), one to actually join by token. Scoped to
-- privacy = 'secret' only — public and private groups are unaffected and
-- keep their existing join/request-to-join flows unchanged.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS invite_token text UNIQUE;

COMMENT ON COLUMN public.groups.invite_token IS
  'Shareable join-link token for secret groups only. Null for public/private groups. Regenerable by an owner/admin to invalidate a leaked link.';

CREATE OR REPLACE FUNCTION public.get_group_preview_by_invite_token(p_token text)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  image_url text,
  member_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    g.id,
    g.name,
    g.description,
    g.image_url,
    (SELECT count(*) FROM public.group_members m WHERE m.group_id = g.id AND m.status = 'active')
  FROM public.groups g
  WHERE g.invite_token = p_token
    AND g.privacy = 'secret';
$$;

COMMENT ON FUNCTION public.get_group_preview_by_invite_token(text) IS
  'Minimal group preview for the secret-group invite-link landing page. SECURITY DEFINER by design: reveals only name/description/image/member-count, gated on knowing the exact token, not on browsing or guessing group ids.';

REVOKE ALL ON FUNCTION public.get_group_preview_by_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_preview_by_invite_token(text) TO anon, authenticated;

-- Deliberately takes NO user-id parameter — reads auth.uid() internally.
-- A SECURITY DEFINER function that instead trusted a client-supplied user
-- id would let any authenticated caller add an arbitrary OTHER user to the
-- group without their consent; that's not a hypothetical, it's exactly the
-- shape of bug this function exists to not have.
CREATE OR REPLACE FUNCTION public.join_group_via_invite_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_group_id uuid;
  v_conversation_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'P0004';
  end if;

  select id, conversation_id into v_group_id, v_conversation_id
    from public.groups
    where invite_token = p_token and privacy = 'secret';

  if v_group_id is null then
    raise exception 'invalid_invite_link' using errcode = 'P0004';
  end if;

  insert into public.group_members (group_id, user_id, role, status)
    values (v_group_id, v_user_id, 'member', 'active')
  on conflict (group_id, user_id) do update set status = 'active';

  if v_conversation_id is not null then
    insert into public.conversation_participants (conversation_id, user_id, role)
      values (v_conversation_id, v_user_id, 'member')
    on conflict (conversation_id, user_id) do nothing;
  end if;
end;
$$;

COMMENT ON FUNCTION public.join_group_via_invite_token(text) IS
  'Joins the calling user (auth.uid()) into a secret group by its invite token. SECURITY DEFINER: bypasses the normal membership-gated RLS on group_members/conversation_participants for this one narrow, token-verified path. Takes no user-id parameter on purpose — see inline comment.';

-- Note: this project grants EXECUTE on new public-schema functions to
-- `anon`/`authenticated` by default (ALTER DEFAULT PRIVILEGES), which
-- `REVOKE ALL ... FROM PUBLIC` does NOT undo -- PUBLIC and a named role are
-- different grantees. Revoke from anon explicitly; the function's own
-- auth.uid() IS NULL guard would also reject an anon call, but don't rely
-- on that alone.
REVOKE ALL ON FUNCTION public.join_group_via_invite_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_group_via_invite_token(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_group_via_invite_token(text) FROM anon;
