/**
 * The GCC calendar's greeting occasions: their default wording in both
 * languages, when each falls (Islamic dates by the Umm al-Qura calendar, so
 * they move each year), and the store's own National Day. Besides the
 * religious and national days, a seasonal pack follows the retail year:
 * White Friday, New Year, back to school, graduation and summer.
 */

export type OccasionId =
  | "ramadan"
  | "eid-al-fitr"
  | "eid-al-adha"
  | "national-day"
  | "mothers-day"
  | "white-friday"
  | "new-year"
  | "back-to-school"
  | "graduation"
  | "summer";

type Words = { en: string; ar: string };

export type Occasion = {
  id: OccasionId;
  name: Words;
  greeting: Words;
  message: Words;
  hashtags: Words;
};

export const OCCASIONS: readonly Occasion[] = [
  {
    id: "ramadan",
    name: { en: "Ramadan", ar: "رمضان" },
    greeting: { en: "Ramadan Kareem", ar: "رمضان كريم" },
    message: { en: "Wishing you a blessed month", ar: "كل عام وأنتم بخير" },
    hashtags: { en: "#RamadanKareem #Ramadan", ar: "#رمضان_كريم #رمضان" },
  },
  {
    id: "eid-al-fitr",
    name: { en: "Eid al-Fitr", ar: "عيد الفطر" },
    greeting: { en: "Eid Mubarak", ar: "عيد فطر مبارك" },
    message: { en: "May your Eid be filled with joy", ar: "عساكم من عوّاده" },
    hashtags: { en: "#EidMubarak #EidAlFitr", ar: "#عيد_مبارك #عيد_الفطر" },
  },
  {
    id: "eid-al-adha",
    name: { en: "Eid al-Adha", ar: "عيد الأضحى" },
    greeting: { en: "Eid al-Adha Mubarak", ar: "عيد أضحى مبارك" },
    message: { en: "Wishing you and your family a blessed Eid", ar: "كل عام وأنتم بخير" },
    hashtags: { en: "#EidMubarak #EidAlAdha", ar: "#عيد_مبارك #عيد_الأضحى" },
  },
  {
    id: "national-day",
    name: { en: "National Day", ar: "العيد الوطني" },
    greeting: { en: "Happy National Day", ar: "عيد وطني سعيد" },
    message: { en: "Proud to celebrate with you", ar: "دام عزّك يا وطن" },
    hashtags: { en: "#NationalDay", ar: "#العيد_الوطني" },
  },
  {
    id: "mothers-day",
    name: { en: "Mother's Day", ar: "عيد الأم" },
    greeting: { en: "Happy Mother's Day", ar: "عيد أم سعيد" },
    message: { en: "To the one who taught us love", ar: "إلى من علّمتنا الحب" },
    hashtags: { en: "#MothersDay", ar: "#عيد_الأم" },
  },
  {
    id: "white-friday",
    name: { en: "White Friday", ar: "الجمعة البيضاء" },
    greeting: { en: "White Friday", ar: "الجمعة البيضاء" },
    message: { en: "Our biggest offers of the year", ar: "أقوى عروض السنة" },
    hashtags: { en: "#WhiteFriday", ar: "#الجمعة_البيضاء" },
  },
  {
    id: "new-year",
    name: { en: "New Year", ar: "رأس السنة" },
    greeting: { en: "Happy New Year", ar: "سنة جديدة سعيدة" },
    message: { en: "Thank you for a wonderful year", ar: "شكراً لأنكم كنتم معنا هذا العام" },
    hashtags: { en: "#HappyNewYear", ar: "#سنة_جديدة" },
  },
  {
    id: "back-to-school",
    name: { en: "Back to school", ar: "العودة للمدارس" },
    greeting: { en: "Back to school", ar: "العودة إلى المدارس" },
    message: { en: "Ready for a bright new year", ar: "استعدوا لعام دراسي مميز" },
    hashtags: { en: "#BackToSchool", ar: "#العودة_للمدارس" },
  },
  {
    id: "graduation",
    name: { en: "Graduation", ar: "التخرج" },
    greeting: { en: "Congratulations, graduates", ar: "مبروك التخرج" },
    message: { en: "Here's to what comes next", ar: "إلى نجاحات أكبر" },
    hashtags: { en: "#Graduation #ClassOf", ar: "#تخرج #مبروك_التخرج" },
  },
  {
    id: "summer",
    name: { en: "Summer", ar: "الصيف" },
    greeting: { en: "Hello, summer", ar: "أهلاً بالصيف" },
    message: { en: "Light pieces for long days", ar: "قطع خفيفة لأيام الصيف" },
    hashtags: { en: "#Summer", ar: "#صيف" },
  },
];

/** The seasonal pack: the retail year's moments, beside the religious and national days. */
export const SEASONAL_OCCASIONS: readonly OccasionId[] = [
  "white-friday",
  "new-year",
  "back-to-school",
  "graduation",
  "summer",
];

