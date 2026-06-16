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
      court_assignments: {
        Row: {
          court_number: number
          created_at: string | null
          id: string
          match_id: string | null
          status: string | null
          tournament_id: string
        }
        Insert: {
          court_number: number
          created_at?: string | null
          id?: string
          match_id?: string | null
          status?: string | null
          tournament_id: string
        }
        Update: {
          court_number?: number
          created_at?: string | null
          id?: string
          match_id?: string | null
          status?: string | null
          tournament_id?: string
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
          name: string
          subject: string
          updated_at: string
          updated_by: string | null
          variables: string[]
        }
        Insert: {
          enabled?: boolean
          html_body: string
          key: string
          name: string
          subject: string
          updated_at?: string
          updated_by?: string | null
          variables?: string[]
        }
        Update: {
          enabled?: boolean
          html_body?: string
          key?: string
          name?: string
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
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
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
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
          is_discoverable: boolean
          location_city: string | null
          location_coords: unknown
          location_state: string | null
          looking_status: string
          notif_hold_expiry: boolean
          notif_liked_you: boolean
          notif_new_match: boolean
          notif_tournaments: boolean
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
          is_discoverable?: boolean
          location_city?: string | null
          location_coords?: unknown
          location_state?: string | null
          looking_status?: string
          notif_hold_expiry?: boolean
          notif_liked_you?: boolean
          notif_new_match?: boolean
          notif_tournaments?: boolean
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
          is_discoverable?: boolean
          location_city?: string | null
          location_coords?: unknown
          location_state?: string | null
          looking_status?: string
          notif_hold_expiry?: boolean
          notif_liked_you?: boolean
          notif_new_match?: boolean
          notif_tournaments?: boolean
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
          featured: boolean
          format: Database["public"]["Enums"]["tournament_format"]
          formats: string[] | null
          hold_duration_hours: number
          hold_fee_cents: number
          id: string
          name: string
          pool_count: number | null
          prize_pool_cents: number | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          rejected_reason: string | null
          rejection_reason: string | null
          rules: string | null
          skill_max: number | null
          skill_min: number | null
          slug: string | null
          spots_filled: number
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
          featured?: boolean
          format: Database["public"]["Enums"]["tournament_format"]
          formats?: string[] | null
          hold_duration_hours?: number
          hold_fee_cents: number
          id?: string
          name: string
          pool_count?: number | null
          prize_pool_cents?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejected_reason?: string | null
          rejection_reason?: string | null
          rules?: string | null
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          spots_filled?: number
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
          featured?: boolean
          format?: Database["public"]["Enums"]["tournament_format"]
          formats?: string[] | null
          hold_duration_hours?: number
          hold_fee_cents?: number
          id?: string
          name?: string
          pool_count?: number | null
          prize_pool_cents?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rejected_reason?: string | null
          rejection_reason?: string | null
          rules?: string | null
          skill_max?: number | null
          skill_min?: number | null
          slug?: string | null
          spots_filled?: number
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
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
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
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      expire_stale_holds: { Args: never; Returns: number }
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
      gettransactionid: { Args: never; Returns: unknown }
      is_admin: { Args: never; Returns: boolean }
      is_approved_director: { Args: never; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
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
    }
    Enums: {
      bracket_type:
        | "single_elim"
        | "double_elim"
        | "round_robin"
        | "round_robin_to_single_elim"
        | "round_robin_to_double_elim"
      director_status: "pending" | "approved" | "suspended"
      match_direction: "like" | "pass" | "super"
      registration_status:
        | "held"
        | "registered"
        | "checked_in"
        | "withdrawn"
        | "disqualified"
        | "no_show"
        | "substitute"
      report_reason:
        | "spam_or_inappropriate"
        | "harassment"
        | "hate_speech"
        | "impersonation"
        | "other"
      report_status: "pending" | "reviewed" | "actioned" | "dismissed"
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
      match_direction: ["like", "pass", "super"],
      registration_status: [
        "held",
        "registered",
        "checked_in",
        "withdrawn",
        "disqualified",
        "no_show",
        "substitute",
      ],
      report_reason: [
        "spam_or_inappropriate",
        "harassment",
        "hate_speech",
        "impersonation",
        "other",
      ],
      report_status: ["pending", "reviewed", "actioned", "dismissed"],
      round_label: ["pool", "r64", "r32", "r16", "qf", "sf", "bronze", "final"],
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
} as const
