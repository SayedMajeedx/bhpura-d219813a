import type { TrustBadgeItem } from "@/lib/trust-badges";

/**
 * Per-vertical "craftsmanship" trust badge shown first in the auto-generated
 * trust bar. Vertical-specific copy lives here with the other brand templates
 * so the core badge generator stays vertical-agnostic.
 */
export const VERTICAL_PRODUCT_BADGES: Record<string, TrustBadgeItem> = {
  coffee: {
    id: "badge-vertical-coffee",
    icon: "Coffee",
    text_ar: "محاصيل مختصة طازجة التحميص",
    text_en: "Freshly Roasted Specialty Coffee",
    color: "amber",
    enabled: true,
  },
  beauty: {
    id: "badge-vertical-beauty",
    icon: "Sparkles",
    text_ar: "أصناف ومستحضرات أصلية 100%",
    text_en: "100% Authentic Beauty & Scents",
    color: "rose",
    enabled: true,
  },
  jewelry: {
    id: "badge-vertical-jewelry",
    icon: "Gem",
    text_ar: "قطع ومجوهرات أصلية فاخرة",
    text_en: "Guaranteed Fine Jewelry",
    color: "amber",
    enabled: true,
  },
  food: {
    id: "badge-vertical-food",
    icon: "Clock",
    text_ar: "طازج ومحضر يومياً بعناية",
    text_en: "Freshly Prepared Daily",
    color: "amber",
    enabled: true,
  },
  electronics: {
    id: "badge-vertical-electronics",
    icon: "ShieldCheck",
    text_ar: "منتجات أصلية مع ضمان الجودة",
    text_en: "Authentic Products with Warranty",
    color: "sky",
    enabled: true,
  },
  print: {
    id: "badge-vertical-print",
    icon: "Palette",
    text_ar: "طباعة عالية الدقة وتفاصيل متقنة",
    text_en: "High-Resolution Custom Print",
    color: "indigo",
    enabled: true,
  },
  gifts: {
    id: "badge-vertical-gifts",
    icon: "Gift",
    text_ar: "تغليف إهدائي فاخر وتنسيق متميز",
    text_en: "Luxury Gift Curation & Packaging",
    color: "rose",
    enabled: true,
  },
  digital: {
    id: "badge-vertical-digital",
    icon: "Zap",
    text_ar: "تسليم رقمي فوري ومباشر",
    text_en: "Instant Digital Delivery",
    color: "sky",
    enabled: true,
  },
  abayas: {
    id: "badge-vertical-abayas",
    icon: "Sparkles",
    text_ar: "تصاميم حصرية وأقمشة مختارة",
    text_en: "Exclusive In-House Designs",
    color: "amber",
    enabled: true,
  },
  fashion: {
    id: "badge-vertical-fashion",
    icon: "Shirt",
    text_ar: "أزياء وتصاميم عصرية مختارة",
    text_en: "Curated Contemporary Fashion",
    color: "purple",
    enabled: true,
  },
  home: {
    id: "badge-vertical-home",
    icon: "Award",
    text_ar: "قطع منزلية مختارة بعناية",
    text_en: "Curated Home Essentials",
    color: "amber",
    enabled: true,
  },
};

export const GENERAL_PRODUCT_BADGE: TrustBadgeItem = {
  id: "badge-vertical-general",
  icon: "Award",
  text_ar: "جودة مضمونة وتجربة موثوقة",
  text_en: "Guaranteed Quality & Trusted Service",
  color: "amber",
  enabled: true,
};

export function verticalProductBadge(vertical: string | null | undefined): TrustBadgeItem {
  const key = (vertical || "general").toLowerCase();
  return VERTICAL_PRODUCT_BADGES[key] ?? GENERAL_PRODUCT_BADGE;
}
