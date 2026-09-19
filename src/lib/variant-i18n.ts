/**
 * Bilingual variant options translation and localization engine.
 * Automatically translates common retail, food, sweets, coffee, and fashion option values
 * between Arabic and English when the customer toggles the storefront language.
 */

// Bidirectional lookup dictionary
const AR_TO_EN_MAP: Record<string, string> = {
  // Food & Sweets Options / Flavors
  عادية: "Regular",
  عادي: "Regular",
  "بدون سكر": "Sugar Free",
  "خالي من السكر": "Sugar Free",
  "قليل السكر": "Low Sugar",
  "بدون إضافات": "Plain",
  سادة: "Plain",
  فستق: "Pistachio",
  "فستق حلبي": "Aleppo Pistachio",
  جوز: "Walnut",
  "عين الجمل": "Walnut",
  لوز: "Almond",
  كاجو: "Cashew",
  بندق: "Hazelnut",
  صنوبر: "Pine Nut",
  زعفران: "Saffron",
  هيل: "Cardamom",
  قرفة: "Cinnamon",
  شوكولاتة: "Chocolate",
  شوكولاته: "Chocolate",
  كاكاو: "Cocoa",
  "شوكولاتة بلجيكية": "Belgian Chocolate",
  "شوكولاتة داكنة": "Dark Chocolate",
  "شوكولاتة بيضاء": "White Chocolate",
  نوتيلا: "Nutella",
  لوتس: "Lotus",
  كراميل: "Caramel",
  "سالتد كراميل": "Salted Caramel",
  "كراميل مملح": "Salted Caramel",
  فانيلا: "Vanilla",
  فانيليا: "Vanilla",
  تمر: "Date",
  عجوة: "Ajwa Date",
  سكري: "Sukkari Date",
  خلاص: "Khalas Date",
  مجدول: "Medjool Date",
  قشطة: "Cream",
  جبن: "Cheese",
  جبنة: "Cheese",
  عسل: "Honey",
  ورد: "Rose",
  "ماء ورد": "Rose Water",
  توت: "Berries",
  فراولة: "Strawberry",
  مانجو: "Mango",
  ليمون: "Lemon",
  برتقال: "Orange",
  قهوة: "Coffee",
  ماتشا: "Matcha",

  // Packaging & Boxes
  "بوكس فاخر": "Luxury Box",
  "علبة فاخرة": "Luxury Box",
  "صندوق فاخر": "Luxury Box",
  "علبة قصدير": "Tin Box",
  "علبة حديد": "Tin Box",
  "علبة كرتون": "Carton Box",
  "تغليف هدايا": "Gift Wrapping",
  "تغليف خاص": "Special Packaging",
  "بدون تغليف": "Standard Packaging",

  // Quantities & Counts
  حبة: "Piece",
  قطعة: "Piece",
  حبتين: "2 Pieces",
  قطعتين: "2 Pieces",
  "نصف درزن": "Half Dozen (6 pcs)",
  درزن: "Dozen (12 pcs)",
  درزنين: "2 Dozen (24 pcs)",
  "صحن صغير": "Small Plate",
  "صحن وسط": "Medium Plate",
  "صحن كبير": "Large Plate",

  // General Sizes / Options
  صغير: "Small",
  وسط: "Medium",
  كبير: "Large",
  "كبير جداً": "X-Large",
  "كبير جدا": "X-Large",
  ميني: "Mini",
  جمبو: "Jumbo",
  مفرد: "Single",
  مزدوج: "Double",
  عائلي: "Family Size",

  // Coffee & Roastery
  "حبوب كاملة": "Whole Beans",
  مطحونة: "Ground Coffee",
  "طحنة إسبريسو": "Espresso Grind",
  "طحنة فلتر": "Filter Grind",
  "طحنة فرنش بريس": "French Press Grind",
  "طحنة تركية": "Turkish Grind",
  "تحميص خفيف": "Light Roast",
  "تحميص متوسط": "Medium Roast",
  "تحميص داكن": "Dark Roast",

  // Colors
  أسود: "Black",
  اسود: "Black",
  أبيض: "White",
  ابيض: "White",
  أحمر: "Red",
  احمر: "Red",
  أزرق: "Blue",
  ازرق: "Blue",
  سماوي: "Sky Blue",
  كحلي: "Navy",
  أخضر: "Green",
  اخضر: "Green",
  زيتي: "Olive",
  أصفر: "Yellow",
  اصفر: "Yellow",
  برتقالي: "Orange",
  وردي: "Pink",
  بنفسجي: "Purple",
  موف: "Mauve",
  بيج: "Beige",
  بني: "Brown",
  عسلي: "Honey Brown",
  رمادي: "Grey",
  فضي: "Silver",
  ذهبي: "Gold",
  عنابي: "Burgundy",
  ماروني: "Maroon",
  "سكري/أوفوايت": "Off-White",
  أوفوايت: "Off-White",
  عاجي: "Ivory",
};

// Invert to build EN -> AR lookup map
const EN_TO_AR_MAP: Record<string, string> = {};
for (const [ar, en] of Object.entries(AR_TO_EN_MAP)) {
  const enLower = en.toLowerCase();
  if (!EN_TO_AR_MAP[enLower]) {
    EN_TO_AR_MAP[enLower] = ar;
  }
}

