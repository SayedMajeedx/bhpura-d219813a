import type { AddonManifest } from "@/lib/addons/addon-types";

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
        const { data: existing } = await db
          .from("size_guides")
          .select("id")
          .eq("brand_id", brandId)
          .eq("template_key", "ring_standard")
          .maybeSingle();

        if (!existing) {
          await db.from("size_guides").insert({
            brand_id: brandId,
            name_ar: "دليل مقاسات الخواتم",
            name_en: "Ring Size Guide",
            template_key: "ring_standard",
            base_unit: "mm",
            columns: [
              {
                key: "inner_diameter",
                label_ar: "القطر الداخلي (ملم)",
                label_en: "Inner Diameter (mm)",
                kind: "measurement",
                measurement_key: "diameter",
              },
              {
                key: "circumference",
                label_ar: "المحيط (ملم)",
                label_en: "Circumference (mm)",
                kind: "measurement",
                measurement_key: "circumference",
              },
            ],
            rows: [
              { size_label: "5", inner_diameter: "15.7", circumference: "49.3" },
              { size_label: "6", inner_diameter: "16.5", circumference: "51.8" },
              { size_label: "7", inner_diameter: "17.3", circumference: "54.4" },
              { size_label: "8", inner_diameter: "18.1", circumference: "56.9" },
              { size_label: "9", inner_diameter: "19.0", circumference: "59.5" },
            ],
            is_active: true,
          });
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
        const { data: existing } = await db
          .from("customization_options")
          .select("id")
          .eq("brand_id", brandId)
          .eq("name", optionName)
          .maybeSingle();

        if (!existing) {
          const { data: brand } = await db
            .from("brands")
            .select("owner_id")
            .eq("id", brandId)
            .maybeSingle();
          const userId = brand?.owner_id || "00000000-0000-0000-0000-000000000000";

          await db.from("customization_options").insert({
            brand_id: brandId,
            user_id: userId,
            name: optionName,
            price_delta: 3.0,
            product_ids: [],
          });
        }
      },
    },
  ],
};
