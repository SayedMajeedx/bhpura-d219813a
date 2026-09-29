import { VERTICAL_DEFINITIONS, type VerticalDefinition } from "@/lib/verticals/registry";

export const STORE_VERTICALS = [
  "abayas",
  "fashion",
  "beauty",
  "fragrance",
  "coffee",
  "food",
  "gifts",
  "print",
  "jewelry",
  "home",
  "electronics",
  "digital",
  "services",
  "general",
] as const;

export type StoreVertical = (typeof STORE_VERTICALS)[number];

export const STORE_MODULES = ["size_guide", "fit_passport", "made_to_order"] as const;

export type StoreModuleId = (typeof STORE_MODULES)[number];

export type StoreModules = Record<StoreModuleId, boolean>;
export type StoreModuleOverrides = Partial<StoreModules>;

const byVertical = <T>(pick: (definition: VerticalDefinition) => T) =>
  Object.fromEntries(
    VERTICAL_DEFINITIONS.map((definition) => [definition.id, pick(definition)]),
  ) as Record<StoreVertical, T>;

/** The modules each vertical turns on (from the vertical registry). */
export const VERTICAL_MODULE_DEFAULTS = byVertical((definition) => definition.modules);

/** lucide-react icon name per vertical (kept here so UI files stay vertical-agnostic). */
export const VERTICAL_ICON_NAMES = byVertical((definition) => definition.icon);

export const VERTICAL_LABELS = byVertical((definition) => definition.label);

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
  if (/perfume|fragrance|oud|bakhoor|عطر|عطور|عود|بخور|دخون/.test(t)) return "fragrance";
  if (/beauty|cosmetic|makeup|skincare|تجميل|مكياج|عناية/.test(t)) return "beauty";
  if (/service|booking|event|rental|booth|salon|خدمات|حجز|فعاليات|تأجير|تاجير/.test(t))
    return "services";
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
