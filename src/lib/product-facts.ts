import type { StoreVertical } from "@/lib/store-profile";
import { verticalLineage } from "@/lib/verticals/registry";

/**
 * What a product is, in the facts its kind of store records (`products.details`, migration
 * `20261024120000`): a perfume's notes and concentration, a sweet's allergens, a coffee's origin
 * and roast, a ring's metal and karat, a table's dimensions. Each vertical has its own set and a
 * child vertical uses its parent's unless it has one (abayas are fashion). The editor offers the
 * store's set (`ProductFactsFields`), the product page lays them out (`ProductAccordion`), and
 * Google's data carries them (`productHead`). Before them a product could say only its fabric
 * and occasion, and a perfume store's "Fragrance Notes" was one text for every bottle.
 */

type Text = { ar: string; en: string };
export type FactChoice = { value: string } & Text;

export type FactField = {
  key: string;
  label: Text;
  /**
   * text: a line; list: several short words (notes, ingredients); choice: one of the choices;
   * choices: several of them (allergens); number: a measure in `unit`.
   */
  kind: "text" | "list" | "choice" | "choices" | "number";
  choices?: readonly FactChoice[];
  unit?: Text;
  placeholder?: Text;
};

/** How the product page lays a vertical's facts out (the rest is a table). */
export type FactLayout = "notes" | "allergens" | "table";

type FactSet = { layout: FactLayout; fields: readonly FactField[] };

const c = (value: string, ar: string, en: string): FactChoice => ({ value, ar, en });

const ALLERGENS = [
  c("gluten", "الغلوتين", "Gluten"),
  c("dairy", "الحليب", "Dairy"),
  c("nuts", "المكسرات", "Nuts"),
  c("peanuts", "الفول السوداني", "Peanuts"),
  c("eggs", "البيض", "Eggs"),
  c("sesame", "السمسم", "Sesame"),
  c("soy", "الصويا", "Soy"),
  c("fish", "السمك", "Fish"),
  c("shellfish", "القشريات", "Shellfish"),
] as const;

