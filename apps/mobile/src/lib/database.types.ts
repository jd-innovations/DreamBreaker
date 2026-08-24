export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      asset_photos: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          owner_id: string
          owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          owner_id: string
          owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["facility_asset_owner_type"]
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ball_machines: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          facility_id: string
          hourly_rate_cents: number | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          facility_id: string
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          facility_id?: string
          hourly_rate_cents?: number | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ball_machines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ball_machines_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_matches: {
        Row: {
          completed_at: string | null
          court: string | null
          created_at: string
          division_id: string | null
          id: string
          match_number: number
          next_match_id: string | null
          next_match_slot: number | null
          round: Database["public"]["Enums"]["round_label"]
          scheduled_at: string | null
          score_entered_at: string | null
          score_entered_by: string | null
          score_team1: number[] | null
          score_team2: number[] | null
          started_at: string | null
          team1_player_a: string | null
          team1_player_b: string | null
          team2_player_a: string | null
          team2_player_b: string | null
          tournament_id: string
          updated_at: string
          winner: number | null
        }
        Insert: {
          completed_at?: string | null
          court?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          match_number: number
          next_match_id?: string | null
          next_match_slot?: number | null
          round: Database["public"]["Enums"]["round_label"]
          scheduled_at?: string | null
          score_entered_at?: string | null
          score_entered_by?: string | null
          score_team1?: number[] | null
          score_team2?: number[] | null
          started_at?: string | null
          team1_player_a?: string | null
          team1_player_b?: string | null
          team2_player_a?: string | null
          team2_player_b?: string | null
          tournament_id: string
          updated_at?: string
          winner?: number | null
        }
        Update: {
          completed_at?: string | null
          court?: string | null
          created_at?: string
          division_id?: string | null
          id?: string
          match_number?: number
          next_match_id?: string | null
          next_match_slot?: number | null
          round?: Database["public"]["Enums"]["round_label"]
          scheduled_at?: string | null
          score_entered_at?: string | null
          score_entered_by?: string | null
          score_team1?: number[] | null
          score_team2?: number[] | null
          started_at?: string | null
          team1_player_a?: string | null
          team1_player_b?: string | null
          team2_player_a?: string | null
          team2_player_b?: string | null
          tournament_id?: string
          updated_at?: string
          winner?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bracket_matches_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_score_entered_by_fkey"
            columns: ["score_entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_team1_player_a_fkey"
            columns: ["team1_player_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_team1_player_b_fkey"
            columns: ["team1_player_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_team2_player_a_fkey"
            columns: ["team2_player_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_team2_player_b_fkey"
            columns: ["team2_player_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "bracket_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_seeds: {
        Row: {
          created_at: string | null
          id: string
          locked: boolean | null
          player_id: string
          pool_letter: string | null
          seed_number: number
          tournament_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          locked?: boolean | null
          player_id: string
          pool_letter?: string | null
          seed_number: number
          tournament_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          locked?: boolean | null
          player_id?: string
          pool_letter?: string | null
          seed_number?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bracket_seeds_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_seeds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_seeds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "bracket_seeds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_offer_images: {
        Row: {
          coach_offer_id: string
          created_at: string
          id: string
          sort_order: number
          url: string
        }
        Insert: {
          coach_offer_id: string
          created_at?: string
          id?: string
          sort_order?: number
          url: string
        }
        Update: {
          coach_offer_id?: string
          created_at?: string
          id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_offer_images_coach_offer_id_fkey"
            columns: ["coach_offer_id"]
            isOneToOne: false
            referencedRelation: "coach_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_offer_purchase_ledger_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          metadata: Json
          purchase_id: string
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json
          purchase_id: string
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          purchase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_offer_purchase_ledger_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_offer_purchase_ledger_events_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "coach_offer_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_offer_purchases: {
        Row: {
          boost_attributed: boolean
          boost_commission_amount_cents: number
          boost_commission_pct: number
          buyer_id: string
          buyer_service_fee_cents: number
          buyer_total_charged_cents: number
          coach_id: string
          coach_net_proceeds_cents: number
          coach_net_proceeds_provisional: boolean
          commission_pct: number
          commission_source: string
          created_at: string
          currency: string
          discount_pct: number
          expiration_days: number
          expiration_policy: string
          facility_id: string | null
          gross_selling_price_cents: number
          id: string
          inventory_hold_expires_at: string
          lessons_included: number | null
          offer_id: string
          offer_title: string
          offer_type: Database["public"]["Enums"]["coach_offer_type"]
          paid_at: string | null
          participant_quantity: number
          platform_commission_amount_cents: number
          premium_eligible_at_purchase: boolean
          premium_price_applied: boolean
          processing_fee_cents: number | null
          processing_fee_status: Database["public"]["Enums"]["coach_offer_purchase_processing_fee_status"]
          regular_price_cents: number
          selling_price_cents: number
          status: Database["public"]["Enums"]["coach_offer_purchase_status"]
          tax_amount_cents: number
          tax_status: string
          updated_at: string
        }
        Insert: {
          boost_attributed?: boolean
          boost_commission_amount_cents?: number
          boost_commission_pct?: number
          buyer_id: string
          buyer_service_fee_cents?: number
          buyer_total_charged_cents: number
          coach_id: string
          coach_net_proceeds_cents: number
          coach_net_proceeds_provisional?: boolean
          commission_pct: number
          commission_source: string
          created_at?: string
          currency?: string
          discount_pct: number
          expiration_days: number
          expiration_policy: string
          facility_id?: string | null
          gross_selling_price_cents: number
          id?: string
          inventory_hold_expires_at: string
          lessons_included?: number | null
          offer_id: string
          offer_title: string
          offer_type: Database["public"]["Enums"]["coach_offer_type"]
          paid_at?: string | null
          participant_quantity: number
          platform_commission_amount_cents: number
          premium_eligible_at_purchase?: boolean
          premium_price_applied?: boolean
          processing_fee_cents?: number | null
          processing_fee_status?: Database["public"]["Enums"]["coach_offer_purchase_processing_fee_status"]
          regular_price_cents: number
          selling_price_cents: number
          status?: Database["public"]["Enums"]["coach_offer_purchase_status"]
          tax_amount_cents?: number
          tax_status?: string
          updated_at?: string
        }
        Update: {
          boost_attributed?: boolean
          boost_commission_amount_cents?: number
          boost_commission_pct?: number
          buyer_id?: string
          buyer_service_fee_cents?: number
          buyer_total_charged_cents?: number
          coach_id?: string
          coach_net_proceeds_cents?: number
          coach_net_proceeds_provisional?: boolean
          commission_pct?: number
          commission_source?: string
          created_at?: string
          currency?: string
          discount_pct?: number
          expiration_days?: number
          expiration_policy?: string
          facility_id?: string | null
          gross_selling_price_cents?: number
          id?: string
          inventory_hold_expires_at?: string
          lessons_included?: number | null
          offer_id?: string
          offer_title?: string
          offer_type?: Database["public"]["Enums"]["coach_offer_type"]
          paid_at?: string | null
          participant_quantity?: number
          platform_commission_amount_cents?: number
          premium_eligible_at_purchase?: boolean
          premium_price_applied?: boolean
          processing_fee_cents?: number | null
          processing_fee_status?: Database["public"]["Enums"]["coach_offer_purchase_processing_fee_status"]
          regular_price_cents?: number
          selling_price_cents?: number
          status?: Database["public"]["Enums"]["coach_offer_purchase_status"]
          tax_amount_cents?: number
          tax_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_offer_purchases_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_offer_purchases_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_offer_purchases_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_offer_purchases_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "coach_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_offers: {
        Row: {
          applicable_audience: Json
          coach_id: string
          commission_override_pct: number | null
          created_at: string
          description: string | null
          discounted_price_cents: number
          duration_minutes: number | null
          facility_id: string | null
          id: string
          lessons_included: number | null
          max_participants: number | null
          offer_type: Database["public"]["Enums"]["coach_offer_type"]
          premium_only: boolean
          premium_price_cents: number | null
          purchase_limit_per_customer: number | null
          quantity_available: number | null
          quantity_remaining: number | null
          regular_price_cents: number
          skill_level_label: string | null
          status: Database["public"]["Enums"]["coach_offer_status"]
          terms: string | null
          title: string
          updated_at: string
        }
        Insert: {
          applicable_audience?: Json
          coach_id: string
          commission_override_pct?: number | null
          created_at?: string
          description?: string | null
          discounted_price_cents: number
          duration_minutes?: number | null
          facility_id?: string | null
          id?: string
          lessons_included?: number | null
          max_participants?: number | null
          offer_type: Database["public"]["Enums"]["coach_offer_type"]
          premium_only?: boolean
          premium_price_cents?: number | null
          purchase_limit_per_customer?: number | null
          quantity_available?: number | null
          quantity_remaining?: number | null
          regular_price_cents: number
          skill_level_label?: string | null
          status?: Database["public"]["Enums"]["coach_offer_status"]
          terms?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          applicable_audience?: Json
          coach_id?: string
          commission_override_pct?: number | null
          created_at?: string
          description?: string | null
          discounted_price_cents?: number
          duration_minutes?: number | null
          facility_id?: string | null
          id?: string
          lessons_included?: number | null
          max_participants?: number | null
          offer_type?: Database["public"]["Enums"]["coach_offer_type"]
          premium_only?: boolean
          premium_price_cents?: number | null
          purchase_limit_per_customer?: number | null
          quantity_available?: number | null
          quantity_remaining?: number | null
          regular_price_cents?: number
          skill_level_label?: string | null
          status?: Database["public"]["Enums"]["coach_offer_status"]
          terms?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_offers_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_offers_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_voucher_entitlements: {
        Row: {
          buyer_id: string
          coach_id: string
          created_at: string
          entitlement_type: string
          exhausted_at: string | null
          expires_at: string
          id: string
          offer_id: string
          participant_index: number | null
          purchase_id: string
          remaining_redemptions: number
          revoked_at: string | null
          revoked_reason: string | null
          status: string
          total_redemptions: number
          updated_at: string
          wallet_item_id: string
        }
        Insert: {
          buyer_id: string
          coach_id: string
          created_at?: string
          entitlement_type: string
          exhausted_at?: string | null
          expires_at: string
          id?: string
          offer_id: string
          participant_index?: number | null
          purchase_id: string
          remaining_redemptions: number
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          total_redemptions: number
          updated_at?: string
          wallet_item_id: string
        }
        Update: {
          buyer_id?: string
          coach_id?: string
          created_at?: string
          entitlement_type?: string
          exhausted_at?: string | null
          expires_at?: string
          id?: string
          offer_id?: string
          participant_index?: number | null
          purchase_id?: string
          remaining_redemptions?: number
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: string
          total_redemptions?: number
          updated_at?: string
          wallet_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_voucher_entitlements_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_voucher_entitlements_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_voucher_entitlements_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "coach_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_voucher_entitlements_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "coach_offer_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_voucher_entitlements_wallet_item_id_fkey"
            columns: ["wallet_item_id"]
            isOneToOne: false
            referencedRelation: "wallet_items"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participant_settings: {
        Row: {
          archived_at: string | null
          conversation_id: string
          hidden_at: string | null
          muted_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          hidden_at?: string | null
          muted_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          hidden_at?: string | null
          muted_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participant_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participant_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          conversation_type: string
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          participant_a: string | null
          participant_b: string | null
          related_play_event_id: string | null
          related_tournament_id: string | null
          title: string | null
        }
        Insert: {
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          participant_a?: string | null
          participant_b?: string | null
          related_play_event_id?: string | null
          related_tournament_id?: string | null
          title?: string | null
        }
        Update: {
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          participant_a?: string | null
          participant_b?: string | null
          related_play_event_id?: string | null
          related_tournament_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_a_fkey"
            columns: ["participant_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_b_fkey"
            columns: ["participant_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_related_play_event_id_fkey"
            columns: ["related_play_event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_related_tournament_id_fkey"
            columns: ["related_tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_related_tournament_id_fkey"
            columns: ["related_tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "conversations_related_tournament_id_fkey"
            columns: ["related_tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      court_assignments: {
        Row: {
          completed_at: string | null
          court_number: number
          created_at: string | null
          id: string
          match_id: string | null
          player_a: string | null
          player_b: string | null
          round_label: string | null
          score_a: number | null
          score_b: number | null
          status: string | null
          tournament_id: string
          winner: string | null
        }
        Insert: {
          completed_at?: string | null
          court_number: number
          created_at?: string | null
          id?: string
          match_id?: string | null
          player_a?: string | null
          player_b?: string | null
          round_label?: string | null
          score_a?: number | null
          score_b?: number | null
          status?: string | null
          tournament_id: string
          winner?: string | null
        }
        Update: {
          completed_at?: string | null
          court_number?: number
          created_at?: string | null
          id?: string
          match_id?: string | null
          player_a?: string | null
          player_b?: string | null
          round_label?: string | null
          score_a?: number | null
          score_b?: number | null
          status?: string | null
          tournament_id?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "court_assignments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "court_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          amenities: string[]
          created_at: string
          created_by: string | null
          facility_id: string
          hourly_rate_cents: number | null
          id: string
          indoor_outdoor: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          amenities?: string[]
          created_at?: string
          created_by?: string | null
          facility_id: string
          hourly_rate_cents?: number | null
          id?: string
          indoor_outdoor: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          created_at?: string
          created_by?: string | null
          facility_id?: string
          hourly_rate_cents?: number | null
          id?: string
          indoor_outdoor?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courts_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          created_at: string
          draw_size: number
          entry_fee_cents: number | null
          format: Database["public"]["Enums"]["tournament_format"]
          gender_category: string | null
          id: string
          name: string
          skill_max: number | null
          skill_min: number | null
          spots_filled: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          draw_size: number
          entry_fee_cents?: number | null
          format: Database["public"]["Enums"]["tournament_format"]
          gender_category?: string | null
          id?: string
          name: string
          skill_max?: number | null
          skill_min?: number | null
          spots_filled?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          draw_size?: number
          entry_fee_cents?: number | null
          format?: Database["public"]["Enums"]["tournament_format"]
          gender_category?: string | null
          id?: string
          name?: string
          skill_max?: number | null
          skill_min?: number | null
          spots_filled?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      dupr_history: {
        Row: {
          delta: number | null
          id: string
          player_id: string
          rating_after: number
          rating_before: number | null
          recorded_at: string
          tournament_id: string | null
        }
        Insert: {
          delta?: number | null
          id?: string
          player_id: string
          rating_after: number
          rating_before?: number | null
          recorded_at?: string
          tournament_id?: string | null
        }
        Update: {
          delta?: number | null
          id?: string
          player_id?: string
          rating_after?: number
          rating_before?: number | null
          recorded_at?: string
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dupr_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dupr_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dupr_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "dupr_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamic_stories: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_route: string | null
          expires_at: string
          id: string
          priority_score: number
          slides: Json
          source_id: string | null
          source_type: string | null
          story_type: string
          subtitle: string | null
          title: string
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_route?: string | null
          expires_at: string
          id?: string
          priority_score?: number
          slides: Json
          source_id?: string | null
          source_type?: string | null
          story_type: string
          subtitle?: string | null
          title: string
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_route?: string | null
          expires_at?: string
          id?: string
          priority_score?: number
          slides?: Json
          source_id?: string | null
          source_type?: string | null
          story_type?: string
          subtitle?: string | null
          title?: string
        }
        Relationships: []
      }
      email_log: {
        Row: {
          error: string | null
          id: string
          provider_id: string | null
          sent_at: string
          status: string
          subject: string | null
          template_key: string | null
          to_email: string
        }
        Insert: {
          error?: string | null
          id?: string
          provider_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          template_key?: string | null
          to_email: string
        }
        Update: {
          error?: string | null
          id?: string
          provider_id?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          template_key?: string | null
          to_email?: string
        }
        Relationships: []
      }
      email_sponsors: {
        Row: {
          active: boolean
          created_at: string
          id: string
          link: string | null
          logo_url: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          link?: string | null
          logo_url: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          link?: string | null
          logo_url?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          enabled: boolean
          html_body: string
          key: string
          layout: string | null
          name: string
          preheader: string | null
          subject: string
          updated_at: string
          updated_by: string | null
          variables: string[]
        }
        Insert: {
          enabled?: boolean
          html_body: string
          key: string
          layout?: string | null
          name: string
          preheader?: string | null
          subject: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Update: {
          enabled?: boolean
          html_body?: string
          key?: string
          layout?: string | null
          name?: string
          preheader?: string | null
          subject?: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          address: string
          address_line_2: string | null
          amenities: string[]
          bookable_by_public: boolean
          booking_url: string | null
          business_status: string | null
          city: string
          claim_status: string
          coords: unknown
          country: string
          court_count: number
          created_at: string
          created_by: string | null
          data_confidence: number | null
          data_source: string
          description: string | null
          facility_type: string | null
          fee_type: string | null
          google_maps_uri: string | null
          google_place_id: string | null
          google_rating: number | null
          google_rating_count: number | null
          google_types: string[]
          hours_summary: string | null
          id: string
          import_batch_id: string | null
          indoor_courts: number
          last_verified_date: string | null
          latitude: number
          lessons_available: boolean
          lighting: boolean
          longitude: number
          membership_required: boolean
          name: string
          notes: string | null
          open_play_available: boolean
          outdoor_courts: number
          owner_user_id: string | null
          parking: boolean
          phone: string | null
          postal_code: string | null
          price_level: number | null
          pro_shop: boolean
          public_access: boolean
          reservation_required: boolean
          restrooms: boolean
          skill_levels: string[]
          slug: string | null
          source_url: string | null
          state: string
          status: string | null
          surface_type: string | null
          tags: string[]
          typical_fee: string | null
          updated_at: string
          verified: boolean
          water: boolean
          website: string | null
          wheelchair_accessible: boolean | null
        }
        Insert: {
          address: string
          address_line_2?: string | null
          amenities?: string[]
          bookable_by_public?: boolean
          booking_url?: string | null
          business_status?: string | null
          city: string
          claim_status?: string
          coords?: unknown
          country?: string
          court_count?: number
          created_at?: string
          created_by?: string | null
          data_confidence?: number | null
          data_source?: string
          description?: string | null
          facility_type?: string | null
          fee_type?: string | null
          google_maps_uri?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_rating_count?: number | null
          google_types?: string[]
          hours_summary?: string | null
          id?: string
          import_batch_id?: string | null
          indoor_courts?: number
          last_verified_date?: string | null
          latitude: number
          lessons_available?: boolean
          lighting?: boolean
          longitude: number
          membership_required?: boolean
          name: string
          notes?: string | null
          open_play_available?: boolean
          outdoor_courts?: number
          owner_user_id?: string | null
          parking?: boolean
          phone?: string | null
          postal_code?: string | null
          price_level?: number | null
          pro_shop?: boolean
          public_access?: boolean
          reservation_required?: boolean
          restrooms?: boolean
          skill_levels?: string[]
          slug?: string | null
          source_url?: string | null
          state: string
          status?: string | null
          surface_type?: string | null
          tags?: string[]
          typical_fee?: string | null
          updated_at?: string
          verified?: boolean
          water?: boolean
          website?: string | null
          wheelchair_accessible?: boolean | null
        }
        Update: {
          address?: string
          address_line_2?: string | null
          amenities?: string[]
          bookable_by_public?: boolean
          booking_url?: string | null
          business_status?: string | null
          city?: string
          claim_status?: string
          coords?: unknown
          country?: string
          court_count?: number
          created_at?: string
          created_by?: string | null
          data_confidence?: number | null
          data_source?: string
          description?: string | null
          facility_type?: string | null
          fee_type?: string | null
          google_maps_uri?: string | null
          google_place_id?: string | null
          google_rating?: number | null
          google_rating_count?: number | null
          google_types?: string[]
          hours_summary?: string | null
          id?: string
          import_batch_id?: string | null
          indoor_courts?: number
          last_verified_date?: string | null
          latitude?: number
          lessons_available?: boolean
          lighting?: boolean
          longitude?: number
          membership_required?: boolean
          name?: string
          notes?: string | null
          open_play_available?: boolean
          outdoor_courts?: number
          owner_user_id?: string | null
          parking?: boolean
          phone?: string | null
          postal_code?: string | null
          price_level?: number | null
          pro_shop?: boolean
          public_access?: boolean
          reservation_required?: boolean
          restrooms?: boolean
          skill_levels?: string[]
          slug?: string | null
          source_url?: string | null
          state?: string
          status?: string | null
          surface_type?: string | null
          tags?: string[]
          typical_fee?: string | null
          updated_at?: string
          verified?: boolean
          water?: boolean
          website?: string | null
          wheelchair_accessible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "facilities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_members: {
        Row: {
          created_at: string
          created_by: string | null
          facility_id: string
          role: Database["public"]["Enums"]["facility_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          facility_id: string
          role: Database["public"]["Enums"]["facility_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          facility_id?: string
          role?: Database["public"]["Enums"]["facility_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_members_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_photos: {
        Row: {
          created_at: string
          facility_id: string
          google_photo_name: string | null
          id: string
          is_primary: boolean
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          facility_id: string
          google_photo_name?: string | null
          id?: string
          is_primary?: boolean
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          facility_id?: string
          google_photo_name?: string | null
          id?: string
          is_primary?: boolean
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "facility_photos_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facility_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_deals: {
        Row: {
          created_at: string
          created_by: string | null
          discount_percent: number
          ends_at: string
          id: string
          is_active: boolean
          owner_id: string
          owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_percent: number
          ends_at: string
          id?: string
          is_active?: boolean
          owner_id: string
          owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          ends_at?: string
          id?: string
          is_active?: boolean
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["facility_asset_owner_type"]
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invitee_id: string
          inviter_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invitee_id: string
          inviter_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_photos: {
        Row: {
          created_at: string
          group_id: string
          id: string
          post_id: string | null
          uploaded_by: string
          url: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          post_id?: string | null
          uploaded_by: string
          url: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          post_id?: string | null
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_photos_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_photos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_poll_options: {
        Row: {
          id: string
          label: string
          position: number
          post_id: string
        }
        Insert: {
          id?: string
          label: string
          position?: number
          post_id: string
        }
        Update: {
          id?: string
          label?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_poll_votes: {
        Row: {
          option_id: string
          user_id: string
        }
        Insert: {
          option_id: string
          user_id: string
        }
        Update: {
          option_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "group_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          parent_comment_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_comment_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          parent_comment_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "group_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_post_likes: {
        Row: {
          post_id: string
          user_id: string
        }
        Insert: {
          post_id: string
          user_id: string
        }
        Update: {
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_post_reports: {
        Row: {
          created_at: string
          group_id: string
          id: string
          notes: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_user_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_posts: {
        Row: {
          author_id: string
          body: string | null
          created_at: string
          edited_at: string | null
          group_id: string
          id: string
          image_url: string | null
          kind: string
          related_play_event_id: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          created_at?: string
          edited_at?: string | null
          group_id: string
          id?: string
          image_url?: string | null
          kind?: string
          related_play_event_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          created_at?: string
          edited_at?: string | null
          group_id?: string
          id?: string
          image_url?: string | null
          kind?: string
          related_play_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_posts_related_play_event_id_fkey"
            columns: ["related_play_event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          allow_invites: boolean
          allow_posts: boolean
          conversation_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          location: string | null
          name: string
          organizer_id: string
          privacy: string
          skill: string | null
          updated_at: string
        }
        Insert: {
          allow_invites?: boolean
          allow_posts?: boolean
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          name: string
          organizer_id: string
          privacy?: string
          skill?: string | null
          updated_at?: string
        }
        Update: {
          allow_invites?: boolean
          allow_posts?: boolean
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          name?: string
          organizer_id?: string
          privacy?: string
          skill?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_settings: {
        Row: {
          allow_distance_matching: boolean
          community_radius: string
          created_at: string
          local_events: boolean
          major_events: boolean
          marketplace_radius: string
          national_events: boolean
          partner_radius: string
          regional_events: boolean
          show_city: boolean
          show_exact_location: boolean
          tournament_radius: string
          updated_at: string
          user_id: string
          willing_to_ship: boolean
        }
        Insert: {
          allow_distance_matching?: boolean
          community_radius?: string
          created_at?: string
          local_events?: boolean
          major_events?: boolean
          marketplace_radius?: string
          national_events?: boolean
          partner_radius?: string
          regional_events?: boolean
          show_city?: boolean
          show_exact_location?: boolean
          tournament_radius?: string
          updated_at?: string
          user_id: string
          willing_to_ship?: boolean
        }
        Update: {
          allow_distance_matching?: boolean
          community_radius?: string
          created_at?: string
          local_events?: boolean
          major_events?: boolean
          marketplace_radius?: string
          national_events?: boolean
          partner_radius?: string
          regional_events?: boolean
          show_city?: boolean
          show_exact_location?: boolean
          tournament_radius?: string
          updated_at?: string
          user_id?: string
          willing_to_ship?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "location_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listing_photos: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          asking_price_cents: number
          brand: string
          condition: Database["public"]["Enums"]["marketplace_condition"]
          created_at: string
          description: string | null
          id: string
          location_city: string | null
          location_lat: number | null
          location_lng: number | null
          location_state: string | null
          min_offer_cents: number
          model: string
          seller_id: string
          status: Database["public"]["Enums"]["marketplace_listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          asking_price_cents: number
          brand: string
          condition: Database["public"]["Enums"]["marketplace_condition"]
          created_at?: string
          description?: string | null
          id?: string
          location_city?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_state?: string | null
          min_offer_cents: number
          model: string
          seller_id: string
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          asking_price_cents?: number
          brand?: string
          condition?: Database["public"]["Enums"]["marketplace_condition"]
          created_at?: string
          description?: string | null
          id?: string
          location_city?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_state?: string | null
          min_offer_cents?: number
          model?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matchmaking_swipes: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["match_direction"]
          id: string
          requester_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["match_direction"]
          id?: string
          requester_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["match_direction"]
          id?: string
          requester_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_swipes_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaking_swipes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_hours: {
        Row: {
          close_time: string | null
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string | null
          owner_id: string
          owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          updated_at: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          owner_id: string
          owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          updated_at?: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["facility_asset_owner_type"]
          updated_at?: string
        }
        Relationships: []
      }
      par_algorithm_versions: {
        Row: {
          activated_at: string | null
          configuration: Json
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          retired_at: string | null
          updated_at: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          configuration?: Json
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          retired_at?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          activated_at?: string | null
          configuration?: Json
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          retired_at?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      par_game_processing: {
        Row: {
          algorithm_version: string | null
          created_at: string
          eligibility_reason: string | null
          error_message: string | null
          game_id: string
          last_evaluated_at: string
          processed_at: string | null
          session_id: string
          status: string
          updated_at: string
          verification_level: string | null
        }
        Insert: {
          algorithm_version?: string | null
          created_at?: string
          eligibility_reason?: string | null
          error_message?: string | null
          game_id: string
          last_evaluated_at?: string
          processed_at?: string | null
          session_id: string
          status?: string
          updated_at?: string
          verification_level?: string | null
        }
        Update: {
          algorithm_version?: string | null
          created_at?: string
          eligibility_reason?: string | null
          error_message?: string | null
          game_id?: string
          last_evaluated_at?: string
          processed_at?: string | null
          session_id?: string
          status?: string
          updated_at?: string
          verification_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "par_game_processing_algorithm_version_fkey"
            columns: ["algorithm_version"]
            isOneToOne: false
            referencedRelation: "par_algorithm_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "par_game_processing_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "personal_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_game_processing_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "personal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      par_rating_events: {
        Row: {
          actual_result: number
          algorithm_version: string
          confidence_after: number
          confidence_before: number
          confidence_change: number
          created_at: string
          event_type: string
          expected_result: number
          explanation_code: string
          explanation_data: Json
          game_id: string
          id: string
          opponent_strength: number
          par_after: number
          par_before: number
          par_change: number
          partner_strength: number | null
          processed_at: string
          profile_id: string
          reversal_event_id: string | null
          reversed_at: string | null
          score_margin: number
          session_id: string
          updated_at: string
          verification_level: string
          weight: number
        }
        Insert: {
          actual_result: number
          algorithm_version: string
          confidence_after: number
          confidence_before: number
          confidence_change: number
          created_at?: string
          event_type?: string
          expected_result: number
          explanation_code: string
          explanation_data?: Json
          game_id: string
          id?: string
          opponent_strength: number
          par_after: number
          par_before: number
          par_change: number
          partner_strength?: number | null
          processed_at?: string
          profile_id: string
          reversal_event_id?: string | null
          reversed_at?: string | null
          score_margin: number
          session_id: string
          updated_at?: string
          verification_level: string
          weight: number
        }
        Update: {
          actual_result?: number
          algorithm_version?: string
          confidence_after?: number
          confidence_before?: number
          confidence_change?: number
          created_at?: string
          event_type?: string
          expected_result?: number
          explanation_code?: string
          explanation_data?: Json
          game_id?: string
          id?: string
          opponent_strength?: number
          par_after?: number
          par_before?: number
          par_change?: number
          partner_strength?: number | null
          processed_at?: string
          profile_id?: string
          reversal_event_id?: string | null
          reversed_at?: string | null
          score_margin?: number
          session_id?: string
          updated_at?: string
          verification_level?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "par_rating_events_algorithm_version_fkey"
            columns: ["algorithm_version"]
            isOneToOne: false
            referencedRelation: "par_algorithm_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "par_rating_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "personal_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_rating_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_rating_events_reversal_event_id_fkey"
            columns: ["reversal_event_id"]
            isOneToOne: false
            referencedRelation: "par_rating_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_rating_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "personal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_likes: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          kind: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          kind: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          kind?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_likes_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_likes_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_matches: {
        Row: {
          id: string
          matched_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          id?: string
          matched_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          id?: string
          matched_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_matches_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_matches_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_preferences: {
        Row: {
          actively_looking: boolean
          age_preference: string
          created_at: string
          distance_idx: number
          game_types: string[]
          gender_preference: string
          preferred_days: string[]
          preferred_times: string[]
          skill_ranges: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          actively_looking?: boolean
          age_preference?: string
          created_at?: string
          distance_idx?: number
          game_types?: string[]
          gender_preference?: string
          preferred_days?: string[]
          preferred_times?: string[]
          skill_ranges?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          actively_looking?: boolean
          age_preference?: string
          created_at?: string
          distance_idx?: number
          game_types?: string[]
          gender_preference?: string
          preferred_days?: string[]
          preferred_times?: string[]
          skill_ranges?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          confirmed_at: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          payer_user_id: string
          provider: string
          provider_payment_intent_id: string | null
          purpose_id: string
          purpose_type: string
          refunded_amount_cents: number
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          payer_user_id: string
          provider?: string
          provider_payment_intent_id?: string | null
          purpose_id: string
          purpose_type: string
          refunded_amount_cents?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          payer_user_id?: string
          provider?: string
          provider_payment_intent_id?: string | null
          purpose_id?: string
          purpose_type?: string
          refunded_amount_cents?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_game_participants: {
        Row: {
          created_at: string
          game_id: string
          id: string
          position: number
          session_participant_id: string
          team_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          position: number
          session_participant_id: string
          team_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          position?: number
          session_participant_id?: string
          team_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_game_participants_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "personal_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_game_participants_session_participant_id_fkey"
            columns: ["session_participant_id"]
            isOneToOne: false
            referencedRelation: "personal_session_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_games: {
        Row: {
          completed_at: string | null
          created_at: string
          game_number: number
          id: string
          session_id: string
          status: string
          team_one_score: number | null
          team_two_score: number | null
          updated_at: string
          winning_team: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          game_number: number
          id?: string
          session_id: string
          status?: string
          team_one_score?: number | null
          team_two_score?: number | null
          updated_at?: string
          winning_team?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          game_number?: number
          id?: string
          session_id?: string
          status?: string
          team_one_score?: number | null
          team_two_score?: number | null
          updated_at?: string
          winning_team?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "personal_games_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "personal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_guest_players: {
        Row: {
          age_group: string | null
          created_at: string
          created_by: string
          display_name: string
          email: string | null
          estimated_skill: string | null
          gender: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          age_group?: string | null
          created_at?: string
          created_by: string
          display_name: string
          email?: string | null
          estimated_skill?: string | null
          gender?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          age_group?: string | null
          created_at?: string
          created_by?: string
          display_name?: string
          email?: string | null
          estimated_skill?: string | null
          gender?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_guest_players_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_guest_shares: {
        Row: {
          created_at: string
          created_by: string
          guest_player_id: string
          id: string
          session_id: string
          session_participant_id: string
          share_channel: string
          share_initiated_at: string | null
          share_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          guest_player_id: string
          id?: string
          session_id: string
          session_participant_id: string
          share_channel?: string
          share_initiated_at?: string | null
          share_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          guest_player_id?: string
          id?: string
          session_id?: string
          session_participant_id?: string
          share_channel?: string
          share_initiated_at?: string | null
          share_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_guest_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_guest_shares_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "personal_guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_guest_shares_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "personal_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_guest_shares_session_participant_id_fkey"
            columns: ["session_participant_id"]
            isOneToOne: true
            referencedRelation: "personal_session_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_match_claims: {
        Row: {
          claimed_at: string | null
          claimed_by_profile_id: string | null
          created_at: string
          created_by: string
          expires_at: string
          guest_player_id: string
          guest_share_id: string
          id: string
          revoked_at: string | null
          session_id: string
          session_participant_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          guest_player_id: string
          guest_share_id: string
          id?: string
          revoked_at?: string | null
          session_id: string
          session_participant_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          guest_player_id?: string
          guest_share_id?: string
          id?: string
          revoked_at?: string | null
          session_id?: string
          session_participant_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_match_claims_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_match_claims_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_match_claims_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "personal_guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_match_claims_guest_share_id_fkey"
            columns: ["guest_share_id"]
            isOneToOne: false
            referencedRelation: "personal_guest_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_match_claims_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "personal_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_match_claims_session_participant_id_fkey"
            columns: ["session_participant_id"]
            isOneToOne: false
            referencedRelation: "personal_session_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_session_participants: {
        Row: {
          created_at: string
          created_by: string
          display_name_snapshot: string
          estimated_skill: string | null
          guest_player_id: string | null
          id: string
          profile_id: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_name_snapshot: string
          estimated_skill?: string | null
          guest_player_id?: string | null
          id?: string
          profile_id?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_name_snapshot?: string
          estimated_skill?: string | null
          guest_player_id?: string | null
          id?: string
          profile_id?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_session_participants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_session_participants_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "personal_guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_session_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_session_participants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "personal_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          facility_id: string | null
          format: string
          id: string
          indoor_outdoor: string | null
          notes: string | null
          played_at: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          facility_id?: string | null
          format: string
          id?: string
          indoor_outdoor?: string | null
          notes?: string | null
          played_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          facility_id?: string | null
          format?: string
          id?: string
          indoor_outdoor?: string | null
          notes?: string | null
          played_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_sessions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          label: string
          options: string[] | null
          sort_order: number
          unit: string | null
          updated_at: string
          value: string
          value_type: string
        }
        Insert: {
          description?: string | null
          key: string
          label: string
          options?: string[] | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          value?: string
          value_type?: string
        }
        Update: {
          description?: string | null
          key?: string
          label?: string
          options?: string[] | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          value?: string
          value_type?: string
        }
        Relationships: []
      }
      play_event_invites: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          play_event_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          play_event_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          play_event_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_event_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_event_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_event_invites_play_event_id_fkey"
            columns: ["play_event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
        ]
      }
      play_events: {
        Row: {
          city: string | null
          cover_url: string | null
          created_at: string
          duration_minutes: number | null
          event_date: string
          event_type: Database["public"]["Enums"]["play_event_type"]
          facility_id: string | null
          format: string | null
          group_id: string | null
          id: string
          instructor_id: string | null
          location: string
          max_players: number
          name: string
          notes: string | null
          organizer_id: string
          skill_max: number | null
          skill_min: number | null
          slug: string | null
          start_time: string | null
          state: string | null
          status: Database["public"]["Enums"]["play_event_status"]
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          city?: string | null
          cover_url?: string | null
          created_at?: string
          duration_minutes?: number | null
          event_date: string
          event_type?: Database["public"]["Enums"]["play_event_type"]
          facility_id?: string | null
          format?: string | null
          group_id?: string | null
          id?: string
          instructor_id?: string | null
          location: string
          max_players: number
          name: string
          notes?: string | null
          organizer_id: string
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          start_time?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["play_event_status"]
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          city?: string | null
          cover_url?: string | null
          created_at?: string
          duration_minutes?: number | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["play_event_type"]
          facility_id?: string | null
          format?: string | null
          group_id?: string | null
          id?: string
          instructor_id?: string | null
          location?: string
          max_players?: number
          name?: string
          notes?: string | null
          organizer_id?: string
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          start_time?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["play_event_status"]
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "play_events_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_events_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      play_matches: {
        Row: {
          court: number | null
          created_at: string
          event_id: string
          id: string
          match_number: number | null
          player_a_id: string | null
          player_a2_id: string | null
          player_b_id: string | null
          player_b2_id: string | null
          round: number
          score_a: number | null
          score_b: number | null
          updated_at: string
          winner: number | null
        }
        Insert: {
          court?: number | null
          created_at?: string
          event_id: string
          id?: string
          match_number?: number | null
          player_a_id?: string | null
          player_a2_id?: string | null
          player_b_id?: string | null
          player_b2_id?: string | null
          round: number
          score_a?: number | null
          score_b?: number | null
          updated_at?: string
          winner?: number | null
        }
        Update: {
          court?: number | null
          created_at?: string
          event_id?: string
          id?: string
          match_number?: number | null
          player_a_id?: string | null
          player_a2_id?: string | null
          player_b_id?: string | null
          player_b2_id?: string | null
          round?: number
          score_a?: number | null
          score_b?: number | null
          updated_at?: string
          winner?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "play_matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "play_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "play_participants_authenticated"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "play_participants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_a2_id_fkey"
            columns: ["player_a2_id"]
            isOneToOne: false
            referencedRelation: "play_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_a2_id_fkey"
            columns: ["player_a2_id"]
            isOneToOne: false
            referencedRelation: "play_participants_authenticated"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_a2_id_fkey"
            columns: ["player_a2_id"]
            isOneToOne: false
            referencedRelation: "play_participants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "play_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "play_participants_authenticated"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "play_participants_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_b2_id_fkey"
            columns: ["player_b2_id"]
            isOneToOne: false
            referencedRelation: "play_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_b2_id_fkey"
            columns: ["player_b2_id"]
            isOneToOne: false
            referencedRelation: "play_participants_authenticated"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_matches_player_b2_id_fkey"
            columns: ["player_b2_id"]
            isOneToOne: false
            referencedRelation: "play_participants_public"
            referencedColumns: ["id"]
          },
        ]
      }
      play_participants: {
        Row: {
          added_by_organizer: boolean
          claimed_by: string | null
          created_at: string
          email: string
          event_id: string
          first_name: string
          gender: string | null
          id: string
          last_initial: string | null
          phone: string | null
          self_rating: string | null
        }
        Insert: {
          added_by_organizer?: boolean
          claimed_by?: string | null
          created_at?: string
          email: string
          event_id: string
          first_name: string
          gender?: string | null
          id?: string
          last_initial?: string | null
          phone?: string | null
          self_rating?: string | null
        }
        Update: {
          added_by_organizer?: boolean
          claimed_by?: string | null
          created_at?: string
          email?: string
          event_id?: string
          first_name?: string
          gender?: string | null
          id?: string
          last_initial?: string | null
          phone?: string | null
          self_rating?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "play_participants_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
        ]
      }
      player_par_profiles: {
        Row: {
          algorithm_version: string
          confidence_band: string
          confidence_score: number
          created_at: string
          current_par: number
          eligible_games_count: number
          initial_par: number
          initialization_source: string
          initialized_at: string
          last_processed_game_id: string | null
          last_rated_at: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          algorithm_version: string
          confidence_band?: string
          confidence_score?: number
          created_at?: string
          current_par: number
          eligible_games_count?: number
          initial_par: number
          initialization_source: string
          initialized_at?: string
          last_processed_game_id?: string | null
          last_rated_at?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          algorithm_version?: string
          confidence_band?: string
          confidence_score?: number
          created_at?: string
          current_par?: number
          eligible_games_count?: number
          initial_par?: number
          initialization_source?: string
          initialized_at?: string
          last_processed_game_id?: string | null
          last_rated_at?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_par_profiles_algorithm_version_fkey"
            columns: ["algorithm_version"]
            isOneToOne: false
            referencedRelation: "par_algorithm_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "player_par_profiles_last_processed_game_id_fkey"
            columns: ["last_processed_game_id"]
            isOneToOne: false
            referencedRelation: "personal_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_par_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_hidden_matches: {
        Row: {
          created_at: string
          id: string
          match_id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          player_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_hidden_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "bracket_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_hidden_matches_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability: string | null
          availability_schedule: Json
          avatar_url: string | null
          bio: string | null
          coach_commission_override_pct: number | null
          coach_status: Database["public"]["Enums"]["coach_status"]
          cover_url: string | null
          created_at: string
          date_of_birth: string | null
          deleted_at: string | null
          director_approved_at: string | null
          director_approved_by: string | null
          director_events_hosted: number
          director_rating: number | null
          director_status: Database["public"]["Enums"]["director_status"] | null
          dupr: number | null
          dupr_verified: boolean
          email: string
          full_name: string
          gender: string | null
          hand: string | null
          handle: string | null
          home_court_id: string | null
          id: string
          is_coach: boolean
          is_director: boolean
          is_discoverable: boolean
          location_city: string | null
          location_coords: unknown
          location_lat: number | null
          location_lng: number | null
          location_state: string | null
          looking_status: string
          marketplace_listing_limit: number | null
          notif_hold_expiry: boolean
          notif_liked_you: boolean
          notif_new_match: boolean
          notif_tournaments: boolean
          onboarding_intent: string[] | null
          paddle: string | null
          play_style: string | null
          role: Database["public"]["Enums"]["user_role"]
          self_rating: string | null
          skill_level: string | null
          story_radius_miles: number
          stripe_connect_account_id: string | null
          stripe_connect_onboarded_at: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          availability_schedule?: Json
          avatar_url?: string | null
          bio?: string | null
          coach_commission_override_pct?: number | null
          coach_status?: Database["public"]["Enums"]["coach_status"]
          cover_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          director_approved_at?: string | null
          director_approved_by?: string | null
          director_events_hosted?: number
          director_rating?: number | null
          director_status?:
            | Database["public"]["Enums"]["director_status"]
            | null
          dupr?: number | null
          dupr_verified?: boolean
          email: string
          full_name: string
          gender?: string | null
          hand?: string | null
          handle?: string | null
          home_court_id?: string | null
          id: string
          is_coach?: boolean
          is_director?: boolean
          is_discoverable?: boolean
          location_city?: string | null
          location_coords?: unknown
          location_lat?: number | null
          location_lng?: number | null
          location_state?: string | null
          looking_status?: string
          marketplace_listing_limit?: number | null
          notif_hold_expiry?: boolean
          notif_liked_you?: boolean
          notif_new_match?: boolean
          notif_tournaments?: boolean
          onboarding_intent?: string[] | null
          paddle?: string | null
          play_style?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          self_rating?: string | null
          skill_level?: string | null
          story_radius_miles?: number
          stripe_connect_account_id?: string | null
          stripe_connect_onboarded_at?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          availability_schedule?: Json
          avatar_url?: string | null
          bio?: string | null
          coach_commission_override_pct?: number | null
          coach_status?: Database["public"]["Enums"]["coach_status"]
          cover_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          deleted_at?: string | null
          director_approved_at?: string | null
          director_approved_by?: string | null
          director_events_hosted?: number
          director_rating?: number | null
          director_status?:
            | Database["public"]["Enums"]["director_status"]
            | null
          dupr?: number | null
          dupr_verified?: boolean
          email?: string
          full_name?: string
          gender?: string | null
          hand?: string | null
          handle?: string | null
          home_court_id?: string | null
          id?: string
          is_coach?: boolean
          is_director?: boolean
          is_discoverable?: boolean
          location_city?: string | null
          location_coords?: unknown
          location_lat?: number | null
          location_lng?: number | null
          location_state?: string | null
          looking_status?: string
          marketplace_listing_limit?: number | null
          notif_hold_expiry?: boolean
          notif_liked_you?: boolean
          notif_new_match?: boolean
          notif_tournaments?: boolean
          onboarding_intent?: string[] | null
          paddle?: string | null
          play_style?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          self_rating?: string | null
          skill_level?: string | null
          story_radius_miles?: number
          stripe_connect_account_id?: string | null
          stripe_connect_onboarded_at?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_director_approved_by_fkey"
            columns: ["director_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_home_court_id_fkey"
            columns: ["home_court_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          expo_push_token: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expo_push_token: string
          platform?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expo_push_token?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_group_members: {
        Row: {
          amount_due_cents: number
          amount_paid_cents: number
          created_at: string
          declined_at: string | null
          expires_at: string | null
          group_id: string
          id: string
          invited_at: string
          paid_at: string | null
          payment_id: string | null
          payment_state: Database["public"]["Enums"]["registration_group_member_state"]
          registration_id: string | null
          role: Database["public"]["Enums"]["registration_group_member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_due_cents: number
          amount_paid_cents?: number
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          group_id: string
          id?: string
          invited_at?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_state?: Database["public"]["Enums"]["registration_group_member_state"]
          registration_id?: string | null
          role: Database["public"]["Enums"]["registration_group_member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_due_cents?: number
          amount_paid_cents?: number
          created_at?: string
          declined_at?: string | null
          expires_at?: string | null
          group_id?: string
          id?: string
          invited_at?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_state?: Database["public"]["Enums"]["registration_group_member_state"]
          registration_id?: string | null
          role?: Database["public"]["Enums"]["registration_group_member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "registration_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_group_members_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_group_members_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_groups: {
        Row: {
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string
          division_id: string
          expires_at: string | null
          id: string
          required_member_count: number
          status: Database["public"]["Enums"]["registration_group_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by: string
          division_id: string
          expires_at?: string | null
          id?: string
          required_member_count?: number
          status?: Database["public"]["Enums"]["registration_group_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          division_id?: string
          expires_at?: string | null
          id?: string
          required_member_count?: number
          status?: Database["public"]["Enums"]["registration_group_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_groups_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "registration_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          added_by_director_id: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          converted_at: string | null
          created_at: string
          director_added: boolean
          division_id: string | null
          entry_fee_paid_cents: number
          guest_partner_id: string | null
          guest_player_id: string | null
          hold_expired_at: string | null
          hold_expires_at: string | null
          hold_fee_paid_cents: number
          id: string
          needs_partner: boolean
          partner_id: string | null
          player_id: string | null
          registration_group_id: string | null
          replaces_registration_id: string | null
          status: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id: string | null
          stripe_hold_intent_id: string | null
          tournament_id: string
          updated_at: string
          waitlist_offer_expires_at: string | null
          waitlist_position: number | null
          waiver_accepted_at: string | null
        }
        Insert: {
          added_by_director_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          converted_at?: string | null
          created_at?: string
          director_added?: boolean
          division_id?: string | null
          entry_fee_paid_cents?: number
          guest_partner_id?: string | null
          guest_player_id?: string | null
          hold_expired_at?: string | null
          hold_expires_at?: string | null
          hold_fee_paid_cents?: number
          id?: string
          needs_partner?: boolean
          partner_id?: string | null
          player_id?: string | null
          registration_group_id?: string | null
          replaces_registration_id?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id?: string | null
          stripe_hold_intent_id?: string | null
          tournament_id: string
          updated_at?: string
          waitlist_offer_expires_at?: string | null
          waitlist_position?: number | null
          waiver_accepted_at?: string | null
        }
        Update: {
          added_by_director_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          converted_at?: string | null
          created_at?: string
          director_added?: boolean
          division_id?: string | null
          entry_fee_paid_cents?: number
          guest_partner_id?: string | null
          guest_player_id?: string | null
          hold_expired_at?: string | null
          hold_expires_at?: string | null
          hold_fee_paid_cents?: number
          id?: string
          needs_partner?: boolean
          partner_id?: string | null
          player_id?: string | null
          registration_group_id?: string | null
          replaces_registration_id?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id?: string | null
          stripe_hold_intent_id?: string | null
          tournament_id?: string
          updated_at?: string
          waitlist_offer_expires_at?: string | null
          waitlist_position?: number | null
          waiver_accepted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_added_by_director_id_fkey"
            columns: ["added_by_director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_guest_partner_id_fkey"
            columns: ["guest_partner_id"]
            isOneToOne: false
            referencedRelation: "personal_guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_guest_player_id_fkey"
            columns: ["guest_player_id"]
            isOneToOne: false
            referencedRelation: "personal_guest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_registration_group_id_fkey"
            columns: ["registration_group_id"]
            isOneToOne: false
            referencedRelation: "registration_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_replaces_registration_id_fkey"
            columns: ["replaces_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_invites: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          reservation_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          reservation_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          reservation_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_invites_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_invites_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_players: {
        Row: {
          id: string
          is_organizer: boolean
          joined_at: string
          profile_id: string
          reservation_id: string
        }
        Insert: {
          id?: string
          is_organizer?: boolean
          joined_at?: string
          profile_id: string
          reservation_id: string
        }
        Update: {
          id?: string
          is_organizer?: boolean
          joined_at?: string
          profile_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_players_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          base_price_cents: number
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          facility_id: string
          final_price_cents: number
          flash_deal_discount_percent: number | null
          flash_deal_id: string | null
          game_format:
            | Database["public"]["Enums"]["reservation_game_format"]
            | null
          hold_expires_at: string | null
          id: string
          max_players: number
          organizer_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          time_range: unknown
          updated_at: string
        }
        Insert: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          base_price_cents: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          facility_id: string
          final_price_cents: number
          flash_deal_discount_percent?: number | null
          flash_deal_id?: string | null
          game_format?:
            | Database["public"]["Enums"]["reservation_game_format"]
            | null
          hold_expires_at?: string | null
          id?: string
          max_players: number
          organizer_id: string
          status?: Database["public"]["Enums"]["reservation_status"]
          time_range: unknown
          updated_at?: string
        }
        Update: {
          asset_id?: string
          asset_type?: Database["public"]["Enums"]["facility_asset_owner_type"]
          base_price_cents?: number
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          facility_id?: string
          final_price_cents?: number
          flash_deal_discount_percent?: number | null
          flash_deal_id?: string | null
          game_format?:
            | Database["public"]["Enums"]["reservation_game_format"]
            | null
          hold_expires_at?: string | null
          id?: string
          max_players?: number
          organizer_id?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          time_range?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_flash_deal_id_fkey"
            columns: ["flash_deal_id"]
            isOneToOne: false
            referencedRelation: "flash_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_play_events: {
        Row: {
          created_at: string
          id: string
          play_event_id: string
          player_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          play_event_id: string
          player_id: string
        }
        Update: {
          created_at?: string
          id?: string
          play_event_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_play_events_play_event_id_fkey"
            columns: ["play_event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_play_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          story_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          story_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "dynamic_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          payload: Json
          processed_at: string | null
          type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          payload: Json
          processed_at?: string | null
          type: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          type?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_admin_id: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          context: Json | null
          conversation_id: string
          created_at: string
          diagnostics: Json | null
          id: string
          resolved_at: string | null
          source: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_admin_id?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          context?: Json | null
          conversation_id: string
          created_at?: string
          diagnostics?: Json | null
          id?: string
          resolved_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_admin_id?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          context?: Json | null
          conversation_id?: string
          created_at?: string
          diagnostics?: Json | null
          id?: string
          resolved_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bookmarks: {
        Row: {
          created_at: string
          id: string
          player_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bookmarks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bookmarks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bookmarks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "tournament_bookmarks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_sponsors: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          logo_url: string | null
          name: string
          tier: string
          tournament_id: string
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          logo_url?: string | null
          name: string
          tier?: string
          tournament_id: string
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          logo_url?: string | null
          name?: string
          tier?: string
          tournament_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_sponsors_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_sponsors_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "tournament_sponsors_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bracket_type: Database["public"]["Enums"]["bracket_type"]
          cancellation_policy: string | null
          checkin_closes_at: string | null
          checkin_opens_at: string | null
          city: string
          cover_img_url: string | null
          created_at: string
          description: string | null
          director_id: string
          draw_size: number
          entry_fee_cents: number
          event_date: string
          facility_id: string | null
          featured: boolean
          format: Database["public"]["Enums"]["tournament_format"]
          formats: string[] | null
          hold_cutoff_days: number
          hold_duration_hours: number
          hold_fee_cents: number
          id: string
          name: string
          pool_count: number | null
          prize_pool_cents: number | null
          refund_cutoff_days: number
          registration_closes_at: string | null
          registration_opens_at: string | null
          rejected_reason: string | null
          rejection_reason: string | null
          rules: string | null
          skill_max: number | null
          skill_min: number | null
          slug: string | null
          spots_filled: number
          start_time: string | null
          state: string
          status: Database["public"]["Enums"]["tournament_status"]
          submitted_for_approval_at: string | null
          tournament_format: string | null
          updated_at: string
          venue_address: string | null
          venue_name: string | null
          zip_code: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bracket_type?: Database["public"]["Enums"]["bracket_type"]
          cancellation_policy?: string | null
          checkin_closes_at?: string | null
          checkin_opens_at?: string | null
          city: string
          cover_img_url?: string | null
          created_at?: string
          description?: string | null
          director_id: string
          draw_size: number
          entry_fee_cents: number
          event_date: string
          facility_id?: string | null
          featured?: boolean
          format: Database["public"]["Enums"]["tournament_format"]
          formats?: string[] | null
          hold_cutoff_days?: number
          hold_duration_hours?: number
          hold_fee_cents: number
          id?: string
          name: string
          pool_count?: number | null
          prize_pool_cents?: number | null
          refund_cutoff_days?: number
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejected_reason?: string | null
          rejection_reason?: string | null
          rules?: string | null
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          spots_filled?: number
          start_time?: string | null
          state: string
          status?: Database["public"]["Enums"]["tournament_status"]
          submitted_for_approval_at?: string | null
          tournament_format?: string | null
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          zip_code?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bracket_type?: Database["public"]["Enums"]["bracket_type"]
          cancellation_policy?: string | null
          checkin_closes_at?: string | null
          checkin_opens_at?: string | null
          city?: string
          cover_img_url?: string | null
          created_at?: string
          description?: string | null
          director_id?: string
          draw_size?: number
          entry_fee_cents?: number
          event_date?: string
          facility_id?: string | null
          featured?: boolean
          format?: Database["public"]["Enums"]["tournament_format"]
          formats?: string[] | null
          hold_cutoff_days?: number
          hold_duration_hours?: number
          hold_fee_cents?: number
          id?: string
          name?: string
          pool_count?: number | null
          prize_pool_cents?: number | null
          refund_cutoff_days?: number
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejected_reason?: string | null
          rejection_reason?: string | null
          rules?: string | null
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          spots_filled?: number
          start_time?: string | null
          state?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          submitted_for_approval_at?: string | null
          tournament_format?: string | null
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          created_at: string
          failure_reason: string | null
          id: string
          player_id: string
          registration_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          stripe_id: string | null
          tournament_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          player_id: string
          registration_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_id?: string | null
          tournament_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          player_id?: string
          registration_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_id?: string | null
          tournament_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_director_earnings"
            referencedColumns: ["tournament_id"]
          },
          {
            foreignKeyName: "transactions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "v_tournament_listing"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          notes: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          related_listing_id: string | null
          reported_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          related_listing_id?: string | null
          reported_id: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          related_listing_id?: string | null
          reported_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_related_listing_id_fkey"
            columns: ["related_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_activity: {
        Row: {
          amount: number | null
          created_at: string
          currency_code: string | null
          description: string | null
          event_type: string
          external_reference_id: string | null
          id: string
          metadata: Json
          title: string
          user_id: string
          wallet_item_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency_code?: string | null
          description?: string | null
          event_type: string
          external_reference_id?: string | null
          id?: string
          metadata?: Json
          title: string
          user_id: string
          wallet_item_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency_code?: string | null
          description?: string | null
          event_type?: string
          external_reference_id?: string | null
          id?: string
          metadata?: Json
          title?: string
          user_id?: string
          wallet_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_activity_wallet_item_id_fkey"
            columns: ["wallet_item_id"]
            isOneToOne: false
            referencedRelation: "wallet_items"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_items: {
        Row: {
          action_label: string | null
          action_type: string
          action_url: string | null
          created_at: string
          currency_code: string
          description: string | null
          expires_at: string | null
          external_account_id: string | null
          external_customer_id: string | null
          external_reference_id: string | null
          external_system: string | null
          id: string
          is_seen: boolean
          metadata: Json
          original_value_amount: number | null
          partner_id: string | null
          redeemed_at: string | null
          remaining_value_amount: number | null
          seen_at: string | null
          source_id: string | null
          source_type: string | null
          starts_at: string | null
          status: string
          subtitle: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          value_amount: number | null
          value_label: string | null
        }
        Insert: {
          action_label?: string | null
          action_type?: string
          action_url?: string | null
          created_at?: string
          currency_code?: string
          description?: string | null
          expires_at?: string | null
          external_account_id?: string | null
          external_customer_id?: string | null
          external_reference_id?: string | null
          external_system?: string | null
          id?: string
          is_seen?: boolean
          metadata?: Json
          original_value_amount?: number | null
          partner_id?: string | null
          redeemed_at?: string | null
          remaining_value_amount?: number | null
          seen_at?: string | null
          source_id?: string | null
          source_type?: string | null
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
          value_amount?: number | null
          value_label?: string | null
        }
        Update: {
          action_label?: string | null
          action_type?: string
          action_url?: string | null
          created_at?: string
          currency_code?: string
          description?: string | null
          expires_at?: string | null
          external_account_id?: string | null
          external_customer_id?: string | null
          external_reference_id?: string | null
          external_system?: string | null
          id?: string
          is_seen?: boolean
          metadata?: Json
          original_value_amount?: number | null
          partner_id?: string | null
          redeemed_at?: string | null
          remaining_value_amount?: number | null
          seen_at?: string | null
          source_id?: string | null
          source_type?: string | null
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          value_amount?: number | null
          value_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_items_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "wallet_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_partners: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          metadata: Json
          name: string
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          metadata?: Json
          name: string
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          metadata?: Json
          name?: string
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      wallet_redemptions: {
        Row: {
          amount: number | null
          completed_at: string | null
          created_at: string
          currency_code: string | null
          external_order_id: string | null
          external_reference_id: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          metadata: Json
          started_at: string
          status: string
          updated_at: string
          user_id: string
          wallet_item_id: string
        }
        Insert: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          external_order_id?: string | null
          external_reference_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
          wallet_item_id: string
        }
        Update: {
          amount?: number | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          external_order_id?: string | null
          external_reference_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          wallet_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_redemptions_wallet_item_id_fkey"
            columns: ["wallet_item_id"]
            isOneToOne: false
            referencedRelation: "wallet_items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      play_participants_authenticated: {
        Row: {
          avatar_url: string | null
          claimed_by: string | null
          created_at: string | null
          event_id: string | null
          first_name: string | null
          gender: string | null
          id: string | null
          is_claimed: boolean | null
          last_initial: string | null
          location_city: string | null
          location_state: string | null
          profile_self_rating: string | null
          self_rating: string | null
        }
        Relationships: [
          {
            foreignKeyName: "play_participants_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
        ]
      }
      play_participants_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          event_id: string | null
          first_name: string | null
          gender: string | null
          id: string | null
          is_claimed: boolean | null
          last_initial: string | null
          location_city: string | null
          location_state: string | null
          profile_self_rating: string | null
          self_rating: string | null
        }
        Relationships: [
          {
            foreignKeyName: "play_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "play_events"
            referencedColumns: ["id"]
          },
        ]
      }
      v_director_earnings: {
        Row: {
          confirmed_registrations: number | null
          director_id: string | null
          director_payout_cents: number | null
          event_date: string | null
          gross_entry_cents: number | null
          gross_hold_cents: number | null
          platform_fee_cents: number | null
          tournament_id: string | null
          tournament_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_mutual_matches: {
        Row: {
          matched_at: string | null
          user_a: string | null
          user_b: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_swipes_requester_id_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaking_swipes_target_id_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tournament_listing: {
        Row: {
          bracket_type: Database["public"]["Enums"]["bracket_type"] | null
          city: string | null
          cover_img_url: string | null
          director_name: string | null
          director_rating: number | null
          draw_size: number | null
          entry_fee_cents: number | null
          event_date: string | null
          fill_pct: number | null
          format: Database["public"]["Enums"]["tournament_format"] | null
          hold_fee_cents: number | null
          id: string | null
          is_past: boolean | null
          name: string | null
          prize_pool_cents: number | null
          registration_closes_at: string | null
          skill_max: number | null
          skill_min: number | null
          slug: string | null
          spots_filled: number | null
          spots_remaining: number | null
          state: string | null
          status: Database["public"]["Enums"]["tournament_status"] | null
          venue_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_reservation_invite: {
        Args: { p_invite_id: string }
        Returns: {
          id: string
          is_organizer: boolean
          joined_at: string
          profile_id: string
          reservation_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reservation_players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_personal_session_guest_participant: {
        Args: {
          p_display_name: string
          p_email?: string
          p_estimated_skill?: string
          p_phone?: string
          p_session_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          display_name_snapshot: string
          estimated_skill: string | null
          guest_player_id: string | null
          id: string
          profile_id: string | null
          session_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personal_session_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_personal_session_registered_participant: {
        Args: { p_profile_id: string; p_session_id: string }
        Returns: {
          created_at: string
          created_by: string
          display_name_snapshot: string
          estimated_skill: string | null
          guest_player_id: string | null
          id: string
          profile_id: string | null
          session_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personal_session_participants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      admin_delete_tournament: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      apply_to_be_director: {
        Args: never
        Returns: Database["public"]["Enums"]["director_status"]
      }
      cancel_reservation: {
        Args: { p_reservation_id: string }
        Returns: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          base_price_cents: number
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          facility_id: string
          final_price_cents: number
          flash_deal_discount_percent: number | null
          flash_deal_id: string | null
          game_format:
            | Database["public"]["Enums"]["reservation_game_format"]
            | null
          hold_expires_at: string | null
          id: string
          max_players: number
          organizer_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          time_range: unknown
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in_registration: {
        Args: { p_registration_id: string; p_tournament_id: string }
        Returns: {
          checked_in_at: string
          division_name: string
          player_name: string
          reason: string
          registration_id: string
          result: string
          tournament_name: string
        }[]
      }
      claim_personal_match: {
        Args: { p_token: string }
        Returns: {
          reason: string
          session_id: string
          status: string
        }[]
      }
      complete_personal_session: {
        Args: {
          p_facility_id?: string
          p_indoor_outdoor?: string
          p_notes?: string
          p_session_id: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          facility_id: string | null
          format: string
          id: string
          indoor_outdoor: string | null
          notes: string | null
          played_at: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personal_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_personal_session_with_distribution: {
        Args: {
          p_facility_id?: string
          p_indoor_outdoor?: string
          p_notes?: string
          p_session_id: string
        }
        Returns: {
          claim_status: string
          delivery_status: string
          display_name: string
          guest_player_id: string
          guest_share_id: string
          participant_kind: string
          phone: string
          profile_id: string
          session_participant_id: string
        }[]
      }
      confirm_reservation: {
        Args: { p_reservation_id: string }
        Returns: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          base_price_cents: number
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          facility_id: string
          final_price_cents: number
          flash_deal_discount_percent: number | null
          flash_deal_id: string | null
          game_format:
            | Database["public"]["Enums"]["reservation_game_format"]
            | null
          hold_expires_at: string | null
          id: string
          max_players: number
          organizer_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          time_range: unknown
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_coach_offer_purchase: {
        Args: { p_offer_id: string; p_participant_quantity?: number }
        Returns: {
          boost_attributed: boolean
          boost_commission_amount_cents: number
          boost_commission_pct: number
          buyer_id: string
          buyer_service_fee_cents: number
          buyer_total_charged_cents: number
          coach_id: string
          coach_net_proceeds_cents: number
          coach_net_proceeds_provisional: boolean
          commission_pct: number
          commission_source: string
          created_at: string
          currency: string
          discount_pct: number
          expiration_days: number
          expiration_policy: string
          facility_id: string | null
          gross_selling_price_cents: number
          id: string
          inventory_hold_expires_at: string
          lessons_included: number | null
          offer_id: string
          offer_title: string
          offer_type: Database["public"]["Enums"]["coach_offer_type"]
          paid_at: string | null
          participant_quantity: number
          platform_commission_amount_cents: number
          premium_eligible_at_purchase: boolean
          premium_price_applied: boolean
          processing_fee_cents: number | null
          processing_fee_status: Database["public"]["Enums"]["coach_offer_purchase_processing_fee_status"]
          regular_price_cents: number
          selling_price_cents: number
          status: Database["public"]["Enums"]["coach_offer_purchase_status"]
          tax_amount_cents: number
          tax_status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "coach_offer_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_coach_voucher_from_finalized_purchase: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      create_personal_match_claim_link: {
        Args: { p_guest_share_id: string }
        Returns: {
          claim_id: string
          claim_url: string
          expires_at: string
          guest_share_id: string
          token: string
        }[]
      }
      create_personal_session: {
        Args: {
          p_facility_id?: string
          p_format: string
          p_indoor_outdoor?: string
          p_notes?: string
          p_played_at?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string
          facility_id: string | null
          format: string
          id: string
          indoor_outdoor: string | null
          notes: string | null
          played_at: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personal_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_reservation: {
        Args: {
          p_asset_id: string
          p_asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          p_ends_at: string
          p_facility_id: string
          p_game_format?: Database["public"]["Enums"]["reservation_game_format"]
          p_hold_minutes?: number
          p_starts_at: string
        }
        Returns: {
          asset_id: string
          asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          base_price_cents: number
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          facility_id: string
          final_price_cents: number
          flash_deal_discount_percent: number | null
          flash_deal_id: string | null
          game_format:
            | Database["public"]["Enums"]["reservation_game_format"]
            | null
          hold_expires_at: string | null
          id: string
          max_players: number
          organizer_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          time_range: unknown
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_director_status: {
        Args: never
        Returns: Database["public"]["Enums"]["director_status"]
      }
      current_user_is_director: { Args: never; Returns: boolean }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      decline_registration_group_invite: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      director_add_tournament_registration: {
        Args: {
          p_division_id: string
          p_guest?: Json
          p_partner_guest?: Json
          p_partner_id?: string
          p_player_id?: string
          p_tournament_id: string
        }
        Returns: {
          added_by_director_id: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          converted_at: string | null
          created_at: string
          director_added: boolean
          division_id: string | null
          entry_fee_paid_cents: number
          guest_partner_id: string | null
          guest_player_id: string | null
          hold_expired_at: string | null
          hold_expires_at: string | null
          hold_fee_paid_cents: number
          id: string
          needs_partner: boolean
          partner_id: string | null
          player_id: string | null
          registration_group_id: string | null
          replaces_registration_id: string | null
          status: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id: string | null
          stripe_hold_intent_id: string | null
          tournament_id: string
          updated_at: string
          waitlist_offer_expires_at: string | null
          waitlist_position: number | null
          waiver_accepted_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      ensure_personal_match_claims_for_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      ensure_registration_group: {
        Args: {
          p_amount_due_cents: number
          p_division_id: string
          p_expires_at?: string
          p_initiator_id: string
          p_partner_id: string
          p_tournament_id: string
        }
        Returns: {
          group_id: string
          initiator_member_id: string
          partner_member_id: string
        }[]
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      evaluate_personal_game_par_eligibility: {
        Args: { p_game_id: string }
        Returns: {
          algorithm_version: string | null
          created_at: string
          eligibility_reason: string | null
          error_message: string | null
          game_id: string
          last_evaluated_at: string
          processed_at: string | null
          session_id: string
          status: string
          updated_at: string
          verification_level: string | null
        }
        SetofOptions: {
          from: "*"
          to: "par_game_processing"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_registration_group_invites: { Args: never; Returns: number }
      expire_stale_holds: { Args: never; Returns: number }
      expire_stale_reservation_holds: { Args: never; Returns: number }
      facility_id_for_owner: {
        Args: {
          p_owner_id: string
          p_owner_type: Database["public"]["Enums"]["facility_asset_owner_type"]
        }
        Returns: string
      }
      facility_role_rank: {
        Args: { p_role: Database["public"]["Enums"]["facility_member_role"] }
        Returns: number
      }
      finalize_coach_offer_purchase_inventory: {
        Args: { p_offer_id: string; p_quantity: number }
        Returns: undefined
      }
      fn_send_transactional_email: {
        Args: { p_payload: Json }
        Returns: undefined
      }
      generate_dynamic_stories: { Args: never; Returns: undefined }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_or_create_direct_conversation: {
        Args: { p_partner_id: string }
        Returns: string
      }
      get_or_create_play_event_conversation: {
        Args: { p_event_id: string }
        Returns: string
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_pending_group_invite: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      initialize_own_player_par_profile: {
        Args: never
        Returns: {
          algorithm_version: string
          confidence_band: string
          confidence_score: number
          created_at: string
          current_par: number
          eligible_games_count: number
          initial_par: number
          initialization_source: string
          initialized_at: string
          last_processed_game_id: string | null
          last_rated_at: string | null
          profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "player_par_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      initialize_player_par_profile: {
        Args: { p_algorithm_version?: string; p_profile_id: string }
        Returns: {
          algorithm_version: string
          confidence_band: string
          confidence_score: number
          created_at: string
          current_par: number
          eligible_games_count: number
          initial_par: number
          initialization_source: string
          initialized_at: string
          last_processed_game_id: string | null
          last_rated_at: string | null
          profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "player_par_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved_director: { Args: never; Returns: boolean }
      is_coach_publish_ready: { Args: { p_user_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      is_facility_role_at_least: {
        Args: {
          p_facility_id: string
          p_min_role: Database["public"]["Enums"]["facility_member_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      is_group_admin: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      is_listing_owner: {
        Args: { p_listing_id: string; p_user_id: string }
        Returns: boolean
      }
      is_personal_session_visible: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      is_registration_group_director: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      is_registration_group_member: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      is_reservation_organizer: {
        Args: { p_reservation_id: string; p_user_id: string }
        Returns: boolean
      }
      is_reservation_player: {
        Args: { p_reservation_id: string; p_user_id: string }
        Returns: boolean
      }
      join_play_event: {
        Args: {
          p_added_by_organizer?: boolean
          p_claimed_by?: string
          p_email: string
          p_event_id: string
          p_first_name: string
          p_last_initial?: string
          p_self_rating?: string
        }
        Returns: {
          added_by_organizer: boolean
          claimed_by: string | null
          created_at: string
          email: string
          event_id: string
          first_name: string
          gender: string | null
          id: string
          last_initial: string | null
          phone: string | null
          self_rating: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "play_participants"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      join_reservation: {
        Args: { p_reservation_id: string }
        Returns: {
          id: string
          is_organizer: boolean
          joined_at: string
          profile_id: string
          reservation_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reservation_players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mark_personal_guest_share_initiated: {
        Args: { p_guest_share_id: string }
        Returns: {
          created_at: string
          created_by: string
          guest_player_id: string
          id: string
          session_id: string
          session_participant_id: string
          share_channel: string
          share_initiated_at: string | null
          share_status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personal_guest_shares"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_registration_group_member_paid: {
        Args: {
          p_amount_cents: number
          p_member_id: string
          p_payment_id: string
          p_stripe_intent_id?: string
        }
        Returns: string
      }
      mark_wallet_item_seen: { Args: { p_item_id: string }; Returns: undefined }
      par_clamp: {
        Args: { p_max: number; p_min: number; p_value: number }
        Returns: number
      }
      par_confidence_band: { Args: { p_score: number }; Returns: string }
      par_explanation_code: {
        Args: {
          p_actual: number
          p_expected: number
          p_margin_category: string
        }
        Returns: string
      }
      par_guest_estimated_rating: {
        Args: { p_anchor: number; p_config: Json; p_skill: string }
        Returns: number
      }
      par_score_margin_category: {
        Args: { p_config: Json; p_margin: number }
        Returns: string
      }
      par_score_margin_multiplier: {
        Args: { p_category: string; p_config: Json }
        Returns: number
      }
      par_skill_level_initial_value: {
        Args: { p_skill_level: string }
        Returns: number
      }
      personal_match_claim_hash: { Args: { p_token: string }; Returns: string }
      personal_match_claim_token: { Args: never; Returns: string }
      personal_session_expected_players: {
        Args: { p_format: string }
        Returns: number
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_personal_game_par: {
        Args: { p_game_id: string }
        Returns: {
          actual_result: number
          algorithm_version: string
          confidence_after: number
          confidence_before: number
          confidence_change: number
          created_at: string
          event_type: string
          expected_result: number
          explanation_code: string
          explanation_data: Json
          game_id: string
          id: string
          opponent_strength: number
          par_after: number
          par_before: number
          par_change: number
          partner_strength: number | null
          processed_at: string
          profile_id: string
          reversal_event_id: string | null
          reversed_at: string | null
          score_margin: number
          session_id: string
          updated_at: string
          verification_level: string
          weight: number
        }[]
        SetofOptions: {
          from: "*"
          to: "par_rating_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      process_personal_session_par: {
        Args: { p_session_id: string }
        Returns: {
          algorithm_version: string | null
          created_at: string
          eligibility_reason: string | null
          error_message: string | null
          game_id: string
          last_evaluated_at: string
          processed_at: string | null
          session_id: string
          status: string
          updated_at: string
          verification_level: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "par_game_processing"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      recalculate_personal_session_par: {
        Args: { p_session_id: string }
        Returns: {
          algorithm_version: string | null
          created_at: string
          eligibility_reason: string | null
          error_message: string | null
          game_id: string
          last_evaluated_at: string
          processed_at: string | null
          session_id: string
          status: string
          updated_at: string
          verification_level: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "par_game_processing"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reject_deleted_users: { Args: never; Returns: undefined }
      reservation_asset_hourly_rate_cents: {
        Args: {
          p_asset_id: string
          p_asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
        }
        Returns: number
      }
      reservation_best_flash_deal: {
        Args: {
          p_asset_id: string
          p_asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          p_at: string
        }
        Returns: {
          discount_percent: number
          id: string
        }[]
      }
      reservation_facility_id: {
        Args: { p_reservation_id: string }
        Returns: string
      }
      reservation_has_capacity: {
        Args: { p_reservation_id: string }
        Returns: boolean
      }
      reservation_occupancy: {
        Args: { p_reservation_id: string }
        Returns: {
          current_players: number
          max_players: number
          pending_invites: number
          status: Database["public"]["Enums"]["reservation_status"]
        }[]
      }
      reservation_occupancy_for_asset: {
        Args: {
          p_asset_id: string
          p_asset_type: Database["public"]["Enums"]["facility_asset_owner_type"]
          p_date: string
        }
        Returns: {
          current_players: number
          final_price_cents: number
          max_players: number
          reservation_id: string
          status: Database["public"]["Enums"]["reservation_status"]
          time_range: unknown
        }[]
      }
      retry_failed_personal_game_par: {
        Args: { p_game_id: string }
        Returns: {
          actual_result: number
          algorithm_version: string
          confidence_after: number
          confidence_before: number
          confidence_change: number
          created_at: string
          event_type: string
          expected_result: number
          explanation_code: string
          explanation_data: Json
          game_id: string
          id: string
          opponent_strength: number
          par_after: number
          par_before: number
          par_change: number
          partner_strength: number | null
          processed_at: string
          profile_id: string
          reversal_event_id: string | null
          reversed_at: string | null
          score_margin: number
          session_id: string
          updated_at: string
          verification_level: string
          weight: number
        }[]
        SetofOptions: {
          from: "*"
          to: "par_rating_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reverse_personal_game_par: {
        Args: { p_game_id: string; p_reason?: string }
        Returns: {
          actual_result: number
          algorithm_version: string
          confidence_after: number
          confidence_before: number
          confidence_change: number
          created_at: string
          event_type: string
          expected_result: number
          explanation_code: string
          explanation_data: Json
          game_id: string
          id: string
          opponent_strength: number
          par_after: number
          par_before: number
          par_change: number
          partner_strength: number | null
          processed_at: string
          profile_id: string
          reversal_event_id: string | null
          reversed_at: string | null
          score_margin: number
          session_id: string
          updated_at: string
          verification_level: string
          weight: number
        }[]
        SetofOptions: {
          from: "*"
          to: "par_rating_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      save_personal_game_score: {
        Args: {
          p_game_id: string
          p_team_one_score: number
          p_team_two_score: number
        }
        Returns: {
          completed_at: string | null
          created_at: string
          game_number: number
          id: string
          session_id: string
          status: string
          team_one_score: number | null
          team_two_score: number | null
          updated_at: string
          winning_team: number | null
        }
        SetofOptions: {
          from: "*"
          to: "personal_games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_facilities_nearby:
        | {
            Args: {
              lat: number
              lng: number
              public_only?: boolean
              radius_meters?: number
              result_limit?: number
              search_query?: string
              verified_only?: boolean
            }
            Returns: {
              address: string
              bookable_by_public: boolean
              city: string
              claim_status: string
              court_count: number
              created_at: string
              description: string
              distance_meters: number
              id: string
              indoor_courts: number
              latitude: number
              lighting: boolean
              longitude: number
              membership_required: boolean
              name: string
              outdoor_courts: number
              owner_user_id: string
              parking: boolean
              phone: string
              postal_code: string
              public_access: boolean
              restrooms: boolean
              slug: string
              state: string
              surface_type: string
              updated_at: string
              verified: boolean
              water: boolean
              website: string
            }[]
          }
        | {
            Args: {
              bookable_only?: boolean
              lat: number
              lng: number
              public_only?: boolean
              radius_meters?: number
              result_limit?: number
              search_query?: string
              verified_only?: boolean
            }
            Returns: {
              address: string
              bookable_by_public: boolean
              city: string
              claim_status: string
              court_count: number
              created_at: string
              description: string
              distance_meters: number
              id: string
              indoor_courts: number
              latitude: number
              lighting: boolean
              longitude: number
              membership_required: boolean
              name: string
              outdoor_courts: number
              owner_user_id: string
              parking: boolean
              phone: string
              postal_code: string
              public_access: boolean
              restrooms: boolean
              slug: string
              state: string
              surface_type: string
              updated_at: string
              verified: boolean
              water: boolean
              website: string
            }[]
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unaccent: { Args: { "": string }; Returns: string }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      validate_personal_game_ready: {
        Args: { p_game_id: string }
        Returns: undefined
      }
      validate_personal_match_claim: {
        Args: { p_token: string }
        Returns: {
          facility_name: string
          games: Json
          guest_name: string
          played_at: string
          reason: string
          recorder_name: string
          session_format: string
          status: string
          teams: Json
        }[]
      }
    }
    Enums: {
      bracket_type:
        | "single_elim"
        | "double_elim"
        | "round_robin"
        | "round_robin_to_single_elim"
        | "round_robin_to_double_elim"
      coach_offer_purchase_processing_fee_status:
        | "pending_reconciliation"
        | "reconciled"
        | "not_applicable_dev_test"
      coach_offer_purchase_status:
        | "payment_pending"
        | "finalized"
        | "failed"
        | "cancelled"
        | "refunded"
      coach_offer_status: "draft" | "active" | "paused" | "archived"
      coach_offer_type:
        | "private"
        | "semi_private"
        | "group_clinic"
        | "camp"
        | "package"
      coach_status:
        | "inactive"
        | "onboarding"
        | "active"
        | "restricted"
        | "test_ready"
      director_status: "pending" | "approved" | "suspended"
      facility_asset_owner_type: "facility" | "court" | "ball_machine"
      facility_member_role: "owner" | "manager" | "staff"
      marketplace_condition: "new" | "like_new" | "excellent" | "good" | "fair"
      marketplace_listing_status: "active" | "pending" | "sold" | "deleted"
      match_direction: "like" | "pass" | "super"
      payment_status:
        | "requires_confirmation"
        | "processing"
        | "succeeded"
        | "failed"
        | "canceled"
        | "refunded"
        | "partially_refunded"
      play_event_status:
        | "open"
        | "full"
        | "in_progress"
        | "completed"
        | "cancelled"
      play_event_type:
        | "round_robin"
        | "mixer"
        | "ladder"
        | "open_play"
        | "kings_court"
        | "mini_tournament"
        | "clinic"
      registration_group_member_role: "initiator" | "partner"
      registration_group_member_state:
        | "invited"
        | "pending_payment"
        | "paid"
        | "declined"
        | "expired"
      registration_group_status:
        | "forming"
        | "pending_payment"
        | "confirmed"
        | "cancelled"
        | "expired"
      registration_status:
        | "held"
        | "registered"
        | "checked_in"
        | "withdrawn"
        | "disqualified"
        | "no_show"
        | "substitute"
        | "waitlisted"
        | "waitlist_offered"
        | "expired_hold"
      report_reason:
        | "spam_or_inappropriate"
        | "harassment"
        | "hate_speech"
        | "impersonation"
        | "other"
        | "counterfeit"
        | "mislabeled"
        | "price_gouging"
      report_status: "pending" | "reviewed" | "actioned" | "dismissed"
      reservation_game_format: "singles" | "doubles"
      reservation_status: "held" | "confirmed" | "cancelled" | "expired"
      round_label:
        | "pool"
        | "r64"
        | "r32"
        | "r16"
        | "qf"
        | "sf"
        | "bronze"
        | "final"
      support_ticket_category:
        | "account"
        | "tournaments"
        | "partners_matches"
        | "payments"
        | "bug"
        | "feedback"
        | "other"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
      tournament_format: "singles" | "doubles" | "mixed_doubles" | "juniors"
      tournament_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "published"
        | "open"
        | "filling_fast"
        | "registration_closed"
        | "in_progress"
        | "completed"
        | "cancelled"
      transaction_status: "pending" | "completed" | "failed" | "refunded"
      transaction_type:
        | "hold"
        | "entry_balance"
        | "full_entry"
        | "refund"
        | "director_payout"
        | "platform_fee"
      user_role: "player" | "director" | "player_director" | "admin"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      bracket_type: [
        "single_elim",
        "double_elim",
        "round_robin",
        "round_robin_to_single_elim",
        "round_robin_to_double_elim",
      ],
      coach_offer_purchase_processing_fee_status: [
        "pending_reconciliation",
        "reconciled",
        "not_applicable_dev_test",
      ],
      coach_offer_purchase_status: [
        "payment_pending",
        "finalized",
        "failed",
        "cancelled",
        "refunded",
      ],
      coach_offer_status: ["draft", "active", "paused", "archived"],
      coach_offer_type: [
        "private",
        "semi_private",
        "group_clinic",
        "camp",
        "package",
      ],
      coach_status: [
        "inactive",
        "onboarding",
        "active",
        "restricted",
        "test_ready",
      ],
      director_status: ["pending", "approved", "suspended"],
      facility_asset_owner_type: ["facility", "court", "ball_machine"],
      facility_member_role: ["owner", "manager", "staff"],
      marketplace_condition: ["new", "like_new", "excellent", "good", "fair"],
      marketplace_listing_status: ["active", "pending", "sold", "deleted"],
      match_direction: ["like", "pass", "super"],
      payment_status: [
        "requires_confirmation",
        "processing",
        "succeeded",
        "failed",
        "canceled",
        "refunded",
        "partially_refunded",
      ],
      play_event_status: [
        "open",
        "full",
        "in_progress",
        "completed",
        "cancelled",
      ],
      play_event_type: [
        "round_robin",
        "mixer",
        "ladder",
        "open_play",
        "kings_court",
        "mini_tournament",
        "clinic",
      ],
      registration_group_member_role: ["initiator", "partner"],
      registration_group_member_state: [
        "invited",
        "pending_payment",
        "paid",
        "declined",
        "expired",
      ],
      registration_group_status: [
        "forming",
        "pending_payment",
        "confirmed",
        "cancelled",
        "expired",
      ],
      registration_status: [
        "held",
        "registered",
        "checked_in",
        "withdrawn",
        "disqualified",
        "no_show",
        "substitute",
        "waitlisted",
        "waitlist_offered",
        "expired_hold",
      ],
      report_reason: [
        "spam_or_inappropriate",
        "harassment",
        "hate_speech",
        "impersonation",
        "other",
        "counterfeit",
        "mislabeled",
        "price_gouging",
      ],
      report_status: ["pending", "reviewed", "actioned", "dismissed"],
      reservation_game_format: ["singles", "doubles"],
      reservation_status: ["held", "confirmed", "cancelled", "expired"],
      round_label: ["pool", "r64", "r32", "r16", "qf", "sf", "bronze", "final"],
      support_ticket_category: [
        "account",
        "tournaments",
        "partners_matches",
        "payments",
        "bug",
        "feedback",
        "other",
      ],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
      tournament_format: ["singles", "doubles", "mixed_doubles", "juniors"],
      tournament_status: [
        "draft",
        "pending_approval",
        "approved",
        "published",
        "open",
        "filling_fast",
        "registration_closed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      transaction_status: ["pending", "completed", "failed", "refunded"],
      transaction_type: [
        "hold",
        "entry_balance",
        "full_entry",
        "refund",
        "director_payout",
        "platform_fee",
      ],
      user_role: ["player", "director", "player_director", "admin"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
