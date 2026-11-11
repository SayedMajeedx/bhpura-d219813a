/**
 * The areas of Bahrain an address names, each by a stable value kept on the customer's address and
 * a name in each language. Offered alphabetically in the reader's language (`regionsInOrder`).
 * A value is never renamed or removed: saved addresses and travel fees keep it. The list once had
 * 32 areas, and a shopper in Sadad could not give her address (the owner's report of 2026-11-11).
 */
export const BAHRAIN_REGIONS: { value: string; en: string; ar: string }[] = [
  { value: "manama", en: "Manama", ar: "المنامة" },
  { value: "muharraq", en: "Muharraq", ar: "المحرق" },
  { value: "riffa", en: "Riffa", ar: "الرفاع" },
  { value: "hamad_town", en: "Hamad Town", ar: "مدينة حمد" },
  { value: "isa_town", en: "Isa Town", ar: "مدينة عيسى" },
  { value: "hidd", en: "Hidd", ar: "الحد" },
  { value: "budaiya", en: "Budaiya", ar: "البديع" },
  { value: "sanabis", en: "Sanabis", ar: "السنابس" },
  { value: "juffair", en: "Juffair", ar: "الجفير" },
  { value: "seef", en: "Seef", ar: "السيف" },
  { value: "saar", en: "Saar", ar: "سار" },
  { value: "sitra", en: "Sitra", ar: "سترة" },
  { value: "amwaj", en: "Amwaj Islands", ar: "جزر أمواج" },
  { value: "adliya", en: "Adliya", ar: "العدلية" },
  { value: "gudaibiya", en: "Gudaibiya", ar: "القضيبية" },
  { value: "salmaniya", en: "Salmaniya", ar: "السلمانية" },
  { value: "tubli", en: "Tubli", ar: "توبلي" },
  { value: "jidhafs", en: "Jidhafs", ar: "جدحفص" },
  { value: "aali", en: "A'ali", ar: "عالي" },
  { value: "zallaq", en: "Zallaq", ar: "الزلاق" },
  { value: "durrat", en: "Durrat Al Bahrain", ar: "درة البحرين" },
  { value: "askar", en: "Askar", ar: "عسكر" },
  { value: "jasra", en: "Jasra", ar: "الجسرة" },
  { value: "diyar", en: "Diyar Al Muharraq", ar: "ديار المحرق" },
  { value: "busaiteen", en: "Busaiteen", ar: "البسيتين" },
  { value: "galali", en: "Galali", ar: "قلالي" },
  { value: "arad", en: "Arad", ar: "عراد" },
  { value: "malikiya", en: "Malikiya", ar: "المالكية" },
  { value: "karzakan", en: "Karzakan", ar: "كرزكان" },
  { value: "duraz", en: "Duraz", ar: "الدراز" },
  { value: "bani_jamra", en: "Bani Jamra", ar: "بني جمرة" },
  { value: "north_city", en: "Northern City", ar: "مدينة سلمان" },
  { value: "hoora", en: "Hoora", ar: "الحورة" },
  { value: "mahooz", en: "Mahooz", ar: "الماحوز" },
  { value: "um_al_hassam", en: "Umm Al Hassam", ar: "أم الحصم" },
  { value: "zinj", en: "Zinj", ar: "الزنج" },
  { value: "naim", en: "Naim", ar: "النعيم" },
  { value: "ras_rumman", en: "Ras Rumman", ar: "رأس رمان" },
  { value: "diplomatic_area", en: "Diplomatic Area", ar: "المنطقة الدبلوماسية" },
  { value: "bahrain_bay", en: "Bahrain Bay", ar: "خليج البحرين" },
  { value: "bu_ghazal", en: "Bu Ghazal", ar: "بوغزال" },
  { value: "qufool", en: "Qufool", ar: "القفول" },
  { value: "ghuraifa", en: "Ghuraifa", ar: "الغريفة" },
  { value: "mina_salman", en: "Mina Salman", ar: "ميناء سلمان" },
  { value: "salihiya", en: "Salihiya", ar: "الصالحية" },
  { value: "bilad_al_qadeem", en: "Bilad Al Qadeem", ar: "البلاد القديم" },
  { value: "khamis", en: "Khamis", ar: "الخميس" },
  { value: "daih", en: "Daih", ar: "الديه" },
  { value: "jid_ali", en: "Jid Ali", ar: "جد علي" },
  { value: "salmabad", en: "Salmabad", ar: "سلماباد" },
  { value: "sanad", en: "Sanad", ar: "سند" },
  { value: "jurdab", en: "Jurdab", ar: "جرداب" },
  { value: "eker", en: "Eker", ar: "عكر" },
  { value: "nuwaidrat", en: "Nuwaidrat", ar: "النويدرات" },
  { value: "maameer", en: "Ma'ameer", ar: "المعامير" },
  { value: "nabih_saleh", en: "Nabih Saleh", ar: "النبيه صالح" },
  { value: "karbabad", en: "Karbabad", ar: "كرباباد" },
  { value: "water_garden_city", en: "Water Garden City", ar: "مدينة الواجهة البحرية" },
  { value: "wadiyan", en: "Wadiyan", ar: "الواديان" },
  { value: "mahaza", en: "Mahaza", ar: "مهزة" },
  { value: "kharijiya", en: "Kharijiya", ar: "الخارجية" },
  { value: "sufala", en: "Sufala", ar: "سفالة" },
  { value: "abul_aish", en: "Abul Aish", ar: "أبو العيش" },
  { value: "marquban", en: "Marquban", ar: "مركوبان" },
  { value: "samaheej", en: "Samaheej", ar: "سماهيج" },
  { value: "dair", en: "Dair", ar: "الدير" },
  { value: "halat_bu_maher", en: "Halat Bu Maher", ar: "حالة بوماهر" },
  { value: "halat_al_naim", en: "Halat Al Naim", ar: "حالة النعيم" },
  { value: "halat_al_sulta", en: "Halat Al Sulta", ar: "حالة السلطة" },
  { value: "dilmunia", en: "Dilmunia", ar: "دلمونيا" },
  { value: "marassi", en: "Marassi Al Bahrain", ar: "مراسي البحرين" },
  { value: "sadad", en: "Sadad", ar: "صدد" },
  { value: "abu_saiba", en: "Abu Saiba", ar: "أبو صيبع" },
  { value: "hajar", en: "Al Hajar", ar: "الحجر" },
  { value: "lawzi", en: "Al Lawzi", ar: "اللوزي" },
  { value: "markh", en: "Al Markh", ar: "المرخ" },
  { value: "qadam", en: "Al Qadam", ar: "القدم" },
  { value: "qala", en: "Al Qala", ar: "القلعة" },
  { value: "safriya", en: "Al Safriya", ar: "الصافرية" },
  { value: "barbar", en: "Barbar", ar: "باربار" },
  { value: "buri", en: "Buri", ar: "بوري" },
  { value: "bu_quwa", en: "Bu Quwa", ar: "بوقوة" },
  { value: "dar_kulaib", en: "Dar Kulaib", ar: "دار كليب" },
  { value: "dumistan", en: "Dumistan", ar: "دمستان" },
  { value: "hamala", en: "Hamala", ar: "الهملة" },
  { value: "hillat_abdul_saleh", en: "Hillat Abdul Saleh", ar: "حلة عبدالصالح" },
  { value: "jablat_habshi", en: "Jablat Habshi", ar: "جبلة حبشي" },
  { value: "janabiya", en: "Janabiya", ar: "الجنبية" },
  { value: "jannusan", en: "Jannusan", ar: "جنوسان" },
  { value: "jid_al_haj", en: "Jid Al Haj", ar: "جد الحاج" },
  { value: "karrana", en: "Karrana", ar: "كرانة" },
  { value: "muqaba", en: "Muqaba", ar: "مقابة" },
  { value: "sehla", en: "Sehla", ar: "السهلة" },
  { value: "qurayya", en: "Qurayya", ar: "القرية" },
  { value: "shahrakan", en: "Shahrakan", ar: "شهركان" },
  { value: "shakhura", en: "Shakhura", ar: "الشاخورة" },
  { value: "maqsha", en: "Maqsha", ar: "المقشع" },
  { value: "musalla", en: "Musalla", ar: "المصلى" },
  { value: "zayed_town", en: "Zayed Town", ar: "مدينة زايد" },
  { value: "riffa_east", en: "East Riffa", ar: "الرفاع الشرقي" },
  { value: "riffa_west", en: "West Riffa", ar: "الرفاع الغربي" },
  { value: "buhair", en: "Buhair", ar: "البحير" },
  { value: "hajiyat", en: "Hajiyat", ar: "الحجيات" },
  { value: "awali", en: "Awali", ar: "عوالي" },
  { value: "jaw", en: "Jaw", ar: "جو" },
  { value: "dur", en: "Al Dur", ar: "الدور" },
  { value: "sakhir", en: "Sakhir", ar: "الصخير" },
  { value: "wadi_al_sail", en: "Wadi Al Sail", ar: "وادي السيل" },
  { value: "areen", en: "Al Areen", ar: "العرين" },
  { value: "bu_kowarah", en: "Bu Kowarah", ar: "بوكوارة" },
  { value: "hunainiya", en: "Hunainiya", ar: "الحنينية" },
  { value: "khalifa_town", en: "Khalifa Town", ar: "مدينة خليفة" },
  { value: "bilaj_al_jazayer", en: "Bilaj Al Jazayer", ar: "بلاج الجزائر" },
  { value: "hawar", en: "Hawar Islands", ar: "جزر حوار" },
];

