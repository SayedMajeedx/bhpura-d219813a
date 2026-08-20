/**
 * Smart SKU generation, color transliteration, and range expansion utilities
 * Designed for GCC and International Fashion & Boutique E-Commerce.
 */

export const COLOR_SKU_MAP: Record<string, string> = {
  // Arabic colors & common Khaleeji terms
  أسود: "BLK",
  سوداء: "BLK",
  اسود: "BLK",
  أبيض: "WHT",
  بيضاء: "WHT",
  ابيض: "WHT",
  كحلي: "NVY",
  ازرق_داكن: "NVY",
  عنابي: "BRG",
  ماروني: "BRG",
  بورغندي: "BRG",
  زيتي: "OLV",
  اخضر_زيتي: "OLV",
  بيج: "BEG",
  سكري: "OFW",
  اوف_وايت: "OFW",
  رمادي: "GRY",
  رصاصي: "GRY",
  سلفر: "SLV",
  فضي: "SLV",
  ذهبي: "GLD",
  بني: "BRN",
  شوكولاته: "BRN",
  كراميل: "CRM",
  خردلي: "MST",
  اصفر: "YEL",
  أصفر: "YEL",
  اخضر: "GRN",
  أخضر: "GRN",
  ازرق: "BLU",
  أزرق: "BLU",
  سماوي: "SBL",
  ازرق_فاتح: "SBL",
  وردي: "PNK",
  زهري: "PNK",
  فوشي: "FSH",
  فوشيا: "FSH",
  تيفاني: "TIF",
  موف: "MAV",
  بنفسجي: "PRP",
  ليلكي: "LIL",
  لافندر: "LAV",
  لحمي: "NUD",
  نيود: "NUD",
  بترولي: "PET",
  تركواز: "TRQ",
  فيروزي: "TRQ",
  فستقي: "PST",
  مشمشي: "APR",
  برتقالي: "ORG",
  احمر: "RED",
  أحمر: "RED",
  خمري: "WNE",
  نبيذي: "WNE",
  بتنجاني: "EGP",
  كاكي: "KHK",
  طوبي: "BRK",
  عسلي: "HNY",
  كموني: "CUM",
  بطيخي: "WTM",
  صدفي: "SHL",
  لؤلؤي: "PRL",

  // English standard & fashion colors
  black: "BLK",
  white: "WHT",
  navy: "NVY",
  "navy blue": "NVY",
  burgundy: "BRG",
  maroon: "BRG",
  olive: "OLV",
  "olive green": "OLV",
  beige: "BEG",
  "off white": "OFW",
  "off-white": "OFW",
  cream: "CRM",
  ivory: "IVR",
  grey: "GRY",
  gray: "GRY",
  silver: "SLV",
  gold: "GLD",
  brown: "BRN",
  chocolate: "BRN",
  caramel: "CRM",
  mustard: "MST",
  yellow: "YEL",
  green: "GRN",
  "dark green": "DGN",
  "light green": "LGN",
  "sage green": "SGE",
  sage: "SGE",
  emerald: "EMR",
  blue: "BLU",
  "royal blue": "RBL",
  "sky blue": "SBL",
  "baby blue": "BBL",
  pink: "PNK",
  "baby pink": "BPK",
  "dusty pink": "DPK",
  "rose gold": "RGD",
  rose: "ROS",
  fuchsia: "FSH",
  magenta: "MAG",
  tiffany: "TIF",
  mauve: "MAV",
  purple: "PRP",
  lilac: "LIL",
  lavender: "LAV",
  violet: "VIO",
  nude: "NUD",
  tan: "TAN",
  camel: "CML",
  petrol: "PET",
  teal: "TEA",
  turquoise: "TRQ",
  pistachio: "PST",
  mint: "MNT",
  apricot: "APR",
  peach: "PCH",
  coral: "CRL",
  orange: "ORG",
  rust: "RST",
  red: "RED",
  crimson: "CRM",
  wine: "WNE",
  plum: "PLM",
  charcoal: "CHR",
  khaki: "KHK",
  taupe: "TPE",
  bronze: "BRZ",
  copper: "CPR",
  metallic: "MET",
};

