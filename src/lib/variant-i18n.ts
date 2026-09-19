/**
 * Bilingual variant options translation and localization engine.
 * Automatically translates common retail, fashion, fabrics, jewelry, food, sweets,
 * coffee, perfumes, and custom option values between Arabic and English when the
 * customer toggles the storefront language.
 *
 * Tier 1: Instant high-precision retail lexicon (0ms, zero API cost).
 * Tier 2: Smart compound phrase and modifier tokenizer.
 * Tier 3: Dynamic persistent translation cache (DB + localStorage).
 */

// ============================================================================
// 1. BASE ARABIC -> ENGLISH LEXICON
// ============================================================================
const AR_TO_EN_MAP: Record<string, string> = {
  // --- Fabrics, Textiles & Materials (Fashion, Abayas, Apparel) ---
  حرير: "Silk",
  "حرير طبيعي": "Natural Silk",
  "حرير مغسول": "Washed Silk",
  "حرير إيطالي": "Italian Silk",
  "حرير ياباني": "Japanese Silk",
  "حرير هندي": "Indian Silk",
  شيفون: "Chiffon",
  "شيفون ناعم": "Soft Chiffon",
  "شيفون ليزر": "Laser Chiffon",
  كتان: "Linen",
  "كتان طبيعي": "Natural Linen",
  "كتان بارد": "Cool Linen",
  "كتان صيفي": "Summer Linen",
  "كتان هندي": "Indian Linen",
  قطن: "Cotton",
  "قطن 100%": "100% Cotton",
  "قطن مصري": "Egyptian Cotton",
  "قطن عضوي": "Organic Cotton",
  "قطن معالج": "Treated Cotton",
  صوف: "Wool",
  "صوف طبيعي": "Natural Wool",
  "صوف كشمير": "Cashmere Wool",
  كشمير: "Cashmere",
  مخمل: "Velvet",
  "مخمل ناعم": "Soft Velvet",
  "مخمل كوري": "Korean Velvet",
  ساتان: "Satin",
  ستان: "Satin",
  "ساتان حريري": "Silk Satin",
  كريب: "Crepe",
  "كريب ملكي": "Royal Crepe",
  "كريب سعودي": "Saudi Crepe",
  "كريب كوري": "Korean Crepe",
  "كريب ناعم": "Soft Crepe",
  دانتيل: "Lace",
  "دانتيل فرنسي": "French Lace",
  تول: "Tulle",
  "تول ناعم": "Soft Tulle",
  أورجانزا: "Organza",
  اورجانزا: "Organza",
  جلد: "Leather",
  "جلد طبيعي": "Genuine Leather",
  "جلد صناعي": "Faux Leather",
  جينز: "Denim",
  دنيم: "Denim",
  بوليستر: "Polyester",
  نايلون: "Nylon",
  ليكرا: "Lycra",
  سباندكس: "Spandex",
  فسكوز: "Viscose",
  ريون: "Rayon",
  قنب: "Canvas",
  كانفاس: "Canvas",
  شامواه: "Suede",
  سويدي: "Suede",
  فرو: "Fur",
  "فرو صناعي": "Faux Fur",
  "قماش شبكي": "Mesh",
  تور: "Mesh",
  تويد: "Tweed",
  جورجيت: "Georgette",
  جاكار: "Jacquard",
  ميكادو: "Mikado",
  تافتا: "Taffeta",

  // --- Food, Sweets, Pastries & Bakery Options ---
  عادية: "Regular",
  عادي: "Regular",
  كلاسيك: "Classic",
  قياسي: "Standard",
  "بدون سكر": "Sugar Free",
  "خالي من السكر": "Sugar Free",
  "قليل السكر": "Low Sugar",
  "بدون إضافات": "Plain",
  سادة: "Plain",
  فستق: "Pistachio",
  بستاشيو: "Pistachio",
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
  "شوكولاتة بالحليب": "Milk Chocolate",
  "شوكولاتة بلجيكية": "Belgian Chocolate",
  "شوكولاتة داكنة": "Dark Chocolate",
  "شوكولاتة بيضاء": "White Chocolate",
  نوتيلا: "Nutella",
  لوتس: "Lotus",
  "لوتس مقرمش": "Crunchy Lotus",
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
  "عسل طبيعي": "Natural Honey",
  ورد: "Rose",
  "ماء ورد": "Rose Water",
  توت: "Berries",
  "توت أزرق": "Blueberry",
  "بلو بيري": "Blueberry",
  "توت بري": "Wild Berries",
  "توت أحمر": "Red Berries",
  فراولة: "Strawberry",
  مانجو: "Mango",
  ليمون: "Lemon",
  برتقال: "Orange",
  قهوة: "Coffee",
  ماتشا: "Matcha",
  كرز: "Cherry",
  رمان: "Pomegranate",
  "باشن فروت": "Passion Fruit",
  أناناس: "Pineapple",
  موز: "Banana",
  "جوز الهند": "Coconut",
  "فول سوداني": "Peanut",
  "زبدة الفول السوداني": "Peanut Butter",
  "مكسرات مشكلة": "Mixed Nuts",
  "مكسرات فاخرة": "Premium Nuts",
  "مكسرات مكرملة": "Caramelized Nuts",
  تشيزكيك: "Cheesecake",
  "تشيز كيك": "Cheesecake",
  تيراميسو: "Tiramisu",
  كوكيز: "Cookies",
  براونيز: "Brownies",
  "ريد فيلفيت": "Red Velvet",
  "غزل البنات": "Cotton Candy",
  سمسم: "Sesame",
  سمسمية: "Sesame Brittle",
  رهش: "Halva",
  "حلاوة طحينية": "Halva",
  طحينة: "Tahini",
  "دبس التمر": "Date Syrup",
  مستكة: "Mastic",
  يانسون: "Anise",
  زعتر: "Zaatar",
  سماق: "Sumac",
  زنجبيل: "Ginger",
  نعناع: "Mint",
  "بدون مكسرات": "Nut Free",
  "خالي من الجلوتين": "Gluten Free",
  "بدون جلوتين": "Gluten Free",
  نباتي: "Vegan",
  عضوي: "Organic",
  "بدون حليب": "Dairy Free",
  "خالي من مشتقات الحليب": "Dairy Free",
  كيتو: "Keto",

  // --- Perfumes, Scents & Incense ---
  عود: "Oud",
  "دهن عود": "Pure Oud Oil",
  "عود كمبودي": "Cambodian Oud",
  "عود هندي": "Indian Oud",
  "عود معطر": "Scented Oud",
  مسك: "Musk",
  "مسك أبيض": "White Musk",
  "مسك الختام": "Musk Al Khitam",
  "مسك الطهارة": "Taharah Musk",
  عنبر: "Amber",
  صندل: "Sandalwood",
  "خشب الصندل": "Sandalwood",
  "خشب الأرز": "Cedarwood",
  باتشولي: "Patchouli",
  ياسمين: "Jasmine",
  فل: "Arabian Jasmine",
  بخور: "Bakhoor",
  لبان: "Frankincense",
  "لبان حوجري": "Hojari Frankincense",
  زهري: "Floral",
  خشبي: "Woody",
  حمضي: "Citrus",
  شرقي: "Oriental",

  // --- Packaging & Boxes ---
  بوكس: "Box",
  علبة: "Box",
  صندوق: "Box",
  كرتون: "Carton",
  كرتونة: "Carton",
  باكيت: "Pack",
  كيس: "Bag",
  ظرف: "Pouch",
  أكياس: "Bags",
  ظروف: "Pouches",
  علب: "Boxes",
  بوكسات: "Boxes",
  صناديق: "Boxes",
  "بوكس فاخر": "Luxury Box",
  "علبة فاخرة": "Luxury Box",
  "صندوق فاخر": "Luxury Box",
  "صندوق هدايا": "Gift Box",
  "علبة هدايا": "Gift Box",
  "علبة قصدير": "Tin Box",
  "علبة حديد": "Tin Box",
  "علبة صفيح": "Tin Box",
  "علبة كرتون": "Carton Box",
  "علبة خشبية": "Wooden Box",
  "تغليف هدايا": "Gift Wrapping",
  "تغليف خاص": "Special Packaging",
  "تغليف فاخر": "Luxury Packaging",
  "بدون تغليف": "Standard Packaging",
  "كيس قماشي": "Cloth Pouch",
  "كيس ورقي": "Paper Bag",
  "شريط أحمر": "Red Ribbon",
  "شريط ذهبي": "Gold Ribbon",
  "كرت إهداء": "Greeting Card",

  // --- Quantities, Counts & Weights ---
  حبة: "Piece",
  قطعة: "Piece",
  "حبة واحدة": "1 Piece",
  حبتين: "2 Pieces",
  قطعتين: "2 Pieces",
  "3 حبات": "3 Pieces",
  "4 حبات": "4 Pieces",
  "5 حبات": "5 Pieces",
  "6 حبات": "6 Pieces",
  "8 حبات": "8 Pieces",
  "10 حبات": "10 Pieces",
  "12 حبة": "12 Pieces",
  "24 حبة": "24 Pieces",
  "نصف درزن": "Half Dozen (6 pcs)",
  درزن: "Dozen (12 pcs)",
  درزنين: "2 Dozen (24 pcs)",
  "صحن صغير": "Small Plate",
  "صحن وسط": "Medium Plate",
  "صحن كبير": "Large Plate",
  كيلو: "1 Kg",
  "1 كيلو": "1 Kg",
  "نصف كيلو": "500g (Half Kg)",
  "ربع كيلو": "250g (Quarter Kg)",
  "2 كيلو": "2 Kg",
  "5 كيلو": "5 Kg",
  "100 غرام": "100g",
  "100غ": "100g",
  "200 غرام": "200g",
  "200غ": "200g",
  "250 غرام": "250g",
  "250غ": "250g",
  "500 غرام": "500g",
  "500غ": "500g",
  "700 غرام": "700g",
  "700غ": "700g",
  "750 غرام": "750g",
  "750غ": "750g",
  "1000 غرام": "1000g",
  "1000غ": "1000g",

  // --- General Sizes / Fits / Sets ---
  صغير: "Small",
  وسط: "Medium",
  كبير: "Large",
  "كبير جداً": "X-Large",
  "كبير جدا": "X-Large",
  ميني: "Mini",
  جمبو: "Jumbo",
  جامبو: "Jumbo",
  مفرد: "Single",
  مزدوج: "Double",
  عائلي: "Family Size",
  "حجم عائلي": "Family Size",
  "حجم صغير": "Small Size",
  "حجم وسط": "Medium Size",
  "حجم كبير": "Large Size",
  "حجم تجريبي": "Sample Size",
  عينة: "Sample",
  "مقاس موحد": "One Size",
  "مقاس واحد": "One Size",
  "مقاس حر": "Free Size",
  "حجم واحد": "One Size",
  طقم: "Set",
  مجموعة: "Set",
  "طقم كامل": "Full Set",
  "نصف طقم": "Half Set",
  مفتوح: "Open",
  مغلق: "Closed",
  قصير: "Short",
  طويل: "Long",

  // --- Coffee & Roastery ---
  "حبوب كاملة": "Whole Beans",
  حبوب: "Beans",
  مطحون: "Ground",
  مطحونة: "Ground Coffee",
  إسبريسو: "Espresso",
  اسبريسو: "Espresso",
  فلتر: "Filter",
  مقطرة: "Drip",
  "كولد برو": "Cold Brew",
  "فرنش برس": "French Press",
  "فرينش برس": "French Press",
  "كيمكس": "Chemex",
  "v60": "V60",
  "V60": "V60",
  "طحنة إسبريسو": "Espresso Grind",
  "طحنة اسبريسو": "Espresso Grind",
  "طحنة فلتر": "Filter Grind",
  "طحنة فرنش بريس": "French Press Grind",
  "طحنة تركية": "Turkish Grind",
  "تحميص خفيف": "Light Roast",
  "حمص خفيف": "Light Roast",
  "تحميص متوسط": "Medium Roast",
  "حمص متوسط": "Medium Roast",
  "تحميص داكن": "Dark Roast",
  "حمص داكن": "Dark Roast",
  "حمص غامق": "Dark Roast",
  "بدون كافيين": "Decaf",
  "خالي من الكافيين": "Decaf",
  ديكاف: "Decaf",
  كوب: "Cup",
  أكواب: "Cups",
  "مع كوب": "With Cup",
  "بدون كوب": "Without Cup",
  "شامل الكوب": "Includes Cup",
  إثيوبيا: "Ethiopia",
  اثيوبيا: "Ethiopia",
  أثيوبيا: "Ethiopia",
  كولومبيا: "Colombia",
  البرازيل: "Brazil",
  برازيلي: "Brazilian",
  غواتيمالا: "Guatemala",
  جواتيمالا: "Guatemala",
  كوستاريكا: "Costa Rica",
  كينيا: "Kenya",
  كيني: "Kenyan",
  اليمن: "Yemen",
  يمني: "Yemeni",
  السلفادور: "El Salvador",
  بنما: "Panama",
  رواندا: "Rwanda",
  إندونيسيا: "Indonesia",
  اندونيسيا: "Indonesia",
  توليفة: "Blend",
  محصول: "Crop / Harvest",
  مختصة: "Specialty",

  // --- Colors & Shades ---
  أسود: "Black",
  اسود: "Black",
  "أسود ملكي": "Royal Black",
  "أسود فاحم": "Deep Black",
  أبيض: "White",
  ابيض: "White",
  "أبيض ناصع": "Pure White",
  أحمر: "Red",
  احمر: "Red",
  "أحمر داكن": "Dark Red",
  "أحمر قاني": "Crimson",
  أزرق: "Blue",
  ازرق: "Blue",
  "أزرق داكن": "Dark Blue",
  "أزرق فاتح": "Light Blue",
  سماوي: "Sky Blue",
  كحلي: "Navy",
  نيلي: "Indigo",
  أخضر: "Green",
  اخضر: "Green",
  "أخضر فاتح": "Light Green",
  "أخضر داكن": "Dark Green",
  زيتي: "Olive",
  "أخضر زيتي": "Olive Green",
  زمردي: "Emerald",
  أصفر: "Yellow",
  اصفر: "Yellow",
  خردلي: "Mustard",
  برتقالي: "Orange",
  وردي: "Pink",
  "وردي فاتح": "Light Pink",
  "وردي ناعم": "Soft Pink",
  "وردي داكن": "Dark Pink",
  فوشي: "Fuchsia",
  فوشيا: "Fuchsia",
  بنفسجي: "Purple",
  موف: "Mauve",
  لافندر: "Lavender",
  خزامي: "Lavender",
  ليلكي: "Lilac",
  بيج: "Beige",
  "بيج فاتح": "Light Beige",
  "بيج داكن": "Dark Beige",
  رملي: "Sand",
  نيود: "Nude",
  بني: "Brown",
  "بني فاتح": "Light Brown",
  "بني داكن": "Dark Brown",
  شوكولاتي: "Chocolate Brown",
  عسلي: "Honey Brown",
  رمادي: "Grey",
  "رمادي فاتح": "Light Grey",
  "رمادي داكن": "Dark Grey",
  رصاصي: "Grey",
  فحمي: "Charcoal",
  فضي: "Silver",
  ذهبي: "Gold",
  "ذهبي لامع": "Shiny Gold",
  "ذهبي مطفي": "Matte Gold",
  نحاسي: "Bronze",
  برونزي: "Bronze",
  عنابي: "Burgundy",
  ماروني: "Maroon",
  خمري: "Wine Red",
  "سكري/أوفوايت": "Off-White",
  أوفوايت: "Off-White",
  اوفوايت: "Off-White",
  عاجي: "Ivory",
  فيروزي: "Turquoise",
  تيل: "Teal",
  بترولي: "Petrol Blue",
  مرجاني: "Coral",
  مشمشي: "Peach",
  خوخي: "Peach",
};