/** The areas in the reader's alphabetical order, so a shopper finds hers in a long list. */
export function regionsInOrder(lang: "en" | "ar") {
  const collator = new Intl.Collator(lang === "ar" ? "ar" : "en");
  return [...BAHRAIN_REGIONS].sort((a, b) => collator.compare(a[lang], b[lang]));
}

export function regionLabel(value: string | null | undefined, lang: "en" | "ar") {
  if (!value) return "";
  const found = BAHRAIN_REGIONS.find((r) => r.value === value);
  if (found) return lang === "ar" ? found.ar : found.en;
  return value;
}

export type StructuredAddress = {
  id?: string;
  label?: string | null;
  region?: string | null;
  block?: string | null;
  road?: string | null;
  house?: string | null;
  flat?: string | null;
  floor?: string | null;
  landmark?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  delivery_notes?: string | null;
  is_default?: boolean;
};

/**
 * Translate common Arabic address terms into English equivalents so that
 * free-text address fields render correctly on the English invoice even
 * when the user typed them in Arabic.
 */
const AR_ADDRESS_TERMS: Array<[RegExp, string]> = [
  [/مجمع/g, "Block"],
  [/مجمّع/g, "Block"],
  [/مجموعة/g, "Block"],
  [/طريق/g, "Road"],
  [/شارع/g, "Street"],
  [/منزل/g, "House"],
  [/بيت/g, "House"],
  [/شقة/g, "Flat"],
  [/مبنى/g, "Building"],
  [/مبني/g, "Building"],
];

