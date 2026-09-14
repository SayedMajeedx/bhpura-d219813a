import type { AddonManifest } from "@/lib/addons/addon-types";

export const beautyPerfumeManifest: AddonManifest = {
  id: "beauty-perfume",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة العطور والتجميل", en: "Beauty & Perfume Pack" },
  description: {
    ar: "تسميات المحاور، قوالب الأحجام وسياق المنتجات لمتاجر العطور والتجميل",
    en: "Variant axis labels, size presets, and AI context for perfume and cosmetics",
  },
  whatItAdds: [
    {
      ar: "تسمية محور الحجم (مل) والتركيز بدل المقاس واللون",
      en: "Volume (ml) and concentration axis labels",
    },
    {
      ar: "قوالب أحجام العطور القياسية (30، 50، 100 مل)",
      en: "Standard perfume bottle sizes (30, 50, 100 ml)",
    },
    { ar: "شارات الثقة لعطور ومنتجات أصلية 100%", en: "100% authentic fragrance trust badges" },
  ],
  icon: "Sparkles",
  activities: ["beauty"],
  contributions: {
    variantAxisDefaults: {
      size: { ar: "الحجم", en: "Volume" },
      color: { ar: "التركيز", en: "Concentration" },
      fabric: null,
    },
    sizingPresetOrder: ["perfume_volume"],
    trustBadgeSuggestions: ["authentic_100", "fast_shipping"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" متخصص في العطور الفاخرة ومنتجات العناية والتجميل.`
        : `Store "${brandName}" specializes in luxury perfumes and cosmetics.`,
  },
  seeds: [
    {
      key: "beauty_default_categories",
      description: {
        ar: "تصنيفات العطور والتجميل الافتراضية",
        en: "Default beauty & perfume categories",
      },
      run: async ({ brandId, db }) => {
        const defaultCats = [
          { name_ar: "عطور نسائية", name_en: "Women's Perfumes", slug: "women-perfumes", sort_order: 1 },
          { name_ar: "عطور رجالية", name_en: "Men's Perfumes", slug: "men-perfumes", sort_order: 2 },
          { name_ar: "دخون وعود", name_en: "Oud & Incense", slug: "oud-incense", sort_order: 3 },
        ];

        for (const cat of defaultCats) {
          const { data: existing } = await db
            .from("categories")
            .select("id")
            .eq("brand_id", brandId)
            .eq("slug", cat.slug)
            .maybeSingle();

          if (!existing) {
            await db.from("categories").insert({
              brand_id: brandId,
              name_ar: cat.name_ar,
              name_en: cat.name_en,
              slug: cat.slug,
              sort_order: cat.sort_order,
              is_active: true,
            });
          }
        }
      },
    },
  ],
};
