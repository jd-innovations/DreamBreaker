-- Seller tip for a listing that hasn't sold (owner-approved 2026-10-04).
--
-- One honest, tailored line for the seller, from signals we already have:
--
--   saves          marketplace_saved_listings rows
--   conversations  buyer conversations about THIS listing. There is no listing
--                  link on a conversation; the app opens one with a fixed
--                  message ("…interested in your listing: <title> — …" or
--                  "…offer $X for your <title>."), so these are counted: a
--                  buyer message containing either phrase with this title, sent
--                  after the listing was posted. An approximation, good enough
--                  for a tip, never shown as an exact figure of interest.
--   comparables    other listings of the same brand + model (active, pending
--                  or sold, last 180 days). The range shown is their middle
--                  half (25th–75th percentile of ASKING prices) and only with
--                  at least 3 of them. Asking, not selling: we don't know
--                  final sale prices, so the copy says "list for".
--
-- kind:  conversations  people asked; reply / counter to close
--        saved          saved but nobody asked; a price drop pings the savers
--                       (the existing price-drop push)
--        priced         no interest; shows the comparable range
--        generic        no interest and too few comparables
--
-- suggested_cents: the comparable median when the price is above it, else 10%
-- off; rounded down to $5; never above the current price.

create or replace function private.listing_insight(p_listing_id uuid)
returns table (
  kind text,
  saves integer,
  conversations integer,
  comp_count integer,
  comp_low_cents integer,
  comp_high_cents integer,
  comp_median_cents integer,
  asking_cents integer,
  suggested_cents integer
)
language sql stable set search_path = '' as $$
  with l as (
    select * from public.marketplace_listings where id = p_listing_id
  ),
  s as (
    select count(*)::integer n from public.marketplace_saved_listings sl, l where sl.listing_id = l.id
  ),
  c as (
    select count(distinct m.conversation_id)::integer n
      from l
      join public.conversations cv on l.seller_id in (cv.participant_a, cv.participant_b)
      join public.messages m on m.conversation_id = cv.id
     where m.sender_id <> l.seller_id
       and m.created_at >= l.created_at
       and (position(lower('your listing: ' || l.title) in lower(m.body)) > 0
            or position(lower('for your ' || l.title) in lower(m.body)) > 0)
  ),
  comp as (
    select count(*)::integer n,
           percentile_cont(0.25) within group (order by o.asking_price_cents) p25,
           percentile_cont(0.5)  within group (order by o.asking_price_cents) p50,
           percentile_cont(0.75) within group (order by o.asking_price_cents) p75
      from public.marketplace_listings o, l
     where o.id <> l.id
       and o.removed_at is null
       and o.status::text in ('active', 'pending', 'sold')
       and o.created_at > now() - interval '180 days'
       and lower(btrim(o.brand)) = lower(btrim(l.brand))
       and nullif(btrim(l.model), '') is not null
       and lower(btrim(o.model)) = lower(btrim(l.model))
  )
  select
    case when c.n > 0 then 'conversations'
         when s.n > 0 then 'saved'
         when comp.n >= 3 then 'priced'
         else 'generic' end,
    s.n, c.n, comp.n,
    case when comp.n >= 3 then comp.p25::integer end,
    case when comp.n >= 3 then comp.p75::integer end,
    case when comp.n >= 3 then comp.p50::integer end,
    l.asking_price_cents,
    least(
      l.asking_price_cents,
      (floor((case when comp.n >= 3 and l.asking_price_cents > comp.p50 then comp.p50
                   else l.asking_price_cents * 0.9 end) / 500) * 500)::integer
    )
  from l, s, c, comp;
$$;

revoke all on function private.listing_insight(uuid) from public;

