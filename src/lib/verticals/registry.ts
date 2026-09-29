import type { AddonId } from "@/lib/addons/addon-types";
import type { StoreModules, StoreVertical } from "@/lib/store-profile";

/**
 * Every store vertical in one place: its name, a line that explains it, its
 * icon, where it sits (a vertical may belong to a broader one: abayas are
 * fashion, a roastery is food and drink), the modules it turns on and the
 * add-ons it starts with. Other tables keyed by vertical (categories,
 * templates, design presets) stay next to their feature and are checked
 * against this list by tests/vertical-registry.test.ts.
 *
 * A child vertical inherits what its parent's add-ons offer (see
 * `verticalFits`); its own settings always win.
 */

type Text = { ar: string; en: string };

export type VerticalStatus =
  /** Offered in pickers. */
  | "active"
  /** Kept for the stores already on it; not offered to new ones. */
  | "legacy";

export type VerticalDefinition = {
  id: StoreVertical;
  label: Text;
  /** One line under the name in pickers. */
  summary: Text;
  /** lucide-react icon name (see components/verticals/VerticalIcon). */
  icon: string;
  parent: StoreVertical | null;
  status: VerticalStatus;
  modules: StoreModules;
  starterPack: { required: AddonId[]; suggested: AddonId[] };
};

const NO_MODULES: StoreModules = { size_guide: false, fit_passport: false, made_to_order: false };
const TAILORING: StoreModules = { size_guide: true, fit_passport: true, made_to_order: true };
const FASHION_PACK: AddonId[] = ["fashion-core", "size-guides", "fit-passport", "made-to-order"];

/** In picker order: each child right after its parent. */
export const VERTICAL_DEFINITIONS: readonly VerticalDefinition[] = [
  {
    id: "fashion",
    label: { ar: "أزياء", en: "Fashion" },
    summary: { ar: "ملابس وأحذية، مقاسات وتفصيل", en: "Clothing and shoes, sizing and tailoring" },
    icon: "Shirt",
    parent: null,
    status: "active",
    modules: TAILORING,
    starterPack: { required: FASHION_PACK, suggested: [] },
  },
  {
    id: "abayas",
    label: { ar: "عبايات", en: "Abayas" },
    summary: {
      ar: "عبايات جاهزة وتفصيل، مقاسات الخليج",
      en: "Ready-made and tailored abayas, Gulf sizing",
    },
    icon: "Sparkles",
    parent: "fashion",
    status: "active",
    modules: TAILORING,
    starterPack: { required: [...FASHION_PACK, "abaya-pack"], suggested: [] },
  },
  {
    id: "beauty",
    label: { ar: "عطور وتجميل", en: "Beauty & Perfume" },
    summary: { ar: "عطور وبخور ومستحضرات تجميل", en: "Fragrance, oud and cosmetics" },
    icon: "Flower2",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: ["beauty-perfume"], suggested: [] },
  },
  {
    id: "food",
    label: { ar: "مأكولات ومشروبات", en: "Food & Beverage" },
    summary: {
      ar: "حلويات ومخبوزات ومشروبات، أوزان وحصص",
      en: "Sweets, bakery and drinks, weights and portions",
    },
    icon: "Utensils",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: ["food-beverage"], suggested: ["made-to-order"] },
  },
  {
    id: "coffee",
    label: { ar: "محاصيل وقهوة مختصة", en: "Specialty Coffee & Roastery" },
    summary: {
      ar: "محاصيل، درجات التحميص والطحن",
      en: "Beans, roast levels and grind types",
    },
    icon: "Coffee",
    parent: "food",
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: ["coffee-roastery"], suggested: [] },
  },
  {
    id: "jewelry",
    label: { ar: "مجوهرات وإكسسوارات", en: "Jewelry & Accessories" },
    summary: {
      ar: "ذهب وفضة، مقاسات الخواتم والنقش",
      en: "Gold and silver, ring sizes and engraving",
    },
    icon: "Gem",
    parent: null,
    status: "active",
    modules: { size_guide: true, fit_passport: false, made_to_order: true },
    starterPack: { required: ["size-guides", "made-to-order", "jewelry"], suggested: [] },
  },
  {
    id: "gifts",
    label: { ar: "هدايا وحرف", en: "Gifts & Crafts" },
    summary: { ar: "هدايا وتغليف وبطاقات إهداء", en: "Gifts, wrapping and gift cards" },
    icon: "Gift",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: ["gifts"], suggested: [] },
  },
  {
    id: "print",
    label: { ar: "طباعة وأختام", en: "Print & Stamps" },
    summary: {
      ar: "طباعة وأختام وتخصيص حسب الطلب",
      en: "Printing, stamps and made-to-order personalisation",
    },
    icon: "Printer",
    parent: null,
    status: "active",
    modules: { size_guide: false, fit_passport: false, made_to_order: true },
    starterPack: { required: ["made-to-order", "print-stamps"], suggested: [] },
  },
  {
    id: "home",
    label: { ar: "منزل وديكور", en: "Home & Decor" },
    summary: { ar: "أثاث وديكور ومستلزمات المنزل", en: "Furniture, decor and homeware" },
    icon: "Home",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: [], suggested: [] },
  },
  {
    id: "electronics",
    label: { ar: "إلكترونيات", en: "Electronics" },
    summary: { ar: "أجهزة وإكسسوارات تقنية", en: "Devices and tech accessories" },
    icon: "Smartphone",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: [], suggested: [] },
  },
  {
    id: "digital",
    label: { ar: "منتجات رقمية", en: "Digital Products" },
    summary: {
      ar: "ملفات ودورات وقوالب تُسلَّم رقمياً",
      en: "Files, courses and templates delivered online",
    },
    icon: "FileCode",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: ["digital-products"], suggested: [] },
  },
  {
    id: "general",
    label: { ar: "متجر عام", en: "General Store" },
    summary: { ar: "كل ما سبق أو غيره، دون إضافات", en: "Anything else, with no add-ons" },
    icon: "Store",
    parent: null,
    status: "active",
    modules: NO_MODULES,
    starterPack: { required: [], suggested: [] },
  },
];

