import { VERTICAL_LABELS, VERTICAL_MODULE_DEFAULTS, type StoreVertical } from "@/lib/store-profile";
import { DEFAULT_VERTICAL_CATEGORIES } from "@/lib/addons/vertical-categories";
import { FONT_MOOD_PRESETS } from "@/components/settings/QuickThemeCustomizer";
import type { BrandTemplate, BrandDesignConfig } from "./types";

export * from "./types";

export const VERTICAL_DESIGN_PRESETS: Record<StoreVertical, BrandDesignConfig> = {
  abayas: {
    preset: "editorial",
    grid: 4,
    radius: "0.5rem",
    sectionSpacing: "airy",
    cardStyle: "borderless",
  },
  fashion: {
    preset: "editorial",
    grid: 4,
    radius: "0.5rem",
    sectionSpacing: "airy",
    cardStyle: "borderless",
  },
  jewelry: {
    preset: "editorial",
    grid: 4,
    radius: "0.5rem",
    sectionSpacing: "airy",
    cardStyle: "borderless",
  },
  beauty: {
    preset: "editorial",
    grid: 4,
    radius: "0.5rem",
    sectionSpacing: "airy",
    cardStyle: "borderless",
  },
  coffee: {
    preset: "fresh",
    grid: 4,
    radius: "1.25rem",
    sectionSpacing: "regular",
    cardStyle: "bordered",
  },
  food: {
    preset: "fresh",
    grid: 4,
    radius: "1.25rem",
    sectionSpacing: "regular",
    cardStyle: "bordered",
  },
  gifts: {
    preset: "fresh",
    grid: 4,
    radius: "1.25rem",
    sectionSpacing: "regular",
    cardStyle: "bordered",
  },
  home: {
    preset: "fresh",
    grid: 4,
    radius: "1.25rem",
    sectionSpacing: "regular",
    cardStyle: "bordered",
  },
  electronics: {
    preset: "tech",
    grid: 5,
    radius: "0.375rem",
    sectionSpacing: "dense",
    cardStyle: "bordered",
  },
  digital: {
    preset: "tech",
    grid: 5,
    radius: "0.375rem",
    sectionSpacing: "dense",
    cardStyle: "bordered",
  },
  print: {
    preset: "tech",
    grid: 5,
    radius: "0.375rem",
    sectionSpacing: "dense",
    cardStyle: "bordered",
  },
  general: {
    preset: "tech",
    grid: 5,
    radius: "0.375rem",
    sectionSpacing: "dense",
    cardStyle: "bordered",
  },
};

const getFontPair = (presetId: "classic" | "modern" | "signature" | "strong" | "bubble") => {
  const preset = FONT_MOOD_PRESETS.find((p) => p.id === presetId);
  return {
    fontAr: preset?.fontAr || "Tajawal",
    fontEn: preset?.fontEn || "Inter",
  };
};

