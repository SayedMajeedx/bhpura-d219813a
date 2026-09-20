export interface CountryInfo {
  code: string; // ISO 2-letter uppercase
  name_ar: string;
  name_en: string;
  flag: string;
  region: "gcc" | "arab" | "world";
}

export const COUNTRIES_DATABASE: CountryInfo[] = [
  // GCC Countries (Primary)
  { code: "BH", name_ar: "مملكة البحرين", name_en: "Bahrain", flag: "🇧🇭", region: "gcc" },
  {
    code: "SA",
    name_ar: "المملكة العربية السعودية",
    name_en: "Saudi Arabia",
    flag: "🇸🇦",
    region: "gcc",
  },
  {
    code: "AE",
    name_ar: "الإمارات العربية المتحدة",
    name_en: "United Arab Emirates",
    flag: "🇦🇪",
    region: "gcc",
  },
  { code: "KW", name_ar: "دولة الكويت", name_en: "Kuwait", flag: "🇰🇼", region: "gcc" },
  { code: "QA", name_ar: "دولة قطر", name_en: "Qatar", flag: "🇶🇦", region: "gcc" },
  { code: "OM", name_ar: "سلطنة عُمان", name_en: "Oman", flag: "🇴🇲", region: "gcc" },

  // Arab World
  { code: "EG", name_ar: "جمهورية مصر العربية", name_en: "Egypt", flag: "🇪🇬", region: "arab" },
  {
    code: "JO",
    name_ar: "المملكة الأردنية الهاشمية",
    name_en: "Jordan",
    flag: "🇯🇴",
    region: "arab",
  },
  { code: "LB", name_ar: "لبنان", name_en: "Lebanon", flag: "🇱🇧", region: "arab" },
  { code: "IQ", name_ar: "العراق", name_en: "Iraq", flag: "🇮🇶", region: "arab" },
  { code: "MA", name_ar: "المملكة المغربية", name_en: "Morocco", flag: "🇲🇦", region: "arab" },
  { code: "TN", name_ar: "تونس", name_en: "Tunisia", flag: "🇹🇳", region: "arab" },
  { code: "DZ", name_ar: "الجزائر", name_en: "Algeria", flag: "🇩🇿", region: "arab" },

  // World (Common Luxury Shipping Destinations)
  {
    code: "GB",
    name_ar: "المملكة المتحدة",
    name_en: "United Kingdom",
    flag: "🇬🇧",
    region: "world",
  },
  {
    code: "US",
    name_ar: "الولايات المتحدة",
    name_en: "United States",
    flag: "🇺🇸",
    region: "world",
  },
  { code: "FR", name_ar: "فرنسا", name_en: "France", flag: "🇫🇷", region: "world" },
  { code: "IT", name_ar: "إيطاليا", name_en: "Italy", flag: "🇮🇹", region: "world" },
  { code: "DE", name_ar: "ألمانيا", name_en: "Germany", flag: "🇩🇪", region: "world" },
  { code: "TR", name_ar: "تركيا", name_en: "Turkey", flag: "🇹🇷", region: "world" },
  { code: "CH", name_ar: "سويسرا", name_en: "Switzerland", flag: "🇨🇭", region: "world" },
];

export const GCC_NON_BH_CODES = ["SA", "AE", "KW", "QA", "OM"];
export const ARAB_CODES = ["EG", "JO", "LB", "IQ", "MA", "TN", "DZ"];

export interface ShippingZone {
  id: string;
  name_en: string;
  name_ar: string;
  countries: string[]; // List of ISO 2-letter codes, e.g. ["SA", "AE", "KW", "QA", "OM"]
  pricing_type: "flat" | "per_piece" | "bundle";
  fee: number;
  bundle_size?: number; // e.g. 1 for per_piece, 2 or custom for bundle
  estimate_ar?: string;
  estimate_en?: string;
  allowed_payment_methods?: Array<"cod" | "card" | "benefit">;
}

