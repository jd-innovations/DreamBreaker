-- Groups web plan, Phase 6 (GROUPS_WEB_PLAN.md §5b): let a group's own
-- admins/owners see and resolve reports filed within their group.
--
-- Today `group_post_reports` only ever reaches site-wide admins
-- (`admins can manage all group reports`, gated on is_admin()). Mobile has
-- no group-scoped moderation view at all. This adds a second, narrower
-- lens on the same rows for is_group_admin() — it does not replace or
-- restrict the existing site-wide admin policy, which keeps seeing
-- everything regardless.
--
-- No new columns needed: `status`/`reviewed_by`/`reviewed_at` already exist
-- on this table, built for the site-wide flow. Group admins reuse them.

CREATE POLICY "group admins can view their group's reports"
  ON public.group_post_reports
  FOR SELECT
  USING (public.is_group_admin(group_id, (SELECT auth.uid())));

CREATE POLICY "group admins can resolve their group's reports"
  ON public.group_post_reports
  FOR UPDATE
  USING (public.is_group_admin(group_id, (SELECT auth.uid())))
  WITH CHECK (public.is_group_admin(group_id, (SELECT auth.uid())));