const FACT_SETS: Partial<Record<StoreVertical, FactSet>> = {
  fashion: {
    layout: "table",
    fields: [
      {
        key: "fit",
        label: { ar: "القَصّة", en: "Fit" },
        kind: "choice",
        choices: [
          c("relaxed", "واسعة", "Relaxed"),
          c("regular", "عادية", "Regular"),
          c("fitted", "ضيّقة", "Fitted"),
        ],
      },
      {
        key: "model_wears",
        label: { ar: "مقاس العارضة", en: "On the model" },
        kind: "text",
        placeholder: { ar: "طول العارضة 170 سم وترتدي 54", en: "The model is 170 cm and wears 54" },
      },
    ],
  },
  fragrance: {
    layout: "notes",
    fields: [
      {
        key: "concentration",
        label: { ar: "التركيز", en: "Concentration" },
        kind: "choice",
        choices: [
          c("parfum", "بارفان", "Parfum"),
          c("edp", "أو دو بارفان", "Eau de Parfum"),
          c("edt", "أو دو تواليت", "Eau de Toilette"),
          c("oil", "زيت عطري", "Perfume oil"),
          c("bakhoor", "بخور", "Bakhoor"),
          c("mist", "معطّر", "Body mist"),
        ],
      },
      {
        key: "family",
        label: { ar: "العائلة العطرية", en: "Scent family" },
        kind: "choice",
        choices: [
          c("oriental", "شرقي", "Oriental"),
          c("oud", "عودي", "Oud"),
          c("woody", "خشبي", "Woody"),
          c("floral", "زهري", "Floral"),
          c("fresh", "منعش", "Fresh"),
          c("citrus", "حمضي", "Citrus"),
          c("musk", "مسكي", "Musk"),
          c("gourmand", "حلو", "Gourmand"),
        ],
      },
      { key: "top_notes", label: { ar: "النفحات العليا", en: "Top notes" }, kind: "list" },
      { key: "heart_notes", label: { ar: "نفحات القلب", en: "Heart notes" }, kind: "list" },
      { key: "base_notes", label: { ar: "النفحات الأساسية", en: "Base notes" }, kind: "list" },
      {
        key: "longevity",
        label: { ar: "الثبات", en: "Longevity" },
        kind: "choice",
        choices: [
          c("light", "خفيف", "Light"),
          c("moderate", "متوسط", "Moderate"),
          c("long", "طويل", "Long-lasting"),
          c("very_long", "طويل جداً", "Very long-lasting"),
        ],
      },
    ],
  },
  beauty: {
    layout: "table",
    fields: [
      {
        key: "key_ingredients",
        label: { ar: "المكونات الأساسية", en: "Key ingredients" },
        kind: "list",
      },
      {
        key: "skin_type",
        label: { ar: "نوع البشرة", en: "Skin type" },
        kind: "choices",
        choices: [
          c("all", "جميع الأنواع", "All skin types"),
          c("dry", "جافة", "Dry"),
          c("oily", "دهنية", "Oily"),
          c("combination", "مختلطة", "Combination"),
          c("sensitive", "حساسة", "Sensitive"),
        ],
      },
      {
        key: "free_from",
        label: { ar: "خالٍ من", en: "Free from" },
        kind: "choices",
        choices: [
          c("parabens", "البارابين", "Parabens"),
          c("sulfates", "الكبريتات", "Sulfates"),
          c("fragrance", "العطور", "Fragrance"),
          c("alcohol", "الكحول", "Alcohol"),
        ],
      },
      { key: "how_to_use", label: { ar: "طريقة الاستخدام", en: "How to use" }, kind: "text" },
    ],
  },
  food: {
    layout: "allergens",
    fields: [
      { key: "ingredients", label: { ar: "المكونات", en: "Ingredients" }, kind: "text" },
      {
        key: "allergens",
        label: { ar: "يحتوي على", en: "Contains" },
        kind: "choices",
        choices: ALLERGENS,
      },
      {
        key: "serves",
        label: { ar: "يكفي", en: "Serves" },
        kind: "text",
        placeholder: { ar: "6 - 8 أشخاص", en: "6 - 8 people" },
      },
      {
        key: "shelf_life",
        label: { ar: "مدة الصلاحية", en: "Best within" },
        kind: "text",
        placeholder: { ar: "3 أيام", en: "3 days" },
      },
      { key: "storage", label: { ar: "الحفظ", en: "Storage" }, kind: "text" },
    ],
  },
  coffee: {
    layout: "table",
    fields: [
      { key: "origin", label: { ar: "المنشأ", en: "Origin" }, kind: "text" },
      { key: "variety", label: { ar: "السلالة", en: "Variety" }, kind: "text" },
      {
        key: "process",
        label: { ar: "المعالجة", en: "Process" },
        kind: "choice",
        choices: [
          c("washed", "مغسولة", "Washed"),
          c("natural", "طبيعية", "Natural"),
          c("honey", "عسلية", "Honey"),
          c("anaerobic", "لاهوائية", "Anaerobic"),
        ],
      },
      {
        key: "roast",
        label: { ar: "درجة التحميص", en: "Roast" },
        kind: "choice",
        choices: [
          c("light", "فاتحة", "Light"),
          c("medium_light", "متوسطة فاتحة", "Medium-light"),
          c("medium", "متوسطة", "Medium"),
          c("medium_dark", "متوسطة داكنة", "Medium-dark"),
          c("dark", "داكنة", "Dark"),
        ],
      },
      { key: "tasting_notes", label: { ar: "النكهات", en: "Tasting notes" }, kind: "list" },
      {
        key: "altitude",
        label: { ar: "الارتفاع", en: "Altitude" },
        kind: "number",
        unit: { ar: "م", en: "m" },
      },
    ],
  },
  jewelry: {
    layout: "table",
    fields: [
      {
        key: "metal",
        label: { ar: "المعدن", en: "Metal" },
        kind: "choice",
        choices: [
          c("gold", "ذهب", "Gold"),
          c("white_gold", "ذهب أبيض", "White gold"),
          c("rose_gold", "ذهب وردي", "Rose gold"),
          c("silver", "فضة", "Silver"),
          c("platinum", "بلاتين", "Platinum"),
          c("steel", "ستانلس ستيل", "Stainless steel"),
        ],
      },
      {
        key: "karat",
        label: { ar: "العيار", en: "Karat" },
        kind: "choice",
        choices: [
          c("24k", "24", "24K"),
          c("22k", "22", "22K"),
          c("21k", "21", "21K"),
          c("18k", "18", "18K"),
          c("14k", "14", "14K"),
          c("925", "925", "925 silver"),
        ],
      },
      {
        key: "weight",
        label: { ar: "الوزن", en: "Weight" },
        kind: "number",
        unit: { ar: "غ", en: "g" },
      },
      { key: "stones", label: { ar: "الأحجار", en: "Stones" }, kind: "text" },
      { key: "certificate", label: { ar: "الشهادة", en: "Certificate" }, kind: "text" },
    ],
  },
  home: {
    layout: "table",
    fields: [
      {
        key: "width",
        label: { ar: "العرض", en: "Width" },
        kind: "number",
        unit: { ar: "سم", en: "cm" },
      },
      {
        key: "depth",
        label: { ar: "العمق", en: "Depth" },
        kind: "number",
        unit: { ar: "سم", en: "cm" },
      },
      {
        key: "height",
        label: { ar: "الارتفاع", en: "Height" },
        kind: "number",
        unit: { ar: "سم", en: "cm" },
      },
      { key: "material", label: { ar: "الخامة", en: "Material" }, kind: "text" },
      {
        key: "assembly",
        label: { ar: "التركيب", en: "Assembly" },
        kind: "choice",
        choices: [
          c("none", "لا يحتاج تركيب", "No assembly"),
          c("required", "يحتاج تركيب", "Assembly required"),
        ],
      },
    ],
  },
  gifts: {
    layout: "table",
    fields: [{ key: "contents", label: { ar: "ما تحتويه", en: "What's inside" }, kind: "list" }],
  },
  print: {
    layout: "table",
    fields: [
      { key: "material", label: { ar: "الخامة", en: "Material" }, kind: "text" },
      { key: "dimensions", label: { ar: "المقاس", en: "Dimensions" }, kind: "text" },
      {
        key: "turnaround",
        label: { ar: "مدة التجهيز", en: "Ready in" },
        kind: "text",
        placeholder: { ar: "3 أيام عمل", en: "3 working days" },
      },
    ],
  },
  digital: {
    layout: "table",
    fields: [
      {
        key: "format",
        label: { ar: "الصيغة", en: "Format" },
        kind: "text",
        placeholder: { ar: "PDF", en: "PDF" },
      },
      { key: "file_size", label: { ar: "حجم الملف", en: "File size" }, kind: "text" },
      { key: "license", label: { ar: "الترخيص", en: "License" }, kind: "text" },
    ],
  },
  electronics: {
    layout: "table",
    fields: [
      { key: "brand", label: { ar: "العلامة التجارية", en: "Brand" }, kind: "text" },
      { key: "model", label: { ar: "الطراز", en: "Model" }, kind: "text" },
      { key: "warranty", label: { ar: "الضمان", en: "Warranty" }, kind: "text" },
    ],
  },
};

