import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * Settings the Reviews page owns. The thank-you discount for a review is chosen where reviews
 * are read (the Reviews page), from the store's own promo codes; the review page, the WhatsApp
 * request and the Reviews page all say it (`src/lib/review-reward.ts`). Kept apart so the
 * registry file does not grow.
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
];
