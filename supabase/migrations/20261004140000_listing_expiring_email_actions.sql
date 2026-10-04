-- Listing-expiring email: two real buttons (owner-approved 2026-10-04).
--
-- "Renew my listing" linked to /marketplace — the browse page — so the "one
-- tap" the copy promised renewed nothing, and "Already sold it?" was a line of
-- small text with no link. Both buttons now open THE listing with an action:
--
--   https://pickleballapp.app/marketplace/<id>?action=renew
--   https://pickleballapp.app/marketplace/<id>?action=sold
--
-- /marketplace/* is a universal link, so on a phone they open the app, which
-- asks the owner to confirm before doing anything. Never act on the link
-- alone: mail apps and link scanners open links unprompted.
--
-- The sender passes listing_id for the URLs. Unchanged otherwise.

create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expired integer;
  r         record;
begin
  -- 1. Warn, 7 days out, once per cycle. Done BEFORE expiring so a listing
  --    always gets its warning even if both windows are crossed in one run.
  for r in
    select l.id, l.title, l.expires_at, p.email, p.full_name
      from public.marketplace_listings l
      join public.profiles p on p.id = l.seller_id
     where l.status in ('active', 'pending')
       and l.expiry_warned_at is null
       and l.expires_at is not null
       and l.expires_at <= now() + interval '7 days'
       and l.expires_at > now()
       and p.email is not null
  loop
    insert into public.notifications(user_id, type, title, body, link)
    select l.seller_id, 'marketplace_listing_expiring', 'Listing expiring soon',
           '"' || r.title || '" expires in 7 days. Renew it to keep it listed.',
           '/marketplace/my-listings'
      from public.marketplace_listings l where l.id = r.id;

    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', r.email,
      'templateKey', 'marketplace_listing_expiring',
      'variables', jsonb_build_object(
        'first_name', coalesce(split_part(r.full_name, ' ', 1), 'there'),
        'listing_title', r.title,
        'expires_on', to_char(r.expires_at, 'FMMon FMDD'),
        'listing_id', r.id::text
      ),
      'idempotencyKey', 'listing-expiring/' || r.id
    ));

    update public.marketplace_listings set expiry_warned_at = now() where id = r.id;
  end loop;

  -- 2. Expire. Deliberately does NOT touch 'sold' or 'deleted', and never sets
  --    'sold' -- see the header of 20260909200100.
  update public.marketplace_listings
     set status = 'expired'
   where status in ('active', 'pending')
     and expires_at is not null
     and expires_at <= now();
  get diagnostics v_expired = row_count;

  return v_expired;
end;
$function$;

update public.email_templates
   set variables = array['first_name', 'listing_title', 'expires_on', 'listing_id'],
       html_body = '<p>Hi {{first_name}},</p>'
         || '<p>Your listing <strong>{{listing_title}}</strong> expires on {{expires_on}}. After that it stops showing in the Marketplace.</p>'
         || '<p>Still for sale? Renew it for another 30 days. Sold it? Let buyers know.</p>'
         || '<p style="margin:24px 0 12px;"><a href="https://pickleballapp.app/marketplace/{{listing_id}}?action=renew" style="background:#C9A84C;color:#0A1228;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Renew for 30 days</a></p>'
         || '<p style="margin:0;"><a href="https://pickleballapp.app/marketplace/{{listing_id}}?action=sold" style="background:#FFFFFF;color:#0A1228;padding:12px 26px;border-radius:999px;border:2px solid #0A1228;text-decoration:none;font-weight:700;display:inline-block;">I sold it</a></p>',
       updated_at = now()
 where key = 'marketplace_listing_expiring';