const NO_FACTS: FactSet = { layout: "table", fields: [] };

/** The store's set of facts: its vertical's, else its family's; none for the general store. */
export function factSet(vertical: string | null | undefined): FactSet {
  for (const id of verticalLineage((vertical || "general") as StoreVertical)) {
    const set = FACT_SETS[id];
    if (set) return set;
  }
  return NO_FACTS;
}

export type ProductFacts = Record<string, string | string[] | number>;

const KEY = /^[a-z][a-z_]{0,39}$/;
export const FACT_LIMITS = { text: 300, item: 60, items: 12, keys: 40 } as const;

/**
 * The facts as they may be stored: an object of known shapes and bounded sizes (the column
 * holds the same bound). A field emptied is dropped, so a save never keeps a blank.
 */
export function cleanFacts(raw: unknown): ProductFacts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ProductFacts = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= FACT_LIMITS.keys || !KEY.test(key)) continue;
    if (typeof value === "string") {
      const text = value.trim().slice(0, FACT_LIMITS.text);
      if (text) out[key] = text;
    } else if (typeof value === "number") {
      if (Number.isFinite(value) && value >= 0) out[key] = Math.round(value * 1000) / 1000;
    } else if (Array.isArray(value)) {
      const items = [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().slice(0, FACT_LIMITS.item))
            .filter(Boolean),
        ),
      ].slice(0, FACT_LIMITS.items);
      if (items.length) out[key] = items;
    }
  }
  return out;
}

/** A list typed as one line ("rose, oud، musk") as its items. */
export function splitList(text: string): string[] {
  return text
    .split(/[,،\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export type FactLine = { key: string; label: string; value: string; items?: string[] };

const choiceLabel = (field: FactField, value: string, lang: "ar" | "en") =>
  field.choices?.find((choice) => choice.value === value)?.[lang] ?? value;

/**
 * The facts of the store's set that the product has, in the set's order and the reader's
 * language: a choice by its name, a list as its items, a number with its unit. A fact the
 * product has that the set does not offer (a store that changed its kind) is not shown.
 */
export function factLines(
  facts: unknown,
  vertical: string | null | undefined,
  lang: "ar" | "en",
): FactLine[] {
  const clean = cleanFacts(facts);
  const separator = lang === "ar" ? "، " : ", ";
  const lines: FactLine[] = [];
  for (const field of factSet(vertical).fields) {
    const value = clean[field.key];
    if (value === undefined) continue;
    const label = field.label[lang];
    if (field.kind === "number" && typeof value === "number") {
      const unit = field.unit ? ` ${field.unit[lang]}` : "";
      lines.push({ key: field.key, label, value: `${value}${unit}` });
    } else if (field.kind === "choice" && typeof value === "string") {
      lines.push({ key: field.key, label, value: choiceLabel(field, value, lang) });
    } else if ((field.kind === "list" || field.kind === "choices") && Array.isArray(value)) {
      const items = value.map((item) =>
        field.kind === "choices" ? choiceLabel(field, item, lang) : item,
      );
      lines.push({ key: field.key, label, value: items.join(separator), items });
    } else if (field.kind === "text" && typeof value === "string") {
      lines.push({ key: field.key, label, value });
    }
  }
  return lines;
}
