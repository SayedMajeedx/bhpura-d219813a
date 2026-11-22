import type { OsStatusVariant } from "@/components/os/os-status-pill";
import type { XCell, XSheet } from "@/features/finance-reports/lib/workbook";
import { textOf, type Lang, type PageForm, type Question } from "@/lib/platform-pages/page";

/**
 * A platform page's responses as the super admin reads them: each answer under its question's
 * words, the person to reach, the inbox's states and its file. Pure, so the inbox's rules are
 * tested without a screen.
 */

export const RESPONSE_STATUSES = [
  "new",
  "reviewed",
  "shortlisted",
  "accepted",
  "rejected",
] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const RESPONSE_STATUS_WORDS: Record<
  ResponseStatus,
  { ar: string; en: string; tone: OsStatusVariant }
> = {
  new: { ar: "جديد", en: "New", tone: "info" },
  reviewed: { ar: "تمت المراجعة", en: "Reviewed", tone: "neutral" },
  shortlisted: { ar: "مرشّح", en: "Shortlisted", tone: "warning" },
  accepted: { ar: "مقبول", en: "Accepted", tone: "success" },
  rejected: { ar: "مستبعد", en: "Rejected", tone: "destructive" },
};

export type PageResponse = {
  id: string;
  status: ResponseStatus;
  answers: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
};

export type AnswerLine = { key: string; label: string; value: string; ltr: boolean };

const questionsOf = (form: PageForm): Question[] => form.steps.flatMap((step) => step.questions);

function shown(question: Question, raw: unknown, lang: Lang): string {
  const title = (id: string) =>
    textOf(question.options.find((option) => option.id === id)?.title, lang) || id;
  if (Array.isArray(raw)) return raw.map((id) => title(String(id))).join("، ");
  if (typeof raw !== "string" || !raw.trim()) return "";
  if (question.type === "cards" || question.type === "choices") return title(raw);
  if (question.type === "instagram") return `@${raw.replace(/^@/, "")}`;
  return raw;
}

/**
 * Each answer under its question's words, in the form's order; an answer to a question the page
 * no longer asks keeps its key as its label, so nothing a person sent is hidden.
 */
export function answerLines(
  form: PageForm,
  answers: Record<string, unknown>,
  lang: Lang,
): AnswerLine[] {
  const questions = questionsOf(form);
  const asked = new Set(questions.map((q) => q.key));
  const lines: AnswerLine[] = questions.flatMap((question) => {
    const value = shown(question, answers[question.key], lang);
    return value
      ? [
          {
            key: question.key,
            label: textOf(question.label, lang) || question.key,
            value,
            ltr: question.type === "instagram" || question.type === "phone",
          },
        ]
      : [];
  });
  for (const [key, raw] of Object.entries(answers)) {
    if (asked.has(key)) continue;
    const value = Array.isArray(raw) ? raw.join("، ") : typeof raw === "string" ? raw : "";
    if (value.trim()) lines.push({ key, label: key, value, ltr: false });
  }
  return lines;
}

/** The person who sent it: the first short answer as a name, their WhatsApp and Instagram. */
export function contactOf(form: PageForm, answers: Record<string, unknown>) {
  const first = (type: Question["type"]) => {
    const question = questionsOf(form).find(
      (q) => q.type === type && typeof answers[q.key] === "string" && String(answers[q.key]).trim(),
    );
    return question ? String(answers[question.key]).trim() : null;
  };
  return {
    name: first("text"),
    phone: first("phone"),
    instagram: first("instagram")?.replace(/^@/, "") ?? null,
  };
}

/** The message a person sends on WhatsApp to someone who answered the page. */
export function replyMessage(name: string | null, pageTitle: string, lang: Lang): string {
  if (lang === "ar") {
    return `مرحباً${name ? ` ${name}` : ""}، معكم فريق Boutq بخصوص طلبكم في «${pageTitle}».`;
  }
  return `Hello${name ? ` ${name}` : ""}, this is the Boutq team about your request on “${pageTitle}”.`;
}

/** The responses a state and a search leave, newest first as they came. */
export function filterResponses(
  responses: readonly PageResponse[],
  form: PageForm,
  filter: { status: ResponseStatus | "all"; term: string },
  lang: Lang,
): PageResponse[] {
  const term = filter.term.trim().toLowerCase();
  return responses.filter((response) => {
    if (filter.status !== "all" && response.status !== filter.status) return false;
    if (!term) return true;
    const text = [
      ...answerLines(form, response.answers, lang).map((line) => line.value),
      response.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(term);
  });
}

export function statusCounts(
  responses: readonly PageResponse[],
): Record<ResponseStatus | "all", number> {
  const counts = {
    all: responses.length,
    new: 0,
    reviewed: 0,
    shortlisted: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const response of responses) counts[response.status] += 1;
  return counts;
}

/** The responses as one sheet: the day, the state, each question's answer, the notes. */
export function responsesSheet(
  form: PageForm,
  responses: readonly PageResponse[],
  lang: Lang,
): XSheet {
  const questions = questionsOf(form);
  const head = (value: string): XCell => ({ value, heading: true });
  const rows: XCell[][] = [
    [
      head(lang === "ar" ? "التاريخ" : "Date"),
      head(lang === "ar" ? "الحالة" : "State"),
      ...questions.map((q) => head(textOf(q.label, lang) || q.key)),
      head(lang === "ar" ? "ملاحظات" : "Notes"),
    ],
    ...responses.map((response) => [
      { value: response.createdAt.slice(0, 10), date: true },
      { value: RESPONSE_STATUS_WORDS[response.status][lang] },
      ...questions.map((q) => ({
        value: shown(q, response.answers[q.key], lang) || null,
        text: true,
      })),
      { value: response.notes || null, text: true },
    ]),
  ];
  return {
    name: lang === "ar" ? "الردود" : "Responses",
    rows,
    widths: [12, 14, ...questions.map(() => 24), 30],
    stickyRows: 1,
    rtl: lang === "ar",
  };
}

export const isResponseStatus = (value: string): value is ResponseStatus =>
  (RESPONSE_STATUSES as readonly string[]).includes(value);
