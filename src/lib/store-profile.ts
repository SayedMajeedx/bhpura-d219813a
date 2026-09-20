export const STORE_VERTICALS = [
  "abayas",
  "fashion",
  "beauty",
  "coffee",
  "food",
  "gifts",
  "print",
  "jewelry",
  "home",
  "electronics",
  "digital",
  "general",
] as const;

export type StoreVertical = (typeof STORE_VERTICALS)[number];

export const STORE_MODULES = ["size_guide", "fit_passport", "made_to_order"] as const;

export type StoreModuleId = (typeof STORE_MODULES)[number];

export type StoreModules = Record<StoreModuleId, boolean>;
export type StoreModuleOverrides = Partial<StoreModules>;

export const VERTICAL_MODULE_DEFAULTS: Record<StoreVertical, StoreModules> = {
  abayas: { size_guide: true, fit_passport: true, made_to_order: true },
  fashion: { size_guide: true, fit_passport: true, made_to_order: true },
  beauty: { size_guide: false, fit_passport: false, made_to_order: false },
  coffee: { size_guide: false, fit_passport: false, made_to_order: false },
  food: { size_guide: false, fit_passport: false, made_to_order: false },
  gifts: { size_guide: false, fit_passport: false, made_to_order: false },
  print: { size_guide: false, fit_passport: false, made_to_order: true },
  jewelry: { size_guide: true, fit_passport: false, made_to_order: true },
  home: { size_guide: false, fit_passport: false, made_to_order: false },
  electronics: { size_guide: false, fit_passport: false, made_to_order: false },
  digital: { size_guide: false, fit_passport: false, made_to_order: false },
  general: { size_guide: false, fit_passport: false, made_to_order: false },
};

/** lucide-react icon name per vertical (kept here so UI files stay vertical-agnostic). */
export const VERTICAL_ICON_NAMES: Record<StoreVertical, string> = {
  abayas: "Sparkles",
  fashion: "Shirt",
  beauty: "Flower2",
  coffee: "Coffee",
  food: "Utensils",
  gifts: "Gift",
  print: "Printer",
  jewelry: "Gem",
  home: "Home",
  electronics: "Smartphone",
  digital: "FileCode",
  general: "Store",
};

export const VERTICAL_LABELS: Record<StoreVertical, { ar: string; en: string }> = {
  abayas: { ar: "عبايات", en: "Abayas" },
  fashion: { ar: "أزياء", en: "Fashion" },
  beauty: { ar: "عطور وتجميل", en: "Beauty & Perfume" },
  coffee: { ar: "محاصيل وقهوة مختصة", en: "Specialty Coffee & Roastery" },
  food: { ar: "مأكولات ومشروبات", en: "Food & Beverage" },
  gifts: { ar: "هدايا وحرف", en: "Gifts & Crafts" },
  print: { ar: "طباعة وأختام", en: "Print & Stamps" },
  jewelry: { ar: "مجوهرات وإكسسوارات", en: "Jewelry & Accessories" },
  home: { ar: "منزل وديكور", en: "Home & Decor" },
  electronics: { ar: "إلكترونيات", en: "Electronics" },
  digital: { ar: "منتجات رقمية", en: "Digital Products" },
  general: { ar: "متجر عام", en: "General Store" },
};

export const MODULE_LABELS: Record<
  StoreModuleId,
  { ar: string; en: string; hintAr: string; hintEn: string }
> = {
  size_guide: {
    ar: "دليل المقاسات",
    en: "Size Guide",
    hintAr: "أدلة مقاسات مخصصة تظهر في صفحة المنتج",
    hintEn: "Custom size guides shown on product pages",
  },
  fit_passport: {
    ar: "Fit Passport (قياسات العميل)",
    en: "Fit Passport (customer measurements)",
    hintAr: "حفظ قياسات العميل وإعادة استخدامها في الطلبات",
    hintEn: "Save customer measurements and reuse them on orders",
  },
  made_to_order: {
    ar: "التصنيع حسب الطلب",
    en: "Made-to-order",
    hintAr: "تبديل جاهز/حسب الطلب، ملاحظات الورشة، ومسار الإرسال للورشة",
    hintEn: "Ready/custom toggle, workshop notes, and the send-to-workshop flow",
  },
};

export type StoreProfileSource = {
  store_vertical?: string | null;
  store_modules?: unknown;
};

export function normalizeVertical(raw: unknown): StoreVertical {
  return (STORE_VERTICALS as readonly string[]).includes(String(raw))
    ? (raw as StoreVertical)
    : "general";
}

export function normalizeModuleOverrides(raw: unknown): StoreModuleOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StoreModuleOverrides = {};
  for (const id of STORE_MODULES) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "boolean") out[id] = v;
  }
  return out;
}

export function resolveStoreModules(source: StoreProfileSource | null | undefined): StoreModules {
  const vertical = normalizeVertical(source?.store_vertical);
  const overrides = normalizeModuleOverrides(source?.store_modules);
  const defaults = VERTICAL_MODULE_DEFAULTS[vertical];
  return {
    size_guide: overrides.size_guide ?? defaults.size_guide,
    fit_passport: overrides.fit_passport ?? defaults.fit_passport,
    made_to_order: overrides.made_to_order ?? defaults.made_to_order,
  };
}

export function isModuleEnabled(
  source: StoreProfileSource | null | undefined,
  id: StoreModuleId,
): boolean {
  return resolveStoreModules(source)[id];
}

/** يحوّل النص الحر القديم في brands.business_type / tenant_requests.business_type إلى نشاط. */
export function legacyBusinessTypeToVertical(
  businessType: string | null | undefined,
): StoreVertical {
  const t = (businessType ?? "").toLowerCase();
  if (/coffee|roast|roastery|قهوة|محصول|محاصيل|محمصة|بن/.test(t)) return "coffee";
  if (/cafe|restaurant|food|مطعم|كافيه/.test(t)) return "food";
  if (/digital|رقمي/.test(t)) return "digital";
  if (/abaya|عباي/.test(t)) return "abayas";
  if (/fashion|boutique|أزياء|بوتيك/.test(t)) return "fashion";
  if (/perfume|beauty|عطر|تجميل/.test(t)) return "beauty";
  if (/print|stamp|طباعة|أختام/.test(t)) return "print";
  if (/jewel|gold|مجوهرات|ذهب/.test(t)) return "jewelry";
  if (/gift|هدايا/.test(t)) return "gifts";
  return "general";
}

/** لتمرير قيمة مفهومة لـ create_tenant_with_defaults (يستخدمها لتسمية القسم الأول فقط). */
export function verticalToLegacyBusinessType(v: StoreVertical): string {
  if (v === "coffee") return "Specialty Coffee";
  if (v === "food") return "Cafe / Restaurant";
  if (v === "digital") return "Digital store";
  if (v === "abayas") return "Abayas & Fashion";
  if (v === "fashion") return "Fashion";
  return VERTICAL_LABELS[v].en;
}
