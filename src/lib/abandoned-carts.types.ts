export type CartRecoveryStatus =
  | "active"
  | "abandoned"
  | "recovering"
  | "recovered"
  | "expired"
  | "unsubscribed";

export type RecoveryChannel = "whatsapp" | "email" | "push";

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

export interface AbandonedCartSequence {
  id: string;
  brand_id: string;
  step_number: number;
  delay_hours: number;
  channel: RecoveryChannel;
  subject_ar: string;
  subject_en: string;
  message_template_ar: string;
  message_template_en: string;
  include_discount: boolean;
  discount_percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AbandonedCartDispatchLog {
  id: string;
  brand_id: string;
  cart_id: string;
  step_number: number;
  channel: RecoveryChannel;
  recipient: string;
  discount_code?: string | null;
  status: "sent" | "failed" | "skipped_opt_out" | "skipped_recovered";
  sent_at: string;
  idempotency_key: string;
  error_message?: string | null;
  created_at: string;
}

export const DEFAULT_ABANDONED_CART_SETTINGS: Omit<
  BrandAbandonedCartSettings,
  "brand_id" | "created_at" | "updated_at"
> = {
  is_enabled: true,
  abandonment_threshold_minutes: 30,
  max_recovery_messages: 3,
  cooldown_hours_between_messages: 12,
  enable_whatsapp: true,
  enable_email: true,
  enable_push: false,
  default_discount_type: "percentage",
  default_discount_value: 10,
  discount_expiry_hours: 48,
};

export const DEFAULT_ABANDONED_SEQUENCES: Omit<
  AbandonedCartSequence,
  "id" | "brand_id" | "created_at" | "updated_at"
>[] = [
  {
    step_number: 1,
    delay_hours: 1,
    channel: "whatsapp",
    subject_ar: "هل نسيت شيئاً في سلتك؟",
    subject_en: "Did you leave something behind?",
    message_template_ar:
      "مرحباً {name}، لقد لاحظنا أنك تركت منتجات رائعة في سلتك في {brand_name}. أكمل طلبك الآن قبل نفاد الكمية: {recovery_link}",
    message_template_en:
      "Hi {name}, you left great items in your cart at {brand_name}. Complete your checkout now before stocks run out: {recovery_link}",
    include_discount: false,
    discount_percent: 0,
    is_active: true,
  },
  {
    step_number: 2,
    delay_hours: 12,
    channel: "whatsapp",
    subject_ar: "هدية خاصة لك: خصم 10% على سلتك!",
    subject_en: "Special Treat: 10% Off Your Cart!",
    message_template_ar:
      "مرحباً {name}، إليك كود خصم حصري {discount_code} بقيمة 10% لإتمام سلتك خلال 48 ساعة فقط! استخدم الرابط: {recovery_link}",
    message_template_en:
      "Hi {name}, here is an exclusive 10% discount code {discount_code} valid for the next 48 hours! Checkout here: {recovery_link}",
    include_discount: true,
    discount_percent: 10,
    is_active: true,
  },
  {
    step_number: 3,
    delay_hours: 24,
    channel: "email",
    subject_ar: "الفرصة الأخيرة قبل انتهاء صلاحية سلتك وكود الخصم",
    subject_en: "Last chance before your cart reservation expires",
    message_template_ar:
      "عزيزي {name}، تنتهي صلاحية سلتك وكود الخصم قريباً جداً. اضغط هنا لاستعادة سلتك فوراً: {recovery_link}",
    message_template_en:
      "Dear {name}, your reserved items and discount code will expire very soon. Click here to resume: {recovery_link}",
    include_discount: true,
    discount_percent: 10,
    is_active: true,
  },
];
