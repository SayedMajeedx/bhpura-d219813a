import type { AddonManifest } from "@/lib/addons/addon-types";

export const coffeeRoasteryManifest: AddonManifest = {
  id: "coffee-roastery",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة القهوة والمحامص المختصة", en: "Specialty Coffee & Roastery Pack" },
  description: {
    ar: "مفردات المحمصة، أوزان المحاصيل (250g، 1kg)، خيارات الطحن (V60، إسبريسو)، وسياق الذكاء الاصطناعي للمحاصيل",
    en: "Roastery vocabulary, bean weights (250g, 1kg), grind options (V60, Espresso), and coffee AI catalog context",
  },
  whatItAdds: [
    {
      ar: "مفردات المحمصة وملاحظات التحميص والطحن",
      en: "Roastery vocabulary, roasting and grind notes",
    },
    {
      ar: "محاور مخصصة: الوزن، درجة التحميص، ونوع المعالجة",
      en: "Tailored axes: Weight, Roast Level, and Process",
    },
    {
      ar: "نماذج أوزان المحاصيل (250g، 500g، 1kg) وأظرف التقطير",
      en: "Coffee bean weights (250g, 500g, 1kg) and drip bag presets",
    },
    {
      ar: "توجيه ذكاء اصطناعي متخصص لفهم إيحاءات ومعالجات البن عند الاستيراد",
      en: "Specialized AI context for origins, tasting notes, and processing",
    },
  ],
  icon: "Coffee",
  activities: ["coffee"],
  contributions: {
    vocabulary: {
      workshop: { ar: "المحمصة", en: "Roastery" },
      sent_to_workshop: { ar: "قيد التجهيز / التحميص", en: "In Roasting / Prep" },
      received_from_workshop: { ar: "جاهز للتسليم", en: "Ready for Pickup" },
      sent_to_tailor: { ar: "قيد التجهيز بالمحمصة", en: "In Roasting / Prep" },
      received_from_tailor: { ar: "جاهز للتسليم", en: "Ready for Pickup" },
      workshop_notes_label: {
        ar: "ملاحظات التحميص ودرجة الطحن:",
        en: "Roasting & Grind Notes:",
      },
      workshop_instructions: {
        ar: "تعليمات للمحمصة / الباريستا",
        en: "Instructions for Roastery / Barista",
      },
    },
    variantAxisDefaults: {
      size: { ar: "الوزن / الحجم", en: "Weight / Size" },
      color: { ar: "درجة التحميص", en: "Roast Level" },
      fabric: { ar: "المعالجة", en: "Process" },
    },
    sizingPresets: [
      {
        id: "coffee_beans_weight",
        labelAr: "أوزان المحاصيل الشائعة (250g، 500g، 1kg)",
        labelEn: "Standard Bean Weights (250g, 500g, 1kg)",
        sizes: ["250g", "500g", "1kg", "125g (عينة)"],
        unit: "weight",
      },
      {
        id: "coffee_grind_types",
        labelAr: "درجات الطحن القياسية (حبوب كاملة، فلتر، إسبريسو)",
        labelEn: "Grind Options (Whole Beans, Filter, Espresso)",
        sizes: [
          "حبوب كاملة (Whole Beans)",
          "طحنة فلتر (V60)",
          "طحنة إسبريسو (Espresso)",
          "طحنة كيمكس (Chemex)",
          "طحنة فرنش بريس (French Press)",
          "طحنة كولد برو (Cold Brew)",
        ],
        unit: "grind",
      },
      {
        id: "coffee_drip_bags",
        labelAr: "بوكسات أظرف القهوة سريعة التحضير (Drip Bags)",
        labelEn: "Drip Bags Box Options",
        sizes: ["بوكس 5 أظرف", "بوكس 10 أظرف", "بوكس 20 ظرف"],
        unit: "box",
      },
    ],
    settingsPatchOnInstall: {
      pickup_enabled: true,
      delivery_enabled: true,
    },
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" محمصة قهوة مختصة متخصصة في بيع محاصيل البن الفاخرة، حبوب البن الكاملة والمطحونة (V60، إسبريسو، كيمكس، كولد برو)، وأدوات الترشيح وبوكسات الأظرف. عند قراءة وتوليد المنتجات: ركّز على الدولة ومصدر المحصول (إثيوبيا، كولومبيا، البرازيل، كوستاريكا)، نوع المعالجة (مجففة Natural، مغسولة Washed، عسلية Honey، لاهوائية Anaerobic)، إيحاءات التذوق (ياسمين، خوخ، توت، شوكولاتة)، الوزن (250g، 500g، 1kg)، ودرجات الطحن المطلوبة.`
        : `Store "${brandName}" is a specialty coffee roastery offering premium whole beans, ground coffee (V60, Espresso, Chemex, Cold Brew), brewing equipment, and drip bags. Pay special attention to origins (Ethiopia, Colombia, Brazil), processing methods (Natural, Washed, Honey, Anaerobic), tasting notes, package weights (250g, 1kg), and grind options.`,
  },
};
