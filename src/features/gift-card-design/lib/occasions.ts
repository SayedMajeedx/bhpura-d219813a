import { hijriDate } from "@/features/content-studio/lib/occasions";

/**
 * The occasions a gift card is sent for (the owner's brief of 2026-10-31), each with its Gulf
 * wording in both languages: the greeting the card's front carries and a quieter line under it.
 * The Arabic is written as people in the Gulf say it, never translated from English, and with no
 * gendered verb (a card does not know who opens it). The ornament is the one small mark an
 * occasion may carry; most carry none and are set in type alone.
 */

export type CardOccasionId =
  | "gift"
  | "birthday"
  | "thank_you"
  | "congratulations"
  | "anniversary"
  | "just_because"
  | "ramadan"
  | "eid_al_fitr"
  | "eid_al_adha"
  | "graduation"
  | "wedding"
  | "new_baby"
  | "corporate"
  | "national_day"
  | "mothers_day"
  | "get_well"
  | "new_home";

export type Ornament = "none" | "crescent" | "rings" | "star" | "rule";

type Words = { ar: string; en: string };

export type CardOccasion = {
  id: CardOccasionId;
  /** The chip's name in the picker. */
  name: Words;
  /** The front's greeting. */
  greeting: Words;
  /** The line under it; null sets the greeting alone. */
  line: Words | null;
  ornament: Ornament;
};

export const CARD_OCCASIONS: readonly CardOccasion[] = [
  {
    id: "gift",
    name: { ar: "هدية", en: "A gift" },
    greeting: { ar: "هدية لك", en: "A Gift for You" },
    line: null,
    ornament: "rule",
  },
  {
    id: "birthday",
    name: { ar: "عيد ميلاد", en: "Birthday" },
    greeting: { ar: "عيد ميلاد سعيد", en: "Happy Birthday" },
    line: { ar: "كل عام وأنت بخير", en: "Many happy returns" },
    ornament: "none",
  },
  {
    id: "thank_you",
    name: { ar: "شكر", en: "Thank you" },
    greeting: { ar: "شكرًا من القلب", en: "Thank You" },
    line: { ar: "ممتنّون لوجودك", en: "With gratitude" },
    ornament: "rule",
  },
  {
    id: "congratulations",
    name: { ar: "تهنئة", en: "Congratulations" },
    greeting: { ar: "ألف مبروك", en: "Congratulations" },
    line: { ar: "فرحتك فرحتنا", en: "So happy for you" },
    ornament: "star",
  },
  {
    id: "anniversary",
    name: { ar: "ذكرى سنوية", en: "Anniversary" },
    greeting: { ar: "ذكرى سنوية سعيدة", en: "Happy Anniversary" },
    line: { ar: "عسى أيامكم كلها حب", en: "Here's to many more" },
    ornament: "rings",
  },
  {
    id: "just_because",
    name: { ar: "بدون مناسبة", en: "Just because" },
    greeting: { ar: "هدية من القلب", en: "Just Because" },
    line: { ar: "لأن الهدية لا تحتاج مناسبة", en: "No occasion needed" },
    ornament: "none",
  },
  {
    id: "ramadan",
    name: { ar: "رمضان", en: "Ramadan" },
    greeting: { ar: "رمضان كريم", en: "Ramadan Kareem" },
    line: { ar: "كل عام وأنتم بخير", en: "Wishing you a blessed month" },
    ornament: "crescent",
  },
  {
    id: "eid_al_fitr",
    name: { ar: "عيد الفطر", en: "Eid al-Fitr" },
    greeting: { ar: "عيد فطر مبارك", en: "Eid Mubarak" },
    line: { ar: "عساكم من عواده", en: "Wishing you a joyful Eid" },
    ornament: "crescent",
  },
  {
    id: "eid_al_adha",
    name: { ar: "عيد الأضحى", en: "Eid al-Adha" },
    greeting: { ar: "عيد أضحى مبارك", en: "Eid al-Adha Mubarak" },
    line: { ar: "عساكم من عواده", en: "Wishing you a blessed Eid" },
    ornament: "crescent",
  },
  {
    id: "graduation",
    name: { ar: "تخرّج", en: "Graduation" },
    greeting: { ar: "مبروك التخرّج", en: "Congratulations, Graduate" },
    line: { ar: "والقادم أجمل", en: "The best is yet to come" },
    ornament: "star",
  },
  {
    id: "wedding",
    name: { ar: "زواج", en: "Wedding" },
    greeting: { ar: "مبروك الزواج", en: "Wedding Wishes" },
    line: { ar: "بارك الله لكما وبارك عليكما", en: "A lifetime of happiness" },
    ornament: "rings",
  },
  {
    id: "new_baby",
    name: { ar: "مولود", en: "New baby" },
    greeting: { ar: "مبروك المولود", en: "Welcome, Little One" },
    line: { ar: "يتربّى في عزّكم", en: "Congratulations on your new arrival" },
    ornament: "star",
  },
  {
    id: "corporate",
    name: { ar: "تقدير", en: "Appreciation" },
    greeting: { ar: "مع خالص التقدير", en: "With Appreciation" },
    line: { ar: "شكرًا لجهودكم", en: "Thank you for all you do" },
    ornament: "rule",
  },
  {
    id: "national_day",
    name: { ar: "اليوم الوطني", en: "National Day" },
    greeting: { ar: "كل عام والوطن بخير", en: "Happy National Day" },
    line: null,
    ornament: "star",
  },
  {
    id: "mothers_day",
    name: { ar: "عيد الأم", en: "Mother's Day" },
    greeting: { ar: "عيد أم سعيد", en: "Happy Mother's Day" },
    line: { ar: "الجنة تحت أقدام الأمهات", en: "With all our love" },
    ornament: "none",
  },
  {
    id: "get_well",
    name: { ar: "سلامتك", en: "Get well" },
    greeting: { ar: "سلامتك", en: "Get Well Soon" },
    line: { ar: "أجر وعافية", en: "Thinking of you" },
    ornament: "none",
  },
  {
    id: "new_home",
    name: { ar: "بيت جديد", en: "New home" },
    greeting: { ar: "مبروك البيت الجديد", en: "Happy New Home" },
    line: { ar: "الله يجعله بيت خير وبركة", en: "Wishing you joy in it" },
    ornament: "rule",
  },
];