// ============================================================================
// 2. INVERTED ENGLISH -> ARABIC LEXICON
// ============================================================================
const EN_TO_AR_MAP: Record<string, string> = {};

// Auto-invert all pairs
for (const [ar, en] of Object.entries(AR_TO_EN_MAP)) {
  const enLower = en.toLowerCase().trim();
  if (!EN_TO_AR_MAP[enLower]) {
    EN_TO_AR_MAP[enLower] = ar;
  }
}

// Additional common English commercial aliases
const EXTRA_EN_ALIASES: Record<string, string> = {
  regular: "عادية",
  classic: "كلاسيك",
  standard: "قياسي",
  "sugar free": "بدون سكر",
  "sugar-free": "بدون سكر",
  "no sugar": "بدون سكر",
  "zero sugar": "بدون سكر",
  "low sugar": "قليل السكر",
  plain: "سادة",
  silk: "حرير",
  chiffon: "شيفون",
  linen: "كتان",
  cotton: "قطن",
  wool: "صوف",
  velvet: "مخمل",
  satin: "ساتان",
  crepe: "كريب",
  lace: "دانتيل",
  leather: "جلد",
  cashmere: "كشمير",
  denim: "جينز",
  tulle: "تول",
  organza: "أورجانزا",
  pistachio: "فستق",
  walnut: "جوز",
  almond: "لوز",
  cashew: "كاجو",
  hazelnut: "بندق",
  saffron: "زعفران",
  cardamom: "هيل",
  cinnamon: "قرفة",
  chocolate: "شوكولاتة",
  "dark chocolate": "شوكولاتة داكنة",
  "white chocolate": "شوكولاتة بيضاء",
  "milk chocolate": "شوكولاتة بالحليب",
  caramel: "كراميل",
  "salted caramel": "كراميل مملح",
  vanilla: "فانيليا",
  small: "صغير",
  medium: "وسط",
  large: "كبير",
  "x-large": "كبير جداً",
  "xl": "كبير جداً",
  mini: "ميني",
  single: "مفرد",
  double: "مزدوج",
  box: "بوكس",
  boxes: "بوكسات",
  carton: "كرتونة",
  pack: "باكيت",
  packet: "باكيت",
  bag: "كيس",
  bags: "أكياس",
  pouch: "ظرف",
  pouches: "ظروف",
  cup: "كوب",
  cups: "أكواب",
  piece: "حبة",
  pieces: "حبات",
  dozen: "درزن",
  "one size": "مقاس موحد",
  "free size": "مقاس حر",
  set: "طقم",
  blend: "توليفة",
  ground: "مطحون",
  beans: "حبوب",
  "whole beans": "حبوب كاملة",
  decaf: "بدون كافيين",
  "tin box": "علبة قصدير",
  "luxury box": "بوكس فاخر",
  "gift box": "صندوق هدايا",
  black: "أسود",
  white: "أبيض",
  navy: "كحلي",
  "navy blue": "كحلي",
  beige: "بيج",
  grey: "رمادي",
  gray: "رمادي",
  silver: "فضي",
  gold: "ذهبي",
  burgundy: "عنابي",
  "off-white": "أوفوايت",
  "off white": "أوفوايت",
};

