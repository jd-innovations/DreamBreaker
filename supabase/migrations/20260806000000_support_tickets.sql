-- Support Ticket System
-- Adds a `support_tickets` case record whose thread rides on the existing
-- conversations/messages stack via a new conversation_type = 'support'.

-- ── Widen conversations for the new type ──────────────────────────────────

ALTER TABLE "public"."conversations" DROP CONSTRAINT "conversations_type_check";
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_type_check"
  CHECK (("conversation_type" = ANY (ARRAY['direct'::"text", 'play_event'::"text", 'tournament'::"text", 'team'::"text", 'group'::"text", 'announcement'::"text", 'support'::"text"])));

ALTER TABLE "public"."conversations" DROP CONSTRAINT "conversations_context_check";
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_context_check"
  CHECK (((("conversation_type" = 'direct'::"text") AND ("participant_a" IS NOT NULL) AND ("participant_b" IS NOT NULL))
    OR (("conversation_type" = 'play_event'::"text") AND ("related_play_event_id" IS NOT NULL))
    OR (("conversation_type" = ANY (ARRAY['tournament'::"text", 'announcement'::"text"])) AND ("related_tournament_id" IS NOT NULL))
    OR ("conversation_type" = ANY (ARRAY['team'::"text", 'group'::"text"]))
    OR ("conversation_type" = 'support'::"text")));

-- ── support_tickets table ──────────────────────────────────────────────────

CREATE TYPE "public"."support_ticket_status" AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE "public"."support_ticket_category" AS ENUM ('account', 'tournaments', 'partners_matches', 'payments', 'bug', 'feedback', 'other');

CREATE TABLE "public"."support_tickets" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"           uuid NOT NULL REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  "conversation_id"   uuid NOT NULL REFERENCES "public"."conversations"("id") ON DELETE CASCADE,
  "subject"           text NOT NULL,
  "category"          "public"."support_ticket_category" NOT NULL DEFAULT 'other',
  "status"            "public"."support_ticket_status" NOT NULL DEFAULT 'open',
  -- Unused in v1 (shared admin queue, no per-ticket assignment) — kept for a
  -- later per-admin assignment pass so it doesn't need a follow-up migration.
  "assigned_admin_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  "resolved_at"       timestamptz
);

CREATE UNIQUE INDEX "uq_support_tickets_conversation" ON "public"."support_tickets" ("conversation_id");
CREATE INDEX "idx_support_tickets_user" ON "public"."support_tickets" ("user_id");
CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" ("status", "created_at" DESC);

CREATE TRIGGER "trg_support_tickets_updated_at" BEFORE UPDATE ON "public"."support_tickets"
  FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();

ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets: owner read" ON "public"."support_tickets"
  FOR SELECT USING ("user_id" = (SELECT "auth"."uid"()));

CREATE POLICY "support_tickets: owner insert" ON "public"."support_tickets"
  FOR INSERT WITH CHECK ("user_id" = (SELECT "auth"."uid"()));

CREATE POLICY "support_tickets: admin all" ON "public"."support_tickets"
  FOR ALL USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

-- ── Let any admin read/reply on any support conversation ──────────────────
-- Additive OR-branch on the existing generic participant-check helper, reused
-- by conversation_participants/conversations/messages/message_reactions RLS
-- and by the message-attachments storage bucket policy — this one change
-- transparently unlocks all of those for admins on conversation_type='support'.

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
         or (c.conversation_type = 'support' and public.is_admin())
       )
  );
$$;

-- ── Allow a user to create a support conversation for themselves ──────────

DROP POLICY "conversations: participants insert" ON "public"."conversations";
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
  WHERE (("r"."tournament_id" = "conversations"."related_tournament_id") AND ("r"."player_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("r"."status" = ANY (ARRAY['held'::"public"."registration_status", 'registered'::"public"."registration_status", 'checked_in'::"public"."registration_status"]))))))) OR (("conversation_type" = 'group'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))) OR (("conversation_type" = 'support'::"text") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));

COMMENT ON POLICY "conversations: participants insert" ON "public"."conversations" IS 'Direct: mutual Partner Finder like, tournament director<->registrant, play_event organizer<->claimed participant, anyone<->play_event organizer, or anyone<->visible tournament director. Contextual chats require event/tournament participation. Group: creator = current user, membership enforced separately via group_members/conversation_participants. Support: creator = current user (any authenticated user may open a support ticket).';