/**
 * Standard apparel letter size sequence
 */
export const APPAREL_SIZE_SEQUENCE = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
] as const;

/**
 * Standard 1-Click Sizing Quick Presets
 */
export const SIZING_PRESETS = [
  {
    id: "abaya_gulf",
    labelAr: "عبايات (50 - 60 زوجي)",
    labelEn: "Abayas (50 - 60 even)",
    sizes: ["50", "52", "54", "56", "58", "60"],
    unit: "inch" as const,
  },
  {
    id: "abaya_extended",
    labelAr: "عبايات موسعة (48 - 62)",
    labelEn: "Abayas Ext (48 - 62)",
    sizes: ["48", "50", "52", "54", "56", "58", "60", "62"],
    unit: "inch" as const,
  },
  {
    id: "apparel_standard",
    labelAr: "ملابس (XS - 2XL)",
    labelEn: "Apparel (XS - 2XL)",
    sizes: ["XS", "S", "M", "L", "XL", "2XL"],
    unit: "" as const,
  },
  {
    id: "apparel_compact",
    labelAr: "ملابس (S - XL)",
    labelEn: "Apparel (S - XL)",
    sizes: ["S", "M", "L", "XL"],
    unit: "" as const,
  },
  {
    id: "numbered_1_5",
    labelAr: "أرقام (1 إلى 5)",
    labelEn: "Numbered (1 to 5)",
    sizes: ["1", "2", "3", "4", "5"],
    unit: "" as const,
  },
  {
    id: "shoes_women",
    labelAr: "أحذية نسائية (36 - 41)",
    labelEn: "Women Shoes (36 - 41)",
    sizes: ["36", "37", "38", "39", "40", "41"],
    unit: "" as const,
  },
  {
    id: "shoes_men",
    labelAr: "أحذية رجالية (40 - 45)",
    labelEn: "Men Shoes (40 - 45)",
    sizes: ["40", "41", "42", "43", "44", "45"],
    unit: "" as const,
  },
  {
    id: "free_size",
    labelAr: "مقاس موحد (Free Size)",
    labelEn: "Free Size",
    sizes: ["Free Size"],
    unit: "" as const,
  },
];

/**
 * Normalizes and splits a string list of variant values (comma, newline, slash, or space separated if numeric/letters)
 */
export function splitVariantValues(value: string): string[] {
  if (!value) return [];
  const text = value.trim();

  // If text contains standard delimiters (, ; / \ | \n ،)
  if (/[\n,，/\\|،;]+/.test(text)) {
    return [
      ...new Set(
        text
          .split(/[\n,，/\\|،;]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      ),
    ];
  }

  // If text is a space-separated series of numbers or letter sizes (e.g. "50 52 54 56" or "S M L XL")
  const spaceItems = text.split(/\s+/).filter(Boolean);
  const isAllNumbers =
    spaceItems.length > 1 && spaceItems.every((item) => /^\d{1,3}(?:\.\d+)?$/.test(item));
  const isAllLetters =
    spaceItems.length > 1 &&
    spaceItems.every((item) => /^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|OS)$/i.test(item));

  if (isAllNumbers || isAllLetters) {
    return [...new Set(spaceItems)];
  }

  return [text];
}

/**
 * Normalizes text to a clean alphanumeric/Latin SKU token.
 * Arabic colors are automatically mapped to standardized 3-letter codes (e.g. أسود -> BLK).
 */
export function formatSkuToken(value: string): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  const normalizedKey = trimmed.replace(/\s+/g, "_");

  if (COLOR_SKU_MAP[trimmed]) return COLOR_SKU_MAP[trimmed];
  if (COLOR_SKU_MAP[normalizedKey]) return COLOR_SKU_MAP[normalizedKey];

  // Try direct English & Arabic apparel tokens
  const upper = value.trim().toUpperCase();
  if (
    [
      "FREE SIZE",
      "FREESIZE",
      "FREE",
      "ONE SIZE",
      "ONESIZE",
      "OS",
      "موحد",
      "مقاس موحد",
      "مقاس-موحد",
      "مقاس حر",
    ].includes(upper) ||
    upper.includes("موحد") ||
    upper.includes("فري سايز")
  ) {
    return "OS";
  }

  // Remove diacritics and convert non-alphanumeric characters to hyphens
  const asciiConverted = value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();

  return asciiConverted || "VAR";
}