export function occasionById(id: OccasionId): Occasion {
  return OCCASIONS.find((occasion) => occasion.id === id) ?? OCCASIONS[0];
}

type Country = { name: Words; month: number; day: number };

/** Each GCC country's National Day, keyed by its currency. */
const COUNTRIES: Record<string, Country> = {
  BHD: { name: { en: "Bahrain", ar: "البحرين" }, month: 12, day: 16 },
  SAR: { name: { en: "Saudi Arabia", ar: "السعودية" }, month: 9, day: 23 },
  AED: { name: { en: "UAE", ar: "الإمارات" }, month: 12, day: 2 },
  KWD: { name: { en: "Kuwait", ar: "الكويت" }, month: 2, day: 25 },
  QAR: { name: { en: "Qatar", ar: "قطر" }, month: 12, day: 18 },
  OMR: { name: { en: "Oman", ar: "عُمان" }, month: 11, day: 20 },
};

/** The store's country (from its currency; Bahrain when it is not a GCC currency). */
export function storeCountry(currency: string | null | undefined): Country {
  return COUNTRIES[(currency ?? "").toUpperCase()] ?? COUNTRIES.BHD;
}

const hijriFormat = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

/** The Umm al-Qura date of a (UTC) day. */
export function hijriDate(date: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    hijriFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
  };
}

/** White Friday: the Friday after the fourth Thursday of November (23 to 29 November). */
function isWhiteFriday(date: Date) {
  return (
    date.getUTCMonth() === 10 &&
    date.getUTCDay() === 5 &&
    date.getUTCDate() >= 23 &&
    date.getUTCDate() <= 29
  );
}

/**
 * Whether `date` falls in the occasion: Ramadan's month, the Eids' days, the
 * seasonal windows (when shops post for them), or the day itself.
 */
function within(id: OccasionId, date: Date, country: Country): boolean {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (id === "national-day") return month === country.month && day === country.day;
  if (id === "mothers-day") return month === 3 && day === 21;
  if (id === "white-friday") return isWhiteFriday(date);
  if (id === "new-year") return month === 1 && day === 1;
  if (id === "back-to-school") return (month === 8 && day >= 25) || (month === 9 && day <= 5);
  if (id === "graduation") return month === 6 && day >= 15;
  if (id === "summer") return month === 6 && day >= 21 && day <= 30;
  const hijri = hijriDate(date);
  if (id === "ramadan") return hijri.month === 9;
  if (id === "eid-al-fitr") return hijri.month === 10 && hijri.day <= 3;
  return hijri.month === 12 && hijri.day >= 10 && hijri.day <= 13;
}

const DAY = 86_400_000;

/**
 * When an occasion next falls, from `today` (today itself while it is on): the
 * first day of it found, as a UTC date.
 */
export function nextDate(id: OccasionId, today: Date, country: Country): Date {
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let offset = 0; offset < 400; offset++) {
    const date = new Date(start + offset * DAY);
    if (within(id, date, country)) return date;
  }
  return new Date(start);
}

/** The occasion coming up next (or on now), to open the pack on. */
export function upcomingOccasion(today: Date, country: Country): OccasionId {
  let best: { id: OccasionId; at: number } | null = null;
  for (const occasion of OCCASIONS) {
    const at = nextDate(occasion.id, today, country).getTime();
    if (!best || at < best.at) best = { id: occasion.id, at };
  }
  return best?.id ?? "ramadan";
}

/**
 * The small line above the greeting: the Hijri year for the Islamic
 * occasions, the country for National Day, the date for Mother's Day.
 */
export function occasionEyebrow(
  id: OccasionId,
  date: Date,
  country: Country,
  lang: "ar" | "en",
): string {
  if (id === "national-day") return country.name[lang];
  if (id === "mothers-day") return lang === "ar" ? "٢١ مارس" : "21 March";
  const gregorian = date.getUTCFullYear();
  if (id === "back-to-school") return `${gregorian}–${gregorian + 1}`;
  if (id === "graduation") return lang === "ar" ? `دفعة ${gregorian}` : `Class of ${gregorian}`;
  if (id === "white-friday" || id === "new-year" || id === "summer") return String(gregorian);
  const { year } = hijriDate(date);
  return lang === "ar" ? `${year} هـ` : `${year} AH`;
}

/** The date an occasion falls on, as the studio shows it ("20 March 2026"). */
export function formatOccasionDate(date: Date, lang: "ar" | "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** An Instagram caption for the greeting: the words, the offer, the handle and the hashtags. */
export function occasionCaption({
  occasion,
  greeting,
  message,
  offer,
  handle,
  lang,
}: {
  occasion: Occasion;
  greeting: string;
  message: string;
  offer: string;
  handle: string | null;
  lang: "ar" | "en";
}): string {
  return [
    greeting.trim(),
    message.trim(),
    offer.trim(),
    handle ? `\n${handle}` : "",
    `\n${occasion.hashtags[lang]}`,
  ]
    .filter(Boolean)
    .join("\n");
}
