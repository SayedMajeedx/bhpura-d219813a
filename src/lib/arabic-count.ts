/**
 * A counted noun in Arabic: 1 قطعة, 2 قطعتان, 3-10 قطع, 11 and over قطعة (with the number).
 */
export function arCount(n: number, forms: { one: string; two: string; few: string; many: string }) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

type NounForms = { one: string; two: string; few: string; many: string; sing: string };

const noun = (one: string, two: string, few: string, many: string, sing: string): NounForms => ({
  one,
  two,
  few,
  many,
  sing,
});

/**
 * The nouns the admin counts, each in the forms Arabic counts it with: one, two, three to ten,
 * eleven and over, and the bare noun (zero, and a hundred, a thousand...). The admin once wrote
 * the number before one form whatever it was: "6 عملية بيع", "1 مهام", "7 طلب", "5 تقييم".
 */
export const AR_NOUNS = {
  product: noun("منتج واحد", "منتجان", "منتجات", "منتجًا", "منتج"),
  order: noun("طلب واحد", "طلبان", "طلبات", "طلبًا", "طلب"),
  customer: noun("عميل واحد", "عميلان", "عملاء", "عميلًا", "عميل"),
  piece: noun("قطعة واحدة", "قطعتان", "قطع", "قطعة", "قطعة"),
  task: noun("مهمة واحدة", "مهمتان", "مهام", "مهمة", "مهمة"),
  review: noun("تقييم واحد", "تقييمان", "تقييمات", "تقييمًا", "تقييم"),
  day: noun("يوم واحد", "يومان", "أيام", "يومًا", "يوم"),
  hour: noun("ساعة واحدة", "ساعتان", "ساعات", "ساعة", "ساعة"),
  minute: noun("دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة", "دقيقة"),
  month: noun("شهر واحد", "شهران", "أشهر", "شهرًا", "شهر"),
  option: noun("خيار واحد", "خياران", "خيارات", "خيارًا", "خيار"),
  variant: noun("متغير واحد", "متغيران", "متغيرات", "متغيرًا", "متغير"),
  size: noun("مقاس واحد", "مقاسان", "مقاسات", "مقاسًا", "مقاس"),
  color: noun("لون واحد", "لونان", "ألوان", "لونًا", "لون"),
  sale: noun("عملية بيع واحدة", "عمليتا بيع", "عمليات بيع", "عملية بيع", "عملية بيع"),
  paidBooking: noun(
    "حجز مدفوع واحد",
    "حجزان مدفوعان",
    "حجوزات مدفوعة",
    "حجزًا مدفوعًا",
    "حجز مدفوع",
  ),
  booking: noun("حجز واحد", "حجزان", "حجوزات", "حجزًا", "حجز"),
  message: noun("رسالة واحدة", "رسالتان", "رسائل", "رسالة", "رسالة"),
  point: noun("نقطة واحدة", "نقطتان", "نقاط", "نقطة", "نقطة"),
  image: noun("صورة واحدة", "صورتان", "صور", "صورة", "صورة"),
  category: noun("قسم واحد", "قسمان", "أقسام", "قسمًا", "قسم"),
  code: noun("رمز واحد", "رمزان", "رموز", "رمزًا", "رمز"),
  template: noun("قالب واحد", "قالبان", "قوالب", "قالبًا", "قالب"),
  recipient: noun("مستلم واحد", "مستلمان", "مستلمين", "مستلمًا", "مستلم"),
  expense: noun("مصروف واحد", "مصروفان", "مصروفات", "مصروفًا", "مصروف"),
  integration: noun("تكامل واحد", "تكاملان", "تكاملات", "تكاملًا", "تكامل"),
  page: noun("صفحة واحدة", "صفحتان", "صفحات", "صفحة", "صفحة"),
  member: noun("عضو واحد", "عضوان", "أعضاء", "عضوًا", "عضو"),
  service: noun("خدمة واحدة", "خدمتان", "خدمات", "خدمة", "خدمة"),
  question: noun("سؤال واحد", "سؤالان", "أسئلة", "سؤالًا", "سؤال"),
  addon: noun("إضافة واحدة", "إضافتان", "إضافات", "إضافة", "إضافة"),
  unit: noun("وحدة واحدة", "وحدتان", "وحدات", "وحدة", "وحدة"),
  line: noun("بند واحد", "بندان", "بنود", "بندًا", "بند"),
  record: noun("سجل واحد", "سجلان", "سجلات", "سجلًا", "سجل"),
  item: noun("صنف واحد", "صنفان", "أصناف", "صنفًا", "صنف"),
  file: noun("ملف واحد", "ملفان", "ملفات", "ملفًا", "ملف"),
  payment: noun("دفعة واحدة", "دفعتان", "دفعات", "دفعة", "دفعة"),
  length: noun("مدة واحدة", "مدتان", "مدد", "مدة", "مدة"),
  appointment: noun("موعد واحد", "موعدان", "مواعيد", "موعدًا", "موعد"),
  movement: noun("حركة واحدة", "حركتان", "حركات", "حركة", "حركة"),
} as const;

