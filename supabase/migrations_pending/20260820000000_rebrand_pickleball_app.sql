-- Rebrand to "Pickleball App" — the production rows the repo cannot reach.
--
-- Context: docs/REBRAND_PICKLEBALL_APP.md, Step 4.
--
-- Editing the seed migrations that originally INSERTed these rows changes only
-- what a fresh database would contain. Production already has the rows, and
-- they are admin-editable, so this is a forward UPDATE rather than a re-seed.
--
-- Written as `replace()` over the current values rather than as literal
-- rewrites, so it stays correct if an admin has edited a template in the
-- meantime and so it is idempotent — running it twice is a no-op.
--
-- HELD OUT OF THE REPLAY PATH per item 2.1: not yet applied to production.
-- Apply deliberately (MCP apply_migration or the SQL editor), then
-- `supabase migration repair --status applied 20260820000000`.

begin;

-- ── 1. Transactional email templates ──────────────────────────────────────
-- Seeded by 20260807000000_transactional_email.sql and
-- 20260807010000_waitlist_sweeper_templates.sql. The old brand appears in the
-- visible email footer, in subject lines, and in one body sentence.
--
-- Verified read-only against production 2026-08-20: 8 rows match, and the
-- function body below is byte-identical to production's (md5
-- 7e10f0d70b3a92267dcdb229f517b337, 1732 chars) once the scheme is restored,
-- so this changes the scheme literal and nothing else.

update public.email_templates
set
  subject   = replace(replace(subject,   'DreamBreakerPB', 'Pickleball App'), 'DreamBreaker', 'Pickleball App'),
  html_body = replace(replace(html_body, 'DreamBreakerPB', 'Pickleball App'), 'DreamBreaker', 'Pickleball App'),
  name      = replace(replace(name,      'DreamBreakerPB', 'Pickleball App'), 'DreamBreaker', 'Pickleball App')
where subject   like '%DreamBreaker%'
   or html_body like '%DreamBreaker%'
   or name      like '%DreamBreaker%';

-- ── 2. Wallet partner row ─────────────────────────────────────────────────
-- The `premium-membership` partner is us. Its name and description are shown
-- in the wallet UI and on redemption sheets. 1 row in production.

update public.wallet_partners
set
  name        = replace(replace(name,        'DreamBreaker PB', 'Pickleball App'), 'DreamBreaker', 'Pickleball App'),
  description = replace(replace(description, 'DreamBreaker PB', 'Pickleball App'), 'DreamBreaker', 'Pickleball App')
where slug = 'premium-membership';

-- ── 3. Claim deep-link scheme ─────────────────────────────────────────────
-- create_personal_match_claim_link() builds the URL a guest player receives to
-- claim their match history. It hardcodes the custom scheme, so the app-side
-- rename to `pickleballapp://` is incomplete without this.
--
-- IMPORTANT: any claim link already sent under `dreambreaker://` stops opening
-- the app once this lands. Existing rows in personal_match_claims are not
-- rewritten — the token is still valid, only the scheme in the delivered URL
-- is stale. Verified acceptable because the app has never been published.
--
-- Re-verify against pg_proc before applying if time has passed since 2026-08-20.

-- Extracted verbatim from the production baseline
-- (20260725000000_baseline_from_prod.sql) with the scheme literal changed and
-- nothing else. Do not hand-write this body: it carries #variable_conflict,
-- a revoke-then-regenerate loop, and specific error codes the app depends on.
CREATE OR REPLACE FUNCTION "public"."create_personal_match_claim_link"("p_guest_share_id" "uuid") RETURNS TABLE("claim_id" "uuid", "guest_share_id" "uuid", "token" "text", "claim_url" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_share public.personal_guest_shares;
  v_token text;
  v_hash text;
  v_claim public.personal_match_claims;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_share
    from public.personal_guest_shares share
   where share.id = p_guest_share_id;

  if not found then
    raise exception 'guest_share_not_found' using errcode = 'P0001';
  end if;

  if v_share.created_by <> auth.uid() then
    raise exception 'not_guest_share_creator' using errcode = 'P0001';
  end if;

  if v_share.share_status = 'claimed' then
    raise exception 'guest_share_already_claimed' using errcode = 'P0001';
  end if;

  update public.personal_match_claims claim
     set status = 'revoked', revoked_at = coalesce(claim.revoked_at, now())
   where claim.guest_share_id = p_guest_share_id
     and claim.status = 'pending';

  loop
    v_token := public.personal_match_claim_token();
    v_hash := public.personal_match_claim_hash(v_token);
    exit when not exists (select 1 from public.personal_match_claims claim where claim.token_hash = v_hash);
  end loop;

  insert into public.personal_match_claims (
    session_id,
    session_participant_id,
    guest_share_id,
    guest_player_id,
    created_by,
    token_hash,
    expires_at
  ) values (
    v_share.session_id,
    v_share.session_participant_id,
    v_share.id,
    v_share.guest_player_id,
    v_share.created_by,
    v_hash,
    now() + interval '30 days'
  ) returning * into v_claim;

  return query select
    v_claim.id::uuid,
    v_claim.guest_share_id::uuid,
    v_token::text,
    ('pickleballapp://claim/' || v_token)::text,
    v_claim.expires_at;
end;
$$;

commit;

-- ── Verification after applying ───────────────────────────────────────────
--   select count(*) from public.email_templates
--    where subject like '%DreamBreaker%' or html_body like '%DreamBreaker%';   -- expect 0
--   select name, description from public.wallet_partners
--    where slug = 'premium-membership';                                        -- expect "Pickleball App"
--   select prosrc like '%pickleballapp://claim/%'
--     from pg_proc where proname = 'create_personal_match_claim_link';          -- expect t