for (const [enKey, arVal] of Object.entries(EXTRA_EN_ALIASES)) {
  EN_TO_AR_MAP[enKey.toLowerCase().trim()] = arVal;
}

// ============================================================================
// 3. DYNAMIC RUNTIME & LOCAL PERSISTENCE CACHE
// ============================================================================
const DYNAMIC_AR_TO_EN = new Map<string, string>();
const DYNAMIC_EN_TO_AR = new Map<string, string>();

const STORAGE_KEY_AR_EN = "boutq_variant_i18n_ar_en_v1";
const STORAGE_KEY_EN_AR = "boutq_variant_i18n_en_ar_v1";

// Hydrate from localStorage in browser environment
if (typeof window !== "undefined") {
  try {
    const rawArEn = localStorage.getItem(STORAGE_KEY_AR_EN);
    if (rawArEn) {
      const parsed = JSON.parse(rawArEn);
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") DYNAMIC_AR_TO_EN.set(k.trim(), v.trim());
      }
    }
    const rawEnAr = localStorage.getItem(STORAGE_KEY_EN_AR);
    if (rawEnAr) {
      const parsed = JSON.parse(rawEnAr);
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") DYNAMIC_EN_TO_AR.set(k.trim().toLowerCase(), v.trim());
      }
    }
  } catch {
    // Ignore storage errors safely
  }
}

