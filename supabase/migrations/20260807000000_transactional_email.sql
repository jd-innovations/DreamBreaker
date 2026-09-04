-- Transactional Email via Resend
-- Wires the new send-transactional-email edge function into existing
-- notify_* triggers (registration, tournament status, director status) plus
-- two new triggers for the support ticket system. Seeds default templates
-- into the previously-empty email_templates table (real, admin-editable,
-- but had zero consumers until now).

-- ── Seed default templates ─────────────────────────────────────────────────

INSERT INTO "public"."email_templates" ("key", "name", "subject", "html_body", "variables", "enabled") VALUES
('registration_confirmed', 'Registration Confirmed', 'You''re registered for {{tournament_name}}',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">Registration confirmed</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">You''re registered for <strong>{{tournament_name}}</strong>. See you on the court!</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['tournament_name'], true),

('tournament_approved', 'Tournament Approved', 'Your tournament "{{tournament_name}}" is now live',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">Tournament approved</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5"><strong>{{tournament_name}}</strong> is now live and open for registration.</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['tournament_name'], true),

('tournament_rejected', 'Tournament Needs Changes', 'Changes needed for "{{tournament_name}}"',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">Changes needed</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5"><strong>{{tournament_name}}</strong> was returned for changes:</p>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5;background:#F3F6FC;padding:12px;border-radius:8px">{{reason}}</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['tournament_name', 'reason'], true),

('director_approved', 'Director Application Approved', 'You''re an approved director',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">You''re approved!</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, you can now create and manage tournaments on DreamBreakerPB.</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['full_name'], true),

('director_suspended', 'Director Access Suspended', 'Your director access has been suspended',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">Director access suspended</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">Hi {{full_name}}, your director access has been suspended. Contact support if you have questions.</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['full_name'], true),

('support_ticket_new', 'New Support Ticket (Admin Alert)', 'New support ticket: {{subject}}',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">New support ticket</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5"><strong>{{reporter_name}}</strong> opened a ticket: <strong>{{subject}}</strong></p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB Admin</p></div>',
 ARRAY['subject', 'reporter_name'], true),

('support_ticket_reply', 'Support Ticket Reply', 'New reply on your ticket: {{subject}}',
 '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
 '<h1 style="color:#0A1228;font-size:20px">You have a reply</h1>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5">A DreamBreakerPB team member replied to <strong>{{subject}}</strong>:</p>' ||
 '<p style="color:#0A1228;font-size:15px;line-height:1.5;background:#F3F6FC;padding:12px;border-radius:8px">{{message_preview}}</p>' ||
 '<p style="color:#8A9DC0;font-size:12px;margin-top:32px">DreamBreakerPB</p></div>',
 ARRAY['subject', 'message_preview'], true)
ON CONFLICT ("key") DO NOTHING;

-- ── Shared helper: fire-and-forget call into the send-transactional-email
-- edge function. Bearer token is the project anon key (non-secret, same
-- established pattern as notify_new_message's pg_net call) — the real
-- Resend secret lives only inside the edge function itself, never in SQL.

CREATE OR REPLACE FUNCTION "public"."fn_send_transactional_email"("p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-transactional-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := p_payload
  );
end;
$$;

-- ── Extend existing notify_* triggers with real email (in-app notifications
-- insert logic is preserved verbatim; only the email call is new) ─────────

CREATE OR REPLACE FUNCTION "public"."fn_notify_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_tournament_name text;
  v_email text;
begin
  if NEW.player_id is not null and NEW.status in ('registered', 'checked_in') then
    insert into public.notifications(user_id, type, title, body, link)
    select NEW.player_id, 'registration_confirmed', 'Registration confirmed',
           'You''re registered for "' || t.name || '".', '/dashboard'
    from public.tournaments t where t.id = NEW.tournament_id;

    select t.name into v_tournament_name from public.tournaments t where t.id = NEW.tournament_id;
    select p.email into v_email from public.profiles p where p.id = NEW.player_id;
    if v_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_email,
        'templateKey', 'registration_confirmed',
        'variables', jsonb_build_object('tournament_name', coalesce(v_tournament_name, 'the tournament')),
        'idempotencyKey', 'registration-confirmed/' || NEW.id
      ));
    end if;
  end if;
  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_notify_tournament_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_director_email text;
begin
  select email into v_director_email from public.profiles where id = NEW.director_id;

  -- Director: tournament approved & published
  if NEW.status = 'open' and OLD.status is distinct from 'open' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_published', 'Tournament approved',
            '"' || NEW.name || '" is now live and open for registration.', '/director');
    if v_director_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_director_email,
        'templateKey', 'tournament_approved',
        'variables', jsonb_build_object('tournament_name', NEW.name),
        'idempotencyKey', 'tournament-approved/' || NEW.id || '/' || floor(extract(epoch from now()))::text
      ));
    end if;
  end if;

  -- Director: returned for changes (rejected)
  if NEW.status = 'draft' and OLD.status = 'pending_approval' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_rejected', 'Changes needed',
            coalesce('"' || NEW.name || '" was returned: ' || NEW.rejected_reason,
                     '"' || NEW.name || '" was returned for changes.'), '/director');
    if v_director_email is not null then
      perform public.fn_send_transactional_email(jsonb_build_object(
        'to', v_director_email,
        'templateKey', 'tournament_rejected',
        'variables', jsonb_build_object(
          'tournament_name', NEW.name,
          'reason', coalesce(NEW.rejected_reason, 'No reason provided.')
        ),
        'idempotencyKey', 'tournament-rejected/' || NEW.id || '/' || floor(extract(epoch from now()))::text
      ));
    end if;
  end if;

  -- Director + registrants: cancelled
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_cancelled', 'Tournament cancelled',
            '"' || NEW.name || '" has been cancelled.', '/director');
    insert into public.notifications(user_id, type, title, body, link)
    select r.player_id, 'tournament_cancelled', 'Tournament cancelled',
           '"' || NEW.name || '" you registered for has been cancelled.', '/dashboard'
    from public.registrations r
    where r.tournament_id = NEW.id and r.player_id is not null
      and r.status in ('registered', 'checked_in', 'substitute');
  end if;

  -- Admins: a tournament needs review (new submission or resubmitted edit)
  if NEW.status = 'pending_approval' and OLD.status is distinct from 'pending_approval' then
    insert into public.notifications(user_id, type, title, body, link)
    select p.id, 'tournament_pending', 'Tournament needs review',
           '"' || NEW.name || '" is awaiting approval.', '/admin'
    from public.profiles p where p.role = 'admin';
  end if;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."fn_notify_director_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if NEW.director_status is distinct from OLD.director_status then
    if NEW.director_status = 'approved' then
      insert into public.notifications(user_id, type, title, body, link)
      values (NEW.id, 'director_approved', 'You''re an approved director',
              'You can now create and manage tournaments.', '/director');
      if NEW.email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', NEW.email,
          'templateKey', 'director_approved',
          'variables', jsonb_build_object('full_name', coalesce(NEW.full_name, 'there')),
          'idempotencyKey', 'director-approved/' || NEW.id || '/' || floor(extract(epoch from now()))::text
        ));
      end if;
    elsif NEW.director_status = 'suspended' then
      insert into public.notifications(user_id, type, title, body, link)
      values (NEW.id, 'director_suspended', 'Director access suspended',
              'Your director access has been suspended.', '/dashboard');
      if NEW.email is not null then
        perform public.fn_send_transactional_email(jsonb_build_object(
          'to', NEW.email,
          'templateKey', 'director_suspended',
          'variables', jsonb_build_object('full_name', coalesce(NEW.full_name, 'there')),
          'idempotencyKey', 'director-suspended/' || NEW.id || '/' || floor(extract(epoch from now()))::text
        ));
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