const BY_ID = new Map(VERTICAL_DEFINITIONS.map((definition) => [definition.id, definition]));

/** A vertical's definition; unknown ids get the general store's. */
export function getVerticalDefinition(id: StoreVertical | string): VerticalDefinition {
  return BY_ID.get(id as StoreVertical) ?? BY_ID.get("general")!;
}

/** The vertical and the broader ones it belongs to, nearest first. */
export function verticalLineage(id: StoreVertical): StoreVertical[] {
  const lineage: StoreVertical[] = [];
  for (let current: StoreVertical | null = id; current && !lineage.includes(current);) {
    lineage.push(current);
    current = BY_ID.get(current)?.parent ?? null;
  }
  return lineage;
}

/** The verticals that belong to this one. */
export function childVerticals(id: StoreVertical): StoreVertical[] {
  return VERTICAL_DEFINITIONS.filter((definition) => definition.parent === id).map((d) => d.id);
}

/**
 * Whether something meant for `activities` (an add-on's verticals) fits a
 * store on `vertical`: it does when it is meant for the vertical or for one
 * it belongs to (a roastery gets food and drink add-ons, not the reverse).
 */
export function verticalFits(activities: readonly string[], vertical: StoreVertical): boolean {
  const wanted = new Set(activities.map((activity) => activity.toLowerCase()));
  return verticalLineage(vertical).some((id) => wanted.has(id));
}

export type PickerVertical = VerticalDefinition & { depth: number };

/**
 * The verticals to offer in a picker, in order, with their depth (0 for a
 * top-level vertical, 1 for one that belongs to it). Legacy verticals are
 * left out, except the one the store is on now.
 */
export function pickerVerticals(current?: StoreVertical | null): PickerVertical[] {
  return VERTICAL_DEFINITIONS.filter(
    (definition) => definition.status === "active" || definition.id === current,
  ).map((definition) => ({ ...definition, depth: verticalLineage(definition.id).length - 1 }));
}