export type CountedNoun = keyof typeof AR_NOUNS;

/** "منتج واحد", "منتجان", "3 منتجات", "12 منتجًا", "100 منتج", "0 منتج". */
export function arNoun(n: number, key: CountedNoun): string {
  const forms = AR_NOUNS[key];
  const rest = n % 100;
  if (n === 0) return `0 ${forms.sing}`;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (rest >= 3 && rest <= 10) return `${n} ${forms.few}`;
  if (n > 100 && rest <= 2) return `${n} ${forms.sing}`;
  if (n >= 100 && rest === 0) return `${n} ${forms.sing}`;
  return `${n} ${forms.many}`;
}

const EN_NOUNS: Record<CountedNoun, [string, string]> = {
  product: ["product", "products"],
  order: ["order", "orders"],
  customer: ["customer", "customers"],
  piece: ["piece", "pieces"],
  task: ["task", "tasks"],
  review: ["review", "reviews"],
  day: ["day", "days"],
  hour: ["hour", "hours"],
  minute: ["minute", "minutes"],
  month: ["month", "months"],
  option: ["option", "options"],
  variant: ["variant", "variants"],
  size: ["size", "sizes"],
  color: ["colour", "colours"],
  sale: ["sale", "sales"],
  paidBooking: ["paid booking", "paid bookings"],
  booking: ["booking", "bookings"],
  message: ["message", "messages"],
  point: ["point", "points"],
  image: ["image", "images"],
  category: ["category", "categories"],
  code: ["code", "codes"],
  template: ["template", "templates"],
  recipient: ["recipient", "recipients"],
  expense: ["expense", "expenses"],
  integration: ["integration", "integrations"],
  page: ["page", "pages"],
  member: ["member", "members"],
  service: ["service", "services"],
  question: ["question", "questions"],
  addon: ["add-on", "add-ons"],
  unit: ["unit", "units"],
  line: ["line", "lines"],
  record: ["record", "records"],
  item: ["item", "items"],
  file: ["file", "files"],
  payment: ["payment", "payments"],
  length: ["length", "lengths"],
  appointment: ["appointment", "appointments"],
  movement: ["movement", "movements"],
};

/** A count in the reader's language: "12 منتجًا" or "12 products". */
export function countOf(n: number, key: CountedNoun, lang: "ar" | "en"): string {
  if (lang === "ar") return arNoun(n, key);
  const [one, many] = EN_NOUNS[key];
  return `${n} ${n === 1 ? one : many}`;
}

/** A dual in its oblique case: "منتجان" → "منتجين", "عمليتا بيع" → "عمليتي بيع". */
const obliqueDual = (two: string) =>
  two
    .split(" ")
    .map((word) => word.replace(/ان$/, "ين").replace(/تا$/, "تي"))
    .join(" ");

/**
 * A count after a word that governs it (a preposition, or a verbal noun it belongs to: "تحويل",
 * "حذف", "من أصل", "لمدة"), or after a verb as its object: the same forms as `arNoun`, but two
 * takes the oblique "ين" ("تحويل قطعتين", "تم حذف منتجين", "من أصل طلبين"). Only the dual
 * changes: the other forms read the same in every case. As a subject, after a colon or alone,
 * the count stays `arNoun` ("بقيت قطعتان", "المحدد: طلبان").
 */
export function arNounOblique(n: number, key: CountedNoun): string {
  return n === 2 ? obliqueDual(AR_NOUNS[key].two) : arNoun(n, key);
}