-- ── New: support ticket email triggers ──────────────────────────────────
-- Admins have no push tokens (admin is web-only), so email is their only
-- out-of-band channel for new tickets — closes a gap flagged when the
-- support ticket system was built.

CREATE OR REPLACE FUNCTION "public"."fn_notify_support_ticket_new"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_admin_emails text[];
  v_reporter_name text;
begin
  select array_agg(email) into v_admin_emails from public.profiles where role = 'admin' and email is not null;
  select full_name into v_reporter_name from public.profiles where id = NEW.user_id;

  if v_admin_emails is not null and array_length(v_admin_emails, 1) > 0 then
    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', to_jsonb(v_admin_emails),
      'templateKey', 'support_ticket_new',
      'variables', jsonb_build_object(
        'subject', NEW.subject,
        'reporter_name', coalesce(v_reporter_name, 'A user')
      ),
      'idempotencyKey', 'support-ticket-new/' || NEW.id
    ));
  end if;
  return NEW;
end;
$$;

CREATE TRIGGER "trg_notify_support_ticket_new" AFTER INSERT ON "public"."support_tickets"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_support_ticket_new"();

-- Guarded to conversation_type = 'support' AND sender is an admin, so the
-- reporter's own messages — including the ticket's opening message — never
-- trigger this (would otherwise "notify" the reporter about their own text).

CREATE OR REPLACE FUNCTION "public"."fn_notify_support_ticket_reply"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_conversation_type text;
  v_sender_role "public"."user_role";
  v_ticket_id uuid;
  v_ticket_subject text;
  v_ticket_user_id uuid;
  v_reporter_email text;
begin
  select conversation_type into v_conversation_type from public.conversations where id = NEW.conversation_id;
  if v_conversation_type is distinct from 'support' then
    return NEW;
  end if;

  select role into v_sender_role from public.profiles where id = NEW.sender_id;
  if v_sender_role is distinct from 'admin' then
    return NEW;
  end if;

  select id, subject, user_id into v_ticket_id, v_ticket_subject, v_ticket_user_id
  from public.support_tickets where conversation_id = NEW.conversation_id;
  if v_ticket_user_id is null then
    return NEW;
  end if;

  select email into v_reporter_email from public.profiles where id = v_ticket_user_id;
  if v_reporter_email is not null then
    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', v_reporter_email,
      'templateKey', 'support_ticket_reply',
      'variables', jsonb_build_object(
        'subject', v_ticket_subject,
        'message_preview', left(coalesce(NEW.body, 'Sent an attachment.'), 200)
      ),
      'idempotencyKey', 'support-ticket-reply/' || NEW.id
    ));
  end if;
  return NEW;
end;
$$;

CREATE TRIGGER "trg_notify_support_ticket_reply" AFTER INSERT ON "public"."messages"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_support_ticket_reply"();
