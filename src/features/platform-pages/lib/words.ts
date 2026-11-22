import type { Lang } from "@/lib/platform-pages/page";
import type { AnswerProblem } from "@/lib/platform-pages/answers";

/** The words a platform page writes on its own (the page's content is the super admin's). */
const WORDS = {
  stepOf: { ar: "خطوة {n} من {total}", en: "Step {n} of {total}" },
  next: { ar: "المتابعة للخطوة التالية", en: "Continue" },
  nextLast: { ar: "المتابعة لآخر خطوة", en: "Continue to the last step" },
  back: { ar: "رجوع", en: "Back" },
  send: { ar: "إرسال", en: "Send" },
  sending: { ar: "جارٍ الإرسال...", en: "Sending..." },
  optional: { ar: "(اختياري)", en: "(optional)" },
  countryCode: { ar: "مفتاح الدولة", en: "Country code" },
  copied: { ar: "تم نسخ الرابط", en: "Link copied" },
  share: { ar: "مشاركة الرابط", en: "Share the link" },
  tooMany: {
    ar: "أرسلتم أكثر من مرة خلال وقت قصير. حاولوا بعد قليل.",
    en: "You have sent this several times in a short while. Please try again later.",
  },
  failed: {
    ar: "تعذّر الإرسال. حاولوا مرة أخرى.",
    en: "This could not be sent. Please try again.",
  },
} as const;

export type WordKey = keyof typeof WORDS;

export function word(key: WordKey, lang: Lang, values: Record<string, string | number> = {}) {
  return Object.entries(values).reduce<string>(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    WORDS[key][lang],
  );
}

/** What a field says under it when its answer stops the step. */
export function problemText(problem: AnswerProblem, label: string, lang: Lang): string {
  if (problem.kind === "missing") {
    return lang === "ar" ? `يرجى تعبئة: ${label}` : `Please answer: ${label}`;
  }
  return lang === "ar" ? `يرجى التأكد من: ${label}` : `Please check: ${label}`;
}
