import type { AddonManifest } from "@/lib/addons/addon-types";
import { resolveBrandOwnerUserId } from "@/lib/addons/seed-helpers";

export const giftsManifest: AddonManifest = {
  id: "gifts",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة الهدايا والحرف", en: "Gifts & Crafts Pack" },
  description: {
    ar: "خيارات تغليف الهدايا، بطاقات الإهداء، والمفردات المخصصة للبوتيكات",
    en: "Gift wrapping options, message cards, and personalized boutique settings",
  },
  whatItAdds: [
    { ar: "قوالب حقول رسالة وبطاقة الإهداء", en: "Gift message and greeting card fields" },
    { ar: "خيارات تغليف الهدايا المخصصة", en: "Gift wrapping customization options" },
    {
      ar: "سياق الذكاء الاصطناعي للمناسبات والهدايا التذكارية",
      en: "AI context for celebratory gifts",
    },
  ],
  icon: "Gift",
  activities: ["gifts"],
  contributions: {
    trustBadgeSuggestions: ["gift_ready", "handcrafted"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم هدايا مميزة وتغليفاً راقياً لمختلف المناسبات.`
        : `Store "${brandName}" creates curated gifts and premium packaging.`,
  },
  seeds: [
    {
      key: "gift_wrapping_options",
      description: {
        ar: "خيارات تغليف الهدايا وبطاقات الإهداء الافتراضية",
        en: "Default gift wrapping and greeting card options",
      },
      run: async ({ brandId, db }) => {
        const optionName = "تغليف هدية فاخر مع بطاقة إهداء";
        const { data: existing, error: existErr } = await db
          .from("customization_options")
          .select("id")
          .eq("brand_id", brandId)
          .eq("name", optionName)
          .maybeSingle();

        if (existErr) throw existErr;

        if (!existing) {
          const userId = await resolveBrandOwnerUserId(db, brandId);
          if (!userId) {
            return;
          }

          const { error } = await db.from("customization_options").insert({
            brand_id: brandId,
            user_id: userId,
            name: optionName,
            price_delta: 1.5,
            product_ids: [],
          });

          if (error) throw error;
        }
      },
    },
  ],
};
