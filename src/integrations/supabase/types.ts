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
      abandoned_cart_dispatch_logs: {
        Row: {
          brand_id: string
          cart_id: string
          channel: string
          created_at: string
          discount_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          recipient: string
          sent_at: string
          status: string
          step_number: number
        }
        Insert: {
          brand_id: string
          cart_id: string
          channel: string
          created_at?: string
          discount_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          recipient: string
          sent_at?: string
          status?: string
          step_number: number
        }
        Update: {
          brand_id?: string
          cart_id?: string
          channel?: string
          created_at?: string
          discount_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          recipient?: string
          sent_at?: string
          status?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_dispatch_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_dispatch_logs_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "abandoned_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_cart_sequences: {
        Row: {
          brand_id: string
          channel: string
          created_at: string
          delay_hours: number
          discount_percent: number
          id: string
          include_discount: boolean
          is_active: boolean
          message_template_ar: string
          message_template_en: string
          step_number: number
          subject_ar: string
          subject_en: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          channel?: string
          created_at?: string
          delay_hours?: number
          discount_percent?: number
          id?: string
          include_discount?: boolean
          is_active?: boolean
          message_template_ar: string
          message_template_en: string
          step_number: number
          subject_ar: string
          subject_en: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          channel?: string
          created_at?: string
          delay_hours?: number
          discount_percent?: number
          id?: string
          include_discount?: boolean
          is_active?: boolean
          message_template_ar?: string
          message_template_en?: string
          step_number?: number
          subject_ar?: string
          subject_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_sequences_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      abandoned_carts: {
        Row: {
          abandoned_at: string | null
          brand_id: string
          cart_items: Json
          created_at: string
          currency: string
          customer_id: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          last_activity_at: string
          last_recovery_sent_at: string | null
          marketing_consent: boolean
          recovered_at: string | null
          recovered_order_id: string | null
          recovery_attempts_count: number
          recovery_discount_code: string | null
          recovery_token: string
          session_id: string
          status: string
          subtotal: number
          updated_at: string
        }
        Insert: {
          abandoned_at?: string | null
          brand_id: string
          cart_items?: Json
          created_at?: string
          currency?: string
          customer_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          last_activity_at?: string
          last_recovery_sent_at?: string | null
          marketing_consent?: boolean
          recovered_at?: string | null
          recovered_order_id?: string | null
          recovery_attempts_count?: number
          recovery_discount_code?: string | null
          recovery_token?: string
          session_id: string
          status?: string
          subtotal?: number
          updated_at?: string
        }
        Update: {
          abandoned_at?: string | null
          brand_id?: string
          cart_items?: Json
          created_at?: string
          currency?: string
          customer_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          last_activity_at?: string
          last_recovery_sent_at?: string | null
          marketing_consent?: boolean
          recovered_at?: string | null
          recovered_order_id?: string | null
          recovery_attempts_count?: number
          recovery_discount_code?: string | null
          recovery_token?: string
          session_id?: string
          status?: string
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_recovered_order_id_fkey"
            columns: ["recovered_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      account_transactions: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          id: string
          notes: string | null
          reference_id: string | null
          source_account_id: string | null
          target_account_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          id?: string
          notes?: string | null
          reference_id?: string | null
          source_account_id?: string | null
          target_account_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          reference_id?: string | null
          source_account_id?: string | null
          target_account_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_transactions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "cash_flow_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_transactions_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "cash_flow_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          brand_id: string
          created_at: string
          id: string
          message_ar: string
          message_en: string
          metadata: Json
          order_id: string | null
          product_id: string | null
          user_id: string | null
          variant_id: string | null
        }
        Insert: {
          action: string
          brand_id: string
          created_at?: string
          id?: string
          message_ar: string
          message_en: string
          metadata?: Json
          order_id?: string | null
          product_id?: string | null
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          action?: string
          brand_id?: string
          created_at?: string
          id?: string
          message_ar?: string
          message_en?: string
          metadata?: Json
          order_id?: string | null
          product_id?: string | null
          user_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answered_at: string
          choice_index: number
          id: string
          is_correct: boolean
          player_id: string
          points_awarded: number
          powerup: string | null
          question_id: string
          room_id: string
          streak_bonus: number
        }
        Insert: {
          answered_at?: string
          choice_index: number
          id?: string
          is_correct?: boolean
          player_id: string
          points_awarded?: number
          powerup?: string | null
          question_id: string
          room_id: string
          streak_bonus?: number
        }
        Update: {
          answered_at?: string
          choice_index?: number
          id?: string
          is_correct?: boolean
          player_id?: string
          points_awarded?: number
          powerup?: string | null
          question_id?: string
          room_id?: string
          streak_bonus?: number
        }
        Relationships: [
          {
            foreignKeyName: "answers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      api_quota_usage: {
        Row: {
          action: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          request_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          action?: string
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address_ar: string | null
          address_en: string | null
          brand_id: string
          created_at: string
          id: string
          is_active: boolean
          location_ar: string | null
          location_en: string | null
          name_ar: string | null
          name_en: string | null
          notes_ar: string | null
          notes_en: string | null
          phone: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          brand_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_ar?: string | null
          location_en?: string | null
          name_ar?: string | null
          name_en?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          phone?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          brand_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_ar?: string | null
          location_en?: string | null
          name_ar?: string | null
          name_en?: string | null
          notes_ar?: string | null
          notes_en?: string | null
          phone?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_abandoned_cart_settings: {
        Row: {
          abandonment_threshold_minutes: number
          brand_id: string
          cooldown_hours_between_messages: number
          created_at: string
          default_discount_type: string
          default_discount_value: number
          discount_expiry_hours: number
          enable_email: boolean
          enable_push: boolean
          enable_whatsapp: boolean
          is_enabled: boolean
          max_recovery_messages: number
          updated_at: string
        }
        Insert: {
          abandonment_threshold_minutes?: number
          brand_id: string
          cooldown_hours_between_messages?: number
          created_at?: string
          default_discount_type?: string
          default_discount_value?: number
          discount_expiry_hours?: number
          enable_email?: boolean
          enable_push?: boolean
          enable_whatsapp?: boolean
          is_enabled?: boolean
          max_recovery_messages?: number
          updated_at?: string
        }
        Update: {
          abandonment_threshold_minutes?: number
          brand_id?: string
          cooldown_hours_between_messages?: number
          created_at?: string
          default_discount_type?: string
          default_discount_value?: number
          discount_expiry_hours?: number
          enable_email?: boolean
          enable_push?: boolean
          enable_whatsapp?: boolean
          is_enabled?: boolean
          max_recovery_messages?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_abandoned_cart_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_email_notifications: {
        Row: {
          brand_id: string
          channel: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          order_id: string | null
          provider: string | null
          recipient: string | null
          status: string
        }
        Insert: {
          brand_id: string
          channel: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          order_id?: string | null
          provider?: string | null
          recipient?: string | null
          status: string
        }
        Update: {
          brand_id?: string
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          order_id?: string | null
          provider?: string | null
          recipient?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_email_notifications_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_email_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_entitlement_overrides: {
        Row: {
          boolean_value: boolean | null
          brand_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          feature_key: string
          id: string
          numeric_value: number | null
          override_type: string
          reason: string
          updated_at: string
        }
        Insert: {
          boolean_value?: boolean | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          feature_key: string
          id?: string
          numeric_value?: number | null
          override_type: string
          reason: string
          updated_at?: string
        }
        Update: {
          boolean_value?: boolean | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          feature_key?: string
          id?: string
          numeric_value?: number | null
          override_type?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_entitlement_overrides_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_entitlement_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "saas_features"
            referencedColumns: ["key"]
          },
        ]
      }
      brand_loyalty_programs: {
        Row: {
          brand_id: string
          created_at: string
          first_order_bonus_points: number
          holding_period_days: number
          include_discounted_items: boolean
          include_shipping: boolean
          include_tax: boolean
          is_enabled: boolean
          max_redemption_percentage: number
          min_points_to_redeem: number
          points_expiry_days: number
          points_per_currency_unit: number
          redemption_rate: number
          referral_bonus_points: number
          review_bonus_points: number
          tier_multipliers_enabled: boolean
          updated_at: string
          welcome_bonus_points: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          first_order_bonus_points?: number
          holding_period_days?: number
          include_discounted_items?: boolean
          include_shipping?: boolean
          include_tax?: boolean
          is_enabled?: boolean
          max_redemption_percentage?: number
          min_points_to_redeem?: number
          points_expiry_days?: number
          points_per_currency_unit?: number
          redemption_rate?: number
          referral_bonus_points?: number
          review_bonus_points?: number
          tier_multipliers_enabled?: boolean
          updated_at?: string
          welcome_bonus_points?: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          first_order_bonus_points?: number
          holding_period_days?: number
          include_discounted_items?: boolean
          include_shipping?: boolean
          include_tax?: boolean
          is_enabled?: boolean
          max_redemption_percentage?: number
          min_points_to_redeem?: number
          points_expiry_days?: number
          points_per_currency_unit?: number
          redemption_rate?: number
          referral_bonus_points?: number
          review_bonus_points?: number
          tier_multipliers_enabled?: boolean
          updated_at?: string
          welcome_bonus_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_loyalty_programs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_loyalty_tiers: {
        Row: {
          badge_color: string
          brand_id: string
          created_at: string
          discount_percent: number
          free_shipping: boolean
          id: string
          min_points: number
          min_spend: number
          name_ar: string
          name_en: string
          perks_ar: string[]
          perks_en: string[]
          points_multiplier: number
          tier_key: string
          updated_at: string
        }
        Insert: {
          badge_color?: string
          brand_id: string
          created_at?: string
          discount_percent?: number
          free_shipping?: boolean
          id?: string
          min_points?: number
          min_spend?: number
          name_ar: string
          name_en: string
          perks_ar?: string[]
          perks_en?: string[]
          points_multiplier?: number
          tier_key: string
          updated_at?: string
        }
        Update: {
          badge_color?: string
          brand_id?: string
          created_at?: string
          discount_percent?: number
          free_shipping?: boolean
          id?: string
          min_points?: number
          min_spend?: number
          name_ar?: string
          name_en?: string
          perks_ar?: string[]
          perks_en?: string[]
          points_multiplier?: number
          tier_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_loyalty_tiers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_notification_recipients: {
        Row: {
          active: boolean
          brand_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          receive_benefit_payment_approved: boolean
          receive_benefit_payment_rejected: boolean
          receive_order_cancelled: boolean
          receive_order_delivered: boolean
          receive_order_placed: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          receive_benefit_payment_approved?: boolean
          receive_benefit_payment_rejected?: boolean
          receive_order_cancelled?: boolean
          receive_order_delivered?: boolean
          receive_order_placed?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          receive_benefit_payment_approved?: boolean
          receive_benefit_payment_rejected?: boolean
          receive_order_cancelled?: boolean
          receive_order_delivered?: boolean
          receive_order_placed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_notification_recipients_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_return_policies: {
        Row: {
          allow_discounted_items: boolean
          allow_partial_returns: boolean
          allowed_compensation_methods: string[]
          auto_approve_policy: boolean
          brand_id: string
          created_at: string
          customer_shipping_fee_borne_by: string
          excluded_category_ids: string[] | null
          excluded_product_ids: string[] | null
          id: string
          notify_on_status_change: boolean
          policy_terms_ar: string | null
          policy_terms_en: string | null
          require_images: boolean
          return_shipping_fee: number
          return_window_days: number
          updated_at: string
        }
        Insert: {
          allow_discounted_items?: boolean
          allow_partial_returns?: boolean
          allowed_compensation_methods?: string[]
          auto_approve_policy?: boolean
          brand_id: string
          created_at?: string
          customer_shipping_fee_borne_by?: string
          excluded_category_ids?: string[] | null
          excluded_product_ids?: string[] | null
          id?: string
          notify_on_status_change?: boolean
          policy_terms_ar?: string | null
          policy_terms_en?: string | null
          require_images?: boolean
          return_shipping_fee?: number
          return_window_days?: number
          updated_at?: string
        }
        Update: {
          allow_discounted_items?: boolean
          allow_partial_returns?: boolean
          allowed_compensation_methods?: string[]
          auto_approve_policy?: boolean
          brand_id?: string
          created_at?: string
          customer_shipping_fee_borne_by?: string
          excluded_category_ids?: string[] | null
          excluded_product_ids?: string[] | null
          id?: string
          notify_on_status_change?: boolean
          policy_terms_ar?: string | null
          policy_terms_en?: string | null
          require_images?: boolean
          return_shipping_fee?: number
          return_window_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_return_policies_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_subscription_addons: {
        Row: {
          addon_id: string
          brand_id: string
          created_at: string
          id: string
          quantity: number
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          addon_id: string
          brand_id: string
          created_at?: string
          id?: string
          quantity?: number
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          addon_id?: string
          brand_id?: string
          created_at?: string
          id?: string
          quantity?: number
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_subscription_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "saas_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_subscription_addons_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_subscription_addons_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "brand_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_subscriptions: {
        Row: {
          billing_interval: string
          brand_id: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          grace_period_ends_at: string | null
          id: string
          paused_at: string | null
          plan_id: string
          plan_version_id: string
          renewal_intent: string | null
          renewal_target_plan_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_interval: string
          brand_id: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          grace_period_ends_at?: string | null
          id?: string
          paused_at?: string | null
          plan_id: string
          plan_version_id: string
          renewal_intent?: string | null
          renewal_target_plan_id?: string | null
          status: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          brand_id?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          grace_period_ends_at?: string | null
          id?: string
          paused_at?: string | null
          plan_id?: string
          plan_version_id?: string
          renewal_intent?: string | null
          renewal_target_plan_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_subscriptions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_subscriptions_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "saas_plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_subscriptions_renewal_target_plan_id_fkey"
            columns: ["renewal_target_plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_tracking_settings: {
        Row: {
          brand_id: string
          consent_required: boolean
          google_analytics_enabled: boolean
          google_analytics_id: string | null
          meta_pixel_enabled: boolean
          meta_pixel_id: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          consent_required?: boolean
          google_analytics_enabled?: boolean
          google_analytics_id?: string | null
          meta_pixel_enabled?: boolean
          meta_pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          consent_required?: boolean
          google_analytics_enabled?: boolean
          google_analytics_id?: string | null
          meta_pixel_enabled?: boolean
          meta_pixel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_tracking_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          about_ar: string | null
          about_en: string | null
          business_type: string | null
          created_at: string
          created_by: string | null
          custom_domain: string | null
          hero_media: Json
          id: string
          is_active: boolean
          logo_url: string | null
          meta_description: string | null
          meta_title: string | null
          name_ar: string | null
          name_en: string
          payment_receipt_uploaded_at: string | null
          payment_receipt_url: string | null
          plan_type: string
          primary_color: string | null
          renewal_intent: string | null
          renewal_intent_recorded_at: string | null
          slug: string
          subscription_expires_at: string | null
          subscription_status: string | null
          subscription_tier: string | null
          support_access_enabled: boolean
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          about_ar?: string | null
          about_en?: string | null
          business_type?: string | null
          created_at?: string
          created_by?: string | null
          custom_domain?: string | null
          hero_media?: Json
          id?: string
          is_active?: boolean
          logo_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name_ar?: string | null
          name_en: string
          payment_receipt_uploaded_at?: string | null
          payment_receipt_url?: string | null
          plan_type?: string
          primary_color?: string | null
          renewal_intent?: string | null
          renewal_intent_recorded_at?: string | null
          slug: string
          subscription_expires_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          support_access_enabled?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          about_ar?: string | null
          about_en?: string | null
          business_type?: string | null
          created_at?: string
          created_by?: string | null
          custom_domain?: string | null
          hero_media?: Json
          id?: string
          is_active?: boolean
          logo_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          name_ar?: string | null
          name_en?: string
          payment_receipt_uploaded_at?: string | null
          payment_receipt_url?: string | null
          plan_type?: string
          primary_color?: string | null
          renewal_intent?: string | null
          renewal_intent_recorded_at?: string | null
          slug?: string
          subscription_expires_at?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          support_access_enabled?: boolean
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          address: string | null
          admin_typography: Json
          announcement_audience: string
          announcement_bg: string
          announcement_bold: boolean
          announcement_dismissible: boolean
          announcement_enabled: boolean
          announcement_fg: string
          announcement_italic: boolean
          announcement_scope: string
          announcement_text_ar: string | null
          announcement_text_en: string | null
          background_color: string
          badge_accent: string | null
          benefit_account_number: string | null
          benefit_enabled: boolean
          benefit_processing_fee: number
          benefit_qr_url: string | null
          best_sellers_title_ar: string | null
          best_sellers_title_en: string | null
          bom_enabled: boolean | null
          brand_id: string
          btn_checkout_bg: string | null
          btn_checkout_fg: string | null
          btn_primary_bg: string | null
          btn_primary_fg: string | null
          btn_secondary_bg: string | null
          btn_secondary_fg: string | null
          business_name: string
          card_enabled: boolean
          card_processing_fee: number
          card_public_key: string | null
          card_secret_key: string | null
          cart_drawer_checkout_bg: string | null
          cart_drawer_checkout_fg: string | null
          category_banner_background_url: string | null
          cod_enabled: boolean
          courier_out_for_delivery_message_ar: string | null
          courier_out_for_delivery_message_en: string | null
          created_at: string
          currency: string
          default_tax_rate: number
          delivery_enabled: boolean
          delivery_estimate_ar: string | null
          delivery_estimate_en: string | null
          delivery_estimate_enabled: boolean | null
          delivery_fee: number
          digital_delivery_enabled: boolean
          email: string | null
          email_footer_ar: string | null
          email_footer_en: string | null
          email_intro_ar: string | null
          email_intro_en: string | null
          email_sender_name: string | null
          favicon_url: string | null
          font_family: string
          font_size: number
          font_url: string | null
          footer_bg: string | null
          footer_fg: string | null
          footer_note: string | null
          global_sale_badges_enabled: boolean
          header_bg: string | null
          header_fg: string | null
          header_glass: boolean | null
          heading_color: string | null
          hero_title_align: string
          hero_title_ar: string | null
          hero_title_color: string | null
          hero_title_en: string | null
          hero_title_size: number
          home_promo_cards: Json
          homepage_editorial_sections: Json
          invoice_arabic_font_family: string | null
          invoice_divider_color: string | null
          invoice_secondary_color: string | null
          invoice_show_business_details: boolean
          invoice_show_customer_contact: boolean
          invoice_show_fulfillment: boolean
          invoice_show_notes: boolean
          invoice_status_paid_color: string | null
          invoice_status_progress_color: string | null
          invoice_status_unpaid_color: string | null
          invoice_table_header_bg: string | null
          invoice_table_header_fg: string | null
          invoice_template: string
          invoice_title_ar: string | null
          invoice_title_en: string | null
          link_color: string | null
          logo_align: string
          logo_height: number
          logo_size: number
          logo_url: string | null
          logo_width: number
          logo_x: number
          logo_y: number
          menu_bg: string | null
          menu_fg: string | null
          menu_show_account: boolean
          menu_show_home: boolean
          menu_show_orders: boolean
          menu_show_pages: boolean
          menu_title_ar: string | null
          menu_title_en: string | null
          new_arrivals_title_ar: string | null
          new_arrivals_title_en: string | null
          next_invoice_number: number
          pages: Json
          phone: string | null
          pickup_enabled: boolean
          primary_color: string
          secondary_banner_parallax_breakpoint: number
          secondary_banner_parallax_enabled: boolean
          secondary_banner_parallax_mobile_enabled: boolean
          shipping_zones: Json
          show_best_sellers: boolean
          show_footer_name: boolean
          show_header_name: boolean
          show_hero_about: boolean
          show_hero_title: boolean
          show_new_arrivals: boolean
          socials: Json
          storefront_accent_color: string | null
          storefront_background_color: string | null
          storefront_font_ar: string
          storefront_font_ar_url: string | null
          storefront_font_en: string
          storefront_font_en_url: string | null
          storefront_loader_text_ar: string | null
          storefront_loader_text_en: string | null
          storefront_radius: string | null
          storefront_text_color: string | null
          storefront_typography: Json
          text_color: string
          trending_banner_background_url: string | null
          updated_at: string
          user_id: string
          vat_inclusive: boolean
          vat_number: string | null
          whatsapp_enabled: boolean
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          admin_typography?: Json
          announcement_audience?: string
          announcement_bg?: string
          announcement_bold?: boolean
          announcement_dismissible?: boolean
          announcement_enabled?: boolean
          announcement_fg?: string
          announcement_italic?: boolean
          announcement_scope?: string
          announcement_text_ar?: string | null
          announcement_text_en?: string | null
          background_color?: string
          badge_accent?: string | null
          benefit_account_number?: string | null
          benefit_enabled?: boolean
          benefit_processing_fee?: number
          benefit_qr_url?: string | null
          best_sellers_title_ar?: string | null
          best_sellers_title_en?: string | null
          bom_enabled?: boolean | null
          brand_id: string
          btn_checkout_bg?: string | null
          btn_checkout_fg?: string | null
          btn_primary_bg?: string | null
          btn_primary_fg?: string | null
          btn_secondary_bg?: string | null
          btn_secondary_fg?: string | null
          business_name?: string
          card_enabled?: boolean
          card_processing_fee?: number
          card_public_key?: string | null
          card_secret_key?: string | null
          cart_drawer_checkout_bg?: string | null
          cart_drawer_checkout_fg?: string | null
          category_banner_background_url?: string | null
          cod_enabled?: boolean
          courier_out_for_delivery_message_ar?: string | null
          courier_out_for_delivery_message_en?: string | null
          created_at?: string
          currency?: string
          default_tax_rate?: number
          delivery_enabled?: boolean
          delivery_estimate_ar?: string | null
          delivery_estimate_en?: string | null
          delivery_estimate_enabled?: boolean | null
          delivery_fee?: number
          digital_delivery_enabled?: boolean
          email?: string | null
          email_footer_ar?: string | null
          email_footer_en?: string | null
          email_intro_ar?: string | null
          email_intro_en?: string | null
          email_sender_name?: string | null
          favicon_url?: string | null
          font_family?: string
          font_size?: number
          font_url?: string | null
          footer_bg?: string | null
          footer_fg?: string | null
          footer_note?: string | null
          global_sale_badges_enabled?: boolean
          header_bg?: string | null
          header_fg?: string | null
          header_glass?: boolean | null
          heading_color?: string | null
          hero_title_align?: string
          hero_title_ar?: string | null
          hero_title_color?: string | null
          hero_title_en?: string | null
          hero_title_size?: number
          home_promo_cards?: Json
          homepage_editorial_sections?: Json
          invoice_arabic_font_family?: string | null
          invoice_divider_color?: string | null
          invoice_secondary_color?: string | null
          invoice_show_business_details?: boolean
          invoice_show_customer_contact?: boolean
          invoice_show_fulfillment?: boolean
          invoice_show_notes?: boolean
          invoice_status_paid_color?: string | null
          invoice_status_progress_color?: string | null
          invoice_status_unpaid_color?: string | null
          invoice_table_header_bg?: string | null
          invoice_table_header_fg?: string | null
          invoice_template?: string
          invoice_title_ar?: string | null
          invoice_title_en?: string | null
          link_color?: string | null
          logo_align?: string
          logo_height?: number
          logo_size?: number
          logo_url?: string | null
          logo_width?: number
          logo_x?: number
          logo_y?: number
          menu_bg?: string | null
          menu_fg?: string | null
          menu_show_account?: boolean
          menu_show_home?: boolean
          menu_show_orders?: boolean
          menu_show_pages?: boolean
          menu_title_ar?: string | null
          menu_title_en?: string | null
          new_arrivals_title_ar?: string | null
          new_arrivals_title_en?: string | null
          next_invoice_number?: number
          pages?: Json
          phone?: string | null
          pickup_enabled?: boolean
          primary_color?: string
          secondary_banner_parallax_breakpoint?: number
          secondary_banner_parallax_enabled?: boolean
          secondary_banner_parallax_mobile_enabled?: boolean
          shipping_zones?: Json
          show_best_sellers?: boolean
          show_footer_name?: boolean
          show_header_name?: boolean
          show_hero_about?: boolean
          show_hero_title?: boolean
          show_new_arrivals?: boolean
          socials?: Json
          storefront_accent_color?: string | null
          storefront_background_color?: string | null
          storefront_font_ar?: string
          storefront_font_ar_url?: string | null
          storefront_font_en?: string
          storefront_font_en_url?: string | null
          storefront_loader_text_ar?: string | null
          storefront_loader_text_en?: string | null
          storefront_radius?: string | null
          storefront_text_color?: string | null
          storefront_typography?: Json
          text_color?: string
          trending_banner_background_url?: string | null
          updated_at?: string
          user_id: string
          vat_inclusive?: boolean
          vat_number?: string | null
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          admin_typography?: Json
          announcement_audience?: string
          announcement_bg?: string
          announcement_bold?: boolean
          announcement_dismissible?: boolean
          announcement_enabled?: boolean
          announcement_fg?: string
          announcement_italic?: boolean
          announcement_scope?: string
          announcement_text_ar?: string | null
          announcement_text_en?: string | null
          background_color?: string
          badge_accent?: string | null
          benefit_account_number?: string | null
          benefit_enabled?: boolean
          benefit_processing_fee?: number
          benefit_qr_url?: string | null
          best_sellers_title_ar?: string | null
          best_sellers_title_en?: string | null
          bom_enabled?: boolean | null
          brand_id?: string
          btn_checkout_bg?: string | null
          btn_checkout_fg?: string | null
          btn_primary_bg?: string | null
          btn_primary_fg?: string | null
          btn_secondary_bg?: string | null
          btn_secondary_fg?: string | null
          business_name?: string
          card_enabled?: boolean
          card_processing_fee?: number
          card_public_key?: string | null
          card_secret_key?: string | null
          cart_drawer_checkout_bg?: string | null
          cart_drawer_checkout_fg?: string | null
          category_banner_background_url?: string | null
          cod_enabled?: boolean
          courier_out_for_delivery_message_ar?: string | null
          courier_out_for_delivery_message_en?: string | null
          created_at?: string
          currency?: string
          default_tax_rate?: number
          delivery_enabled?: boolean
          delivery_estimate_ar?: string | null
          delivery_estimate_en?: string | null
          delivery_estimate_enabled?: boolean | null
          delivery_fee?: number
          digital_delivery_enabled?: boolean
          email?: string | null
          email_footer_ar?: string | null
          email_footer_en?: string | null
          email_intro_ar?: string | null
          email_intro_en?: string | null
          email_sender_name?: string | null
          favicon_url?: string | null
          font_family?: string
          font_size?: number
          font_url?: string | null
          footer_bg?: string | null
          footer_fg?: string | null
          footer_note?: string | null
          global_sale_badges_enabled?: boolean
          header_bg?: string | null
          header_fg?: string | null
          header_glass?: boolean | null
          heading_color?: string | null
          hero_title_align?: string
          hero_title_ar?: string | null
          hero_title_color?: string | null
          hero_title_en?: string | null
          hero_title_size?: number
          home_promo_cards?: Json
          homepage_editorial_sections?: Json
          invoice_arabic_font_family?: string | null
          invoice_divider_color?: string | null
          invoice_secondary_color?: string | null
          invoice_show_business_details?: boolean
          invoice_show_customer_contact?: boolean
          invoice_show_fulfillment?: boolean
          invoice_show_notes?: boolean
          invoice_status_paid_color?: string | null
          invoice_status_progress_color?: string | null
          invoice_status_unpaid_color?: string | null
          invoice_table_header_bg?: string | null
          invoice_table_header_fg?: string | null
          invoice_template?: string
          invoice_title_ar?: string | null
          invoice_title_en?: string | null
          link_color?: string | null
          logo_align?: string
          logo_height?: number
          logo_size?: number
          logo_url?: string | null
          logo_width?: number
          logo_x?: number
          logo_y?: number
          menu_bg?: string | null
          menu_fg?: string | null
          menu_show_account?: boolean
          menu_show_home?: boolean
          menu_show_orders?: boolean
          menu_show_pages?: boolean
          menu_title_ar?: string | null
          menu_title_en?: string | null
          new_arrivals_title_ar?: string | null
          new_arrivals_title_en?: string | null
          next_invoice_number?: number
          pages?: Json
          phone?: string | null
          pickup_enabled?: boolean
          primary_color?: string
          secondary_banner_parallax_breakpoint?: number
          secondary_banner_parallax_enabled?: boolean
          secondary_banner_parallax_mobile_enabled?: boolean
          shipping_zones?: Json
          show_best_sellers?: boolean
          show_footer_name?: boolean
          show_header_name?: boolean
          show_hero_about?: boolean
          show_hero_title?: boolean
          show_new_arrivals?: boolean
          socials?: Json
          storefront_accent_color?: string | null
          storefront_background_color?: string | null
          storefront_font_ar?: string
          storefront_font_ar_url?: string | null
          storefront_font_en?: string
          storefront_font_en_url?: string | null
          storefront_loader_text_ar?: string | null
          storefront_loader_text_en?: string | null
          storefront_radius?: string | null
          storefront_text_color?: string | null
          storefront_typography?: Json
          text_color?: string
          trending_banner_background_url?: string | null
          updated_at?: string
          user_id?: string
          vat_inclusive?: boolean
          vat_number?: string | null
          whatsapp_enabled?: boolean
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_accounts: {
        Row: {
          account_type: string
          balance: number
          brand_id: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          account_type?: string
          balance?: number
          brand_id: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          account_type?: string
          balance?: number
          brand_id?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          menu_icon_url: string | null
          name_ar: string | null
          name_en: string | null
          parent_id: string | null
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          menu_icon_url?: string | null
          name_ar?: string | null
          name_en?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          menu_icon_url?: string | null
          name_ar?: string | null
          name_en?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          block: string | null
          brand_id: string
          created_at: string
          customer_id: string
          delivery_notes: string | null
          flat: string | null
          floor: string | null
          formatted_address: string | null
          house: string | null
          id: string
          is_default: boolean
          label: string | null
          landmark: string | null
          latitude: number | null
          longitude: number | null
          place_id: string | null
          region: string | null
          road: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          block?: string | null
          brand_id: string
          created_at?: string
          customer_id: string
          delivery_notes?: string | null
          flat?: string | null
          floor?: string | null
          formatted_address?: string | null
          house?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          place_id?: string | null
          region?: string | null
          road?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          block?: string | null
          brand_id?: string
          created_at?: string
          customer_id?: string
          delivery_notes?: string | null
          flat?: string | null
          floor?: string | null
          formatted_address?: string | null
          house?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          place_id?: string | null
          region?: string | null
          road?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_fit_passport_history: {
        Row: {
          brand_id: string
          changed_at: string
          changed_by: string | null
          customer_id: string
          id: string
          passport_id: string
          snapshot: Json
          version: number
        }
        Insert: {
          brand_id: string
          changed_at?: string
          changed_by?: string | null
          customer_id: string
          id?: string
          passport_id: string
          snapshot: Json
          version: number
        }
        Update: {
          brand_id?: string
          changed_at?: string
          changed_by?: string | null
          customer_id?: string
          id?: string
          passport_id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_fit_passport_history_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_fit_passport_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_fit_passport_history_passport_id_fkey"
            columns: ["passport_id"]
            isOneToOne: false
            referencedRelation: "customer_fit_passports"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_fit_passports: {
        Row: {
          brand_id: string
          consent_to_store: boolean
          created_at: string
          customer_id: string
          fit_preference: string
          id: string
          measurements: Json
          preferred_length_unit: string
          tailoring_notes: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          brand_id: string
          consent_to_store?: boolean
          created_at?: string
          customer_id: string
          fit_preference?: string
          id?: string
          measurements?: Json
          preferred_length_unit?: string
          tailoring_notes?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          brand_id?: string
          consent_to_store?: boolean
          created_at?: string
          customer_id?: string
          fit_preference?: string
          id?: string
          measurements?: Json
          preferred_length_unit?: string
          tailoring_notes?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_fit_passports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_fit_passports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_push_delivery_log: {
        Row: {
          created_at: string
          device_id: string
          error_message: string | null
          event_id: string
          id: string
          provider_ticket_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          device_id: string
          error_message?: string | null
          event_id: string
          id?: string
          provider_ticket_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          device_id?: string
          error_message?: string | null
          event_id?: string
          id?: string
          provider_ticket_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_push_delivery_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "customer_push_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_push_delivery_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "customer_push_events"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_push_devices: {
        Row: {
          brand_id: string
          created_at: string
          customer_id: string
          device_name: string | null
          enabled: boolean
          expo_push_token: string
          id: string
          last_seen_at: string
          marketing_enabled: boolean
          order_updates_enabled: boolean
          platform: string
          token_provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          customer_id: string
          device_name?: string | null
          enabled?: boolean
          expo_push_token: string
          id?: string
          last_seen_at?: string
          marketing_enabled?: boolean
          order_updates_enabled?: boolean
          platform?: string
          token_provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          customer_id?: string
          device_name?: string | null
          enabled?: boolean
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          marketing_enabled?: boolean
          order_updates_enabled?: boolean
          platform?: string
          token_provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_push_devices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_push_devices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_push_events: {
        Row: {
          accepted_count: number
          attempts: number
          available_at: string
          body: string
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          dedupe_key: string
          event_type: string
          failed_count: number
          id: string
          last_error: string | null
          order_id: string | null
          payload: Json
          processed_at: string | null
          recipient_count: number
          status: string
          target_url: string | null
          title: string
        }
        Insert: {
          accepted_count?: number
          attempts?: number
          available_at?: string
          body: string
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dedupe_key: string
          event_type: string
          failed_count?: number
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_count?: number
          status?: string
          target_url?: string | null
          title: string
        }
        Update: {
          accepted_count?: number
          attempts?: number
          available_at?: string
          body?: string
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          dedupe_key?: string
          event_type?: string
          failed_count?: number
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_count?: number
          status?: string
          target_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_push_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_push_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_push_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          auth_user_id: string | null
          block: string | null
          brand_id: string
          city: string | null
          created_at: string
          email: string | null
          flat: string | null
          house: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          region: string | null
          road: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          auth_user_id?: string | null
          block?: string | null
          brand_id: string
          city?: string | null
          created_at?: string
          email?: string | null
          flat?: string | null
          house?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          road?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          auth_user_id?: string | null
          block?: string | null
          brand_id?: string
          city?: string | null
          created_at?: string
          email?: string | null
          flat?: string | null
          house?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          road?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      customization_options: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          name: string
          price_delta: number
          product_ids: string[] | null
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          name: string
          price_delta?: number
          product_ids?: string[] | null
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          name?: string
          price_delta?: number
          product_ids?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customization_options_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_hosted_quiz_usage: {
        Row: {
          hosted_count: number
          last_hosted_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          hosted_count?: number
          last_hosted_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          hosted_count?: number
          last_hosted_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          brand_id: string
          category: string
          created_at: string
          currency: string
          description: string | null
          expense_date: string
          expense_type: string | null
          id: string
          is_recurring: boolean | null
          line_items: Json | null
          next_recurrence_date: string | null
          notes: string | null
          quantity: number | null
          receipt_time: string | null
          receipt_url: string | null
          recurrence_period: string | null
          store_name: string | null
          tax_amount: number | null
          tax_rate: number | null
          unit_cost: number | null
          unit_type: string | null
          updated_at: string
          user_id: string
          vendor_id: string | null
        }
        Insert: {
          amount?: number
          brand_id: string
          category: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          expense_type?: string | null
          id?: string
          is_recurring?: boolean | null
          line_items?: Json | null
          next_recurrence_date?: string | null
          notes?: string | null
          quantity?: number | null
          receipt_time?: string | null
          receipt_url?: string | null
          recurrence_period?: string | null
          store_name?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          unit_cost?: number | null
          unit_type?: string | null
          updated_at?: string
          user_id: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          category?: string
          created_at?: string
          currency?: string
          description?: string | null
          expense_date?: string
          expense_type?: string | null
          id?: string
          is_recurring?: boolean | null
          line_items?: Json | null
          next_recurrence_date?: string | null
          notes?: string | null
          quantity?: number | null
          receipt_time?: string | null
          receipt_url?: string | null
          recurrence_period?: string | null
          store_name?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          unit_cost?: number | null
          unit_type?: string | null
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          host_id: string | null
          id: string
          played_at: string | null
          player_count: number | null
          question_count: number | null
          quiz_title: string | null
          room_code: string | null
          team_count: number | null
        }
        Insert: {
          host_id?: string | null
          id?: string
          played_at?: string | null
          player_count?: number | null
          question_count?: number | null
          quiz_title?: string | null
          room_code?: string | null
          team_count?: number | null
        }
        Update: {
          host_id?: string | null
          id?: string
          played_at?: string | null
          player_count?: number | null
          question_count?: number | null
          quiz_title?: string | null
          room_code?: string | null
          team_count?: number | null
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          host_id: string | null
          id: string
          played_at: string | null
          player_count: number | null
          quiz_id: string | null
          room_code: string | null
          score_summary: Json | null
          team_count: number | null
        }
        Insert: {
          host_id?: string | null
          id?: string
          played_at?: string | null
          player_count?: number | null
          quiz_id?: string | null
          room_code?: string | null
          score_summary?: Json | null
          team_count?: number | null
        }
        Update: {
          host_id?: string | null
          id?: string
          played_at?: string | null
          player_count?: number | null
          quiz_id?: string | null
          room_code?: string | null
          score_summary?: Json | null
          team_count?: number | null
        }
        Relationships: []
      }
      idempotency_claims: {
        Row: {
          brand_id: string
          created_at: string
          idempotency_key: string
          order_id: string | null
          request_hash: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          idempotency_key: string
          order_id?: string | null
          request_hash: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          idempotency_key?: string
          order_id?: string | null
          request_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_claims_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_claims_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          batch_index: number
          brand_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          entity_type: string
          failed_count: number
          id: string
          issues: Json
          session_id: string
          skipped_count: number
          source: string
          started_at: string
          status: string
          success_count: number
          total_count: number
        }
        Insert: {
          batch_index?: number
          brand_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          entity_type?: string
          failed_count?: number
          id?: string
          issues?: Json
          session_id: string
          skipped_count?: number
          source: string
          started_at?: string
          status: string
          success_count?: number
          total_count?: number
        }
        Update: {
          batch_index?: number
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          entity_type?: string
          failed_count?: number
          id?: string
          issues?: Json
          session_id?: string
          skipped_count?: number
          source?: string
          started_at?: string
          status?: string
          success_count?: number
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_inventory: {
        Row: {
          brand_id: string
          commission_type: string
          commission_value: number
          consignment_price: number
          created_at: string
          external_code: string | null
          id: string
          incubator_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          brand_id: string
          commission_type?: string
          commission_value?: number
          consignment_price?: number
          created_at?: string
          external_code?: string | null
          id?: string
          incubator_id: string
          quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          brand_id?: string
          commission_type?: string
          commission_value?: number
          consignment_price?: number
          created_at?: string
          external_code?: string | null
          id?: string
          incubator_id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_inventory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_inventory_incubator_id_fkey"
            columns: ["incubator_id"]
            isOneToOne: false
            referencedRelation: "incubators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_movements: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          incubator_id: string
          movement_type: string
          notes: string | null
          occurred_at: string
          quantity_delta: number
          reference_id: string | null
          reference_type: string | null
          variant_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          incubator_id: string
          movement_type: string
          notes?: string | null
          occurred_at?: string
          quantity_delta: number
          reference_id?: string | null
          reference_type?: string | null
          variant_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          incubator_id?: string
          movement_type?: string
          notes?: string | null
          occurred_at?: string
          quantity_delta?: number
          reference_id?: string | null
          reference_type?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_movements_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_movements_incubator_id_fkey"
            columns: ["incubator_id"]
            isOneToOne: false
            referencedRelation: "incubators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "incubator_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_payment_allocations_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "incubator_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_payments: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          incubator_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          incubator_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          incubator_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incubator_payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_payments_incubator_id_fkey"
            columns: ["incubator_id"]
            isOneToOne: false
            referencedRelation: "incubators"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_sales: {
        Row: {
          brand_id: string
          commission_amount: number
          created_at: string
          created_by: string | null
          gross_amount: number
          id: string
          incubator_id: string
          net_due: number
          packaging_cost_snapshot: number
          packaging_materials_snapshot: Json
          packaging_policy_snapshot: string
          paid_amount: number
          product_cost_snapshot: number
          quantity: number
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          sold_at: string
          status: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          brand_id: string
          commission_amount: number
          created_at?: string
          created_by?: string | null
          gross_amount: number
          id?: string
          incubator_id: string
          net_due: number
          packaging_cost_snapshot?: number
          packaging_materials_snapshot?: Json
          packaging_policy_snapshot?: string
          paid_amount?: number
          product_cost_snapshot?: number
          quantity: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          sold_at?: string
          status?: string
          unit_price: number
          variant_id: string
        }
        Update: {
          brand_id?: string
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          gross_amount?: number
          id?: string
          incubator_id?: string
          net_due?: number
          packaging_cost_snapshot?: number
          packaging_materials_snapshot?: Json
          packaging_policy_snapshot?: string
          paid_amount?: number
          product_cost_snapshot?: number
          quantity?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          sold_at?: string
          status?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_sales_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_sales_incubator_id_fkey"
            columns: ["incubator_id"]
            isOneToOne: false
            referencedRelation: "incubators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_sales_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      incubators: {
        Row: {
          brand_id: string
          commission_type: string
          commission_value: number
          contact_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          fixed_packaging_cost: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          packaging_policy: string
          phone: string | null
          settlement_day: number | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          commission_type?: string
          commission_value?: number
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          fixed_packaging_cost?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          packaging_policy?: string
          phone?: string | null
          settlement_day?: number | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          commission_type?: string
          commission_value?: number
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          fixed_packaging_cost?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          packaging_policy?: string
          phone?: string | null
          settlement_day?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubators_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          api_key: string | null
          api_key_secret_id: string | null
          base_url: string | null
          brand_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          provider: string
          updated_at: string
          webhook_secret: string | null
          webhook_secret_secret_id: string | null
        }
        Insert: {
          api_key?: string | null
          api_key_secret_id?: string | null
          base_url?: string | null
          brand_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          provider: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_secret_secret_id?: string | null
        }
        Update: {
          api_key?: string | null
          api_key_secret_id?: string | null
          base_url?: string | null
          brand_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          provider?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_secret_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movement_logs: {
        Row: {
          branch_id: string | null
          brand_id: string
          created_at: string
          handled_by: string | null
          id: string
          item_condition: string
          movement_type: string
          quantity_after: number
          quantity_before: number
          quantity_changed: number
          reference_code: string
          return_id: string | null
          return_item_id: string | null
          variant_id: string
        }
        Insert: {
          branch_id?: string | null
          brand_id: string
          created_at?: string
          handled_by?: string | null
          id?: string
          item_condition: string
          movement_type: string
          quantity_after: number
          quantity_before: number
          quantity_changed: number
          reference_code: string
          return_id?: string | null
          return_item_id?: string | null
          variant_id: string
        }
        Update: {
          branch_id?: string | null
          brand_id?: string
          created_at?: string
          handled_by?: string | null
          id?: string
          item_condition?: string
          movement_type?: string
          quantity_after?: number
          quantity_before?: number
          quantity_changed?: number
          reference_code?: string
          return_id?: string | null
          return_item_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movement_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_logs_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_logs_return_item_id_fkey"
            columns: ["return_item_id"]
            isOneToOne: false
            referencedRelation: "return_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_logs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          brand_id: string
          created_at: string
          entry_date: string
          id: string
          narration: string
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          entry_date?: string
          id?: string
          narration: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          entry_date?: string
          id?: string
          narration?: string
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          brand_id: string
          category: string
          code: string
          created_at: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          brand_id: string
          category: string
          code: string
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          brand_id?: string
          category?: string
          code?: string
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          active_points: number
          brand_id: string
          created_at: string
          current_tier_key: string
          customer_id: string
          id: string
          lifetime_points: number
          lifetime_spent_points: number
          pending_points: number
          tier_achieved_at: string
          updated_at: string
        }
        Insert: {
          active_points?: number
          brand_id: string
          created_at?: string
          current_tier_key?: string
          customer_id: string
          id?: string
          lifetime_points?: number
          lifetime_spent_points?: number
          pending_points?: number
          tier_achieved_at?: string
          updated_at?: string
        }
        Update: {
          active_points?: number
          brand_id?: string
          created_at?: string
          current_tier_key?: string
          customer_id?: string
          id?: string
          lifetime_points?: number
          lifetime_spent_points?: number
          pending_points?: number
          tier_achieved_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          account_id: string
          balance_after: number
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          effective_at: string
          event_type: string
          expires_at: string | null
          id: string
          idempotency_key: string
          order_id: string | null
          points: number
          points_status: string
          reference_note_ar: string | null
          reference_note_en: string | null
          review_id: string | null
        }
        Insert: {
          account_id: string
          balance_after?: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          effective_at?: string
          event_type: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          order_id?: string | null
          points: number
          points_status?: string
          reference_note_ar?: string | null
          reference_note_en?: string | null
          review_id?: string | null
        }
        Update: {
          account_id?: string
          balance_after?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          effective_at?: string
          event_type?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          order_id?: string | null
          points?: number
          points_status?: string
          reference_note_ar?: string | null
          reference_note_en?: string | null
          review_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "order_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          brand_id: string
          channel: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          brand_id: string
          channel?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          brand_id?: string
          channel?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_app_releases: {
        Row: {
          app_key: string
          artifact_url: string
          build_number: number
          created_at: string
          id: string
          install_method: string
          is_active: boolean
          object_key: string
          platform: string
          release_notes: string | null
          sha256: string
          size_bytes: number
          version_name: string
        }
        Insert: {
          app_key: string
          artifact_url: string
          build_number: number
          created_at?: string
          id?: string
          install_method: string
          is_active?: boolean
          object_key: string
          platform: string
          release_notes?: string | null
          sha256: string
          size_bytes: number
          version_name: string
        }
        Update: {
          app_key?: string
          artifact_url?: string
          build_number?: number
          created_at?: string
          id?: string
          install_method?: string
          is_active?: boolean
          object_key?: string
          platform?: string
          release_notes?: string | null
          sha256?: string
          size_bytes?: number
          version_name?: string
        }
        Relationships: []
      }
      order_email_events: {
        Row: {
          attempts: number
          brand_id: string
          created_at: string
          event_type: string
          id: string
          language: string
          last_error: string | null
          order_id: string
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          created_at?: string
          event_type: string
          id?: string
          language?: string
          last_error?: string | null
          order_id: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          created_at?: string
          event_type?: string
          id?: string
          language?: string
          last_error?: string | null
          order_id?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_email_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_email_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          brand_id: string
          created_at: string
          custom_field_values: Json
          customization_total: number
          customizations: Json
          description: string
          id: string
          line_total: number
          location: string
          order_id: string
          original_price: number | null
          packaging_cost_snapshot: number | null
          product_id: string | null
          quantity: number
          selected_variant: Json | null
          unit_cost: number | null
          unit_price: number
          user_id: string
          variant_id: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          custom_field_values?: Json
          customization_total?: number
          customizations?: Json
          description: string
          id?: string
          line_total?: number
          location?: string
          order_id: string
          original_price?: number | null
          packaging_cost_snapshot?: number | null
          product_id?: string | null
          quantity?: number
          selected_variant?: Json | null
          unit_cost?: number | null
          unit_price?: number
          user_id: string
          variant_id?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          custom_field_values?: Json
          customization_total?: number
          customizations?: Json
          description?: string
          id?: string
          line_total?: number
          location?: string
          order_id?: string
          original_price?: number | null
          packaging_cost_snapshot?: number | null
          product_id?: string | null
          quantity?: number
          selected_variant?: Json | null
          unit_cost?: number | null
          unit_price?: number
          user_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_review_requests: {
        Row: {
          brand_id: string
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          eligible_at: string
          id: string
          order_id: string
          public_token: string
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
          whatsapp_opened_at: string | null
        }
        Insert: {
          brand_id: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          eligible_at: string
          id?: string
          order_id: string
          public_token?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
          whatsapp_opened_at?: string | null
        }
        Update: {
          brand_id?: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          eligible_at?: string
          id?: string
          order_id?: string
          public_token?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
          whatsapp_opened_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_review_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_review_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_review_requests_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reviews: {
        Row: {
          brand_id: string
          comment: string | null
          created_at: string
          highlights: string[]
          id: string
          order_id: string
          rating: number
          request_id: string
          reward_code: string
        }
        Insert: {
          brand_id: string
          comment?: string | null
          created_at?: string
          highlights?: string[]
          id?: string
          order_id: string
          rating: number
          request_id: string
          reward_code?: string
        }
        Update: {
          brand_id?: string
          comment?: string | null
          created_at?: string
          highlights?: string[]
          id?: string
          order_id?: string
          rating?: number
          request_id?: string
          reward_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_reviews_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reviews_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "order_review_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          advance_paid: number
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          benefit_receipt_delete_after: string | null
          benefit_receipt_deleted_at: string | null
          benefit_receipt_key: string | null
          benefit_receipt_rejected_at: string | null
          benefit_receipt_rejected_by: string | null
          benefit_receipt_rejection_reason: string | null
          benefit_receipt_uploaded_at: string | null
          benefit_receipt_url: string | null
          benefit_verified_at: string | null
          benefit_verified_by: string | null
          branch_id: string | null
          brand_id: string
          channel: string
          cod_collected_amount: number | null
          cod_collected_at: string | null
          cod_collected_by: string | null
          completed_at: string | null
          confirmation_email_error: string | null
          confirmation_email_sent_at: string | null
          confirmation_email_status: string | null
          confirmation_email_token: string
          courier_notified_at: string | null
          created_at: string
          currency: string
          customer_email_snapshot: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          customer_phone_snapshot: string | null
          delivered_at: string | null
          delivery_address_snapshot: Json | null
          delivery_notes: string | null
          delivery_status_updated_at: string | null
          delivery_status_updated_by: string | null
          digital_delivery_channel: string | null
          digital_delivery_contact: string | null
          discount: number
          fulfillment_method: string
          fulfillment_status: string
          id: string
          idempotency_key: string | null
          invoice_number: number
          notes: string | null
          order_date: string
          payment_account: string | null
          payment_gateway_reference: string | null
          payment_method: string | null
          payment_status: string
          promo_code: string | null
          promo_code_id: string | null
          public_invoice_token: string
          reconciliation_status: string | null
          request_hash: string | null
          shipping: number
          shipping_address_id: string | null
          status: string
          stock_deducted: boolean
          stock_snapshot: Json | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          user_id: string
          whatsapp_transactional_opt_in_at: string | null
        }
        Insert: {
          advance_paid?: number
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          benefit_receipt_delete_after?: string | null
          benefit_receipt_deleted_at?: string | null
          benefit_receipt_key?: string | null
          benefit_receipt_rejected_at?: string | null
          benefit_receipt_rejected_by?: string | null
          benefit_receipt_rejection_reason?: string | null
          benefit_receipt_uploaded_at?: string | null
          benefit_receipt_url?: string | null
          benefit_verified_at?: string | null
          benefit_verified_by?: string | null
          branch_id?: string | null
          brand_id: string
          channel?: string
          cod_collected_amount?: number | null
          cod_collected_at?: string | null
          cod_collected_by?: string | null
          completed_at?: string | null
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string | null
          confirmation_email_token?: string
          courier_notified_at?: string | null
          created_at?: string
          currency?: string
          customer_email_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_phone_snapshot?: string | null
          delivered_at?: string | null
          delivery_address_snapshot?: Json | null
          delivery_notes?: string | null
          delivery_status_updated_at?: string | null
          delivery_status_updated_by?: string | null
          digital_delivery_channel?: string | null
          digital_delivery_contact?: string | null
          discount?: number
          fulfillment_method?: string
          fulfillment_status?: string
          id?: string
          idempotency_key?: string | null
          invoice_number: number
          notes?: string | null
          order_date?: string
          payment_account?: string | null
          payment_gateway_reference?: string | null
          payment_method?: string | null
          payment_status?: string
          promo_code?: string | null
          promo_code_id?: string | null
          public_invoice_token?: string
          reconciliation_status?: string | null
          request_hash?: string | null
          shipping?: number
          shipping_address_id?: string | null
          status?: string
          stock_deducted?: boolean
          stock_snapshot?: Json | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          user_id: string
          whatsapp_transactional_opt_in_at?: string | null
        }
        Update: {
          advance_paid?: number
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          benefit_receipt_delete_after?: string | null
          benefit_receipt_deleted_at?: string | null
          benefit_receipt_key?: string | null
          benefit_receipt_rejected_at?: string | null
          benefit_receipt_rejected_by?: string | null
          benefit_receipt_rejection_reason?: string | null
          benefit_receipt_uploaded_at?: string | null
          benefit_receipt_url?: string | null
          benefit_verified_at?: string | null
          benefit_verified_by?: string | null
          branch_id?: string | null
          brand_id?: string
          channel?: string
          cod_collected_amount?: number | null
          cod_collected_at?: string | null
          cod_collected_by?: string | null
          completed_at?: string | null
          confirmation_email_error?: string | null
          confirmation_email_sent_at?: string | null
          confirmation_email_status?: string | null
          confirmation_email_token?: string
          courier_notified_at?: string | null
          created_at?: string
          currency?: string
          customer_email_snapshot?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_phone_snapshot?: string | null
          delivered_at?: string | null
          delivery_address_snapshot?: Json | null
          delivery_notes?: string | null
          delivery_status_updated_at?: string | null
          delivery_status_updated_by?: string | null
          digital_delivery_channel?: string | null
          digital_delivery_contact?: string | null
          discount?: number
          fulfillment_method?: string
          fulfillment_status?: string
          id?: string
          idempotency_key?: string | null
          invoice_number?: number
          notes?: string | null
          order_date?: string
          payment_account?: string | null
          payment_gateway_reference?: string | null
          payment_method?: string | null
          payment_status?: string
          promo_code?: string | null
          promo_code_id?: string | null
          public_invoice_token?: string
          reconciliation_status?: string | null
          request_hash?: string | null
          shipping?: number
          shipping_address_id?: string | null
          status?: string
          stock_deducted?: boolean
          stock_snapshot?: Json | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          user_id?: string
          whatsapp_transactional_opt_in_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cod_collected_by_fkey"
            columns: ["cod_collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_status_updated_by_fkey"
            columns: ["delivery_status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_materials: {
        Row: {
          brand_id: string
          created_at: string
          deduction_rule: string | null
          id: string
          name: string
          name_ar: string | null
          reorder_level: number | null
          sku: string | null
          stock_quantity: number
          unit_cost: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          deduction_rule?: string | null
          id?: string
          name: string
          name_ar?: string | null
          reorder_level?: number | null
          sku?: string | null
          stock_quantity?: number
          unit_cost?: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          deduction_rule?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          reorder_level?: number | null
          sku?: string | null
          stock_quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "packaging_materials_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_benefit_receipts: {
        Row: {
          brand_id: string
          consumed_at: string | null
          content_type: string
          created_at: string
          expires_at: string
          file_size: number
          id: string
          object_key: string
          public_url: string | null
          uploaded_at: string | null
        }
        Insert: {
          brand_id: string
          consumed_at?: string | null
          content_type: string
          created_at?: string
          expires_at?: string
          file_size: number
          id?: string
          object_key: string
          public_url?: string | null
          uploaded_at?: string | null
        }
        Update: {
          brand_id?: string
          consumed_at?: string | null
          content_type?: string
          created_at?: string
          expires_at?: string
          file_size?: number
          id?: string
          object_key?: string
          public_url?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_benefit_receipts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          avatar_color: string
          fifty_hidden: number[] | null
          fifty_question_id: string | null
          id: string
          joined_at: string
          nickname: string
          room_id: string
          team_index: number | null
          used_double: boolean | null
          used_fifty: boolean | null
        }
        Insert: {
          avatar_color?: string
          fifty_hidden?: number[] | null
          fifty_question_id?: string | null
          id?: string
          joined_at?: string
          nickname: string
          room_id: string
          team_index?: number | null
          used_double?: boolean | null
          used_fifty?: boolean | null
        }
        Update: {
          avatar_color?: string
          fifty_hidden?: number[] | null
          fifty_question_id?: string | null
          id?: string
          joined_at?: string
          nickname?: string
          room_id?: string
          team_index?: number | null
          used_double?: boolean | null
          used_fifty?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_definitions: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          id: string
          name_ar: string | null
          name_en: string
          type: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          id?: string
          name_ar?: string | null
          name_en: string
          type?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          id?: string
          name_ar?: string | null
          name_en?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_definitions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      product_barcodes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          product_id: string | null
          variant_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          product_id?: string | null
          variant_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          product_id?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_barcodes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bom_items: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          packaging_material_id: string
          product_id: string
          quantity_per_unit: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          packaging_material_id: string
          product_id: string
          quantity_per_unit?: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          packaging_material_id?: string
          product_id?: string
          quantity_per_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_bom_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bom_items_packaging_material_id_fkey"
            columns: ["packaging_material_id"]
            isOneToOne: false
            referencedRelation: "packaging_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bom_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_engagement_daily: {
        Row: {
          brand_id: string
          click_count: number
          event_date: string
          product_id: string
          view_count: number
        }
        Insert: {
          brand_id: string
          click_count?: number
          event_date?: string
          product_id: string
          view_count?: number
        }
        Update: {
          brand_id?: string
          click_count?: number
          event_date?: string
          product_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_engagement_daily_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_engagement_daily_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_attributes: {
        Row: {
          attribute_definition_id: string
          created_at: string
          id: string
          updated_at: string
          value_ar: string | null
          value_en: string
          variant_id: string
        }
        Insert: {
          attribute_definition_id: string
          created_at?: string
          id?: string
          updated_at?: string
          value_ar?: string | null
          value_en: string
          variant_id: string
        }
        Update: {
          attribute_definition_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          value_ar?: string | null
          value_en?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_attributes_attribute_definition_id_fkey"
            columns: ["attribute_definition_id"]
            isOneToOne: false
            referencedRelation: "product_attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_attributes_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          brand_id: string
          color: string | null
          cost_price: number
          created_at: string
          fabric: string | null
          id: string
          image_url: string | null
          option_five: string | null
          option_four: string | null
          original_price: number | null
          product_id: string
          selling_price: number
          size: string | null
          size_unit: string | null
          sku: string | null
          stock: number
          stock_incubator: number
          stock_main: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          barcode?: string | null
          brand_id: string
          color?: string | null
          cost_price?: number
          created_at?: string
          fabric?: string | null
          id?: string
          image_url?: string | null
          option_five?: string | null
          option_four?: string | null
          original_price?: number | null
          product_id: string
          selling_price?: number
          size?: string | null
          size_unit?: string | null
          sku?: string | null
          stock?: number
          stock_incubator?: number
          stock_main?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          barcode?: string | null
          brand_id?: string
          color?: string | null
          cost_price?: number
          created_at?: string
          fabric?: string | null
          id?: string
          image_url?: string | null
          option_five?: string | null
          option_four?: string | null
          original_price?: number | null
          product_id?: string
          selling_price?: number
          size?: string | null
          size_unit?: string | null
          sku?: string | null
          stock?: number
          stock_incubator?: number
          stock_main?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number | null
          brand_id: string
          category: string | null
          cost_price: number
          created_at: string
          custom_fields: Json
          description: string | null
          description_ar: string | null
          description_en: string | null
          direct_packaging_cost: number | null
          fabric_type: string | null
          featured_trending: boolean
          id: string
          image_url: string | null
          is_active: boolean
          media: Json
          name: string
          name_ar: string | null
          name_en: string | null
          occasion: string | null
          show_sale_badge: boolean
          tracks_inventory: boolean | null
          updated_at: string
          user_id: string | null
          variant_label_color: string | null
          variant_label_color_ar: string | null
          variant_label_color_en: string | null
          variant_label_fabric: string | null
          variant_label_fabric_ar: string | null
          variant_label_fabric_en: string | null
          variant_label_five_ar: string | null
          variant_label_five_en: string | null
          variant_label_four_ar: string | null
          variant_label_four_en: string | null
          variant_label_size: string | null
          variant_label_size_ar: string | null
          variant_label_size_en: string | null
          vendor_id: string | null
        }
        Insert: {
          base_price?: number | null
          brand_id: string
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_fields?: Json
          description?: string | null
          description_ar?: string | null
          description_en?: string | null
          direct_packaging_cost?: number | null
          fabric_type?: string | null
          featured_trending?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          media?: Json
          name: string
          name_ar?: string | null
          name_en?: string | null
          occasion?: string | null
          show_sale_badge?: boolean
          tracks_inventory?: boolean | null
          updated_at?: string
          user_id?: string | null
          variant_label_color?: string | null
          variant_label_color_ar?: string | null
          variant_label_color_en?: string | null
          variant_label_fabric?: string | null
          variant_label_fabric_ar?: string | null
          variant_label_fabric_en?: string | null
          variant_label_five_ar?: string | null
          variant_label_five_en?: string | null
          variant_label_four_ar?: string | null
          variant_label_four_en?: string | null
          variant_label_size?: string | null
          variant_label_size_ar?: string | null
          variant_label_size_en?: string | null
          vendor_id?: string | null
        }
        Update: {
          base_price?: number | null
          brand_id?: string
          category?: string | null
          cost_price?: number
          created_at?: string
          custom_fields?: Json
          description?: string | null
          description_ar?: string | null
          description_en?: string | null
          direct_packaging_cost?: number | null
          fabric_type?: string | null
          featured_trending?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          media?: Json
          name?: string
          name_ar?: string | null
          name_en?: string | null
          occasion?: string | null
          show_sale_badge?: boolean
          tracks_inventory?: boolean | null
          updated_at?: string
          user_id?: string | null
          variant_label_color?: string | null
          variant_label_color_ar?: string | null
          variant_label_color_en?: string | null
          variant_label_fabric?: string | null
          variant_label_fabric_ar?: string | null
          variant_label_fabric_en?: string | null
          variant_label_five_ar?: string | null
          variant_label_five_en?: string | null
          variant_label_four_ar?: string | null
          variant_label_four_en?: string | null
          variant_label_size?: string | null
          variant_label_size_ar?: string | null
          variant_label_size_en?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          brand_id: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          name: string | null
          permissions: Json | null
          phone: string | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          brand_id?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          name?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          brand_id?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          name?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          end_date: string | null
          exclude_low_margin: boolean
          exclude_sale_items: boolean
          first_time_customers_only: boolean
          id: string
          is_active: boolean
          margin_threshold: number
          max_redemptions: number | null
          maximum_discount_amount: number | null
          minimum_order_amount: number | null
          returning_customers_only: boolean
          start_date: string | null
          updated_at: string
          usage_limit_per_customer: number | null
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          end_date?: string | null
          exclude_low_margin?: boolean
          exclude_sale_items?: boolean
          first_time_customers_only?: boolean
          id?: string
          is_active?: boolean
          margin_threshold?: number
          max_redemptions?: number | null
          maximum_discount_amount?: number | null
          minimum_order_amount?: number | null
          returning_customers_only?: boolean
          start_date?: string | null
          updated_at?: string
          usage_limit_per_customer?: number | null
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          exclude_low_margin?: boolean
          exclude_sale_items?: boolean
          first_time_customers_only?: boolean
          id?: string
          is_active?: boolean
          margin_threshold?: number
          max_redemptions?: number | null
          maximum_discount_amount?: number | null
          minimum_order_amount?: number | null
          returning_customers_only?: boolean
          start_date?: string | null
          updated_at?: string
          usage_limit_per_customer?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          description: string
          id: string
          line_total: number
          po_id: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          description: string
          id?: string
          line_total?: number
          po_id: string
          quantity?: number
          unit_cost?: number
        }
        Update: {
          description?: string
          id?: string
          line_total?: number
          po_id?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          brand_id: string
          created_at: string
          due_date: string | null
          id: string
          paid_amount: number
          po_number: string
          status: string
          total_amount: number
          vendor_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          paid_amount?: number
          po_number: string
          status?: string
          total_amount?: number
          vendor_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          paid_amount?: number
          po_number?: string
          status?: string
          total_amount?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_log: {
        Row: {
          created_at: string
          device_id: string
          error_message: string | null
          event_id: string
          id: string
          provider_ticket_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          device_id: string
          error_message?: string | null
          event_id: string
          id?: string
          provider_ticket_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          device_id?: string
          error_message?: string | null
          event_id?: string
          id?: string
          provider_ticket_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "push_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "push_notification_events"
            referencedColumns: ["id"]
          },
        ]
      }
      push_devices: {
        Row: {
          brand_id: string | null
          created_at: string
          device_name: string | null
          enabled: boolean
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          device_name?: string | null
          enabled?: boolean
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          device_name?: string | null
          enabled?: boolean
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_events: {
        Row: {
          attempts: number
          available_at: string
          body: string
          brand_id: string
          created_at: string
          dedupe_key: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          status: string
          target_url: string | null
          title: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          body: string
          brand_id: string
          created_at?: string
          dedupe_key: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          target_url?: string | null
          title: string
        }
        Update: {
          attempts?: number
          available_at?: string
          body?: string
          brand_id?: string
          created_at?: string
          dedupe_key?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          target_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_index: number | null
          created_at: string | null
          explanation: string | null
          id: string
          image_url: string | null
          options: Json
          order_index: number | null
          question_text: string
          question_type: string | null
          quiz_id: string | null
          subcategory: string | null
          time_limit_seconds: number | null
        }
        Insert: {
          correct_index?: number | null
          created_at?: string | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          options?: Json
          order_index?: number | null
          question_text: string
          question_type?: string | null
          quiz_id?: string | null
          subcategory?: string | null
          time_limit_seconds?: number | null
        }
        Update: {
          correct_index?: number | null
          created_at?: string | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          options?: Json
          order_index?: number | null
          question_text?: string
          question_type?: string | null
          quiz_id?: string | null
          subcategory?: string | null
          time_limit_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          category: string | null
          category_id: string | null
          created_at: string | null
          id: string
          is_public: boolean | null
          language: string | null
          quiz_difficulty: string | null
          subcategory: string | null
          subcategory_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          language?: string | null
          quiz_difficulty?: string | null
          subcategory?: string | null
          subcategory_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          language?: string | null
          quiz_difficulty?: string | null
          subcategory?: string | null
          subcategory_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      return_items: {
        Row: {
          action_type: string
          brand_id: string
          condition: string
          created_at: string
          id: string
          inspection_notes: string | null
          item_images: string[] | null
          order_item_id: string
          product_id: string | null
          quantity: number
          reason: string | null
          replacement_product_id: string | null
          replacement_unit_price: number | null
          replacement_variant_id: string | null
          restocked: boolean
          restocked_at: string | null
          restocked_by: string | null
          restocked_quantity: number
          restocked_to_branch_id: string | null
          return_id: string
          total_price: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          action_type?: string
          brand_id: string
          condition?: string
          created_at?: string
          id?: string
          inspection_notes?: string | null
          item_images?: string[] | null
          order_item_id: string
          product_id?: string | null
          quantity: number
          reason?: string | null
          replacement_product_id?: string | null
          replacement_unit_price?: number | null
          replacement_variant_id?: string | null
          restocked?: boolean
          restocked_at?: string | null
          restocked_by?: string | null
          restocked_quantity?: number
          restocked_to_branch_id?: string | null
          return_id: string
          total_price?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          action_type?: string
          brand_id?: string
          condition?: string
          created_at?: string
          id?: string
          inspection_notes?: string | null
          item_images?: string[] | null
          order_item_id?: string
          product_id?: string | null
          quantity?: number
          reason?: string | null
          replacement_product_id?: string | null
          replacement_unit_price?: number | null
          replacement_variant_id?: string | null
          restocked?: boolean
          restocked_at?: string | null
          restocked_by?: string | null
          restocked_quantity?: number
          restocked_to_branch_id?: string | null
          return_id?: string
          total_price?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_replacement_product_id_fkey"
            columns: ["replacement_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_replacement_variant_id_fkey"
            columns: ["replacement_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_restocked_to_branch_id_fkey"
            columns: ["restocked_to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      return_notification_events: {
        Row: {
          attempts: number
          brand_id: string
          channel: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json | null
          recipient: string
          return_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          recipient: string
          return_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          recipient?: string
          return_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_notification_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_notification_events_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          admin_notes: string | null
          brand_id: string
          completed_at: string | null
          courier_name: string | null
          created_at: string
          customer_id: string | null
          exchange_difference_direction: string | null
          exchange_difference_status: string | null
          exchange_price_difference: number
          id: string
          images: string[] | null
          inspected_at: string | null
          inspected_by: string | null
          net_refund_amount: number
          order_id: string
          pickup_address: Json | null
          preferred_compensation: string
          pro_rated_discount_deduction: number
          reason: string
          reason_details: string | null
          received_at: string | null
          received_by: string | null
          refund_method: string | null
          refund_processed_at: string | null
          refund_reference: string | null
          refund_status: string
          rejection_reason: string | null
          replacement_order_id: string | null
          requested_by: string
          requested_by_user_id: string | null
          return_fee: number
          return_number: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tax_refund: number
          total_item_refund: number
          tracking_number: string | null
          type: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          brand_id: string
          completed_at?: string | null
          courier_name?: string | null
          created_at?: string
          customer_id?: string | null
          exchange_difference_direction?: string | null
          exchange_difference_status?: string | null
          exchange_price_difference?: number
          id?: string
          images?: string[] | null
          inspected_at?: string | null
          inspected_by?: string | null
          net_refund_amount?: number
          order_id: string
          pickup_address?: Json | null
          preferred_compensation?: string
          pro_rated_discount_deduction?: number
          reason: string
          reason_details?: string | null
          received_at?: string | null
          received_by?: string | null
          refund_method?: string | null
          refund_processed_at?: string | null
          refund_reference?: string | null
          refund_status?: string
          rejection_reason?: string | null
          replacement_order_id?: string | null
          requested_by?: string
          requested_by_user_id?: string | null
          return_fee?: number
          return_number: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tax_refund?: number
          total_item_refund?: number
          tracking_number?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          brand_id?: string
          completed_at?: string | null
          courier_name?: string | null
          created_at?: string
          customer_id?: string | null
          exchange_difference_direction?: string | null
          exchange_difference_status?: string | null
          exchange_price_difference?: number
          id?: string
          images?: string[] | null
          inspected_at?: string | null
          inspected_by?: string | null
          net_refund_amount?: number
          order_id?: string
          pickup_address?: Json | null
          preferred_compensation?: string
          pro_rated_discount_deduction?: number
          reason?: string
          reason_details?: string | null
          received_at?: string | null
          received_by?: string | null
          refund_method?: string | null
          refund_processed_at?: string | null
          refund_reference?: string | null
          refund_status?: string
          rejection_reason?: string | null
          replacement_order_id?: string | null
          requested_by?: string
          requested_by_user_id?: string | null
          return_fee?: number
          return_number?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tax_refund?: number
          total_item_refund?: number
          tracking_number?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          advance_mode: string
          code: string
          created_at: string
          cursor_index: number
          cursor_phase: string
          id: string
          phase_started_at: string | null
          quiz_id: string
          started_at: string | null
          status: string
          team_colors: Json | null
          team_count: number
          team_mode: string
          team_names: Json | null
        }
        Insert: {
          advance_mode?: string
          code: string
          created_at?: string
          cursor_index?: number
          cursor_phase?: string
          id?: string
          phase_started_at?: string | null
          quiz_id: string
          started_at?: string | null
          status?: string
          team_colors?: Json | null
          team_count?: number
          team_mode?: string
          team_names?: Json | null
        }
        Update: {
          advance_mode?: string
          code?: string
          created_at?: string
          cursor_index?: number
          cursor_phase?: string
          id?: string
          phase_started_at?: string | null
          quiz_id?: string
          started_at?: string | null
          status?: string
          team_colors?: Json | null
          team_count?: number
          team_mode?: string
          team_names?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_addons: {
        Row: {
          code: string
          created_at: string
          currency: string
          description_ar: string | null
          description_en: string | null
          grant_numeric_amount: number
          grant_type: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          price_annual: number
          price_monthly: number
          sort_order: number
          target_feature_key: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          grant_numeric_amount?: number
          grant_type: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          price_annual?: number
          price_monthly?: number
          sort_order?: number
          target_feature_key: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description_ar?: string | null
          description_en?: string | null
          grant_numeric_amount?: number
          grant_type?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          price_annual?: number
          price_monthly?: number
          sort_order?: number
          target_feature_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_addons_target_feature_key_fkey"
            columns: ["target_feature_key"]
            isOneToOne: false
            referencedRelation: "saas_features"
            referencedColumns: ["key"]
          },
        ]
      }
      saas_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          brand_id: string | null
          changes: Json
          created_at: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          brand_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          brand_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_audit_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_features: {
        Row: {
          category: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          key: string
          name_ar: string
          name_en: string
          sort_order: number
          unit: string | null
          value_type: string
        }
        Insert: {
          category: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          key: string
          name_ar: string
          name_en: string
          sort_order?: number
          unit?: string | null
          value_type: string
        }
        Update: {
          category?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          key?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
          unit?: string | null
          value_type?: string
        }
        Relationships: []
      }
      saas_plan_features: {
        Row: {
          boolean_value: boolean | null
          created_at: string
          feature_key: string
          id: string
          numeric_value: number | null
          plan_version_id: string
        }
        Insert: {
          boolean_value?: boolean | null
          created_at?: string
          feature_key: string
          id?: string
          numeric_value?: number | null
          plan_version_id: string
        }
        Update: {
          boolean_value?: boolean | null
          created_at?: string
          feature_key?: string
          id?: string
          numeric_value?: number | null
          plan_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "saas_features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "saas_plan_features_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "saas_plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plan_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_until: string | null
          id: string
          is_current: boolean
          plan_id: string
          price_annual: number
          price_monthly: number
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_current?: boolean
          plan_id: string
          price_annual?: number
          price_monthly?: number
          version_number?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_current?: boolean
          plan_id?: string
          price_annual?: number
          price_monthly?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "saas_plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          badge_color: string | null
          code: string
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          is_active: boolean
          is_public: boolean
          name_ar: string
          name_en: string
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          badge_color?: string | null
          code: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name_ar: string
          name_en: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          badge_color?: string | null
          code?: string
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          name_ar?: string
          name_en?: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      saas_usage_events: {
        Row: {
          brand_id: string
          id: string
          idempotency_key: string | null
          metadata: Json
          metric_key: string
          quantity: number
          recorded_at: string
        }
        Insert: {
          brand_id: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          metric_key: string
          quantity?: number
          recorded_at?: string
        }
        Update: {
          brand_id?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          metric_key?: string
          quantity?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_usage_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_usage_snapshots: {
        Row: {
          brand_id: string
          created_at: string
          current_usage: number
          id: string
          last_consumed_at: string
          limit_100_sent_at: string | null
          metric_key: string
          period_end: string
          period_start: string
          updated_at: string
          warning_80_sent_at: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          current_usage?: number
          id?: string
          last_consumed_at?: string
          limit_100_sent_at?: string | null
          metric_key: string
          period_end: string
          period_start: string
          updated_at?: string
          warning_80_sent_at?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          current_usage?: number
          id?: string
          last_consumed_at?: string
          limit_100_sent_at?: string | null
          metric_key?: string
          period_end?: string
          period_start?: string
          updated_at?: string
          warning_80_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saas_usage_snapshots_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_carts: {
        Row: {
          brand_id: string | null
          brand_slug: string
          code: string
          created_at: string
          expires_at: string
          id: string
          items: Json
        }
        Insert: {
          brand_id?: string | null
          brand_slug: string
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          items: Json
        }
        Update: {
          brand_id?: string | null
          brand_slug?: string
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shared_carts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credits: {
        Row: {
          amount: number
          brand_id: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          order_id: string | null
          return_id: string | null
          type: string
        }
        Insert: {
          amount: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          return_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          return_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credits_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credits_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      system_audit_logs: {
        Row: {
          action_type: string
          created_at: string
          id: string
          operator_id: string
          reason: string | null
          target_tenant_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          operator_id: string
          reason?: string | null
          target_tenant_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          operator_id?: string
          reason?: string | null
          target_tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_audit_logs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_audit_logs_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          id: string
          metrics: Json
          service: string
          status: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          metrics?: Json
          service: string
          status: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          metrics?: Json
          service?: string
          status?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          base_price_bhd: number
          benefit_pay_qr_url: string | null
          discount_price_bhd: number | null
          id: number
          merchant_account_name: string
          platform_icon_url: string | null
          subscription_iban: string
          superadmin_impersonation_mutation_allowed: boolean
          updated_at: string
          whatsapp_support_number: string
        }
        Insert: {
          base_price_bhd?: number
          benefit_pay_qr_url?: string | null
          discount_price_bhd?: number | null
          id?: number
          merchant_account_name?: string
          platform_icon_url?: string | null
          subscription_iban?: string
          superadmin_impersonation_mutation_allowed?: boolean
          updated_at?: string
          whatsapp_support_number?: string
        }
        Update: {
          base_price_bhd?: number
          benefit_pay_qr_url?: string | null
          discount_price_bhd?: number | null
          id?: number
          merchant_account_name?: string
          platform_icon_url?: string | null
          subscription_iban?: string
          superadmin_impersonation_mutation_allowed?: boolean
          updated_at?: string
          whatsapp_support_number?: string
        }
        Relationships: []
      }
      tenant_requests: {
        Row: {
          benefit_receipt_url: string | null
          billing_interval: string | null
          business_type: string | null
          contact_number: string
          created_at: string
          desired_subdomain: string
          email: string
          full_name: string
          id: string
          payment_verified: boolean
          quoted_currency: string | null
          quoted_price: number | null
          request_type: string
          selected_plan_id: string | null
          selected_plan_snapshot: Json | null
          selected_plan_version_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          benefit_receipt_url?: string | null
          billing_interval?: string | null
          business_type?: string | null
          contact_number: string
          created_at?: string
          desired_subdomain: string
          email: string
          full_name: string
          id?: string
          payment_verified?: boolean
          quoted_currency?: string | null
          quoted_price?: number | null
          request_type: string
          selected_plan_id?: string | null
          selected_plan_snapshot?: Json | null
          selected_plan_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          benefit_receipt_url?: string | null
          billing_interval?: string | null
          business_type?: string | null
          contact_number?: string
          created_at?: string
          desired_subdomain?: string
          email?: string
          full_name?: string
          id?: string
          payment_verified?: boolean
          quoted_currency?: string | null
          quoted_price?: number | null
          request_type?: string
          selected_plan_id?: string | null
          selected_plan_snapshot?: Json | null
          selected_plan_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_requests_selected_plan_id_fkey"
            columns: ["selected_plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_requests_selected_plan_version_id_fkey"
            columns: ["selected_plan_version_id"]
            isOneToOne: false
            referencedRelation: "saas_plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_answers: {
        Row: {
          created_at: string | null
          game_session_id: string | null
          id: string
          is_correct: boolean
          player_id: string | null
          question_id: string | null
          response_time_ms: number | null
        }
        Insert: {
          created_at?: string | null
          game_session_id?: string | null
          id?: string
          is_correct?: boolean
          player_id?: string | null
          question_id?: string | null
          response_time_ms?: number | null
        }
        Update: {
          created_at?: string | null
          game_session_id?: string | null
          id?: string
          is_correct?: boolean
          player_id?: string | null
          question_id?: string | null
          response_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_answers_game_session_id_fkey"
            columns: ["game_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          created_at: string
          customer_email: string | null
          expires_at: string | null
          id: string
          payhip_customer_id: string | null
          payhip_subscription_id: string | null
          plan_type: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          expires_at?: string | null
          id?: string
          payhip_customer_id?: string | null
          payhip_subscription_id?: string | null
          plan_type?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          expires_at?: string | null
          id?: string
          payhip_customer_id?: string | null
          payhip_subscription_id?: string | null
          plan_type?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          brand_id: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tax_number: string | null
        }
        Insert: {
          brand_id: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tax_number?: string | null
        }
        Update: {
          brand_id?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tax_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_integrations: {
        Row: {
          brand_id: string
          business_phone: string | null
          created_at: string
          default_language: string
          display_name: string | null
          enabled: boolean
          graph_api_version: string
          id: string
          last_inbound_at: string | null
          phone_number_id: string | null
          provider: string
          updated_at: string
          waba_id: string | null
        }
        Insert: {
          brand_id: string
          business_phone?: string | null
          created_at?: string
          default_language?: string
          display_name?: string | null
          enabled?: boolean
          graph_api_version?: string
          id?: string
          last_inbound_at?: string | null
          phone_number_id?: string | null
          provider?: string
          updated_at?: string
          waba_id?: string | null
        }
        Update: {
          brand_id?: string
          business_phone?: string | null
          created_at?: string
          default_language?: string
          display_name?: string | null
          enabled?: boolean
          graph_api_version?: string
          id?: string
          last_inbound_at?: string | null
          phone_number_id?: string | null
          provider?: string
          updated_at?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_integrations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          brand_id: string
          created_at: string
          event_type: string
          id: string
          language: string
          last_error: string | null
          next_attempt_at: string
          order_id: string | null
          parameters: Json
          provider_message_id: string | null
          provider_status_at: string | null
          recipient: string
          status: string
          template_name: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          brand_id: string
          created_at?: string
          event_type: string
          id?: string
          language: string
          last_error?: string | null
          next_attempt_at?: string
          order_id?: string | null
          parameters?: Json
          provider_message_id?: string | null
          provider_status_at?: string | null
          recipient: string
          status?: string
          template_name: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          brand_id?: string
          created_at?: string
          event_type?: string
          id?: string
          language?: string
          last_error?: string | null
          next_attempt_at?: string
          order_id?: string | null
          parameters?: Json
          provider_message_id?: string | null
          provider_status_at?: string | null
          recipient?: string
          status?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          active: boolean
          brand_id: string
          created_at: string
          event_type: string
          id: string
          language: string
          meta_template_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          created_at?: string
          event_type: string
          id?: string
          language: string
          meta_template_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          created_at?: string
          event_type?: string
          id?: string
          language?: string
          meta_template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          brand_id: string | null
          event_key: string
          event_kind: string
          received_at: string
        }
        Insert: {
          brand_id?: string | null
          event_key: string
          event_kind: string
          received_at?: string
        }
        Update: {
          brand_id?: string | null
          event_key?: string
          event_kind?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_app_builds: {
        Row: {
          apk_object_key: string | null
          apk_sha256: string | null
          apk_size_bytes: number | null
          apk_url: string | null
          app_id: string
          brand_id: string
          build_token_expires_at: string | null
          build_token_hash: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          provider: string
          provider_run_id: string | null
          provider_run_url: string | null
          release_notes: string | null
          requested_by: string | null
          started_at: string | null
          status: string
          validation_results: Json
          version_code: number
          version_name: string
        }
        Insert: {
          apk_object_key?: string | null
          apk_sha256?: string | null
          apk_size_bytes?: number | null
          apk_url?: string | null
          app_id: string
          brand_id: string
          build_token_expires_at?: string | null
          build_token_hash?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string
          provider_run_id?: string | null
          provider_run_url?: string | null
          release_notes?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: string
          validation_results?: Json
          version_code: number
          version_name: string
        }
        Update: {
          apk_object_key?: string | null
          apk_sha256?: string | null
          apk_size_bytes?: number | null
          apk_url?: string | null
          app_id?: string
          brand_id?: string
          build_token_expires_at?: string | null
          build_token_hash?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string
          provider_run_id?: string | null
          provider_run_url?: string | null
          release_notes?: string | null
          requested_by?: string | null
          started_at?: string | null
          status?: string
          validation_results?: Json
          version_code?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_app_builds_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "white_label_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "white_label_app_builds_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "white_label_apps_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "white_label_app_builds_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_apps: {
        Row: {
          android_package: string
          app_name: string
          background_color: string
          brand_id: string
          created_at: string
          firebase_android_app_id: string | null
          firebase_config: Json | null
          firebase_project_id: string | null
          icon_url: string | null
          id: string
          last_error: string | null
          latest_apk_url: string | null
          latest_build_id: string | null
          primary_color: string
          provisioned_at: string | null
          splash_logo_url: string | null
          status: string
          storefront_url: string
          updated_at: string
          version_code: number
          version_name: string
        }
        Insert: {
          android_package: string
          app_name: string
          background_color?: string
          brand_id: string
          created_at?: string
          firebase_android_app_id?: string | null
          firebase_config?: Json | null
          firebase_project_id?: string | null
          icon_url?: string | null
          id?: string
          last_error?: string | null
          latest_apk_url?: string | null
          latest_build_id?: string | null
          primary_color?: string
          provisioned_at?: string | null
          splash_logo_url?: string | null
          status?: string
          storefront_url: string
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Update: {
          android_package?: string
          app_name?: string
          background_color?: string
          brand_id?: string
          created_at?: string
          firebase_android_app_id?: string | null
          firebase_config?: Json | null
          firebase_project_id?: string | null
          icon_url?: string | null
          id?: string
          last_error?: string | null
          latest_apk_url?: string | null
          latest_build_id?: string | null
          primary_color?: string
          provisioned_at?: string | null
          splash_logo_url?: string | null
          status?: string
          storefront_url?: string
          updated_at?: string
          version_code?: number
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_apps_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      brand_public_settings: {
        Row: {
          announcement_audience: string | null
          announcement_bg: string | null
          announcement_bold: boolean | null
          announcement_dismissible: boolean | null
          announcement_enabled: boolean | null
          announcement_fg: string | null
          announcement_italic: boolean | null
          announcement_scope: string | null
          announcement_text_ar: string | null
          announcement_text_en: string | null
          background_color: string | null
          badge_accent: string | null
          benefit_enabled: boolean | null
          benefit_qr_url: string | null
          best_sellers_title_ar: string | null
          best_sellers_title_en: string | null
          brand_id: string | null
          btn_checkout_bg: string | null
          btn_checkout_fg: string | null
          btn_primary_bg: string | null
          btn_primary_fg: string | null
          btn_secondary_bg: string | null
          btn_secondary_fg: string | null
          business_name: string | null
          card_enabled: boolean | null
          cart_drawer_checkout_bg: string | null
          cart_drawer_checkout_fg: string | null
          category_banner_background_url: string | null
          cod_enabled: boolean | null
          currency: string | null
          delivery_enabled: boolean | null
          delivery_fee: number | null
          digital_delivery_enabled: boolean | null
          favicon_url: string | null
          font_family: string | null
          font_url: string | null
          footer_bg: string | null
          footer_fg: string | null
          footer_note: string | null
          global_sale_badges_enabled: boolean | null
          header_bg: string | null
          header_fg: string | null
          header_glass: boolean | null
          heading_color: string | null
          hero_title_align: string | null
          hero_title_ar: string | null
          hero_title_color: string | null
          hero_title_en: string | null
          hero_title_size: number | null
          home_promo_cards: Json | null
          homepage_editorial_sections: Json | null
          link_color: string | null
          logo_align: string | null
          logo_size: number | null
          logo_url: string | null
          menu_bg: string | null
          menu_fg: string | null
          menu_show_account: boolean | null
          menu_show_home: boolean | null
          menu_show_orders: boolean | null
          menu_show_pages: boolean | null
          menu_title_ar: string | null
          menu_title_en: string | null
          new_arrivals_title_ar: string | null
          new_arrivals_title_en: string | null
          pages: Json | null
          pickup_enabled: boolean | null
          primary_color: string | null
          secondary_banner_parallax_breakpoint: number | null
          secondary_banner_parallax_enabled: boolean | null
          secondary_banner_parallax_mobile_enabled: boolean | null
          shipping_zones: Json | null
          show_best_sellers: boolean | null
          show_footer_name: boolean | null
          show_header_name: boolean | null
          show_hero_about: boolean | null
          show_hero_title: boolean | null
          show_new_arrivals: boolean | null
          socials: Json | null
          storefront_accent_color: string | null
          storefront_background_color: string | null
          storefront_font_ar: string | null
          storefront_font_ar_url: string | null
          storefront_font_en: string | null
          storefront_font_en_url: string | null
          storefront_loader_text_ar: string | null
          storefront_loader_text_en: string | null
          storefront_radius: string | null
          storefront_text_color: string | null
          storefront_typography: Json | null
          text_color: string | null
          trending_banner_background_url: string | null
          vat_inclusive: boolean | null
          whatsapp_enabled: boolean | null
          whatsapp_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_app_releases_public: {
        Row: {
          app_key: string | null
          artifact_url: string | null
          build_number: number | null
          created_at: string | null
          id: string | null
          install_method: string | null
          platform: string | null
          release_notes: string | null
          sha256: string | null
          size_bytes: number | null
          version_name: string | null
        }
        Insert: {
          app_key?: string | null
          artifact_url?: string | null
          build_number?: number | null
          created_at?: string | null
          id?: string | null
          install_method?: string | null
          platform?: string | null
          release_notes?: string | null
          sha256?: string | null
          size_bytes?: number | null
          version_name?: string | null
        }
        Update: {
          app_key?: string | null
          artifact_url?: string | null
          build_number?: number | null
          created_at?: string | null
          id?: string | null
          install_method?: string | null
          platform?: string | null
          release_notes?: string | null
          sha256?: string | null
          size_bytes?: number | null
          version_name?: string | null
        }
        Relationships: []
      }
      white_label_app_builds_public: {
        Row: {
          apk_sha256: string | null
          apk_size_bytes: number | null
          apk_url: string | null
          app_id: string | null
          brand_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          provider: string | null
          provider_run_id: string | null
          provider_run_url: string | null
          release_notes: string | null
          started_at: string | null
          status: string | null
          validation_results: Json | null
          version_code: number | null
          version_name: string | null
        }
        Insert: {
          apk_sha256?: string | null
          apk_size_bytes?: number | null
          apk_url?: string | null
          app_id?: string | null
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          provider?: string | null
          provider_run_id?: string | null
          provider_run_url?: string | null
          release_notes?: string | null
          started_at?: string | null
          status?: string | null
          validation_results?: Json | null
          version_code?: number | null
          version_name?: string | null
        }
        Update: {
          apk_sha256?: string | null
          apk_size_bytes?: number | null
          apk_url?: string | null
          app_id?: string | null
          brand_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          provider?: string | null
          provider_run_id?: string | null
          provider_run_url?: string | null
          release_notes?: string | null
          started_at?: string | null
          status?: string | null
          validation_results?: Json | null
          version_code?: number | null
          version_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "white_label_app_builds_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "white_label_apps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "white_label_app_builds_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "white_label_apps_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "white_label_app_builds_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_apps_public: {
        Row: {
          android_package: string | null
          app_name: string | null
          background_color: string | null
          brand_id: string | null
          created_at: string | null
          icon_url: string | null
          id: string | null
          latest_apk_url: string | null
          latest_build_id: string | null
          primary_color: string | null
          provisioned_at: string | null
          splash_logo_url: string | null
          status: string | null
          storefront_url: string | null
          updated_at: string | null
          version_code: number | null
          version_name: string | null
        }
        Insert: {
          android_package?: string | null
          app_name?: string | null
          background_color?: string | null
          brand_id?: string | null
          created_at?: string | null
          icon_url?: string | null
          id?: string | null
          latest_apk_url?: string | null
          latest_build_id?: string | null
          primary_color?: string | null
          provisioned_at?: string | null
          splash_logo_url?: string | null
          status?: string | null
          storefront_url?: string | null
          updated_at?: string | null
          version_code?: number | null
          version_name?: string | null
        }
        Update: {
          android_package?: string | null
          app_name?: string | null
          background_color?: string | null
          brand_id?: string | null
          created_at?: string | null
          icon_url?: string | null
          id?: string | null
          latest_apk_url?: string | null
          latest_build_id?: string | null
          primary_color?: string | null
          provisioned_at?: string | null
          splash_logo_url?: string | null
          status?: string | null
          storefront_url?: string | null
          updated_at?: string | null
          version_code?: number | null
          version_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "white_label_apps_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_storefront_membership: {
        Args: { p_brand_slug: string; p_name?: string; p_phone?: string }
        Returns: Json
      }
      activate_white_label_build: {
        Args: { p_build_id: string }
        Returns: undefined
      }
      advance_room: {
        Args: {
          p_expect_index: number
          p_expect_phase: string
          p_room_id: string
        }
        Returns: {
          advance_mode: string
          code: string
          created_at: string
          cursor_index: number
          cursor_phase: string
          id: string
          phase_started_at: string | null
          quiz_id: string
          started_at: string | null
          status: string
          team_colors: Json | null
          team_count: number
          team_mode: string
          team_names: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_whatsapp_delivery_status: {
        Args: {
          p_error?: string
          p_provider_message_id: string
          p_status: string
          p_status_at: string
        }
        Returns: string
      }
      approve_benefit_payment: { Args: { p_order_id: string }; Returns: Json }
      archive_room: { Args: { p_room_id: string }; Returns: boolean }
      assign_order_courier: {
        Args: { p_courier_id: string; p_order_id: string }
        Returns: undefined
      }
      can_access_brand: { Args: { _brand_id: string }; Returns: boolean }
      check_registered_customer_exists: {
        Args: { p_brand_id: string; p_email: string; p_phone: string }
        Returns: boolean
      }
      check_user_hosting_eligibility: { Args: never; Returns: Json }
      claim_daily_hosted_quiz: { Args: never; Returns: Json }
      claim_order_email_event: {
        Args: { p_event_id: string }
        Returns: {
          event_type: string
          language: string
          order_id: string
        }[]
      }
      claim_whatsapp_outbox_event: {
        Args: { p_event_id: string }
        Returns: {
          brand_id: string
          event_id: string
          graph_api_version: string
          language: string
          parameters: Json
          phone_number_id: string
          recipient: string
          template_name: string
        }[]
      }
      consume_api_quota: {
        Args: { p_action: string; p_limit: number; p_window_minutes: number }
        Returns: boolean
      }
      copy_brand_packaging_bom_to_product: {
        Args: { p_brand_id: string; p_product_id: string }
        Returns: undefined
      }
      courier_can_read_address: {
        Args: { p_address_id: string; p_customer_id: string }
        Returns: boolean
      }
      courier_can_read_customer: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      courier_can_read_order: { Args: { p_order_id: string }; Returns: boolean }
      courier_complete_delivery: {
        Args: {
          p_collected_amount?: number
          p_notes?: string
          p_order_id: string
        }
        Returns: Json
      }
      courier_update_delivery:
        | {
            Args: {
              p_cod_collected: boolean
              p_collected_amount?: number
              p_courier_id: string
              p_notes?: string
              p_order_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_cod_amount?: number
              p_cod_collected?: boolean
              p_notes?: string
              p_order_id: string
              p_status: string
            }
            Returns: Json
          }
      create_customer_push_campaign: {
        Args: {
          p_body: string
          p_brand_id: string
          p_customer_id?: string
          p_target_url?: string
          p_title: string
        }
        Returns: string
      }
      create_tenant_with_defaults: {
        Args: {
          p_business_type?: string
          p_name_ar: string
          p_name_en: string
          p_owner_id: string
          p_primary_color: string
          p_slug: string
        }
        Returns: string
      }
      current_brand_id: { Args: never; Returns: string }
      delete_brand: {
        Args: { p_brand_id: string; p_hard?: boolean }
        Returns: Json
      }
      delete_brand_customers: {
        Args: { p_brand_id: string; p_customer_ids: string[] }
        Returns: Json
      }
      delete_category: { Args: { p_id: string }; Returns: Json }
      delete_integration_credential: {
        Args: { p_brand_id: string; p_id: string }
        Returns: boolean
      }
      dispatch_order_email_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      enqueue_order_email_event: {
        Args: { p_brand_id: string; p_event_type: string; p_order_id: string }
        Returns: undefined
      }
      enqueue_order_whatsapp_event: {
        Args: { p_event_type: string; p_order_id: string }
        Returns: undefined
      }
      format_currency_amount: {
        Args: { p_amount: number; p_currency: string }
        Returns: string
      }
      format_localized_order_status: {
        Args: {
          p_fulfillment_status: string
          p_payment_status: string
          p_status: string
        }
        Returns: string
      }
      get_all_admin_quizzes: { Args: never; Returns: Json }
      get_courier_delivery_message: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_integration_credential_secret: {
        Args: { p_brand_id: string; p_provider: string }
        Returns: {
          api_key: string
          base_url: string
          is_active: boolean
          webhook_secret: string
        }[]
      }
      get_onboarding_active_price: { Args: never; Returns: string }
      get_public_benefit_settings: {
        Args: { p_brand_id: string }
        Returns: {
          benefit_account_number: string
        }[]
      }
      get_public_branches: {
        Args: { p_brand_id: string }
        Returns: {
          id: string
          location_ar: string
          location_en: string
          name_ar: string
          name_en: string
          notes_ar: string
          notes_en: string
        }[]
      }
      get_public_order_review: {
        Args: { p_token: string }
        Returns: {
          brand_logo_url: string
          brand_name: string
          brand_whatsapp_number: string
          customer_name: string
          invoice_number: number
          reward_code: string
          state: string
        }[]
      }
      get_room_by_code: {
        Args: { p_code: string }
        Returns: {
          advance_mode: string
          code: string
          created_at: string
          cursor_index: number
          cursor_phase: string
          id: string
          phase_started_at: string | null
          quiz_id: string
          started_at: string | null
          status: string
          team_colors: Json | null
          team_count: number
          team_mode: string
          team_names: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "rooms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_storefront_best_sellers: {
        Args: { p_brand_slug: string; p_limit?: number }
        Returns: {
          product_id: string
          units_sold: number
        }[]
      }
      get_storefront_page_data: {
        Args: { p_brand_slug: string }
        Returns: Json
      }
      get_storefront_trending: {
        Args: { p_brand_slug: string; p_limit?: number }
        Returns: {
          engagement_score: number
          manually_featured: boolean
          product_id: string
        }[]
      }
      has_permission: { Args: { p_permission: string }; Returns: boolean }
      has_storefront_membership: {
        Args: { p_brand_slug: string }
        Returns: boolean
      }
      is_active: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_brand_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_subdomain_available: {
        Args: { p_subdomain: string }
        Returns: boolean
      }
      join_room: {
        Args: { p_avatar_color?: string; p_code: string; p_nickname: string }
        Returns: {
          avatar_color: string
          fifty_hidden: number[] | null
          fifty_question_id: string | null
          id: string
          joined_at: string
          nickname: string
          room_id: string
          team_index: number | null
          used_double: boolean | null
          used_fifty: boolean | null
        }
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      link_storefront_customer: {
        Args: { p_brand_slug: string; p_name?: string; p_phone?: string }
        Returns: Json
      }
      list_brand_email_notifications: {
        Args: { p_brand_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          channel: string
          created_at: string
          error_message: string
          event_type: string
          id: string
          invoice_number: number
          order_id: string
          provider: string
          recipient: string
          status: string
        }[]
      }
      list_brand_order_reviews: {
        Args: { p_brand_id: string }
        Returns: {
          comment: string
          customer_name: string
          customer_phone: string
          highlights: string[]
          invoice_number: number
          order_id: string
          rating: number
          request_id: string
          request_sent_at: string
          review_id: string
          reviewed_at: string
          reward_code: string
        }[]
      }
      list_integration_credentials: {
        Args: { p_brand_id: string }
        Returns: {
          api_key_masked: string
          base_url: string
          brand_id: string
          has_api_key: boolean
          has_webhook_secret: boolean
          id: string
          is_active: boolean
          notes: string
          provider: string
          updated_at: string
          webhook_secret_masked: string
        }[]
      }
      list_ready_order_review_requests: {
        Args: { p_brand_id: string }
        Returns: {
          customer_name: string
          customer_phone: string
          eligible_at: string
          invoice_number: number
          order_id: string
          request_id: string
          request_status: string
          review_url_token: string
        }[]
      }
      normalize_customer_email: { Args: { p_value: string }; Returns: string }
      normalize_customer_phone: { Args: { p_value: string }; Returns: string }
      normalize_whatsapp_recipient: {
        Args: { p_value: string }
        Returns: string
      }
      place_storefront_order:
        | {
            Args: {
              p_brand_slug: string
              p_customer: Json
              p_items: Json
              p_notes?: string
              p_payment_method: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_branch_id?: string
              p_brand_slug: string
              p_customer: Json
              p_fulfillment?: string
              p_items: Json
              p_notes?: string
              p_payment_method: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_branch_id?: string
              p_brand_slug: string
              p_customer: Json
              p_digital_channel?: string
              p_digital_contact?: string
              p_fulfillment?: string
              p_items: Json
              p_notes?: string
              p_payment_method: string
              p_promo_code?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_benefit_receipt_id?: string
              p_branch_id?: string
              p_brand_slug: string
              p_customer: Json
              p_digital_channel?: string
              p_digital_contact?: string
              p_fulfillment?: string
              p_items: Json
              p_notes?: string
              p_payment_method: string
              p_promo_code?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_benefit_receipt_id?: string
              p_branch_id?: string
              p_brand_slug: string
              p_customer: Json
              p_digital_channel?: string
              p_digital_contact?: string
              p_fulfillment?: string
              p_idempotency_key?: string
              p_items: Json
              p_notes?: string
              p_payment_method: string
              p_promo_code?: string
              p_shipping_fee?: number
              p_shipping_zone?: string
            }
            Returns: Json
          }
      place_storefront_order_core: {
        Args: {
          p_branch_id?: string
          p_brand_slug: string
          p_customer: Json
          p_digital_channel?: string
          p_digital_contact?: string
          p_fulfillment?: string
          p_items: Json
          p_notes?: string
          p_payment_method: string
          p_promo_code?: string
        }
        Returns: Json
      }
      place_storefront_order_internal_20260710: {
        Args: {
          p_branch_id?: string
          p_brand_slug: string
          p_customer: Json
          p_fulfillment?: string
          p_items: Json
          p_notes?: string
          p_payment_method: string
        }
        Returns: Json
      }
      prune_system_health_events: {
        Args: { p_retention_days?: number }
        Returns: number
      }
      reconcile_verified_tap_order: {
        Args: {
          p_brand_id: string
          p_charge_id: string
          p_order_id: string
          p_verified_status: string
        }
        Returns: boolean
      }
      record_incubator_payment: {
        Args: {
          p_amount: number
          p_incubator_id: string
          p_notes?: string
          p_payment_date?: string
          p_payment_method?: string
          p_reference?: string
        }
        Returns: string
      }
      record_incubator_sale: {
        Args: {
          p_incubator_id: string
          p_quantity: number
          p_sold_at?: string
          p_unit_price?: number
          p_variant_id: string
        }
        Returns: string
      }
      record_order_whatsapp_opt_in: {
        Args: { p_confirmation_token: string; p_order_id: string }
        Returns: boolean
      }
      record_storefront_product_engagement: {
        Args: { p_brand_slug: string; p_event?: string; p_product_id: string }
        Returns: undefined
      }
      register_customer_push_device: {
        Args: {
          p_brand_slug: string
          p_device_name?: string
          p_enabled?: boolean
          p_marketing?: boolean
          p_order_updates?: boolean
          p_platform?: string
          p_token: string
          p_token_provider?: string
        }
        Returns: string
      }
      register_mobile_push_device: {
        Args: {
          p_device_name?: string
          p_enabled?: boolean
          p_platform?: string
          p_preferences?: Json
          p_token: string
        }
        Returns: string
      }
      reject_benefit_payment:
        | { Args: { p_order_id: string }; Returns: Json }
        | { Args: { p_order_id: string; p_reason: string }; Returns: Json }
      reporting_brand_id: { Args: { p_brand_slug?: string }; Returns: string }
      request_white_label_rebuild: {
        Args: { p_brand_id: string }
        Returns: string
      }
      return_stock_from_incubator: {
        Args: {
          p_incubator_id: string
          p_notes?: string
          p_quantity: number
          p_variant_id: string
        }
        Returns: undefined
      }
      reverse_incubator_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: undefined
      }
      room_answers: {
        Args: { p_player_id?: string; p_room_id: string }
        Returns: {
          answered_at: string
          choice_index: number
          id: string
          is_correct: boolean
          player_id: string
          points_awarded: number
          powerup: string | null
          question_id: string
          room_id: string
          streak_bonus: number
        }[]
        SetofOptions: {
          from: "*"
          to: "answers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      room_players: {
        Args: { p_player_id?: string; p_room_id: string }
        Returns: {
          avatar_color: string
          fifty_hidden: number[] | null
          fifty_question_id: string | null
          id: string
          joined_at: string
          nickname: string
          room_id: string
          team_index: number | null
          used_double: boolean | null
          used_fifty: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      room_questions: {
        Args: { p_room_id: string }
        Returns: {
          explanation: string
          id: string
          image_url: string
          options: Json
          order_index: number
          question_text: string
          question_type: string
          quiz_id: string
          time_limit_seconds: number
        }[]
      }
      room_reveals: {
        Args: { p_room_id: string }
        Returns: {
          correct_index: number
          question_id: string
        }[]
      }
      rpc_award_order_loyalty_points: {
        Args: {
          p_brand_id: string
          p_idempotency_key: string
          p_order_id: string
        }
        Returns: Json
      }
      rpc_calculate_order_loyalty_points: {
        Args: {
          p_brand_id: string
          p_customer_id: string
          p_discount: number
          p_has_discounted_items?: boolean
          p_shipping: number
          p_subtotal: number
          p_tax: number
        }
        Returns: Json
      }
      rpc_check_entitlement: {
        Args: {
          _brand_id: string
          _feature_key: string
          _requested_amount?: number
        }
        Returns: Json
      }
      rpc_close_storefront_cart_session: {
        Args: { p_brand_id: string; p_session_id: string }
        Returns: Json
      }
      rpc_consume_usage: {
        Args: {
          _brand_id: string
          _idempotency_key?: string
          _metadata?: Json
          _metric_key: string
          _quantity?: number
        }
        Returns: Json
      }
      rpc_create_exchange_replacement_order: {
        Args: {
          p_brand_id: string
          p_replacement_items: Json
          p_return_id: string
        }
        Returns: Json
      }
      rpc_create_return_request: {
        Args: {
          p_brand_id: string
          p_images?: string[]
          p_items: Json
          p_order_id: string
          p_pickup_address?: Json
          p_preferred_compensation: string
          p_reason: string
          p_reason_details: string
          p_requested_by: string
        }
        Returns: Json
      }
      rpc_evaluate_brand_entitlements: {
        Args: { _brand_id: string }
        Returns: Json
      }
      rpc_evaluate_customer_loyalty_tier: {
        Args: { p_brand_id: string; p_customer_id: string }
        Returns: string
      }
      rpc_generate_abandoned_cart_recovery_coupon: {
        Args: {
          p_brand_id: string
          p_cart_id: string
          p_discount_type?: string
          p_discount_value?: number
          p_expiry_hours?: number
        }
        Returns: string
      }
      rpc_inspect_and_restock_return_item: {
        Args: {
          p_brand_id: string
          p_condition: string
          p_inspection_notes?: string
          p_restock_branch_id?: string
          p_return_item_id: string
        }
        Returns: Json
      }
      rpc_mark_cart_recovered_on_order: {
        Args: {
          p_brand_id: string
          p_customer_id?: string
          p_guest_email?: string
          p_guest_phone?: string
          p_order_id: string
          p_session_id?: string
        }
        Returns: Json
      }
      rpc_process_abandoned_carts: { Args: never; Returns: Json }
      rpc_process_return_loyalty_adjustment: {
        Args: {
          p_brand_id: string
          p_idempotency_key: string
          p_order_id: string
          p_pro_rated_points_to_refund: number
          p_pro_rated_points_to_revoke: number
          p_return_id: string
        }
        Returns: Json
      }
      rpc_process_return_refund: {
        Args: {
          p_brand_id: string
          p_notes?: string
          p_refund_amount: number
          p_refund_method: string
          p_refund_reference?: string
          p_return_id: string
        }
        Returns: Json
      }
      rpc_record_or_update_cart_activity: {
        Args: {
          p_brand_id: string
          p_cart_items?: Json
          p_currency?: string
          p_customer_id?: string
          p_guest_email?: string
          p_guest_name?: string
          p_guest_phone?: string
          p_marketing_consent?: boolean
          p_session_id: string
          p_subtotal?: number
        }
        Returns: Json
      }
      rpc_reporting_customers:
        | {
            Args: {
              p_brand_slug?: string
              p_end_date: string
              p_include_historical?: boolean
              p_limit?: number
              p_offset?: number
              p_start_date: string
              p_tz?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_end_date: string
              p_include_historical: boolean
              p_limit?: number
              p_offset?: number
              p_start_date: string
              p_tz: string
            }
            Returns: Json
          }
      rpc_reporting_expenses: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_start_date: string
          p_tz?: string
        }
        Returns: Json
      }
      rpc_reporting_export: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_report_type: string
          p_start_date: string
          p_tz?: string
        }
        Returns: Json
      }
      rpc_reporting_incubator_sales: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_interval?: string
          p_start_date: string
          p_tz?: string
        }
        Returns: Json
      }
      rpc_reporting_order_cogs: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_include_historical?: boolean
          p_start_date: string
        }
        Returns: Json
      }
      rpc_reporting_overview: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_include_historical?: boolean
          p_start_date: string
          p_tz?: string
        }
        Returns: Json
      }
      rpc_reporting_processed_returns: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_start_date: string
          p_tz?: string
        }
        Returns: Json
      }
      rpc_reporting_processing_fees: {
        Args: {
          p_brand_slug?: string
          p_end_date: string
          p_include_historical?: boolean
          p_start_date: string
        }
        Returns: Json
      }
      rpc_reporting_products_inventory:
        | {
            Args: {
              p_brand_slug?: string
              p_end_date: string
              p_include_historical?: boolean
              p_limit?: number
              p_offset?: number
              p_sort_by?: string
              p_start_date: string
              p_tz?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_end_date: string
              p_include_historical: boolean
              p_limit?: number
              p_offset?: number
              p_sort_by?: string
              p_start_date: string
              p_tz: string
            }
            Returns: Json
          }
      rpc_reporting_sales:
        | {
            Args: {
              p_brand_slug?: string
              p_end_date: string
              p_include_historical?: boolean
              p_interval?: string
              p_start_date: string
              p_tz?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_end_date: string
              p_include_historical: boolean
              p_interval: string
              p_start_date: string
              p_tz: string
            }
            Returns: Json
          }
      rpc_sync_legacy_brands_to_subscriptions: { Args: never; Returns: number }
      rpc_validate_and_redeem_loyalty_points: {
        Args: {
          p_brand_id: string
          p_customer_id: string
          p_idempotency_key: string
          p_order_id?: string
          p_order_subtotal: number
          p_points_to_redeem: number
        }
        Returns: Json
      }
      rpc_validate_and_restore_abandoned_cart: {
        Args: { p_brand_slug: string; p_recovery_token: string }
        Returns: Json
      }
      save_integration_credential: {
        Args: {
          p_api_key: string
          p_base_url: string
          p_brand_id: string
          p_id: string
          p_is_active: boolean
          p_notes: string
          p_provider: string
          p_webhook_secret: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snapshot_order_packaging_cogs: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      start_room_v2: { Args: { p_room_id: string }; Returns: Json }
      storefront_user_owns_customer: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      storefront_user_owns_order: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      submit_answer: {
        Args: {
          p_choice: number
          p_player_id: string
          p_powerup?: string
          p_question_id: string
        }
        Returns: {
          answered_at: string
          choice_index: number
          id: string
          is_correct: boolean
          player_id: string
          points_awarded: number
          powerup: string | null
          question_id: string
          room_id: string
          streak_bonus: number
        }
        SetofOptions: {
          from: "*"
          to: "answers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_public_order_review: {
        Args: {
          p_comment?: string
          p_highlights?: string[]
          p_rating: number
          p_token: string
        }
        Returns: string
      }
      sync_incubator_inventory_prices: {
        Args: { p_incubator_id?: string }
        Returns: number
      }
      sync_order_stock: { Args: { p_order_id: string }; Returns: undefined }
      transfer_stock_to_incubator: {
        Args: {
          p_commission_type?: string
          p_commission_value?: number
          p_external_code?: string
          p_incubator_id: string
          p_notes?: string
          p_price?: number
          p_quantity: number
          p_variant_id: string
        }
        Returns: string
      }
      update_incubator_inventory_item: {
        Args: {
          p_commission_type: string
          p_commission_value: number
          p_consignment_price: number
          p_external_code: string
          p_inventory_id: string
        }
        Returns: {
          brand_id: string
          commission_type: string
          commission_value: number
          consignment_price: number
          created_at: string
          external_code: string | null
          id: string
          incubator_id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "incubator_inventory"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_order_review_request_status: {
        Args: { p_request_id: string; p_status: string }
        Returns: boolean
      }
      upsert_admin_quiz:
        | {
            Args: {
              p_category?: string
              p_difficulty?: string
              p_is_public?: boolean
              p_language?: string
              p_subcategory?: string
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_category: string
              p_difficulty: string
              p_is_public: boolean
              p_language: string
              p_questions?: Json
              p_subcategory: string
              p_title: string
            }
            Returns: string
          }
      upsert_admin_quiz_by_id_or_title: {
        Args: {
          p_category?: string
          p_difficulty?: string
          p_is_public?: boolean
          p_language?: string
          p_quiz_id?: string
          p_subcategory?: string
          p_title?: string
        }
        Returns: string
      }
      use_fifty_fifty: {
        Args: { p_player_id: string; p_question_id: string }
        Returns: number[]
      }
      validate_promo_code: {
        Args: {
          p_brand_slug: string
          p_code: string
          p_customer_id?: string
          p_items?: Json
          p_subtotal: number
        }
        Returns: Json
      }
      validate_promo_code_before_returning_customer_guard_20260825: {
        Args: {
          p_brand_slug: string
          p_code: string
          p_customer_id?: string
          p_items?: Json
          p_subtotal: number
        }
        Returns: Json
      }
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
