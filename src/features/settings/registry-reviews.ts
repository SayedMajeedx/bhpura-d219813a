import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * Settings the Reviews page owns. The thank-you for a review is chosen where reviews are read
 * (the Reviews page): one of the store's own promo codes, or its loyalty points (the programme's
 * review points), never both; the review page, the WhatsApp request and the Reviews page all say
 * it (`src/lib/review-reward.ts`). Kept apart so the registry file does not grow.
 */
export const REVIEWS_SETTINGS: SettingsFieldDef[] = [
  {
    key: "review_reward_promo_id",
    table: "business_settings",
    tab: null,
    group: null,
    level: "advanced",
    owner: "route:reviews",
    type: "text",
    label: { ar: "خصم الشكر على التقييم", en: "Thank-you discount for a review" },
    keywords: {
      ar: ["تقييم", "خصم التقييم", "مكافأة"],
      en: ["review", "review reward", "thank-you discount"],
    },
  },
  {
    key: "review_reward_points",
    table: "business_settings",
    tab: null,
    group: null,
    level: "advanced",
    owner: "route:reviews",
    type: "boolean",
    label: { ar: "نقاط الولاء شكرًا على التقييم", en: "Loyalty points for a review" },
    keywords: {
      ar: ["تقييم", "نقاط", "ولاء", "مكافأة"],
      en: ["review", "points", "loyalty", "review reward"],
    },
  },
];
