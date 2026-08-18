-- Flag/report system for group Feed content (posts and comments).
--
-- The existing moderation table (user_reports, 20260616000001) is hardwired
-- to person-to-person reports (reporter_id/reported_id -> profiles) with a
-- GLOBAL unique(reporter_id, reported_id) constraint — reusing it here would
-- mean a user could never report the same author twice for two different
-- group posts, and there's no target_type/target_id to point at content.
-- New table instead, reusing the existing report_reason/report_status enums
-- and the is_admin() helper so it slots into the same review workflow.

create table public.group_post_reports (
  id               uuid          primary key default gen_random_uuid(),
  reporter_id      uuid          not null references public.profiles(id) on delete cascade,
  group_id         uuid          not null references public.groups(id) on delete cascade,
  target_type      text          not null check (target_type in ('group_post', 'group_comment')),
  target_id        uuid          not null,
  reported_user_id uuid          not null references public.profiles(id) on delete cascade,
  reason           report_reason not null default 'spam_or_inappropriate',
  notes            text,
  status           report_status not null default 'pending',
  reviewed_by      uuid          references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz   not null default now(),

  constraint unique_open_group_report unique (reporter_id, target_type, target_id)
);

comment on table public.group_post_reports is 'Reports filed against group Feed posts/comments. Reviewed via the same admin workflow as user_reports.';

create index idx_group_post_reports_status  on public.group_post_reports(status, created_at desc);
create index idx_group_post_reports_target  on public.group_post_reports(target_type, target_id);
create index idx_group_post_reports_group   on public.group_post_reports(group_id);

alter table public.group_post_reports enable row level security;

create policy "reporters can insert own group reports"
  on public.group_post_reports for insert
  with check (
    reporter_id = (select auth.uid())
    and public.is_group_member(group_id, (select auth.uid()))
  );

create policy "reporters can view own group reports"
  on public.group_post_reports for select
  using (reporter_id = (select auth.uid()));

create policy "admins can manage all group reports"
  on public.group_post_reports for all
  using (public.is_admin())
  with check (public.is_admin());
