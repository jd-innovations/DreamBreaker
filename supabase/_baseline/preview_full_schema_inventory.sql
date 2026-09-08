


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."bracket_type" AS ENUM (
    'single_elim',
    'double_elim',
    'round_robin',
    'round_robin_to_single_elim',
    'round_robin_to_double_elim'
);


ALTER TYPE "public"."bracket_type" OWNER TO "postgres";


CREATE TYPE "public"."director_status" AS ENUM (
    'pending',
    'approved',
    'suspended'
);


ALTER TYPE "public"."director_status" OWNER TO "postgres";


CREATE TYPE "public"."match_direction" AS ENUM (
    'like',
    'pass',
    'super'
);


ALTER TYPE "public"."match_direction" OWNER TO "postgres";


CREATE TYPE "public"."play_event_status" AS ENUM (
    'open',
    'full',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."play_event_status" OWNER TO "postgres";


CREATE TYPE "public"."play_event_type" AS ENUM (
    'round_robin',
    'mixer',
    'ladder',
    'open_play',
    'kings_court',
    'mini_tournament',
    'clinic'
);


ALTER TYPE "public"."play_event_type" OWNER TO "postgres";


CREATE TYPE "public"."registration_status" AS ENUM (
    'held',
    'registered',
    'checked_in',
    'withdrawn',
    'disqualified',
    'no_show',
    'substitute',
    'waitlisted',
    'waitlist_offered',
    'expired_hold'
);


ALTER TYPE "public"."registration_status" OWNER TO "postgres";


CREATE TYPE "public"."report_reason" AS ENUM (
    'spam_or_inappropriate',
    'harassment',
    'hate_speech',
    'impersonation',
    'other'
);


ALTER TYPE "public"."report_reason" OWNER TO "postgres";


CREATE TYPE "public"."report_status" AS ENUM (
    'pending',
    'reviewed',
    'actioned',
    'dismissed'
);


ALTER TYPE "public"."report_status" OWNER TO "postgres";


CREATE TYPE "public"."round_label" AS ENUM (
    'pool',
    'r64',
    'r32',
    'r16',
    'qf',
    'sf',
    'bronze',
    'final'
);


ALTER TYPE "public"."round_label" OWNER TO "postgres";


CREATE TYPE "public"."tournament_format" AS ENUM (
    'singles',
    'doubles',
    'mixed_doubles',
    'juniors'
);


ALTER TYPE "public"."tournament_format" OWNER TO "postgres";


CREATE TYPE "public"."tournament_status" AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'published',
    'open',
    'filling_fast',
    'registration_closed',
    'in_progress',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."tournament_status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'pending',
    'completed',
    'failed',
    'refunded'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


CREATE TYPE "public"."transaction_type" AS ENUM (
    'hold',
    'entry_balance',
    'full_entry',
    'refund',
    'director_payout',
    'platform_fee'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'player',
    'director',
    'player_director',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."personal_session_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "guest_player_id" "uuid",
    "display_name_snapshot" "text" NOT NULL,
    "estimated_skill" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_session_participants_name_not_blank" CHECK (("btrim"("display_name_snapshot") <> ''::"text")),
    CONSTRAINT "personal_session_participants_one_identity" CHECK (((("profile_id" IS NOT NULL) AND ("guest_player_id" IS NULL)) OR (("profile_id" IS NULL) AND ("guest_player_id" IS NOT NULL))))
);


ALTER TABLE "public"."personal_session_participants" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_personal_session_guest_participant"("p_session_id" "uuid", "p_display_name" "text", "p_estimated_skill" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text") RETURNS "public"."personal_session_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.personal_sessions;
  v_guest public.personal_guest_players;
  v_row public.personal_session_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'guest_name_required' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'session_not_editable' using errcode = 'P0001';
  end if;

  insert into public.personal_guest_players (
    created_by, display_name, phone, email, estimated_skill
  ) values (
    auth.uid(), btrim(p_display_name), nullif(btrim(coalesce(p_phone, '')), ''), nullif(lower(btrim(coalesce(p_email, ''))), ''), nullif(btrim(coalesce(p_estimated_skill, '')), '')
  )
  returning * into v_guest;

  insert into public.personal_session_participants (
    session_id, guest_player_id, display_name_snapshot, estimated_skill, created_by
  ) values (
    p_session_id, v_guest.id, v_guest.display_name, v_guest.estimated_skill, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."add_personal_session_guest_participant"("p_session_id" "uuid", "p_display_name" "text", "p_estimated_skill" "text", "p_phone" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_personal_session_registered_participant"("p_session_id" "uuid", "p_profile_id" "uuid") RETURNS "public"."personal_session_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.personal_sessions;
  v_profile public.profiles;
  v_row public.personal_session_participants;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'session_not_editable' using errcode = 'P0001';
  end if;

  select * into v_profile
    from public.profiles
   where id = p_profile_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  insert into public.personal_session_participants (
    session_id, profile_id, display_name_snapshot, estimated_skill, created_by
  ) values (
    p_session_id,
    p_profile_id,
    coalesce(nullif(btrim(v_profile.full_name), ''), v_profile.email, 'Player'),
    coalesce(v_profile.self_rating, v_profile.skill_level, v_profile.dupr::text),
    auth.uid()
  )
  on conflict (session_id, profile_id) where profile_id is not null
  do update set
    display_name_snapshot = excluded.display_name_snapshot,
    estimated_skill = excluded.estimated_skill
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."add_personal_session_registered_participant"("p_session_id" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_tournament"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.registrations set replaces_registration_id = null where tournament_id = p_tournament_id;
  delete from public.transactions where tournament_id = p_tournament_id;
  delete from public.registrations where tournament_id = p_tournament_id;
  delete from public.dupr_history where tournament_id = p_tournament_id;
  delete from public.tournaments where id = p_tournament_id;
end;
$$;


ALTER FUNCTION "public"."admin_delete_tournament"("p_tournament_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_to_be_director"() RETURNS "public"."director_status"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current director_status;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select director_status into v_current from public.profiles where id = auth.uid();

  if v_current = 'suspended' then
    raise exception 'Your director access was suspended. Contact support to be reinstated.';
  end if;

  if v_current is null then
    update public.profiles
       set is_director = true,
           director_status = 'pending',
           updated_at = now()
     where id = auth.uid();
    v_current := 'pending';
  end if;

  return v_current;
end;
$$;


ALTER FUNCTION "public"."apply_to_be_director"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_personal_match"("p_token" "text") RETURNS TABLE("status" "text", "reason" "text", "session_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_hash text;
  v_claim public.personal_match_claims;
  v_participant public.personal_session_participants;
  v_session public.personal_sessions;
  v_claimer_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_token is null or length(btrim(p_token)) < 20 then
    return query select 'invalid'::text, 'invalid_token'::text, null::uuid;
    return;
  end if;

  v_hash := public.personal_match_claim_hash(btrim(p_token));

  select * into v_claim
    from public.personal_match_claims c
   where c.token_hash = v_hash
   for update;

  if not found then
    return query select 'invalid'::text, 'invalid_token'::text, null::uuid;
    return;
  end if;

  if v_claim.status = 'claimed' then
    if v_claim.claimed_by_profile_id = auth.uid() then
      return query select 'claimed'::text, null::text, v_claim.session_id;
    else
      return query select 'already_claimed'::text, 'already_claimed'::text, v_claim.session_id;
    end if;
    return;
  end if;

  if v_claim.status = 'revoked' or v_claim.revoked_at is not null then
    return query select 'invalid'::text, 'revoked'::text, null::uuid;
    return;
  end if;

  if v_claim.expires_at <= now() then
    update public.personal_match_claims set status = 'expired' where id = v_claim.id and status = 'pending';
    update public.personal_guest_shares set share_status = 'expired' where id = v_claim.guest_share_id and share_status <> 'claimed';
    return query select 'expired'::text, 'expired'::text, v_claim.session_id;
    return;
  end if;

  select * into v_participant
    from public.personal_session_participants p
   where p.id = v_claim.session_participant_id
   for update;

  if not found or v_participant.session_id <> v_claim.session_id or v_participant.guest_player_id <> v_claim.guest_player_id then
    return query select 'invalid'::text, 'participant_mismatch'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.personal_session_participants p
     where p.session_id = v_claim.session_id
       and p.profile_id = auth.uid()
       and p.id <> v_claim.session_participant_id
  ) then
    return query select 'invalid'::text, 'already_registered_participant'::text, v_claim.session_id;
    return;
  end if;

  select * into v_session from public.personal_sessions where id = v_claim.session_id;

  update public.personal_session_participants
     set profile_id = auth.uid(),
         guest_player_id = null
   where id = v_claim.session_participant_id;

  update public.personal_match_claims
     set status = 'claimed',
         claimed_by_profile_id = auth.uid(),
         claimed_at = coalesce(claimed_at, now())
   where id = v_claim.id;

  update public.personal_guest_shares
     set share_status = 'claimed'
   where id = v_claim.guest_share_id;

  select full_name into v_claimer_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  values (
    v_session.created_by,
    'match_claimed',
    'Match claimed',
    coalesce(v_claimer_name, v_participant.display_name_snapshot, 'A player') || ' claimed the match you recorded.',
    '/(tabs)/stats',
    'personal-match-claimed:' || v_claim.id::text || ':' || v_session.created_by::text
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return query select 'claimed'::text, null::text, v_claim.session_id;
end;
$$;


ALTER FUNCTION "public"."claim_personal_match"("p_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "facility_id" "uuid",
    "played_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "format" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "indoor_outdoor" "text",
    "notes" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_sessions_completed_at_status" CHECK (((("status" = 'completed'::"text") AND ("completed_at" IS NOT NULL)) OR ("status" <> 'completed'::"text"))),
    CONSTRAINT "personal_sessions_format_check" CHECK (("format" = ANY (ARRAY['singles'::"text", 'doubles'::"text"]))),
    CONSTRAINT "personal_sessions_indoor_outdoor_check" CHECK (("indoor_outdoor" = ANY (ARRAY['indoor'::"text", 'outdoor'::"text", 'mixed'::"text", 'unknown'::"text"]))),
    CONSTRAINT "personal_sessions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."personal_sessions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_personal_session"("p_session_id" "uuid", "p_facility_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text", "p_indoor_outdoor" "text" DEFAULT NULL::"text") RETURNS "public"."personal_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.personal_sessions;
  v_completed_games integer;
  v_participants integer;
  v_expected integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'session_cancelled' using errcode = 'P0001';
  end if;

  select count(*) into v_completed_games
    from public.personal_games
   where session_id = p_session_id and status = 'completed';

  if v_completed_games < 1 then
    raise exception 'completed_game_required' using errcode = 'P0001';
  end if;

  select count(*) into v_participants
    from public.personal_session_participants
   where session_id = p_session_id;

  v_expected := public.personal_session_expected_players(v_session.format);
  if v_participants <> v_expected then
    raise exception 'invalid_session_participant_count' using errcode = 'P0001';
  end if;

  if p_indoor_outdoor is not null and p_indoor_outdoor not in ('indoor', 'outdoor', 'mixed', 'unknown') then
    raise exception 'invalid_indoor_outdoor' using errcode = 'P0001';
  end if;

  update public.personal_sessions
     set status = 'completed',
         facility_id = coalesce(p_facility_id, facility_id),
         notes = nullif(btrim(coalesce(p_notes, notes, '')), ''),
         indoor_outdoor = coalesce(p_indoor_outdoor, indoor_outdoor),
         completed_at = coalesce(completed_at, now())
   where id = p_session_id
   returning * into v_session;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."complete_personal_session"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_personal_session_with_distribution"("p_session_id" "uuid", "p_facility_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text", "p_indoor_outdoor" "text" DEFAULT NULL::"text") RETURNS TABLE("session_participant_id" "uuid", "profile_id" "uuid", "guest_player_id" "uuid", "display_name" "text", "phone" "text", "participant_kind" "text", "delivery_status" "text", "guest_share_id" "uuid", "claim_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
declare
  v_session public.personal_sessions;
  v_recorder_name text;
  v_facility_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  v_session := public.complete_personal_session(p_session_id, p_facility_id, p_notes, p_indoor_outdoor);

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  select prof.full_name into v_recorder_name
    from public.profiles prof
   where prof.id = v_session.created_by;

  select fac.name into v_facility_name
    from public.facilities fac
   where fac.id = v_session.facility_id;

  insert into public.notifications (user_id, type, title, body, link, idempotency_key)
  select
    participant.profile_id,
    'match_recorded',
    'Match recorded',
    coalesce(v_recorder_name, 'A player') || ' added your match at ' || coalesce(v_facility_name, 'a pickleball session') || '.',
    '/(tabs)/stats',
    'personal-match-recorded:' || p_session_id::text || ':' || participant.profile_id::text
  from public.personal_session_participants participant
  where participant.session_id = p_session_id
    and participant.profile_id is not null
    and participant.profile_id <> v_session.created_by
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  insert into public.personal_guest_shares (
    session_id,
    session_participant_id,
    guest_player_id,
    created_by,
    share_status,
    share_channel
  )
  select
    participant.session_id,
    participant.id,
    participant.guest_player_id,
    v_session.created_by,
    'not_shared',
    'sms'
  from public.personal_session_participants participant
  where participant.session_id = p_session_id
    and participant.guest_player_id is not null
  on conflict (session_participant_id) do nothing;

  perform public.ensure_personal_match_claims_for_session(p_session_id);

  return query
  select
    participant.id::uuid as session_participant_id,
    participant.profile_id::uuid as profile_id,
    participant.guest_player_id::uuid as guest_player_id,
    participant.display_name_snapshot::text as display_name,
    guest.phone::text as phone,
    (case when participant.profile_id is not null then 'registered' else 'guest' end)::text as participant_kind,
    (case
      when participant.profile_id = v_session.created_by then 'recorded_by_you'
      when participant.profile_id is not null then 'in_app_shared'
      when share.share_status = 'claimed' then 'claimed'
      when share.share_status = 'share_initiated' then 'share_initiated'
      else 'not_shared'
    end)::text as delivery_status,
    share.id::uuid as guest_share_id,
    claim.status::text as claim_status
  from public.personal_session_participants participant
  left join public.personal_guest_players guest on guest.id = participant.guest_player_id
  left join public.personal_guest_shares share on share.session_participant_id = participant.id
  left join lateral (
    select c.status from public.personal_match_claims c
     where c.guest_share_id = share.id
     order by c.created_at desc
     limit 1
  ) claim on true
  where participant.session_id = p_session_id
  order by
    case when participant.profile_id = v_session.created_by then 0 when participant.profile_id is not null then 1 else 2 end,
    participant.created_at;
end;
$$;


ALTER FUNCTION "public"."complete_personal_session_with_distribution"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_partner_match_on_mutual_like"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_a uuid;
  v_b uuid;
begin
  -- only act on 'like' kind
  if new.kind <> 'like' then
    return new;
  end if;

  -- check whether the recipient already liked the sender
  if not exists (
    select 1 from public.partner_likes
    where from_user_id = new.to_user_id
      and to_user_id   = new.from_user_id
      and kind         = 'like'
  ) then
    return new;
  end if;

  -- normalise pair
  if new.from_user_id < new.to_user_id then
    v_a := new.from_user_id;
    v_b := new.to_user_id;
  else
    v_a := new.to_user_id;
    v_b := new.from_user_id;
  end if;

  insert into public.partner_matches (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_partner_match_on_mutual_like"() OWNER TO "postgres";


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
    ('dreambreaker://claim/' || v_token)::text,
    v_claim.expires_at;
end;
$$;


ALTER FUNCTION "public"."create_personal_match_claim_link"("p_guest_share_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_personal_session"("p_format" "text", "p_facility_id" "uuid" DEFAULT NULL::"uuid", "p_played_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_indoor_outdoor" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."personal_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.personal_sessions;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_format not in ('singles', 'doubles') then
    raise exception 'invalid_session_format' using errcode = 'P0001';
  end if;

  if p_indoor_outdoor is not null and p_indoor_outdoor not in ('indoor', 'outdoor', 'mixed', 'unknown') then
    raise exception 'invalid_indoor_outdoor' using errcode = 'P0001';
  end if;

  insert into public.personal_sessions (
    created_by,
    facility_id,
    played_at,
    format,
    indoor_outdoor,
    notes
  ) values (
    auth.uid(),
    p_facility_id,
    coalesce(p_played_at, now()),
    p_format,
    p_indoor_outdoor,
    p_notes
  )
  returning * into v_session;

  return v_session;
end;
$$;


ALTER FUNCTION "public"."create_personal_session"("p_format" "text", "p_facility_id" "uuid", "p_played_at" timestamp with time zone, "p_indoor_outdoor" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_director_status"() RETURNS "public"."director_status"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select director_status from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_director_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_is_director"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select is_director from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_user_is_director"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select role from public.profiles where id = auth.uid(); $$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_game_participant_session"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_game_session uuid;
  v_participant_session uuid;
begin
  select session_id into v_game_session
    from public.personal_games
   where id = new.game_id;

  select session_id into v_participant_session
    from public.personal_session_participants
   where id = new.session_participant_id;

  if v_game_session is null or v_participant_session is null or v_game_session <> v_participant_session then
    raise exception 'game_participant_session_mismatch'
      using errcode = 'P0001', hint = 'Game participants must belong to the same personal session as the game.';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_game_participant_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_personal_match_claims_for_session"("p_session_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_share public.personal_guest_shares;
  v_token text;
  v_hash text;
begin
  for v_share in
    select * from public.personal_guest_shares
     where session_id = p_session_id
       and share_status <> 'claimed'
  loop
    if not exists (
      select 1 from public.personal_match_claims c
       where c.guest_share_id = v_share.id
         and c.status = 'pending'
         and c.expires_at > now()
    ) then
      loop
        v_token := public.personal_match_claim_token();
        v_hash := public.personal_match_claim_hash(v_token);
        exit when not exists (select 1 from public.personal_match_claims c where c.token_hash = v_hash);
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
      );
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."ensure_personal_match_claims_for_session"("p_session_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."par_game_processing" (
    "game_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "eligibility_reason" "text",
    "verification_level" "text",
    "algorithm_version" "text",
    "processed_at" timestamp with time zone,
    "last_evaluated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "par_game_processing_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'pending_participant_claim'::"text", 'eligible'::"text", 'processing'::"text", 'processed'::"text", 'excluded'::"text", 'reversed'::"text", 'failed'::"text"]))),
    CONSTRAINT "par_game_processing_verification" CHECK ((("verification_level" IS NULL) OR ("verification_level" = ANY (ARRAY['fully_verified'::"text", 'participant_verified'::"text", 'estimated'::"text", 'disputed'::"text", 'excluded'::"text"]))))
);


ALTER TABLE "public"."par_game_processing" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluate_personal_game_par_eligibility"("p_game_id" "uuid") RETURNS "public"."par_game_processing"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_game public.personal_games;
  v_session public.personal_sessions;
  v_algo public.par_algorithm_versions;
  v_status text := 'eligible';
  v_reason text := null;
  v_verification text := 'participant_verified';
  v_expected_total integer;
  v_expected_team integer;
  v_total integer;
  v_team_one integer;
  v_team_two integer;
  v_unclaimed integer;
  v_duplicate_slots integer;
  v_out public.par_game_processing;
begin
  select * into v_algo from public.par_algorithm_versions algo where algo.is_active order by algo.activated_at desc nulls last limit 1;
  select * into v_game from public.personal_games game where game.id = p_game_id;
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  select * into v_session from public.personal_sessions session where session.id = v_game.session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;

  if auth.uid() is not null and not public.is_personal_session_visible(v_session.id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if v_session.status <> 'completed' then
    v_status := 'pending'; v_reason := 'session_not_completed'; v_verification := null;
  elsif v_game.status <> 'completed' then
    v_status := 'pending'; v_reason := 'game_not_completed'; v_verification := null;
  elsif v_game.team_one_score is null or v_game.team_two_score is null or v_game.team_one_score < 0 or v_game.team_two_score < 0 then
    v_status := 'excluded'; v_reason := 'invalid_score'; v_verification := 'excluded';
  elsif v_game.team_one_score = v_game.team_two_score then
    v_status := 'excluded'; v_reason := 'tied_score'; v_verification := 'excluded';
  elsif v_game.winning_team is null or v_game.winning_team not in (1, 2)
     or v_game.winning_team <> (case when v_game.team_one_score > v_game.team_two_score then 1 else 2 end) then
    v_status := 'excluded'; v_reason := 'winner_mismatch'; v_verification := 'excluded';
  end if;

  if v_status = 'eligible' then
    v_expected_total := public.personal_session_expected_players(v_session.format);
    v_expected_team := v_expected_total / 2;
    select count(*) into v_total from public.personal_game_participants gp where gp.game_id = p_game_id;
    select count(*) into v_team_one from public.personal_game_participants gp where gp.game_id = p_game_id and gp.team_number = 1;
    select count(*) into v_team_two from public.personal_game_participants gp where gp.game_id = p_game_id and gp.team_number = 2;
    select count(*) into v_duplicate_slots from (
      select gp.session_participant_id from public.personal_game_participants gp
      where gp.game_id = p_game_id group by gp.session_participant_id having count(*) > 1
    ) dup;
    select count(*) into v_unclaimed
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is null;

    if v_total <> v_expected_total then
      v_status := 'excluded'; v_reason := 'invalid_participant_count'; v_verification := 'excluded';
    elsif v_team_one <> v_expected_team or v_team_two <> v_expected_team then
      v_status := 'excluded'; v_reason := 'invalid_team_count'; v_verification := 'excluded';
    elsif v_duplicate_slots > 0 then
      v_status := 'excluded'; v_reason := 'duplicate_participant_position'; v_verification := 'excluded';
    elsif exists (
      select 1
      from public.personal_game_participants gp
      join public.personal_games game on game.id = gp.game_id
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      where gp.game_id = p_game_id and sp.session_id <> game.session_id
    ) then
      v_status := 'excluded'; v_reason := 'participant_session_mismatch'; v_verification := 'excluded';
    elsif not exists (
      select 1
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is not null
    ) then
      v_status := 'excluded'; v_reason := 'no_registered_participants'; v_verification := 'excluded';
    elsif v_unclaimed > 0 then
      v_status := 'eligible'; v_reason := 'guest_estimated'; v_verification := 'estimated';
    end if;
  end if;

  insert into public.par_game_processing (
    game_id, session_id, status, eligibility_reason, verification_level, algorithm_version,
    processed_at, last_evaluated_at, error_message
  ) values (
    p_game_id, v_session.id, v_status, v_reason, v_verification, v_algo.version,
    null, now(), null
  )
  on conflict (game_id) do update set
    session_id = excluded.session_id,
    status = case when public.par_game_processing.status = 'processed' and excluded.status = 'eligible' then public.par_game_processing.status else excluded.status end,
    eligibility_reason = excluded.eligibility_reason,
    verification_level = excluded.verification_level,
    algorithm_version = excluded.algorithm_version,
    processed_at = case when public.par_game_processing.status = 'processed' and excluded.status = 'eligible' then public.par_game_processing.processed_at else null end,
    last_evaluated_at = now(),
    error_message = null
  returning * into v_out;

  return v_out;
end;
$$;


ALTER FUNCTION "public"."evaluate_personal_game_par_eligibility"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_holds"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE registrations SET status = 'withdrawn', updated_at = now()
    WHERE status = 'held' AND hold_expires_at < now()
    RETURNING tournament_id
  )
  UPDATE tournaments t
  SET spots_filled = GREATEST(0, t.spots_filled - sub.cnt)
  FROM (SELECT tournament_id, COUNT(*) AS cnt FROM expired GROUP BY tournament_id) sub
  WHERE t.id = sub.tournament_id;
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;


ALTER FUNCTION "public"."expire_stale_holds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_auto_tournament_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_pct numeric;
begin
  if new.status not in ('open', 'filling_fast') then return new; end if;
  if new.draw_size > 0 then
    v_pct := (new.spots_filled::numeric / new.draw_size::numeric) * 100;
    if v_pct >= 80 and new.status = 'open' then new.status := 'filling_fast';
    elsif v_pct < 80 and new.status = 'filling_fast' then new.status := 'open';
    end if;
  end if;
  return new;
end; $$;


ALTER FUNCTION "public"."fn_auto_tournament_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_enforce_play_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status play_event_status;
  v_max    integer;
  v_count  integer;
begin
  select status, max_players into v_status, v_max from public.play_events where id = new.event_id;
  if v_status is null then
    raise exception 'Play event % not found.', new.event_id using errcode = 'P0001';
  end if;
  if v_status in ('cancelled', 'completed') then
    raise exception 'This event is no longer accepting players.' using errcode = 'P0002';
  end if;
  select count(*) into v_count from public.play_participants where event_id = new.event_id;
  if v_count >= v_max then
    raise exception 'This event is full (% players).', v_max using errcode = 'P0003';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_enforce_play_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_enforce_registration_close"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_closes_at timestamptz; v_status tournament_status; v_is_sub boolean;
begin
  select registration_closes_at, status into v_closes_at, v_status from public.tournaments where id = new.tournament_id;
  v_is_sub := (new.replaces_registration_id is not null);
  if v_status in ('cancelled', 'completed') then raise exception 'Tournament % is % — registrations not accepted.', new.tournament_id, v_status using errcode = 'P0001'; end if;
  if not v_is_sub and v_closes_at is not null and now() > v_closes_at then raise exception 'Registration for tournament % closed at %.', new.tournament_id, v_closes_at using errcode = 'P0002'; end if;
  return new;
end; $$;


ALTER FUNCTION "public"."fn_enforce_registration_close"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_enforce_single_division"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if exists (select 1 from public.registrations where tournament_id = new.tournament_id and player_id = new.player_id and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000')) then
    raise exception 'Player % is already registered for tournament %.', new.player_id, new.tournament_id using errcode = 'P0003';
  end if;
  return new;
end; $$;


ALTER FUNCTION "public"."fn_enforce_single_division"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_generate_facility_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_base    text;
  v_slug    text;
  v_counter integer := 0;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := lower(
    regexp_replace(
      unaccent(new.name || ' ' || new.city || ' ' || new.state),
      '[^a-z0-9]+', '-', 'g'
    )
  );
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from public.facilities where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug    := v_base || '-' || v_counter;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_generate_facility_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_generate_play_event_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_base    text;
  v_slug    text;
  v_counter integer := 0;
begin
  if new.slug is not null then
    return new;
  end if;
  v_base := lower(regexp_replace(unaccent(new.name || ' ' || extract(year from new.event_date)::text), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from public.play_events where slug = v_slug) loop
    v_counter := v_counter + 1;
    v_slug := v_base || '-' || v_counter;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_generate_play_event_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_generate_tournament_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_base text; v_slug text; v_counter integer := 0;
begin
  if new.slug is not null then return new; end if;
  v_base := lower(regexp_replace(unaccent(new.name || ' ' || extract(year from new.event_date)::text), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  v_slug := v_base;
  while exists (select 1 from public.tournaments where slug = v_slug) loop
    v_counter := v_counter + 1; v_slug := v_base || '-' || v_counter;
  end loop;
  new.slug := v_slug;
  return new;
end; $$;


ALTER FUNCTION "public"."fn_generate_tournament_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role        user_role;
  v_is_director boolean;
begin
  v_role        := coalesce((new.raw_user_meta_data->>'role')::user_role, 'player');
  v_is_director := (v_role = 'director');

  insert into public.profiles (id, email, full_name, role, is_director, director_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_is_director,
    case when v_is_director then 'pending'::director_status else null end
  );

  update public.play_participants
     set claimed_by = new.id
   where lower(email) = lower(new.email)
     and claimed_by is null;

  return new;
end;
$$;


ALTER FUNCTION "public"."fn_handle_new_user"() OWNER TO "postgres";


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
    elsif NEW.director_status = 'suspended' then
      insert into public.notifications(user_id, type, title, body, link)
      values (NEW.id, 'director_suspended', 'Director access suspended',
              'Your director access has been suspended.', '/dashboard');
    end if;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."fn_notify_director_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_notify_registration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if NEW.player_id is not null and NEW.status in ('registered', 'checked_in') then
    insert into public.notifications(user_id, type, title, body, link)
    select NEW.player_id, 'registration_confirmed', 'Registration confirmed',
           'You''re registered for "' || t.name || '".', '/dashboard'
    from public.tournaments t where t.id = NEW.tournament_id;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."fn_notify_registration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_notify_tournament_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- Director: tournament approved & published
  if NEW.status = 'open' and OLD.status is distinct from 'open' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_published', 'Tournament approved',
            '"' || NEW.name || '" is now live and open for registration.', '/director');
  end if;

  -- Director: returned for changes (rejected)
  if NEW.status = 'draft' and OLD.status = 'pending_approval' then
    insert into public.notifications(user_id, type, title, body, link)
    values (NEW.director_id, 'tournament_rejected', 'Changes needed',
            coalesce('"' || NEW.name || '" was returned: ' || NEW.rejected_reason,
                     '"' || NEW.name || '" was returned for changes.'), '/director');
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


ALTER FUNCTION "public"."fn_notify_tournament_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."fn_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_facility_coords"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.coords := ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)::geography;
  return new;
end;
$$;


ALTER FUNCTION "public"."fn_sync_facility_coords"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_play_event_full"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
  v_max      integer;
  v_status   play_event_status;
  v_count    integer;
begin
  select max_players, status into v_max, v_status from public.play_events where id = v_event_id;
  if v_status not in ('open', 'full') then
    return coalesce(new, old);
  end if;
  select count(*) into v_count from public.play_participants where event_id = v_event_id;
  if v_count >= v_max and v_status = 'open' then
    update public.play_events set status = 'full' where id = v_event_id;
  elsif v_count < v_max and v_status = 'full' then
    update public.play_events set status = 'open' where id = v_event_id;
  end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."fn_sync_play_event_full"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_spots_filled"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_active_statuses registration_status[] := array['held', 'registered', 'checked_in', 'substitute'];
  v_old_active boolean; v_new_active boolean;
begin
  if TG_OP = 'INSERT' then
    if new.status = any(v_active_statuses) then
      update public.tournaments set spots_filled = spots_filled + 1 where id = new.tournament_id;
      if new.division_id is not null then update public.divisions set spots_filled = spots_filled + 1 where id = new.division_id; end if;
    end if;
    return new;
  elsif TG_OP = 'UPDATE' then
    v_old_active := (old.status = any(v_active_statuses));
    v_new_active := (new.status = any(v_active_statuses));
    if v_old_active and not v_new_active then
      update public.tournaments set spots_filled = greatest(0, spots_filled - 1) where id = new.tournament_id;
      if new.division_id is not null then update public.divisions set spots_filled = greatest(0, spots_filled - 1) where id = new.division_id; end if;
    elsif not v_old_active and v_new_active then
      update public.tournaments set spots_filled = spots_filled + 1 where id = new.tournament_id;
      if new.division_id is not null then update public.divisions set spots_filled = spots_filled + 1 where id = new.division_id; end if;
    end if;
    return new;
  elsif TG_OP = 'DELETE' then
    if old.status = any(v_active_statuses) then
      update public.tournaments set spots_filled = greatest(0, spots_filled - 1) where id = old.tournament_id;
      if old.division_id is not null then update public.divisions set spots_filled = greatest(0, spots_filled - 1) where id = old.division_id; end if;
    end if;
    return old;
  end if;
end; $$;


ALTER FUNCTION "public"."fn_sync_spots_filled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_update_conversation_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin update public.conversations set last_message_at = new.created_at where id = new.conversation_id; return new; end; $$;


ALTER FUNCTION "public"."fn_update_conversation_last_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_dynamic_stories"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
begin
  delete from public.dynamic_stories where expires_at < now();

  insert into public.dynamic_stories (
    story_type, title, subtitle, slides, cta_label, cta_route,
    source_type, source_id, priority_score, expires_at
  )
  select
    'tournament',
    t.name,
    'Tournament registration',
    jsonb_build_array(
      jsonb_build_object(
        'headline', t.name || ' is filling up',
        'subheadline', to_char(t.event_date, 'FMMonth FMDD'),
        'body', coalesce(t.spots_filled, 0) || ' of ' || coalesce(t.draw_size, 0) || ' spots filled'
      ),
      jsonb_build_object(
        'headline', case
          when t.registration_closes_at is not null and t.registration_closes_at < now() + interval '48 hours'
            then 'Registration closes soon'
          else 'Registration is open'
        end,
        'metadata', case
          when t.registration_closes_at is not null
            then 'Closes ' || to_char(t.registration_closes_at, 'FMMonth FMDD, HH12:MI AM')
          else null
        end
      ),
      jsonb_build_object(
        'headline', greatest(coalesce(t.draw_size, 0) - coalesce(t.spots_filled, 0), 0) || ' spots remain',
        'body', 'Near your area'
      )
    ),
    'Register',
    '/tournament/' || t.id,
    'tournament',
    t.id,
    (case
      when t.registration_closes_at is not null and t.registration_closes_at < now() + interval '48 hours' then 50
      else 10
    end)
    + (case
      when t.draw_size > 0 and (t.draw_size - coalesce(t.spots_filled, 0)) <= 5 then 30
      else 0
    end),
    least(coalesce(t.registration_closes_at, now() + interval '24 hours'), now() + interval '24 hours')
  from public.tournaments t
  where t.status in ('open', 'filling_fast')
    and (t.registration_closes_at is null or t.registration_closes_at > now())
    and (t.draw_size is null or t.draw_size = 0 or coalesce(t.spots_filled, 0) < t.draw_size)
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do update set
    title = excluded.title,
    slides = excluded.slides,
    priority_score = excluded.priority_score,
    expires_at = excluded.expires_at;

  insert into public.dynamic_stories (
    story_type, title, subtitle, slides, cta_label, cta_route,
    source_type, source_id, priority_score, expires_at
  )
  select
    'game',
    pe.name,
    'Community Play',
    jsonb_build_array(
      jsonb_build_object(
        'headline', pe.name || ' is starting nearby',
        'subheadline', 'Around your area'
      ),
      jsonb_build_object(
        'headline', 'Starts ' || to_char(pe.event_date, 'FMMonth FMDD') || ' at ' || to_char(pe.start_time, 'HH12:MI AM'),
        'metadata', v.spots_remaining || ' spot' || (case when v.spots_remaining = 1 then '' else 's' end) || ' left'
      )
    ),
    'Join Game',
    '/community/' || pe.id,
    'play_event',
    pe.id,
    (case
      when (pe.event_date + pe.start_time) < now() + interval '3 hours' then 60
      when (pe.event_date + pe.start_time) < now() + interval '24 hours' then 30
      else 10
    end)
    + (case when v.spots_remaining <= 2 then 20 else 0 end),
    least((pe.event_date + pe.start_time)::timestamptz, now() + interval '6 hours')
  from public.play_events pe
  cross join lateral (
    select pe.max_players - count(pp.id) as spots_remaining
    from public.play_participants pp
    where pp.event_id = pe.id
  ) v
  where pe.status = 'open'
    and (pe.event_date + pe.start_time) between now() and now() + interval '48 hours'
    and v.spots_remaining > 0
    and v.spots_remaining <= 2
  on conflict (source_type, source_id) where source_type is not null and source_id is not null
  do update set
    title = excluded.title,
    slides = excluded.slides,
    priority_score = excluded.priority_score,
    expires_at = excluded.expires_at;

  delete from public.dynamic_stories where story_type = 'partner';

  insert into public.dynamic_stories (
    story_type, title, subtitle, slides, cta_label, cta_route,
    source_type, source_id, priority_score, expires_at
  )
  select
    'partner',
    'Players near your level',
    'Partner Finder',
    jsonb_build_array(
      jsonb_build_object(
        'headline', 'We found players who match your game',
        'subheadline', band.player_count || ' player' || (case when band.player_count = 1 then '' else 's' end) || ' near ' || band.band_label
      ),
      jsonb_build_object(
        'headline', 'Actively looking for a partner right now',
        'body', 'Near your area'
      )
    ),
    'View Matches',
    '/finder',
    null,
    null,
    20,
    now() + interval '12 hours'
  from (
    select
      round(coalesce(p.dupr, nullif(p.self_rating, '')::numeric) * 2) / 2 as band_value,
      round(coalesce(p.dupr, nullif(p.self_rating, '')::numeric) * 2) / 2 || ' DUPR' as band_label,
      count(*) as player_count
    from public.profiles p
    join public.partner_preferences pp on pp.user_id = p.id
    where pp.actively_looking = true
      and (p.dupr is not null or p.self_rating ~ '^[0-9]+(\.[0-9]+)?$')
    group by 1, 2
    having count(*) >= 2
  ) band;
end;
$_$;


ALTER FUNCTION "public"."generate_dynamic_stories"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_created_id uuid;
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001', hint = 'You must be signed in to start a conversation.';
  end if;

  if p_partner_id is null then
    raise exception 'missing_partner'
      using errcode = 'P0002', hint = 'A conversation partner is required.';
  end if;

  if p_partner_id = v_user_id then
    raise exception 'self_conversation_not_allowed'
      using errcode = 'P0003', hint = 'You cannot start a conversation with yourself.';
  end if;

  select c.id into v_existing_id
    from public.conversations c
   where coalesce(c.conversation_type, 'direct') = 'direct'
     and (
       (c.participant_a = v_user_id and c.participant_b = p_partner_id)
       or
       (c.participant_a = p_partner_id and c.participant_b = v_user_id)
     )
   order by c.created_at asc
   limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select (
    exists (
      select 1
        from public.partner_likes l1
        join public.partner_likes l2
          on l1.from_user_id = l2.to_user_id
         and l1.to_user_id   = l2.from_user_id
         and l2.kind         = 'like'
       where l1.kind = 'like'
         and l1.from_user_id in (v_user_id, p_partner_id)
         and l1.to_user_id   in (v_user_id, p_partner_id)
    )
    or exists (
      select 1
        from public.profiles dir
        join public.tournaments t on t.director_id = dir.id
        join public.registrations r on r.tournament_id = t.id
       where dir.id = v_user_id
         and (dir.role = 'director' or dir.is_director = true)
         and dir.director_status = 'approved'
         and r.player_id = p_partner_id
         and r.status in ('held', 'registered', 'checked_in')
    )
    or exists (
      select 1
        from public.registrations r
        join public.tournaments t on t.id = r.tournament_id
       where r.player_id = v_user_id
         and r.status in ('held', 'registered', 'checked_in')
         and t.director_id = p_partner_id
    )
    or exists (
      select 1
        from public.play_events pe
        join public.play_participants pp on pp.event_id = pe.id
       where pe.organizer_id = v_user_id
         and pp.claimed_by = p_partner_id
    )
    or exists (
      select 1
        from public.play_events pe
       where pe.organizer_id = p_partner_id
    )
    or exists (
      select 1
        from public.tournaments t
        join public.profiles dir on dir.id = t.director_id
       where t.director_id = p_partner_id
         and t.status in ('open', 'filling_fast', 'registration_closed', 'in_progress', 'completed')
         and (dir.role = 'director' or dir.is_director = true)
         and dir.director_status = 'approved'
    )
  ) into v_allowed;

  if not coalesce(v_allowed, false) then
    raise exception 'direct_conversation_not_allowed'
      using errcode = 'P0004', hint = 'No allowed messaging relationship exists.';
  end if;

  insert into public.conversations (
    conversation_type,
    participant_a,
    participant_b,
    created_by
  ) values (
    'direct',
    v_user_id,
    p_partner_id,
    v_user_id
  )
  returning id into v_created_id;

  return v_created_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") IS 'Validated direct-message creator for authenticated users. Returns an existing direct conversation or creates one when the contact relationship is allowed.';



CREATE OR REPLACE FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_event play_events;
  v_conversation_id uuid;
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001', hint = 'You must be signed in to open event chat.';
  end if;

  select * into v_event
    from public.play_events
   where id = p_event_id;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0002', hint = 'No play_event with that id.';
  end if;

  if v_event.status = 'cancelled'::play_event_status then
    raise exception 'event_chat_unavailable'
      using errcode = 'P0003', hint = 'Chat is not available for cancelled events.';
  end if;

  select id into v_conversation_id
    from public.conversations
   where conversation_type = 'play_event'
     and related_play_event_id = p_event_id
   order by created_at asc
   limit 1;

  if v_conversation_id is null then
    insert into public.conversations (
      conversation_type,
      related_play_event_id,
      title,
      created_by
    ) values (
      'play_event',
      p_event_id,
      coalesce(v_event.name, 'Community Play Chat'),
      v_user_id
    )
    on conflict (related_play_event_id)
    where conversation_type = 'play_event' and related_play_event_id is not null
    do update set title = excluded.title
    returning id into v_conversation_id;
  end if;

  insert into public.conversation_participants (
    conversation_id,
    user_id,
    role
  ) values (
    v_conversation_id,
    v_user_id,
    case when v_event.organizer_id = v_user_id then 'owner' else 'member' end
  )
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;


ALTER FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") IS 'Finds or creates a Community Play event conversation and adds the authenticated caller as a conversation participant.';



CREATE OR REPLACE FUNCTION "public"."has_pending_group_invite"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.group_invites gi
     where gi.group_id = p_group_id
       and gi.invitee_id = p_user_id
       and gi.status = 'pending'
  );
$$;


ALTER FUNCTION "public"."has_pending_group_invite"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_par_profiles" (
    "profile_id" "uuid" NOT NULL,
    "current_par" numeric(6,4) NOT NULL,
    "confidence_score" numeric(5,2) DEFAULT 0 NOT NULL,
    "confidence_band" "text" DEFAULT 'low'::"text" NOT NULL,
    "eligible_games_count" integer DEFAULT 0 NOT NULL,
    "initial_par" numeric(6,4) NOT NULL,
    "initialization_source" "text" NOT NULL,
    "initialized_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_processed_game_id" "uuid",
    "last_rated_at" timestamp with time zone,
    "algorithm_version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "player_par_profiles_confidence_band" CHECK (("confidence_band" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "player_par_profiles_confidence_range" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (100)::numeric))),
    CONSTRAINT "player_par_profiles_games_nonnegative" CHECK (("eligible_games_count" >= 0)),
    CONSTRAINT "player_par_profiles_initial_range" CHECK ((("initial_par" >= 1.0) AND ("initial_par" <= 6.0))),
    CONSTRAINT "player_par_profiles_initialization_source" CHECK (("initialization_source" = ANY (ARRAY['self_rating'::"text", 'skill_level'::"text", 'default'::"text"]))),
    CONSTRAINT "player_par_profiles_par_range" CHECK ((("current_par" >= 1.0) AND ("current_par" <= 6.0)))
);


ALTER TABLE "public"."player_par_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_own_player_par_profile"() RETURNS "public"."player_par_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  return public.initialize_player_par_profile(auth.uid(), null);
end;
$$;


ALTER FUNCTION "public"."initialize_own_player_par_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_player_par_profile"("p_profile_id" "uuid", "p_algorithm_version" "text" DEFAULT NULL::"text") RETURNS "public"."player_par_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_profile public.profiles;
  v_algo public.par_algorithm_versions;
  v_config jsonb;
  v_initial numeric;
  v_source text;
  v_existing public.player_par_profiles;
  v_row public.player_par_profiles;
begin
  select * into v_existing from public.player_par_profiles profile where profile.profile_id = p_profile_id;
  if found then return v_existing; end if;

  select * into v_profile from public.profiles profile where profile.id = p_profile_id;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;

  if p_algorithm_version is not null then
    select * into v_algo from public.par_algorithm_versions algo where algo.version = p_algorithm_version;
  else
    select * into v_algo from public.par_algorithm_versions algo where algo.is_active order by algo.activated_at desc nulls last limit 1;
  end if;
  if not found then raise exception 'par_algorithm_not_found' using errcode = 'P0001'; end if;

  v_config := v_algo.configuration;
  v_initial := null;
  v_source := null;

  if v_profile.self_rating is not null and btrim(v_profile.self_rating) ~ '^[0-9]+(\.[0-9]+)?$' then
    v_initial := v_profile.self_rating::numeric;
    v_source := 'self_rating';
  end if;

  if v_initial is null then
    v_initial := public.par_skill_level_initial_value(v_profile.skill_level);
    if v_initial is not null then v_source := 'skill_level'; end if;
  end if;

  if v_initial is null then
    v_initial := coalesce((v_config->>'default_initial_par')::numeric, 3.25);
    v_source := 'default';
  end if;

  v_initial := round(public.par_clamp(v_initial, coalesce((v_config->>'rating_min')::numeric, 1.0), coalesce((v_config->>'rating_max')::numeric, 6.0)), 4);

  insert into public.player_par_profiles (
    profile_id, current_par, confidence_score, confidence_band, eligible_games_count,
    initial_par, initialization_source, algorithm_version
  ) values (
    p_profile_id, v_initial, 0, 'low', 0, v_initial, v_source, v_algo.version
  ) returning * into v_row;

  return v_row;
end;
$_$;


ALTER FUNCTION "public"."initialize_player_par_profile"("p_profile_id" "uuid", "p_algorithm_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved_director"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (role = 'director' or is_director = true)
       and director_status = 'approved'
  );
$$;


ALTER FUNCTION "public"."is_approved_director"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation_id
       and p_user_id is not null
       and (
         c.participant_a = p_user_id
         or c.participant_b = p_user_id
         or c.created_by = p_user_id
         or exists (
           select 1
             from public.conversation_participants cp
            where cp.conversation_id = c.id
              and cp.user_id = p_user_id
         )
         or (
           c.related_play_event_id is not null
           and exists (
             select 1
               from public.play_events pe
              where pe.id = c.related_play_event_id
                and pe.organizer_id = p_user_id
           )
         )
         or (
           c.related_play_event_id is not null
           and exists (
             select 1
               from public.play_participants pp
              where pp.event_id = c.related_play_event_id
                and pp.claimed_by = p_user_id
           )
         )
         or (
           c.related_tournament_id is not null
           and exists (
             select 1
               from public.tournaments t
              where t.id = c.related_tournament_id
                and t.director_id = p_user_id
           )
         )
         or (
           c.related_tournament_id is not null
           and exists (
             select 1
               from public.registrations r
              where r.tournament_id = c.related_tournament_id
                and r.player_id = p_user_id
                and r.status in ('held', 'registered', 'checked_in')
           )
         )
         or exists (
           select 1
             from public.groups g
             join public.group_members gm on gm.group_id = g.id
            where g.conversation_id = c.id
              and gm.user_id = p_user_id
              and gm.status = 'active'
         )
       )
  );
$$;


ALTER FUNCTION "public"."is_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_admin"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id
       and gm.user_id  = p_user_id
       and gm.status   = 'active'
       and gm.role in ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_group_admin"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_member"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group_id
       and gm.user_id  = p_user_id
       and gm.status   = 'active'
  );
$$;


ALTER FUNCTION "public"."is_group_member"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_personal_session_visible"("p_session_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
      from public.personal_sessions s
     where s.id = p_session_id
       and (
         s.created_by = p_user_id
         or exists (
           select 1
             from public.personal_session_participants p
            where p.session_id = s.id
              and p.profile_id = p_user_id
         )
       )
  );
$$;


ALTER FUNCTION "public"."is_personal_session_visible"("p_session_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."play_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_initial" "text",
    "email" "text" NOT NULL,
    "phone" "text",
    "self_rating" "text",
    "gender" "text",
    "claimed_by" "uuid",
    "added_by_organizer" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."play_participants" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_play_event"("p_event_id" "uuid", "p_first_name" "text", "p_email" "text", "p_claimed_by" "uuid" DEFAULT NULL::"uuid", "p_added_by_organizer" boolean DEFAULT false, "p_self_rating" "text" DEFAULT NULL::"text", "p_last_initial" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."play_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event play_events;
  v_count integer;
  v_row   play_participants;
begin
  -- Lock the event row for the duration of this transaction to prevent races.
  select * into v_event
    from play_events
   where id = p_event_id
   for update;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0001', hint = 'No play_event with that id.';
  end if;

  -- Only open events accept new participants.
  if v_event.status <> 'open'::play_event_status then
    raise exception 'event_not_open'
      using errcode = 'P0002', hint = 'Event is not open for registration.';
  end if;

  -- Count current participants under the lock.
  select count(*) into v_count
    from play_participants
   where event_id = p_event_id;

  if v_count >= v_event.max_players then
    raise exception 'event_full'
      using errcode = 'P0003', hint = 'Event has reached max_players capacity.';
  end if;

  -- Block duplicate email per event.
  if exists (
    select 1 from play_participants
     where event_id = p_event_id and email = p_email
  ) then
    raise exception 'duplicate_email'
      using errcode = 'P0004', hint = 'This email is already registered for the event.';
  end if;

  -- Insert and return the new row.
  insert into play_participants (
    event_id, first_name, last_initial, email,
    claimed_by, added_by_organizer, self_rating
  ) values (
    p_event_id, p_first_name, p_last_initial, p_email,
    p_claimed_by, p_added_by_organizer, p_self_rating
  )
  returning * into v_row;

  return next v_row;
end;
$$;


ALTER FUNCTION "public"."join_play_event"("p_event_id" "uuid", "p_first_name" "text", "p_email" "text", "p_claimed_by" "uuid", "p_added_by_organizer" boolean, "p_self_rating" "text", "p_last_initial" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."join_play_event"("p_event_id" "uuid", "p_first_name" "text", "p_email" "text", "p_claimed_by" "uuid", "p_added_by_organizer" boolean, "p_self_rating" "text", "p_last_initial" "text") IS 'Transaction-safe participant insert. Locks the play_events row, checks status=open and capacity, blocks duplicate email, then inserts. Raises named exceptions (event_not_found, event_not_open, event_full, duplicate_email) for caller handling.';



CREATE TABLE IF NOT EXISTS "public"."personal_guest_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "session_participant_id" "uuid" NOT NULL,
    "guest_player_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "share_status" "text" DEFAULT 'not_shared'::"text" NOT NULL,
    "share_channel" "text" DEFAULT 'sms'::"text" NOT NULL,
    "share_initiated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_guest_shares_share_channel_check" CHECK (("share_channel" = 'sms'::"text")),
    CONSTRAINT "personal_guest_shares_share_status_check" CHECK (("share_status" = ANY (ARRAY['not_shared'::"text", 'share_initiated'::"text", 'claimed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."personal_guest_shares" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_personal_guest_share_initiated"("p_guest_share_id" "uuid") RETURNS "public"."personal_guest_shares"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_share public.personal_guest_shares;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select * into v_share
    from public.personal_guest_shares
   where id = p_guest_share_id;

  if not found then
    raise exception 'guest_share_not_found' using errcode = 'P0001';
  end if;

  if v_share.created_by <> auth.uid() then
    raise exception 'not_guest_share_creator' using errcode = 'P0001';
  end if;

  update public.personal_guest_shares
     set share_status = 'share_initiated',
         share_initiated_at = coalesce(share_initiated_at, now())
   where id = p_guest_share_id
   returning * into v_share;

  return v_share;
end;
$$;


ALTER FUNCTION "public"."mark_personal_guest_share_initiated"("p_guest_share_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.wallet_items
  set is_seen = true, seen_at = now()
  where id = p_item_id and user_id = auth.uid();
end;
$$;


ALTER FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") IS 'Marks a wallet_items row seen for the calling user. Only field a client can mutate on wallet_items; all other writes require service_role.';



CREATE OR REPLACE FUNCTION "public"."notify_group_invite"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_group_name text;
  v_inviter_name text;
begin
  select name into v_group_name from public.groups where id = new.group_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'group_invite',
    'New group invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to join ' || coalesce(v_group_name, 'a group'),
    '/groups/' || new.group_id
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_group_invite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_sender_name text;
  v_tokens text[];
  v_title text;
  v_body text;
begin
  select full_name into v_sender_name from public.profiles where id = new.sender_id;

  select array_agg(distinct pt.expo_push_token) into v_tokens
    from public.push_tokens pt
   where pt.user_id in (
     select recips.user_id
       from (
         select participant_a as user_id from public.conversations
          where id = new.conversation_id and participant_a is not null
         union
         select participant_b as user_id from public.conversations
          where id = new.conversation_id and participant_b is not null
         union
         select user_id from public.conversation_participants
          where conversation_id = new.conversation_id
       ) recips
      where recips.user_id != new.sender_id
        and not exists (
          select 1 from public.conversation_participant_settings s
           where s.conversation_id = new.conversation_id
             and s.user_id = recips.user_id
             and s.muted_until is not null
             and s.muted_until > now()
        )
   );

  if v_tokens is null or array_length(v_tokens, 1) is null then
    return new;
  end if;

  v_title := coalesce(v_sender_name, 'New message');
  v_body := left(new.body, 120);

  perform net.http_post(
    url := 'https://fbzetvkbhneptvfruilw.supabase.co/functions/v1/send-message-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo'
    ),
    body := jsonb_build_object(
      'tokens', to_jsonb(v_tokens),
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('conversationId', new.conversation_id, 'messageId', new.id)
    )
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_new_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_play_event_invite"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_event_name text;
  v_inviter_name text;
begin
  select name into v_event_name from public.play_events where id = new.play_event_id;
  select full_name into v_inviter_name from public.profiles where id = new.inviter_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.invitee_id,
    'play_event_invite',
    'New game invite',
    coalesce(v_inviter_name, 'Someone') || ' invited you to ' || coalesce(v_event_name, 'a game'),
    '/community/' || new.play_event_id
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_play_event_invite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_wallet_item_added"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.user_id,
    'wallet_item_added',
    case
      when new.status = 'processing' then 'Setting up: ' || new.title
      else 'New in your Wallet: ' || new.title
    end,
    new.subtitle,
    '/wallet/' || new.id::text
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_wallet_item_added"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_wallet_item_added"() IS 'Notifies the owning user when a wallet_items row is created for them.';



CREATE OR REPLACE FUNCTION "public"."notify_wallet_item_available"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status = 'processing' and new.status in ('available', 'active') then
    insert into public.notifications (user_id, type, title, body, link)
    values (
      new.user_id,
      'wallet_item_available',
      new.title || ' is ready!',
      'Tap to view your benefit.',
      '/wallet/' || new.id::text
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_wallet_item_available"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."notify_wallet_item_available"() IS 'Notifies the owning user when a wallet_items row finishes issuing (processing -> available/active).';



CREATE OR REPLACE FUNCTION "public"."par_clamp"("p_value" numeric, "p_min" numeric, "p_max" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select least(greatest(p_value, p_min), p_max);
$$;


ALTER FUNCTION "public"."par_clamp"("p_value" numeric, "p_min" numeric, "p_max" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."par_confidence_band"("p_score" numeric) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case when p_score >= 75 then 'high' when p_score >= 40 then 'medium' else 'low' end;
$$;


ALTER FUNCTION "public"."par_confidence_band"("p_score" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."par_explanation_code"("p_actual" numeric, "p_expected" numeric, "p_margin_category" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_actual = 1 and p_expected < 0.45 then 'upset_win'
    when p_actual = 1 and p_expected > 0.60 and p_margin_category in ('clear','dominant') then 'expected_win_clear'
    when p_actual = 1 then 'expected_win'
    when p_actual = 0 and p_expected > 0.55 then 'upset_loss'
    when p_actual = 0 and p_expected < 0.40 and p_margin_category = 'close' then 'close_loss_stronger_team'
    else 'loss'
  end;
$$;


ALTER FUNCTION "public"."par_explanation_code"("p_actual" numeric, "p_expected" numeric, "p_margin_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."par_guest_estimated_rating"("p_skill" "text", "p_anchor" numeric, "p_config" "jsonb") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_skill text := lower(coalesce(btrim(p_skill), ''));
  v_offsets jsonb := coalesce(p_config->'guest_estimate_offsets', '{}'::jsonb);
  v_direction text;
  v_magnitude text;
  v_offset numeric;
  v_min numeric := coalesce((p_config->>'rating_min')::numeric, 1.0);
  v_max numeric := coalesce((p_config->>'rating_max')::numeric, 6.0);
  v_anchor numeric := coalesce(p_anchor, coalesce((p_config->>'default_initial_par')::numeric, 3.25));
begin
  if v_skill like '%stronger%' then
    v_direction := 'stronger';
  elsif v_skill like '%weaker%' then
    v_direction := 'weaker';
  else
    return round(public.par_clamp(v_anchor, v_min, v_max), 4);
  end if;

  if v_skill like 'much%' then
    v_magnitude := 'much';
  elsif v_skill like 'slightly%' then
    v_magnitude := 'slightly';
  else
    v_magnitude := 'default';
  end if;

  v_offset := coalesce((v_offsets->v_direction->>v_magnitude)::numeric, 0);
  return round(public.par_clamp(v_anchor + v_offset, v_min, v_max), 4);
end;
$$;


ALTER FUNCTION "public"."par_guest_estimated_rating"("p_skill" "text", "p_anchor" numeric, "p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."par_score_margin_category"("p_margin" integer, "p_config" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_close integer := coalesce(((p_config->'score_margin'->>'close_threshold')::integer), 2);
  v_clear integer := coalesce(((p_config->'score_margin'->>'clear_threshold')::integer), 6);
begin
  if p_margin <= v_close then return 'close'; end if;
  if p_margin >= 11 then return 'dominant'; end if;
  if p_margin >= v_clear then return 'clear'; end if;
  return 'normal';
end;
$$;


ALTER FUNCTION "public"."par_score_margin_category"("p_margin" integer, "p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."par_score_margin_multiplier"("p_category" "text", "p_config" "jsonb") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_category
    when 'close' then coalesce((p_config->'score_margin'->>'close_multiplier')::numeric, 0.85)
    when 'clear' then coalesce((p_config->'score_margin'->>'clear_multiplier')::numeric, 1.12)
    when 'dominant' then coalesce((p_config->'score_margin'->>'dominant_multiplier')::numeric, 1.20)
    else coalesce((p_config->'score_margin'->>'normal_multiplier')::numeric, 1.0)
  end;
$$;


ALTER FUNCTION "public"."par_score_margin_multiplier"("p_category" "text", "p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."par_skill_level_initial_value"("p_skill_level" "text") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
declare
  v text := lower(coalesce(p_skill_level, ''));
  v_first numeric;
  v_second numeric;
begin
  if btrim(v) = '' then return null; end if;
  if v like '%beginner%' then return 2.0000; end if;
  if v like '%2.5%' and (v like '%below%' or v like '%under%' or v like '%& below%') then return 2.4000; end if;
  if v like '%4.5+%' or v like '%4.5 plus%' or v like '%advanced%' then return 4.7500; end if;
  v := replace(v, '_', '-');
  if v ~ '([0-9]+(\.[0-9]+)?)[[:space:]]*-[[:space:]]*([0-9]+(\.[0-9]+)?)' then
    v_first := substring(v from '([0-9]+(\.[0-9]+)?)[[:space:]]*-')::numeric;
    v_second := substring(v from '-[[:space:]]*([0-9]+(\.[0-9]+)?)')::numeric;
    return round(((v_first + v_second) / 2.0)::numeric, 4);
  end if;
  if v ~ '^[0-9]+(\.[0-9]+)?$' then return v::numeric; end if;
  return null;
end;
$_$;


ALTER FUNCTION "public"."par_skill_level_initial_value"("p_skill_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_match_claim_hash"("p_token" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;


ALTER FUNCTION "public"."personal_match_claim_hash"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_match_claim_token"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=')
$$;


ALTER FUNCTION "public"."personal_match_claim_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personal_session_expected_players"("p_format" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case when p_format = 'singles' then 2 else 4 end;
$$;


ALTER FUNCTION "public"."personal_session_expected_players"("p_format" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."par_rating_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "event_type" "text" DEFAULT 'game_processed'::"text" NOT NULL,
    "par_before" numeric(6,4) NOT NULL,
    "par_after" numeric(6,4) NOT NULL,
    "par_change" numeric(7,4) NOT NULL,
    "confidence_before" numeric(5,2) NOT NULL,
    "confidence_after" numeric(5,2) NOT NULL,
    "confidence_change" numeric(6,2) NOT NULL,
    "expected_result" numeric(6,4) NOT NULL,
    "actual_result" numeric(4,2) NOT NULL,
    "score_margin" integer NOT NULL,
    "opponent_strength" numeric(6,4) NOT NULL,
    "partner_strength" numeric(6,4),
    "verification_level" "text" NOT NULL,
    "weight" numeric(6,4) NOT NULL,
    "explanation_code" "text" NOT NULL,
    "explanation_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "algorithm_version" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reversed_at" timestamp with time zone,
    "reversal_event_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "par_rating_events_actual_result" CHECK (("actual_result" = ANY (ARRAY[(0)::numeric, (1)::numeric]))),
    CONSTRAINT "par_rating_events_confidence_ranges" CHECK ((("confidence_before" >= (0)::numeric) AND ("confidence_before" <= (100)::numeric) AND ("confidence_after" >= (0)::numeric) AND ("confidence_after" <= (100)::numeric))),
    CONSTRAINT "par_rating_events_event_type" CHECK (("event_type" = ANY (ARRAY['game_processed'::"text", 'reversal'::"text", 'recalculation'::"text"]))),
    CONSTRAINT "par_rating_events_rating_ranges" CHECK ((("par_before" >= 1.0) AND ("par_before" <= 6.0) AND ("par_after" >= 1.0) AND ("par_after" <= 6.0))),
    CONSTRAINT "par_rating_events_verification" CHECK (("verification_level" = ANY (ARRAY['fully_verified'::"text", 'participant_verified'::"text", 'estimated'::"text", 'disputed'::"text", 'excluded'::"text"])))
);


ALTER TABLE "public"."par_rating_events" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_personal_game_par"("p_game_id" "uuid") RETURNS SETOF "public"."par_rating_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_game public.personal_games;
  v_session public.personal_sessions;
  v_processing public.par_game_processing;
  v_locked public.par_game_processing;
  v_algo public.par_algorithm_versions;
  v_config jsonb;
  v_min numeric;
  v_max numeric;
  v_base_k numeric;
  v_elo_divisor numeric;
  v_verification_level text;
  v_verification_weight numeric;
  v_confidence_gain numeric;
  v_anchor numeric;
  v_margin integer;
  v_margin_category text;
  v_margin_multiplier numeric;
  v_team_one_avg numeric;
  v_team_two_avg numeric;
  v_participant record;
  v_profile public.player_par_profiles;
  v_team_avg numeric;
  v_opp_avg numeric;
  v_partner_avg numeric;
  v_actual numeric;
  v_expected numeric;
  v_band text;
  v_confidence_multiplier numeric;
  v_cap numeric;
  v_delta numeric;
  v_after numeric;
  v_conf_after numeric;
  v_explanation text;
begin
  select * into v_game from public.personal_games game where game.id = p_game_id;
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;
  select * into v_session from public.personal_sessions session where session.id = v_game.session_id;

  if auth.uid() is not null and not public.is_personal_session_visible(v_session.id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.par_game_processing processing where processing.game_id = p_game_id and processing.status = 'processed') then
    return query select * from public.par_rating_events event
      where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
      order by event.processed_at, event.profile_id;
    return;
  end if;

  v_processing := public.evaluate_personal_game_par_eligibility(p_game_id);
  if v_processing.status <> 'eligible' then return; end if;

  select * into v_locked from public.par_game_processing processing where processing.game_id = p_game_id for update;
  if v_locked.status = 'processed' then
    return query select * from public.par_rating_events event
      where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
      order by event.processed_at, event.profile_id;
    return;
  end if;

  update public.par_game_processing processing
     set status = 'processing', error_message = null, last_evaluated_at = now()
   where processing.game_id = p_game_id;

  select * into v_algo from public.par_algorithm_versions algo where algo.is_active order by algo.activated_at desc nulls last limit 1;
  v_config := v_algo.configuration;
  v_min := coalesce((v_config->>'rating_min')::numeric, 1.0);
  v_max := coalesce((v_config->>'rating_max')::numeric, 6.0);
  v_base_k := coalesce((v_config->>'base_k')::numeric, 0.12);
  v_elo_divisor := greatest(coalesce((v_config->>'elo_divisor')::numeric, 1.0), 0.01);

  v_verification_level := coalesce(v_processing.verification_level, 'participant_verified');
  v_verification_weight := coalesce((v_config->'verification_weight'->>v_verification_level)::numeric, 0.75);
  v_confidence_gain := coalesce((v_config->'confidence_gain'->>v_verification_level)::numeric, 8.0);

  v_margin := abs(v_game.team_one_score - v_game.team_two_score);
  v_margin_category := public.par_score_margin_category(v_margin, v_config);
  v_margin_multiplier := public.par_score_margin_multiplier(v_margin_category, v_config);

  perform public.initialize_player_par_profile(v_session.created_by, v_algo.version);
  select profile.current_par into v_anchor
    from public.player_par_profiles profile where profile.profile_id = v_session.created_by;

  for v_participant in
    select distinct sp.profile_id
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is not null
  loop
    perform public.initialize_player_par_profile(v_participant.profile_id, v_algo.version);
  end loop;

  select avg(coalesce(profile.current_par, public.par_guest_estimated_rating(sp.estimated_skill, v_anchor, v_config)))
    into v_team_one_avg
    from public.personal_game_participants gp
    join public.personal_session_participants sp on sp.id = gp.session_participant_id
    left join public.player_par_profiles profile on profile.profile_id = sp.profile_id
   where gp.game_id = p_game_id and gp.team_number = 1;

  select avg(coalesce(profile.current_par, public.par_guest_estimated_rating(sp.estimated_skill, v_anchor, v_config)))
    into v_team_two_avg
    from public.personal_game_participants gp
    join public.personal_session_participants sp on sp.id = gp.session_participant_id
    left join public.player_par_profiles profile on profile.profile_id = sp.profile_id
   where gp.game_id = p_game_id and gp.team_number = 2;

  for v_participant in
    select gp.team_number, gp.position, sp.profile_id
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
     where gp.game_id = p_game_id and sp.profile_id is not null
     order by gp.team_number, gp.position
  loop
    select * into v_profile from public.player_par_profiles profile where profile.profile_id = v_participant.profile_id for update;

    v_team_avg := case when v_participant.team_number = 1 then v_team_one_avg else v_team_two_avg end;
    v_opp_avg := case when v_participant.team_number = 1 then v_team_two_avg else v_team_one_avg end;
    v_actual := case when v_game.winning_team = v_participant.team_number then 1 else 0 end;
    v_expected := round((1.0 / (1.0 + power(10.0, ((v_opp_avg - v_team_avg) / v_elo_divisor))))::numeric, 4);
    v_band := public.par_confidence_band(v_profile.confidence_score);
    v_confidence_multiplier := coalesce((v_config->'confidence_multipliers'->>v_band)::numeric, 1.0);
    v_cap := coalesce((v_config->'movement_caps'->>v_band)::numeric, 0.12);
    v_delta := round(public.par_clamp(v_base_k * (v_actual - v_expected) * v_margin_multiplier * v_verification_weight * v_confidence_multiplier, -v_cap, v_cap), 4);
    v_after := round(public.par_clamp(v_profile.current_par + v_delta, v_min, v_max), 4);
    v_conf_after := round(public.par_clamp(v_profile.confidence_score + v_confidence_gain, 0, 100), 2);
    v_explanation := public.par_explanation_code(v_actual, v_expected, v_margin_category);

    select avg(coalesce(profile.current_par, public.par_guest_estimated_rating(sp.estimated_skill, v_anchor, v_config)))
      into v_partner_avg
      from public.personal_game_participants gp
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      left join public.player_par_profiles profile on profile.profile_id = sp.profile_id
     where gp.game_id = p_game_id
       and gp.team_number = v_participant.team_number
       and (sp.profile_id is null or sp.profile_id <> v_participant.profile_id);

    insert into public.par_rating_events (
      profile_id, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin,
      opponent_strength, partner_strength, verification_level, weight,
      explanation_code, explanation_data, algorithm_version
    ) values (
      v_participant.profile_id, v_session.id, p_game_id, 'game_processed',
      v_profile.current_par, v_after, v_after - v_profile.current_par,
      v_profile.confidence_score, v_conf_after, v_conf_after - v_profile.confidence_score,
      v_expected, v_actual, v_margin,
      round(v_opp_avg, 4), round(v_partner_avg, 4), v_verification_level, v_verification_weight,
      v_explanation,
      jsonb_build_object(
        'result', case when v_actual = 1 then 'win' else 'loss' end,
        'expectedResult', v_expected,
        'opponentRating', round(v_opp_avg, 4),
        'partnerRating', round(v_partner_avg, 4),
        'scoreMarginCategory', v_margin_category,
        'confidenceBand', v_band,
        'verificationLevel', v_verification_level,
        'verificationWeight', v_verification_weight,
        'movementCap', v_cap,
        'scoreMarginMultiplier', v_margin_multiplier,
        'primaryReason', v_explanation,
        'algorithmVersion', v_algo.version
      ),
      v_algo.version
    );

    update public.player_par_profiles profile
       set current_par = v_after,
           confidence_score = v_conf_after,
           confidence_band = public.par_confidence_band(v_conf_after),
           eligible_games_count = profile.eligible_games_count + 1,
           last_processed_game_id = p_game_id,
           last_rated_at = now(),
           algorithm_version = v_algo.version
     where profile.profile_id = v_participant.profile_id;
  end loop;

  update public.par_game_processing processing
     set status = 'processed', eligibility_reason = v_processing.eligibility_reason,
         verification_level = v_verification_level,
         algorithm_version = v_algo.version, processed_at = now(), last_evaluated_at = now(), error_message = null
   where processing.game_id = p_game_id;

  return query select * from public.par_rating_events event
    where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
    order by event.processed_at, event.profile_id;
exception when others then
  insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, error_message, last_evaluated_at)
  values (p_game_id, coalesce(v_session.id, v_game.session_id), 'failed', 'processing_failed', sqlerrm, now())
  on conflict (game_id) do update set
    status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
  raise;
end;
$$;


ALTER FUNCTION "public"."process_personal_game_par"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_personal_session_par"("p_session_id" "uuid") RETURNS SETOF "public"."par_game_processing"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.personal_sessions;
  v_game record;
begin
  select * into v_session from public.personal_sessions session where session.id = p_session_id;
  if not found then raise exception 'session_not_found' using errcode = 'P0001'; end if;

  if auth.uid() is not null and not public.is_personal_session_visible(p_session_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  for v_game in
    select game.id from public.personal_games game
    where game.session_id = p_session_id and game.status = 'completed'
    order by game.game_number, game.created_at
  loop
    begin
      perform public.process_personal_game_par(v_game.id);
    exception when others then
      insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, last_evaluated_at, error_message)
      values (v_game.id, p_session_id, 'failed', 'processing_failed', now(), sqlerrm)
      on conflict (game_id) do update set
        status = 'failed', eligibility_reason = 'processing_failed', last_evaluated_at = now(), error_message = sqlerrm;
    end;
  end loop;

  return query select * from public.par_game_processing processing
    where processing.session_id = p_session_id
    order by processing.last_evaluated_at desc;
end;
$$;


ALTER FUNCTION "public"."process_personal_session_par"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_personal_session_par"("p_session_id" "uuid") RETURNS SETOF "public"."par_game_processing"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_game record;
begin
  if auth.uid() is not null and not public.is_personal_session_visible(p_session_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  for v_game in
    select game.id from public.personal_games game
    where game.session_id = p_session_id
      and exists (
        select 1 from public.par_rating_events event
        where event.game_id = game.id and event.event_type = 'game_processed' and event.reversed_at is null
      )
    order by game.game_number desc, game.created_at desc
  loop
    perform public.reverse_personal_game_par(v_game.id, 'session_recalculation');
  end loop;

  return query select * from public.process_personal_session_par(p_session_id);
end;
$$;


ALTER FUNCTION "public"."recalculate_personal_session_par"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retry_failed_personal_game_par"("p_game_id" "uuid") RETURNS SETOF "public"."par_rating_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (select 1 from public.par_game_processing processing where processing.game_id = p_game_id and processing.status = 'failed') then
    update public.par_game_processing processing
       set status = 'pending', error_message = null, eligibility_reason = null, last_evaluated_at = now()
     where processing.game_id = p_game_id;
  end if;
  return query select * from public.process_personal_game_par(p_game_id);
end;
$$;


ALTER FUNCTION "public"."retry_failed_personal_game_par"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_personal_game_par"("p_game_id" "uuid", "p_reason" "text" DEFAULT 'manual_reversal'::"text") RETURNS SETOF "public"."par_rating_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_game public.personal_games;
  v_event public.par_rating_events;
  v_reversal public.par_rating_events;
begin
  select * into v_game from public.personal_games game where game.id = p_game_id;
  if not found then raise exception 'game_not_found' using errcode = 'P0001'; end if;

  if auth.uid() is not null and not public.is_personal_session_visible(v_game.session_id, auth.uid()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  for v_event in
    select * from public.par_rating_events event
    where event.game_id = p_game_id and event.event_type = 'game_processed' and event.reversed_at is null
    order by event.processed_at desc
  loop
    update public.player_par_profiles profile
       set current_par = v_event.par_before,
           confidence_score = greatest(0, profile.confidence_score - v_event.confidence_change),
           confidence_band = public.par_confidence_band(greatest(0, profile.confidence_score - v_event.confidence_change)),
           eligible_games_count = greatest(0, profile.eligible_games_count - 1),
           last_rated_at = now()
     where profile.profile_id = v_event.profile_id;

    insert into public.par_rating_events (
      profile_id, session_id, game_id, event_type,
      par_before, par_after, par_change,
      confidence_before, confidence_after, confidence_change,
      expected_result, actual_result, score_margin, opponent_strength, partner_strength,
      verification_level, weight, explanation_code, explanation_data, algorithm_version
    ) values (
      v_event.profile_id, v_event.session_id, v_event.game_id, 'reversal',
      v_event.par_after, v_event.par_before, v_event.par_before - v_event.par_after,
      v_event.confidence_after, v_event.confidence_before, v_event.confidence_before - v_event.confidence_after,
      v_event.expected_result, v_event.actual_result, v_event.score_margin, v_event.opponent_strength, v_event.partner_strength,
      v_event.verification_level, v_event.weight, 'reversal',
      jsonb_build_object('reason', coalesce(p_reason, 'manual_reversal'), 'reversedEventId', v_event.id),
      v_event.algorithm_version
    ) returning * into v_reversal;

    update public.par_rating_events event
       set reversed_at = now(), reversal_event_id = v_reversal.id
     where event.id = v_event.id;
  end loop;

  update public.par_game_processing processing
     set status = 'reversed', eligibility_reason = coalesce(p_reason, 'manual_reversal'), last_evaluated_at = now()
   where processing.game_id = p_game_id;

  return query select * from public.par_rating_events event
    where event.game_id = p_game_id and event.event_type = 'reversal'
    order by event.processed_at desc;
end;
$$;


ALTER FUNCTION "public"."reverse_personal_game_par"("p_game_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "game_number" integer NOT NULL,
    "team_one_score" integer,
    "team_two_score" integer,
    "winning_team" integer,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_games_completed_fields" CHECK ((("status" <> 'completed'::"text") OR (("team_one_score" IS NOT NULL) AND ("team_two_score" IS NOT NULL) AND ("winning_team" IS NOT NULL) AND ("completed_at" IS NOT NULL) AND ("team_one_score" <> "team_two_score")))),
    CONSTRAINT "personal_games_game_number_check" CHECK (("game_number" > 0)),
    CONSTRAINT "personal_games_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "personal_games_team_one_score_check" CHECK ((("team_one_score" IS NULL) OR ("team_one_score" >= 0))),
    CONSTRAINT "personal_games_team_two_score_check" CHECK ((("team_two_score" IS NULL) OR ("team_two_score" >= 0))),
    CONSTRAINT "personal_games_winning_team_check" CHECK (("winning_team" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."personal_games" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_personal_game_score"("p_game_id" "uuid", "p_team_one_score" integer, "p_team_two_score" integer) RETURNS "public"."personal_games"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_game public.personal_games;
  v_session public.personal_sessions;
  v_winning_team integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if p_team_one_score is null or p_team_two_score is null or p_team_one_score < 0 or p_team_two_score < 0 then
    raise exception 'invalid_score' using errcode = 'P0001';
  end if;

  if p_team_one_score = p_team_two_score then
    raise exception 'scores_cannot_tie' using errcode = 'P0001';
  end if;

  select * into v_game
    from public.personal_games
   where id = p_game_id;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0001';
  end if;

  select * into v_session
    from public.personal_sessions
   where id = v_game.session_id;

  if v_session.created_by <> auth.uid() then
    raise exception 'not_session_creator' using errcode = 'P0001';
  end if;

  if v_session.status in ('completed', 'cancelled') then
    raise exception 'session_not_editable' using errcode = 'P0001';
  end if;

  perform public.validate_personal_game_ready(p_game_id);

  v_winning_team := case when p_team_one_score > p_team_two_score then 1 else 2 end;

  update public.personal_games
     set team_one_score = p_team_one_score,
         team_two_score = p_team_two_score,
         winning_team = v_winning_team,
         status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_game_id
   returning * into v_game;

  update public.personal_sessions
     set status = case when status = 'draft' then 'active' else status end
   where id = v_session.id;

  return v_game;
end;
$$;


ALTER FUNCTION "public"."save_personal_game_score"("p_game_id" "uuid", "p_team_one_score" integer, "p_team_two_score" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_facilities_nearby"("lat" double precision, "lng" double precision, "radius_meters" double precision DEFAULT 25000, "search_query" "text" DEFAULT NULL::"text", "verified_only" boolean DEFAULT false, "public_only" boolean DEFAULT false, "result_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "address" "text", "city" "text", "state" "text", "postal_code" "text", "latitude" numeric, "longitude" numeric, "phone" "text", "website" "text", "description" "text", "court_count" integer, "indoor_courts" integer, "outdoor_courts" integer, "surface_type" "text", "lighting" boolean, "restrooms" boolean, "water" boolean, "parking" boolean, "public_access" boolean, "membership_required" boolean, "bookable_by_public" boolean, "claim_status" "text", "owner_user_id" "uuid", "verified" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "distance_meters" double precision)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    f.id, f.name, f.slug, f.address, f.city, f.state, f.postal_code,
    f.latitude, f.longitude, f.phone, f.website, f.description,
    f.court_count, f.indoor_courts, f.outdoor_courts, f.surface_type,
    f.lighting, f.restrooms, f.water, f.parking,
    f.public_access, f.membership_required, f.bookable_by_public,
    f.claim_status, f.owner_user_id, f.verified, f.created_at, f.updated_at,
    ST_Distance(
      f.coords,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) as distance_meters
  from public.facilities f
  where
    ST_DWithin(
      f.coords,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      greatest(radius_meters, 1)
    )
    and (
      search_query is null
      or f.name    ilike '%' || search_query || '%'
      or f.city    ilike '%' || search_query || '%'
      or f.state   ilike '%' || search_query || '%'
      or f.address ilike '%' || search_query || '%'
    )
    and (not verified_only  or f.verified = true)
    and (not public_only    or f.public_access = true)
  order by distance_meters asc
  limit least(result_limit, 200);
$$;


ALTER FUNCTION "public"."search_facilities_nearby"("lat" double precision, "lng" double precision, "radius_meters" double precision, "search_query" "text", "verified_only" boolean, "public_only" boolean, "result_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_facilities_nearby"("lat" double precision, "lng" double precision, "radius_meters" double precision, "search_query" "text", "verified_only" boolean, "public_only" boolean, "result_limit" integer) IS 'PostGIS proximity search. Returns facilities within radius_meters of (lat,lng) ordered by distance. search_query matches name/city/state/address. result_limit capped at 200.';



CREATE OR REPLACE FUNCTION "public"."touch_location_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_location_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_partner_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_partner_preferences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_process_personal_claimed_participant_par"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session_status text;
begin
  if tg_op = 'UPDATE'
     and old.profile_id is null
     and new.profile_id is not null
     and old.guest_player_id is not null
     and new.guest_player_id is null then
    select session.status into v_session_status from public.personal_sessions session where session.id = new.session_id;
    if v_session_status = 'completed' then
      begin
        perform public.process_personal_session_par(new.session_id);
      exception when others then
        insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, error_message, last_evaluated_at)
        select game.id, new.session_id, 'failed', 'processing_failed', sqlerrm, now()
        from public.personal_games game
        where game.session_id = new.session_id and game.status = 'completed'
        on conflict (game_id) do update set
          status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
      end;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."try_process_personal_claimed_participant_par"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_process_personal_session_par"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' and new.status = 'completed' and old.status is distinct from new.status then
    begin
      perform public.process_personal_session_par(new.id);
    exception when others then
      insert into public.par_game_processing (game_id, session_id, status, eligibility_reason, error_message, last_evaluated_at)
      select game.id, new.id, 'failed', 'processing_failed', sqlerrm, now()
      from public.personal_games game
      where game.session_id = new.id and game.status = 'completed'
      on conflict (game_id) do update set
        status = 'failed', eligibility_reason = 'processing_failed', error_message = sqlerrm, last_evaluated_at = now();
    end;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."try_process_personal_session_par"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_personal_game_ready"("p_game_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_format text;
  v_expected_total integer;
  v_expected_team integer;
  v_total integer;
  v_team_one integer;
  v_team_two integer;
begin
  select s.format into v_format
    from public.personal_games g
    join public.personal_sessions s on s.id = g.session_id
   where g.id = p_game_id;

  if v_format is null then
    raise exception 'game_not_found' using errcode = 'P0001';
  end if;

  v_expected_total := public.personal_session_expected_players(v_format);
  v_expected_team := v_expected_total / 2;

  select count(*) into v_total
    from public.personal_game_participants
   where game_id = p_game_id;

  select count(*) into v_team_one
    from public.personal_game_participants
   where game_id = p_game_id and team_number = 1;

  select count(*) into v_team_two
    from public.personal_game_participants
   where game_id = p_game_id and team_number = 2;

  if v_total <> v_expected_total or v_team_one <> v_expected_team or v_team_two <> v_expected_team then
    raise exception 'invalid_personal_game_teams'
      using errcode = 'P0001', hint = 'Game teams do not match the session format.';
  end if;
end;
$$;


ALTER FUNCTION "public"."validate_personal_game_ready"("p_game_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_personal_match_claim"("p_token" "text") RETURNS TABLE("status" "text", "reason" "text", "recorder_name" "text", "facility_name" "text", "played_at" timestamp with time zone, "guest_name" "text", "session_format" "text", "games" "jsonb", "teams" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_hash text;
  v_claim public.personal_match_claims;
begin
  if p_token is null or length(btrim(p_token)) < 20 then
    return query select 'invalid'::text, 'invalid_token'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  v_hash := public.personal_match_claim_hash(btrim(p_token));

  select * into v_claim
    from public.personal_match_claims c
   where c.token_hash = v_hash;

  if not found then
    return query select 'invalid'::text, 'invalid_token'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  if v_claim.status = 'revoked' or v_claim.revoked_at is not null then
    return query select 'invalid'::text, 'revoked'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  if v_claim.status = 'claimed' then
    return query
    select 'already_claimed'::text, 'already_claimed'::text, recorder.full_name::text, facility.name::text, session.played_at, participant.display_name_snapshot::text, session.format::text,
      coalesce((select jsonb_agg(jsonb_build_object('gameNumber', game.game_number, 'teamOneScore', game.team_one_score, 'teamTwoScore', game.team_two_score, 'winningTeam', game.winning_team) order by game.game_number) from public.personal_games game where game.session_id = session.id), '[]'::jsonb),
      '[]'::jsonb
    from public.personal_sessions session
    join public.personal_session_participants participant on participant.id = v_claim.session_participant_id
    left join public.profiles recorder on recorder.id = session.created_by
    left join public.facilities facility on facility.id = session.facility_id
    where session.id = v_claim.session_id;
    return;
  end if;

  if v_claim.expires_at <= now() then
    update public.personal_match_claims set status = 'expired' where id = v_claim.id and status = 'pending';
    update public.personal_guest_shares set share_status = 'expired' where id = v_claim.guest_share_id and share_status <> 'claimed';
    return query select 'expired'::text, 'expired'::text, null::text, null::text, null::timestamptz, null::text, null::text, '[]'::jsonb, '[]'::jsonb;
    return;
  end if;

  return query
  select 'valid'::text, null::text, recorder.full_name::text, facility.name::text, session.played_at, participant.display_name_snapshot::text, session.format::text,
    coalesce((select jsonb_agg(jsonb_build_object('gameNumber', game.game_number, 'teamOneScore', game.team_one_score, 'teamTwoScore', game.team_two_score, 'winningTeam', game.winning_team) order by game.game_number) from public.personal_games game where game.session_id = session.id), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('gameNumber', game.game_number, 'teamNumber', gp.team_number, 'position', gp.position, 'name', sp.display_name_snapshot) order by game.game_number, gp.team_number, gp.position)
      from public.personal_games game
      join public.personal_game_participants gp on gp.game_id = game.id
      join public.personal_session_participants sp on sp.id = gp.session_participant_id
      where game.session_id = session.id
    ), '[]'::jsonb)
  from public.personal_sessions session
  join public.personal_session_participants participant on participant.id = v_claim.session_participant_id
  left join public.profiles recorder on recorder.id = session.created_by
  left join public.facilities facility on facility.id = session.facility_id
  where session.id = v_claim.session_id;
end;
$$;


ALTER FUNCTION "public"."validate_personal_match_claim"("p_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blocked_users" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_self_block" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."blocked_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bracket_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "division_id" "uuid",
    "round" "public"."round_label" NOT NULL,
    "match_number" integer NOT NULL,
    "team1_player_a" "uuid",
    "team1_player_b" "uuid",
    "team2_player_a" "uuid",
    "team2_player_b" "uuid",
    "score_team1" integer[] DEFAULT '{}'::integer[],
    "score_team2" integer[] DEFAULT '{}'::integer[],
    "winner" integer,
    "court" "text",
    "scheduled_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "score_entered_by" "uuid",
    "score_entered_at" timestamp with time zone,
    "next_match_id" "uuid",
    "next_match_slot" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bracket_matches_next_match_slot_check" CHECK (("next_match_slot" = ANY (ARRAY[1, 2]))),
    CONSTRAINT "bracket_matches_winner_check" CHECK (("winner" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."bracket_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bracket_seeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "seed_number" integer NOT NULL,
    "pool_letter" "text",
    "locked" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bracket_seeds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_participant_settings" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "muted_until" timestamp with time zone,
    "hidden_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


ALTER TABLE "public"."conversation_participant_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_participant_settings" IS 'Per-user mute/hide state for a conversation. hidden_at removes the thread from that user''s own inbox only; the shared conversation/messages rows are untouched for other participants.';



CREATE TABLE IF NOT EXISTS "public"."conversation_participants" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_participants_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."conversation_participants" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_participants" IS 'Membership rows for contextual/group conversations. Legacy direct conversations continue to use participant_a / participant_b.';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "participant_a" "uuid",
    "participant_b" "uuid",
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conversation_type" "text" DEFAULT 'direct'::"text" NOT NULL,
    "related_play_event_id" "uuid",
    "related_tournament_id" "uuid",
    "title" "text",
    "created_by" "uuid",
    CONSTRAINT "conversations_context_check" CHECK (((("conversation_type" = 'direct'::"text") AND ("participant_a" IS NOT NULL) AND ("participant_b" IS NOT NULL)) OR (("conversation_type" = 'play_event'::"text") AND ("related_play_event_id" IS NOT NULL)) OR (("conversation_type" = ANY (ARRAY['tournament'::"text", 'announcement'::"text"])) AND ("related_tournament_id" IS NOT NULL)) OR ("conversation_type" = ANY (ARRAY['team'::"text", 'group'::"text"])))),
    CONSTRAINT "conversations_type_check" CHECK (("conversation_type" = ANY (ARRAY['direct'::"text", 'play_event'::"text", 'tournament'::"text", 'team'::"text", 'group'::"text", 'announcement'::"text"]))),
    CONSTRAINT "no_self_conversation" CHECK (("participant_a" <> "participant_b"))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."court_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "match_id" "uuid",
    "court_number" integer NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "player_a" "text",
    "player_b" "text",
    "round_label" "text",
    "score_a" integer,
    "score_b" integer,
    "winner" "text",
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."court_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."divisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "format" "public"."tournament_format" NOT NULL,
    "skill_min" numeric(3,2),
    "skill_max" numeric(3,2),
    "draw_size" integer NOT NULL,
    "entry_fee_cents" integer,
    "spots_filled" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gender_category" "text" DEFAULT 'open'::"text",
    CONSTRAINT "divisions_draw_size_check" CHECK (("draw_size" > 0)),
    CONSTRAINT "divisions_gender_category_check" CHECK (("gender_category" = ANY (ARRAY['open'::"text", 'mens'::"text", 'womens'::"text", 'mixed'::"text"])))
);


ALTER TABLE "public"."divisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dupr_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "tournament_id" "uuid",
    "rating_before" numeric(4,2),
    "rating_after" numeric(4,2) NOT NULL,
    "delta" numeric(4,2) GENERATED ALWAYS AS (("rating_after" - "rating_before")) STORED,
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dupr_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dynamic_stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "slides" "jsonb" NOT NULL,
    "cta_label" "text",
    "cta_route" "text",
    "source_type" "text",
    "source_id" "uuid",
    "priority_score" numeric DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dynamic_stories_story_type_check" CHECK (("story_type" = ANY (ARRAY['tournament'::"text", 'game'::"text", 'partner'::"text", 'court_placeholder'::"text", 'marketplace_placeholder'::"text"])))
);


ALTER TABLE "public"."dynamic_stories" OWNER TO "postgres";


COMMENT ON TABLE "public"."dynamic_stories" IS 'System-generated story cards (Dynamic Stories v0.1) — shared rows, not user-owned. Only generate_dynamic_stories() writes to this table.';



CREATE TABLE IF NOT EXISTS "public"."email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "to_email" "text" NOT NULL,
    "template_key" "text",
    "subject" "text",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "error" "text",
    "provider_id" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text" NOT NULL,
    "link" "text",
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_sponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "html_body" "text" NOT NULL,
    "variables" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "address" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "postal_code" "text",
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "coords" "public"."geography"(Point,4326),
    "phone" "text",
    "website" "text",
    "description" "text",
    "court_count" integer DEFAULT 0 NOT NULL,
    "indoor_courts" integer DEFAULT 0 NOT NULL,
    "outdoor_courts" integer DEFAULT 0 NOT NULL,
    "surface_type" "text",
    "lighting" boolean DEFAULT false NOT NULL,
    "restrooms" boolean DEFAULT false NOT NULL,
    "water" boolean DEFAULT false NOT NULL,
    "parking" boolean DEFAULT false NOT NULL,
    "public_access" boolean DEFAULT true NOT NULL,
    "membership_required" boolean DEFAULT false NOT NULL,
    "bookable_by_public" boolean DEFAULT false NOT NULL,
    "claim_status" "text" DEFAULT 'unclaimed'::"text" NOT NULL,
    "owner_user_id" "uuid",
    "verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "google_place_id" "text",
    "data_source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "google_maps_uri" "text",
    "facility_type" "text",
    "address_line_2" "text",
    "country" "text" DEFAULT 'US'::"text" NOT NULL,
    "source_url" "text",
    "pro_shop" boolean DEFAULT false NOT NULL,
    "lessons_available" boolean DEFAULT false NOT NULL,
    "open_play_available" boolean DEFAULT false NOT NULL,
    "reservation_required" boolean DEFAULT false NOT NULL,
    "booking_url" "text",
    "fee_type" "text",
    "typical_fee" "text",
    "hours_summary" "text",
    "skill_levels" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "amenities" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text",
    "data_confidence" integer,
    "last_verified_date" timestamp with time zone,
    "notes" "text",
    "import_batch_id" "uuid",
    "created_by" "uuid",
    "price_level" integer,
    "wheelchair_accessible" boolean,
    "google_rating" numeric(2,1),
    "google_rating_count" integer,
    "google_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "business_status" "text",
    CONSTRAINT "check_claim_status" CHECK (("claim_status" = ANY (ARRAY['unclaimed'::"text", 'pending'::"text", 'claimed'::"text"]))),
    CONSTRAINT "check_court_count" CHECK (("court_count" >= 0)),
    CONSTRAINT "check_court_subtotals" CHECK ((("court_count" = 0) OR (("indoor_courts" + "outdoor_courts") <= "court_count"))),
    CONSTRAINT "check_indoor_courts" CHECK (("indoor_courts" >= 0)),
    CONSTRAINT "check_latitude" CHECK ((("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric))),
    CONSTRAINT "check_longitude" CHECK ((("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric))),
    CONSTRAINT "check_outdoor_courts" CHECK (("outdoor_courts" >= 0))
);


ALTER TABLE "public"."facilities" OWNER TO "postgres";


COMMENT ON TABLE "public"."facilities" IS 'Pickleball facility directory. Supports public, private, and membership-required venues.';



COMMENT ON COLUMN "public"."facilities"."coords" IS 'PostGIS geography point kept in sync with latitude/longitude by trigger.';



COMMENT ON COLUMN "public"."facilities"."public_access" IS 'True for public parks, open courts, and general-access clubs.';



COMMENT ON COLUMN "public"."facilities"."membership_required" IS 'True for clubs, HOAs, and facilities requiring paid or approved membership.';



COMMENT ON COLUMN "public"."facilities"."bookable_by_public" IS 'True when courts can be reserved by any user through the app.';



COMMENT ON COLUMN "public"."facilities"."claim_status" IS 'unclaimed: no owner | pending: claim submitted | claimed: owner verified.';



COMMENT ON COLUMN "public"."facilities"."verified" IS 'Set to true by admin after confirming facility data.';



COMMENT ON COLUMN "public"."facilities"."hours_summary" IS 'Human-readable weekly hours block (free text).';



COMMENT ON COLUMN "public"."facilities"."status" IS 'Curation-pipeline review state (e.g. approved). Distinct from verified / claim_status.';



COMMENT ON COLUMN "public"."facilities"."data_confidence" IS 'Curation confidence score 0-100 from the directory pipeline.';



CREATE TABLE IF NOT EXISTS "public"."facility_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "facility_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "google_photo_name" "text"
);


ALTER TABLE "public"."facility_photos" OWNER TO "postgres";


COMMENT ON TABLE "public"."facility_photos" IS 'Photo gallery for each facility. is_primary marks the cover image shown in map previews.';



COMMENT ON COLUMN "public"."facility_photos"."google_photo_name" IS 'Google Places photo resource name, served via the facility-photo Edge Function.';



CREATE TABLE IF NOT EXISTS "public"."group_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "invitee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "group_invites_no_self_invite" CHECK (("inviter_id" <> "invitee_id")),
    CONSTRAINT "group_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."group_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]))),
    CONSTRAINT "group_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "post_id" "uuid"
);


ALTER TABLE "public"."group_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_poll_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "position" smallint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."group_poll_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_poll_votes" (
    "option_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."group_poll_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_post_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "parent_comment_id" "uuid"
);


ALTER TABLE "public"."group_post_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_post_likes" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."group_post_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_post_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "reported_user_id" "uuid" NOT NULL,
    "reason" "public"."report_reason" DEFAULT 'spam_or_inappropriate'::"public"."report_reason" NOT NULL,
    "notes" "text",
    "status" "public"."report_status" DEFAULT 'pending'::"public"."report_status" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_post_reports_target_type_check" CHECK (("target_type" = ANY (ARRAY['group_post'::"text", 'group_comment'::"text"])))
);


ALTER TABLE "public"."group_post_reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."group_post_reports" IS 'Reports filed against group Feed posts/comments. Reviewed via the same admin workflow as user_reports.';



CREATE TABLE IF NOT EXISTS "public"."group_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'post'::"text" NOT NULL,
    "body" "text",
    "related_play_event_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "edited_at" timestamp with time zone,
    CONSTRAINT "group_posts_kind_check" CHECK (("kind" = ANY (ARRAY['post'::"text", 'poll'::"text"])))
);


ALTER TABLE "public"."group_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "location" "text",
    "skill" "text",
    "privacy" "text" DEFAULT 'private'::"text" NOT NULL,
    "allow_invites" boolean DEFAULT true NOT NULL,
    "allow_posts" boolean DEFAULT true NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "groups_privacy_check" CHECK (("privacy" = ANY (ARRAY['public'::"text", 'private'::"text", 'secret'::"text"])))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."groups" IS 'Real backend for the Groups feature (community groups, not Community Play events).';



CREATE TABLE IF NOT EXISTS "public"."location_settings" (
    "user_id" "uuid" NOT NULL,
    "tournament_radius" "text" DEFAULT '50 mi'::"text" NOT NULL,
    "community_radius" "text" DEFAULT '25 mi'::"text" NOT NULL,
    "partner_radius" "text" DEFAULT '50 mi'::"text" NOT NULL,
    "marketplace_radius" "text" DEFAULT '50 mi'::"text" NOT NULL,
    "willing_to_ship" boolean DEFAULT true NOT NULL,
    "local_events" boolean DEFAULT true NOT NULL,
    "regional_events" boolean DEFAULT true NOT NULL,
    "major_events" boolean DEFAULT true NOT NULL,
    "national_events" boolean DEFAULT false NOT NULL,
    "show_city" boolean DEFAULT true NOT NULL,
    "show_exact_location" boolean DEFAULT false NOT NULL,
    "allow_distance_matching" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchmaking_swipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "direction" "public"."match_direction" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_self_swipe" CHECK (("requester_id" <> "target_id"))
);


ALTER TABLE "public"."matchmaking_swipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_reactions" IS 'Emoji tapback reactions on chat messages. One row per (message, user, emoji) — a user may react to the same message with multiple different emoji.';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "body" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachment_url" "text",
    "attachment_type" "text",
    "attachment_name" "text",
    CONSTRAINT "messages_attachment_type_check" CHECK ((("attachment_type" IS NULL) OR ("attachment_type" = ANY (ARRAY['image'::"text", 'file'::"text"])))),
    CONSTRAINT "messages_body_length_check" CHECK ((("body" IS NULL) OR ("length"("body") <= 2000))),
    CONSTRAINT "messages_body_or_attachment_check" CHECK ((("attachment_url" IS NOT NULL) OR (("body" IS NOT NULL) AND ("length"("body") > 0))))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."par_algorithm_versions" (
    "version" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "configuration" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "activated_at" timestamp with time zone,
    "retired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."par_algorithm_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "partner_likes_kind_check" CHECK (("kind" = ANY (ARRAY['like'::"text", 'save'::"text"])))
);


ALTER TABLE "public"."partner_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid" NOT NULL,
    "matched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_a_lt_user_b" CHECK (("user_a" < "user_b"))
);


ALTER TABLE "public"."partner_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partner_preferences" (
    "user_id" "uuid" NOT NULL,
    "actively_looking" boolean DEFAULT true NOT NULL,
    "game_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "skill_ranges" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "distance_idx" smallint DEFAULT 1 NOT NULL,
    "preferred_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "preferred_times" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "gender_preference" "text" DEFAULT 'No Preference'::"text" NOT NULL,
    "age_preference" "text" DEFAULT 'No Preference'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."partner_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_game_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "session_participant_id" "uuid" NOT NULL,
    "team_number" integer NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_game_participants_position_check" CHECK (("position" > 0)),
    CONSTRAINT "personal_game_participants_team_number_check" CHECK (("team_number" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."personal_game_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_guest_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "phone" "text",
    "email" "text",
    "estimated_skill" "text",
    "gender" "text",
    "age_group" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_guest_players_display_name_not_blank" CHECK (("btrim"("display_name") <> ''::"text"))
);


ALTER TABLE "public"."personal_guest_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personal_match_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "session_participant_id" "uuid" NOT NULL,
    "guest_share_id" "uuid" NOT NULL,
    "guest_player_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "claimed_by_profile_id" "uuid",
    "claimed_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personal_match_claims_claimed_fields" CHECK (((("status" = 'claimed'::"text") AND ("claimed_by_profile_id" IS NOT NULL) AND ("claimed_at" IS NOT NULL)) OR ("status" <> 'claimed'::"text"))),
    CONSTRAINT "personal_match_claims_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'claimed'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."personal_match_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "text" DEFAULT ''::"text" NOT NULL,
    "value_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "options" "text"[],
    "unit" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."play_event_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "play_event_id" "uuid" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "invitee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "play_event_invites_no_self_invite" CHECK (("inviter_id" <> "invitee_id")),
    CONSTRAINT "play_event_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."play_event_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."play_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "event_type" "public"."play_event_type" DEFAULT 'round_robin'::"public"."play_event_type" NOT NULL,
    "venue_name" "text",
    "location" "text" NOT NULL,
    "city" "text",
    "state" "text",
    "event_date" "date" NOT NULL,
    "start_time" time without time zone,
    "skill_min" numeric(3,2),
    "skill_max" numeric(3,2),
    "max_players" integer NOT NULL,
    "format" "text",
    "notes" "text",
    "status" "public"."play_event_status" DEFAULT 'open'::"public"."play_event_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_url" "text",
    "facility_id" "uuid",
    "group_id" "uuid",
    "duration_minutes" integer,
    "instructor_id" "uuid",
    CONSTRAINT "check_play_skill_range" CHECK ((("skill_min" IS NULL) OR ("skill_max" IS NULL) OR ("skill_min" <= "skill_max"))),
    CONSTRAINT "play_events_max_players_check" CHECK ((("max_players" > 0) AND ("max_players" <= 200)))
);


ALTER TABLE "public"."play_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."play_events"."facility_id" IS 'Optional link to the facilities directory. location/venue_name remain the primary free-text fields.';



COMMENT ON COLUMN "public"."play_events"."duration_minutes" IS 'Event duration in minutes; nullable — older events have no computed end time.';



CREATE TABLE IF NOT EXISTS "public"."play_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "court" integer,
    "player_a_id" "uuid",
    "player_b_id" "uuid",
    "score_a" integer,
    "score_b" integer,
    "winner" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "player_a2_id" "uuid",
    "player_b2_id" "uuid",
    "match_number" integer,
    CONSTRAINT "play_matches_winner_check" CHECK (("winner" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."play_matches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."play_matches"."player_a2_id" IS 'Partner of player_a in doubles/rotating formats; null for singles.';



COMMENT ON COLUMN "public"."play_matches"."player_b2_id" IS 'Partner of player_b in doubles/rotating formats; null for singles.';



COMMENT ON COLUMN "public"."play_matches"."match_number" IS 'Ordering of this match within its round (1-based). NULL on legacy rows.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'player'::"public"."user_role" NOT NULL,
    "full_name" "text" NOT NULL,
    "handle" "text",
    "email" "text" NOT NULL,
    "avatar_url" "text",
    "location_city" "text",
    "location_state" "text",
    "location_coords" "public"."geography"(Point,4326),
    "dupr" numeric(4,2),
    "dupr_verified" boolean DEFAULT false NOT NULL,
    "paddle" "text",
    "hand" "text",
    "play_style" "text",
    "availability" "text",
    "bio" "text",
    "stripe_customer_id" "text",
    "director_status" "public"."director_status",
    "director_approved_at" timestamp with time zone,
    "director_approved_by" "uuid",
    "director_rating" numeric(2,1),
    "director_events_hosted" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "skill_level" "text",
    "cover_url" "text",
    "is_discoverable" boolean DEFAULT true NOT NULL,
    "looking_status" "text" DEFAULT 'actively_looking'::"text" NOT NULL,
    "notif_new_match" boolean DEFAULT true NOT NULL,
    "notif_liked_you" boolean DEFAULT true NOT NULL,
    "notif_hold_expiry" boolean DEFAULT true NOT NULL,
    "notif_tournaments" boolean DEFAULT true NOT NULL,
    "is_director" boolean DEFAULT false NOT NULL,
    "stripe_connect_account_id" "text",
    "stripe_connect_onboarded_at" timestamp with time zone,
    "self_rating" "text",
    "date_of_birth" "date",
    "availability_schedule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "location_lat" double precision,
    "location_lng" double precision,
    "home_court_id" "uuid",
    "story_radius_miles" integer DEFAULT 25 NOT NULL,
    CONSTRAINT "profiles_director_rating_check" CHECK ((("director_rating" >= (0)::numeric) AND ("director_rating" <= (5)::numeric))),
    CONSTRAINT "profiles_dupr_check" CHECK ((("dupr" >= 2.0) AND ("dupr" <= 8.0))),
    CONSTRAINT "profiles_hand_check" CHECK (("hand" = ANY (ARRAY['right'::"text", 'left'::"text", 'ambidextrous'::"text"]))),
    CONSTRAINT "profiles_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['2.5-3.0'::"text", '3.0-3.5'::"text", '3.5-4.0'::"text", '4.0-4.5'::"text", '4.5+'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."availability_schedule" IS 'Weekly availability grid: { mon: ["morning","evening"], tue: [], ... }. Values per day are a subset of morning/afternoon/evening.';



CREATE OR REPLACE VIEW "public"."play_participants_authenticated" AS
 SELECT "pp"."id",
    "pp"."event_id",
    "pp"."first_name",
    "pp"."last_initial",
    "pp"."self_rating",
    "pp"."gender",
    "pp"."claimed_by",
    ("pp"."claimed_by" IS NOT NULL) AS "is_claimed",
    "pp"."created_at",
    "prof"."avatar_url",
    "prof"."location_city",
    "prof"."location_state",
    "prof"."self_rating" AS "profile_self_rating"
   FROM ("public"."play_participants" "pp"
     LEFT JOIN "public"."profiles" "prof" ON (("prof"."id" = "pp"."claimed_by")));


ALTER VIEW "public"."play_participants_authenticated" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."play_participants_public" AS
 SELECT "pp"."id",
    "pp"."event_id",
    "pp"."first_name",
    "pp"."last_initial",
    "pp"."self_rating",
    "pp"."gender",
    ("pp"."claimed_by" IS NOT NULL) AS "is_claimed",
    "pp"."created_at",
    "prof"."avatar_url",
    "prof"."location_city",
    "prof"."location_state",
    "prof"."self_rating" AS "profile_self_rating"
   FROM ("public"."play_participants" "pp"
     LEFT JOIN "public"."profiles" "prof" ON (("prof"."id" = "pp"."claimed_by")));


ALTER VIEW "public"."play_participants_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_hidden_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "match_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_hidden_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_tokens" IS 'Expo push tokens registered by a signed-in user''s device(s). Populated by client-side registration (not yet built).';



CREATE TABLE IF NOT EXISTS "public"."registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "division_id" "uuid",
    "player_id" "uuid" NOT NULL,
    "partner_id" "uuid",
    "status" "public"."registration_status" DEFAULT 'held'::"public"."registration_status" NOT NULL,
    "hold_fee_paid_cents" integer DEFAULT 0 NOT NULL,
    "entry_fee_paid_cents" integer DEFAULT 0 NOT NULL,
    "hold_expires_at" timestamp with time zone,
    "stripe_hold_intent_id" "text",
    "stripe_entry_intent_id" "text",
    "director_added" boolean DEFAULT false NOT NULL,
    "added_by_director_id" "uuid",
    "replaces_registration_id" "uuid",
    "checked_in_at" timestamp with time zone,
    "checked_in_by" "uuid",
    "waiver_accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "waitlist_position" integer,
    "waitlist_offer_expires_at" timestamp with time zone,
    "hold_expired_at" timestamp with time zone,
    "needs_partner" boolean DEFAULT false NOT NULL,
    "converted_at" timestamp with time zone
);


ALTER TABLE "public"."registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_play_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "play_event_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_play_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."story_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."story_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_bookmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tournament_bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_sponsors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "logo_url" "text",
    "website_url" "text",
    "tier" "text" DEFAULT 'standard'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tournament_sponsors_tier_check" CHECK (("tier" = ANY (ARRAY['title'::"text", 'gold'::"text", 'silver'::"text", 'standard'::"text"])))
);


ALTER TABLE "public"."tournament_sponsors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "director_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "venue_name" "text",
    "venue_address" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "cover_img_url" "text",
    "description" "text",
    "rules" "text",
    "format" "public"."tournament_format" NOT NULL,
    "bracket_type" "public"."bracket_type" DEFAULT 'single_elim'::"public"."bracket_type" NOT NULL,
    "skill_min" numeric(3,2),
    "skill_max" numeric(3,2),
    "draw_size" integer NOT NULL,
    "event_date" "date" NOT NULL,
    "registration_opens_at" timestamp with time zone,
    "registration_closes_at" timestamp with time zone,
    "checkin_opens_at" timestamp with time zone,
    "checkin_closes_at" timestamp with time zone,
    "entry_fee_cents" integer NOT NULL,
    "hold_fee_cents" integer NOT NULL,
    "hold_duration_hours" integer DEFAULT 72 NOT NULL,
    "prize_pool_cents" integer,
    "status" "public"."tournament_status" DEFAULT 'draft'::"public"."tournament_status" NOT NULL,
    "spots_filled" integer DEFAULT 0 NOT NULL,
    "submitted_for_approval_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "approved_by" "uuid",
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "zip_code" "text",
    "formats" "text"[] DEFAULT '{}'::"text"[],
    "rejected_reason" "text",
    "featured" boolean DEFAULT false NOT NULL,
    "cancellation_policy" "text" DEFAULT 'Full refund if cancelled 7 or more days before the event. 50% refund if cancelled 3–6 days before. No refund within 72 hours of the event start.'::"text",
    "tournament_format" "text" DEFAULT 'single_elim'::"text",
    "pool_count" integer DEFAULT 4,
    "hold_cutoff_days" integer DEFAULT 7 NOT NULL,
    "facility_id" "uuid",
    CONSTRAINT "check_hold_lte_entry" CHECK (("hold_fee_cents" <= "entry_fee_cents")),
    CONSTRAINT "check_reg_before_event" CHECK ((("registration_closes_at" IS NULL) OR (("registration_closes_at")::"date" <= "event_date"))),
    CONSTRAINT "check_reg_dates" CHECK ((("registration_opens_at" IS NULL) OR ("registration_closes_at" IS NULL) OR ("registration_opens_at" < "registration_closes_at"))),
    CONSTRAINT "check_skill_range" CHECK ((("skill_min" IS NULL) OR ("skill_max" IS NULL) OR ("skill_min" <= "skill_max"))),
    CONSTRAINT "tournaments_check" CHECK ((("hold_fee_cents" >= 0) AND ("hold_fee_cents" <= "entry_fee_cents"))),
    CONSTRAINT "tournaments_draw_size_check" CHECK (("draw_size" > 0)),
    CONSTRAINT "tournaments_entry_fee_cents_check" CHECK (("entry_fee_cents" >= 0)),
    CONSTRAINT "tournaments_prize_pool_cents_check" CHECK (("prize_pool_cents" >= 0))
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tournaments"."facility_id" IS 'Optional link to the facilities directory. venue_name/venue_address remain the primary free-text fields.';



CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "registration_id" "uuid",
    "player_id" "uuid" NOT NULL,
    "tournament_id" "uuid",
    "type" "public"."transaction_type" NOT NULL,
    "amount_cents" integer NOT NULL,
    "stripe_id" "text",
    "status" "public"."transaction_status" DEFAULT 'pending'::"public"."transaction_status" NOT NULL,
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "reported_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "reason" "public"."report_reason" DEFAULT 'spam_or_inappropriate'::"public"."report_reason" NOT NULL,
    "notes" "text",
    "status" "public"."report_status" DEFAULT 'pending'::"public"."report_status" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_reports" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_director_earnings" WITH ("security_invoker"='on') AS
 SELECT "t"."director_id",
    "t"."id" AS "tournament_id",
    "t"."name" AS "tournament_name",
    "t"."event_date",
    "count"("r"."id") FILTER (WHERE ("r"."status" = ANY (ARRAY['registered'::"public"."registration_status", 'checked_in'::"public"."registration_status", 'substitute'::"public"."registration_status"]))) AS "confirmed_registrations",
    "sum"("r"."entry_fee_paid_cents") FILTER (WHERE ("r"."status" = ANY (ARRAY['registered'::"public"."registration_status", 'checked_in'::"public"."registration_status", 'substitute'::"public"."registration_status"]))) AS "gross_entry_cents",
    "sum"("r"."hold_fee_paid_cents") AS "gross_hold_cents",
    "round"((("sum"("r"."entry_fee_paid_cents") FILTER (WHERE ("r"."status" = ANY (ARRAY['registered'::"public"."registration_status", 'checked_in'::"public"."registration_status", 'substitute'::"public"."registration_status"]))))::numeric * 0.12)) AS "platform_fee_cents",
    ("round"((("sum"("r"."entry_fee_paid_cents") FILTER (WHERE ("r"."status" = ANY (ARRAY['registered'::"public"."registration_status", 'checked_in'::"public"."registration_status", 'substitute'::"public"."registration_status"]))))::numeric * 0.88)) + (COALESCE("sum"("r"."hold_fee_paid_cents"), (0)::bigint))::numeric) AS "director_payout_cents"
   FROM ("public"."tournaments" "t"
     LEFT JOIN "public"."registrations" "r" ON (("r"."tournament_id" = "t"."id")))
  GROUP BY "t"."director_id", "t"."id", "t"."name", "t"."event_date";


ALTER VIEW "public"."v_director_earnings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_mutual_matches" AS
 SELECT "a"."requester_id" AS "user_a",
    "a"."target_id" AS "user_b",
    GREATEST("a"."created_at", "b"."created_at") AS "matched_at"
   FROM ("public"."matchmaking_swipes" "a"
     JOIN "public"."matchmaking_swipes" "b" ON ((("b"."requester_id" = "a"."target_id") AND ("b"."target_id" = "a"."requester_id") AND ("b"."direction" = 'like'::"public"."match_direction"))))
  WHERE (("a"."direction" = 'like'::"public"."match_direction") AND (NOT (EXISTS ( SELECT 1
           FROM "public"."blocked_users" "bl"
          WHERE ((("bl"."blocker_id" = "a"."requester_id") AND ("bl"."blocked_id" = "a"."target_id")) OR (("bl"."blocker_id" = "a"."target_id") AND ("bl"."blocked_id" = "a"."requester_id")))))));


ALTER VIEW "public"."v_mutual_matches" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_tournament_listing" WITH ("security_invoker"='on') AS
 SELECT "t"."id",
    "t"."name",
    "t"."slug",
    "t"."city",
    "t"."state",
    "t"."venue_name",
    "t"."cover_img_url",
    "t"."format",
    "t"."bracket_type",
    "t"."skill_min",
    "t"."skill_max",
    "t"."draw_size",
    "t"."spots_filled",
    ("t"."draw_size" - "t"."spots_filled") AS "spots_remaining",
    "round"(((("t"."spots_filled")::numeric / (NULLIF("t"."draw_size", 0))::numeric) * (100)::numeric), 1) AS "fill_pct",
    "t"."entry_fee_cents",
    "t"."hold_fee_cents",
    "t"."prize_pool_cents",
    "t"."event_date",
    "t"."registration_closes_at",
    "t"."status",
    ("t"."event_date" < CURRENT_DATE) AS "is_past",
    "p"."full_name" AS "director_name",
    "p"."director_rating"
   FROM ("public"."tournaments" "t"
     JOIN "public"."profiles" "p" ON (("p"."id" = "t"."director_id")))
  WHERE ("t"."status" <> ALL (ARRAY['draft'::"public"."tournament_status", 'pending_approval'::"public"."tournament_status", 'cancelled'::"public"."tournament_status"]));


ALTER VIEW "public"."v_tournament_listing" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "amount" numeric(12,2),
    "currency_code" "text",
    "external_reference_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wallet_activity" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_activity" IS 'User-facing activity timeline per wallet item (e.g. "Credit added", "$18.00 used"). Not for technical/system logs.';



CREATE TABLE IF NOT EXISTS "public"."wallet_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "partner_id" "uuid",
    "type" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "description" "text",
    "value_amount" numeric(12,2),
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "value_label" "text",
    "original_value_amount" numeric(12,2),
    "remaining_value_amount" numeric(12,2),
    "starts_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "redeemed_at" timestamp with time zone,
    "action_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "action_label" "text",
    "action_url" "text",
    "external_system" "text",
    "external_customer_id" "text",
    "external_account_id" "text",
    "external_reference_id" "text",
    "source_type" "text",
    "source_id" "text",
    "is_seen" boolean DEFAULT false NOT NULL,
    "seen_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_wallet_item_action_type" CHECK (("action_type" = ANY (ARRAY['external_url'::"text", 'internal_route'::"text", 'redemption'::"text", 'view_details'::"text", 'none'::"text"]))),
    CONSTRAINT "check_wallet_item_status" CHECK (("status" = ANY (ARRAY['processing'::"text", 'new'::"text", 'available'::"text", 'active'::"text", 'partially_redeemed'::"text", 'redeemed'::"text", 'expired'::"text", 'revoked'::"text", 'failed'::"text"]))),
    CONSTRAINT "check_wallet_item_type" CHECK (("type" = ANY (ARRAY['credit'::"text", 'membership'::"text", 'offer'::"text", 'pass'::"text", 'ticket'::"text", 'reward'::"text"])))
);


ALTER TABLE "public"."wallet_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_items" IS 'Generic user-owned wallet benefit/entitlement. One table for all types — differences are represented via type/metadata, not separate tables.';



COMMENT ON COLUMN "public"."wallet_items"."source_type" IS 'Origin of this item, e.g. stripe_invoice, admin_grant — paired with source_id for idempotent issuance.';



CREATE TABLE IF NOT EXISTS "public"."wallet_partners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "website_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wallet_partners" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_partners" IS 'Organizations (internal or external) associated with wallet_items — e.g. Pickleball Grip Doctor.';



CREATE TABLE IF NOT EXISTS "public"."wallet_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_item_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "amount" numeric(12,2),
    "currency_code" "text",
    "external_order_id" "text",
    "external_reference_id" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "failure_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_wallet_redemption_status" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."wallet_redemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."wallet_redemptions" IS 'Redemption attempts per wallet item. Phase 1 has no client-facing redemption flow yet — table exists for future use and to keep the schema stable.';



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bracket_seeds"
    ADD CONSTRAINT "bracket_seeds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bracket_seeds"
    ADD CONSTRAINT "bracket_seeds_tournament_id_player_id_key" UNIQUE ("tournament_id", "player_id");



ALTER TABLE ONLY "public"."bracket_seeds"
    ADD CONSTRAINT "bracket_seeds_tournament_id_seed_number_key" UNIQUE ("tournament_id", "seed_number");



ALTER TABLE ONLY "public"."conversation_participant_settings"
    ADD CONSTRAINT "conversation_participant_settings_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."court_assignments"
    ADD CONSTRAINT "court_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."court_assignments"
    ADD CONSTRAINT "court_assignments_tournament_id_court_number_key" UNIQUE ("tournament_id", "court_number");



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dupr_history"
    ADD CONSTRAINT "dupr_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dynamic_stories"
    ADD CONSTRAINT "dynamic_stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_log"
    ADD CONSTRAINT "email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sponsors"
    ADD CONSTRAINT "email_sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."facility_photos"
    ADD CONSTRAINT "facility_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_group_id_invitee_id_key" UNIQUE ("group_id", "invitee_id");



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_photos"
    ADD CONSTRAINT "group_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_poll_options"
    ADD CONSTRAINT "group_poll_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_poll_votes"
    ADD CONSTRAINT "group_poll_votes_pkey" PRIMARY KEY ("option_id", "user_id");



ALTER TABLE ONLY "public"."group_post_comments"
    ADD CONSTRAINT "group_post_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_post_likes"
    ADD CONSTRAINT "group_post_likes_pkey" PRIMARY KEY ("post_id", "user_id");



ALTER TABLE ONLY "public"."group_post_reports"
    ADD CONSTRAINT "group_post_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_posts"
    ADD CONSTRAINT "group_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_settings"
    ADD CONSTRAINT "location_settings_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."matchmaking_swipes"
    ADD CONSTRAINT "matchmaking_swipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."par_algorithm_versions"
    ADD CONSTRAINT "par_algorithm_versions_pkey" PRIMARY KEY ("version");



ALTER TABLE ONLY "public"."par_game_processing"
    ADD CONSTRAINT "par_game_processing_pkey" PRIMARY KEY ("game_id");



ALTER TABLE ONLY "public"."par_rating_events"
    ADD CONSTRAINT "par_rating_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_likes"
    ADD CONSTRAINT "partner_likes_from_user_id_to_user_id_kind_key" UNIQUE ("from_user_id", "to_user_id", "kind");



ALTER TABLE ONLY "public"."partner_likes"
    ADD CONSTRAINT "partner_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_matches"
    ADD CONSTRAINT "partner_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."partner_matches"
    ADD CONSTRAINT "partner_matches_user_a_user_b_key" UNIQUE ("user_a", "user_b");



ALTER TABLE ONLY "public"."partner_preferences"
    ADD CONSTRAINT "partner_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."personal_game_participants"
    ADD CONSTRAINT "personal_game_participants_once_per_game" UNIQUE ("game_id", "session_participant_id");



ALTER TABLE ONLY "public"."personal_game_participants"
    ADD CONSTRAINT "personal_game_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_game_participants"
    ADD CONSTRAINT "personal_game_participants_unique_position" UNIQUE ("game_id", "team_number", "position");



ALTER TABLE ONLY "public"."personal_games"
    ADD CONSTRAINT "personal_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_games"
    ADD CONSTRAINT "personal_games_unique_number" UNIQUE ("session_id", "game_number");



ALTER TABLE ONLY "public"."personal_guest_players"
    ADD CONSTRAINT "personal_guest_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_session_guest_unique" UNIQUE ("session_id", "guest_player_id");



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_unique_participant" UNIQUE ("session_participant_id");



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."personal_session_participants"
    ADD CONSTRAINT "personal_session_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."personal_sessions"
    ADD CONSTRAINT "personal_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."play_event_invites"
    ADD CONSTRAINT "play_event_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."play_event_invites"
    ADD CONSTRAINT "play_event_invites_play_event_id_invitee_id_key" UNIQUE ("play_event_id", "invitee_id");



ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."play_matches"
    ADD CONSTRAINT "play_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."play_participants"
    ADD CONSTRAINT "play_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_par_profiles"
    ADD CONSTRAINT "player_par_profiles_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."profile_hidden_matches"
    ADD CONSTRAINT "profile_hidden_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_hidden_matches"
    ADD CONSTRAINT "profile_hidden_matches_player_id_match_id_key" UNIQUE ("player_id", "match_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_handle_key" UNIQUE ("handle");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_connect_account_id_key" UNIQUE ("stripe_connect_account_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("user_id", "expo_push_token");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_play_events"
    ADD CONSTRAINT "saved_play_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_play_events"
    ADD CONSTRAINT "saved_play_events_player_id_play_event_id_key" UNIQUE ("player_id", "play_event_id");



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_user_id_key" UNIQUE ("story_id", "user_id");



ALTER TABLE ONLY "public"."tournament_bookmarks"
    ADD CONSTRAINT "tournament_bookmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_bookmarks"
    ADD CONSTRAINT "tournament_bookmarks_player_id_tournament_id_key" UNIQUE ("player_id", "tournament_id");



ALTER TABLE ONLY "public"."tournament_sponsors"
    ADD CONSTRAINT "tournament_sponsors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_stripe_id_key" UNIQUE ("stripe_id");



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "unique_block" UNIQUE ("blocker_id", "blocked_id");



ALTER TABLE ONLY "public"."group_post_reports"
    ADD CONSTRAINT "unique_open_group_report" UNIQUE ("reporter_id", "target_type", "target_id");



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "unique_open_report" UNIQUE ("reporter_id", "reported_id");



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "uq_match_per_round" UNIQUE ("tournament_id", "division_id", "round", "match_number");



ALTER TABLE ONLY "public"."play_participants"
    ADD CONSTRAINT "uq_play_participant_email_per_event" UNIQUE ("event_id", "email");



ALTER TABLE ONLY "public"."matchmaking_swipes"
    ADD CONSTRAINT "uq_swipe" UNIQUE ("requester_id", "target_id");



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_activity"
    ADD CONSTRAINT "wallet_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_items"
    ADD CONSTRAINT "wallet_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_partners"
    ADD CONSTRAINT "wallet_partners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_partners"
    ADD CONSTRAINT "wallet_partners_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."wallet_redemptions"
    ADD CONSTRAINT "wallet_redemptions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_blocked_users_blocked" ON "public"."blocked_users" USING "btree" ("blocked_id");



CREATE INDEX "idx_blocked_users_blocker" ON "public"."blocked_users" USING "btree" ("blocker_id");



CREATE INDEX "idx_bracket_division" ON "public"."bracket_matches" USING "btree" ("division_id");



CREATE INDEX "idx_bracket_matches_next_match_id" ON "public"."bracket_matches" USING "btree" ("next_match_id");



CREATE INDEX "idx_bracket_matches_score_entered_by" ON "public"."bracket_matches" USING "btree" ("score_entered_by");



CREATE INDEX "idx_bracket_matches_team1_player_a" ON "public"."bracket_matches" USING "btree" ("team1_player_a");



CREATE INDEX "idx_bracket_matches_team1_player_b" ON "public"."bracket_matches" USING "btree" ("team1_player_b");



CREATE INDEX "idx_bracket_matches_team2_player_a" ON "public"."bracket_matches" USING "btree" ("team2_player_a");



CREATE INDEX "idx_bracket_matches_team2_player_b" ON "public"."bracket_matches" USING "btree" ("team2_player_b");



CREATE INDEX "idx_bracket_round" ON "public"."bracket_matches" USING "btree" ("tournament_id", "round");



CREATE INDEX "idx_bracket_tournament" ON "public"."bracket_matches" USING "btree" ("tournament_id");



CREATE INDEX "idx_conversation_participant_settings_user" ON "public"."conversation_participant_settings" USING "btree" ("user_id");



CREATE INDEX "idx_conversation_participants_user" ON "public"."conversation_participants" USING "btree" ("user_id", "conversation_id");



CREATE INDEX "idx_conversations_a" ON "public"."conversations" USING "btree" ("participant_a");



CREATE INDEX "idx_conversations_b" ON "public"."conversations" USING "btree" ("participant_b");



CREATE INDEX "idx_conversations_created_by" ON "public"."conversations" USING "btree" ("created_by");



CREATE INDEX "idx_conversations_last_msg" ON "public"."conversations" USING "btree" ("last_message_at" DESC NULLS LAST);



CREATE INDEX "idx_conversations_related_play_event" ON "public"."conversations" USING "btree" ("related_play_event_id");



CREATE INDEX "idx_conversations_related_tournament" ON "public"."conversations" USING "btree" ("related_tournament_id");



CREATE INDEX "idx_conversations_type" ON "public"."conversations" USING "btree" ("conversation_type");



CREATE INDEX "idx_divisions_tournament" ON "public"."divisions" USING "btree" ("tournament_id");



CREATE INDEX "idx_dupr_history_player" ON "public"."dupr_history" USING "btree" ("player_id", "recorded_at" DESC);



CREATE INDEX "idx_dupr_history_tournament_id" ON "public"."dupr_history" USING "btree" ("tournament_id");



CREATE INDEX "idx_dynamic_stories_type_expires" ON "public"."dynamic_stories" USING "btree" ("story_type", "expires_at");



CREATE INDEX "idx_facilities_city_state" ON "public"."facilities" USING "btree" ("city", "state");



CREATE INDEX "idx_facilities_claim_status" ON "public"."facilities" USING "btree" ("claim_status");



CREATE INDEX "idx_facilities_coords" ON "public"."facilities" USING "gist" ("coords");



CREATE INDEX "idx_facilities_data_source" ON "public"."facilities" USING "btree" ("data_source");



CREATE INDEX "idx_facilities_name_trgm" ON "public"."facilities" USING "gin" ("lower"("name") "public"."gin_trgm_ops");



CREATE INDEX "idx_facilities_owner" ON "public"."facilities" USING "btree" ("owner_user_id");



CREATE INDEX "idx_facilities_public_access" ON "public"."facilities" USING "btree" ("public_access");



CREATE INDEX "idx_facilities_verified" ON "public"."facilities" USING "btree" ("verified");



CREATE INDEX "idx_facility_photos_facility" ON "public"."facility_photos" USING "btree" ("facility_id");



CREATE INDEX "idx_facility_photos_primary" ON "public"."facility_photos" USING "btree" ("facility_id") WHERE ("is_primary" = true);



CREATE INDEX "idx_group_invites_group_status" ON "public"."group_invites" USING "btree" ("group_id", "status");



CREATE INDEX "idx_group_invites_invitee_status" ON "public"."group_invites" USING "btree" ("invitee_id", "status");



CREATE INDEX "idx_group_members_user" ON "public"."group_members" USING "btree" ("user_id", "group_id");



CREATE INDEX "idx_group_photos_group" ON "public"."group_photos" USING "btree" ("group_id", "created_at" DESC);



CREATE INDEX "idx_group_photos_post" ON "public"."group_photos" USING "btree" ("post_id");



CREATE INDEX "idx_group_poll_options_post" ON "public"."group_poll_options" USING "btree" ("post_id");



CREATE INDEX "idx_group_post_comments_parent" ON "public"."group_post_comments" USING "btree" ("parent_comment_id");



CREATE INDEX "idx_group_post_comments_post" ON "public"."group_post_comments" USING "btree" ("post_id", "created_at");



CREATE INDEX "idx_group_post_reports_group" ON "public"."group_post_reports" USING "btree" ("group_id");



CREATE INDEX "idx_group_post_reports_status" ON "public"."group_post_reports" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_group_post_reports_target" ON "public"."group_post_reports" USING "btree" ("target_type", "target_id");



CREATE INDEX "idx_group_posts_group" ON "public"."group_posts" USING "btree" ("group_id", "created_at" DESC);



CREATE INDEX "idx_groups_organizer" ON "public"."groups" USING "btree" ("organizer_id");



CREATE INDEX "idx_groups_privacy" ON "public"."groups" USING "btree" ("privacy");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "read_at");



CREATE INDEX "idx_par_game_processing_session" ON "public"."par_game_processing" USING "btree" ("session_id", "status");



CREATE INDEX "idx_par_game_processing_status" ON "public"."par_game_processing" USING "btree" ("status", "last_evaluated_at" DESC);



CREATE INDEX "idx_par_rating_events_profile_processed" ON "public"."par_rating_events" USING "btree" ("profile_id", "processed_at" DESC);



CREATE INDEX "idx_par_rating_events_session_game" ON "public"."par_rating_events" USING "btree" ("session_id", "game_id");



CREATE INDEX "idx_personal_game_participants_session_participant" ON "public"."personal_game_participants" USING "btree" ("session_participant_id");



CREATE INDEX "idx_personal_games_session" ON "public"."personal_games" USING "btree" ("session_id", "game_number");



CREATE INDEX "idx_personal_guest_shares_guest" ON "public"."personal_guest_shares" USING "btree" ("guest_player_id");



CREATE INDEX "idx_personal_guest_shares_session" ON "public"."personal_guest_shares" USING "btree" ("session_id");



CREATE INDEX "idx_personal_match_claims_claimed_by" ON "public"."personal_match_claims" USING "btree" ("claimed_by_profile_id");



CREATE INDEX "idx_personal_match_claims_guest_share" ON "public"."personal_match_claims" USING "btree" ("guest_share_id");



CREATE INDEX "idx_personal_match_claims_session" ON "public"."personal_match_claims" USING "btree" ("session_id");



CREATE INDEX "idx_personal_session_participants_profile" ON "public"."personal_session_participants" USING "btree" ("profile_id");



CREATE INDEX "idx_personal_sessions_created_by" ON "public"."personal_sessions" USING "btree" ("created_by", "played_at" DESC);



CREATE INDEX "idx_personal_sessions_facility" ON "public"."personal_sessions" USING "btree" ("facility_id");



CREATE INDEX "idx_play_events_date" ON "public"."play_events" USING "btree" ("event_date");



CREATE INDEX "idx_play_events_facility" ON "public"."play_events" USING "btree" ("facility_id") WHERE ("facility_id" IS NOT NULL);



CREATE INDEX "idx_play_events_group" ON "public"."play_events" USING "btree" ("group_id");



CREATE INDEX "idx_play_events_organizer" ON "public"."play_events" USING "btree" ("organizer_id");



CREATE INDEX "idx_play_events_status" ON "public"."play_events" USING "btree" ("status");



CREATE INDEX "idx_play_matches_event" ON "public"."play_matches" USING "btree" ("event_id");



CREATE INDEX "idx_play_matches_player_a" ON "public"."play_matches" USING "btree" ("player_a_id");



CREATE INDEX "idx_play_matches_player_b" ON "public"."play_matches" USING "btree" ("player_b_id");



CREATE INDEX "idx_play_participants_claimed" ON "public"."play_participants" USING "btree" ("claimed_by");



CREATE INDEX "idx_play_participants_email" ON "public"."play_participants" USING "btree" ("lower"("email"));



CREATE INDEX "idx_play_participants_event" ON "public"."play_participants" USING "btree" ("event_id");



CREATE INDEX "idx_player_par_profiles_last_rated" ON "public"."player_par_profiles" USING "btree" ("last_rated_at" DESC);



CREATE INDEX "idx_profile_hidden_matches_match_id" ON "public"."profile_hidden_matches" USING "btree" ("match_id");



CREATE INDEX "idx_profiles_director_approved_by" ON "public"."profiles" USING "btree" ("director_approved_by");



CREATE INDEX "idx_profiles_dupr" ON "public"."profiles" USING "btree" ("dupr");



CREATE INDEX "idx_profiles_handle" ON "public"."profiles" USING "btree" ("handle");



CREATE INDEX "idx_profiles_home_court" ON "public"."profiles" USING "btree" ("home_court_id");



CREATE INDEX "idx_profiles_location_coords" ON "public"."profiles" USING "gist" ("location_coords");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_registrations_added_by_director_id" ON "public"."registrations" USING "btree" ("added_by_director_id");



CREATE INDEX "idx_registrations_checked_in_by" ON "public"."registrations" USING "btree" ("checked_in_by");



CREATE INDEX "idx_registrations_division_id" ON "public"."registrations" USING "btree" ("division_id");



CREATE INDEX "idx_registrations_hold_expiry" ON "public"."registrations" USING "btree" ("hold_expires_at") WHERE ("status" = 'held'::"public"."registration_status");



CREATE INDEX "idx_registrations_partner" ON "public"."registrations" USING "btree" ("partner_id");



CREATE INDEX "idx_registrations_player" ON "public"."registrations" USING "btree" ("player_id");



CREATE INDEX "idx_registrations_replaces_registration_id" ON "public"."registrations" USING "btree" ("replaces_registration_id");



CREATE INDEX "idx_registrations_status" ON "public"."registrations" USING "btree" ("status");



CREATE INDEX "idx_registrations_tournament" ON "public"."registrations" USING "btree" ("tournament_id");



CREATE INDEX "idx_registrations_waitlist" ON "public"."registrations" USING "btree" ("tournament_id", "waitlist_position") WHERE ("status" = ANY (ARRAY['waitlisted'::"public"."registration_status", 'waitlist_offered'::"public"."registration_status"]));



CREATE INDEX "idx_story_views_user" ON "public"."story_views" USING "btree" ("user_id");



CREATE INDEX "idx_swipes_requester" ON "public"."matchmaking_swipes" USING "btree" ("requester_id");



CREATE INDEX "idx_swipes_target" ON "public"."matchmaking_swipes" USING "btree" ("target_id");



CREATE INDEX "idx_tournament_bookmarks_tournament_id" ON "public"."tournament_bookmarks" USING "btree" ("tournament_id");



CREATE INDEX "idx_tournaments_approved_by" ON "public"."tournaments" USING "btree" ("approved_by");



CREATE INDEX "idx_tournaments_city_state" ON "public"."tournaments" USING "btree" ("city", "state");



CREATE INDEX "idx_tournaments_director" ON "public"."tournaments" USING "btree" ("director_id");



CREATE INDEX "idx_tournaments_event_date" ON "public"."tournaments" USING "btree" ("event_date");



CREATE INDEX "idx_tournaments_facility" ON "public"."tournaments" USING "btree" ("facility_id") WHERE ("facility_id" IS NOT NULL);



CREATE INDEX "idx_tournaments_format" ON "public"."tournaments" USING "btree" ("format");



CREATE INDEX "idx_tournaments_search" ON "public"."tournaments" USING "gin" ("to_tsvector"('"english"'::"regconfig", (((("name" || ' '::"text") || "city") || ' '::"text") || COALESCE("state", ''::"text"))));



CREATE INDEX "idx_tournaments_skill" ON "public"."tournaments" USING "btree" ("skill_min", "skill_max");



CREATE INDEX "idx_tournaments_status" ON "public"."tournaments" USING "btree" ("status");



CREATE INDEX "idx_transactions_player" ON "public"."transactions" USING "btree" ("player_id");



CREATE INDEX "idx_transactions_registration" ON "public"."transactions" USING "btree" ("registration_id");



CREATE INDEX "idx_transactions_tournament" ON "public"."transactions" USING "btree" ("tournament_id");



CREATE INDEX "idx_user_reports_reported" ON "public"."user_reports" USING "btree" ("reported_id");



CREATE INDEX "idx_user_reports_status" ON "public"."user_reports" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_wallet_activity_item" ON "public"."wallet_activity" USING "btree" ("wallet_item_id");



CREATE INDEX "idx_wallet_activity_user_created" ON "public"."wallet_activity" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_wallet_items_idempotent_source" ON "public"."wallet_items" USING "btree" ("user_id", "source_type", "source_id", "type") WHERE ("source_id" IS NOT NULL);



CREATE INDEX "idx_wallet_items_partner" ON "public"."wallet_items" USING "btree" ("partner_id");



CREATE INDEX "idx_wallet_items_user" ON "public"."wallet_items" USING "btree" ("user_id");



CREATE INDEX "idx_wallet_items_user_status" ON "public"."wallet_items" USING "btree" ("user_id", "status");



CREATE INDEX "idx_wallet_items_user_type" ON "public"."wallet_items" USING "btree" ("user_id", "type");



CREATE INDEX "idx_wallet_items_user_unseen" ON "public"."wallet_items" USING "btree" ("user_id") WHERE ("is_seen" = false);



CREATE INDEX "idx_wallet_redemptions_item" ON "public"."wallet_redemptions" USING "btree" ("wallet_item_id");



CREATE INDEX "idx_wallet_redemptions_user" ON "public"."wallet_redemptions" USING "btree" ("user_id");



CREATE INDEX "tournament_sponsors_tournament_id_idx" ON "public"."tournament_sponsors" USING "btree" ("tournament_id");



CREATE UNIQUE INDEX "uq_conversation_pair" ON "public"."conversations" USING "btree" (LEAST(("participant_a")::"text", ("participant_b")::"text"), GREATEST(("participant_a")::"text", ("participant_b")::"text"));



CREATE UNIQUE INDEX "uq_conversations_play_event" ON "public"."conversations" USING "btree" ("related_play_event_id") WHERE (("conversation_type" = 'play_event'::"text") AND ("related_play_event_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_conversations_tournament_group" ON "public"."conversations" USING "btree" ("related_tournament_id") WHERE (("conversation_type" = 'tournament'::"text") AND ("related_tournament_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_dynamic_stories_source" ON "public"."dynamic_stories" USING "btree" ("source_type", "source_id") WHERE (("source_type" IS NOT NULL) AND ("source_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_facilities_google_place_id" ON "public"."facilities" USING "btree" ("google_place_id");



CREATE UNIQUE INDEX "uq_facility_photos_google_name" ON "public"."facility_photos" USING "btree" ("facility_id", "google_photo_name") WHERE ("google_photo_name" IS NOT NULL);



CREATE UNIQUE INDEX "uq_notifications_idempotency_key" ON "public"."notifications" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "uq_par_algorithm_versions_active" ON "public"."par_algorithm_versions" USING "btree" ("is_active") WHERE "is_active";



CREATE UNIQUE INDEX "uq_par_rating_events_active_player_game" ON "public"."par_rating_events" USING "btree" ("profile_id", "game_id") WHERE (("event_type" = 'game_processed'::"text") AND ("reversed_at" IS NULL));



CREATE UNIQUE INDEX "uq_personal_match_claims_claimed_participant" ON "public"."personal_match_claims" USING "btree" ("session_participant_id") WHERE ("status" = 'claimed'::"text");



CREATE UNIQUE INDEX "uq_personal_match_claims_pending_share" ON "public"."personal_match_claims" USING "btree" ("guest_share_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "uq_personal_session_participants_guest" ON "public"."personal_session_participants" USING "btree" ("session_id", "guest_player_id") WHERE ("guest_player_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_personal_session_participants_profile" ON "public"."personal_session_participants" USING "btree" ("session_id", "profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_registration_legacy" ON "public"."registrations" USING "btree" ("tournament_id", "player_id") WHERE ("division_id" IS NULL);



CREATE UNIQUE INDEX "uq_registration_per_division" ON "public"."registrations" USING "btree" ("tournament_id", "player_id", "division_id") WHERE ("division_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "group_invite_notify" AFTER INSERT ON "public"."group_invites" FOR EACH ROW EXECUTE FUNCTION "public"."notify_group_invite"();



CREATE OR REPLACE TRIGGER "location_settings_updated" BEFORE UPDATE ON "public"."location_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_location_settings"();



CREATE OR REPLACE TRIGGER "partner_like_mutual_check" AFTER INSERT ON "public"."partner_likes" FOR EACH ROW EXECUTE FUNCTION "public"."create_partner_match_on_mutual_like"();



CREATE OR REPLACE TRIGGER "partner_preferences_updated" BEFORE UPDATE ON "public"."partner_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."touch_partner_preferences"();



CREATE OR REPLACE TRIGGER "play_event_invite_notify" AFTER INSERT ON "public"."play_event_invites" FOR EACH ROW EXECUTE FUNCTION "public"."notify_play_event_invite"();



CREATE OR REPLACE TRIGGER "trg_auto_tournament_status" BEFORE UPDATE OF "spots_filled" ON "public"."tournaments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_auto_tournament_status"();



CREATE OR REPLACE TRIGGER "trg_bracket_matches_updated_at" BEFORE UPDATE ON "public"."bracket_matches" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_email_templates_updated" BEFORE UPDATE ON "public"."email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_play_capacity" BEFORE INSERT ON "public"."play_participants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_play_capacity"();



CREATE OR REPLACE TRIGGER "trg_enforce_registration_close" BEFORE INSERT ON "public"."registrations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_registration_close"();



CREATE OR REPLACE TRIGGER "trg_enforce_single_division" BEFORE INSERT ON "public"."registrations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_single_division"();



CREATE OR REPLACE TRIGGER "trg_facilities_updated_at" BEFORE UPDATE ON "public"."facilities" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_generate_facility_slug" BEFORE INSERT ON "public"."facilities" FOR EACH ROW EXECUTE FUNCTION "public"."fn_generate_facility_slug"();



CREATE OR REPLACE TRIGGER "trg_generate_play_event_slug" BEFORE INSERT ON "public"."play_events" FOR EACH ROW EXECUTE FUNCTION "public"."fn_generate_play_event_slug"();



CREATE OR REPLACE TRIGGER "trg_generate_tournament_slug" BEFORE INSERT ON "public"."tournaments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_generate_tournament_slug"();



CREATE OR REPLACE TRIGGER "trg_notify_director_status" AFTER UPDATE OF "director_status" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_director_status"();



CREATE OR REPLACE TRIGGER "trg_notify_new_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_message"();



CREATE OR REPLACE TRIGGER "trg_notify_registration" AFTER INSERT ON "public"."registrations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_registration"();



CREATE OR REPLACE TRIGGER "trg_notify_tournament_status" AFTER UPDATE OF "status" ON "public"."tournaments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_notify_tournament_status"();



CREATE OR REPLACE TRIGGER "trg_notify_wallet_item_added" AFTER INSERT ON "public"."wallet_items" FOR EACH ROW EXECUTE FUNCTION "public"."notify_wallet_item_added"();



CREATE OR REPLACE TRIGGER "trg_notify_wallet_item_available" AFTER UPDATE OF "status" ON "public"."wallet_items" FOR EACH ROW EXECUTE FUNCTION "public"."notify_wallet_item_available"();



CREATE OR REPLACE TRIGGER "trg_par_algorithm_versions_updated_at" BEFORE UPDATE ON "public"."par_algorithm_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_par_game_processing_updated_at" BEFORE UPDATE ON "public"."par_game_processing" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_par_rating_events_updated_at" BEFORE UPDATE ON "public"."par_rating_events" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_game_participant_session" BEFORE INSERT OR UPDATE ON "public"."personal_game_participants" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_personal_game_participant_session"();



CREATE OR REPLACE TRIGGER "trg_personal_game_participants_updated_at" BEFORE UPDATE ON "public"."personal_game_participants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_games_updated_at" BEFORE UPDATE ON "public"."personal_games" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_guest_players_updated_at" BEFORE UPDATE ON "public"."personal_guest_players" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_guest_shares_updated_at" BEFORE UPDATE ON "public"."personal_guest_shares" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_match_claims_updated_at" BEFORE UPDATE ON "public"."personal_match_claims" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_session_participants_process_par_claim" AFTER UPDATE OF "profile_id", "guest_player_id" ON "public"."personal_session_participants" FOR EACH ROW EXECUTE FUNCTION "public"."try_process_personal_claimed_participant_par"();



CREATE OR REPLACE TRIGGER "trg_personal_session_participants_updated_at" BEFORE UPDATE ON "public"."personal_session_participants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_personal_sessions_process_par" AFTER UPDATE OF "status" ON "public"."personal_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."try_process_personal_session_par"();



CREATE OR REPLACE TRIGGER "trg_personal_sessions_updated_at" BEFORE UPDATE ON "public"."personal_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_platform_settings_updated" BEFORE UPDATE ON "public"."platform_settings" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_play_events_updated_at" BEFORE UPDATE ON "public"."play_events" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_play_matches_updated_at" BEFORE UPDATE ON "public"."play_matches" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_player_par_profiles_updated_at" BEFORE UPDATE ON "public"."player_par_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_registrations_updated_at" BEFORE UPDATE ON "public"."registrations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_facility_coords" BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "public"."facilities" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_facility_coords"();



CREATE OR REPLACE TRIGGER "trg_sync_play_event_full" AFTER INSERT OR DELETE ON "public"."play_participants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_play_event_full"();



CREATE OR REPLACE TRIGGER "trg_sync_spots_filled" AFTER INSERT OR DELETE OR UPDATE OF "status" ON "public"."registrations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_spots_filled"();



CREATE OR REPLACE TRIGGER "trg_tournaments_updated_at" BEFORE UPDATE ON "public"."tournaments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_transactions_updated_at" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_conversation_last_message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."fn_update_conversation_last_message"();



CREATE OR REPLACE TRIGGER "trg_wallet_items_updated_at" BEFORE UPDATE ON "public"."wallet_items" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wallet_partners_updated_at" BEFORE UPDATE ON "public"."wallet_partners" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wallet_redemptions_updated_at" BEFORE UPDATE ON "public"."wallet_redemptions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."blocked_users"
    ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_next_match_id_fkey" FOREIGN KEY ("next_match_id") REFERENCES "public"."bracket_matches"("id");



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_score_entered_by_fkey" FOREIGN KEY ("score_entered_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_team1_player_a_fkey" FOREIGN KEY ("team1_player_a") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_team1_player_b_fkey" FOREIGN KEY ("team1_player_b") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_team2_player_a_fkey" FOREIGN KEY ("team2_player_a") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_team2_player_b_fkey" FOREIGN KEY ("team2_player_b") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bracket_matches"
    ADD CONSTRAINT "bracket_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bracket_seeds"
    ADD CONSTRAINT "bracket_seeds_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bracket_seeds"
    ADD CONSTRAINT "bracket_seeds_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participant_settings"
    ADD CONSTRAINT "conversation_participant_settings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participant_settings"
    ADD CONSTRAINT "conversation_participant_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_participants"
    ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_a_fkey" FOREIGN KEY ("participant_a") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_participant_b_fkey" FOREIGN KEY ("participant_b") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_related_play_event_id_fkey" FOREIGN KEY ("related_play_event_id") REFERENCES "public"."play_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_related_tournament_id_fkey" FOREIGN KEY ("related_tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."court_assignments"
    ADD CONSTRAINT "court_assignments_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."bracket_matches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."court_assignments"
    ADD CONSTRAINT "court_assignments_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."divisions"
    ADD CONSTRAINT "divisions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dupr_history"
    ADD CONSTRAINT "dupr_history_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dupr_history"
    ADD CONSTRAINT "dupr_history_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."facilities"
    ADD CONSTRAINT "facilities_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."facility_photos"
    ADD CONSTRAINT "facility_photos_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."facility_photos"
    ADD CONSTRAINT "facility_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites"
    ADD CONSTRAINT "group_invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_photos"
    ADD CONSTRAINT "group_photos_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_photos"
    ADD CONSTRAINT "group_photos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_photos"
    ADD CONSTRAINT "group_photos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_poll_options"
    ADD CONSTRAINT "group_poll_options_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_poll_votes"
    ADD CONSTRAINT "group_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."group_poll_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_poll_votes"
    ADD CONSTRAINT "group_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_comments"
    ADD CONSTRAINT "group_post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_comments"
    ADD CONSTRAINT "group_post_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."group_post_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_comments"
    ADD CONSTRAINT "group_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_likes"
    ADD CONSTRAINT "group_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."group_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_likes"
    ADD CONSTRAINT "group_post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_reports"
    ADD CONSTRAINT "group_post_reports_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_reports"
    ADD CONSTRAINT "group_post_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_reports"
    ADD CONSTRAINT "group_post_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_post_reports"
    ADD CONSTRAINT "group_post_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_posts"
    ADD CONSTRAINT "group_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_posts"
    ADD CONSTRAINT "group_posts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_posts"
    ADD CONSTRAINT "group_posts_related_play_event_id_fkey" FOREIGN KEY ("related_play_event_id") REFERENCES "public"."play_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_settings"
    ADD CONSTRAINT "location_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matchmaking_swipes"
    ADD CONSTRAINT "matchmaking_swipes_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matchmaking_swipes"
    ADD CONSTRAINT "matchmaking_swipes_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."par_game_processing"
    ADD CONSTRAINT "par_game_processing_algorithm_version_fkey" FOREIGN KEY ("algorithm_version") REFERENCES "public"."par_algorithm_versions"("version");



ALTER TABLE ONLY "public"."par_game_processing"
    ADD CONSTRAINT "par_game_processing_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."personal_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."par_game_processing"
    ADD CONSTRAINT "par_game_processing_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."personal_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."par_rating_events"
    ADD CONSTRAINT "par_rating_events_algorithm_version_fkey" FOREIGN KEY ("algorithm_version") REFERENCES "public"."par_algorithm_versions"("version");



ALTER TABLE ONLY "public"."par_rating_events"
    ADD CONSTRAINT "par_rating_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."personal_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."par_rating_events"
    ADD CONSTRAINT "par_rating_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."par_rating_events"
    ADD CONSTRAINT "par_rating_events_reversal_event_id_fkey" FOREIGN KEY ("reversal_event_id") REFERENCES "public"."par_rating_events"("id");



ALTER TABLE ONLY "public"."par_rating_events"
    ADD CONSTRAINT "par_rating_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."personal_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_likes"
    ADD CONSTRAINT "partner_likes_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_likes"
    ADD CONSTRAINT "partner_likes_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_matches"
    ADD CONSTRAINT "partner_matches_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_matches"
    ADD CONSTRAINT "partner_matches_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partner_preferences"
    ADD CONSTRAINT "partner_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_game_participants"
    ADD CONSTRAINT "personal_game_participants_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."personal_games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_game_participants"
    ADD CONSTRAINT "personal_game_participants_session_participant_id_fkey" FOREIGN KEY ("session_participant_id") REFERENCES "public"."personal_session_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_games"
    ADD CONSTRAINT "personal_games_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."personal_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_guest_players"
    ADD CONSTRAINT "personal_guest_players_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_guest_player_id_fkey" FOREIGN KEY ("guest_player_id") REFERENCES "public"."personal_guest_players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."personal_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_guest_shares"
    ADD CONSTRAINT "personal_guest_shares_session_participant_id_fkey" FOREIGN KEY ("session_participant_id") REFERENCES "public"."personal_session_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_claimed_by_profile_id_fkey" FOREIGN KEY ("claimed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_guest_player_id_fkey" FOREIGN KEY ("guest_player_id") REFERENCES "public"."personal_guest_players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_guest_share_id_fkey" FOREIGN KEY ("guest_share_id") REFERENCES "public"."personal_guest_shares"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."personal_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_match_claims"
    ADD CONSTRAINT "personal_match_claims_session_participant_id_fkey" FOREIGN KEY ("session_participant_id") REFERENCES "public"."personal_session_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_session_participants"
    ADD CONSTRAINT "personal_session_participants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_session_participants"
    ADD CONSTRAINT "personal_session_participants_guest_player_id_fkey" FOREIGN KEY ("guest_player_id") REFERENCES "public"."personal_guest_players"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."personal_session_participants"
    ADD CONSTRAINT "personal_session_participants_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."personal_session_participants"
    ADD CONSTRAINT "personal_session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."personal_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_sessions"
    ADD CONSTRAINT "personal_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personal_sessions"
    ADD CONSTRAINT "personal_sessions_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."play_event_invites"
    ADD CONSTRAINT "play_event_invites_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_event_invites"
    ADD CONSTRAINT "play_event_invites_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_event_invites"
    ADD CONSTRAINT "play_event_invites_play_event_id_fkey" FOREIGN KEY ("play_event_id") REFERENCES "public"."play_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."play_events"
    ADD CONSTRAINT "play_events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_matches"
    ADD CONSTRAINT "play_matches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."play_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_matches"
    ADD CONSTRAINT "play_matches_player_a2_id_fkey" FOREIGN KEY ("player_a2_id") REFERENCES "public"."play_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_matches"
    ADD CONSTRAINT "play_matches_player_a_id_fkey" FOREIGN KEY ("player_a_id") REFERENCES "public"."play_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_matches"
    ADD CONSTRAINT "play_matches_player_b2_id_fkey" FOREIGN KEY ("player_b2_id") REFERENCES "public"."play_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_matches"
    ADD CONSTRAINT "play_matches_player_b_id_fkey" FOREIGN KEY ("player_b_id") REFERENCES "public"."play_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."play_participants"
    ADD CONSTRAINT "play_participants_claimed_by_fkey" FOREIGN KEY ("claimed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."play_participants"
    ADD CONSTRAINT "play_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."play_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_par_profiles"
    ADD CONSTRAINT "player_par_profiles_algorithm_version_fkey" FOREIGN KEY ("algorithm_version") REFERENCES "public"."par_algorithm_versions"("version");



ALTER TABLE ONLY "public"."player_par_profiles"
    ADD CONSTRAINT "player_par_profiles_last_processed_game_id_fkey" FOREIGN KEY ("last_processed_game_id") REFERENCES "public"."personal_games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."player_par_profiles"
    ADD CONSTRAINT "player_par_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_hidden_matches"
    ADD CONSTRAINT "profile_hidden_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."bracket_matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_hidden_matches"
    ADD CONSTRAINT "profile_hidden_matches_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_director_approved_by_fkey" FOREIGN KEY ("director_approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_home_court_id_fkey" FOREIGN KEY ("home_court_id") REFERENCES "public"."facilities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_added_by_director_id_fkey" FOREIGN KEY ("added_by_director_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_replaces_registration_id_fkey" FOREIGN KEY ("replaces_registration_id") REFERENCES "public"."registrations"("id");



ALTER TABLE ONLY "public"."registrations"
    ADD CONSTRAINT "registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."saved_play_events"
    ADD CONSTRAINT "saved_play_events_play_event_id_fkey" FOREIGN KEY ("play_event_id") REFERENCES "public"."play_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_play_events"
    ADD CONSTRAINT "saved_play_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."dynamic_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."story_views"
    ADD CONSTRAINT "story_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_bookmarks"
    ADD CONSTRAINT "tournament_bookmarks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_bookmarks"
    ADD CONSTRAINT "tournament_bookmarks_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_sponsors"
    ADD CONSTRAINT "tournament_sponsors_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_director_id_fkey" FOREIGN KEY ("director_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reported_id_fkey" FOREIGN KEY ("reported_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_reports"
    ADD CONSTRAINT "user_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_activity"
    ADD CONSTRAINT "wallet_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_activity"
    ADD CONSTRAINT "wallet_activity_wallet_item_id_fkey" FOREIGN KEY ("wallet_item_id") REFERENCES "public"."wallet_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_items"
    ADD CONSTRAINT "wallet_items_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."wallet_partners"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_items"
    ADD CONSTRAINT "wallet_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_redemptions"
    ADD CONSTRAINT "wallet_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_redemptions"
    ADD CONSTRAINT "wallet_redemptions_wallet_item_id_fkey" FOREIGN KEY ("wallet_item_id") REFERENCES "public"."wallet_items"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read bookmark counts" ON "public"."tournament_bookmarks" FOR SELECT USING (true);



CREATE POLICY "Players can manage their own bookmarks" ON "public"."tournament_bookmarks" USING ((( SELECT "auth"."uid"() AS "uid") = "player_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "player_id"));



CREATE POLICY "Players manage their own hidden matches" ON "public"."profile_hidden_matches" USING ((( SELECT "auth"."uid"() AS "uid") = "player_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "player_id"));



CREATE POLICY "admins can manage all group reports" ON "public"."group_post_reports" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admins can manage all reports" ON "public"."user_reports" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



ALTER TABLE "public"."blocked_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bracket_matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bracket_matches: admin full access" ON "public"."bracket_matches" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "bracket_matches: director manage own" ON "public"."bracket_matches" USING (((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "bracket_matches"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND ( SELECT "public"."is_approved_director"() AS "is_approved_director")));



CREATE POLICY "bracket_matches: public read" ON "public"."bracket_matches" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "bracket_matches"."tournament_id") AND ("t"."status" <> ALL (ARRAY['draft'::"public"."tournament_status", 'pending_approval'::"public"."tournament_status"]))))));



ALTER TABLE "public"."bracket_seeds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bracket_seeds_director_write" ON "public"."bracket_seeds" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments"
  WHERE (("tournaments"."id" = "bracket_seeds"."tournament_id") AND ("tournaments"."director_id" = "auth"."uid"())))));



CREATE POLICY "bracket_seeds_public_read" ON "public"."bracket_seeds" FOR SELECT USING (true);



ALTER TABLE "public"."conversation_participant_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_participant_settings: self read" ON "public"."conversation_participant_settings" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "conversation_participant_settings: self update" ON "public"."conversation_participant_settings" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "conversation_participant_settings: self upsert" ON "public"."conversation_participant_settings" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."conversation_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_participants: participants read" ON "public"."conversation_participants" FOR SELECT USING ("public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "conversation_participants: self join" ON "public"."conversation_participants" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "conversation_participants: self leave" ON "public"."conversation_participants" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "conversation_participants: self update" ON "public"."conversation_participants" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations: participants insert" ON "public"."conversations" FOR INSERT WITH CHECK ((((COALESCE("conversation_type", 'direct'::"text") = 'direct'::"text") AND (("participant_a" = ( SELECT "auth"."uid"() AS "uid")) OR ("participant_b" = ( SELECT "auth"."uid"() AS "uid"))) AND ((EXISTS ( SELECT 1
   FROM ("public"."partner_likes" "l1"
     JOIN "public"."partner_likes" "l2" ON ((("l1"."from_user_id" = "l2"."to_user_id") AND ("l1"."to_user_id" = "l2"."from_user_id") AND ("l2"."kind" = 'like'::"text"))))
  WHERE (("l1"."kind" = 'like'::"text") AND ("l1"."from_user_id" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"])) AND ("l1"."to_user_id" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"]))))) OR (EXISTS ( SELECT 1
   FROM (("public"."profiles" "dir"
     JOIN "public"."tournaments" "t" ON (("t"."director_id" = "dir"."id")))
     JOIN "public"."registrations" "r" ON (("r"."tournament_id" = "t"."id")))
  WHERE (("dir"."id" = ( SELECT "auth"."uid"() AS "uid")) AND (("dir"."role" = 'director'::"public"."user_role") OR ("dir"."is_director" = true)) AND ("dir"."director_status" = 'approved'::"public"."director_status") AND ("r"."player_id" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"])) AND ("r"."player_id" <> ( SELECT "auth"."uid"() AS "uid")) AND ("r"."status" = ANY (ARRAY['held'::"public"."registration_status", 'registered'::"public"."registration_status", 'checked_in'::"public"."registration_status"]))))) OR (EXISTS ( SELECT 1
   FROM ("public"."registrations" "r"
     JOIN "public"."tournaments" "t" ON (("t"."id" = "r"."tournament_id")))
  WHERE (("r"."player_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."status" = ANY (ARRAY['held'::"public"."registration_status", 'registered'::"public"."registration_status", 'checked_in'::"public"."registration_status"])) AND ("t"."director_id" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"])) AND ("t"."director_id" <> ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."play_events" "pe"
     JOIN "public"."play_participants" "pp" ON (("pp"."event_id" = "pe"."id")))
  WHERE (("pe"."organizer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("pp"."claimed_by" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"])) AND ("pp"."claimed_by" <> ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."play_events" "pe"
  WHERE (("pe"."organizer_id" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"])) AND ("pe"."organizer_id" <> ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."tournaments" "t"
     JOIN "public"."profiles" "dir" ON (("dir"."id" = "t"."director_id")))
  WHERE (("t"."director_id" = ANY (ARRAY["conversations"."participant_a", "conversations"."participant_b"])) AND ("t"."director_id" <> ( SELECT "auth"."uid"() AS "uid")) AND ("t"."status" = ANY (ARRAY['open'::"public"."tournament_status", 'filling_fast'::"public"."tournament_status", 'registration_closed'::"public"."tournament_status", 'in_progress'::"public"."tournament_status", 'completed'::"public"."tournament_status"])) AND (("dir"."role" = 'director'::"public"."user_role") OR ("dir"."is_director" = true)) AND ("dir"."director_status" = 'approved'::"public"."director_status")))))) OR (("conversation_type" = 'play_event'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("related_play_event_id" IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM "public"."play_events" "pe"
  WHERE (("pe"."id" = "conversations"."related_play_event_id") AND ("pe"."organizer_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."play_participants" "pp"
  WHERE (("pp"."event_id" = "conversations"."related_play_event_id") AND ("pp"."claimed_by" = ( SELECT "auth"."uid"() AS "uid"))))))) OR (("conversation_type" = ANY (ARRAY['tournament'::"text", 'announcement'::"text"])) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("related_tournament_id" IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "conversations"."related_tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR (EXISTS ( SELECT 1
   FROM "public"."registrations" "r"
  WHERE (("r"."tournament_id" = "conversations"."related_tournament_id") AND ("r"."player_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."status" = ANY (ARRAY['held'::"public"."registration_status", 'registered'::"public"."registration_status", 'checked_in'::"public"."registration_status"]))))))) OR (("conversation_type" = 'group'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



COMMENT ON POLICY "conversations: participants insert" ON "public"."conversations" IS 'Direct: mutual Partner Finder like, tournament director<->registrant, play_event organizer<->claimed participant, anyone<->play_event organizer, or anyone<->visible tournament director. Contextual chats require event/tournament participation. Group: creator = current user, membership enforced separately via group_members/conversation_participants.';



CREATE POLICY "conversations: participants read" ON "public"."conversations" FOR SELECT USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_conversation_participant"("id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "conversations: participants update" ON "public"."conversations" FOR UPDATE USING ("public"."is_conversation_participant"("id", ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_conversation_participant"("id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."court_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "court_assignments_director_write" ON "public"."court_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments"
  WHERE (("tournaments"."id" = "court_assignments"."tournament_id") AND ("tournaments"."director_id" = "auth"."uid"())))));



CREATE POLICY "court_assignments_public_read" ON "public"."court_assignments" FOR SELECT USING (true);



ALTER TABLE "public"."divisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "divisions: admin full access" ON "public"."divisions" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "divisions: director manage own" ON "public"."divisions" USING (((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "divisions"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND ( SELECT "public"."is_approved_director"() AS "is_approved_director")));



CREATE POLICY "divisions: public read" ON "public"."divisions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "divisions"."tournament_id") AND ("t"."status" <> ALL (ARRAY['draft'::"public"."tournament_status", 'pending_approval'::"public"."tournament_status", 'cancelled'::"public"."tournament_status"]))))) OR ( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "divisions"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."dupr_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dupr_history: public read" ON "public"."dupr_history" FOR SELECT USING (true);



CREATE POLICY "dupr_history: service insert only" ON "public"."dupr_history" FOR INSERT WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."dynamic_stories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dynamic_stories: authenticated read" ON "public"."dynamic_stories" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."email_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_log: admin read" ON "public"."email_log" FOR SELECT USING (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."email_sponsors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_sponsors: admin write" ON "public"."email_sponsors" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "email_sponsors: public read" ON "public"."email_sponsors" FOR SELECT USING (true);



ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_templates: admin all" ON "public"."email_templates" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."facilities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facilities: admin full access" ON "public"."facilities" USING ("public"."is_admin"());



CREATE POLICY "facilities: authenticated claim" ON "public"."facilities" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("claim_status" = 'unclaimed'::"text"))) WITH CHECK ((("claim_status" = 'pending'::"text") AND ("owner_user_id" IS NULL) AND ("verified" = ( SELECT "facilities_1"."verified"
   FROM "public"."facilities" "facilities_1"
  WHERE ("facilities_1"."id" = "facilities_1"."id")))));



COMMENT ON POLICY "facilities: authenticated claim" ON "public"."facilities" IS 'Allows any logged-in user to flip claim_status unclaimed→pending. verified and owner_user_id cannot be changed through this policy.';



CREATE POLICY "facilities: authenticated insert" ON "public"."facilities" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "facilities: owner update" ON "public"."facilities" FOR UPDATE USING (("owner_user_id" = "auth"."uid"())) WITH CHECK ((("owner_user_id" = "auth"."uid"()) AND ("verified" = ( SELECT "facilities_1"."verified"
   FROM "public"."facilities" "facilities_1"
  WHERE ("facilities_1"."id" = "facilities_1"."id"))) AND ("claim_status" = ( SELECT "facilities_1"."claim_status"
   FROM "public"."facilities" "facilities_1"
  WHERE ("facilities_1"."id" = "facilities_1"."id")))));



CREATE POLICY "facilities: public read" ON "public"."facilities" FOR SELECT USING (true);



ALTER TABLE "public"."facility_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facility_photos: admin full access" ON "public"."facility_photos" USING ("public"."is_admin"());



CREATE POLICY "facility_photos: authenticated insert" ON "public"."facility_photos" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "facility_photos: public read" ON "public"."facility_photos" FOR SELECT USING (true);



CREATE POLICY "facility_photos: uploader delete" ON "public"."facility_photos" FOR DELETE USING ((("uploaded_by" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."group_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_invites: invitee or inviter can update" ON "public"."group_invites" FOR UPDATE USING ((("invitee_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("inviter_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("invitee_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("inviter_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_invites: participants can read" ON "public"."group_invites" FOR SELECT USING ((("inviter_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("invitee_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_invites: sender can invite" ON "public"."group_invites" FOR INSERT WITH CHECK ((("inviter_id" = ( SELECT "auth"."uid"() AS "uid")) AND (NOT "public"."is_group_member"("group_id", "invitee_id")) AND ("public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid")) OR ("public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_invites"."group_id") AND ("g"."allow_invites" = true))))))));



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members: admin update" ON "public"."group_members" FOR UPDATE USING ("public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "group_members: read member or public group" ON "public"."group_members" FOR SELECT USING (("public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."privacy" = 'public'::"text")))) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_members: self join or admin add" ON "public"."group_members" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_members: self leave or admin remove" ON "public"."group_members" FOR DELETE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."group_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_photos: member insert" ON "public"."group_photos" FOR INSERT WITH CHECK ((("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_photos: member read" ON "public"."group_photos" FOR SELECT USING ("public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "group_photos: own or admin delete" ON "public"."group_photos" FOR DELETE USING ((("uploaded_by" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."group_poll_options" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_poll_options: author insert" ON "public"."group_poll_options" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_poll_options"."post_id") AND ("p"."author_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "group_poll_options: member read" ON "public"."group_poll_options" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_poll_options"."post_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."group_poll_votes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_poll_votes: member read" ON "public"."group_poll_votes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."group_poll_options" "o"
     JOIN "public"."group_posts" "p" ON (("p"."id" = "o"."post_id")))
  WHERE (("o"."id" = "group_poll_votes"."option_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "group_poll_votes: member vote own" ON "public"."group_poll_votes" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM ("public"."group_poll_options" "o"
     JOIN "public"."group_posts" "p" ON (("p"."id" = "o"."post_id")))
  WHERE (("o"."id" = "group_poll_votes"."option_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "group_poll_votes: own delete" ON "public"."group_poll_votes" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."group_post_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_post_comments: member insert own" ON "public"."group_post_comments" FOR INSERT WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_post_comments"."post_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "group_post_comments: member read" ON "public"."group_post_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_post_comments"."post_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "group_post_comments: own or admin delete" ON "public"."group_post_comments" FOR DELETE USING ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_post_comments"."post_id") AND "public"."is_group_admin"("p"."group_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "group_post_comments: own update" ON "public"."group_post_comments" FOR UPDATE USING (("author_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."group_post_likes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_post_likes: member insert own" ON "public"."group_post_likes" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_post_likes"."post_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "group_post_likes: member read" ON "public"."group_post_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_posts" "p"
  WHERE (("p"."id" = "group_post_likes"."post_id") AND "public"."is_group_member"("p"."group_id", ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "group_post_likes: own delete" ON "public"."group_post_likes" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."group_post_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_posts: member insert" ON "public"."group_posts" FOR INSERT WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_posts: member read" ON "public"."group_posts" FOR SELECT USING ("public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "group_posts: own or admin delete" ON "public"."group_posts" FOR DELETE USING ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "group_posts: own update" ON "public"."group_posts" FOR UPDATE USING (("author_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("author_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups: organizer delete" ON "public"."groups" FOR DELETE USING (("organizer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "groups: organizer insert" ON "public"."groups" FOR INSERT WITH CHECK (("organizer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "groups: organizer or admin update" ON "public"."groups" FOR UPDATE USING ((("organizer_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("id", ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("organizer_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_admin"("id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "groups: read invited" ON "public"."groups" FOR SELECT USING ("public"."has_pending_group_invite"("id", ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "groups: read public or member" ON "public"."groups" FOR SELECT USING ((("privacy" = 'public'::"text") OR ("organizer_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_group_member"("id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "invitee_can_respond" ON "public"."play_event_invites" FOR UPDATE USING ((("auth"."uid"() = "invitee_id") OR ("auth"."uid"() = "inviter_id"))) WITH CHECK ((("auth"."uid"() = "invitee_id") OR ("auth"."uid"() = "inviter_id")));



CREATE POLICY "inviter_can_send" ON "public"."play_event_invites" FOR INSERT WITH CHECK ((("auth"."uid"() = "inviter_id") AND ((EXISTS ( SELECT 1
   FROM "public"."play_events" "pe"
  WHERE (("pe"."id" = "play_event_invites"."play_event_id") AND ("pe"."organizer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."play_participants" "pp"
  WHERE (("pp"."event_id" = "play_event_invites"."play_event_id") AND ("pp"."claimed_by" = "auth"."uid"())))))));



ALTER TABLE "public"."location_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matchmaking_swipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message reactions: own delete" ON "public"."message_reactions" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "message reactions: participant react" ON "public"."message_reactions" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND "public"."is_conversation_participant"("m"."conversation_id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "message reactions: participants read" ON "public"."message_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_reactions"."message_id") AND "public"."is_conversation_participant"("m"."conversation_id", ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages: admin read" ON "public"."messages" FOR SELECT USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "messages: mark as read" ON "public"."messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND (("c"."participant_a" = ( SELECT "auth"."uid"() AS "uid")) OR ("c"."participant_b" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "messages: participant mark read" ON "public"."messages" FOR UPDATE USING ((("sender_id" <> ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("sender_id" <> ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "messages: participant send" ON "public"."messages" FOR INSERT WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "messages: participants read" ON "public"."messages" FOR SELECT USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_conversation_participant"("conversation_id", ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: own delete" ON "public"."notifications" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications: own read" ON "public"."notifications" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "notifications: own update" ON "public"."notifications" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "owner_all" ON "public"."location_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "owner_all" ON "public"."partner_preferences" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "owner_insert_delete" ON "public"."partner_likes" USING (("auth"."uid"() = "from_user_id")) WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "owner_manage_saved_play_events" ON "public"."saved_play_events" USING (("auth"."uid"() = "player_id")) WITH CHECK (("auth"."uid"() = "player_id"));



ALTER TABLE "public"."par_algorithm_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "par_algorithm_versions: authenticated read" ON "public"."par_algorithm_versions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



ALTER TABLE "public"."par_game_processing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "par_game_processing: match participants read" ON "public"."par_game_processing" FOR SELECT USING ("public"."is_personal_session_visible"("session_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."par_rating_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "par_rating_events: owner or match participant read" ON "public"."par_rating_events" FOR SELECT USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_personal_session_visible"("session_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "participants_read" ON "public"."partner_matches" FOR SELECT USING ((("auth"."uid"() = "user_a") OR ("auth"."uid"() = "user_b")));



CREATE POLICY "participants_read" ON "public"."play_event_invites" FOR SELECT USING ((("auth"."uid"() = "inviter_id") OR ("auth"."uid"() = "invitee_id")));



ALTER TABLE "public"."partner_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partner_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partner_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personal_game_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_game_participants: creator insert" ON "public"."personal_game_participants" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."personal_games" "g"
     JOIN "public"."personal_sessions" "s" ON (("s"."id" = "g"."session_id")))
  WHERE (("g"."id" = "personal_game_participants"."game_id") AND ("s"."created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("s"."status" = ANY (ARRAY['draft'::"text", 'active'::"text"]))))));



CREATE POLICY "personal_game_participants: session visible read" ON "public"."personal_game_participants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."personal_games" "g"
  WHERE (("g"."id" = "personal_game_participants"."game_id") AND "public"."is_personal_session_visible"("g"."session_id", ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."personal_games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_games: creator insert" ON "public"."personal_games" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."personal_sessions" "s"
  WHERE (("s"."id" = "personal_games"."session_id") AND ("s"."created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("s"."status" = ANY (ARRAY['draft'::"text", 'active'::"text"]))))));



CREATE POLICY "personal_games: creator update incomplete" ON "public"."personal_games" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."personal_sessions" "s"
  WHERE (("s"."id" = "personal_games"."session_id") AND ("s"."created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("s"."status" = ANY (ARRAY['draft'::"text", 'active'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."personal_sessions" "s"
  WHERE (("s"."id" = "personal_games"."session_id") AND ("s"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "personal_games: session visible read" ON "public"."personal_games" FOR SELECT USING ("public"."is_personal_session_visible"("session_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."personal_guest_players" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_guest_players: creator read" ON "public"."personal_guest_players" FOR SELECT USING (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "personal_guest_players: creator update" ON "public"."personal_guest_players" FOR UPDATE USING (("created_by" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."personal_guest_shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_guest_shares: creator read" ON "public"."personal_guest_shares" FOR SELECT USING (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "personal_guest_shares: creator update" ON "public"."personal_guest_shares" FOR UPDATE USING (("created_by" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."personal_match_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_match_claims: claimed owner read" ON "public"."personal_match_claims" FOR SELECT USING (("claimed_by_profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "personal_match_claims: creator read" ON "public"."personal_match_claims" FOR SELECT USING (("created_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."personal_session_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_session_participants: session visible read" ON "public"."personal_session_participants" FOR SELECT USING ("public"."is_personal_session_visible"("session_id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."personal_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "personal_sessions: creator insert" ON "public"."personal_sessions" FOR INSERT WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['draft'::"text", 'active'::"text"]))));



CREATE POLICY "personal_sessions: creator update incomplete" ON "public"."personal_sessions" FOR UPDATE USING ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['draft'::"text", 'active'::"text"])))) WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['draft'::"text", 'active'::"text"]))));



CREATE POLICY "personal_sessions: participant read" ON "public"."personal_sessions" FOR SELECT USING ("public"."is_personal_session_visible"("id", ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_settings: admin write" ON "public"."platform_settings" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "platform_settings: public read" ON "public"."platform_settings" FOR SELECT USING (true);



ALTER TABLE "public"."play_event_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."play_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "play_events: admin full access" ON "public"."play_events" USING ("public"."is_admin"());



CREATE POLICY "play_events: organizer delete own" ON "public"."play_events" FOR DELETE USING (("organizer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "play_events: organizer insert" ON "public"."play_events" FOR INSERT WITH CHECK (("organizer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "play_events: organizer update own" ON "public"."play_events" FOR UPDATE USING (("organizer_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("organizer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "play_events: public read" ON "public"."play_events" FOR SELECT USING ((("status" <> 'cancelled'::"public"."play_event_status") OR ("organizer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."play_matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "play_matches: admin full access" ON "public"."play_matches" USING ("public"."is_admin"());



CREATE POLICY "play_matches: organizer manage" ON "public"."play_matches" USING ((EXISTS ( SELECT 1
   FROM "public"."play_events" "e"
  WHERE (("e"."id" = "play_matches"."event_id") AND ("e"."organizer_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "play_matches: public read" ON "public"."play_matches" FOR SELECT USING (true);



ALTER TABLE "public"."play_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "play_participants: admin full access" ON "public"."play_participants" USING ("public"."is_admin"());



CREATE POLICY "play_participants: organizer + self read" ON "public"."play_participants" FOR SELECT USING ((("claimed_by" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."play_events" "e"
  WHERE (("e"."id" = "play_participants"."event_id") AND ("e"."organizer_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "play_participants: organizer manage" ON "public"."play_participants" USING ((EXISTS ( SELECT 1
   FROM "public"."play_events" "e"
  WHERE (("e"."id" = "play_participants"."event_id") AND ("e"."organizer_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "play_participants: public join" ON "public"."play_participants" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."play_events" "e"
  WHERE (("e"."id" = "play_participants"."event_id") AND ("e"."status" <> ALL (ARRAY['cancelled'::"public"."play_event_status", 'completed'::"public"."play_event_status"]))))) AND (COALESCE("added_by_organizer", false) = false) AND (("claimed_by" IS NULL) OR ("claimed_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "play_participants: self claim" ON "public"."play_participants" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("email" = "auth"."email"()) AND ("claimed_by" IS NULL))) WITH CHECK (("claimed_by" = "auth"."uid"()));



COMMENT ON POLICY "play_participants: self claim" ON "public"."play_participants" IS 'Lets a signed-in user link unclaimed guest rows that share their email. Cannot overwrite an existing claimed_by or claim rows with a different email.';



CREATE POLICY "play_participants: self leave" ON "public"."play_participants" FOR DELETE USING (("claimed_by" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."player_par_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_par_profiles: owner read" ON "public"."player_par_profiles" FOR SELECT USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profile_hidden_matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: admin full access" ON "public"."profiles" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "profiles: own update" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND ("role" = ( SELECT "public"."current_user_role"() AS "current_user_role")) AND ("is_director" = ( SELECT "public"."current_user_is_director"() AS "current_user_is_director")) AND (NOT ("director_status" IS DISTINCT FROM ( SELECT "public"."current_user_director_status"() AS "current_user_director_status")))));



CREATE POLICY "profiles: public read" ON "public"."profiles" FOR SELECT USING (true);



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens: self delete" ON "public"."push_tokens" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_tokens: self insert" ON "public"."push_tokens" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_tokens: self read" ON "public"."push_tokens" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_tokens: self update" ON "public"."push_tokens" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "recipient_read" ON "public"."partner_likes" FOR SELECT USING (("auth"."uid"() = "to_user_id"));



ALTER TABLE "public"."registrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "registrations: admin full access" ON "public"."registrations" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "registrations: director insert manual" ON "public"."registrations" FOR INSERT WITH CHECK ((( SELECT "public"."is_approved_director"() AS "is_approved_director") AND ("director_added" = true) AND ("added_by_director_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "registrations"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "registrations: director read own tournament" ON "public"."registrations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "registrations"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "registrations: director update own tournament" ON "public"."registrations" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "registrations"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND ( SELECT "public"."is_approved_director"() AS "is_approved_director")));



CREATE POLICY "registrations: player insert own" ON "public"."registrations" FOR INSERT WITH CHECK ((("player_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("director_added" = false)));



CREATE POLICY "registrations: player read own" ON "public"."registrations" FOR SELECT USING ((("player_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("partner_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "registrations: player update own" ON "public"."registrations" FOR UPDATE USING (("player_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("player_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("status" = 'withdrawn'::"public"."registration_status") OR ("waiver_accepted_at" IS NOT NULL))));



CREATE POLICY "reporters can insert own group reports" ON "public"."group_post_reports" FOR INSERT WITH CHECK ((("reporter_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_group_member"("group_id", ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "reporters can insert own reports" ON "public"."user_reports" FOR INSERT WITH CHECK (("reporter_id" = "auth"."uid"()));



CREATE POLICY "reporters can view own group reports" ON "public"."group_post_reports" FOR SELECT USING (("reporter_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "reporters can view own reports" ON "public"."user_reports" FOR SELECT USING (("reporter_id" = "auth"."uid"()));



ALTER TABLE "public"."saved_play_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_insert_notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



CREATE POLICY "sponsors_director_delete" ON "public"."tournament_sponsors" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_sponsors"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "sponsors_director_insert" ON "public"."tournament_sponsors" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_sponsors"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "sponsors_director_update" ON "public"."tournament_sponsors" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_sponsors"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "sponsors_public_read" ON "public"."tournament_sponsors" FOR SELECT USING (true);



ALTER TABLE "public"."story_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "story_views: self insert" ON "public"."story_views" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "story_views: self read" ON "public"."story_views" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "swipes: admin read" ON "public"."matchmaking_swipes" FOR SELECT USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "swipes: own delete" ON "public"."matchmaking_swipes" FOR DELETE USING (("requester_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "swipes: own insert" ON "public"."matchmaking_swipes" FOR INSERT WITH CHECK (("requester_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "swipes: own read" ON "public"."matchmaking_swipes" FOR SELECT USING (("requester_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "swipes: read targeting me" ON "public"."matchmaking_swipes" FOR SELECT USING (("target_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."tournament_bookmarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_sponsors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournaments: admin full access" ON "public"."tournaments" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "tournaments: director insert" ON "public"."tournaments" FOR INSERT WITH CHECK ((( SELECT "public"."is_approved_director"() AS "is_approved_director") AND ("director_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "tournaments: director update own" ON "public"."tournaments" FOR UPDATE USING ((("director_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."is_approved_director"() AS "is_approved_director") AND ("status" <> ALL (ARRAY['in_progress'::"public"."tournament_status", 'completed'::"public"."tournament_status", 'cancelled'::"public"."tournament_status"])))) WITH CHECK ((("director_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("approved_at" IS NULL) AND ("approved_by" IS NULL)));



CREATE POLICY "tournaments: public read approved" ON "public"."tournaments" FOR SELECT USING ((("status" <> ALL (ARRAY['draft'::"public"."tournament_status", 'pending_approval'::"public"."tournament_status", 'cancelled'::"public"."tournament_status"])) OR ("director_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions: admin full access" ON "public"."transactions" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "transactions: director read own tournament" ON "public"."transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "transactions"."tournament_id") AND ("t"."director_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "transactions: player read own" ON "public"."transactions" FOR SELECT USING (("player_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can delete own blocks" ON "public"."blocked_users" FOR DELETE USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "users can insert own blocks" ON "public"."blocked_users" FOR INSERT WITH CHECK (("blocker_id" = "auth"."uid"()));



CREATE POLICY "users can view own blocks" ON "public"."blocked_users" FOR SELECT USING (("blocker_id" = "auth"."uid"()));



CREATE POLICY "users_read_own_notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_update_own_notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."wallet_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_activity: user select own" ON "public"."wallet_activity" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."wallet_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_items: user select own" ON "public"."wallet_items" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."wallet_partners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_partners: public read active" ON "public"."wallet_partners" FOR SELECT USING (("is_active" = true));



ALTER TABLE "public"."wallet_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_redemptions: user select own" ON "public"."wallet_redemptions" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bracket_matches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."registrations";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d_out"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2df_out"("public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d_out"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_out"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_send"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_analyze"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_out"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_recv"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_send"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_typmod_out"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gidx_out"("public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spheroid_out"("public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geography", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."json"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."path"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."point"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."polygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("path") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("path") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("point") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("point") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("polygon") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry"("text") TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_deprecate"("oldname" "text", "newname" "text", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_index_extent"("tbl" "regclass", "col" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_join_selectivity"("regclass", "text", "regclass", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_scripts_pgsql_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_selectivity"("tbl" "regclass", "att_name" "text", "geom" "public"."geometry", "mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_postgis_stats"("tbl" "regclass", "att_name" "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asgml"(integer, "public"."geometry", integer, integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_asx3d"(integer, "public"."geometry", integer, integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_bestsrid"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distancetree"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_distanceuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_dwithinuncached"("public"."geography", "public"."geography", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_expand"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_pointoutside"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_sortablehash"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_voronoi"("g1" "public"."geometry", "clip" "public"."geometry", "tolerance" double precision, "return_polygons" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON TABLE "public"."personal_session_participants" TO "anon";
GRANT ALL ON TABLE "public"."personal_session_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_session_participants" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_personal_session_guest_participant"("p_session_id" "uuid", "p_display_name" "text", "p_estimated_skill" "text", "p_phone" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_personal_session_guest_participant"("p_session_id" "uuid", "p_display_name" "text", "p_estimated_skill" "text", "p_phone" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_personal_session_guest_participant"("p_session_id" "uuid", "p_display_name" "text", "p_estimated_skill" "text", "p_phone" "text", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_personal_session_registered_participant"("p_session_id" "uuid", "p_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_personal_session_registered_participant"("p_session_id" "uuid", "p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_personal_session_registered_participant"("p_session_id" "uuid", "p_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."addauth"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."addauth"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."addgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer, "new_type" character varying, "new_dim" integer, "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_tournament"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_tournament"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_tournament"("p_tournament_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_to_be_director"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_to_be_director"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_to_be_director"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_to_be_director"() TO "service_role";



GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."box3dtobox"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauth"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "postgres";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkauthtrigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."claim_personal_match"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_personal_match"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_personal_match"("p_token" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personal_sessions" TO "anon";
GRANT ALL ON TABLE "public"."personal_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_sessions" TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_personal_session"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_personal_session"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_personal_session"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_personal_session_with_distribution"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_personal_session_with_distribution"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_personal_session_with_distribution"("p_session_id" "uuid", "p_facility_id" "uuid", "p_notes" "text", "p_indoor_outdoor" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contains_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_partner_match_on_mutual_like"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_partner_match_on_mutual_like"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_partner_match_on_mutual_like"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_personal_match_claim_link"("p_guest_share_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_personal_match_claim_link"("p_guest_share_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_personal_match_claim_link"("p_guest_share_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_personal_session"("p_format" "text", "p_facility_id" "uuid", "p_played_at" timestamp with time zone, "p_indoor_outdoor" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_personal_session"("p_format" "text", "p_facility_id" "uuid", "p_played_at" timestamp with time zone, "p_indoor_outdoor" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_personal_session"("p_format" "text", "p_facility_id" "uuid", "p_played_at" timestamp with time zone, "p_indoor_outdoor" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_director_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_director_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_director_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_is_director"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_is_director"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_is_director"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrycolumn"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."dropgeometrytable"("catalog_name" character varying, "schema_name" character varying, "table_name" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "postgres";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "anon";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enablelongtransactions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_personal_game_participant_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_game_participant_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_game_participant_session"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_personal_match_claims_for_session"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_personal_match_claims_for_session"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_personal_match_claims_for_session"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON TABLE "public"."par_game_processing" TO "anon";
GRANT ALL ON TABLE "public"."par_game_processing" TO "authenticated";
GRANT ALL ON TABLE "public"."par_game_processing" TO "service_role";



GRANT ALL ON FUNCTION "public"."evaluate_personal_game_par_eligibility"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."evaluate_personal_game_par_eligibility"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."evaluate_personal_game_par_eligibility"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_stale_holds"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_stale_holds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_stale_holds"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_srid"(character varying, character varying, character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_auto_tournament_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_auto_tournament_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_auto_tournament_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_enforce_play_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_enforce_play_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_enforce_play_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_enforce_registration_close"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_enforce_registration_close"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_enforce_registration_close"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_enforce_single_division"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_enforce_single_division"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_enforce_single_division"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_generate_facility_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_generate_facility_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_generate_facility_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_generate_play_event_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_generate_play_event_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_generate_play_event_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_generate_tournament_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_generate_tournament_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_generate_tournament_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_notify_director_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_notify_director_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_notify_director_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_notify_registration"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_notify_registration"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_notify_registration"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_notify_tournament_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_notify_tournament_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_notify_tournament_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_facility_coords"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_facility_coords"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_facility_coords"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_play_event_full"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_play_event_full"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_play_event_full"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_spots_filled"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_spots_filled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_spots_filled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_update_conversation_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_update_conversation_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_update_conversation_last_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_dynamic_stories"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_dynamic_stories"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_dynamic_stories"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_dynamic_stories"() TO "service_role";



GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geog_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_cmp"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_distance_knn"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_eq"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_ge"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_consistent"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_distance"("internal", "public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_same"("public"."box2d", "public"."box2d", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gist_union"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_gt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_le"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_lt"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_overlaps"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geography_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom2d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom3d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geom4d_brin_inclusion_add_value"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_above"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_below"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_cmp"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contained_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_contains_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_box"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_centroid_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_distance_cpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_eq"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_ge"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_consistent_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_decompress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_2d"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_distance_nd"("internal", "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_2d"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_penalty_nd"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_2d"("geom1" "public"."geometry", "geom2" "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_same_nd"("public"."geometry", "public"."geometry", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_sortsupport_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_2d"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gist_union_nd"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_gt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_hash"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_le"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_left"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_lt"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overabove"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overbelow"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overlaps_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overleft"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_overright"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_right"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_3d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_same_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_sortsupport"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_choose_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_2d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_3d"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_compress_nd"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_config_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_inner_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_leaf_consistent_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_2d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_3d"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_spgist_picksplit_nd"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometry_within_nd"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."geomfromewkt"("text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_direct_conversation"("p_partner_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_play_event_conversation"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_proj4_from_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "postgres";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "anon";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gettransactionid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_2d"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_joinsel_nd"("internal", "oid", "internal", smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_2d"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gserialized_gist_sel_nd"("internal", "oid", "internal", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_pending_group_invite"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_pending_group_invite"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_pending_group_invite"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."player_par_profiles" TO "anon";
GRANT ALL ON TABLE "public"."player_par_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."player_par_profiles" TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_own_player_par_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_own_player_par_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_own_player_par_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."initialize_player_par_profile"("p_profile_id" "uuid", "p_algorithm_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."initialize_player_par_profile"("p_profile_id" "uuid", "p_algorithm_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_player_par_profile"("p_profile_id" "uuid", "p_algorithm_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_player_par_profile"("p_profile_id" "uuid", "p_algorithm_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved_director"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved_director"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_director"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_contained_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_conversation_participant"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_admin"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_admin"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_admin"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_personal_session_visible"("p_session_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_personal_session_visible"("p_session_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_personal_session_visible"("p_session_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."play_participants" TO "anon";
GRANT ALL ON TABLE "public"."play_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."play_participants" TO "service_role";



GRANT ALL ON FUNCTION "public"."join_play_event"("p_event_id" "uuid", "p_first_name" "text", "p_email" "text", "p_claimed_by" "uuid", "p_added_by_organizer" boolean, "p_self_rating" "text", "p_last_initial" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_play_event"("p_event_id" "uuid", "p_first_name" "text", "p_email" "text", "p_claimed_by" "uuid", "p_added_by_organizer" boolean, "p_self_rating" "text", "p_last_initial" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_play_event"("p_event_id" "uuid", "p_first_name" "text", "p_email" "text", "p_claimed_by" "uuid", "p_added_by_organizer" boolean, "p_self_rating" "text", "p_last_initial" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lockrow"("text", "text", "text", "text", timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "postgres";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "anon";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."longtransactionsenabled"() TO "service_role";



GRANT ALL ON TABLE "public"."personal_guest_shares" TO "anon";
GRANT ALL ON TABLE "public"."personal_guest_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_guest_shares" TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_personal_guest_share_initiated"("p_guest_share_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_personal_guest_share_initiated"("p_guest_share_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_personal_guest_share_initiated"("p_guest_share_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_wallet_item_seen"("p_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_group_invite"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_group_invite"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_group_invite"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_new_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_play_event_invite"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_play_event_invite"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_play_event_invite"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_wallet_item_added"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_wallet_item_added"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_wallet_item_added"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_wallet_item_available"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_wallet_item_available"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_wallet_item_available"() TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."box2df", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_2d"("public"."geometry", "public"."box2df") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."geography", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_geog"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."geometry", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "postgres";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "anon";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "authenticated";
GRANT ALL ON FUNCTION "public"."overlaps_nd"("public"."gidx", "public"."gidx") TO "service_role";



GRANT ALL ON FUNCTION "public"."par_clamp"("p_value" numeric, "p_min" numeric, "p_max" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."par_clamp"("p_value" numeric, "p_min" numeric, "p_max" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_clamp"("p_value" numeric, "p_min" numeric, "p_max" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."par_confidence_band"("p_score" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."par_confidence_band"("p_score" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_confidence_band"("p_score" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."par_explanation_code"("p_actual" numeric, "p_expected" numeric, "p_margin_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."par_explanation_code"("p_actual" numeric, "p_expected" numeric, "p_margin_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_explanation_code"("p_actual" numeric, "p_expected" numeric, "p_margin_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."par_guest_estimated_rating"("p_skill" "text", "p_anchor" numeric, "p_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."par_guest_estimated_rating"("p_skill" "text", "p_anchor" numeric, "p_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_guest_estimated_rating"("p_skill" "text", "p_anchor" numeric, "p_config" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."par_score_margin_category"("p_margin" integer, "p_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."par_score_margin_category"("p_margin" integer, "p_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_score_margin_category"("p_margin" integer, "p_config" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."par_score_margin_multiplier"("p_category" "text", "p_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."par_score_margin_multiplier"("p_category" "text", "p_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_score_margin_multiplier"("p_category" "text", "p_config" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."par_skill_level_initial_value"("p_skill_level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."par_skill_level_initial_value"("p_skill_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."par_skill_level_initial_value"("p_skill_level" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_match_claim_hash"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_match_claim_hash"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_match_claim_hash"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_match_claim_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."personal_match_claim_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_match_claim_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."personal_session_expected_players"("p_format" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."personal_session_expected_players"("p_format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personal_session_expected_players"("p_format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asflatgeobuf_transfn"("internal", "anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asgeobuf_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_asmvt_transfn"("internal", "anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_accum_transfn"("internal", "public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterintersecting_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_clusterwithin_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_collect_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_makeline_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_polygonize_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_combinefn"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_deserialfn"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_finalfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_serialfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pgis_geometry_union_parallel_transfn"("internal", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_geometry_columns"("tbl_oid" "oid", "use_typmod" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_addbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_cache_bbox"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_dims"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_srid"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_constraint_type"("geomschema" "text", "geomtable" "text", "geomcolumn" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_dropbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_extensions_upgrade"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_full_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_geos_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_getbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_hasbbox"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_index_supportfn"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_revision"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_lib_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libjson_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_liblwgeom_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libprotobuf_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_libxml_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_noop"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_proj_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_build_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_installed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_scripts_released"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_svn_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_transform_geometry"("geom" "public"."geometry", "text", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_type_name"("geomname" character varying, "coord_dimension" integer, "use_new_name" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_dims"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_srid"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_typmod_type"(integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "postgres";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."postgis_wagyu_version"() TO "service_role";



GRANT ALL ON TABLE "public"."par_rating_events" TO "anon";
GRANT ALL ON TABLE "public"."par_rating_events" TO "authenticated";
GRANT ALL ON TABLE "public"."par_rating_events" TO "service_role";



GRANT ALL ON FUNCTION "public"."process_personal_game_par"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_personal_game_par"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_personal_game_par"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_personal_session_par"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_personal_session_par"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_personal_session_par"("p_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_personal_session_par"("p_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_personal_session_par"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_personal_session_par"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_personal_session_par"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."retry_failed_personal_game_par"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."retry_failed_personal_game_par"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retry_failed_personal_game_par"("p_game_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_personal_game_par"("p_game_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_personal_game_par"("p_game_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_personal_game_par"("p_game_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_personal_game_par"("p_game_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."personal_games" TO "anon";
GRANT ALL ON TABLE "public"."personal_games" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_games" TO "service_role";



GRANT ALL ON FUNCTION "public"."save_personal_game_score"("p_game_id" "uuid", "p_team_one_score" integer, "p_team_two_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."save_personal_game_score"("p_game_id" "uuid", "p_team_one_score" integer, "p_team_two_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_personal_game_score"("p_game_id" "uuid", "p_team_one_score" integer, "p_team_two_score" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_facilities_nearby"("lat" double precision, "lng" double precision, "radius_meters" double precision, "search_query" "text", "verified_only" boolean, "public_only" boolean, "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_facilities_nearby"("lat" double precision, "lng" double precision, "radius_meters" double precision, "search_query" "text", "verified_only" boolean, "public_only" boolean, "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_facilities_nearby"("lat" double precision, "lng" double precision, "radius_meters" double precision, "search_query" "text", "verified_only" boolean, "public_only" boolean, "result_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dclosestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3ddwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dintersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlength"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dlongestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmakebox"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dmaxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dperimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dshortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addmeasure"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_addpoint"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_affine"("public"."geometry", double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_angle"("pt1" "public"."geometry", "pt2" "public"."geometry", "pt3" "public"."geometry", "pt4" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_area2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geography", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asbinary"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asencodedpolyline"("geom" "public"."geometry", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asewkt"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeojson"("r" "record", "geom_column" "text", "maxdecimaldigits" integer, "pretty_bool" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geog" "public"."geography", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgml"("version" integer, "geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer, "nprefix" "text", "id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ashexewkb"("public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geog" "public"."geography", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_askml"("geom" "public"."geometry", "maxdecimaldigits" integer, "nprefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_aslatlontext"("geom" "public"."geometry", "tmpl" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmarc21"("geom" "public"."geometry", "format" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvtgeom"("geom" "public"."geometry", "bounds" "public"."box2d", "extent" integer, "buffer" integer, "clip_geom" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geog" "public"."geography", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_assvg"("geom" "public"."geometry", "rel" integer, "maxdecimaldigits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geography", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astext"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry", "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_astwkb"("geom" "public"."geometry"[], "ids" bigint[], "prec" integer, "prec_z" integer, "prec_m" integer, "with_sizes" boolean, "with_boxes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asx3d"("geom" "public"."geometry", "maxdecimaldigits" integer, "options" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_azimuth"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdmpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_bdpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_boundingdiagonal"("geom" "public"."geometry", "fits" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_box2dfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("text", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("public"."geography", double precision, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "quadsegs" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buffer"("geom" "public"."geometry", "radius" double precision, "options" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_buildarea"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_centroid"("public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_chaikinsmoothing"("public"."geometry", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cleangeometry"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clipbybox2d"("geom" "public"."geometry", "box" "public"."box2d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_closestpointofapproach"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterdbscan"("public"."geometry", "eps" double precision, "minpoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterkmeans"("geom" "public"."geometry", "k" integer, "max_radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry"[], double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionextract"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collectionhomogenize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box2d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_combinebbox"("public"."box3d", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_concavehull"("param_geom" "public"."geometry", "param_pctconvex" double precision, "param_allow_holes" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_contains"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_containsproperly"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_convexhull"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coorddim"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_coveredby"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_covers"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_cpawithin"("public"."geometry", "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_crosses"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_curvetoline"("geom" "public"."geometry", "tol" double precision, "toltype" integer, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_delaunaytriangles"("g1" "public"."geometry", "tolerance" double precision, "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dfullywithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_difference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dimension"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_disjoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distance"("geog1" "public"."geography", "geog2" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancecpa"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancesphere"("geom1" "public"."geometry", "geom2" "public"."geometry", "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_distancespheroid"("geom1" "public"."geometry", "geom2" "public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dump"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumppoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumprings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dumpsegments"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("text", "text", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_dwithin"("geog1" "public"."geography", "geog2" "public"."geography", "tolerance" double precision, "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_endpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_envelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_equals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_estimatedextent"("text", "text", "text", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box2d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."box3d", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box2d", "dx" double precision, "dy" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("box" "public"."box3d", "dx" double precision, "dy" double precision, "dz" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_expand"("geom" "public"."geometry", "dx" double precision, "dy" double precision, "dz" double precision, "dm" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_exteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_filterbym"("public"."geometry", double precision, double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_findextent"("text", "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_flipcoordinates"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3d"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dm"("geom" "public"."geometry", "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force3dz"("geom" "public"."geometry", "zvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_force4d"("geom" "public"."geometry", "zvalue" double precision, "mvalue" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcecurve"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcepolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcerhr"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_forcesfs"("public"."geometry", "version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_frechetdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuf"("anyelement", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_fromflatgeobuftotable"("text", "text", "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_generatepoints"("area" "public"."geometry", "npoints" integer, "seed" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geogfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geographyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geog" "public"."geography", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geohash"("geom" "public"."geometry", "maxchars" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomcollfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometricmedian"("g" "public"."geometry", "tolerance" double precision, "max_iter" integer, "fail_if_not_converged" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometryn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geometrytype"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromewkt"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"(json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgeojson"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromgml"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromkml"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfrommarc21"("marc21xml" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromtwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_geomfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_gmltosql"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hasarc"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hausdorffdistance"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagon"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_hexagongrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interiorringn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_interpolatepoint"("line" "public"."geometry", "point" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("public"."geography", "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersection"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geog1" "public"."geography", "geog2" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_intersects"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isclosed"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_iscollection"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isempty"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygonccw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ispolygoncw"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_issimple"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalid"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvaliddetail"("geom" "public"."geometry", "flags" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidreason"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_isvalidtrajectory"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_length2dspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "anon";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lengthspheroid"("public"."geometry", "public"."spheroid") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "anon";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_letters"("letters" "text", "font" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linecrossingdirection"("line1" "public"."geometry", "line2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromencodedpolyline"("txtin" "text", "nprecision" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefrommultipoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoint"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_lineinterpolatepoints"("public"."geometry", double precision, "repeat" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linelocatepoint"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linemerge"("public"."geometry", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linestringfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linesubstring"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_linetocurve"("geometry" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatealong"("geometry" "public"."geometry", "measure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetween"("geometry" "public"."geometry", "frommeasure" double precision, "tomeasure" double precision, "leftrightoffset" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_locatebetweenelevations"("geometry" "public"."geometry", "fromelevation" double precision, "toelevation" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_longestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_m"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makebox2d"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeenvelope"(double precision, double precision, double precision, double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepoint"(double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepointm"(double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makepolygon"("public"."geometry", "public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makevalid"("geom" "public"."geometry", "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maxdistance"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_maximuminscribedcircle"("public"."geometry", OUT "center" "public"."geometry", OUT "nearest" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memsize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingcircle"("inputgeom" "public"."geometry", "segs_per_quarter" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumboundingradius"("public"."geometry", OUT "center" "public"."geometry", OUT "radius" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearance"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_minimumclearanceline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mlinefromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_mpolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multi"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinefromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multilinestringfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_multipolygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ndims"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_node"("g" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_normalize"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_npoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_nrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numgeometries"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorring"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numinteriorrings"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpatches"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_numpoints"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_offsetcurve"("line" "public"."geometry", "distance" double precision, "params" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orderingequals"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_orientedenvelope"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_overlaps"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_patchn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter"("geog" "public"."geography", "use_spheroid" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_perimeter2d"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_point"(double precision, double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromgeohash"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointinsidecircle"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointm"("xcoordinate" double precision, "ycoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointn"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointonsurface"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_points"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointz"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_pointzm"("xcoordinate" double precision, "ycoordinate" double precision, "zcoordinate" double precision, "mcoordinate" double precision, "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polyfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygon"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromtext"("text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonfromwkb"("bytea", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_project"("geog" "public"."geography", "distance" double precision, "azimuth" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_quantizecoordinates"("g" "public"."geometry", "prec_x" integer, "prec_y" integer, "prec_z" integer, "prec_m" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reduceprecision"("geom" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relate"("geom1" "public"."geometry", "geom2" "public"."geometry", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_relatematch"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removepoint"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_removerepeatedpoints"("geom" "public"."geometry", "tolerance" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_reverse"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatex"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatey"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_rotatez"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", "public"."geometry", "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scale"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_scroll"("public"."geometry", "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("geog" "public"."geography", "max_segment_length" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_segmentize"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_seteffectivearea"("public"."geometry", double precision, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setpoint"("public"."geometry", integer, "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geog" "public"."geography", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_setsrid"("geom" "public"."geometry", "srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_sharedpaths"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shiftlongitude"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_shortestline"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplify"("public"."geometry", double precision, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypolygonhull"("geom" "public"."geometry", "vertex_fraction" double precision, "is_outer" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifypreservetopology"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_simplifyvw"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snap"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_snaptogrid"("geom1" "public"."geometry", "geom2" "public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_split"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_square"("size" double precision, "cell_i" integer, "cell_j" integer, "origin" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_squaregrid"("size" double precision, "bounds" "public"."geometry", OUT "geom" "public"."geometry", OUT "i" integer, OUT "j" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geog" "public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_srid"("geom" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_startpoint"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_subdivide"("geom" "public"."geometry", "maxvertices" integer, "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geography") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_summary"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_swapordinates"("geom" "public"."geometry", "ords" "cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symdifference"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_symmetricdifference"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_tileenvelope"("zoom" integer, "x" integer, "y" integer, "bounds" "public"."geometry", "margin" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_touches"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("public"."geometry", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_srid" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transform"("geom" "public"."geometry", "from_proj" "text", "to_proj" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_translate"("public"."geometry", double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_transscale"("public"."geometry", double precision, double precision, double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_triangulatepolygon"("g1" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_unaryunion"("public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("geom1" "public"."geometry", "geom2" "public"."geometry", "gridsize" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoilines"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_voronoipolygons"("g1" "public"."geometry", "tolerance" double precision, "extend_to" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_within"("geom1" "public"."geometry", "geom2" "public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkbtosql"("wkb" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wkttosql"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_wrapx"("geom" "public"."geometry", "wrap" double precision, "move" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_x"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_xmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_y"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_ymin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_z"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmax"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmflag"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "anon";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_zmin"("public"."box3d") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_location_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_location_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_location_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_partner_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_partner_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_partner_preferences"() TO "service_role";



GRANT ALL ON FUNCTION "public"."try_process_personal_claimed_participant_par"() TO "anon";
GRANT ALL ON FUNCTION "public"."try_process_personal_claimed_participant_par"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_process_personal_claimed_participant_par"() TO "service_role";



GRANT ALL ON FUNCTION "public"."try_process_personal_session_par"() TO "anon";
GRANT ALL ON FUNCTION "public"."try_process_personal_session_par"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."try_process_personal_session_par"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlockrows"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"(character varying, character varying, character varying, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."updategeometrysrid"("catalogn_name" character varying, "schema_name" character varying, "table_name" character varying, "column_name" character varying, "new_srid_in" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_personal_game_ready"("p_game_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_personal_game_ready"("p_game_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_personal_game_ready"("p_game_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_personal_match_claim"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_personal_match_claim"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_personal_match_claim"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_3dextent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asflatgeobuf"("anyelement", boolean, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asgeobuf"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_asmvt"("anyelement", "text", integer, "text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterintersecting"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_clusterwithin"("public"."geometry", double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_collect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_extent"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_makeline"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memcollect"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_memunion"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_polygonize"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry") TO "service_role";



GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."st_union"("public"."geometry", double precision) TO "service_role";















GRANT ALL ON TABLE "public"."blocked_users" TO "anon";
GRANT ALL ON TABLE "public"."blocked_users" TO "authenticated";
GRANT ALL ON TABLE "public"."blocked_users" TO "service_role";



GRANT ALL ON TABLE "public"."bracket_matches" TO "anon";
GRANT ALL ON TABLE "public"."bracket_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."bracket_matches" TO "service_role";



GRANT ALL ON TABLE "public"."bracket_seeds" TO "anon";
GRANT ALL ON TABLE "public"."bracket_seeds" TO "authenticated";
GRANT ALL ON TABLE "public"."bracket_seeds" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participant_settings" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participant_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participant_settings" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_participants" TO "anon";
GRANT ALL ON TABLE "public"."conversation_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_participants" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."court_assignments" TO "anon";
GRANT ALL ON TABLE "public"."court_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."court_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."divisions" TO "anon";
GRANT ALL ON TABLE "public"."divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."divisions" TO "service_role";



GRANT ALL ON TABLE "public"."dupr_history" TO "anon";
GRANT ALL ON TABLE "public"."dupr_history" TO "authenticated";
GRANT ALL ON TABLE "public"."dupr_history" TO "service_role";



GRANT ALL ON TABLE "public"."dynamic_stories" TO "anon";
GRANT ALL ON TABLE "public"."dynamic_stories" TO "authenticated";
GRANT ALL ON TABLE "public"."dynamic_stories" TO "service_role";



GRANT ALL ON TABLE "public"."email_log" TO "anon";
GRANT ALL ON TABLE "public"."email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."email_log" TO "service_role";



GRANT ALL ON TABLE "public"."email_sponsors" TO "anon";
GRANT ALL ON TABLE "public"."email_sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."facilities" TO "anon";
GRANT ALL ON TABLE "public"."facilities" TO "authenticated";
GRANT ALL ON TABLE "public"."facilities" TO "service_role";



GRANT ALL ON TABLE "public"."facility_photos" TO "anon";
GRANT ALL ON TABLE "public"."facility_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."facility_photos" TO "service_role";



GRANT ALL ON TABLE "public"."group_invites" TO "anon";
GRANT ALL ON TABLE "public"."group_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."group_invites" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."group_photos" TO "anon";
GRANT ALL ON TABLE "public"."group_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."group_photos" TO "service_role";



GRANT ALL ON TABLE "public"."group_poll_options" TO "anon";
GRANT ALL ON TABLE "public"."group_poll_options" TO "authenticated";
GRANT ALL ON TABLE "public"."group_poll_options" TO "service_role";



GRANT ALL ON TABLE "public"."group_poll_votes" TO "anon";
GRANT ALL ON TABLE "public"."group_poll_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."group_poll_votes" TO "service_role";



GRANT ALL ON TABLE "public"."group_post_comments" TO "anon";
GRANT ALL ON TABLE "public"."group_post_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."group_post_comments" TO "service_role";



GRANT ALL ON TABLE "public"."group_post_likes" TO "anon";
GRANT ALL ON TABLE "public"."group_post_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."group_post_likes" TO "service_role";



GRANT ALL ON TABLE "public"."group_post_reports" TO "anon";
GRANT ALL ON TABLE "public"."group_post_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."group_post_reports" TO "service_role";



GRANT ALL ON TABLE "public"."group_posts" TO "anon";
GRANT ALL ON TABLE "public"."group_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."group_posts" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."location_settings" TO "anon";
GRANT ALL ON TABLE "public"."location_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."location_settings" TO "service_role";



GRANT ALL ON TABLE "public"."matchmaking_swipes" TO "anon";
GRANT ALL ON TABLE "public"."matchmaking_swipes" TO "authenticated";
GRANT ALL ON TABLE "public"."matchmaking_swipes" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."par_algorithm_versions" TO "anon";
GRANT ALL ON TABLE "public"."par_algorithm_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."par_algorithm_versions" TO "service_role";



GRANT ALL ON TABLE "public"."partner_likes" TO "anon";
GRANT ALL ON TABLE "public"."partner_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_likes" TO "service_role";



GRANT ALL ON TABLE "public"."partner_matches" TO "anon";
GRANT ALL ON TABLE "public"."partner_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_matches" TO "service_role";



GRANT ALL ON TABLE "public"."partner_preferences" TO "anon";
GRANT ALL ON TABLE "public"."partner_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."partner_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."personal_game_participants" TO "anon";
GRANT ALL ON TABLE "public"."personal_game_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_game_participants" TO "service_role";



GRANT ALL ON TABLE "public"."personal_guest_players" TO "anon";
GRANT ALL ON TABLE "public"."personal_guest_players" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_guest_players" TO "service_role";



GRANT ALL ON TABLE "public"."personal_match_claims" TO "anon";
GRANT ALL ON TABLE "public"."personal_match_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."personal_match_claims" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."play_event_invites" TO "anon";
GRANT ALL ON TABLE "public"."play_event_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."play_event_invites" TO "service_role";



GRANT ALL ON TABLE "public"."play_events" TO "anon";
GRANT ALL ON TABLE "public"."play_events" TO "authenticated";
GRANT ALL ON TABLE "public"."play_events" TO "service_role";



GRANT ALL ON TABLE "public"."play_matches" TO "anon";
GRANT ALL ON TABLE "public"."play_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."play_matches" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."play_participants_authenticated" TO "anon";
GRANT ALL ON TABLE "public"."play_participants_authenticated" TO "authenticated";
GRANT ALL ON TABLE "public"."play_participants_authenticated" TO "service_role";



GRANT ALL ON TABLE "public"."play_participants_public" TO "anon";
GRANT ALL ON TABLE "public"."play_participants_public" TO "authenticated";
GRANT ALL ON TABLE "public"."play_participants_public" TO "service_role";



GRANT ALL ON TABLE "public"."profile_hidden_matches" TO "anon";
GRANT ALL ON TABLE "public"."profile_hidden_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_hidden_matches" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."registrations" TO "anon";
GRANT ALL ON TABLE "public"."registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."registrations" TO "service_role";



GRANT ALL ON TABLE "public"."saved_play_events" TO "anon";
GRANT ALL ON TABLE "public"."saved_play_events" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_play_events" TO "service_role";



GRANT ALL ON TABLE "public"."story_views" TO "anon";
GRANT ALL ON TABLE "public"."story_views" TO "authenticated";
GRANT ALL ON TABLE "public"."story_views" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."tournament_bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_sponsors" TO "anon";
GRANT ALL ON TABLE "public"."tournament_sponsors" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_sponsors" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."user_reports" TO "anon";
GRANT ALL ON TABLE "public"."user_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."user_reports" TO "service_role";



GRANT ALL ON TABLE "public"."v_director_earnings" TO "anon";
GRANT ALL ON TABLE "public"."v_director_earnings" TO "authenticated";
GRANT ALL ON TABLE "public"."v_director_earnings" TO "service_role";



GRANT ALL ON TABLE "public"."v_mutual_matches" TO "anon";
GRANT ALL ON TABLE "public"."v_mutual_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."v_mutual_matches" TO "service_role";



GRANT ALL ON TABLE "public"."v_tournament_listing" TO "anon";
GRANT ALL ON TABLE "public"."v_tournament_listing" TO "authenticated";
GRANT ALL ON TABLE "public"."v_tournament_listing" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_activity" TO "anon";
GRANT ALL ON TABLE "public"."wallet_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_activity" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_items" TO "anon";
GRANT ALL ON TABLE "public"."wallet_items" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_items" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_partners" TO "anon";
GRANT ALL ON TABLE "public"."wallet_partners" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_partners" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_redemptions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































