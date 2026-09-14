import type { AddonManifest } from "@/lib/addons/addon-types";
import { resolveBrandOwnerUserId } from "@/lib/addons/seed-helpers";

export const jewelryManifest: AddonManifest = {
  id: "jewelry",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة المجوهرات والإكسسوارات", en: "Jewelry & Accessories Pack" },
  description: {
    ar: "تسميات مقاسات الخواتم والأساور، حقول الحفر والتخصيص، ومفردات ورش الصاغة",
    en: "Ring and bracelet sizing, engraving fields, and jeweler workshop presets",
  },
  whatItAdds: [
    {
      ar: "قوالب قياس الخواتم والأساور القياسية",
      en: "Ring sizing and bracelet measurement charts",
    },
    {
      ar: "تسمية محور المقاس بمقاس الخاتم واللون بنوع المعدن",
      en: "Ring size and metal type variant axis labels",
    },
    {
      ar: "سياق الذكاء الاصطناعي للمجوهرات والذهب والفضة والأحجار",
      en: "AI context for jewelry craftsmanship",
    },
  ],
  icon: "Gem",
  activities: ["jewelry"],
  requires: ["size-guides", "made-to-order"],
  contributions: {
    vocabulary: {
      workshop: { ar: "ورشة الصياغة", en: "Jeweler Workshop" },
      sent_to_tailor: { ar: "قيد الصياغة والحفر", en: "In Crafting & Engraving" },
      received_from_tailor: { ar: "جاهز للاستلام", en: "Ready for Collection" },
    },
    variantAxisDefaults: {
      size: { ar: "مقاس الخاتم", en: "Ring Size" },
      color: { ar: "نوع المعدن", en: "Metal Type" },
      fabric: null,
    },
    sizingPresetOrder: ["ring_standard", "bracelet_standard"],
    trustBadgeSuggestions: ["pure_metals", "handcrafted"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم مجوهرات راقية وإكسسوارات مصاغة بعناية.`
        : `Store "${brandName}" crafts fine jewelry and bespoke accessories.`,
  },
  seeds: [
    {
      key: "jewelry_ring_guide",
      description: {
        ar: "دليل مقاسات الخواتم القياسي",
        en: "Standard ring size guide",
      },
      run: async ({ brandId, db }) => {
        const { data: existing, error: existErr } = await db
          .from("size_guides")
          .select("id")
          .eq("brand_id", brandId)
          .in("template_key", ["rings", "ring_standard"])
          .maybeSingle();

        if (existErr) throw existErr;

        if (!existing) {
          const { error } = await db.from("size_guides").insert({
            brand_id: brandId,
            name_ar: "دليل مقاسات الخواتم",
            name_en: "Ring Size Guide",
            template_key: "rings",
            base_unit: "none",
            columns: [
              { key: "us", label_ar: "المقاس الأمريكي (US)", label_en: "US Size", kind: "text" },
              {
                key: "diameter",
                label_ar: "القطر الداخلي (ملم)",
                label_en: "Inner Diameter (mm)",
                kind: "measurement",
                measurement_key: "ring_diameter",
              },
              {
                key: "circumference",
                label_ar: "محيط الإصبع (ملم)",
                label_en: "Circumference (mm)",
                kind: "measurement",
                measurement_key: "ring_circumference",
              },
            ],
            rows: [
              { label: "US 5", values: { us: "5", diameter: 15.7, circumference: 49.3 } },
              { label: "US 6", values: { us: "6", diameter: 16.5, circumference: 51.9 } },
              { label: "US 7", values: { us: "7", diameter: 17.3, circumference: 54.4 } },
              { label: "US 8", values: { us: "8", diameter: 18.1, circumference: 57.0 } },
              { label: "US 9", values: { us: "9", diameter: 18.9, circumference: 59.5 } },
            ],
            is_active: true,
          });

          if (error) throw error;
        }
      },
    },
    {
      key: "jewelry_engraving_option",
      description: {
        ar: "خيار نقش الأسماء والتواريخ على المجوهرات",
        en: "Jewelry name and date engraving option",
      },
      run: async ({ brandId, db }) => {
        const optionName = "نقش وحفر اسم أو تاريخ مخصص";
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
            price_delta: 3.0,
            product_ids: [],
          });

          if (error) throw error;
        }
      },
    },
  ],
};
