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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      beta_feedback: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          page: string
          user_email: string
          user_id: string
          workspace_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          message: string
          page?: string
          user_email?: string
          user_id?: string
          workspace_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          page?: string
          user_email?: string
          user_id?: string
          workspace_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "beta_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_enquiries: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string
        }
        Insert: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          message: string
          name: string
          phone?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string
        }
        Relationships: []
      }
      crew_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          crew_role: string
          email: string
          expires_at: string
          id: number
          token: string
          workspace_id: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          crew_role?: string
          email?: string
          expires_at?: string
          id?: never
          token?: string
          workspace_id: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          crew_role?: string
          email?: string
          expires_at?: string
          id?: never
          token?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      field_document_snapshots: {
        Row: {
          created_at: string
          created_by: string
          id: string
          job_id: number
          operation_id: string
          pdf_hash: string | null
          snapshot: Json
          storage_path: string | null
          workspace_id: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          job_id: number
          operation_id: string
          pdf_hash?: string | null
          snapshot: Json
          storage_path?: string | null
          workspace_id: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          job_id?: number
          operation_id?: string
          pdf_hash?: string | null
          snapshot?: Json
          storage_path?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "field_document_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "workspace_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_document_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      field_operation_receipts: {
        Row: {
          created_at: string
          job_id: number
          kind: string
          operation_id: string
          result: Json
          workspace_id: number
        }
        Insert: {
          created_at?: string
          job_id: number
          kind: string
          operation_id: string
          result?: Json
          workspace_id: number
        }
        Update: {
          created_at?: string
          job_id?: number
          kind?: string
          operation_id?: string
          result?: Json
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "field_operation_receipts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "workspace_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_operation_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_ip_limits: {
        Row: {
          ip_hash: string
          requests: string[]
          updated_at: string
        }
        Insert: {
          ip_hash: string
          requests?: string[]
          updated_at?: string
        }
        Update: {
          ip_hash?: string
          requests?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      integration_lead_receipts: {
        Row: {
          created_at: string
          customer_id: number
          id: string
          key_id: string
          request_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          customer_id: number
          id?: string
          key_id: string
          request_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          customer_id?: number
          id?: string
          key_id?: string
          request_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "integration_lead_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "workspace_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_lead_receipts_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "workspace_integration_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_lead_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      moving_proposals: {
        Row: {
          accepted_terms: boolean
          created_at: string
          deposit_cents: number
          id: string
          job_id: number
          revoked_at: string | null
          signature: string | null
          signed_at: string | null
          snapshot: Json
          test_approved_at: string | null
          test_approved_by: string | null
          token: string
          workspace_id: number
        }
        Insert: {
          accepted_terms?: boolean
          created_at?: string
          deposit_cents?: number
          id?: string
          job_id: number
          revoked_at?: string | null
          signature?: string | null
          signed_at?: string | null
          snapshot: Json
          test_approved_at?: string | null
          test_approved_by?: string | null
          token?: string
          workspace_id: number
        }
        Update: {
          accepted_terms?: boolean
          created_at?: string
          deposit_cents?: number
          id?: string
          job_id?: number
          revoked_at?: string | null
          signature?: string | null
          signed_at?: string | null
          snapshot?: Json
          test_approved_at?: string | null
          test_approved_by?: string | null
          token?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "moving_proposals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "workspace_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moving_proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_events: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          meta: Json
          source: string
          workspace_id: number | null
        }
        Insert: {
          created_at?: string
          id?: never
          level?: string
          message: string
          meta?: Json
          source: string
          workspace_id?: number | null
        }
        Update: {
          created_at?: string
          id?: never
          level?: string
          message?: string
          meta?: Json
          source?: string
          workspace_id?: number | null
        }
        Relationships: []
      }
      proposal_checkouts: {
        Row: {
          amount_cents: number
          created_at: string
          created_on_preview: boolean
          environment: string
          id: string
          proposal_id: string
          session_id: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_on_preview?: boolean
          environment: string
          id?: string
          proposal_id: string
          session_id?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_on_preview?: boolean
          environment?: string
          id?: string
          proposal_id?: string
          session_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_checkouts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "moving_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_intake_connections: {
        Row: {
          created_at: string
          token_hash: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          token_hash: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          token_hash?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_intake_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_intake_receipts: {
        Row: {
          created_at: string
          customer_id: number
          id: string
          request_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          customer_id: number
          id?: string
          request_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          customer_id?: number
          id?: string
          request_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_intake_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "workspace_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_intake_receipts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          available: boolean
          billing_interval: string
          created_at: string
          description: string
          features: Json
          id: string
          is_default: boolean
          limits: Json
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          trial_days: number
        }
        Insert: {
          available?: boolean
          billing_interval?: string
          created_at?: string
          description?: string
          features?: Json
          id: string
          is_default?: boolean
          limits?: Json
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          trial_days?: number
        }
        Update: {
          available?: boolean
          billing_interval?: string
          created_at?: string
          description?: string
          features?: Json
          id?: string
          is_default?: boolean
          limits?: Json
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          trial_days?: number
        }
        Relationships: []
      }
      workspace_admin_notes: {
        Row: {
          pricing_notes: string
          updated_at: string
          updated_by: string | null
          workspace_id: number
        }
        Insert: {
          pricing_notes?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: number
        }
        Update: {
          pricing_notes?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_admin_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integration_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          key_hash: string
          key_prefix: string
          kind: string
          label: string
          last_used_at: string | null
          public_key: string | null
          revoked_at: string | null
          workspace_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash: string
          key_prefix: string
          kind: string
          label?: string
          last_used_at?: string | null
          public_key?: string | null
          revoked_at?: string | null
          workspace_id: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          kind?: string
          label?: string
          last_used_at?: string | null
          public_key?: string | null
          revoked_at?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integration_keys_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          candidate_id: number | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string
          hourly_rate: number
          id: number
          kind: string
          last_sent_at: string | null
          role: string
          send_count: number
          status: string
          token: string
          workspace_id: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          candidate_id?: number | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          hourly_rate?: number
          id?: never
          kind?: string
          last_sent_at?: string | null
          role?: string
          send_count?: number
          status?: string
          token?: string
          workspace_id: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          candidate_id?: number | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string
          hourly_rate?: number
          id?: never
          kind?: string
          last_sent_at?: string | null
          role?: string
          send_count?: number
          status?: string
          token?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          email: string
          id: number
          name: string
          role: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          email?: string
          id?: never
          name?: string
          role?: string
          user_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          name?: string
          role?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_records: {
        Row: {
          created_at: string
          data: Json
          id: number
          kind: string
          updated_at: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: never
          kind: string
          updated_at?: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          data?: Json
          id?: never
          kind?: string
          updated_at?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          appearance: Json
          beta_ends_at: string | null
          company_phone: string
          created_at: string
          created_by: string
          custom_annual_price: number | null
          custom_monthly_price: number | null
          deposit_rule: Json | null
          discount_percent: number | null
          dispatch_address: string | null
          feature_flags: Json
          fuel_flat_rate: number
          fuel_per_mile_rate: number
          fuel_percentage_rate: number
          fuel_surcharge_type: string
          id: number
          is_custom_pricing: boolean
          limit_overrides: Json
          name: string
          office_email: string
          onboarding_completed_at: string | null
          plan_id: string
          pricing: Json | null
          pricing_mode: string
          stripe_customer_id: string | null
          subscription_status: string
          travel_flat_rate: number
          travel_mileage_rate: number
          travel_pricing_type: string
          trial_ends_at: string | null
        }
        Insert: {
          appearance?: Json
          beta_ends_at?: string | null
          company_phone?: string
          created_at?: string
          created_by: string
          custom_annual_price?: number | null
          custom_monthly_price?: number | null
          deposit_rule?: Json | null
          discount_percent?: number | null
          dispatch_address?: string | null
          feature_flags?: Json
          fuel_flat_rate?: number
          fuel_per_mile_rate?: number
          fuel_percentage_rate?: number
          fuel_surcharge_type?: string
          id?: never
          is_custom_pricing?: boolean
          limit_overrides?: Json
          name: string
          office_email?: string
          onboarding_completed_at?: string | null
          plan_id?: string
          pricing?: Json | null
          pricing_mode?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          travel_flat_rate?: number
          travel_mileage_rate?: number
          travel_pricing_type?: string
          trial_ends_at?: string | null
        }
        Update: {
          appearance?: Json
          beta_ends_at?: string | null
          company_phone?: string
          created_at?: string
          created_by?: string
          custom_annual_price?: number | null
          custom_monthly_price?: number | null
          deposit_rule?: Json | null
          discount_percent?: number | null
          dispatch_address?: string | null
          feature_flags?: Json
          fuel_flat_rate?: number
          fuel_per_mile_rate?: number
          fuel_percentage_rate?: number
          fuel_surcharge_type?: string
          id?: never
          is_custom_pricing?: boolean
          limit_overrides?: Json
          name?: string
          office_email?: string
          onboarding_completed_at?: string | null
          plan_id?: string
          pricing?: Json | null
          pricing_mode?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          travel_flat_rate?: number
          travel_mileage_rate?: number
          travel_pricing_type?: string
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_crew_invite: {
        Args: {
          _crew_role: string
          _name: string
          _phone: string
          _token: string
        }
        Returns: number
      }
      book_job_for_preview: {
        Args: { _actor: string; _job: number; _ws: number }
        Returns: Json
      }
      can_access_record: {
        Args: { _data: Json; _kind: string; _ws: number }
        Returns: boolean
      }
      commit_field_signoff: {
        Args: {
          _actor: string
          _job: number
          _operation: string
          _signature: string
          _snapshot: Json
          _ws: number
        }
        Returns: string
      }
      complete_workspace_onboarding: {
        Args: { _ws: number }
        Returns: undefined
      }
      consume_intake_ip_limit: { Args: { _hash: string }; Returns: Json }
      create_workspace: { Args: { _name: string }; Returns: number }
      crew_invite_info: {
        Args: { _token: string }
        Returns: {
          crew_role: string
          valid: boolean
          workspace_name: string
        }[]
      }
      crew_onboarding_info: { Args: { _token: string }; Returns: Json }
      is_platform_admin: { Args: never; Returns: boolean }
      receive_integration_lead: {
        Args: { _data: Json; _hash: string; _request_id: string }
        Returns: Json
      }
      receive_website_quote: {
        Args: { _data: Json; _hash: string; _request_id: string }
        Returns: Json
      }
      register_company: {
        Args: { _company: string; _owner: string; _phone: string }
        Returns: number
      }
      register_crew_invite: {
        Args: {
          _crew_role: string
          _email: string
          _name: string
          _phone: string
          _token: string
        }
        Returns: number
      }
      settle_proposal_checkout:
        | {
            Args: {
              _currency: string
              _environment: string
              _paid: number
              _session: string
              _subtotal: number
            }
            Returns: boolean
          }
        | {
            Args: {
              _currency: string
              _environment: string
              _livemode: boolean
              _paid: number
              _session: string
              _subtotal: number
            }
            Returns: boolean
          }
      sign_moving_proposal: {
        Args: { _signature: string; _token: string }
        Returns: Json
      }
      view_moving_proposal: { Args: { _token: string }; Returns: Json }
      wallpaper_workspace_id: { Args: { _path: string }; Returns: number }
      workspace_role: { Args: { _ws: number }; Returns: string }
      workspace_writable: { Args: { _ws: number }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