/**
 * Find country info by ISO code (case-insensitive).
 */
export function getCountryByCode(code: string): CountryInfo | undefined {
  if (!code) return undefined;
  const upper = code.trim().toUpperCase();
  return COUNTRIES_DATABASE.find((c) => c.code === upper);
}

/**
 * Format a country label with flag and localized name.
 */
export function formatCountryName(code: string, lang: "ar" | "en" = "ar"): string {
  const info = getCountryByCode(code);
  if (!info) return code;
  return `${info.flag} ${lang === "ar" ? info.name_ar : info.name_en}`;
}

/**
 * Find which shipping zone covers a given country code.
 */
export function findZoneForCountry(
  zones: ShippingZone[] | undefined | null,
  countryCode: string,
): ShippingZone | undefined {
  if (!zones || zones.length === 0) return undefined;
  const upper = countryCode.trim().toUpperCase();

  // 1. Direct country match
  const direct = zones.find((z) => (z.countries ?? []).includes(upper));
  if (direct) return direct;

  // 2. Wildcard or fallback match
  const wildcard = zones.find(
    (z) => (z.countries ?? []).includes("*") || (z.countries ?? []).includes("ALL"),
  );
  if (wildcard) return wildcard;

  // 3. Backward-compatibility: if zone has no countries list, check if country name matches zone name
  return zones.find((z) => {
    const name = `${z.name_en} ${z.name_ar}`.toUpperCase();
    return name.includes(upper);
  });
}

/**
 * Calculate the accurate shipping fee based on total cart quantity and the active zone pricing model.
 */
export function calculateShippingFee(
  zone: ShippingZone | null | undefined,
  totalQuantity: number,
  defaultLocalFee: number,
): number {
  // If no zone is provided, fallback to the default domestic delivery fee
  if (!zone) {
    return Math.max(0, Number(defaultLocalFee || 0));
  }

  const baseFee = Math.max(0, Number(zone.fee || 0));
  const qty = Math.max(1, Math.round(Number(totalQuantity) || 1));
  const pricingType = zone.pricing_type || "flat";

  switch (pricingType) {
    case "flat":
      return baseFee;

    case "per_piece": {
      const bundleSize = Math.max(1, Math.round(Number(zone.bundle_size) || 1));
      if (bundleSize === 1) {
        return baseFee * qty;
      }
      return Math.max(1, Math.ceil(qty / bundleSize)) * baseFee;
    }

    case "bundle": {
      const bundleSize = Math.max(1, Math.round(Number(zone.bundle_size) || 2));
      return Math.max(1, Math.ceil(qty / bundleSize)) * baseFee;
    }

    default:
      return baseFee;
  }
}

/**
 * Get human-readable description of how shipping is calculated for a zone.
 */
export function getShippingPricingDescription(
  zone: ShippingZone | null | undefined,
  currency: string = "BHD",
  lang: "ar" | "en" = "ar",
): string {
  if (!zone) return "";

  const fee = Number(zone.fee || 0).toFixed(3);
  const pricingType = zone.pricing_type || "flat";
  const bundleSize = Math.max(1, Number(zone.bundle_size) || (pricingType === "bundle" ? 2 : 1));

  if (lang === "ar") {
    if (pricingType === "flat") {
      return `سعر ثابت للطلب: ${fee} ${currency}`;
    }
    if (pricingType === "per_piece" && bundleSize === 1) {
      return `${fee} ${currency} لكل قطعة`;
    }
    return `${fee} ${currency} لكل ${bundleSize} قطع`;
  } else {
    if (pricingType === "flat") {
      return `Flat rate per order: ${fee} ${currency}`;
    }
    if (pricingType === "per_piece" && bundleSize === 1) {
      return `${fee} ${currency} per item`;
    }
    return `${fee} ${currency} per ${bundleSize} items`;
  }
}