export function translateArabicAddressTerms(
  s: string | null | undefined,
  lang: "en" | "ar",
): string {
  if (!s) return "";
  if (lang !== "en") return s;
  let out = s;
  for (const [re, en] of AR_ADDRESS_TERMS) out = out.replace(re, en);
  return out;
}

/** Compact one-line address for pickers and lists. */
export function formatAddressLine(
  a: StructuredAddress | null | undefined,
  lang: "en" | "ar",
): string {
  if (!a) return "";
  const region = regionLabel(a.region, lang);
  const block = translateArabicAddressTerms(a.block?.trim() || "", lang);
  const road = translateArabicAddressTerms(a.road?.trim() || "", lang);
  const house = translateArabicAddressTerms(a.house?.trim() || "", lang);
  const flat = translateArabicAddressTerms(a.flat?.trim() || "", lang);
  const parts =
    lang === "ar" ? [region, block, road, house, flat] : [flat, house, road, block, region];
  const sep = lang === "ar" ? "، " : ", ";
  return parts.filter((p) => p && p.length > 0).join(sep);
}

/**
 * Labeled multi-part address for invoices, order details, and thank-you pages.
 * EN: "Block: 428, Road: 2825, House: 12, Flat: 4, Manama"
 * AR: "المنطقة: المنامة، المجمع: 428، طريق: 2825، منزل: 12، شقة: 4"
 * Flat is optional; empty fields are skipped.
 */
export function formatAddressDetailed(
  a: StructuredAddress | null | undefined,
  lang: "en" | "ar",
): string {
  if (!a) return "";
  const region = regionLabel(a.region, lang);
  const block = translateArabicAddressTerms(a.block?.trim() || "", lang);
  const road = translateArabicAddressTerms(a.road?.trim() || "", lang);
  const house = translateArabicAddressTerms(a.house?.trim() || "", lang);
  const flat = translateArabicAddressTerms(a.flat?.trim() || "", lang);
  const parts: string[] = [];
  if (lang === "ar") {
    if (region) parts.push(`المنطقة: ${region}`);
    if (block) parts.push(`المجمع: ${block}`);
    if (road) parts.push(`طريق: ${road}`);
    if (house) parts.push(`منزل: ${house}`);
    if (flat) parts.push(`شقة: ${flat}`);
    return parts.join("، ");
  }
  if (block) parts.push(`Block: ${block}`);
  if (road) parts.push(`Road: ${road}`);
  if (house) parts.push(`House: ${house}`);
  if (flat) parts.push(`Flat: ${flat}`);
  if (region) parts.push(region);
  return parts.join(", ");
}