export const RAW_BRAND_TEMPLATES: Record<StoreVertical, BrandTemplate> = {
  abayas: {
    vertical: "abayas",
    label: VERTICAL_LABELS.abayas,
    fontPresetId: "signature",
    ...getFontPair("signature"),
    defaultPalette: {
      primary: "#1c1917",
      secondary: "#c5a880",
      background: "#ffffff",
      text: "#1c1917",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "Sparkles",
        title_ar: "تفصيل وخياطة متقنة",
        title_en: "Artisanal Tailoring",
        subtitle_ar: "أقمشة كورية ويابانية مختارة",
        subtitle_en: "Premium fabrics",
      },
      {
        icon: "Truck",
        title_ar: "توصيل لكافة مناطق الخليج",
        title_en: "GCC Shipping",
        subtitle_ar: "شحن سريع وآمن",
        subtitle_en: "Fast & secure courier",
      },
      {
        icon: "ShieldCheck",
        title_ar: "ضمان جودة المقاس",
        title_en: "Fit Guarantee",
        subtitle_ar: "إمكانية التعديل والاستبدال",
        subtitle_en: "Easy exchanges",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.abayas,
    categories: DEFAULT_VERTICAL_CATEGORIES.abayas,
  },

  fashion: {
    vertical: "fashion",
    label: VERTICAL_LABELS.fashion,
    fontPresetId: "classic",
    ...getFontPair("classic"),
    defaultPalette: {
      primary: "#18181b",
      secondary: "#a1a1aa",
      background: "#ffffff",
      text: "#18181b",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.375rem",
    trustBadges: [
      {
        icon: "Tag",
        title_ar: "تصاميم حصرية",
        title_en: "Exclusive Designs",
        subtitle_ar: "قطع محدودة بجودة استثنائية",
        subtitle_en: "Limited edition collections",
      },
      {
        icon: "Truck",
        title_ar: "توصيل سريع",
        title_en: "Fast Delivery",
        subtitle_ar: "شحن مباشر لباب منزلك",
        subtitle_en: "Door-to-door courier",
      },
      {
        icon: "ShieldCheck",
        title_ar: "استرجاع مرن",
        title_en: "Flexible Returns",
        subtitle_ar: "خدمة عملاء على مدار الساعة",
        subtitle_en: "24/7 dedicated support",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.fashion,
    categories: DEFAULT_VERTICAL_CATEGORIES.fashion,
  },

  beauty: {
    vertical: "beauty",
    label: VERTICAL_LABELS.beauty,
    fontPresetId: "signature",
    ...getFontPair("signature"),
    defaultPalette: {
      primary: "#4a044e",
      secondary: "#f472b6",
      background: "#ffffff",
      text: "#1c1917",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.75rem",
    trustBadges: [
      {
        icon: "Sparkles",
        title_ar: "زيوت عطرية أصلية",
        title_en: "Authentic Oils",
        subtitle_ar: "ثبات وفوحان يدوم طويلاً",
        subtitle_en: "Long lasting sillage",
      },
      {
        icon: "ShieldCheck",
        title_ar: "مكونات آمنة ومفحوصة",
        title_en: "Dermatologically Tested",
        subtitle_ar: "مصرحة ومطابقة للمواصفات",
        subtitle_en: "Certified standards",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.beauty,
    categories: DEFAULT_VERTICAL_CATEGORIES.beauty,
  },

  coffee: {
    vertical: "coffee",
    label: VERTICAL_LABELS.coffee,
    fontPresetId: "strong",
    ...getFontPair("strong"),
    defaultPalette: {
      primary: "#3e2723",
      secondary: "#d7ccc8",
      background: "#ffffff",
      text: "#271c19",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.0,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "Flame",
        title_ar: "تحميص طازج أسبوعياً",
        title_en: "Freshly Roasted",
        subtitle_ar: "محاصيل مختصة بدرجات تقييم عالية",
        subtitle_en: "High score specialty beans",
      },
      {
        icon: "Truck",
        title_ar: "شحن سريع مبرد",
        title_en: "Express Delivery",
        subtitle_ar: "للحفاظ على الإيحاءات والنكهة",
        subtitle_en: "Preserving aroma & notes",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.coffee,
    categories: DEFAULT_VERTICAL_CATEGORIES.coffee,
  },

  food: {
    vertical: "food",
    label: VERTICAL_LABELS.food,
    fontPresetId: "bubble",
    ...getFontPair("bubble"),
    defaultPalette: {
      primary: "#c2410c",
      secondary: "#fdba74",
      background: "#ffffff",
      text: "#1c1917",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.0,
    },
    radius: "0.75rem",
    trustBadges: [
      {
        icon: "Clock",
        title_ar: "تحضير فوري طازج",
        title_en: "Made to Order",
        subtitle_ar: "مكونات طبيعية وطازجة يومياً",
        subtitle_en: "Fresh daily ingredients",
      },
      {
        icon: "Truck",
        title_ar: "توصيل حراري سريع",
        title_en: "Heated Delivery",
        subtitle_ar: "يصلك ساخناً وبحالة مثالية",
        subtitle_en: "Arrives hot & fresh",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.food,
    categories: DEFAULT_VERTICAL_CATEGORIES.food,
  },

  gifts: {
    vertical: "gifts",
    label: VERTICAL_LABELS.gifts,
    fontPresetId: "classic",
    ...getFontPair("classic"),
    defaultPalette: {
      primary: "#831843",
      secondary: "#fbcfe8",
      background: "#ffffff",
      text: "#1c1917",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "Gift",
        title_ar: "تغليف هدايا فاخر",
        title_en: "Luxury Packaging",
        subtitle_ar: "مع بطاقة إهداء مخصصة مجانية",
        subtitle_en: "Complimentary gift card",
      },
      {
        icon: "Clock",
        title_ar: "توصيل في نفس اليوم",
        title_en: "Same-Day Delivery",
        subtitle_ar: "للمناسبات والمفاجآت الخاصة",
        subtitle_en: "For special surprises",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.gifts,
    categories: DEFAULT_VERTICAL_CATEGORIES.gifts,
  },

  print: {
    vertical: "print",
    label: VERTICAL_LABELS.print,
    fontPresetId: "modern",
    ...getFontPair("modern"),
    defaultPalette: {
      primary: "#0284c7",
      secondary: "#bae6fd",
      background: "#ffffff",
      text: "#0f172a",
    },
    storefrontMode: "inquiry",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.375rem",
    trustBadges: [
      {
        icon: "Printer",
        title_ar: "دقة طباعة فائقة",
        title_en: "Ultra High Resolution",
        subtitle_ar: "ألوان مطابقة ومعايرة احترافية",
        subtitle_en: "Color calibrated printing",
      },
      {
        icon: "FileCheck",
        title_ar: "مراجعة الملفات قبل التنفيذ",
        title_en: "Pre-press File Check",
        subtitle_ar: "نضمن جاهزية التصميم للطباعة",
        subtitle_en: "Guaranteed artwork check",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.print,
    categories: DEFAULT_VERTICAL_CATEGORIES.print,
  },

  jewelry: {
    vertical: "jewelry",
    label: VERTICAL_LABELS.jewelry,
    fontPresetId: "classic",
    ...getFontPair("classic"),
    defaultPalette: {
      primary: "#0f172a",
      secondary: "#fbbf24",
      background: "#ffffff",
      text: "#0f172a",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 2.0,
    },
    radius: "0.25rem",
    trustBadges: [
      {
        icon: "Award",
        title_ar: "شهادة أصالة معتمدة",
        title_en: "Certified Authenticity",
        subtitle_ar: "معادن وأحجار كريمة مفحوصة ومختومة",
        subtitle_en: "Hallmarked & tested",
      },
      {
        icon: "ShieldCheck",
        title_ar: "شحن مؤمن بالكامل",
        title_en: "Fully Insured Transit",
        subtitle_ar: "تسليم باليد بتوقيع مباشر",
        subtitle_en: "Direct signature delivery",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.jewelry,
    categories: DEFAULT_VERTICAL_CATEGORIES.jewelry,
  },

  home: {
    vertical: "home",
    label: VERTICAL_LABELS.home,
    fontPresetId: "modern",
    ...getFontPair("modern"),
    defaultPalette: {
      primary: "#334155",
      secondary: "#94a3b8",
      background: "#ffffff",
      text: "#1e293b",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 3.0,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "Home",
        title_ar: "خامات عالية التحمل",
        title_en: "Durable Materials",
        subtitle_ar: "تشطيبات عصرية متناسقة",
        subtitle_en: "Contemporary finishes",
      },
      {
        icon: "Truck",
        title_ar: "توصيل وتركيب متخصص",
        title_en: "White Glove Delivery",
        subtitle_ar: "فريق فني محترف للعناية بالقطع",
        subtitle_en: "Careful handling & setup",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.home,
    categories: DEFAULT_VERTICAL_CATEGORIES.home,
  },

  electronics: {
    vertical: "electronics",
    label: VERTICAL_LABELS.electronics,
    fontPresetId: "strong",
    ...getFontPair("strong"),
    defaultPalette: {
      primary: "#0f172a",
      secondary: "#38bdf8",
      background: "#ffffff",
      text: "#0f172a",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "ShieldCheck",
        title_ar: "ضمان الوكيل الرسمي",
        title_en: "Official Warranty",
        subtitle_ar: "منتجات أصلية 100% معتمدة",
        subtitle_en: "100% genuine products",
      },
      {
        icon: "Zap",
        title_ar: "شحن سريع ومؤمن",
        title_en: "Fast Insured Delivery",
        subtitle_ar: "تتبع مباشر لشحنتك خطوة بخطوة",
        subtitle_en: "Live tracking & protection",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.electronics,
    categories: DEFAULT_VERTICAL_CATEGORIES.electronics,
  },

  digital: {
    vertical: "digital",
    label: VERTICAL_LABELS.digital,
    fontPresetId: "modern",
    ...getFontPair("modern"),
    defaultPalette: {
      primary: "#4338ca",
      secondary: "#a5b4fc",
      background: "#ffffff",
      text: "#1e1b4b",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: false,
      pickup: false,
      digital: true,
      deliveryFee: 0,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "Download",
        title_ar: "تحميل فوري بعد الدفع",
        title_en: "Instant Download",
        subtitle_ar: "روابط وتراخيص تصلك فورياً",
        subtitle_en: "Immediate file delivery",
      },
      {
        icon: "ShieldCheck",
        title_ar: "تحديثات وتراخيص دائمة",
        title_en: "Lifetime License",
        subtitle_ar: "دعم فني وتحديثات مستمرة",
        subtitle_en: "Dedicated support & updates",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.digital,
    categories: DEFAULT_VERTICAL_CATEGORIES.digital,
  },

  general: {
    vertical: "general",
    label: VERTICAL_LABELS.general,
    fontPresetId: "modern",
    ...getFontPair("modern"),
    defaultPalette: {
      primary: "#1c1917",
      secondary: "#a8a29e",
      background: "#ffffff",
      text: "#1c1917",
    },
    storefrontMode: "shop",
    catalogShowPrices: true,
    fulfillment: {
      delivery: true,
      pickup: true,
      digital: false,
      deliveryFee: 1.5,
    },
    radius: "0.5rem",
    trustBadges: [
      {
        icon: "ShoppingBag",
        title_ar: "تسوق سلس وموثوق",
        title_en: "Trusted Shopping",
        subtitle_ar: "طرق دفع آمنة ومتنوعة",
        subtitle_en: "Multiple secure payments",
      },
      {
        icon: "Truck",
        title_ar: "توصيل لجميع المناطق",
        title_en: "Nationwide Delivery",
        subtitle_ar: "خدمة سريعة وموثوقة",
        subtitle_en: "Fast and dependable",
      },
    ],
    starterModules: VERTICAL_MODULE_DEFAULTS.general,
    categories: DEFAULT_VERTICAL_CATEGORIES.general,
  },
};

export const BRAND_TEMPLATES: Record<StoreVertical, BrandTemplate> = Object.fromEntries(
  Object.entries(RAW_BRAND_TEMPLATES).map(([key, template]) => {
    const v = key as StoreVertical;
    return [
      v,
      {
        ...template,
        design: VERTICAL_DESIGN_PRESETS[v] || VERTICAL_DESIGN_PRESETS.general,
      },
    ];
  }),
) as Record<StoreVertical, BrandTemplate>;

export function getBrandTemplate(vertical: StoreVertical): BrandTemplate {
  return BRAND_TEMPLATES[vertical] || BRAND_TEMPLATES.general;
}
