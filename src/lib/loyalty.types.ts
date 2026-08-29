export type LoyaltyTierKey = "bronze" | "silver" | "gold" | "vip";

export type LoyaltyEventType =
  | "earn_order"
  | "earn_review"
  | "earn_first_order"
  | "earn_referral"
  | "earn_manual"
  | "earn_welcome"
  | "redeem_checkout"
  | "refund_return"
  | "revoke_cancelled"
  | "expire_points"
  | "adjust_manual";

export type LoyaltyPointsStatus = "pending" | "active" | "redeemed" | "cancelled" | "expired";

export interface BrandLoyaltyProgram {
  id?: string;
  brand_id: string;
  is_enabled: boolean;
  points_per_currency_unit: number; // e.g. 10 pts per 1 BHD
  redemption_rate: number; // e.g. 0.010 (100 pts = 1 BHD)
  min_points_to_redeem: number; // e.g. 100
  min_redemption_points?: number; // alias
  max_redemption_percentage: number; // e.g. 50%
  max_redemption_percent?: number; // alias
  points_expiry_days: number; // 0 = never
  points_expiry_months?: number; // alias
  holding_period_days: number; // e.g. 14 days
  points_holding_days?: number; // alias
  include_shipping: boolean;
  include_tax: boolean;
  include_discounted_items: boolean;
  first_order_bonus_points: number;
  review_bonus_points: number;
  referral_bonus_points: number;
  welcome_bonus_points: number;
  tier_multipliers_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyTier {
  id: string;
  brand_id: string;
  tier_key: LoyaltyTierKey;
  name_ar: string;
  name_en: string;
  min_spend: number;
  min_points: number;
  points_multiplier: number;
  free_shipping: boolean;
  discount_percent: number;
  badge_color: string;
  perks_ar: string[];
  perks_en: string[];
  created_at: string;
  updated_at: string;
}

export interface LoyaltyAccount {
  id: string;
  brand_id: string;
  customer_id: string;
  active_points: number;
  pending_points: number;
  lifetime_points: number;
  lifetime_spent_points: number;
  current_tier_key: LoyaltyTierKey;
  tier_achieved_at: string;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyLedgerEntry {
  id: string;
  brand_id: string;
  customer_id: string;
  account_id: string;
  event_type: LoyaltyEventType;
  points: number;
  points_status: LoyaltyPointsStatus;
  order_id?: string | null;
  review_id?: string | null;
  effective_at: string;
  expires_at?: string | null;
  idempotency_key: string;
  reference_note_ar?: string | null;
  reference_note_en?: string | null;
  balance_after: number;
  created_by?: string | null;
  created_at: string;
}

export const DEFAULT_LOYALTY_PROGRAM: Omit<BrandLoyaltyProgram, "brand_id" | "created_at" | "updated_at"> = {
  is_enabled: true,
  points_per_currency_unit: 10,
  redemption_rate: 0.010,
  min_points_to_redeem: 100,
  max_redemption_percentage: 50,
  points_expiry_days: 365,
  holding_period_days: 14,
  include_shipping: false,
  include_tax: false,
  include_discounted_items: false,
  first_order_bonus_points: 50,
  review_bonus_points: 25,
  referral_bonus_points: 100,
  welcome_bonus_points: 20,
  tier_multipliers_enabled: true,
};

export const DEFAULT_LOYALTY_TIERS: Omit<LoyaltyTier, "id" | "brand_id" | "created_at" | "updated_at">[] = [
  {
    tier_key: "bronze",
    name_ar: "المستوى البرونزي",
    name_en: "Bronze Tier",
    min_spend: 0,
    min_points: 0,
    points_multiplier: 1.0,
    free_shipping: false,
    discount_percent: 0,
    badge_color: "#b45309",
    perks_ar: ["كسب 10 نقاط لكل 1 د.ب"],
    perks_en: ["Earn 10 points per 1 BHD"],
  },
  {
    tier_key: "silver",
    name_ar: "المستوى الفضي",
    name_en: "Silver Tier",
    min_spend: 100,
    min_points: 1000,
    points_multiplier: 1.25,
    free_shipping: false,
    discount_percent: 5,
    badge_color: "#94a3b8",
    perks_ar: ["مضاعف نقاط 1.25x", "خصم 5% حصري"],
    perks_en: ["1.25x Points multiplier", "Exclusive 5% discount"],
  },
  {
    tier_key: "gold",
    name_ar: "المستوى الذهبي",
    name_en: "Gold Tier",
    min_spend: 300,
    min_points: 3000,
    points_multiplier: 1.5,
    free_shipping: true,
    discount_percent: 10,
    badge_color: "#eab308",
    perks_ar: ["مضاعف نقاط 1.5x", "شحن مجاني", "خصم 10% حصري"],
    perks_en: ["1.5x Points multiplier", "Free Shipping", "Exclusive 10% discount"],
  },
  {
    tier_key: "vip",
    name_ar: "عضوية VIP النخبة",
    name_en: "Elite VIP",
    min_spend: 600,
    min_points: 6000,
    points_multiplier: 2.0,
    free_shipping: true,
    discount_percent: 15,
    badge_color: "#a855f7",
    perks_ar: ["مضاعف نقاط 2.0x", "شحن مجاني دائم", "خصم 15% حصري", "أولوية خدمة العملاء"],
    perks_en: ["2.0x Points multiplier", "Permanent Free Shipping", "Exclusive 15% discount", "Priority Concierge"],
  },
];
