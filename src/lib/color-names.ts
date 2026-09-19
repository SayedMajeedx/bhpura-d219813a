/**
 * Shared color mapping and resolution utilities for Boutq OS Storefront.
 * Extracts Arabic and English color names to hex codes for UI swatches and filters.
 */

export const COLOR_MAP: Record<string, string> = {
  black: "#0b0c10",
  white: "#ffffff",
  blue: "#2563eb",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#ea580c",
  purple: "#9333ea",
  pink: "#db2777",
  brown: "#78350f",
  grey: "#4b5563",
  gray: "#4b5563",
  navy: "#1e3a8a",
  teal: "#0d9488",
  gold: "#d97706",
  silver: "#9ca3af",
  beige: "#f5f5dc",
  burgundy: "#800020",
  maroon: "#800020",
  olive: "#556b2f",
  nude: "#e3bc9a",
  camel: "#c19a6b",
  sand: "#e0cda3",
  taupe: "#483c32",
  charcoal: "#36454f",
  ivory: "#fffff0",
  cream: "#fffdd0",
  lilac: "#c8a2c8",
  lavender: "#e6e6fa",
  mint: "#98ff98",

  // Arabic with & without hamza
  أسود: "#0b0c10",
  اسود: "#0b0c10",
  فاحم: "#0b0c10",
  أبيض: "#ffffff",
  ابيض: "#ffffff",
  سكري: "#fcfbf4",
  أوفوايت: "#f8f6f0",
  افوايت: "#f8f6f0",
  "أوف وايت": "#f8f6f0",
  "اف وايت": "#f8f6f0",
  عاجي: "#fffff0",
  أزرق: "#2563eb",
  ازرق: "#2563eb",
  سماوي: "#38bdf8",
  كحلي: "#1e3a8a",
  نيفي: "#1e3a8a",
  أحمر: "#dc2626",
  احمر: "#dc2626",
  عنابي: "#800020",
  ماروني: "#800020",
  خمري: "#722f37",
  أخضر: "#16a34a",
  اخضر: "#16a34a",
  زيتي: "#4e5d2c",
  زيتوني: "#556b2f",
  أصفر: "#eab308",
  اصفر: "#eab308",
  خردلي: "#e3a857",
  برتقالي: "#ea580c",
  مشمشي: "#fbceb1",
  بنفسجي: "#9333ea",
  موف: "#9932cc",
  ليلك: "#c8a2c8",
  لافندر: "#e6e6fa",
  وردي: "#db2777",
  زهري: "#ff2a8d",
  روز: "#ff007f",
  خربزي: "#f88379",
  بني: "#78350f",
  عسلي: "#d4a373",
  جملي: "#c19a6b",
  تراكوتا: "#e2725b",
  رمادي: "#4b5563",
  رصاصي: "#71717a",
  فحمي: "#36454f",
  بيج: "#f5f5dc",
  لحمي: "#e3bc9a",
  نودي: "#e3bc9a",
  ذهبي: "#d97706",
  فضي: "#9ca3af",
};

export function resolveColorHex(rawColor: string): string | null {
  if (!rawColor) return null;
  const trimmed = rawColor.trim();

  // If valid CSS hex code
  if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(trimmed)) {
    return trimmed;
  }

  const key = trimmed.toLowerCase();
  if (COLOR_MAP[key]) return COLOR_MAP[key];

  // Strip Arabic hamzas and tatweel
  const normalized = key.replace(/[أإآ]/g, "ا").replace(/ـ/g, "").trim();
  if (COLOR_MAP[normalized]) return COLOR_MAP[normalized];

  // Keyword matching for compound color names
  if (/اسود|أسود|black|فاحم/.test(normalized)) return "#0b0c10";
  if (/ابيض|أبيض|white|سكري|عاجي|افوايت|أوفوايت/.test(normalized)) return "#ffffff";
  if (/كحلي|navy|نيفي/.test(normalized)) return "#1e3a8a";
  if (/عنابي|ماروني|خمري|burgundy|maroon/.test(normalized)) return "#800020";
  if (/زيتي|زيتوني|olive/.test(normalized)) return "#4e5d2c";
  if (/بني|brown|جملي|camel/.test(normalized)) return "#78350f";
  if (/بيج|beige|لحمي|نودي|nude|sand/.test(normalized)) return "#f5f5dc";
  if (/رمادي|رصاصي|فحمي|gray|grey|charcoal/.test(normalized)) return "#4b5563";
  if (/ازرق|أزرق|سماوي|blue/.test(normalized)) return "#2563eb";
  if (/احمر|أحمر|red/.test(normalized)) return "#dc2626";
  if (/اخضر|أخضر|green/.test(normalized)) return "#16a34a";
  if (/وردي|زهري|روز|pink/.test(normalized)) return "#db2777";
  if (/بنفسجي|موف|ليلك|purple/.test(normalized)) return "#9333ea";
  if (/ذهبي|gold/.test(normalized)) return "#d97706";
  if (/فضي|silver/.test(normalized)) return "#9ca3af";

  return null;
}

export interface SwatchColor {
  name: string;
  hex: string | null;
}

/**
 * Extracts unique colors from a list of variants.
 */
export function extractUniqueVariantColors(
  variants?: Array<{ color?: string | null }> | null,
): SwatchColor[] {
  if (!variants || variants.length === 0) return [];

  const seen = new Set<string>();
  const results: SwatchColor[] = [];

  for (const v of variants) {
    const raw = v.color?.trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    results.push({
      name: raw,
      hex: resolveColorHex(raw),
    });
  }

  return results;
}