// Add common English-only phrases
EN_TO_AR_MAP["regular"] = "عادية";
EN_TO_AR_MAP["classic"] = "كلاسيك";
EN_TO_AR_MAP["standard"] = "قياسي";
EN_TO_AR_MAP["sugar free"] = "بدون سكر";
EN_TO_AR_MAP["sugar-free"] = "بدون سكر";
EN_TO_AR_MAP["no sugar"] = "بدون سكر";
EN_TO_AR_MAP["zero sugar"] = "بدون سكر";
EN_TO_AR_MAP["low sugar"] = "قليل السكر";
EN_TO_AR_MAP["pistachio"] = "فستق";
EN_TO_AR_MAP["walnut"] = "جوز";
EN_TO_AR_MAP["almond"] = "لوز";
EN_TO_AR_MAP["cashew"] = "كاجو";
EN_TO_AR_MAP["saffron"] = "زعفران";
EN_TO_AR_MAP["cardamom"] = "هيل";
EN_TO_AR_MAP["chocolate"] = "شوكولاتة";
EN_TO_AR_MAP["dark chocolate"] = "شوكولاتة داكنة";
EN_TO_AR_MAP["white chocolate"] = "شوكولاتة بيضاء";
EN_TO_AR_MAP["small"] = "صغير";
EN_TO_AR_MAP["medium"] = "وسط";
EN_TO_AR_MAP["large"] = "كبير";
EN_TO_AR_MAP["mini"] = "ميني";
EN_TO_AR_MAP["single"] = "مفرد";
EN_TO_AR_MAP["double"] = "مزدوج";
EN_TO_AR_MAP["tin box"] = "علبة قصدير";
EN_TO_AR_MAP["luxury box"] = "بوكس فاخر";

/**
 * Checks if a string contains Arabic characters.
 */
export function hasArabicLetters(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}

/**
 * Normalizes text for dictionary comparison (trims, handles punctuation).
 */
function normalizeKey(str: string): string {
  return str
    .trim()
    .replace(/[ـ\s]+/g, " ")
    .toLowerCase();
}

/**
 * Parses dual-language inputs if written with a separator like:
 * "عادية / Regular" or "بدون سكر - Sugar Free" or "فستق (Pistachio)"
 */
export function parseBilingualOption(value: string): { ar?: string; en?: string } | null {
  if (!value) return null;

  // Slash notation: "عادية / Regular" or "Regular / عادية"
  if (value.includes("/")) {
    const parts = value.split("/").map((p) => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const p1IsAr = hasArabicLetters(parts[0]);
      const p2IsAr = hasArabicLetters(parts[1]);
      if (p1IsAr && !p2IsAr) return { ar: parts[0], en: parts[1] };
      if (!p1IsAr && p2IsAr) return { ar: parts[1], en: parts[0] };
    }
  }

  // Parenthesis notation: "عادية (Regular)" or "Regular (عادية)"
  const parenMatch = value.match(/^(.*?)\s*\((.*?)\)$/);
  if (parenMatch) {
    const main = parenMatch[1].trim();
    const sub = parenMatch[2].trim();
    if (main && sub) {
      const mainIsAr = hasArabicLetters(main);
      const subIsAr = hasArabicLetters(sub);
      if (mainIsAr && !subIsAr) return { ar: main, en: sub };
      if (!mainIsAr && subIsAr) return { ar: sub, en: main };
    }
  }

  return null;
}

/**
 * Translates a variant option value according to the target language ("ar" | "en").
 * If the value cannot be translated, it safely falls back to the original text.
 */
export function translateOptionValue(
  value: string | null | undefined,
  targetLang: "ar" | "en",
): string {
  if (!value) return "";
  const raw = value.trim();
  if (!raw) return "";

  // 1. Check if the value itself contains bilingual parts ("عادية / Regular")
  const bilingual = parseBilingualOption(raw);
  if (bilingual) {
    if (targetLang === "ar" && bilingual.ar) return bilingual.ar;
    if (targetLang === "en" && bilingual.en) return bilingual.en;
  }

  const isRawArabic = hasArabicLetters(raw);

  // 2. If target is English but source is Arabic
  if (targetLang === "en") {
    if (!isRawArabic) return raw; // Already English/numeric

    const direct = AR_TO_EN_MAP[raw];
    if (direct) return direct;

    const normalized = normalizeKey(raw);
    const normalizedMatch = AR_TO_EN_MAP[normalized];
    if (normalizedMatch) return normalizedMatch;

    // Check with prefixes stripped (e.g. "بالنكهة العادية", "نكهة عادية")
    const cleanFlavor = raw.replace(/^(نكهة|طعم|بالنكهة|خيار)\s+/i, "").trim();
    if (cleanFlavor !== raw && AR_TO_EN_MAP[cleanFlavor]) {
      return AR_TO_EN_MAP[cleanFlavor];
    }

    return raw;
  }

  // 3. If target is Arabic but source is English
  if (targetLang === "ar") {
    if (isRawArabic) return raw; // Already Arabic

    const normalized = normalizeKey(raw);
    const direct = EN_TO_AR_MAP[normalized];
    if (direct) return direct;

    return raw;
  }

  return raw;
}
