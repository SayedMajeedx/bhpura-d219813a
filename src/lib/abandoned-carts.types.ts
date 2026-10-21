export type CartRecoveryStatus =
  | "active"
  | "abandoned"
  | "recovering"
  /** Abandoned, then ordered. */
  | "recovered"
  /** Ordered without ever being abandoned. */
  | "converted"
  | "expired"
  | "unsubscribed";

export interface CartLineSnapshot {
  cart_line_id: string;
  variant_id?: string | null;
  product_id: string;
  title: string;
  name?: string;
  price: number;
  unit_price?: number;
  qty: number;
  quantity?: number;
  line_total?: number;
  image?: string | null;
  image_url?: string | null;
  sku?: string | null;
  stock_available?: number;
}

export interface AbandonedCart {
  id: string;
  brand_id: string;
  customer_id?: string | null;
  session_id: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_name?: string | null;
  cart_items: CartLineSnapshot[];
  subtotal: number;
  currency: string;
  recovery_token: string;
  status: CartRecoveryStatus;
  marketing_consent: boolean;
  last_activity_at: string;
  abandoned_at?: string | null;
  recovery_attempts_count: number;
  last_recovery_sent_at?: string | null;
  recovered_at?: string | null;
  recovered_order_id?: string | null;
  recovery_discount_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandAbandonedCartSettings {
  brand_id: string;
  is_enabled: boolean;
  abandonment_threshold_minutes: number;
  max_recovery_messages: number;
  cooldown_hours_between_messages: number;
  enable_whatsapp: boolean;
  enable_email: boolean;
  enable_push: boolean;
  default_discount_type: "percentage" | "fixed" | "none";
  default_discount_value: number;
  discount_expiry_hours: number;
  created_at: string;
  updated_at: string;
}