/**
 * Register dynamic translations into memory and localStorage.
 * Used whenever terms are fetched from the server translation cache or AI gateway.
 */
export function registerDynamicTranslations(
  records: Record<string, string>,
  targetLang: "ar" | "en",
) {
  if (!records || typeof records !== "object") return;

  const entries = Object.entries(records);
  if (entries.length === 0) return;

  for (const [source, translated] of entries) {
    if (!source || !translated) continue;
    const s = source.trim();
    const t = translated.trim();
    if (targetLang === "en") {
      DYNAMIC_AR_TO_EN.set(s, t);
      DYNAMIC_EN_TO_AR.set(t.toLowerCase(), s);
    } else {
      DYNAMIC_EN_TO_AR.set(s.toLowerCase(), t);
      DYNAMIC_AR_TO_EN.set(t, s);
    }
  }

  // Persist to localStorage if browser
  if (typeof window !== "undefined") {
    try {
      const currentArEn: Record<string, string> = {};
      DYNAMIC_AR_TO_EN.forEach((v, k) => {
        currentArEn[k] = v;
      });
      localStorage.setItem(STORAGE_KEY_AR_EN, JSON.stringify(currentArEn));

      const currentEnAr: Record<string, string> = {};
      DYNAMIC_EN_TO_AR.forEach((v, k) => {
        currentEnAr[k] = v;
      });
      localStorage.setItem(STORAGE_KEY_EN_AR, JSON.stringify(currentEnAr));
    } catch {
      // Ignore quota errors
    }
  }
}