-- For the app: the seller only.
create or replace function public.listing_seller_insight(p_listing_id uuid)
returns table (
  kind text,
  saves integer,
  conversations integer,
  comp_count integer,
  comp_low_cents integer,
  comp_high_cents integer,
  comp_median_cents integer,
  asking_cents integer,
  suggested_cents integer
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not exists (
    select 1 from public.marketplace_listings where id = p_listing_id and seller_id = auth.uid()
  ) then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  return query select * from private.listing_insight(p_listing_id);
end;
$$;

revoke all on function public.listing_seller_insight(uuid) from public, anon;
grant execute on function public.listing_seller_insight(uuid) to authenticated;

-- ─── The expiring email carries the tip ──────────────────────────────────────

create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_expired integer;
  r         record;
  i         record;
  v_url     text;
  v_tip     text;
  v_label   text;
  v_href    text;
  v_dollars text;
begin
  -- 1. Warn, 7 days out, once per cycle. Done BEFORE expiring so a listing
  --    always gets its warning even if both windows are crossed in one run.
  for r in
    select l.id, l.title, l.brand, l.model, l.expires_at, p.email, p.full_name
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

    select * into i from private.listing_insight(r.id);
    v_url := 'https://pickleballapp.app/marketplace/' || r.id::text;

    if i.kind = 'conversations' then
      v_tip := 'You had ' || i.conversations || case when i.conversations = 1 then ' conversation' else ' conversations' end
            || ' about it. Reply or make a counter-offer to close the sale.';
      v_label := 'Open messages';
      v_href := v_url || '?action=messages';
    elsif i.kind = 'saved' then
      v_tip := case when i.saves = 1 then '1 person saved your paddle. Drop the price and we''ll notify them instantly.'
                    else i.saves || ' people saved your paddle. Drop the price and we''ll notify all ' || i.saves || ' instantly.' end;
      v_label := 'Lower the price';
      v_href := v_url || '?action=price';
    elsif i.kind = 'priced' then
      v_dollars := '$' || (i.comp_low_cents / 100) || '–$' || (i.comp_high_cents / 100);
      if i.asking_cents > i.comp_high_cents then
        v_tip := 'It hasn''t caught attention yet. Similar ' || r.brand || ' ' || r.model || ' paddles list for '
              || v_dollars || ' (yours is $' || (i.asking_cents / 100) || '). A lower price or better photos usually help.';
        v_label := 'Lower the price';
        v_href := v_url || '?action=price';
      else
        v_tip := 'Your price is in line with similar ' || r.brand || ' ' || r.model || ' paddles (' || v_dollars
              || '). Fresh photos or a few words on its condition usually help.';
        v_label := 'Update my listing';
        v_href := v_url || '?action=edit';
      end if;
    else
      v_tip := 'It hasn''t caught attention yet. A sharper price or adding photos usually helps.';
      v_label := 'Lower the price';
      v_href := v_url || '?action=price';
    end if;

    perform public.fn_send_transactional_email(jsonb_build_object(
      'to', r.email,
      'templateKey', 'marketplace_listing_expiring',
      'variables', jsonb_build_object(
        'first_name', coalesce(split_part(r.full_name, ' ', 1), 'there'),
        'listing_title', r.title,
        'expires_on', to_char(r.expires_at, 'FMMon FMDD'),
        'listing_id', r.id::text,
        'tip_text', v_tip,
        'tip_cta_label', v_label,
        'tip_cta_url', v_href
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
   set variables = array['first_name', 'listing_title', 'expires_on', 'listing_id', 'tip_text', 'tip_cta_label', 'tip_cta_url'],
       html_body = '<p>Hi {{first_name}},</p>'
         || '<p>Your listing <strong>{{listing_title}}</strong> expires on {{expires_on}}. After that it stops showing in the Marketplace.</p>'
         || '<div style="background:#FDF6E7;border-radius:12px;padding:16px 18px;margin:20px 0;">'
         ||   '<p style="margin:0 0 10px;color:#0A1228;">{{tip_text}}</p>'
         ||   '<p style="margin:0;"><a href="{{tip_cta_url}}" style="color:#7A6428;font-weight:700;text-decoration:none;">{{tip_cta_label}} &rarr;</a></p>'
         || '</div>'
         || '<p>Still for sale? Renew it for another 30 days. Sold it? Let buyers know.</p>'
         || '<p style="margin:24px 0 12px;"><a href="https://pickleballapp.app/marketplace/{{listing_id}}?action=renew" style="background:#C9A84C;color:#0A1228;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block;">Renew for 30 days</a></p>'
         || '<p style="margin:0 0 16px;"><a href="https://pickleballapp.app/marketplace/{{listing_id}}?action=sold" style="background:#FFFFFF;color:#0A1228;padding:12px 26px;border-radius:999px;border:2px solid #0A1228;text-decoration:none;font-weight:700;display:inline-block;">I sold it</a></p>'
         || '<p style="font-size:13px;color:#5B6B8C;margin:0;">These open the Pickleball App on your phone.</p>',
       updated_at = now()
 where key = 'marketplace_listing_expiring';