/**
 * Generates a valid EAN-13 barcode avoiding existing collisions
 */
export function makeEan13(used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    const body = `29${String(bytes[0]).padStart(10, "0").slice(-10)}`;
    const sum = body
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const checkDigit = (10 - (sum % 10)) % 10;
    const code = `${body}${checkDigit}`;
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  // Fallback timestamp-based barcode if crypto random collision occurs
  const fallbackBody = `29${Date.now().toString().slice(-10)}`;
  const sum = fallbackBody
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${fallbackBody}${checkDigit}`;
}

/**
 * Expands a numeric or alphanumeric size range or extracts discrete space/comma-separated numbers.
 * Examples:
 * - "50 إلى 60 زوجي" or "50-60 even" -> ["50", "52", "54", "56", "58", "60"]
 * - "S to XL" -> ["S", "M", "L", "XL"]
 * - "1 to 5" -> ["1", "2", "3", "4", "5"]
 * - "36-41" -> ["36", "37", "38", "39", "40", "41"]
 * - "58 56 55 58" -> ["50", "55", "56", "58"] (or ["58", "56", "55"])
 */
export function expandSizeRange(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  // 1. Abaya even numbers range: "50-60 even", "50 إلى 60 زوجي", "52 to 60"
  const abayaEvenMatch = text.match(
    /(?:من\s*)?(\d{2})\s*(?:إلى|الى|to|-)\s*(\d{2})(?:\s*(?:زوجي|even|إيفن|مقاسات عبايات))?/i,
  );
  if (abayaEvenMatch) {
    const start = parseInt(abayaEvenMatch[1], 10);
    const end = parseInt(abayaEvenMatch[2], 10);
    const isEvenMentioned = /زوجي|even|عباي/i.test(text);

    if (start >= 48 && end <= 64 && (isEvenMentioned || (start % 2 === 0 && end % 2 === 0))) {
      const result: string[] = [];
      const step = 2;
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let s = min; s <= max; s += step) {
        result.push(String(s));
      }
      return result;
    }
  }

  // 2. Apparel Letter Sizes: "XS to XXL", "S إلى XL", "Small to 2XL"
  const letterRangeMatch = text.match(
    /(?:from\s*|من\s*)?(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|سمول|ميديوم|لارج|اكس لارج)\s*(?:to|إلى|الى|-)\s*(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|سمول|ميديوم|لارج|اكس لارج)/i,
  );
  if (letterRangeMatch) {
    const normalizeLetter = (l: string): string => {
      const low = l.toLowerCase();
      if (low.includes("سمول")) return "S";
      if (low.includes("ميديوم")) return "M";
      if (low.includes("لارج") && !low.includes("اكس")) return "L";
      if (low.includes("اكس لارج")) return "XL";
      if (low === "xxl") return "2XL";
      return l.toUpperCase();
    };

    const startLetter = normalizeLetter(letterRangeMatch[1]);
    const endLetter = normalizeLetter(letterRangeMatch[2]);

    const order = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];
    const startIndex = order.indexOf(startLetter);
    const endIndex = order.indexOf(endLetter);

    if (startIndex !== -1 && endIndex !== -1) {
      const minIdx = Math.min(startIndex, endIndex);
      const maxIdx = Math.max(startIndex, endIndex);
      return order.slice(minIdx, maxIdx + 1);
    }
  }

  // 3. Generic numeric range: "1 to 5", "من 1 إلى 6", "36-41"
  const numericRangeMatch = text.match(/(?:from\s*|من\s*)?(\d+)\s*(?:to|إلى|الى|-)\s*(\d+)/i);
  if (numericRangeMatch) {
    const start = parseInt(numericRangeMatch[1], 10);
    const end = parseInt(numericRangeMatch[2], 10);
    if (Math.abs(end - start) <= 30) {
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      const result: string[] = [];
      for (let i = min; i <= max; i += 1) {
        result.push(String(i));
      }
      return result;
    }
  }

  // Default: split standard list
  return splitVariantValues(raw);
}