// ============================================================================
// 4. SMART HELPERS & COMPOUND TOKENIZER
// ============================================================================

/**
 * Checks if a string contains Arabic characters.
 */
export function hasArabicLetters(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(text);
}

/**
 * Normalizes text for dictionary comparison (trims, handles tatweel, spaces).
 */
export function normalizeKey(str: string): string {
  return str
    .trim()
    .replace(/[ـ\s]+/g, " ")
    .toLowerCase();
}

/**
 * Strips Arabic definite article 'ال' if it helps match base dictionary words.
 */
function stripDefiniteArticle(word: string): string {
  if (word.startsWith("ال") && word.length > 3) {
    return word.slice(2);
  }
  return word;
}

/**
 * Parses dual-language inputs if written with a separator like:
 * "حرير / Silk" or "بدون سكر - Sugar Free" or "فستق (Pistachio)"
 */
export function parseBilingualOption(value: string): { ar?: string; en?: string } | null {
  if (!value) return null;

  // Slash notation: "حرير / Silk" or "Silk / حرير"
  if (value.includes("/")) {
    const parts = value.split("/").map((p) => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const p1IsAr = hasArabicLetters(parts[0]);
      const p2IsAr = hasArabicLetters(parts[1]);
      if (p1IsAr && !p2IsAr) return { ar: parts[0], en: parts[1] };
      if (!p1IsAr && p2IsAr) return { ar: parts[1], en: parts[0] };
    }
  }

  // Dash notation: "حرير - Silk"
  if (value.includes(" - ")) {
    const parts = value.split(" - ").map((p) => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const p1IsAr = hasArabicLetters(parts[0]);
      const p2IsAr = hasArabicLetters(parts[1]);
      if (p1IsAr && !p2IsAr) return { ar: parts[0], en: parts[1] };
      if (!p1IsAr && p2IsAr) return { ar: parts[1], en: parts[0] };
    }
  }

  // Parenthesis notation: "حرير (Silk)" or "Silk (حرير)"
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
 * Smart compound phrase resolution for 2-word Arabic retail terms
 * Examples:
 * - "حرير طبيعي" -> "Natural Silk"
 * - "كتان بارد" -> "Cool Linen"
 * - "وردي فاتح" -> "Light Pink"
 * - "أزرق داكن" -> "Dark Blue"
 * - "شوكولاتة بالحليب" -> "Milk Chocolate"
 */
function resolveArabicCompound(raw: string): string | null {
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const [w1, w2] = parts;

  // Modifier mapping for common retail adjectives
  const ADJECTIVES_MAP: Record<string, string> = {
    فاتح: "Light",
    غامق: "Dark",
    داكن: "Dark",
    طبيعي: "Natural",
    أصلي: "Authentic",
    فاخر: "Luxury",
    ملكي: "Royal",
    ناعم: "Soft",
    بارد: "Cool",
    صيفي: "Summer",
    شتوي: "Winter",
    مقرمش: "Crunchy",
    محمص: "Roasted",
    مملح: "Salted",
    عضوي: "Organic",
    بلجيكي: "Belgian",
    إيطالي: "Italian",
    ياباني: "Japanese",
    هندي: "Indian",
    فرنسي: "French",
  };

  // Case A: Noun + Adjective (e.g. "حرير طبيعي" -> "Natural Silk", "أزرق داكن" -> "Dark Blue")
  const adj2 = ADJECTIVES_MAP[w2] || ADJECTIVES_MAP[stripDefiniteArticle(w2)];
  const noun1 =
    AR_TO_EN_MAP[w1] ||
    AR_TO_EN_MAP[stripDefiniteArticle(w1)] ||
    AR_TO_EN_MAP[normalizeKey(w1)];

  if (noun1 && adj2) {
    return `${adj2} ${noun1}`;
  }

  // Case B: Adjective + Noun (e.g. "نصف كيلو" -> already in dict, but if any)
  const adj1 = ADJECTIVES_MAP[w1] || ADJECTIVES_MAP[stripDefiniteArticle(w1)];
  const noun2 =
    AR_TO_EN_MAP[w2] ||
    AR_TO_EN_MAP[stripDefiniteArticle(w2)] ||
    AR_TO_EN_MAP[normalizeKey(w2)];

  if (adj1 && noun2) {
    return `${adj1} ${noun2}`;
  }

  // Case C: "شوكولاتة بالحليب" (with milk)
  if (w2.startsWith("بال") && w2.length > 3) {
    const base2 = w2.slice(3);
    const nounWith = AR_TO_EN_MAP[base2] || AR_TO_EN_MAP[stripDefiniteArticle(base2)];
    if (noun1 && nounWith) {
      return `${nounWith} ${noun1}`;
    }
  }

  return null;
}

// ============================================================================
// 5. MAIN TRANSLATION FUNCTION
// ============================================================================

/**
 * Translates a variant option value according to the target language ("ar" | "en").
 * Guaranteed synchronous 0ms response.
 * If the value cannot be translated locally, returns original text while remaining
 * available for background AI resolution.
 */
export function translateOptionValue(
  value: string | null | undefined,
  targetLang: "ar" | "en",
): string {
  if (!value) return "";
  const raw = value.trim();
  if (!raw) return "";

  // 1. Check if the value itself contains bilingual parts ("حرير / Silk")
  const bilingual = parseBilingualOption(raw);
  if (bilingual) {
    if (targetLang === "ar" && bilingual.ar) return bilingual.ar;
    if (targetLang === "en" && bilingual.en) return bilingual.en;
  }

  const isRawArabic = hasArabicLetters(raw);

  // 2. If target is English
  if (targetLang === "en") {
    if (!isRawArabic) return raw; // Already English/numeric

    // 2a. Dynamic cache match (from server / prior AI translations)
    const dynamicMatch = DYNAMIC_AR_TO_EN.get(raw);
    if (dynamicMatch) return dynamicMatch;

    // 2b. Direct dictionary match
    const direct = AR_TO_EN_MAP[raw];
    if (direct) return direct;

    // 2c. Normalized key match
    const normalized = normalizeKey(raw);
    const normalizedMatch = AR_TO_EN_MAP[normalized];
    if (normalizedMatch) return normalizedMatch;

    // 2d. Without definite article ("الحرير" -> "حرير")
    const stripped = stripDefiniteArticle(raw);
    if (stripped !== raw && AR_TO_EN_MAP[stripped]) {
      return AR_TO_EN_MAP[stripped];
    }

    // 2e. Check prefixes stripped (e.g. "خامة حرير", "لون أسود", "نكهة فستق")
    const cleanPrefix = raw.replace(/^(خامة|قماش|لون|نكهة|طعم|بالنكهة|خيار)\s+/i, "").trim();
    if (cleanPrefix !== raw) {
      const prefixMatch =
        AR_TO_EN_MAP[cleanPrefix] ||
        AR_TO_EN_MAP[stripDefiniteArticle(cleanPrefix)] ||
        DYNAMIC_AR_TO_EN.get(cleanPrefix);
      if (prefixMatch) return prefixMatch;
    }

    // 2f. Smart compound phrase resolver ("حرير طبيعي", "كتان بارد", etc.)
    const compound = resolveArabicCompound(raw);
    if (compound) return compound;

    return raw;
  }

  // 3. If target is Arabic
  if (targetLang === "ar") {
    if (isRawArabic) return raw; // Already Arabic

    const normalized = normalizeKey(raw);

    // 3a. Dynamic cache match
    const dynamicMatch = DYNAMIC_EN_TO_AR.get(normalized);
    if (dynamicMatch) return dynamicMatch;

    // 3b. Direct inverted dictionary match
    const direct = EN_TO_AR_MAP[normalized];
    if (direct) return direct;

    return raw;
  }

  return raw;
}

/**
 * Checks whether a given option term already has a known translation (in lexicon or cache).
 */
export function hasKnownTranslation(value: string | null | undefined, targetLang: "ar" | "en"): boolean {
  if (!value) return true;
  const raw = value.trim();
  if (!raw) return true;

  const translated = translateOptionValue(raw, targetLang);
  const isAr = hasArabicLetters(raw);

  // If target is English, and source was Arabic, and output is different or no longer Arabic:
  if (targetLang === "en") {
    if (!isAr) return true;
    return translated !== raw && !hasArabicLetters(translated);
  }

  // If target is Arabic, and source was English:
  if (targetLang === "ar") {
    if (isAr) return true;
    return translated !== raw && hasArabicLetters(translated);
  }

  return true;
}

/**
 * Filters a list of option values and returns only those that lack a known translation.
 * Useful for queuing background batch translation jobs without redundant API calls.
 */
export function getUntranslatedTerms(
  terms: Array<string | null | undefined>,
  targetLang: "ar" | "en",
): string[] {
  const missing = new Set<string>();
  for (const t of terms) {
    if (!t) continue;
    const clean = t.trim();
    if (!clean) continue;
    if (!hasKnownTranslation(clean, targetLang)) {
      missing.add(clean);
    }
  }
  return Array.from(missing);
}