const BY_ID = new Map(CARD_OCCASIONS.map((occasion) => [occasion.id, occasion]));

export function cardOccasion(id: string | null | undefined): CardOccasion {
  return BY_ID.get(id as CardOccasionId) ?? CARD_OCCASIONS[0];
}

export function isCardOccasion(id: unknown): id is CardOccasionId {
  return typeof id === "string" && BY_ID.has(id as CardOccasionId);
}

/** Each GCC country's National Day by its currency (Bahrain when it is not a GCC currency). */
const NATIONAL_DAYS: Record<string, [number, number]> = {
  BHD: [12, 16],
  SAR: [9, 23],
  AED: [12, 2],
  KWD: [2, 25],
  QAR: [12, 18],
  OMR: [11, 20],
};

const DAY = 86_400_000;

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Days from `today` to the next `month`/`day` (0 on the day itself). */
function daysUntil(today: Date, month: number, day: number): number {
  const start = utcDay(today).getTime();
  let target = Date.UTC(today.getUTCFullYear(), month - 1, day);
  if (target < start) target = Date.UTC(today.getUTCFullYear() + 1, month - 1, day);
  return Math.round((target - start) / DAY);
}

/**
 * The occasions whose season it is, the nearest first: Ramadan's month (and Eid al-Fitr from its
 * last ten days), Eid al-Adha from the first of Dhu al-Hijjah, Mother's Day in the three weeks
 * before 21 March, the store's National Day in the two weeks before it, graduation in June.
 */
export function inSeason(today: Date, currency: string | null | undefined): CardOccasionId[] {
  const hijri = hijriDate(utcDay(today));
  const season: CardOccasionId[] = [];
  if (hijri.month === 9) {
    if (hijri.day >= 20) season.push("eid_al_fitr", "ramadan");
    else season.push("ramadan", "eid_al_fitr");
  } else if (hijri.month === 8 && hijri.day >= 20) {
    season.push("ramadan");
  } else if (hijri.month === 10 && hijri.day <= 3) {
    season.push("eid_al_fitr");
  } else if (hijri.month === 12 && hijri.day <= 13) {
    season.push("eid_al_adha");
  } else if (hijri.month === 11 && hijri.day >= 20) {
    season.push("eid_al_adha");
  }
  const [month, day] = NATIONAL_DAYS[(currency ?? "").toUpperCase()] ?? NATIONAL_DAYS.BHD;
  if (daysUntil(today, month, day) <= 14) season.push("national_day");
  if (daysUntil(today, 3, 21) <= 21) season.push("mothers_day");
  if (utcDay(today).getUTCMonth() === 5) season.push("graduation");
  return season;
}

/** The order the picker shows the occasions in: what is in season, then the rest as listed. */
export function occasionsInOrder(today: Date, currency: string | null | undefined): CardOccasion[] {
  const first = inSeason(today, currency);
  const rest = CARD_OCCASIONS.filter((occasion) => !first.includes(occasion.id));
  return [...first.map((id) => cardOccasion(id)), ...rest];
}
