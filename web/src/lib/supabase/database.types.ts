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
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          participant_a: string
          participant_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_a: string
          participant_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_a?: string
          participant_b?: string
        }
        Relationships: [
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
        ]
      }
      divisions: {
        Row: {
          created_at: string
          draw_size: number
          entry_fee_cents: number | null
          format: Database["public"]["Enums"]["tournament_format"]
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
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
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
      profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          is_discoverable: boolean | null
          looking_status: string | null
          notif_new_match: boolean | null
          notif_liked_you: boolean | null
          notif_hold_expiry: boolean | null
          notif_tournaments: boolean | null
          created_at: string
          director_approved_at: string | null
          director_approved_by: string | null
          director_events_hosted: number
          director_rating: number | null
          director_status: Database["public"]["Enums"]["director_status"] | null
          dupr: number | null
          dupr_verified: boolean
          email: string
          full_name: string
          hand: string | null
          handle: string | null
          id: string
          location_city: string | null
          location_coords: unknown
          location_state: string | null
          paddle: string | null
          play_style: string | null
          role: Database["public"]["Enums"]["user_role"]
          skill_level: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          is_discoverable?: boolean | null
          looking_status?: string | null
          notif_new_match?: boolean | null
          notif_liked_you?: boolean | null
          notif_hold_expiry?: boolean | null
          notif_tournaments?: boolean | null
          created_at?: string
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
          hand?: string | null
          handle?: string | null
          id: string
          location_city?: string | null
          location_coords?: unknown
          location_state?: string | null
          paddle?: string | null
          play_style?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          skill_level?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          is_discoverable?: boolean | null
          looking_status?: string | null
          notif_new_match?: boolean | null
          notif_liked_you?: boolean | null
          notif_hold_expiry?: boolean | null
          notif_tournaments?: boolean | null
          created_at?: string
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
          hand?: string | null
          handle?: string | null
          id?: string
          location_city?: string | null
          location_coords?: unknown
          location_state?: string | null
          paddle?: string | null
          play_style?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          skill_level?: string | null
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
        ]
      }
      registrations: {
        Row: {
          added_by_director_id: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          director_added: boolean
          division_id: string | null
          entry_fee_paid_cents: number
          hold_expires_at: string | null
          hold_fee_paid_cents: number
          id: string
          partner_id: string | null
          player_id: string
          replaces_registration_id: string | null
          status: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id: string | null
          stripe_hold_intent_id: string | null
          tournament_id: string
          updated_at: string
          waiver_accepted_at: string | null
        }
        Insert: {
          added_by_director_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          director_added?: boolean
          division_id?: string | null
          entry_fee_paid_cents?: number
          hold_expires_at?: string | null
          hold_fee_paid_cents?: number
          id?: string
          partner_id?: string | null
          player_id: string
          replaces_registration_id?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id?: string | null
          stripe_hold_intent_id?: string | null
          tournament_id: string
          updated_at?: string
          waiver_accepted_at?: string | null
        }
        Update: {
          added_by_director_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          director_added?: boolean
          division_id?: string | null
          entry_fee_paid_cents?: number
          hold_expires_at?: string | null
          hold_fee_paid_cents?: number
          id?: string
          partner_id?: string | null
          player_id?: string
          replaces_registration_id?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          stripe_entry_intent_id?: string | null
          stripe_hold_intent_id?: string | null
          tournament_id?: string
          updated_at?: string
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
      tournaments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bracket_type: Database["public"]["Enums"]["bracket_type"]
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
          format: Database["public"]["Enums"]["tournament_format"]
          hold_duration_hours: number
          hold_fee_cents: number
          id: string
          name: string
          prize_pool_cents: number | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          rejection_reason: string | null
          rules: string | null
          skill_max: number | null
          skill_min: number | null
          slug: string | null
          spots_filled: number
          state: string
          status: Database["public"]["Enums"]["tournament_status"]
          submitted_for_approval_at: string | null
          updated_at: string
          venue_address: string | null
          venue_name: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bracket_type?: Database["public"]["Enums"]["bracket_type"]
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
          format: Database["public"]["Enums"]["tournament_format"]
          hold_duration_hours?: number
          hold_fee_cents: number
          id?: string
          name: string
          prize_pool_cents?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejection_reason?: string | null
          rules?: string | null
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          spots_filled?: number
          state: string
          status?: Database["public"]["Enums"]["tournament_status"]
          submitted_for_approval_at?: string | null
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bracket_type?: Database["public"]["Enums"]["bracket_type"]
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
          format?: Database["public"]["Enums"]["tournament_format"]
          hold_duration_hours?: number
          hold_fee_cents?: number
          id?: string
          name?: string
          prize_pool_cents?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejection_reason?: string | null
          rules?: string | null
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          spots_filled?: number
          state?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          submitted_for_approval_at?: string | null
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
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
      profile_hidden_matches: {
        Row: {
          id: string
          player_id: string
          match_id: string
          created_at: string
        }
        Insert: {
          id?: string
          player_id: string
          match_id: string
          created_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          match_id?: string
          created_at?: string
        }
        Relationships: []
      }
      tournament_bookmarks: {
        Row: {
          id: string
          player_id: string
          tournament_id: string
          created_at: string
        }
        Insert: {
          id?: string
          player_id: string
          tournament_id: string
          created_at?: string
        }
        Update: {
          id?: string
          player_id?: string
          tournament_id?: string
          created_at?: string
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
          player_a: string | null
          player_b: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_swipes_requester_id_fkey"
            columns: ["player_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaking_swipes_target_id_fkey"
            columns: ["player_b"]
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
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_approved_director: { Args: never; Returns: boolean }
    }
    Enums: {
      bracket_type:
        | "single_elim"
        | "double_elim"
        | "round_robin"
        | "round_robin_to_single_elim"
        | "round_robin_to_double_elim"
      director_status: "pending" | "approved" | "suspended"
      match_direction: "like" | "pass"
      registration_status:
        | "held"
        | "registered"
        | "checked_in"
        | "withdrawn"
        | "disqualified"
        | "no_show"
        | "substitute"
      round_label:
        | "pool"
        | "r64"
        | "r32"
        | "r16"
        | "qf"
        | "sf"
        | "bronze"
        | "final"
      tournament_format: "singles" | "doubles" | "mixed_doubles" | "juniors"
      tournament_status:
        | "draft"
        | "pending_approval"
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
      user_role: "player" | "director" | "admin"
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
      director_status: ["pending", "approved", "suspended"],
      match_direction: ["like", "pass"],
      registration_status: [
        "held",
        "registered",
        "checked_in",
        "withdrawn",
        "disqualified",
        "no_show",
        "substitute",
      ],
      round_label: ["pool", "r64", "r32", "r16", "qf", "sf", "bronze", "final"],
      tournament_format: ["singles", "doubles", "mixed_doubles", "juniors"],
      tournament_status: [
        "draft",
        "pending_approval",
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
      user_role: ["player", "director", "admin"],
    },
  },
} as const
