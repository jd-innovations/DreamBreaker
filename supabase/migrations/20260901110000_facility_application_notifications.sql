-- Telling the applicant what happened.
--
-- Phase 1 shipped without this: an approved manager learned their fate only by
-- reopening the screen, and a rejected one never learned it at all. Directors
-- have had fn_notify_director_status since the start; this is the same shape —
-- an in-app notification plus a transactional email — for facility
-- applications.

create or replace function public.fn_notify_facility_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email text;
  v_name  text;
  v_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Only decisions are worth a message. A withdrawal is the applicant's own
  -- action; telling them about it is noise.
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  select p.email, coalesce(p.full_name, 'there') into v_email, v_name
    from public.profiles p where p.id = new.applicant_id;

  v_label := coalesce(
    (select f.name from public.facilities f
      where f.id = coalesce(new.created_facility_id, new.facility_id)),
    nullif(trim(coalesce(new.proposed->>'name','')), ''),
    'your facility');

  if new.status = 'approved' then
    insert into public.notifications (user_id, type, title, body, link)
    values (new.applicant_id, 'facility_manager_approved',
            'You now manage ' || v_label,
            'Set up your courts and start taking bookings.',
            '/facility/manage');

    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'facility_manager_approved',
        'variables', jsonb_build_object('full_name', v_name, 'facility_name', v_label),
        'idempotencyKey', 'facility-approved/' || new.id::text
      ));
    end if;
  else
    insert into public.notifications (user_id, type, title, body, link)
    values (new.applicant_id, 'facility_manager_rejected',
            'About your request for ' || v_label,
            coalesce(new.review_note, 'We could not approve this request.'),
            '/facility/apply');

    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'facility_manager_rejected',
        'variables', jsonb_build_object(
          'full_name', v_name,
          'facility_name', v_label,
          -- Never blank: the template renders it, and an unresolved variable
          -- is a 422 from the sender rather than a delivered email.
          'reason', coalesce(nullif(trim(coalesce(new.review_note,'')),''),
                             'We could not confirm your connection to this facility.')),
        'idempotencyKey', 'facility-rejected/' || new.id::text
      ));
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_notify_facility_application on public.facility_manager_applications;
create trigger trg_notify_facility_application
  after update on public.facility_manager_applications
  for each row execute function public.fn_notify_facility_application();

insert into public.email_templates (key, name, subject, preheader, html_body, variables, enabled, layout)
values
 ('facility_manager_approved', 'Facility manager approved',
  'You now manage {{facility_name}}',
  'Set up your courts and start taking bookings.',
  '<p>Hi {{full_name}},</p>'
  '<p>You are now the manager of <strong>{{facility_name}}</strong> on Pickleball App. The corrections you submitted have been applied to the listing.</p>'
  '<p>Next: add your courts and their hourly rates so players can book them.</p>'
  '<p><a href="https://pickleballapp.app/facility/manage" class="btn">Set up your facility</a></p>',
  array['full_name','facility_name'], true,
  (select layout from public.email_templates where layout is not null limit 1)),
 ('facility_manager_rejected', 'Facility manager not approved',
  'About your request for {{facility_name}}',
  'We could not approve this request.',
  '<p>Hi {{full_name}},</p>'
  '<p>We could not approve your request to manage <strong>{{facility_name}}</strong>.</p>'
  '<p>{{reason}}</p>'
  '<p>If you think this is a mistake, reply to this email or contact support and we will take another look.</p>',
  array['full_name','facility_name','reason'], true,
  (select layout from public.email_templates where layout is not null limit 1))
on conflict (key) do nothing;

comment on function public.fn_notify_facility_application() is
  'Notifies the applicant of an approve/reject decision, in-app and by email. Mirrors fn_notify_director_status.';
